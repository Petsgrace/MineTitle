import React, { useState, useEffect, Component, useCallback } from 'react'
import { HashRouter as Router, Routes, Route, Navigate, Link, useLocation, useNavigate } from 'react-router-dom'
import { LayoutGrid, User as UserIcon, Shield, Briefcase, ChevronDown, RefreshCw, CheckCircle2, WifiOff, AlertCircle } from 'lucide-react'
import Home from './pages/Home'
import Login from './pages/Login'
import OfficerLogin from './pages/OfficerLogin'
import Signup from './pages/Signup'
import FarmerDashboard from './pages/FarmerDashboard'
import OfficerDashboard from './pages/OfficerDashboard'
import ApplicationForm from './pages/ApplicationForm'
import AdminDashboard from './pages/AdminDashboard'
import Reports from './pages/Reports'
import AuditLogs from './pages/AuditLogs'
import ProfileModal from './components/ProfileModal'
import TrackApplication from './pages/TrackApplication'
import GISMapView from './pages/GISMapView'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'
import MobileNav from './components/MobileNav'
import axios from 'axios'
import api from './services/api'
import { getPendingCount, syncOfflineQueue, recordLocalAuditLog } from './utils/offlineDB'

// Configure axios for session-based authentication
axios.defaults.withCredentials = true
axios.defaults.xsrfCookieName = 'csrftoken'
axios.defaults.xsrfHeaderName = 'X-CSRFToken'

class ErrorBoundary extends Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }
    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }
    componentDidCatch(error, errorInfo) {
        console.error("ErrorBoundary caught an error", error, errorInfo);
    }
    render() {
        if (this.state.hasError) {
            return (
                <div className="p-8 bg-red-50 border-2 border-red-200 rounded-xl m-4">
                    <h2 className="text-2xl font-bold text-red-700 mb-2">Something went wrong.</h2>
                    <p className="text-red-600 mb-4">The screen encountered an unexpected state. Your saved data is safe.</p>
                    <button
                        onClick={() => {
                            this.setState({ hasError: false, error: null });
                            window.location.reload();
                        }}
                        className="btn bg-red-600 text-white hover:bg-red-700"
                    >
                        Reload Screen
                    </button>
                </div>
            );
        }
        return this.props.children;
    }
}

function SyncStatusBadge() {
    const [syncStatus, setSyncStatus] = useState(navigator.onLine ? 'synced' : 'pending')
    const [pendingCount, setPendingCount] = useState(0)
    const [isOnlineState, setIsOnlineState] = useState(navigator.onLine)
    const [isRetrying, setIsRetrying] = useState(false)

    const refreshQueueState = useCallback(async () => {
        try {
            const count = await getPendingCount()
            setPendingCount(count)
            if (!navigator.onLine) {
                setSyncStatus(count > 0 ? 'pending' : 'offline')
            } else if (count > 0 && syncStatus !== 'syncing' && syncStatus !== 'failed') {
                setSyncStatus('pending')
            } else if (count === 0 && syncStatus !== 'syncing') {
                setSyncStatus('synced')
            }
        } catch (e) {
            // ignore
        }
    }, [syncStatus])

    const handleTriggerSync = useCallback(async () => {
        if (isRetrying) return
        setIsRetrying(true)
        setSyncStatus('syncing')
        try {
            const res = await syncOfflineQueue(api)
            const count = await getPendingCount()
            setPendingCount(count)
            setSyncStatus(res?.status || (count === 0 ? 'synced' : 'pending'))
        } catch (e) {
            const count = await getPendingCount()
            setPendingCount(count)
            setSyncStatus(count > 0 ? 'failed' : 'synced')
        } finally {
            setIsRetrying(false)
        }
    }, [isRetrying])

    useEffect(() => {
        refreshQueueState()
        if (navigator.onLine) {
            syncOfflineQueue(api).then(() => refreshQueueState()).catch(() => {})
        }

        const onOnline = () => {
            setIsOnlineState(true)
            handleTriggerSync()
        }
        const onOffline = () => {
            setIsOnlineState(false)
            refreshQueueState()
        }
        const onSyncChanged = (e) => {
            if (e?.detail?.status) {
                setSyncStatus(e.detail.status)
            }
            if (typeof e?.detail?.pendingCount === 'number') {
                setPendingCount(e.detail.pendingCount)
            } else {
                refreshQueueState()
            }
        }

        window.addEventListener('online', onOnline)
        window.addEventListener('offline', onOffline)
        window.addEventListener('sync-status-changed', onSyncChanged)
        const interval = setInterval(refreshQueueState, 8000)

        return () => {
            window.removeEventListener('online', onOnline)
            window.removeEventListener('offline', onOffline)
            window.removeEventListener('sync-status-changed', onSyncChanged)
            clearInterval(interval)
        }
    }, [handleTriggerSync, refreshQueueState])

    const isSyncing = syncStatus === 'syncing' || isRetrying
    const isFailed = syncStatus === 'failed'
    const isPending = pendingCount > 0 || syncStatus === 'pending'

    return (
        <button
            type="button"
            onClick={handleTriggerSync}
            disabled={isSyncing}
            title={
                isSyncing
                    ? 'Synchronizing queued records with cloud...'
                    : isFailed
                    ? `Sync failed (${pendingCount} pending). Click to retry sync.`
                    : isPending
                    ? `${pendingCount} record(s) queued locally. Click to sync now.`
                    : isOnlineState
                    ? 'All records synchronized with cloud. Click to verify sync.'
                    : 'Offline mode active — changes are saved locally and will auto-sync when online.'
            }
            style={{
                backgroundColor: isFailed
                    ? 'rgba(220, 38, 38, 0.28)'
                    : isPending || !isOnlineState
                    ? 'rgba(245, 158, 11, 0.25)'
                    : 'rgba(16, 185, 129, 0.22)',
                borderColor: isFailed
                    ? 'rgba(248, 113, 113, 0.55)'
                    : isPending || !isOnlineState
                    ? 'rgba(251, 191, 36, 0.55)'
                    : 'rgba(52, 211, 153, 0.45)',
                color: '#ffffff'
            }}
            className="px-2.5 py-1 rounded-full text-[11px] font-bold border inline-flex items-center gap-1.5 transition-all cursor-pointer mr-1"
        >
            {isSyncing ? (
                <RefreshCw size={12} className="animate-spin text-amber-200" />
            ) : isFailed ? (
                <AlertCircle size={12} className="text-red-200" />
            ) : !isOnlineState ? (
                <WifiOff size={12} className="text-amber-200" />
            ) : isPending ? (
                <RefreshCw size={12} className="text-amber-200" />
            ) : (
                <CheckCircle2 size={12} className="text-emerald-200" />
            )}
            <span>
                {isSyncing
                    ? 'Syncing...'
                    : isFailed
                    ? 'Sync Failed · Retry'
                    : !isOnlineState
                    ? 'Offline'
                    : isPending
                    ? 'Pending Sync'
                    : 'Synced'}
            </span>
            {pendingCount > 0 && (
                <span
                    style={{ backgroundColor: '#f59e0b', color: '#111827' }}
                    className="px-1.5 py-0.2 rounded-full text-[10px] font-extrabold leading-tight"
                >
                    {pendingCount}
                </span>
            )}
        </button>
    )
}

function Header({ user, setUser }) {
    const location = useLocation()
    const navigate = useNavigate()
    const [showPortalLinks, setShowPortalLinks] = useState(false)
    const [isProfileOpen, setIsProfileOpen] = useState(false)
    const [isLoggingOut, setIsLoggingOut] = useState(false)

    return (
        <header className="site-header">
            <div className="header-main">
                <div className="header-inner">
                    {/* Logo and Title */}
                    <Link to="/" className="header-brand">
                        <div className="header-logo-wrap">
                            <img src="/logo.png" alt="Land Tenure Implementation Committee" className="header-logo" />
                        </div>
                        <div className="header-brand-text">
                            <span className="header-title">Unified Mobile Title Deeds</span>
                            <span className="header-subtitle-text">Title Deeds Processing & Land Management System</span>
                        </div>
                    </Link>

                    {/* Navigation Menu */}
                    <nav className="header-nav">
                        {/* Sync Status Indicator with Pending-Count Badge & Retry */}
                        <SyncStatusBadge />

                        {/* Public / Main Navigation Links */}
                        <div className="hidden md:flex items-center gap-1 mr-2">
                            <Link to="/" className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold text-white/90 hover:text-white hover:bg-white/10 transition-all ${location.pathname === '/' ? 'bg-white/20 text-white' : ''}`}>
                                Home
                            </Link>
                            <Link to="/apply" className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold text-white/90 hover:text-white hover:bg-white/10 transition-all ${location.pathname === '/apply' ? 'bg-white/20 text-white' : ''}`}>
                                Apply
                            </Link>
                            <Link to="/track" className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold text-white/90 hover:text-white hover:bg-white/10 transition-all ${location.pathname === '/track' ? 'bg-white/20 text-white' : ''}`}>
                                Track
                            </Link>
                            <Link to="/gis-map" className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold text-white/90 hover:text-white hover:bg-white/10 transition-all ${location.pathname === '/gis-map' ? 'bg-white/20 text-white' : ''}`}>
                                GIS
                            </Link>
                            <Link to={user && user.role !== "farmer" ? (user.role === "admin" ? "/admin-dashboard" : "/officer-dashboard") : "/officer-login"} className={`px-2.5 py-1.5 rounded-lg text-xs font-bold text-amber-300 hover:text-amber-200 bg-amber-500/20 border border-amber-400/40 hover:bg-amber-500/30 transition-all inline-flex items-center gap-1.5 ${location.pathname === "/officer-login" || location.pathname.includes("officer-dashboard") || location.pathname.includes("admin-dashboard") ? "bg-amber-500/40 text-amber-200" : ""}`}>
                                <Briefcase size={13} /> Officer Portal
                            </Link>
                        </div>
                        {user && (
                            <>
                                {user.role === 'admin' ? (
                                    <div className="relative">
                                        <button
                                            type="button"
                                            onClick={() => setShowPortalLinks(!showPortalLinks)}
                                            className="header-nav-btn"
                                        >
                                            <LayoutGrid size={16} />
                                            <span className="header-nav-label">Portals</span>
                                            <ChevronDown size={14} className={`header-chevron ${showPortalLinks ? 'header-chevron-open' : ''}`} />
                                        </button>
                                        {showPortalLinks && (
                                            <div className="header-dropdown">
                                                <button
                                                    type="button"
                                                    onClick={() => { navigate('/admin-dashboard'); setShowPortalLinks(false) }}
                                                    className="header-dropdown-item"
                                                >
                                                    <Shield size={16} className="text-red-600" /> Admin Portal
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => { navigate('/officer-dashboard'); setShowPortalLinks(false) }}
                                                    className="header-dropdown-item"
                                                >
                                                    <Briefcase size={16} className="text-blue-600" /> Officer Portal
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => { navigate('/farmer-dashboard'); setShowPortalLinks(false) }}
                                                    className="header-dropdown-item"
                                                >
                                                    <UserIcon size={16} className="text-emerald-600" /> Farmer Portal
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                ) : null}
                                <div className="header-user-section">
                                    <button
                                        type="button"
                                        onClick={() => setIsProfileOpen(true)}
                                        className="header-user-btn"
                                        title="Edit Profile"
                                    >
                                        <div className="header-avatar">
                                            <UserIcon size={14} />
                                        </div>
                                        <span className="header-nav-label">{user.name}</span>
                                    </button>
                                    <button
                                        type="button"
                                        disabled={isLoggingOut}
                                        onClick={async () => {
                                            setIsLoggingOut(true);
                                            try {
                                                await api.post('/logout/');
                                            } catch (error) {
                                                // Proceed with local session clear even if offline
                                            }
                                            recordLocalAuditLog({
                                                action_type: 'USER_LOGOUT',
                                                reference_number: 'AUTH-SESSION',
                                                actor: user?.name || user?.username || 'User',
                                                stage: (user?.role || 'USER').toUpperCase(),
                                                comment: `User @${user?.username || user?.name} signed out.`
                                            });
                                            localStorage.removeItem('user');
                                            setIsProfileOpen(false);
                                            setIsLoggingOut(false);
                                            setUser(null);
                                        }}
                                        className="header-logout-btn"
                                    >
                                        {isLoggingOut ? 'Signing Out...' : 'Logout'}
                                    </button>
                                </div>
                            </>
                        )}

                        {!user && location.pathname !== '/login' && location.pathname !== '/signup' && (
                            <div className="header-auth-links">
                                <Link to="/login" className="header-login-link">
                                    Sign In
                                </Link>
                                <Link to="/signup" className="header-signup-link">
                                    Get Started
                                </Link>
                            </div>
                        )}
                    </nav>
                </div>
            </div>
            {/* Zimbabwe flag accent stripe */}
            <div className="header-flag-stripe">
                <div className="flag-green"></div>
                <div className="flag-yellow"></div>
                <div className="flag-red"></div>
                <div className="flag-black"></div>
            </div>

            {/* User Profile Modal */}
            <ProfileModal
                isOpen={isProfileOpen}
                onClose={() => setIsProfileOpen(false)}
                user={user}
                onUpdateUser={setUser}
            />
        </header>
    )
}

function AccessDenied({ title = "Access Restricted", message = "You do not have access to view this screen." }) {
    return (
        <div className="card p-8 text-center max-w-md mx-auto my-12 border border-red-200 bg-red-50/50 rounded-2xl shadow-sm">
            <div className="w-16 h-16 rounded-full bg-red-100 text-red-600 mx-auto flex items-center justify-center mb-4">
                <Shield size={32} />
            </div>
            <h2 className="text-xl font-bold text-slate-900 mb-2">{title}</h2>
            <p className="text-sm text-slate-600 mb-6">{message}</p>
            <Link to="/dashboard" className="btn bg-emerald-700 hover:bg-emerald-800 text-white font-bold py-2.5 px-6 rounded-xl text-sm">
                Return to Dashboard
            </Link>
        </div>
    );
}

function App() {
    const [user, setUser] = useState(null);
    const [isCheckingSession, setIsCheckingSession] = useState(true);

    useEffect(() => {
        // Fast synchronous restore from localStorage so mobile UI loads immediately
        try {
            const storedUser = localStorage.getItem('user');
            if (storedUser) {
                const parsed = JSON.parse(storedUser);
                setUser(parsed);
            } else {
                // Default Beneficiary profile for instant mobile app readiness
                const localBeneficiary = {
                    id: 'beneficiary-local',
                    name: 'Beneficiary Applicant',
                    username: 'farmer@gmail.com',
                    email: 'farmer@gmail.com',
                    role: 'farmer',
                    department: 'Land Beneficiary'
                };
                setUser(localBeneficiary);
                localStorage.setItem('user', JSON.stringify(localBeneficiary));
            }
        } catch (e) {
            console.log('Session init complete');
        } finally {
            setIsCheckingSession(false);
        }

        // Non-blocking background verification if server is reachable
        api.get('/check-session/', { timeout: 2000 })
            .then(response => {
                if (response.data) {
                    setUser(response.data);
                    localStorage.setItem('user', JSON.stringify(response.data));
                }
            })
            .catch(() => {
                // Keep local offline user on mobile / disconnected environments
            });

        api.get('/csrf-cookie/', { timeout: 1500 }).catch(() => {});
    }, []);

    // Automatic 30-minute inactivity session timeout for privileged Officer/Admin sessions
    useEffect(() => {
        if (!user || user.role === 'farmer') return;
        const INACTIVITY_LIMIT_MS = 30 * 60 * 1000;
        let timeoutId;

        const resetTimer = () => {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => {
                recordLocalAuditLog({
                    action_type: 'SESSION_TIMEOUT',
                    reference_number: 'AUTH-SESSION',
                    actor: user.name || user.username || 'Officer',
                    stage: (user.role || 'OFFICER').toUpperCase(),
                    comment: `Privileged session timed out after 30 minutes of inactivity.`
                });
                localStorage.removeItem('user');
                setUser(null);
            }, INACTIVITY_LIMIT_MS);
        };

        const activityEvents = ['mousedown', 'keydown', 'touchstart', 'scroll'];
        activityEvents.forEach(ev => window.addEventListener(ev, resetTimer, { passive: true }));
        resetTimer();

        return () => {
            clearTimeout(timeoutId);
            activityEvents.forEach(ev => window.removeEventListener(ev, resetTimer));
        };
    }, [user]);

    // Show loading state while checking session
    if (isCheckingSession) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600 mx-auto"></div>
                    <p className="mt-4 text-gray-600">Loading...</p>
                </div>
            </div>
        );
    }

    return (
        <Router>
            <div className="min-h-screen bg-gray-50 flex flex-col">
                <Header user={user} setUser={setUser} />

                <main className="flex-1 max-w-7xl mx-auto w-full p-6">
                    <Routes>
                        <Route path="/" element={<Home user={user} setUser={setUser} />} />
                        <Route path="/login" element={<Login setUser={setUser} />} />
                        <Route path="/signup" element={<Signup />} />
                        <Route path="/forgot-password" element={<ForgotPassword />} />
                        <Route path="/reset-password/:uidb64/:token" element={<ResetPassword />} />
                        <Route
                            path="/dashboard"
                            element={
                                user ? (
                                    user.role === 'farmer' ? <Navigate to="/farmer-dashboard" /> :
                                        user.role === 'admin' ? <Navigate to="/admin-dashboard" /> :
                                            <Navigate to="/officer-dashboard" />
                                ) : <Navigate to="/login" />
                            }
                        />
                        <Route
                            path="/farmer-dashboard"
                            element={user && (user.role === 'farmer' || user.role === 'admin') ? <FarmerDashboard user={user} /> : <Navigate to="/login" />}
                        />
                        <Route
                            path="/officer-dashboard"
                            element={user && (user.role !== 'farmer') ? <ErrorBoundary><OfficerDashboard user={user} /></ErrorBoundary> : <Navigate to="/login" />}
                        />
                        <Route
                            path="/admin-dashboard"
                            element={user && user.role === 'admin' ? <AdminDashboard user={user} /> : <Navigate to="/login" />}
                        />
                        <Route
                            path="/reports"
                            element={
                                user ? (
                                    (user.role !== 'farmer' || (user.privileges && user.privileges.includes('view_reports'))) ? (
                                        <Reports user={user} />
                                    ) : (
                                        <AccessDenied title="Reports Access" message="You do not have access to view official reports. Contact the System Administrator." />
                                    )
                                ) : <Navigate to="/login" />
                            }
                        />
                        <Route
                            path="/audit-logs"
                            element={
                                user ? (
                                    (user.role === 'admin' || user.role === 'director' || (user.privileges && user.privileges.includes('view_audit_logs'))) ? (
                                        <AuditLogs user={user} />
                                    ) : (
                                        <AccessDenied title="Audit Logs Access" message="You do not have access to view system audit logs. Only administrators and authorized officials can inspect audit trails." />
                                    )
                                ) : <Navigate to="/login" />
                            }
                        />
                        <Route path="/apply" element={<ApplicationForm user={user || { id: "beneficiary-local", name: "Beneficiary Applicant", role: "farmer" }} />} />
                        <Route path="/officer-login" element={<OfficerLogin setUser={setUser} />} />
                        <Route path="/track" element={<TrackApplication />} />
                        <Route
                            path="/gis-map"
                            element={user && user.role !== 'farmer' ? <GISMapView /> : <Navigate to="/login" />}
                        />
                    </Routes>
                </main>
                <MobileNav user={user} />
            </div>
        </Router>
    )
}

export default App

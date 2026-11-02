import React, { useState, useEffect, Component, useCallback } from 'react'
import { HashRouter as Router, Routes, Route, Navigate, Link, useLocation, useNavigate } from 'react-router-dom'
import { LayoutGrid, User as UserIcon, Shield, Briefcase, ChevronDown, RefreshCw, CheckCircle2, WifiOff, AlertCircle } from 'lucide-react'
import Home from './pages/Home'
import Login from './pages/Login'
import OfficerLogin from './pages/OfficerLogin'
import Signup from './pages/Signup'
import FarmerDashboard from './pages/FarmerDashboard'
import OfficerDashboard from './pages/OfficerDashboard'
import AccountsDashboard from './pages/dashboards/AccountsDashboard'
import EstatesDashboard from './pages/dashboards/EstatesDashboard'
import LimsDashboard from './pages/dashboards/LimsDashboard'
import ZlcDashboard from './pages/dashboards/ZlcDashboard'
import SurveyorGeneralDashboard from './pages/dashboards/SurveyorGeneralDashboard'
import ValuationDashboard from './pages/dashboards/ValuationDashboard'
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

function normalizeStoredUser(rawUser) {
    if (!rawUser || typeof rawUser !== 'object') return null;
    const role = rawUser.role || '';
    if (!role && !rawUser.username && !rawUser.name) return null;

    return {
        ...rawUser,
        role: String(role).trim() || 'farmer',
        name: rawUser.name || `${rawUser.first_name || ''} ${rawUser.last_name || ''}`.trim() || rawUser.username || 'User',
        username: rawUser.username || rawUser.email || 'user',
        department: rawUser.department || '',
        channels: Array.isArray(rawUser.channels) ? rawUser.channels : [],
        privileges: Array.isArray(rawUser.privileges) ? rawUser.privileges : []
    };
}

export function getOfficerDashboardRoute(role) {
    const r = (role || '').toLowerCase().trim();
    if (r === 'admin') return '/admin-dashboard';
    if (r === 'accounts') return '/officer/accounts';
    if (r === 'estates' || r === 'resettlement') return '/officer/estates';
    if (r === 'lims') return '/officer/lims';
    if (r === 'zlc') return '/officer/zlc';
    if (r === 'surveyor' || r === 'gis') return '/officer/surveyor';
    if (r === 'valuation') return '/officer/valuation';
    return '/officer-dashboard';
}

function OfficerDashboardDispatcher({ user }) {
    const role = (user?.role || '').toLowerCase().trim();
    if (role === 'accounts') return <AccountsDashboard user={user} />;
    if (role === 'estates' || role === 'resettlement') return <EstatesDashboard user={user} />;
    if (role === 'lims') return <LimsDashboard user={user} />;
    if (role === 'zlc') return <ZlcDashboard user={user} />;
    if (role === 'surveyor' || role === 'gis') return <SurveyorGeneralDashboard user={user} />;
    if (role === 'valuation') return <ValuationDashboard user={user} />;
    if (role === 'admin') return <Navigate to="/admin-dashboard" />;
    return <OfficerDashboard user={user} />;
}

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
    const isNativeApp = Boolean(
        (typeof window !== 'undefined' && window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) ||
        (typeof window !== 'undefined' && (window.location.protocol === 'file:' || window.location.protocol === 'capacitor:'))
    )

    return (
        <header className="site-header">
            <div className="header-main">
                <div className="header-inner">
                    <Link to="/" className="header-brand">
                        <div className="header-logo-wrap">
                            <img src="/logo.png" alt="Land Tenure Implementation Committee" className="header-logo" />
                        </div>
                        <div className="header-brand-text">
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className="header-title">
                                    {isNativeApp ? 'Title Deeds One Stop Center' : 'Unified Title Deeds Portal'}
                                </span>
                                <span
                                    style={{
                                        backgroundColor: isNativeApp ? 'rgba(245, 158, 11, 0.28)' : 'rgba(255, 255, 255, 0.16)',
                                        borderColor: isNativeApp ? 'rgba(251, 191, 36, 0.65)' : 'rgba(255, 255, 255, 0.35)',
                                        color: isNativeApp ? '#fef3c7' : '#ecfdf5',
                                    }}
                                    className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider border"
                                >
                                    {isNativeApp ? 'Mobile Field App v2.0' : 'Online Web Portal'}
                                </span>
                            </div>
                            <span className="header-subtitle-text">
                                {isNativeApp
                                    ? 'Ministry of Lands • Field Tablet & Offline Capture Edition'
                                    : 'Title Deeds Processing & Land Management System'}
                            </span>
                        </div>
                    </Link>

                    <nav className="header-nav">
                        <SyncStatusBadge />

                        {user && (
                            <>
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
                                            localStorage.removeItem('admin_user');
                                            setIsProfileOpen(false);
                                            setIsLoggingOut(false);
                                            setUser(null);
                                            navigate('/');
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
            <div className="header-flag-stripe">
                <div className="flag-green"></div>
                <div className="flag-yellow"></div>
                <div className="flag-red"></div>
                <div className="flag-black"></div>
            </div>

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

function getInitialUser() {
    try {
        const storedUser = localStorage.getItem('user');
        if (storedUser) {
            const parsed = JSON.parse(storedUser);
            return normalizeStoredUser(parsed);
        }
    } catch (e) {
        // ignore malformed cached session data
    }
    return null;
}

function App() {
    const [user, setUser] = useState(getInitialUser);
    const [isCheckingSession, setIsCheckingSession] = useState(false);

    useEffect(() => {
        const restored = getInitialUser();
        if (restored && !user) {
            setUser(restored);
        }

        api.get('/check-session/', { timeout: 2500 })
            .then(response => {
                if (response.data && !response.data.error) {
                    const normalized = normalizeStoredUser(response.data);
                    if (normalized) {
                        setUser(normalized);
                        localStorage.setItem('user', JSON.stringify(normalized));
                    }
                } else {
                    // Only remove cached session if citizen and confirmed not authenticated
                    const cached = getInitialUser();
                    if (cached && cached.role === 'farmer') {
                        localStorage.removeItem('user');
                        setUser(null);
                    }
                }
            })
            .catch(() => {
                // Keep the restored local session when offline or network fails
            });

        api.get('/csrf-cookie/', { timeout: 1500 }).catch(() => {});
    }, []);

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
                localStorage.removeItem('admin_user');
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
                                            <Navigate to={getOfficerDashboardRoute(user.role)} />
                                ) : <Navigate to="/login" />
                            }
                        />
                        <Route
                            path="/farmer-dashboard"
                            element={user && (user.role === 'farmer' || user.role === 'admin') ? <FarmerDashboard user={user} /> : <Navigate to="/login" />}
                        />
                        <Route
                            path="/officer/accounts"
                            element={user && (user.role === 'accounts' || user.role === 'admin') ? <ErrorBoundary><AccountsDashboard user={user} /></ErrorBoundary> : <Navigate to="/officer-login" />}
                        />
                        <Route
                            path="/officer/estates"
                            element={user && (user.role === 'estates' || user.role === 'resettlement' || user.role === 'admin') ? <ErrorBoundary><EstatesDashboard user={user} /></ErrorBoundary> : <Navigate to="/officer-login" />}
                        />
                        <Route
                            path="/officer/lims"
                            element={user && (user.role === 'lims' || user.role === 'admin') ? <ErrorBoundary><LimsDashboard user={user} /></ErrorBoundary> : <Navigate to="/officer-login" />}
                        />
                        <Route
                            path="/officer/zlc"
                            element={user && (user.role === 'zlc' || user.role === 'admin') ? <ErrorBoundary><ZlcDashboard user={user} /></ErrorBoundary> : <Navigate to="/officer-login" />}
                        />
                        <Route
                            path="/officer/surveyor"
                            element={user && (user.role === 'surveyor' || user.role === 'gis' || user.role === 'admin') ? <ErrorBoundary><SurveyorGeneralDashboard user={user} /></ErrorBoundary> : <Navigate to="/officer-login" />}
                        />
                        <Route
                            path="/officer/valuation"
                            element={user && (user.role === 'valuation' || user.role === 'admin') ? <ErrorBoundary><ValuationDashboard user={user} /></ErrorBoundary> : <Navigate to="/officer-login" />}
                        />
                        <Route
                            path="/officer-dashboard"
                            element={user && (user.role !== 'farmer') ? <ErrorBoundary><OfficerDashboardDispatcher user={user} /></ErrorBoundary> : <Navigate to="/officer-login" />}
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
                                        <AccessDenied title="Audit Logs Access" message="You do not have access to view system audit logs. Only administrators and authorized officials can inspect them." />
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

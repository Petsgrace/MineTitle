import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../services/api';
import { recordLocalAuditLog } from '../utils/offlineDB';
import {
    Shield, Lock, User as UserIcon, Loader2, ArrowLeft,
    AlertCircle, ArrowRight, Eye, EyeOff, KeyRound, MonitorCheck
} from 'lucide-react';

export function getOfficerRoute(role) {
    const r = (role || '').toLowerCase().trim();
    if (r === 'admin') return '/admin';
    if (r === 'accounts') return '/officer/accounts';
    if (r === 'estates' || r === 'resettlement') return '/officer/estates';
    if (r === 'lims') return '/officer/lims';
    if (r === 'zlc') return '/officer/zlc';
    if (r === 'surveyor' || r === 'surveyor_general' || r === 'sg' || r === 'gis') return '/officer/sg';
    if (r === 'valuation') return '/officer/valuation';
    return '/officer/accounts';
}

export default function OfficerLogin({ setUser }) {
    const navigate = useNavigate();
    const [credentials, setCredentials] = useState({ username: '', password: '', mfa_code: '' });
    const [showPassword, setShowPassword] = useState(false);
    const [mfaRequired, setMfaRequired] = useState(false);
    const [mfaNotice, setMfaNotice] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const isNativePlatform = Boolean(
        (typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.()) ||
        (typeof window !== 'undefined' && (window.location.protocol === 'file:' || window.location.protocol === 'capacitor:'))
    );

    const routeByRole = (role) => {
        navigate(getOfficerRoute(role));
    };

    const handleLogin = async (e) => {
        if (e) e.preventDefault();
        setError('');
        setIsLoading(true);

        try {
            const payload = {
                username: credentials.username.trim(),
                password: credentials.password
            };
            if (mfaRequired && credentials.mfa_code) {
                payload.mfa_code = credentials.mfa_code.trim();
            }

            const response = await api.post('/login/', payload);

            if (response.data?.mfa_required) {
                setMfaRequired(true);
                setMfaNotice(response.data.message || `MFA OTP code dispatched to ${response.data.email_masked || 'your registered email'}.`);
                setIsLoading(false);
                return;
            }

            const userData = response.data;
            if (userData.token) {
                localStorage.setItem('authToken', userData.token);
            }

            if (userData.is_active === false) {
                setError('Account deactivated by System Administrator.');
                setIsLoading(false);
                return;
            }

            if (setUser) setUser(userData);
            localStorage.setItem('user', JSON.stringify(userData));
            localStorage.setItem('admin_user', JSON.stringify(userData));

            recordLocalAuditLog({
                action_type: 'OFFICER_LOGIN',
                reference_number: 'AUTH-SESSION',
                actor: userData.name || userData.username,
                stage: (userData.role || 'OFFICER').toUpperCase(),
                comment: `Officer @${userData.username} signed in to ${userData.department || userData.role} portal.`
            });

            if (userData.must_change_password) {
                navigate('/change-password');
                return;
            }

            routeByRole(userData.role);
        } catch (err) {
            console.error('Officer login error:', err);
            if (err.response?.status === 429) {
                const retryAfter = err.response.headers?.['retry-after'];
                const waitText = retryAfter ? `Please wait ${retryAfter} seconds` : 'Please wait 15 minutes';
                setError(err.response?.data?.error || `Too many failed login attempts. ${waitText} and try again.`);
            } else if (err.response?.status === 403) {
                setError(err.response?.data?.error || 'Account deactivated by System Administrator.');
            } else if (err.response?.status === 401) {
                setError('Invalid username or password.');
            } else if (!navigator.onLine || err.code === 'ERR_NETWORK') {
                setError('You are offline. Please connect to the network to sign in.');
            } else {
                setError(err.response?.data?.error || 'Invalid username or password.');
            }
        } finally {
            setIsLoading(false);
        }
    };

    // Global Rule 1: Officers must sign in using the web page
    if (isNativePlatform) {
        return (
            <div className="max-w-md mx-auto py-16 px-4 text-center">
                <div className="card p-8 bg-amber-50/90 border-2 border-amber-300 rounded-3xl shadow-xl">
                    <div className="w-16 h-16 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center mx-auto mb-4 shadow-inner">
                        <MonitorCheck size={32} />
                    </div>
                    <h2 className="text-xl font-extrabold text-amber-950 mb-3">
                        Officers must sign in using the web page
                    </h2>
                    <p className="text-xs text-amber-900 leading-relaxed mb-6">
                        Officer departmental channels, statutory approvals, and verification queues are restricted to authorized desktop web browsers. The mobile application is reserved exclusively for citizen field registration and offline data capture.
                    </p>
                    <Link
                        to="/"
                        className="btn bg-emerald-700 hover:bg-emerald-800 text-white font-bold py-2.5 px-6 rounded-xl text-xs inline-flex items-center gap-2 shadow-sm transition-all"
                    >
                        <ArrowLeft size={16} />
                        <span>Return to Citizen Portal</span>
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-xl mx-auto py-12 px-4">
            {/* Header / Crest */}
            <div className="text-center mb-8">
                <div className="inline-flex items-center gap-2 px-3 py-1 bg-amber-100 border border-amber-300 rounded-full text-xs font-semibold text-amber-900 mb-3 shadow-xs">
                    <span>🇿🇼</span>
                    <span>Ministry of Lands · One Stop Centre</span>
                </div>
                <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900">
                    Officer Channel Authentication
                </h1>
                <p className="text-gray-600 mt-2 max-w-md mx-auto text-xs sm:text-sm">
                    Official web portal for Accounts, Estates, LIMS, ZLC, Surveyor General, and Valuation Officers.
                    Sign in with your government credentials to access your assigned operational queue.
                </p>
            </div>

            {/* Login Card */}
            <div className="card p-6 sm:p-8 bg-white border border-gray-200 rounded-2xl shadow-md">
                <div className="flex items-center gap-2 mb-6 pb-3 border-b border-gray-100">
                    <Shield className="w-5 h-5 text-emerald-600" />
                    <div>
                        <h2 className="text-base font-bold text-gray-800">Operational Officer Sign In</h2>
                        <p className="text-xs text-gray-500">Field-level RBAC & Statutory Action Logging Enforced</p>
                    </div>
                </div>

                {error && (
                    <div className="mb-5 p-3.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-start gap-2.5 animate-shake">
                        <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                        <div className="leading-relaxed font-medium">{error}</div>
                    </div>
                )}

                {mfaNotice && (
                    <div className="mb-5 p-3.5 bg-emerald-50 border border-emerald-300 rounded-xl text-xs text-emerald-900 flex items-start gap-2.5">
                        <KeyRound className="w-4 h-4 text-emerald-700 flex-shrink-0 mt-0.5" />
                        <div className="leading-relaxed font-medium">{mfaNotice}</div>
                    </div>
                )}

                <form onSubmit={handleLogin} className="space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-gray-700 uppercase mb-1.5 tracking-wider">
                            Officer Username or Government Email
                        </label>
                        <div className="relative">
                            <UserIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                                type="text"
                                className="input pl-10 text-sm w-full rounded-xl"
                                value={credentials.username}
                                onChange={(e) => setCredentials({ ...credentials, username: e.target.value })}
                                placeholder="e.g. accounts or accounts@lands.gov.zw"
                                required
                                autoComplete="off"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-gray-700 uppercase mb-1.5 tracking-wider">
                            Security Password
                        </label>
                        <div className="relative">
                            <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                                type={showPassword ? "text" : "password"}
                                className="input pl-10 pr-10 text-sm w-full rounded-xl"
                                value={credentials.password}
                                onChange={(e) => setCredentials({ ...credentials, password: e.target.value })}
                                placeholder="••••••••••••"
                                required
                                autoComplete="new-password"
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                            >
                                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                        </div>
                    </div>

                    {mfaRequired && (
                        <div>
                            <label className="block text-xs font-bold text-emerald-800 uppercase mb-1.5 tracking-wider">
                                6-Digit MFA Security Code
                            </label>
                            <div className="relative">
                                <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-600" />
                                <input
                                    type="text"
                                    maxLength={6}
                                    className="input pl-10 text-sm w-full rounded-xl border-emerald-400 font-mono tracking-widest text-center text-lg font-bold"
                                    value={credentials.mfa_code}
                                    onChange={(e) => setCredentials({ ...credentials, mfa_code: e.target.value })}
                                    placeholder="123456"
                                    required
                                    autoComplete="one-time-code"
                                />
                            </div>
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={isLoading}
                        className="btn bg-emerald-800 hover:bg-emerald-900 text-white w-full h-11 font-bold rounded-xl flex items-center justify-center gap-2 text-sm shadow-md transition-all active:scale-98 mt-2 cursor-pointer"
                    >
                        {isLoading ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                <span>Verifying Officer Credentials...</span>
                            </>
                        ) : (
                            <>
                                <span>Access My Department Queue</span>
                                <ArrowRight size={16} />
                            </>
                        )}
                    </button>
                </form>

                {/* Duty & Privilege Security Notice */}
                <div className="mt-6 p-3.5 bg-amber-50/80 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-start gap-2.5">
                    <Shield className="w-4 h-4 text-amber-700 flex-shrink-0 mt-0.5" />
                    <div>
                        <strong>Statutory Channel Assignment:</strong> Department access, queue visibility, and statutory endorsement privileges must be explicitly assigned by the System Administrator. Officers see only their department's queue in sequential order: Accounts → Estates → LIMS → ZLC → Surveyor General → Valuation.
                    </div>
                </div>

                <div className="mt-5 pt-4 border-t border-gray-100 text-center">
                    <Link to="/" className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-emerald-700 font-medium">
                        <ArrowLeft size={13} />
                        <span>Return to Citizen Public Portal</span>
                    </Link>
                </div>
            </div>
        </div>
    );
}

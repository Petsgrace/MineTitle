import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { getOfficerRoute } from './OfficerLogin';
import { Lock, KeyRound, AlertCircle, CheckCircle2, ArrowRight, Loader2, ShieldCheck } from 'lucide-react';

export default function ChangePassword({ user, setUser }) {
    const navigate = useNavigate();
    const [formData, setFormData] = useState({
        old_password: '',
        new_password: '',
        confirm_password: ''
    });
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setSuccess('');

        if (formData.new_password.trim().toLowerCase() === 'ministry') {
            setError('New password must not be the temporary default password.');
            return;
        }

        if (formData.new_password !== formData.confirm_password) {
            setError('New password and confirmation password do not match.');
            return;
        }

        if (formData.new_password.length < 8) {
            setError('New password must be at least 8 characters long.');
            return;
        }

        const hasLetter = /[A-Za-z]/.test(formData.new_password);
        const hasDigit = /\d/.test(formData.new_password);
        if (!hasLetter || !hasDigit) {
            setError('New password must contain a combination of letters and numbers.');
            return;
        }

        setLoading(true);
        try {
            const response = await api.post('/change-password/', {
                old_password: formData.old_password,
                new_password: formData.new_password,
                confirm_password: formData.confirm_password
            });

            if (response.data?.token) {
                localStorage.setItem('authToken', response.data.token);
            }

            const updatedUser = {
                ...(user || {}),
                must_change_password: false
            };

            if (setUser) setUser(updatedUser);
            localStorage.setItem('user', JSON.stringify(updatedUser));
            localStorage.setItem('admin_user', JSON.stringify(updatedUser));

            setSuccess('Password updated successfully! Redirecting to your operational dashboard...');
            setTimeout(() => {
                const destination = user?.role === 'admin' ? '/admin' : getOfficerRoute(user?.role);
                navigate(destination);
            }, 1200);
        } catch (err) {
            console.error('Password change error:', err);
            setError(err.response?.data?.error || 'Failed to update password. Please check your current password.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-md mx-auto py-12 px-4">
            <div className="card p-8 bg-white border border-gray-200 rounded-3xl shadow-lg">
                <div className="text-center mb-6">
                    <div className="w-14 h-14 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center mx-auto mb-3 shadow-inner">
                        <KeyRound size={28} />
                    </div>
                    <h1 className="text-xl font-extrabold text-gray-900">
                        Mandatory Password Change
                    </h1>
                    <p className="text-xs text-gray-500 mt-1">
                        Ministry security policy requires all officers to change their initial temporary password before accessing operational queues.
                    </p>
                </div>

                {error && (
                    <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                        <div>{error}</div>
                    </div>
                )}

                {success && (
                    <div className="mb-4 p-3 bg-emerald-50 border border-emerald-300 rounded-xl text-xs text-emerald-900 flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-700 flex-shrink-0 mt-0.5" />
                        <div>{success}</div>
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                            Current Temporary Password
                        </label>
                        <div className="relative">
                            <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                                type="password"
                                className="input pl-10 text-sm w-full rounded-xl"
                                value={formData.old_password}
                                onChange={(e) => setFormData({ ...formData, old_password: e.target.value })}
                                placeholder="Enter temporary password ('Ministry')"
                                required
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                            New Secure Password
                        </label>
                        <div className="relative">
                            <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                                type="password"
                                className="input pl-10 text-sm w-full rounded-xl"
                                value={formData.new_password}
                                onChange={(e) => setFormData({ ...formData, new_password: e.target.value })}
                                placeholder="Minimum 8 characters with letters & numbers"
                                required
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                            Confirm New Password
                        </label>
                        <div className="relative">
                            <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                                type="password"
                                className="input pl-10 text-sm w-full rounded-xl"
                                value={formData.confirm_password}
                                onChange={(e) => setFormData({ ...formData, confirm_password: e.target.value })}
                                placeholder="Re-enter new password"
                                required
                            />
                        </div>
                    </div>

                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600 space-y-1">
                        <div className="font-semibold text-slate-800 flex items-center gap-1.5">
                            <ShieldCheck size={14} className="text-emerald-600" />
                            <span>Password Requirements:</span>
                        </div>
                        <ul className="list-disc pl-4 space-y-0.5 text-[11px]">
                            <li>At least 8 characters long</li>
                            <li>Mix of letters and numbers</li>
                            <li>Cannot be the default "Ministry" password</li>
                        </ul>
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="btn bg-emerald-800 hover:bg-emerald-900 text-white w-full h-11 font-bold rounded-xl flex items-center justify-center gap-2 text-sm shadow-md transition-all active:scale-98 mt-3 cursor-pointer"
                    >
                        {loading ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                <span>Updating Credentials...</span>
                            </>
                        ) : (
                            <>
                                <span>Set New Password & Continue</span>
                                <ArrowRight size={16} />
                            </>
                        )}
                    </button>
                </form>
            </div>
        </div>
    );
}


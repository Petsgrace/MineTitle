import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { recordLocalAuditLog } from '../../utils/offlineDB';
import {
    Scale, CheckCircle, RefreshCw, AlertCircle, Search,
    ArrowLeft, LogOut, FileText, User, MapPin, Loader2,
    Check, AlertTriangle, Copy, Calendar, ShieldAlert
} from 'lucide-react';

export default function ZlcDashboard({ user }) {
    const navigate = useNavigate();
    const [applications, setApplications] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedApp, setSelectedApp] = useState(null);
    const [actionType, setActionType] = useState(''); // 'CLEARED' | 'DISPUTE' | 'DOUBLE_ALLOCATION'
    const [disputeNature, setDisputeNature] = useState('');
    const [comments, setComments] = useState('');
    const [isActionModalOpen, setIsActionModalOpen] = useState(false);
    const [actionLoading, setActionLoading] = useState(false);
    const [successMessage, setSuccessMessage] = useState('');
    const [errorMessage, setErrorMessage] = useState('');

    const fetchQueue = async () => {
        setLoading(true);
        setErrorMessage('');
        try {
            const res = await api.get('/applications/');
            const records = Array.isArray(res.data) ? res.data : (res.data?.results || []);
            setApplications(records);
        } catch (err) {
            console.error('ZLC fetch error:', err);
            setErrorMessage('Unable to load ZLC queue from server.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchQueue();
    }, []);

    const handleCommitAction = async () => {
        if (!selectedApp || !actionType) return;
        if (actionType === 'DISPUTE' && !disputeNature.trim()) {
            setErrorMessage('Please specify the nature of the land dispute.');
            return;
        }

        setActionLoading(true);
        setErrorMessage('');
        setSuccessMessage('');
        try {
            const payload = {
                action_type: actionType,
                has_disputes: actionType === 'DISPUTE',
                dispute_nature: actionType === 'DISPUTE' ? disputeNature.trim() : (actionType === 'DOUBLE_ALLOCATION' ? 'Double allocation identified in gazette records' : null),
                officer_comments: comments.trim()
            };
            await api.post(`/applications/${selectedApp.id}/verify_zlc/`, payload);

            let logAction = 'ZLC_CLEARED';
            let summaryNote = `Application ${selectedApp.reference_number} granted ZLC Clearance and released to Surveyor General.`;
            if (actionType === 'DISPUTE') {
                logAction = 'ZLC_DISPUTE_LOCKED';
                summaryNote = `Application ${selectedApp.reference_number} flagged with active land dispute. Title deed issuance is strictly LOCKED.`;
            } else if (actionType === 'DOUBLE_ALLOCATION') {
                logAction = 'ZLC_DOUBLE_ALLOCATION_LOCKED';
                summaryNote = `Application ${selectedApp.reference_number} flagged for double allocation. Title deed issuance is strictly LOCKED.`;
            }

            recordLocalAuditLog({
                action_type: logAction,
                reference_number: selectedApp.reference_number,
                actor: user?.name || user?.username || 'ZLC Officer',
                stage: logAction,
                comment: comments.trim() || summaryNote
            });

            setSuccessMessage(summaryNote);
            setApplications(prev => prev.filter(item => item.id !== selectedApp.id));
            setIsActionModalOpen(false);
            setSelectedApp(null);
            setActionType('');
            setDisputeNature('');
            setComments('');
        } catch (err) {
            console.error('ZLC commit error:', err);
            const msg = err.response?.data?.error || err.response?.data?.detail || 'Failed to commit ZLC action.';
            setErrorMessage(msg);
        } finally {
            setActionLoading(false);
        }
    };

    const handleLogout = async () => {
        try {
            await api.post('/logout/');
        } catch (e) {
            // ignore
        }
        localStorage.removeItem('user');
        localStorage.removeItem('admin_user');
        navigate('/login');
    };

    const filtered = applications.filter(app => {
        const query = searchTerm.toLowerCase();
        const ref = (app.reference_number || '').toLowerCase();
        const name = (app.farmer_name || app.beneficiary_name || '').toLowerCase();
        const surname = (app.farmer_surname || app.surname || '').toLowerCase();
        const id = (app.national_id || '').toLowerCase();
        const farm = (app.farm_name || '').toLowerCase();
        return ref.includes(query) || name.includes(query) || surname.includes(query) || id.includes(query) || farm.includes(query);
    });

    const formatDate = (isoString) => {
        if (!isoString) return 'Not Gazetted / Pending';
        try {
            return new Date(isoString).toLocaleDateString('en-GB', {
                day: '2-digit', month: 'short', year: 'numeric'
            });
        } catch (e) {
            return isoString;
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 py-6 px-4 sm:px-6">
            {/* Top Navigation Bar */}
            <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-4 rounded-2xl shadow-xs border border-slate-200 mb-6">
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => navigate('/')}
                        className="btn bg-slate-100 hover:bg-slate-200 text-slate-700 p-2 rounded-xl"
                        title="Back to Portal"
                    >
                        <ArrowLeft size={18} />
                    </button>
                    <div>
                        <div className="flex items-center gap-2">
                            <h1 className="text-xl font-extrabold text-slate-900">ZLC Officer Dashboard</h1>
                            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-100 text-purple-800 border border-purple-300">
                                Zimbabwe Land Commission
                            </span>
                        </div>
                        <p className="text-xs text-slate-500">Stage 4: Land Data Verification, Gazette Audits, & Dispute Clearance Queue</p>
                    </div>
                </div>

                <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
                    <div className="text-right hidden sm:block">
                        <div className="text-xs font-bold text-slate-800">{user?.name || user?.username}</div>
                        <div className="text-[10px] text-slate-500 uppercase tracking-wider">{user?.role || 'zlc'}</div>
                    </div>
                    <button
                        onClick={fetchQueue}
                        disabled={loading}
                        className="btn bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5"
                    >
                        <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                        <span>Refresh</span>
                    </button>
                    <button
                        onClick={handleLogout}
                        className="btn bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5"
                    >
                        <LogOut size={14} />
                        <span>Logout</span>
                    </button>
                </div>
            </div>

            {/* Notifications */}
            {successMessage && (
                <div className="max-w-7xl mx-auto mb-4 p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-sm flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <CheckCircle size={18} className="text-emerald-600 shrink-0" />
                        <span>{successMessage}</span>
                    </div>
                    <button onClick={() => setSuccessMessage('')} className="text-emerald-600 hover:text-emerald-800 font-bold ml-4">✕</button>
                </div>
            )}
            {errorMessage && (
                <div className="max-w-7xl mx-auto mb-4 p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-sm flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <AlertCircle size={18} className="text-rose-600 shrink-0" />
                        <span>{errorMessage}</span>
                    </div>
                    <button onClick={() => setErrorMessage('')} className="text-rose-600 hover:text-rose-800 font-bold ml-4">✕</button>
                </div>
            )}

            {/* Main Content Area */}
            <div className="max-w-7xl mx-auto">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mb-4">
                    <div className="relative w-full sm:w-96">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                        <input
                            type="text"
                            placeholder="Search by farmer, national ID, farm name, or gazette ref..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="input pl-10 pr-4 py-2 w-full text-sm rounded-xl border border-slate-300 focus:outline-purple-600 bg-white"
                        />
                    </div>
                    <div className="text-xs font-medium text-slate-600 self-end sm:self-center">
                        Total Pending in ZLC Queue: <strong className="text-slate-900 font-bold">{filtered.length}</strong>
                    </div>
                </div>

                {/* Queue Table */}
                <div className="bg-white rounded-2xl shadow-xs border border-slate-200 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs border-collapse">
                            <thead>
                                <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-600 uppercase font-bold tracking-wider">
                                    <th className="py-3 px-4">Ref Number</th>
                                    <th className="py-3 px-4">Beneficiary</th>
                                    <th className="py-3 px-4">National ID</th>
                                    <th className="py-3 px-4">Farm & Plot</th>
                                    <th className="py-3 px-4">Gazette Date</th>
                                    <th className="py-3 px-4 text-center">Dispute Status</th>
                                    <th className="py-3 px-4 text-center">Double Allocation</th>
                                    <th className="py-3 px-4 text-center">ZLC Commission Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {loading ? (
                                    <tr>
                                        <td colSpan={8} className="py-12 text-center text-slate-400">
                                            <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-purple-600" />
                                            <span>Loading ZLC queue...</span>
                                        </td>
                                    </tr>
                                ) : filtered.length === 0 ? (
                                    <tr>
                                        <td colSpan={8} className="py-12 text-center text-slate-400">
                                            <Scale className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                                            <p className="font-semibold text-slate-600">No pending files in ZLC queue</p>
                                            <p className="text-[11px] text-slate-400 mt-1">All verified files from LIMS have been resolved or cleared.</p>
                                        </td>
                                    </tr>
                                ) : (
                                    filtered.map((app) => (
                                        <tr key={app.id} className="hover:bg-slate-50/80 transition-colors">
                                            <td className="py-3.5 px-4 font-mono font-bold text-purple-900">
                                                {app.reference_number}
                                            </td>
                                            <td className="py-3.5 px-4">
                                                <div className="font-bold text-slate-900">{app.farmer_name || app.beneficiary_name} {app.farmer_surname || app.surname}</div>
                                                <div className="text-[10px] text-slate-500">{app.telephone || app.phone_number}</div>
                                            </td>
                                            <td className="py-3.5 px-4 font-mono text-slate-700">
                                                {app.national_id}
                                            </td>
                                            <td className="py-3.5 px-4 text-slate-800">
                                                <div className="font-semibold">{app.farm_name}</div>
                                                <div className="text-[10px] text-slate-500">{app.district} · Plot {app.subdivision_number || '1'}</div>
                                            </td>
                                            <td className="py-3.5 px-4 font-mono text-slate-600">
                                                {formatDate(app.gazette_date)}
                                            </td>
                                            <td className="py-3.5 px-4 text-center">
                                                {app.has_disputes ? (
                                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-300">
                                                        Active Dispute
                                                    </span>
                                                ) : (
                                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                                                        No Dispute
                                                    </span>
                                                )}
                                            </td>
                                            <td className="py-3.5 px-4 text-center">
                                                {app.has_double_allocation ? (
                                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                                                        Flagged
                                                    </span>
                                                ) : (
                                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">
                                                        Single Holder
                                                    </span>
                                                )}
                                            </td>
                                            <td className="py-3.5 px-4 text-center">
                                                <div className="flex items-center justify-center gap-1.5">
                                                    <button
                                                        onClick={() => {
                                                            setSelectedApp(app);
                                                            setActionType('CLEARED');
                                                            setIsActionModalOpen(true);
                                                        }}
                                                        className="btn bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-2.5 py-1 rounded-xl shadow-xs text-xs flex items-center gap-1 active:scale-95 cursor-pointer"
                                                        title="Grant ZLC Clearance"
                                                    >
                                                        <Check size={13} />
                                                        <span>Cleared</span>
                                                    </button>
                                                    <button
                                                        onClick={() => {
                                                            setSelectedApp(app);
                                                            setActionType('DISPUTE');
                                                            setIsActionModalOpen(true);
                                                        }}
                                                        className="btn bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold px-2.5 py-1 rounded-xl text-xs flex items-center gap-1 active:scale-95 cursor-pointer"
                                                        title="Log Dispute & Lock Deed Issuance"
                                                    >
                                                        <AlertTriangle size={13} />
                                                        <span>Dispute</span>
                                                    </button>
                                                    <button
                                                        onClick={() => {
                                                            setSelectedApp(app);
                                                            setActionType('DOUBLE_ALLOCATION');
                                                            setIsActionModalOpen(true);
                                                        }}
                                                        className="btn bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 font-bold px-2.5 py-1 rounded-xl text-xs flex items-center gap-1 active:scale-95 cursor-pointer"
                                                        title="Flag Double Allocation & Lock Deed Issuance"
                                                    >
                                                        <Copy size={13} />
                                                        <span>Double Alloc</span>
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="mt-6 p-4 bg-purple-50/70 border border-purple-200 rounded-2xl flex items-start gap-3 text-xs text-purple-900">
                    <ShieldAlert className="w-5 h-5 text-purple-700 shrink-0 mt-0.5" />
                    <div>
                        <strong className="font-bold">Statutory Land Commission Lock:</strong> Flagging an application with a <strong>Dispute</strong> or <strong>Double Allocation</strong> applies a strict backend security lock. The system will prevent any downstream valuation, Conveyancer drafting, or Title Deed issuance until the dispute is formally resolved.
                    </div>
                </div>
            </div>

            {/* Action Confirmation Modal */}
            {isActionModalOpen && selectedApp && (
                <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
                        <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
                            <div>
                                <h3 className="font-extrabold text-slate-900 text-base">
                                    {actionType === 'CLEARED' && 'Confirm ZLC Clearance'}
                                    {actionType === 'DISPUTE' && 'Register Land Dispute (Lock Deed)'}
                                    {actionType === 'DOUBLE_ALLOCATION' && 'Flag Double Allocation (Lock Deed)'}
                                </h3>
                                <p className="text-xs text-slate-500">{selectedApp.reference_number} · {selectedApp.farm_name}</p>
                            </div>
                            <button
                                onClick={() => setIsActionModalOpen(false)}
                                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center text-sm font-bold"
                            >
                                ✕
                            </button>
                        </div>

                        <div className="space-y-4 mb-6 text-xs">
                            {actionType === 'CLEARED' ? (
                                <p className="text-slate-700 bg-emerald-50 p-3 rounded-xl border border-emerald-200">
                                    Are you sure you want to certify that <strong>{selectedApp.farm_name}</strong> is free of disputes and unencumbered? This will release the file directly to the <strong>Surveyor General</strong>.
                                </p>
                            ) : actionType === 'DISPUTE' ? (
                                <div className="space-y-3">
                                    <p className="text-rose-700 bg-rose-50 p-3 rounded-xl border border-rose-200">
                                        Logging a dispute will immediately halt processing and lock Title Deed issuance.
                                    </p>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                                            Dispute Nature / Particulars
                                        </label>
                                        <input
                                            type="text"
                                            value={disputeNature}
                                            onChange={(e) => setDisputeNature(e.target.value)}
                                            placeholder="e.g. Boundary overlap with neighboring plot / Family contestation"
                                            className="input w-full p-2.5 rounded-xl border border-slate-300 focus:outline-rose-600 bg-white"
                                            required
                                        />
                                    </div>
                                </div>
                            ) : (
                                <p className="text-amber-800 bg-amber-50 p-3 rounded-xl border border-amber-300">
                                    Flagging a <strong>Double Allocation</strong> will lock title issuance and alert the Land Commission audit directorate.
                                </p>
                            )}

                            <div>
                                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                                    Commission Remarks / Notes
                                </label>
                                <textarea
                                    rows={2}
                                    value={comments}
                                    onChange={(e) => setComments(e.target.value)}
                                    placeholder="Enter official ZLC minute or decision note..."
                                    className="input w-full p-2.5 rounded-xl border border-slate-300 focus:outline-purple-600 bg-white"
                                />
                            </div>
                        </div>

                        <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                            <button
                                type="button"
                                onClick={() => setIsActionModalOpen(false)}
                                className="btn bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-xl text-xs font-bold"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleCommitAction}
                                disabled={actionLoading}
                                className={`btn font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 shadow-sm text-white ${
                                    actionType === 'CLEARED' ? 'bg-emerald-600 hover:bg-emerald-700' :
                                    actionType === 'DISPUTE' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-amber-600 hover:bg-amber-700'
                                }`}
                            >
                                {actionLoading ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                                <span>Commit ZLC Action</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}


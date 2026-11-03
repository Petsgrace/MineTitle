import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { recordLocalAuditLog } from '../../utils/offlineDB';
import {
    Database, CheckCircle, RefreshCw, AlertCircle, Search,
    ArrowLeft, LogOut, FileText, User, Phone, MapPin,
    Loader2, Check, XCircle, Camera, Image as ImageIcon, Eye
} from 'lucide-react';

export default function LimsDashboard({ user }) {
    const navigate = useNavigate();
    const [applications, setApplications] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedApp, setSelectedApp] = useState(null);
    const [comments, setComments] = useState('');
    const [queryReason, setQueryReason] = useState('');
    const [isQueryModalOpen, setIsQueryModalOpen] = useState(false);
    const [actionLoading, setActionLoading] = useState(false);
    const [successMessage, setSuccessMessage] = useState('');
    const [errorMessage, setErrorMessage] = useState('');
    const [viewingPhoto, setViewingPhoto] = useState(null);

    const fetchQueue = async () => {
        setLoading(true);
        setErrorMessage('');
        try {
            const res = await api.get('/applications/');
            const records = Array.isArray(res.data) ? res.data : (res.data?.results || []);
            setApplications(records);
        } catch (err) {
            console.error('LIMS fetch error:', err);
            setErrorMessage('Unable to load LIMS verification queue from server.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchQueue();
    }, []);

    const handleCommitVerified = async (app) => {
        setActionLoading(true);
        setErrorMessage('');
        setSuccessMessage('');
        try {
            const payload = {
                status_action: 'VERIFIED',
                comments: comments.trim() || 'Cadastral database matched and biometrics verified.'
            };
            await api.post(`/applications/${app.id}/verify_lims/`, payload);

            recordLocalAuditLog({
                action_type: 'LIMS_VERIFIED',
                reference_number: app.reference_number,
                actor: user?.name || user?.username || 'LIMS Officer',
                stage: 'LIMS_VERIFIED',
                comment: 'Farm parcel matched against national cadastre; biometrics verified.'
            });

            setSuccessMessage(`Application ${app.reference_number} marked as VERIFIED and released to ZLC Officer queue.`);
            setApplications(prev => prev.filter(item => item.id !== app.id));
            setSelectedApp(null);
            setComments('');
        } catch (err) {
            console.error('LIMS verify error:', err);
            const msg = err.response?.data?.error || err.response?.data?.detail || 'Failed to verify application.';
            setErrorMessage(msg);
        } finally {
            setActionLoading(false);
        }
    };

    const handleCommitNotVerified = async () => {
        if (!queryReason.trim()) {
            setErrorMessage('Please provide a specific discrepancy reason for "Not Verified".');
            return;
        }

        setActionLoading(true);
        setErrorMessage('');
        setSuccessMessage('');
        try {
            const payload = {
                status_action: 'QUERY',
                reason: queryReason.trim(),
                comments: comments.trim()
            };
            await api.post(`/applications/${selectedApp.id}/verify_lims/`, payload);

            recordLocalAuditLog({
                action_type: 'LIMS_QUERIED',
                reference_number: selectedApp.reference_number,
                actor: user?.name || user?.username || 'LIMS Officer',
                stage: 'LIMS_QUERIED',
                comment: `Cadastral / biometric discrepancy logged: ${queryReason.trim()}`
            });

            setSuccessMessage(`Application ${selectedApp.reference_number} flagged as NOT VERIFIED with query reason logged.`);
            setApplications(prev => prev.filter(item => item.id !== selectedApp.id));
            setIsQueryModalOpen(false);
            setSelectedApp(null);
            setQueryReason('');
            setComments('');
        } catch (err) {
            console.error('LIMS query error:', err);
            const msg = err.response?.data?.error || err.response?.data?.detail || 'Failed to log discrepancy.';
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
        if (!isoString) return 'N/A';
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
                            <h1 className="text-xl font-extrabold text-slate-900">LIMS Officer Dashboard</h1>
                            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800 border border-blue-300">
                                Land Information Management System
                            </span>
                        </div>
                        <p className="text-xs text-slate-500">Stage 3: National Cadastre & Beneficiary Biometric Comparison Queue</p>
                    </div>
                </div>

                <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
                    <div className="text-right hidden sm:block">
                        <div className="text-xs font-bold text-slate-800">{user?.name || user?.username}</div>
                        <div className="text-[10px] text-slate-500 uppercase tracking-wider">{user?.role || 'lims'}</div>
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
                            placeholder="Search by farmer, ID, farm name, or cadastral ID..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="input pl-10 pr-4 py-2 w-full text-sm rounded-xl border border-slate-300 focus:outline-blue-600 bg-white"
                        />
                    </div>
                    <div className="text-xs font-medium text-slate-600 self-end sm:self-center">
                        Total Pending in LIMS Queue: <strong className="text-slate-900 font-bold">{filtered.length}</strong>
                    </div>
                </div>

                {/* Queue Table */}
                <div className="bg-white rounded-2xl shadow-xs border border-slate-200 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs border-collapse">
                            <thead>
                                <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-600 uppercase font-bold tracking-wider">
                                    <th className="py-3 px-4">Cadastral Ref</th>
                                    <th className="py-3 px-4">Beneficiary</th>
                                    <th className="py-3 px-4">National ID</th>
                                    <th className="py-3 px-4">Farm Details</th>
                                    <th className="py-3 px-4">Extent</th>
                                    <th className="py-3 px-4 text-center">Biometric Photos</th>
                                    <th className="py-3 px-4 text-center">Tenure Scan</th>
                                    <th className="py-3 px-4 text-center">Database Verification</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {loading ? (
                                    <tr>
                                        <td colSpan={8} className="py-12 text-center text-slate-400">
                                            <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-600" />
                                            <span>Loading LIMS verification records...</span>
                                        </td>
                                    </tr>
                                ) : filtered.length === 0 ? (
                                    <tr>
                                        <td colSpan={8} className="py-12 text-center text-slate-400">
                                            <Database className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                                            <p className="font-semibold text-slate-600">No pending files in LIMS queue</p>
                                            <p className="text-[11px] text-slate-400 mt-1">All dossiers from Estates have been audited against the cadastral database.</p>
                                        </td>
                                    </tr>
                                ) : (
                                    filtered.map((app) => (
                                        <tr key={app.id} className="hover:bg-slate-50/80 transition-colors">
                                            <td className="py-3.5 px-4 font-mono font-bold text-blue-900">
                                                {app.reference_number}
                                            </td>
                                            <td className="py-3.5 px-4">
                                                <div className="font-bold text-slate-900">{app.farmer_name || app.beneficiary_name} {app.farmer_surname || app.surname}</div>
                                                <div className="text-[11px] text-slate-500">{app.telephone || app.phone_number}</div>
                                            </td>
                                            <td className="py-3.5 px-4 font-mono text-slate-700 font-semibold">
                                                {app.national_id}
                                            </td>
                                            <td className="py-3.5 px-4 text-slate-800">
                                                <div className="font-bold">{app.farm_name}</div>
                                                <div className="text-[10px] text-slate-500">{app.district}, {app.province} · Plot {app.subdivision_number || '1'}</div>
                                            </td>
                                            <td className="py-3.5 px-4 font-mono font-bold text-slate-900">
                                                {parseFloat(app.farm_extent || 0).toFixed(2)} Ha
                                            </td>
                                            <td className="py-3.5 px-4 text-center">
                                                <div className="inline-flex items-center gap-1">
                                                    {app.portrait_photo || app.farmer_photo ? (
                                                        <button
                                                            onClick={() => setViewingPhoto({ title: 'Beneficiary Portrait Photo', url: app.portrait_photo || app.farmer_photo })}
                                                            className="p-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg text-xs font-semibold flex items-center gap-1"
                                                            title="Inspect Portrait Photo"
                                                        >
                                                            <Camera size={13} />
                                                            <span>Portrait</span>
                                                        </button>
                                                    ) : (
                                                        <span className="text-[10px] text-slate-400 italic">No portrait</span>
                                                    )}
                                                    {app.national_id_document && (
                                                        <button
                                                            onClick={() => setViewingPhoto({ title: 'National ID Front View', url: app.national_id_document })}
                                                            className="p-1.5 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-lg text-xs font-semibold flex items-center gap-1"
                                                            title="Inspect ID"
                                                        >
                                                            <ImageIcon size={13} />
                                                            <span>ID</span>
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="py-3.5 px-4 text-center">
                                                {app.offer_letter_document || app.tenure_document ? (
                                                    <button
                                                        onClick={() => setViewingPhoto({ title: 'Tenure Document', url: app.offer_letter_document || app.tenure_document })}
                                                        className="p-1.5 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-lg text-xs font-semibold"
                                                    >
                                                        <FileText size={13} />
                                                    </button>
                                                ) : (
                                                    <span className="text-[10px] text-slate-400 italic">N/A</span>
                                                )}
                                            </td>
                                            <td className="py-3.5 px-4 text-center">
                                                <div className="flex items-center justify-center gap-2">
                                                    <button
                                                        onClick={() => handleCommitVerified(app)}
                                                        disabled={actionLoading}
                                                        className="btn bg-blue-600 hover:bg-blue-700 text-white font-bold px-3 py-1.5 rounded-xl shadow-xs transition-all flex items-center gap-1 text-xs active:scale-95 cursor-pointer"
                                                        title="Compare against database and mark Verified"
                                                    >
                                                        <Check size={14} />
                                                        <span>Verified</span>
                                                    </button>
                                                    <button
                                                        onClick={() => {
                                                            setSelectedApp(app);
                                                            setIsQueryModalOpen(true);
                                                        }}
                                                        disabled={actionLoading}
                                                        className="btn bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold px-2.5 py-1.5 rounded-xl transition-all flex items-center gap-1 text-xs active:scale-95 cursor-pointer"
                                                        title="Flag discrepancy in database"
                                                    >
                                                        <XCircle size={14} />
                                                        <span>Not Verified</span>
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
            </div>

            {/* Not Verified Query Modal */}
            {isQueryModalOpen && selectedApp && (
                <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
                        <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
                            <h3 className="font-extrabold text-slate-900 text-base">Flag Discrepancy (Not Verified)</h3>
                            <button
                                onClick={() => setIsQueryModalOpen(false)}
                                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center text-sm font-bold"
                            >
                                ✕
                            </button>
                        </div>

                        <div className="space-y-4 mb-6">
                            <p className="text-xs text-slate-600">
                                Specify the reason why <strong className="text-slate-900">{selectedApp.reference_number}</strong> failed LIMS database comparison:
                            </p>

                            <div>
                                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                                    Discrepancy Nature
                                </label>
                                <select
                                    value={queryReason}
                                    onChange={(e) => setQueryReason(e.target.value)}
                                    className="input w-full p-2.5 text-xs rounded-xl border border-slate-300 focus:outline-rose-600 bg-white"
                                >
                                    <option value="">Select cadastral or biometric issue...</option>
                                    <option value="Cadastral boundary does not match gazetted extent">Cadastral boundary does not match gazetted extent</option>
                                    <option value="Beneficiary biometrics mismatch against national database">Beneficiary biometrics mismatch against national database</option>
                                    <option value="Farm parcel number is invalid or unindexed in LIMS">Farm parcel number is invalid or unindexed in LIMS</option>
                                    <option value="Double survey entry detected in cadastre">Double survey entry detected in cadastre</option>
                                    <option value="Other discrepancy">Other discrepancy (specify below)</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                                    Specific Officer Findings
                                </label>
                                <textarea
                                    rows={2}
                                    value={comments}
                                    onChange={(e) => setComments(e.target.value)}
                                    placeholder="Enter detailed audit finding..."
                                    className="input w-full p-2.5 text-xs rounded-xl border border-slate-300 focus:outline-rose-600 bg-white"
                                />
                            </div>
                        </div>

                        <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                            <button
                                type="button"
                                onClick={() => setIsQueryModalOpen(false)}
                                className="btn bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-xl text-xs font-bold"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleCommitNotVerified}
                                disabled={actionLoading || !queryReason}
                                className="btn bg-rose-600 hover:bg-rose-700 text-white font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 shadow-sm"
                            >
                                {actionLoading ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />}
                                <span>Commit Query</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Photo / ID Lightbox */}
            {viewingPhoto && (
                <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200">
                        <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
                            <h3 className="font-extrabold text-slate-900 text-base">{viewingPhoto.title}</h3>
                            <button
                                onClick={() => setViewingPhoto(null)}
                                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center text-sm font-bold"
                            >
                                ✕
                            </button>
                        </div>
                        <div className="max-h-[65vh] overflow-auto flex items-center justify-center p-4 bg-slate-100 rounded-2xl">
                            <img src={viewingPhoto.url} alt={viewingPhoto.title} className="max-h-[55vh] max-w-full rounded-xl object-contain shadow-md" />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}


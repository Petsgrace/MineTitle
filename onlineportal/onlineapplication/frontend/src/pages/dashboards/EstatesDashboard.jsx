import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { recordLocalAuditLog } from '../../utils/offlineDB';
import {
    Briefcase, CheckCircle, RefreshCw, AlertCircle, Search,
    ArrowLeft, LogOut, FileText, User, Phone, MapPin, Eye,
    Loader2, Check, MessageSquare, Calendar, Image as ImageIcon
} from 'lucide-react';

export default function EstatesDashboard({ user }) {
    const navigate = useNavigate();
    const [applications, setApplications] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedApp, setSelectedApp] = useState(null);
    const [comments, setComments] = useState('');
    const [actionLoading, setActionLoading] = useState(false);
    const [successMessage, setSuccessMessage] = useState('');
    const [errorMessage, setErrorMessage] = useState('');
    const [viewingDoc, setViewingDoc] = useState(null);

    const fetchQueue = async () => {
        setLoading(true);
        setErrorMessage('');
        try {
            const res = await api.get('/applications/');
            const records = Array.isArray(res.data) ? res.data : (res.data?.results || []);
            setApplications(records);
        } catch (err) {
            console.error('Estates fetch error:', err);
            setErrorMessage('Unable to load Estates queue from server. Please check your network connection.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchQueue();
    }, []);

    const handleCommitClear = async (e) => {
        if (e) e.preventDefault();
        if (!selectedApp) return;

        setActionLoading(true);
        setErrorMessage('');
        setSuccessMessage('');
        try {
            const payload = {
                officer_comments: comments.trim()
            };
            await api.post(`/applications/${selectedApp.id}/verify_estates/`, payload);

            recordLocalAuditLog({
                action_type: 'ESTATES_CLEARED',
                reference_number: selectedApp.reference_number,
                actor: user?.name || user?.username || 'Estates Officer',
                stage: 'ESTATES_CLEARED',
                comment: comments.trim() || 'Tenure documents, farm categorization, and National ID verified.'
            });

            setSuccessMessage(`Application ${selectedApp.reference_number} successfully cleared by Estates and released to LIMS Officer.`);
            setApplications(prev => prev.filter(item => item.id !== selectedApp.id));
            setSelectedApp(null);
            setComments('');
        } catch (err) {
            console.error('Estates clear error:', err);
            const msg = err.response?.data?.error || err.response?.data?.detail || 'Failed to clear application. Please try again.';
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
        const district = (app.district || '').toLowerCase();
        return ref.includes(query) || name.includes(query) || surname.includes(query) || id.includes(query) || farm.includes(query) || district.includes(query);
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
            {/* Top Navigation Bar: Limited strictly to Dashboard, Back, and Logout */}
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
                            <h1 className="text-xl font-extrabold text-slate-900">Estates Officer Dashboard</h1>
                            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">
                                Estates Division
                            </span>
                        </div>
                        <p className="text-xs text-slate-500">Stage 2: Farmer Identity, Tenure Scans, & Land Extent Clearance Queue</p>
                    </div>
                </div>

                <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
                    <div className="text-right hidden sm:block">
                        <div className="text-xs font-bold text-slate-800">{user?.name || user?.username}</div>
                        <div className="text-[10px] text-slate-500 uppercase tracking-wider">{user?.role || 'estates'}</div>
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
                {/* Search Bar & Counter */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mb-4">
                    <div className="relative w-full sm:w-96">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                        <input
                            type="text"
                            placeholder="Search by farmer, ID, farm name, or district..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="input pl-10 pr-4 py-2 w-full text-sm rounded-xl border border-slate-300 focus:outline-emerald-600 bg-white"
                        />
                    </div>
                    <div className="text-xs font-medium text-slate-600 self-end sm:self-center">
                        Total Pending in Estates Queue: <strong className="text-slate-900 font-bold">{filtered.length}</strong>
                    </div>
                </div>

                {/* Queue Table */}
                <div className="bg-white rounded-2xl shadow-xs border border-slate-200 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs border-collapse">
                            <thead>
                                <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-600 uppercase font-bold tracking-wider">
                                    <th className="py-3 px-4">Date of App</th>
                                    <th className="py-3 px-4">Farmer Details</th>
                                    <th className="py-3 px-4">National ID</th>
                                    <th className="py-3 px-4">Category</th>
                                    <th className="py-3 px-4">Province & District</th>
                                    <th className="py-3 px-4">Farm & Plot No.</th>
                                    <th className="py-3 px-4">Farm Extent</th>
                                    <th className="py-3 px-4 text-center">Tenure & ID Docs</th>
                                    <th className="py-3 px-4 text-center">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {loading ? (
                                    <tr>
                                        <td colSpan={9} className="py-12 text-center text-slate-400">
                                            <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-amber-600" />
                                            <span>Loading Estates queue...</span>
                                        </td>
                                    </tr>
                                ) : filtered.length === 0 ? (
                                    <tr>
                                        <td colSpan={9} className="py-12 text-center text-slate-400">
                                            <Briefcase className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                                            <p className="font-semibold text-slate-600">No pending files in Estates queue</p>
                                            <p className="text-[11px] text-slate-400 mt-1">All dossiers from Accounts have been verified or released to LIMS.</p>
                                        </td>
                                    </tr>
                                ) : (
                                    filtered.map((app) => (
                                        <tr key={app.id} className="hover:bg-slate-50/80 transition-colors">
                                            <td className="py-3.5 px-4 font-mono text-slate-600">
                                                {formatDate(app.created_at)}
                                            </td>
                                            <td className="py-3.5 px-4">
                                                <div className="font-bold text-slate-900">{app.farmer_name || app.beneficiary_name} {app.farmer_surname || app.surname}</div>
                                                <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                                                    <Phone size={10} />
                                                    <span>{app.telephone || app.phone_number || 'No phone'}</span>
                                                </div>
                                            </td>
                                            <td className="py-3.5 px-4 font-mono font-semibold text-slate-800">
                                                {app.national_id || 'N/A'}
                                            </td>
                                            <td className="py-3.5 px-4">
                                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-900 border border-amber-200">
                                                    {app.farm_category || 'A2 Model'}
                                                </span>
                                            </td>
                                            <td className="py-3.5 px-4 text-slate-700">
                                                <div className="font-medium">{app.district || 'District'}</div>
                                                <div className="text-[10px] text-slate-400">{app.province || 'Province'}</div>
                                            </td>
                                            <td className="py-3.5 px-4 text-slate-800">
                                                <div className="font-bold">{app.farm_name}</div>
                                                <div className="text-[11px] text-slate-500">Plot: {app.subdivision_number || app.plot_number || '1'}</div>
                                            </td>
                                            <td className="py-3.5 px-4 font-mono font-bold text-slate-900">
                                                {parseFloat(app.farm_extent || 0).toFixed(2)} Ha
                                            </td>
                                            <td className="py-3.5 px-4 text-center">
                                                <div className="inline-flex items-center gap-1.5">
                                                    {app.offer_letter_document || app.tenure_document ? (
                                                        <button
                                                            onClick={() => setViewingDoc({ title: 'Tenure Document Scans', url: app.offer_letter_document || app.tenure_document })}
                                                            className="p-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg text-xs font-semibold flex items-center gap-1"
                                                            title="Inspect Tenure Document"
                                                        >
                                                            <FileText size={13} />
                                                            <span>Tenure</span>
                                                        </button>
                                                    ) : (
                                                        <span className="text-[10px] text-slate-400 italic">No doc</span>
                                                    )}
                                                    {app.national_id_document ? (
                                                        <button
                                                            onClick={() => setViewingDoc({ title: 'National ID Front View', url: app.national_id_document })}
                                                            className="p-1.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-lg text-xs font-semibold flex items-center gap-1"
                                                            title="Inspect National ID"
                                                        >
                                                            <ImageIcon size={13} />
                                                            <span>ID Front</span>
                                                        </button>
                                                    ) : (
                                                        <span className="text-[10px] text-slate-400 italic">No ID</span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="py-3.5 px-4 text-center">
                                                <button
                                                    onClick={() => {
                                                        setSelectedApp(app);
                                                        setComments(app.officer_comments || '');
                                                    }}
                                                    className="btn bg-amber-600 hover:bg-amber-700 text-white font-bold px-3 py-1.5 rounded-xl shadow-xs transition-all flex items-center justify-center gap-1.5 mx-auto text-xs active:scale-95 cursor-pointer"
                                                >
                                                    <Check size={14} />
                                                    <span>Review & Clear</span>
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Clearance & Comment Modal */}
            {selectedApp && (
                <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in duration-150">
                        <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
                            <div>
                                <h3 className="font-extrabold text-slate-900 text-lg">Clear Estates Dossier</h3>
                                <p className="text-xs text-slate-500">{selectedApp.reference_number} · {selectedApp.farm_name}</p>
                            </div>
                            <button
                                onClick={() => setSelectedApp(null)}
                                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center text-sm font-bold"
                            >
                                ✕
                            </button>
                        </div>

                        <div className="space-y-4 mb-6">
                            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/70 text-xs grid grid-cols-2 gap-2">
                                <div>
                                    <span className="text-slate-400 block text-[10px] uppercase font-bold">Farmer Name</span>
                                    <strong className="text-slate-900">{selectedApp.farmer_name || selectedApp.beneficiary_name} {selectedApp.farmer_surname || selectedApp.surname}</strong>
                                </div>
                                <div>
                                    <span className="text-slate-400 block text-[10px] uppercase font-bold">National ID</span>
                                    <strong className="text-slate-900 font-mono">{selectedApp.national_id}</strong>
                                </div>
                                <div>
                                    <span className="text-slate-400 block text-[10px] uppercase font-bold">Farm Extent</span>
                                    <strong className="text-slate-900">{selectedApp.farm_extent} Hectares</strong>
                                </div>
                                <div>
                                    <span className="text-slate-400 block text-[10px] uppercase font-bold">Category</span>
                                    <strong className="text-slate-900">{selectedApp.farm_category || 'A2 Commercial'}</strong>
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5 tracking-wider">
                                    Estates Officer Comment Box <span className="text-slate-400 font-normal">(Required / Audit Note)</span>
                                </label>
                                <textarea
                                    rows={3}
                                    value={comments}
                                    onChange={(e) => setComments(e.target.value)}
                                    placeholder="Enter verification remarks, tenure validity findings, or deed clearance notes..."
                                    className="input w-full p-3 text-xs rounded-xl border border-slate-300 focus:outline-amber-600 bg-white"
                                />
                            </div>
                        </div>

                        <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                            <button
                                type="button"
                                onClick={() => setSelectedApp(null)}
                                className="btn bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-xl text-xs font-bold"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleCommitClear}
                                disabled={actionLoading}
                                className="btn bg-amber-600 hover:bg-amber-700 text-white font-bold px-5 py-2 rounded-xl text-xs flex items-center gap-2 shadow-sm"
                            >
                                {actionLoading ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                                <span>Commit & Release to LIMS</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Document Viewer Modal */}
            {viewingDoc && (
                <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200">
                        <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
                            <h3 className="font-extrabold text-slate-900 text-base">{viewingDoc.title}</h3>
                            <button
                                onClick={() => setViewingDoc(null)}
                                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center text-sm font-bold"
                            >
                                ✕
                            </button>
                        </div>
                        <div className="max-h-[70vh] overflow-auto flex items-center justify-center p-4 bg-slate-100 rounded-2xl">
                            {viewingDoc.url.endsWith('.pdf') ? (
                                <iframe src={viewingDoc.url} title={viewingDoc.title} className="w-full h-96 rounded-xl" />
                            ) : (
                                <img src={viewingDoc.url} alt={viewingDoc.title} className="max-h-[60vh] max-w-full rounded-xl object-contain shadow-md" />
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

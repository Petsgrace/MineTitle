import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { recordLocalAuditLog } from '../../utils/offlineDB';
import {
    Compass, CheckCircle, RefreshCw, AlertCircle, Search,
    ArrowLeft, LogOut, MapPin, Loader2, Check, BellRing,
    HelpCircle, FileCheck, Map
} from 'lucide-react';

export default function SurveyorGeneralDashboard({ user }) {
    const navigate = useNavigate();
    const [applications, setApplications] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedApp, setSelectedApp] = useState(null);
    const [actionType, setActionType] = useState(''); // 'SURVEYED' | 'NOT_SURVEYED' | 'UNAVAILABLE'
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
            console.error('Surveyor General fetch error:', err);
            setErrorMessage('Unable to load Surveyor General queue from server.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchQueue();
    }, []);

    const handleCommitSurveyAction = async () => {
        if (!selectedApp || !actionType) return;

        setActionLoading(true);
        setErrorMessage('');
        setSuccessMessage('');
        try {
            const payload = {
                action_type: actionType,
                comments: comments.trim()
            };
            await api.post(`/applications/${selectedApp.id}/verify_surveyor/`, payload);

            let logAction = 'SURVEYED';
            let note = `Application ${selectedApp.reference_number} marked as SURVEYED and released to Valuation Officer.`;
            if (actionType === 'NOT_SURVEYED') {
                logAction = 'NOT_SURVEYED';
                note = `Notification pushed to applicant for ${selectedApp.reference_number}: Cadastral boundary survey required.`;
            } else if (actionType === 'UNAVAILABLE') {
                logAction = 'SURVEY_UNAVAILABLE';
                note = `Survey diagram records status recorded as NOT AVAILABLE for ${selectedApp.reference_number}.`;
            }

            recordLocalAuditLog({
                action_type: logAction,
                reference_number: selectedApp.reference_number,
                actor: user?.name || user?.username || 'Surveyor General Officer',
                stage: logAction,
                comment: comments.trim() || note
            });

            setSuccessMessage(note);
            setApplications(prev => prev.filter(item => item.id !== selectedApp.id));
            setIsActionModalOpen(false);
            setSelectedApp(null);
            setActionType('');
            setComments('');
        } catch (err) {
            console.error('Surveyor action error:', err);
            const msg = err.response?.data?.error || err.response?.data?.detail || 'Failed to commit survey action.';
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
        const farm = (app.farm_name || '').toLowerCase();
        const district = (app.district || '').toLowerCase();
        const plot = (app.subdivision_number || app.plot_number || '').toLowerCase();
        return ref.includes(query) || farm.includes(query) || district.includes(query) || plot.includes(query);
    });

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
                            <h1 className="text-xl font-extrabold text-slate-900">Surveyor General Dashboard</h1>
                            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-teal-100 text-teal-800 border border-teal-300">
                                Department of Surveyor General
                            </span>
                        </div>
                        <p className="text-xs text-slate-500">Stage 5: Cadastral Boundary, Coordinate Validation, & Technical Survey Queue</p>
                    </div>
                </div>

                <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
                    <div className="text-right hidden sm:block">
                        <div className="text-xs font-bold text-slate-800">{user?.name || user?.username}</div>
                        <div className="text-[10px] text-slate-500 uppercase tracking-wider">{user?.role || 'surveyor'}</div>
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
                            placeholder="Search by farm name, plot number, or district..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="input pl-10 pr-4 py-2 w-full text-sm rounded-xl border border-slate-300 focus:outline-teal-600 bg-white"
                        />
                    </div>
                    <div className="text-xs font-medium text-slate-600 self-end sm:self-center">
                        Total Pending in Surveyor General Queue: <strong className="text-slate-900 font-bold">{filtered.length}</strong>
                    </div>
                </div>

                {/* Queue Table */}
                <div className="bg-white rounded-2xl shadow-xs border border-slate-200 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs border-collapse">
                            <thead>
                                <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-600 uppercase font-bold tracking-wider">
                                    <th className="py-3 px-4">Ref Number</th>
                                    <th className="py-3 px-4">Farm Name</th>
                                    <th className="py-3 px-4">Plot / Subdivision No.</th>
                                    <th className="py-3 px-4">District & Province</th>
                                    <th className="py-3 px-4">Extent</th>
                                    <th className="py-3 px-4">Boundary Coordinates / GPS</th>
                                    <th className="py-3 px-4 text-center">Diagram Status</th>
                                    <th className="py-3 px-4 text-center">Surveyor General Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {loading ? (
                                    <tr>
                                        <td colSpan={8} className="py-12 text-center text-slate-400">
                                            <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-teal-600" />
                                            <span>Loading Surveyor General queue...</span>
                                        </td>
                                    </tr>
                                ) : filtered.length === 0 ? (
                                    <tr>
                                        <td colSpan={8} className="py-12 text-center text-slate-400">
                                            <Compass className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                                            <p className="font-semibold text-slate-600">No pending files in Surveyor General queue</p>
                                            <p className="text-[11px] text-slate-400 mt-1">All cleared files from ZLC have been processed or valuated.</p>
                                        </td>
                                    </tr>
                                ) : (
                                    filtered.map((app) => (
                                        <tr key={app.id} className="hover:bg-slate-50/80 transition-colors">
                                            <td className="py-3.5 px-4 font-mono font-bold text-teal-900">
                                                {app.reference_number}
                                            </td>
                                            <td className="py-3.5 px-4 font-bold text-slate-900">
                                                {app.farm_name}
                                            </td>
                                            <td className="py-3.5 px-4 font-semibold text-slate-800">
                                                {app.subdivision_number || app.plot_number || 'Plot 1'}
                                            </td>
                                            <td className="py-3.5 px-4 text-slate-700">
                                                {app.district}, {app.province}
                                            </td>
                                            <td className="py-3.5 px-4 font-mono font-bold text-slate-900">
                                                {parseFloat(app.farm_extent || 0).toFixed(2)} Ha
                                            </td>
                                            <td className="py-3.5 px-4">
                                                <div className="font-mono text-[11px] text-slate-700 max-w-[200px] truncate" title={JSON.stringify(app.boundary_coordinates || app.coordinate_data || 'GPS Attached')}>
                                                    {app.boundary_coordinates ? 'GeoJSON Polygon Attached' : (app.coordinate_data || 'Coordinates On File')}
                                                </div>
                                            </td>
                                            <td className="py-3.5 px-4 text-center">
                                                {app.is_surveyed ? (
                                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                                                        Surveyed
                                                    </span>
                                                ) : (
                                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                                                        Survey Audit Pending
                                                    </span>
                                                )}
                                            </td>
                                            <td className="py-3.5 px-4 text-center">
                                                <div className="flex items-center justify-center gap-1.5">
                                                    <button
                                                        onClick={() => {
                                                            setSelectedApp(app);
                                                            setActionType('SURVEYED');
                                                            setIsActionModalOpen(true);
                                                        }}
                                                        className="btn bg-teal-600 hover:bg-teal-700 text-white font-bold px-2.5 py-1 rounded-xl shadow-xs text-xs flex items-center gap-1 active:scale-95 cursor-pointer"
                                                        title="Mark as Surveyed & Release to Valuation"
                                                    >
                                                        <Check size={13} />
                                                        <span>Surveyed</span>
                                                    </button>
                                                    <button
                                                        onClick={() => {
                                                            setSelectedApp(app);
                                                            setActionType('NOT_SURVEYED');
                                                            setIsActionModalOpen(true);
                                                        }}
                                                        className="btn bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 font-bold px-2.5 py-1 rounded-xl text-xs flex items-center gap-1 active:scale-95 cursor-pointer"
                                                        title="Notify Applicant: Survey Required"
                                                    >
                                                        <BellRing size={13} />
                                                        <span>Not Surveyed</span>
                                                    </button>
                                                    <button
                                                        onClick={() => {
                                                            setSelectedApp(app);
                                                            setActionType('UNAVAILABLE');
                                                            setIsActionModalOpen(true);
                                                        }}
                                                        className="btn bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 font-bold px-2.5 py-1 rounded-xl text-xs flex items-center gap-1 active:scale-95 cursor-pointer"
                                                        title="Record Survey Status Not Available"
                                                    >
                                                        <HelpCircle size={13} />
                                                        <span>Unavailable</span>
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

            {/* Action Confirmation Modal */}
            {isActionModalOpen && selectedApp && (
                <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
                        <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
                            <div>
                                <h3 className="font-extrabold text-slate-900 text-base">
                                    {actionType === 'SURVEYED' && 'Certify Cadastral Survey'}
                                    {actionType === 'NOT_SURVEYED' && 'Notify Applicant: Survey Required'}
                                    {actionType === 'UNAVAILABLE' && 'Survey Status Not Available'}
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
                            {actionType === 'SURVEYED' ? (
                                <p className="text-teal-900 bg-teal-50 p-3 rounded-xl border border-teal-200">
                                    Confirm that the cadastral survey diagram for <strong>{selectedApp.farm_name}</strong> has been audited and approved. This commits the boundary data and releases the file directly to the <strong>Valuation Officer</strong>.
                                </p>
                            ) : actionType === 'NOT_SURVEYED' ? (
                                <p className="text-amber-900 bg-amber-50 p-3 rounded-xl border border-amber-200">
                                    Marking as <strong>"Not Surveyed"</strong> will update tracking and dispatch an immediate push notification to the applicant informing them that a physical ground survey is mandatory prior to deed issuance.
                                </p>
                            ) : (
                                <p className="text-slate-700 bg-slate-100 p-3 rounded-xl border border-slate-200">
                                    Record that the survey status is currently <strong>Not Available</strong> in the archival database. A notification note will be appended.
                                </p>
                            )}

                            <div>
                                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                                    Surveyor General Notes
                                </label>
                                <textarea
                                    rows={2}
                                    value={comments}
                                    onChange={(e) => setComments(e.target.value)}
                                    placeholder="Enter survey diagram number, coordinate system, or notification remarks..."
                                    className="input w-full p-2.5 rounded-xl border border-slate-300 focus:outline-teal-600 bg-white"
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
                                onClick={handleCommitSurveyAction}
                                disabled={actionLoading}
                                className={`btn font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 shadow-sm text-white ${
                                    actionType === 'SURVEYED' ? 'bg-teal-600 hover:bg-teal-700' :
                                    actionType === 'NOT_SURVEYED' ? 'bg-amber-600 hover:bg-amber-700' : 'bg-slate-600 hover:bg-slate-700'
                                }`}
                            >
                                {actionLoading ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                                <span>Commit Action</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { recordLocalAuditLog } from '../../utils/offlineDB';
import {
    Receipt, CheckCircle, RefreshCw, AlertCircle, Search,
    ArrowLeft, LogOut, FileText, User, Phone, MapPin, Loader2, Check
} from 'lucide-react';

export default function AccountsDashboard({ user }) {
    const navigate = useNavigate();
    const [applications, setApplications] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedApp, setSelectedApp] = useState(null);
    const [actionLoading, setActionLoading] = useState(false);
    const [successMessage, setSuccessMessage] = useState('');
    const [errorMessage, setErrorMessage] = useState('');

    const fetchQueue = async () => {
        setLoading(true);
        setErrorMessage('');
        try {
            const res = await api.get('/applications/');
            // The backend queryset and serializer strictly filter records and fields for 'accounts'
            const records = Array.isArray(res.data) ? res.data : (res.data?.results || []);
            setApplications(records);
        } catch (err) {
            console.error('Accounts fetch error:', err);
            setErrorMessage('Unable to load queue from server. Please check your network connection.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchQueue();
    }, []);

    const handleCommitPaid = async (app) => {
        setActionLoading(true);
        setErrorMessage('');
        setSuccessMessage('');
        try {
            const payload = { is_paid: true };
            const res = await api.post(`/applications/${app.id}/verify_accounts/`, payload);
            
            recordLocalAuditLog({
                action_type: 'ACCOUNTS_PAID',
                reference_number: app.reference_number,
                actor: user?.name || user?.username || 'Accounts Officer',
                stage: 'ACCOUNTS_CLEARED',
                comment: `Application fee ($10) verified as PAID. Released to Estates Officer.`
            });

            setSuccessMessage(`Application ${app.reference_number} marked as PAID and successfully released to Estates Officer queue.`);
            setSelectedApp(null);
            // Refresh local queue
            setApplications(prev => prev.filter(item => item.id !== app.id));
        } catch (err) {
            console.error('Verify fee error:', err);
            const msg = err.response?.data?.error || err.response?.data?.detail || 'Failed to commit payment status. Please try again.';
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
        const receipt = (app.receipt_number || '').toLowerCase();
        const name = (app.beneficiary_name || app.farmer_name || '').toLowerCase();
        const surname = (app.surname || app.farmer_surname || '').toLowerCase();
        const id = (app.national_id || '').toLowerCase();
        const farm = (app.farm_name || '').toLowerCase();
        return ref.includes(query) || receipt.includes(query) || name.includes(query) || surname.includes(query) || id.includes(query) || farm.includes(query);
    });

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
                            <h1 className="text-xl font-extrabold text-slate-900">Accounts Officer Dashboard</h1>
                            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                                Accounts & Finance
                            </span>
                        </div>
                        <p className="text-xs text-slate-500">Stage 1: Statutory Application Fee Verification Queue ($10.00 USD)</p>
                    </div>
                </div>

                <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
                    <div className="text-right hidden sm:block">
                        <div className="text-xs font-bold text-slate-800">{user?.name || user?.username}</div>
                        <div className="text-[10px] text-slate-500 uppercase tracking-wider">{user?.role || 'accounts'}</div>
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
                            placeholder="Search by receipt, beneficiary, ID, or farm..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="input pl-10 pr-4 py-2 w-full text-sm rounded-xl border border-slate-300 focus:outline-emerald-600 bg-white"
                        />
                    </div>
                    <div className="text-xs font-medium text-slate-600 self-end sm:self-center">
                        Total Pending in Queue: <strong className="text-slate-900 font-bold">{filtered.length}</strong>
                    </div>
                </div>

                {/* Queue Table */}
                <div className="bg-white rounded-2xl shadow-xs border border-slate-200 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs border-collapse">
                            <thead>
                                <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-600 uppercase font-bold tracking-wider">
                                    <th className="py-3 px-4">Receipt Number</th>
                                    <th className="py-3 px-4">Beneficiary Name</th>
                                    <th className="py-3 px-4">Surname</th>
                                    <th className="py-3 px-4">National ID</th>
                                    <th className="py-3 px-4">Phone Number</th>
                                    <th className="py-3 px-4">Farm Name</th>
                                    <th className="py-3 px-4">Plot / Subdiv No.</th>
                                    <th className="py-3 px-4 text-center">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {loading ? (
                                    <tr>
                                        <td colSpan={8} className="py-12 text-center text-slate-400">
                                            <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-emerald-600" />
                                            <span>Loading Accounts queue...</span>
                                        </td>
                                    </tr>
                                ) : filtered.length === 0 ? (
                                    <tr>
                                        <td colSpan={8} className="py-12 text-center text-slate-400">
                                            <Receipt className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                                            <p className="font-semibold text-slate-600">No pending files in Accounts queue</p>
                                            <p className="text-[11px] text-slate-400 mt-1">All statutory payments have been processed or released to Estates.</p>
                                        </td>
                                    </tr>
                                ) : (
                                    filtered.map((app) => (
                                        <tr key={app.id} className="hover:bg-slate-50/80 transition-colors">
                                            <td className="py-3.5 px-4 font-mono font-bold text-emerald-800">
                                                {app.receipt_number || <span className="text-amber-600">REC-PENDING</span>}
                                            </td>
                                            <td className="py-3.5 px-4 font-medium text-slate-900">
                                                {app.beneficiary_name || app.farmer_name || 'N/A'}
                                            </td>
                                            <td className="py-3.5 px-4 font-medium text-slate-900">
                                                {app.surname || app.farmer_surname || 'N/A'}
                                            </td>
                                            <td className="py-3.5 px-4 font-mono text-slate-700">
                                                {app.national_id || 'N/A'}
                                            </td>
                                            <td className="py-3.5 px-4 text-slate-700">
                                                {app.phone_number || app.telephone || 'N/A'}
                                            </td>
                                            <td className="py-3.5 px-4 font-semibold text-slate-800">
                                                {app.farm_name || 'N/A'}
                                            </td>
                                            <td className="py-3.5 px-4 text-slate-700">
                                                {app.subdivision_number || app.plot_number || app.farm_id || 'Plot 1'}
                                            </td>
                                            <td className="py-3.5 px-4 text-center">
                                                <button
                                                    onClick={() => handleCommitPaid(app)}
                                                    disabled={actionLoading}
                                                    className="btn bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3.5 py-1.5 rounded-xl shadow-xs transition-all flex items-center justify-center gap-1.5 mx-auto text-xs active:scale-95 cursor-pointer"
                                                >
                                                    <Check size={14} />
                                                    <span>Paid</span>
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Statutory Regulatory Notice */}
                <div className="mt-6 p-4 bg-emerald-50/60 border border-emerald-200/80 rounded-2xl flex items-start gap-3 text-xs text-emerald-900">
                    <Receipt className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
                    <div>
                        <strong className="font-bold">Accounts Officer Mandatory Workflow:</strong> Beneficiaries appear in this queue upon initial application lodgement. Clicking the <strong>"Paid"</strong> button verifies the $10.00 USD statutory fee, records an immutable audit entry in the ledger, and permanently releases the file forward to the <strong>Estates Officer</strong>.
                    </div>
                </div>
            </div>
        </div>
    );
}

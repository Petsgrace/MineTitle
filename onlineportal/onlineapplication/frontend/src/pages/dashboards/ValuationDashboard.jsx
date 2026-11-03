import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { recordLocalAuditLog } from '../../utils/offlineDB';
import {
    Calculator, CheckCircle, RefreshCw, AlertCircle, Search,
    ArrowLeft, LogOut, DollarSign, Award, Shield, Loader2,
    Check, Lock, AlertTriangle, Building, Droplets
} from 'lucide-react';

export default function ValuationDashboard({ user }) {
    const navigate = useNavigate();
    const [applications, setApplications] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedApp, setSelectedApp] = useState(null);
    const [manualPrice, setManualPrice] = useState('');
    const [priceReason, setPriceReason] = useState('');
    const [comments, setComments] = useState('');
    const [isValuationModalOpen, setIsValuationModalOpen] = useState(false);
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
            console.error('Valuation fetch error:', err);
            setErrorMessage('Unable to load Valuation queue from server.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchQueue();
    }, []);

    const handleCommitValuation = async () => {
        if (!selectedApp) return;

        setActionLoading(true);
        setErrorMessage('');
        setSuccessMessage('');
        try {
            const payload = {
                officer_comments: comments.trim(),
                manual_price: manualPrice ? parseFloat(manualPrice) : null,
                price_override_reason: priceReason.trim()
            };
            const res = await api.post(`/applications/${selectedApp.id}/set_valuation/`, payload);

            recordLocalAuditLog({
                action_type: 'VALUATION_COMMITTED',
                reference_number: selectedApp.reference_number,
                actor: user?.name || user?.username || 'Valuation Officer',
                stage: 'VALUATED',
                comment: comments.trim() || `Valuation committed. Land value: $${res.data?.calculated_land_value || selectedApp.calculated_land_value || '0.00'}. Purchase price: $${res.data?.purchase_price || '0.00'}.`
            });

            setSuccessMessage(`Application ${selectedApp.reference_number} valuation successfully committed. Released for Agreement of Sale & Deed Issuance.`);
            setApplications(prev => prev.filter(item => item.id !== selectedApp.id));
            setIsValuationModalOpen(false);
            setSelectedApp(null);
            setManualPrice('');
            setPriceReason('');
            setComments('');
        } catch (err) {
            console.error('Valuation commit error:', err);
            const msg = err.response?.data?.error || err.response?.data?.detail || 'Failed to commit valuation.';
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
        const name = (app.farmer_name || '').toLowerCase();
        const farm = (app.farm_name || '').toLowerCase();
        const district = (app.district || '').toLowerCase();
        return ref.includes(query) || name.includes(query) || farm.includes(query) || district.includes(query);
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
                            <h1 className="text-xl font-extrabold text-slate-900">Valuation Officer Dashboard</h1>
                            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                                Valuations & Property Appraisal
                            </span>
                        </div>
                        <p className="text-xs text-slate-500">Stage 6: Land Valuation, Concessions Appraisal, & Purchase Price Calculation Queue</p>
                    </div>
                </div>

                <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
                    <div className="text-right hidden sm:block">
                        <div className="text-xs font-bold text-slate-800">{user?.name || user?.username}</div>
                        <div className="text-[10px] text-slate-500 uppercase tracking-wider">{user?.role || 'valuation'}</div>
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
                            placeholder="Search by farm name, farmer, district, or ref..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="input pl-10 pr-4 py-2 w-full text-sm rounded-xl border border-slate-300 focus:outline-emerald-600 bg-white"
                        />
                    </div>
                    <div className="text-xs font-medium text-slate-600 self-end sm:self-center">
                        Total Pending in Valuation Queue: <strong className="text-slate-900 font-bold">{filtered.length}</strong>
                    </div>
                </div>

                {/* Queue Table */}
                <div className="bg-white rounded-2xl shadow-xs border border-slate-200 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs border-collapse">
                            <thead>
                                <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-600 uppercase font-bold tracking-wider">
                                    <th className="py-3 px-4">Ref Number</th>
                                    <th className="py-3 px-4">Farm & Location</th>
                                    <th className="py-3 px-4">Extent / Arable</th>
                                    <th className="py-3 px-4">Ecological Region</th>
                                    <th className="py-3 px-4">Concessions</th>
                                    <th className="py-3 px-4">Land & Improvements</th>
                                    <th className="py-3 px-4 text-center">Purchase Price</th>
                                    <th className="py-3 px-4 text-center">Appraisal Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {loading ? (
                                    <tr>
                                        <td colSpan={8} className="py-12 text-center text-slate-400">
                                            <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-emerald-600" />
                                            <span>Loading Valuation appraisal queue...</span>
                                        </td>
                                    </tr>
                                ) : filtered.length === 0 ? (
                                    <tr>
                                        <td colSpan={8} className="py-12 text-center text-slate-400">
                                            <Calculator className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                                            <p className="font-semibold text-slate-600">No pending files in Valuation queue</p>
                                            <p className="text-[11px] text-slate-400 mt-1">All surveyed files have been appraised or released for sale agreements.</p>
                                        </td>
                                    </tr>
                                ) : (
                                    filtered.map((app) => (
                                        <tr key={app.id} className="hover:bg-slate-50/80 transition-colors">
                                            <td className="py-3.5 px-4 font-mono font-bold text-emerald-900">
                                                {app.reference_number}
                                            </td>
                                            <td className="py-3.5 px-4">
                                                <div className="font-bold text-slate-900">{app.farm_name}</div>
                                                <div className="text-[10px] text-slate-500">{app.district}, {app.province} · Plot {app.subdivision_number || '1'}</div>
                                            </td>
                                            <td className="py-3.5 px-4 font-mono">
                                                <div className="font-bold text-slate-900">{parseFloat(app.farm_extent || 0).toFixed(2)} Ha</div>
                                                <div className="text-[10px] text-slate-500">Arable: {parseFloat(app.arable_area || 0).toFixed(2)} Ha</div>
                                            </td>
                                            <td className="py-3.5 px-4 text-slate-700">
                                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-800 border border-slate-200">
                                                    Region {app.ecological_region || 'II'}
                                                </span>
                                            </td>
                                            <td className="py-3.5 px-4">
                                                <div className="flex flex-col gap-0.5">
                                                    {app.is_war_veteran && (
                                                        <span className="inline-flex items-center gap-1 text-[10px] font-extrabold text-amber-800 bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200">
                                                            <Award size={10} /> War Veteran Concession
                                                        </span>
                                                    )}
                                                    {app.is_civil_servant && (
                                                        <span className="inline-flex items-center gap-1 text-[10px] font-extrabold text-blue-800 bg-blue-50 px-1.5 py-0.2 rounded border border-blue-200">
                                                            <Building size={10} /> Civil Service ({app.civil_service_years || 0} yrs)
                                                        </span>
                                                    )}
                                                    {!app.is_war_veteran && !app.is_civil_servant && (
                                                        <span className="text-[10px] text-slate-400 italic">Standard Tariff</span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="py-3.5 px-4 font-mono text-slate-800">
                                                <div>Land: ${parseFloat(app.calculated_land_value || 0).toLocaleString()}</div>
                                                <div className="text-[10px] text-slate-500">Imprv: ${parseFloat(app.improvements_value || 0).toLocaleString()}</div>
                                            </td>
                                            <td className="py-3.5 px-4 font-mono font-extrabold text-emerald-800 text-sm text-center">
                                                ${parseFloat(app.purchase_price || 0).toLocaleString()}
                                            </td>
                                            <td className="py-3.5 px-4 text-center">
                                                <button
                                                    onClick={() => {
                                                        setSelectedApp(app);
                                                        setManualPrice(app.purchase_price ? String(app.purchase_price) : '');
                                                        setComments(app.officer_comments || '');
                                                        setIsValuationModalOpen(true);
                                                    }}
                                                    className="btn bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-1.5 rounded-xl shadow-xs transition-all flex items-center justify-center gap-1 text-xs mx-auto active:scale-95 cursor-pointer"
                                                >
                                                    <Calculator size={13} />
                                                    <span>Commit Valuation</span>
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

            {/* Valuation Appraisal Modal */}
            {isValuationModalOpen && selectedApp && (
                <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200">
                        <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
                            <div>
                                <h3 className="font-extrabold text-slate-900 text-base">Commit Property Valuation</h3>
                                <p className="text-xs text-slate-500">{selectedApp.reference_number} · {selectedApp.farm_name}</p>
                            </div>
                            <button
                                onClick={() => setIsValuationModalOpen(false)}
                                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center text-sm font-bold"
                            >
                                ✕
                            </button>
                        </div>

                        <div className="space-y-4 mb-6 text-xs">
                            {/* Property Details Grid */}
                            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/70 grid grid-cols-2 gap-2 text-slate-700">
                                <div>
                                    <span className="text-[10px] text-slate-400 uppercase font-bold block">Farm Extent</span>
                                    <strong className="text-slate-900 font-mono">{selectedApp.farm_extent} Ha</strong>
                                </div>
                                <div>
                                    <span className="text-[10px] text-slate-400 uppercase font-bold block">Ecological Region</span>
                                    <strong className="text-slate-900">Region {selectedApp.ecological_region || 'II'}</strong>
                                </div>
                                <div>
                                    <span className="text-[10px] text-slate-400 uppercase font-bold block">Nearest Town</span>
                                    <strong className="text-slate-900">{selectedApp.nearest_town || 'Harare'} ({selectedApp.distance_to_town || 0} km)</strong>
                                </div>
                                <div>
                                    <span className="text-[10px] text-slate-400 uppercase font-bold block">Water Distance</span>
                                    <strong className="text-slate-900">{selectedApp.water_source_distance || '< 1 km'}</strong>
                                </div>
                            </div>

                            {/* Statutory Concessions Banner */}
                            <div className="p-3 bg-amber-50 rounded-xl border border-amber-200/80">
                                <div className="font-bold text-amber-900 flex items-center gap-1.5 mb-1">
                                    <Award size={14} className="text-amber-700" />
                                    <span>Concession Eligibility Status</span>
                                </div>
                                <div className="text-[11px] text-amber-800 space-y-0.5">
                                    <p>• War Veteran: <strong>{selectedApp.is_war_veteran ? `YES (No. ${selectedApp.war_vet_number || 'Verified'})` : 'No'}</strong></p>
                                    <p>• Civil Servant: <strong>{selectedApp.is_civil_servant ? `YES (${selectedApp.civil_service_years || 0} years of service)` : 'No'}</strong></p>
                                </div>
                            </div>

                            {/* Price Breakdown */}
                            <div className="bg-emerald-50/80 p-3.5 rounded-xl border border-emerald-200 flex items-center justify-between">
                                <div>
                                    <span className="text-[10px] text-emerald-800 uppercase font-bold block">Calculated Purchase Price</span>
                                    <span className="text-xs text-emerald-700">Includes tariff discounts & improvements</span>
                                </div>
                                <div className="text-right">
                                    <span className="text-lg font-black text-emerald-950 font-mono">
                                        ${parseFloat(selectedApp.purchase_price || 0).toLocaleString()} USD
                                    </span>
                                </div>
                            </div>

                            {/* Manual Valuation Override (Optional) */}
                            <div>
                                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                                    Manual Price Override <span className="text-slate-400 font-normal">(Optional)</span>
                                </label>
                                <div className="relative">
                                    <DollarSign size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                    <input
                                        type="number"
                                        step="0.01"
                                        value={manualPrice}
                                        onChange={(e) => setManualPrice(e.target.value)}
                                        placeholder="Enter revised total price if applicable..."
                                        className="input pl-8 pr-3 py-2 w-full text-xs rounded-xl border border-slate-300 focus:outline-emerald-600 bg-white"
                                    />
                                </div>
                            </div>

                            {manualPrice && (
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                                        Reason for Price Adjustment <span className="text-rose-600">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        value={priceReason}
                                        onChange={(e) => setPriceReason(e.target.value)}
                                        placeholder="e.g. Additional registered boreholes / soil quality adjustment"
                                        className="input w-full p-2.5 text-xs rounded-xl border border-slate-300 focus:outline-emerald-600 bg-white"
                                        required
                                    />
                                </div>
                            )}

                            <div>
                                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                                    Valuation Officer Remarks
                                </label>
                                <textarea
                                    rows={2}
                                    value={comments}
                                    onChange={(e) => setComments(e.target.value)}
                                    placeholder="Enter appraisal certification notes..."
                                    className="input w-full p-2.5 text-xs rounded-xl border border-slate-300 focus:outline-emerald-600 bg-white"
                                />
                            </div>
                        </div>

                        <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                            <button
                                type="button"
                                onClick={() => setIsValuationModalOpen(false)}
                                className="btn bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-xl text-xs font-bold"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleCommitValuation}
                                disabled={actionLoading || (manualPrice && !priceReason.trim())}
                                className="btn bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 shadow-sm"
                            >
                                {actionLoading ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                                <span>Commit Valuation</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}


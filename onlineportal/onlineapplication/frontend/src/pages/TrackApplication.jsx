import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import { getQueue } from '../utils/offlineDB';
import { 
  ShieldCheck, 
  Search, 
  Lock, 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  FileText, 
  MapPin, 
  ChevronLeft,
  RefreshCw,
  Receipt,
  IdCard,
  Hash
} from 'lucide-react';

const APPLICATION_STAGES = [
  { key: 'PENDING', label: '1. Submitted / Resettlement Verification' },
  { key: 'RESETTLEMENT_VERIFIED', label: '2. LIMS Cadastral & Fee Audit' },
  { key: 'LIMS_VERIFIED', label: '3. ZLC Dispute & Tenure Clearance' },
  { key: 'ZLC_CLEARED', label: '4. GIS Spatial Boundary Validation' },
  { key: 'GIS_VALIDATED', label: '5. Surveyor General Diagram Approval' },
  { key: 'SURVEY_APPROVED', label: '6. Estates Land Valuation' },
  { key: 'VALUATION_APPROVED', label: '7. Accounts & Finance Clearance' },
  { key: 'DIRECTOR_APPROVED', label: '8. Executive Director Sign-Off' },
  { key: 'DEED_ISSUED', label: '9. Deeds Registry — Title Deed Issued' },
];

const STAGE_ALIASES = {
  SUBMITTED: 0,
  PENDING: 0,
  PENDING_LIMS: 1,
  RESETTLEMENT_VERIFIED: 1,
  PENDING_ZLC: 2,
  LIMS_VERIFIED: 2,
  ZLC_CLEARED: 3,
  PENDING_SURVEY: 4,
  GIS_VALIDATED: 4,
  PENDING_ESTATES: 5,
  SURVEY_APPROVED: 5,
  PENDING_FINANCE: 6,
  AWAITING_PAYMENT: 6,
  VALUATION_APPROVED: 6,
  PENDING_DEEDS: 7,
  DIRECTOR_APPROVED: 7,
  APPROVED: 8,
  ISSUED: 8,
  DEED_ISSUED: 8,
};

function buildLocalTrackResult(app, fallbackRef = '') {
  const statusUpper = String(app.status || 'PENDING').toUpperCase();
  const currIdx = STAGE_ALIASES[statusUpper] !== undefined ? STAGE_ALIASES[statusUpper] : 0;
  const timeline = APPLICATION_STAGES.map((st, idx) => ({
    stage: idx + 1,
    key: st.key,
    label: st.label,
    state: idx < currIdx ? 'COMPLETED' : idx === currIdx ? 'CURRENT' : 'PENDING',
  }));

  return {
    success: true,
    reference_number: app.reference_number || fallbackRef || `APP-${String(app.id || '00001').padStart(5, '0')}`,
    receipt_number: app.statutory_fee_receipt || app.receipt_number || app.receiptNumber || 'N/A',
    farm_name: app.farm_name || 'Registered Land Parcel',
    district: app.district || 'Zimbabwe',
    province: app.province || 'Zimbabwe',
    status: app.status || 'PENDING',
    status_display: APPLICATION_STAGES[currIdx]?.label || app.status || 'PENDING',
    current_stage: currIdx + 1,
    total_stages: APPLICATION_STAGES.length,
    has_disputes: Boolean(app.has_disputes),
    timeline,
    updated_at: app.updated_at || app.created_at || app.timestamp || new Date().toISOString(),
  };
}

export default function TrackApplication() {
  const [nationalId, setNationalId] = useState('');
  const [refNumber, setRefNumber] = useState('');
  const [receiptNumber, setReceiptNumber] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [trackResult, setTrackResult] = useState(null);

  const normalizeToken = (val) => String(val || '').trim().toUpperCase().replace(/[\s-]/g, '');

  const findLocalMatchingApplication = async (natIdInput, refInput, receiptInput) => {
    const normNat = normalizeToken(natIdInput);
    const normRef = normalizeToken(refInput);
    const normReceipt = normalizeToken(receiptInput);

    // 1. Check my_submitted_applications in localStorage
    try {
      const localApps = JSON.parse(localStorage.getItem('my_submitted_applications') || '[]');
      if (Array.isArray(localApps)) {
        const match = localApps.find((app) => {
          if (!app || typeof app !== 'object') return false;
          const appNat = normalizeToken(app.national_id || app.walk_in_national_id || '');
          const appRef = normalizeToken(app.reference_number || `APP-${String(app.id || '').padStart(5, '0')}`);
          const appIdRaw = normalizeToken(String(app.id || ''));
          const appReceipt = normalizeToken(app.statutory_fee_receipt || app.receipt_number || '');

          const natMatches = appNat && appNat === normNat;
          const receiptMatches = appReceipt && appReceipt === normReceipt;
          const refMatches = !appRef || appRef === normRef || (appIdRaw && normRef.endsWith(appIdRaw));

          return natMatches && receiptMatches && refMatches;
        });
        if (match) return match;
      }
    } catch (e) {
      // Ignore storage parse error
    }

    // 2. Check IndexedDB offline-queue (for applications queued with camera photos)
    try {
      const queuedItems = await getQueue();
      if (Array.isArray(queuedItems)) {
        for (let i = queuedItems.length - 1; i >= 0; i--) {
          const item = queuedItems[i];
          const body = typeof item?.body === 'string' ? JSON.parse(item.body) : item?.body;
          if (body && typeof body === 'object') {
            const qNat = normalizeToken(body.national_id || body.walk_in_national_id || '');
            const qReceipt = normalizeToken(body.statutory_fee_receipt || body.receipt_number || '');
            const qRef = normalizeToken(body.reference_number || '');
            const natMatches = qNat && qNat === normNat;
            const receiptMatches = !qReceipt || qReceipt === normReceipt;
            const refMatches = !qRef || qRef === normRef;
            if (natMatches && receiptMatches && refMatches) {
              return {
                ...body,
                reference_number: body.reference_number || refInput.trim().toUpperCase(),
                statutory_fee_receipt: body.statutory_fee_receipt || receiptInput.trim().toUpperCase(),
                created_at: item.timestamp,
              };
            }
          }
        }
      }
    } catch (e) {
      // Ignore IndexedDB error
    }

    // 3. Check td_payment_records_archive in localStorage (archived statutory fee receipts)
    try {
      const payments = JSON.parse(localStorage.getItem('td_payment_records_archive') || '[]');
      if (Array.isArray(payments)) {
        const payMatch = payments.find((p) => {
          if (!p || typeof p !== 'object') return false;
          const pReceipt = normalizeToken(p.receiptNumber || p.receipt_number || '');
          const pNat = normalizeToken(p.nationalId || p.national_id || '');
          return pReceipt === normReceipt && (!pNat || pNat === normNat);
        });
        if (payMatch) {
          return {
            reference_number: refInput.trim().toUpperCase(),
            statutory_fee_receipt: payMatch.receiptNumber || receiptInput.trim().toUpperCase(),
            national_id: natIdInput.trim().toUpperCase(),
            farm_name: payMatch.farmName || 'Submitted Land Parcel',
            district: payMatch.district || 'Submitted on Device',
            province: 'Zimbabwe',
            status: 'PENDING',
            created_at: payMatch.timestamp,
          };
        }
      }
    } catch (e) {
      // Ignore payment archive error
    }

    return null;
  };

  const handleTrack = async (e) => {
    e.preventDefault();
    if (!nationalId.trim() || !refNumber.trim() || !receiptNumber.trim()) {
      setError('Please fill in all 3 security verification fields (National ID, Reference No., and Receipt Number).');
      return;
    }

    setLoading(true);
    setError(null);

    // First check local device records so offline/tablet submissions resolve immediately
    const localFirst = await findLocalMatchingApplication(nationalId, refNumber, receiptNumber);

    try {
      const response = await api.post('/track/', {
        national_id: nationalId.trim(),
        reference_number: refNumber.trim(),
        receipt_number: receiptNumber.trim(),
        pin: receiptNumber.trim(),
      });

      const data = response.data;
      if (data && typeof data === 'object' && (data.reference_number || data.timeline)) {
        setTrackResult({
          ...data,
          total_stages: data.total_stages || (data.timeline ? data.timeline.length : 9),
        });
        return;
      }

      if (localFirst) {
        setTrackResult(buildLocalTrackResult(localFirst, refNumber.trim().toUpperCase()));
        return;
      }

      setError('Invalid verification details provided. Please check your National ID, Reference No., and Receipt Number.');
      setTrackResult(null);
    } catch (err) {
      if (localFirst) {
        setTrackResult(buildLocalTrackResult(localFirst, refNumber.trim().toUpperCase()));
      } else {
        const backendError = err.response?.data?.error;
        const cleanMessage = (typeof backendError === 'string' && !backendError.includes('<!doctype'))
          ? backendError
          : 'No matching application found. Please verify your National ID, Reference No., and Receipt Number.';
        setError(cleanMessage);
        setTrackResult(null);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setTrackResult(null);
    setError(null);
    setReceiptNumber('');
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col justify-between p-4 sm:p-8">
      {/* Background Subtle Gradient Blobs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl"></div>
        <div className="absolute top-1/2 -right-40 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl"></div>
      </div>

      <div className="relative z-10 max-w-4xl mx-auto w-full py-6">
        {/* Header Bar */}
        <div className="flex items-center justify-between mb-8 pb-4 border-b border-slate-800">
          <Link 
            to="/" 
            className="flex items-center gap-2 text-gray-700 hover:text-emerald-700 transition-colors text-sm font-medium"
          >
            <ChevronLeft className="w-4 h-4" />
            Back to Home
          </Link>
          <div className="flex items-center gap-2 text-emerald-700 font-semibold text-sm">
            <ShieldCheck className="w-5 h-5" />
            Ministry of Lands — Citizen Portal
          </div>
        </div>

        {/* Title Section */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-700 text-xs font-semibold uppercase tracking-wider mb-3 border border-emerald-500/20">
            <Lock className="w-3.5 h-3.5" /> 3-Factor Secure Verification
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-tight" style={{ color: '#111827' }}>
            Track Title Deed Application
          </h1>
          <p className="text-gray-600 mt-2 text-sm sm:text-base max-w-xl mx-auto" style={{ color: '#4b5563' }}>
            Check the real-time status of your land title deed processing across all government departments.
          </p>
        </div>

        {/* Confidentiality Warning Card */}
        <div className="mb-8 p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-800 text-xs sm:text-sm flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <strong className="font-semibold text-amber-800" style={{ color: '#92400e' }}>Confidentiality & Fraud Warning:</strong>
            <p className="mt-1 text-gray-700 leading-relaxed" style={{ color: '#374151' }}>
              Your <strong>Reference Number</strong> and <strong>Receipt Number</strong> are strictly confidential. 
              Do not share them with third parties or unofficial agents. The Ministry of Lands will never contact you asking for your payment receipt credentials.
            </p>
          </div>
        </div>

        {/* Main Verification Card / Form */}
        {!trackResult ? (
          <div className="bg-slate-800/80 backdrop-blur-xl border border-slate-700/80 rounded-2xl p-6 sm:p-8 shadow-2xl">
            <form onSubmit={handleTrack} className="space-y-6">
              {error && (
                <div className="p-4 rounded-lg bg-rose-500/10 border border-rose-500/30 text-red-700 text-sm flex items-center gap-3">
                  <AlertTriangle className="w-5 h-5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                {/* 1. National ID */}
                <div>
                  <label className="block text-xs font-semibold text-gray-900 uppercase tracking-wider mb-2 flex items-center gap-1.5" style={{ color: '#111827', fontWeight: '700' }}>
                    <IdCard className="w-4 h-4 text-emerald-600" />
                    1. National ID
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 63-123456-A-63"
                    value={nationalId}
                    onChange={(e) => setNationalId(e.target.value)}
                    style={{ color: '#111827', backgroundColor: '#ffffff' }}
                    className="w-full bg-white border border-gray-300 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all uppercase"
                  />
                </div>

                {/* 2. Reference Number */}
                <div>
                  <label className="block text-xs font-semibold text-gray-900 uppercase tracking-wider mb-2 flex items-center gap-1.5" style={{ color: '#111827', fontWeight: '700' }}>
                    <Hash className="w-4 h-4 text-emerald-600" />
                    2. Reference No.
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. TD-2026-00005"
                    value={refNumber}
                    onChange={(e) => setRefNumber(e.target.value)}
                    style={{ color: '#111827', backgroundColor: '#ffffff' }}
                    className="w-full bg-white border border-gray-300 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all uppercase"
                  />
                </div>

                {/* 3. Receipt Number */}
                <div>
                  <label className="block text-xs font-semibold text-gray-900 uppercase tracking-wider mb-2 flex items-center gap-1.5" style={{ color: '#111827', fontWeight: '700' }}>
                    <Receipt className="w-4 h-4 text-emerald-600" />
                    3. Receipt Number
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. TD-20261101-XXXXXX"
                    value={receiptNumber}
                    onChange={(e) => setReceiptNumber(e.target.value)}
                    style={{ color: '#111827', backgroundColor: '#ffffff' }}
                    className="w-full bg-white border border-gray-300 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all uppercase font-mono"
                  />
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="track-submit-btn"
                  style={{
                    background: 'linear-gradient(135deg, #059669 0%, #0d9488 100%)',
                    color: '#ffffff',
                    fontWeight: '700',
                    fontSize: '0.95rem',
                    padding: '0.875rem 1.5rem',
                    borderRadius: '0.75rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.5rem',
                    width: '100%',
                    border: 'none',
                    cursor: loading ? 'not-allowed' : 'pointer',
                    boxShadow: '0 4px 14px rgba(5, 150, 105, 0.4)',
                    transition: 'all 0.2s ease',
                  }}
                >
                  {loading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin text-white" style={{ color: '#ffffff' }} />
                      <span style={{ color: '#ffffff', fontWeight: '700' }}>Verifying Security Credentials...</span>
                    </>
                  ) : (
                    <>
                      <Search className="w-4 h-4 text-white" style={{ color: '#ffffff' }} />
                      <span style={{ color: '#ffffff', fontWeight: '700' }}>Track Application Status</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        ) : (
          /* Application Status Results Card */
          <div className="bg-slate-800/80 backdrop-blur-xl border border-slate-700/80 rounded-2xl p-6 sm:p-8 shadow-2xl space-y-6">
            {/* Header info */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-6 border-b border-slate-700">
              <div>
                <div className="flex items-center gap-2 text-emerald-700 text-xs font-semibold uppercase tracking-wider">
                  <FileText className="w-4 h-4" />
                  Application Details
                </div>
                <h2 className="text-xl font-bold text-gray-900 mt-1" style={{ color: '#111827' }}>
                  {trackResult.farm_name}
                </h2>
                <div className="flex items-center gap-4 text-xs text-gray-600 mt-1">
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-gray-500" />
                    {trackResult.district}, {trackResult.province}
                  </span>
                  <span>|</span>
                  <span className="font-mono text-gray-800">
                    Ref: {trackResult.reference_number}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <span className="px-3.5 py-1.5 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-800 border border-emerald-500/30">
                  {trackResult.status_display || trackResult.status}
                </span>
                <button
                  onClick={handleReset}
                  className="px-3 py-1.5 rounded-lg bg-gray-200 hover:bg-gray-300 text-xs text-gray-800 transition-colors flex items-center gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> New Search
                </button>
              </div>
            </div>

            {/* Dispute Warning if applicable */}
            {trackResult.has_disputes && (
              <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-red-700 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-red-600" />
                <span>Notice: A boundary or title query is associated with this application. Please await departmental feedback.</span>
              </div>
            )}

            {/* Stage Progress Stepper */}
            <div>
              <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wider mb-4 flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-emerald-600" />
                Processing Workflow Timeline (Stage {trackResult.current_stage} of {trackResult.total_stages || 9})
              </h3>

              <div className="space-y-3">
                {trackResult.timeline.map((step) => {
                  const isCompleted = step.stage < trackResult.current_stage;
                  const isCurrent = step.stage === trackResult.current_stage;
                  
                  return (
                    <div 
                      key={step.stage} 
                      className={`p-3.5 rounded-xl border transition-all flex items-center justify-between ${
                        isCurrent 
                          ? 'bg-emerald-500/10 border-emerald-500/50 text-gray-900 shadow-lg shadow-emerald-900/20' 
                          : isCompleted 
                          ? 'bg-slate-900/50 border-slate-700/60 text-gray-700' 
                          : 'bg-slate-900/20 border-slate-800 text-gray-500'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                          isCurrent 
                            ? 'bg-emerald-500 text-gray-900' 
                            : isCompleted 
                            ? 'bg-slate-700 text-emerald-600' 
                            : 'bg-slate-800 text-gray-600'
                        }`}>
                          {isCompleted ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : step.stage}
                        </div>
                        <span className="text-sm font-medium" style={{ color: '#111827' }}>
                          {step.label}
                        </span>
                      </div>

                      {isCurrent && (
                        <span className="text-xs bg-emerald-500/20 text-emerald-800 font-semibold px-2.5 py-1 rounded-md border border-emerald-500/30 animate-pulse">
                          In Progress
                        </span>
                      )}
                      {isCompleted && (
                        <span className="text-xs text-gray-600 font-medium">
                          Completed
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Footer Notice */}
            <div className="pt-4 border-t border-slate-700 text-center text-xs text-gray-600">
              Last system update: {new Date(trackResult.updated_at).toLocaleString()}
            </div>
          </div>
        )}
      </div>

      {/* Portal Footer */}
      <footer className="relative z-10 text-center text-xs text-gray-600 py-4 border-t border-slate-800/80 mt-8">
        Unified Mobile App Title Deeds Processing & Land Management System — Ministry of Lands, Agriculture, Fisheries, Water & Rural Development
      </footer>
    </div>
  );
}

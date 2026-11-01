import React, { useState, useEffect } from 'react'
import {
    FileSpreadsheet, Shield, AlertCircle, RefreshCw, Filter, CheckCircle2, Loader2
} from 'lucide-react'
import { Link } from 'react-router-dom'
import * as XLSX from 'xlsx'
import Breadcrumb from '../components/Breadcrumb'
import { getStatusColor, formatStatus } from '../utils/statusUtils'
import api from '../services/api'
import { reconcileApplicationsWithConflictRule } from '../utils/offlineDB'

const AVAILABLE_REPORT_TYPES = [
    { id: 'overview', title: 'National Pipeline & Executive Overview', desc: 'Comprehensive throughput across all processing stages' },
    { id: 'resettlement', title: 'Resettlement Land Verification', desc: 'Department of Resettlement offer letters and tenure validation' },
    { id: 'lims', title: 'LIMS / Lands Clearance Verification', desc: 'Form LIMS-01 land tenure document and gazette records' },
    { id: 'zlc', title: 'Zimbabwe Land Commission Clearance', desc: 'ZLC conflict vetting, disputes and legal compliance' },
    { id: 'gis', title: 'GIS & Spatial Validation Audit', desc: 'Boundary coordinates, overlaps, and cadastral spatial mapping' },
    { id: 'surveyor', title: 'Surveyor General Cadastral Audit', desc: 'Form SG-05 boundary audits and boundary demarcations' },
    { id: 'valuation', title: 'Valuation Directorate Assessment', desc: 'Form VAL-06 rural land and asset appraisals' },
    { id: 'director', title: 'Director of Lands Executive Review', desc: 'Final departmental approvals and endorsement review' },
    { id: 'deeds', title: 'Deeds Registry Great Seal Issuance', desc: 'Form DR-08 warrants and final title deed certificates' },
    { id: 'finance', title: 'Revenue & Processing Fee Reconciliation', desc: 'Statutory $10 fee payments and mobile receipt records' }
]

const ZIM_DISTRICTS = [
    "All Districts", "Harare", "Bulawayo", "Goromonzi", "Mazowe", "Chegutu", "Marondera",
    "Bindura", "Gweru", "Mutare", "Chinhoyi", "Makonde", "Zvimba",
    "Seke", "Shurugwi", "Kwekwe", "Kadoma", "Masvingo", "Chiredzi",
    "Hwange", "Lupane", "Beitbridge", "Gwanda", "Chipinge", "Nyanga"
]

const ALL_STATUSES = [
    { value: '', label: 'All Statuses' },
    { value: 'PENDING', label: 'Pending (Resettlement)' },
    { value: 'RESETTLEMENT_VERIFIED', label: 'Resettlement Verified' },
    { value: 'LIMS_VERIFIED', label: 'LIMS Verified' },
    { value: 'ZLC_CLEARED', label: 'ZLC Cleared' },
    { value: 'GIS_VALIDATED', label: 'GIS Validated' },
    { value: 'SURVEYED', label: 'Surveyed' },
    { value: 'VALUATED', label: 'Valuated' },
    { value: 'APPROVED', label: 'Approved' },
    { value: 'READY_FOR_COLLECTION', label: 'Ready for Collection' },
    { value: 'REJECTED', label: 'Rejected' }
]

function isA1Tenure(docType = '') {
    const lower = String(docType || '').toLowerCase()
    return lower.includes('a1') || lower.includes('offer letter') || lower.includes('settlement permit')
}

function getLocalApplications() {
    try {
        const parsed = JSON.parse(localStorage.getItem('my_submitted_applications') || '[]')
        return Array.isArray(parsed) ? parsed : []
    } catch (e) {
        return []
    }
}

const Reports = ({ user }) => {
    const [selectedReport, setSelectedReport] = useState('overview')
    const [reportData, setReportData] = useState(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [statusBanner, setStatusBanner] = useState('')
    const [isExporting, setIsExporting] = useState(false)

    // Filters
    const [statusFilter, setStatusFilter] = useState('')
    const [districtFilter, setDistrictFilter] = useState('All Districts')
    const [tenureFilter, setTenureFilter] = useState('ALL') // 'ALL' | 'A1' | 'A2'
    const [dateFrom, setDateFrom] = useState('')
    const [dateTo, setDateTo] = useState('')

    // Filtered applications table
    const [filteredApps, setFilteredApps] = useState([])
    const [filteredLoading, setFilteredLoading] = useState(false)
    const [filteredPage, setFilteredPage] = useState(1)
    const [filteredTotal, setFilteredTotal] = useState(0)
    const [filteredTotalPages, setFilteredTotalPages] = useState(1)

    const hasAccess = user && (
        user.role !== 'farmer' ||
        (user.privileges && user.privileges.includes('view_reports'))
    )

    useEffect(() => {
        if (hasAccess) {
            fetchReport()
            fetchFilteredApps(1)
        } else {
            setLoading(false)
        }
    }, [selectedReport])

    useEffect(() => {
        if (hasAccess) {
            fetchFilteredApps(1)
        }
    }, [statusFilter, districtFilter, tenureFilter, dateFrom, dateTo])

    const computeLocalMetrics = (apps) => {
        const total = apps.length
        const approved = apps.filter(a => a.status === 'APPROVED' || a.status === 'READY_FOR_COLLECTION').length
        const rejected = apps.filter(a => a.status === 'REJECTED').length
        const pending = Math.max(0, total - approved - rejected)
        return {
            total_applications: total,
            pending,
            approved,
            rejected
        }
    }

    const fetchReport = async () => {
        try {
            setLoading(true)
            setError('')

            let endpoint = '/reports/admin-overview/'
            if (selectedReport === 'overview') endpoint = (user?.role === 'director') ? '/reports/director/' : '/reports/admin-overview/'
            else if (selectedReport === 'resettlement') endpoint = '/reports/resettlement/'
            else if (selectedReport === 'lims') endpoint = '/reports/lims/'
            else if (selectedReport === 'zlc') endpoint = '/reports/zlc/'
            else if (selectedReport === 'gis') endpoint = '/reports/gis/'
            else if (selectedReport === 'surveyor') endpoint = '/reports/surveyor/'
            else if (selectedReport === 'valuation') endpoint = '/reports/valuation/'
            else if (selectedReport === 'director') endpoint = '/reports/director/'
            else if (selectedReport === 'deeds') endpoint = '/reports/deeds/'
            else if (selectedReport === 'finance') endpoint = '/reports/finance/'

            const response = await api.get(endpoint)
            const localApps = getLocalApplications()
            if (response.data && (response.data.total_applications > 0 || localApps.length === 0)) {
                setReportData(response.data)
            } else {
                setReportData(computeLocalMetrics(localApps))
            }
        } catch (err) {
            console.error('Report fetch error:', err)
            const localApps = getLocalApplications()
            if (localApps.length > 0) {
                setReportData(computeLocalMetrics(localApps))
            } else {
                setReportData({ total_applications: 0, pending: 0, approved: 0 })
            }
        } finally {
            setLoading(false)
        }
    }

    const applyClientFilters = (apps) => {
        return apps.filter(app => {
            if (statusFilter && app.status !== statusFilter) return false
            if (districtFilter && districtFilter !== 'All Districts' && app.district !== districtFilter) return false
            if (tenureFilter === 'A1' && !isA1Tenure(app.tenure_document_type)) return false
            if (tenureFilter === 'A2' && isA1Tenure(app.tenure_document_type)) return false
            if (dateFrom && app.created_at && new Date(app.created_at) < new Date(dateFrom)) return false
            if (dateTo && app.created_at && new Date(app.created_at) > new Date(dateTo + 'T23:59:59')) return false
            return true
        })
    }

    const fetchFilteredApps = async (page = 1) => {
        try {
            setFilteredLoading(true)
            setFilteredPage(page)

            const params = { page, page_size: 20 }
            if (statusFilter) params.status = statusFilter
            if (districtFilter && districtFilter !== 'All Districts') params.district = districtFilter
            if (dateFrom) params.date_from = dateFrom
            if (dateTo) params.date_to = dateTo
            if (user?.role) params.role = user.role

            const endpoint = (user?.role === 'director' || user?.role === 'admin')
                ? '/reports/director-applications/'
                : '/reports/role-applications/'

            const response = await api.get(endpoint, { params })
            const data = response.data || {}
            const remoteResults = Array.isArray(data.results) ? data.results : []
            const localApps = getLocalApplications()
            const merged = reconcileApplicationsWithConflictRule(remoteResults, localApps)
            const filtered = applyClientFilters(merged)

            setFilteredApps(filtered)
            setFilteredTotal(data.count && localApps.length === 0 ? data.count : filtered.length)
            setFilteredTotalPages(data.total_pages || Math.max(1, Math.ceil(filtered.length / 20)))
        } catch (err) {
            console.error('Filtered applications error:', err)
            const localApps = getLocalApplications()
            const filtered = applyClientFilters(localApps)
            setFilteredApps(filtered)
            setFilteredTotal(filtered.length)
            setFilteredTotalPages(Math.max(1, Math.ceil(filtered.length / 20)))
        } finally {
            setFilteredLoading(false)
        }
    }

    const handleExportExcel = () => {
        const dataToExport = (filteredApps && filteredApps.length > 0) ? filteredApps : []
        if (dataToExport.length === 0) {
            setError('No report records match the current filter to export.')
            setTimeout(() => setError(''), 3500)
            return
        }

        setIsExporting(true)
        setError('')
        try {
            const rows = dataToExport.map(app => ({
                'Receipt Number': app.receipt_number || app.statutory_fee_receipt || 'N/A',
                'Ref Number': app.reference_number || `APP-${app.id}`,
                'Beneficiary': app.farmer_name || app.farmer || app.walk_in_citizen_name || 'N/A',
                'Farm Name': app.farm_name || 'N/A',
                'Tenure Model': isA1Tenure(app.tenure_document_type) ? `A1 (${app.tenure_document_type || 'Offer Letter'})` : `A2 (${app.tenure_document_type || '99-Year Lease'})`,
                'District': app.district || 'N/A',
                'Status': app.status || 'PENDING',
                'Submission Date': app.created_at ? new Date(app.created_at).toLocaleDateString() : 'N/A'
            }))

            const ws = XLSX.utils.json_to_sheet(rows)
            const wb = XLSX.utils.book_new()
            XLSX.utils.book_append_sheet(wb, ws, 'TitleDeedReport')
            XLSX.writeFile(wb, `Title_Deed_Report_${selectedReport}_${new Date().toISOString().split('T')[0]}.xlsx`)
            setStatusBanner(`Exported ${rows.length} record(s) to Excel successfully.`)
            setTimeout(() => setStatusBanner(''), 3500)
        } catch (e) {
            setError('Could not generate Excel file. Please try again.')
        } finally {
            setIsExporting(false)
        }
    }

    if (!hasAccess) {
        return (
            <div className="card p-8 text-center max-w-md mx-auto my-12 border border-red-200 bg-red-50/50 rounded-2xl shadow-sm">
                <div className="w-16 h-16 rounded-full bg-red-100 text-red-600 mx-auto flex items-center justify-center mb-4">
                    <Shield size={32} />
                </div>
                <h2 className="text-xl font-bold text-slate-900 mb-2">Access Restricted</h2>
                <p className="text-sm text-slate-600 mb-6">You do not have access to view Reports. Contact the System Administrator.</p>
                <Link to="/dashboard" className="btn bg-emerald-700 hover:bg-emerald-800 text-white font-bold py-2.5 px-6 rounded-xl text-sm">
                    Return to Dashboard
                </Link>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-gray-50 py-8">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
                <Breadcrumb items={[{ label: 'Home', path: '/' }, { label: 'Portal', path: '/dashboard' }, { label: 'Reports' }]} />

                {/* Header */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Official Reports & Statistics</h1>
                        <p className="text-sm text-gray-500 mt-1">Multi-departmental verification reports and application lifecycle metrics</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            disabled={isExporting || loading}
                            onClick={handleExportExcel}
                            className="btn bg-emerald-700 hover:bg-emerald-800 text-white flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-lg shadow-sm"
                        >
                            {isExporting ? <Loader2 size={16} className="animate-spin" /> : <FileSpreadsheet size={16} />}
                            {isExporting ? 'Exporting...' : 'Export Excel'}
                        </button>
                        <button
                            type="button"
                            disabled={loading || filteredLoading}
                            onClick={() => { fetchReport(); fetchFilteredApps(1); }}
                            className="btn bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 flex items-center gap-2 text-sm px-4 py-2 rounded-lg shadow-sm"
                        >
                            <RefreshCw size={16} className={(loading || filteredLoading) ? 'animate-spin' : ''} />
                            {(loading || filteredLoading) ? 'Refreshing...' : 'Refresh'}
                        </button>
                    </div>
                </div>

                {statusBanner && (
                    <div className="p-3.5 bg-green-50 text-green-800 border border-green-200 rounded-xl text-xs font-semibold flex items-center gap-2">
                        <CheckCircle2 size={16} className="text-green-600" />
                        <span>{statusBanner}</span>
                    </div>
                )}
                {error && (
                    <div className="p-3.5 bg-red-50 text-red-700 border border-red-200 rounded-xl text-xs font-semibold flex items-center gap-2">
                        <AlertCircle size={16} className="text-red-600" />
                        <span>{error}</span>
                    </div>
                )}

                {/* Available Reports Selection */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                    {AVAILABLE_REPORT_TYPES.map(rpt => (
                        <button
                            type="button"
                            key={rpt.id}
                            onClick={() => setSelectedReport(rpt.id)}
                            className={`p-3 rounded-xl border text-left transition-all ${
                                selectedReport === rpt.id
                                    ? 'bg-emerald-800 text-white border-emerald-900 shadow-md font-semibold'
                                    : 'bg-white text-gray-700 border-gray-200 hover:border-emerald-500 hover:bg-gray-50'
                            }`}
                        >
                            <span className="text-xs font-bold block line-clamp-1">{rpt.title}</span>
                            <span className={`text-[10px] block mt-1 line-clamp-2 ${selectedReport === rpt.id ? 'text-emerald-100' : 'text-gray-500'}`}>
                                {rpt.desc}
                            </span>
                        </button>
                    ))}
                </div>

                {/* Metrics Summary Cards */}
                {reportData ? (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        <div className="card p-4 bg-white border border-gray-200 rounded-xl shadow-sm space-y-1">
                            <span className="text-xs font-semibold text-gray-500 block">Total Applications: </span>
                            <span className="text-2xl font-black text-gray-900">{reportData.total_applications || reportData.total || filteredTotal || 0}</span>
                        </div>
                        <div className="card p-4 bg-white border border-gray-200 rounded-xl shadow-sm space-y-1">
                            <span className="text-xs font-semibold text-gray-500 block">Under Review: </span>
                            <span className="text-2xl font-black text-amber-600">{reportData.pending || reportData.under_review || 0}</span>
                        </div>
                        <div className="card p-4 bg-white border border-gray-200 rounded-xl shadow-sm space-y-1">
                            <span className="text-xs font-semibold text-gray-500 block">Verified & Approved: </span>
                            <span className="text-2xl font-black text-emerald-600">{reportData.approved || reportData.verified || 0}</span>
                        </div>
                        <div className="card p-4 bg-white border border-gray-200 rounded-xl shadow-sm space-y-1">
                            <span className="text-xs font-semibold text-gray-500 block">Total Revenue ($10 Fees): </span>
                            <span className="text-2xl font-black text-emerald-800 font-mono">
                                ${((reportData.total_applications || filteredTotal || 0) * 10).toLocaleString()} USD
                            </span>
                        </div>
                    </div>
                ) : (
                    <div className="p-4 bg-white border border-gray-200 rounded-xl text-center text-sm text-gray-500">
                        {loading ? "Loading metrics..." : "No reports available yet for this category."}
                    </div>
                )}

                {/* Filter Bar */}
                <div className="card p-5 bg-white border border-gray-200 rounded-xl shadow-sm space-y-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-sm font-bold text-gray-800">
                            <Filter size={16} className="text-emerald-700" />
                            <span>Filter Report Records</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs">
                            <button
                                type="button"
                                onClick={() => setTenureFilter('ALL')}
                                className={`px-2.5 py-1 rounded-lg font-bold border ${tenureFilter === 'ALL' ? 'bg-emerald-700 text-white border-emerald-800' : 'bg-gray-50 text-gray-700 border-gray-200'}`}
                            >
                                All Registry
                            </button>
                            <button
                                type="button"
                                onClick={() => setTenureFilter('A1')}
                                className={`px-2.5 py-1 rounded-lg font-bold border ${tenureFilter === 'A1' ? 'bg-emerald-700 text-white border-emerald-800' : 'bg-gray-50 text-gray-700 border-gray-200'}`}
                            >
                                A1 Permits / Offer Letters
                            </button>
                            <button
                                type="button"
                                onClick={() => setTenureFilter('A2')}
                                className={`px-2.5 py-1 rounded-lg font-bold border ${tenureFilter === 'A2' ? 'bg-emerald-700 text-white border-emerald-800' : 'bg-gray-50 text-gray-700 border-gray-200'}`}
                            >
                                A2 Leases / 99-Year
                            </button>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
                        <div>
                            <label className="block font-semibold text-gray-600 mb-1">Status: </label>
                            <select
                                className="input text-xs w-full bg-white"
                                value={statusFilter}
                                onChange={(e) => setStatusFilter(e.target.value)}
                            >
                                {ALL_STATUSES.map(s => (
                                    <option key={s.value} value={s.value}>{s.label}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block font-semibold text-gray-600 mb-1">District: </label>
                            <select
                                className="input text-xs w-full bg-white"
                                value={districtFilter}
                                onChange={(e) => setDistrictFilter(e.target.value)}
                            >
                                {ZIM_DISTRICTS.map(d => (
                                    <option key={d} value={d}>{d}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block font-semibold text-gray-600 mb-1">From Date: </label>
                            <input
                                type="date"
                                className="input text-xs w-full"
                                value={dateFrom}
                                onChange={(e) => setDateFrom(e.target.value)}
                            />
                        </div>
                        <div>
                            <label className="block font-semibold text-gray-600 mb-1">To Date: </label>
                            <input
                                type="date"
                                className="input text-xs w-full"
                                value={dateTo}
                                onChange={(e) => setDateTo(e.target.value)}
                            />
                        </div>
                    </div>
                </div>

                {/* Applications Table */}
                <div className="card bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                    <div className="p-4 border-b border-gray-200 bg-gray-50/50 flex justify-between items-center">
                        <h3 className="font-bold text-gray-900 text-sm">
                            Application Dossiers (Total: {filteredTotal})
                        </h3>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                            <thead className="bg-gray-50 text-gray-500 font-semibold uppercase border-b border-gray-200">
                                <tr>
                                    <th className="px-5 py-3">Receipt & Ref Number</th>
                                    <th className="px-5 py-3">Beneficiary</th>
                                    <th className="px-5 py-3">Farm & Tenure Details</th>
                                    <th className="px-5 py-3">District</th>
                                    <th className="px-5 py-3">Status</th>
                                    <th className="px-5 py-3">Date</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {filteredLoading ? (
                                    <tr>
                                        <td colSpan="6" className="p-8 text-center text-gray-500">
                                            Loading application records...
                                        </td>
                                    </tr>
                                ) : filteredApps.length === 0 ? (
                                    <tr>
                                        <td colSpan="6" className="p-8 text-center text-gray-500">
                                            No reports available yet for this selection.
                                        </td>
                                    </tr>
                                ) : (
                                    filteredApps.map((app) => {
                                        const isA1 = isA1Tenure(app.tenure_document_type)
                                        return (
                                            <tr key={app.reference_number || app.id} className="hover:bg-gray-50 transition-colors">
                                                <td className="px-5 py-3.5">
                                                    <div className="space-y-0.5">
                                                        <div className="font-mono font-bold text-emerald-900">
                                                            Ref Number: {app.reference_number || `APP-${app.id}`}
                                                        </div>
                                                        <div className="font-mono text-gray-500 text-[11px]">
                                                            Receipt Number: {app.receipt_number || app.statutory_fee_receipt || 'No receipt on file'}
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-5 py-3.5">
                                                    <div className="font-semibold text-gray-900">
                                                        Beneficiary: {app.farmer_name || app.farmer || app.walk_in_citizen_name || 'Registered Applicant'}
                                                    </div>
                                                    {app.national_id && (
                                                        <div className="text-gray-500 text-[11px]">
                                                            National ID: {app.national_id}
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="px-5 py-3.5">
                                                    <div className="font-medium text-gray-800 flex items-center gap-1.5">
                                                        <span>Farm Name: {app.farm_name || 'Resettlement Parcel'}</span>
                                                        <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold border ${isA1 ? 'bg-amber-50 text-amber-800 border-amber-200' : 'bg-blue-50 text-blue-800 border-blue-200'}`}>
                                                            {isA1 ? 'A1 Registry' : 'A2 Registry'}
                                                        </span>
                                                    </div>
                                                    {app.farm_extent && (
                                                        <div className="text-gray-500 text-[11px]">
                                                            Extent: {app.farm_extent} Ha • {app.tenure_document_type || 'Offer Letter'}
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="px-5 py-3.5 text-gray-700">
                                                    District: {app.district || 'Unspecified'}
                                                </td>
                                                <td className="px-5 py-3.5">
                                                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold border ${getStatusColor(app.status)}`}>
                                                        {formatStatus(app.status)}
                                                    </span>
                                                </td>
                                                <td className="px-5 py-3.5 text-gray-600 whitespace-nowrap">
                                                    Time Stamp: {app.created_at ? new Date(app.created_at).toLocaleDateString() : 'Recent'}
                                                </td>
                                            </tr>
                                        )
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination */}
                    {filteredTotalPages > 1 && (
                        <div className="bg-gray-50 px-5 py-3 border-t border-gray-200 flex items-center justify-between text-xs">
                            <span className="text-gray-600">
                                Page: {filteredPage} of {filteredTotalPages} (Total Records: {filteredTotal})
                            </span>
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={() => fetchFilteredApps(filteredPage - 1)}
                                    disabled={filteredPage === 1}
                                    className="btn bg-white text-gray-700 border border-gray-300 disabled:opacity-50 px-3 py-1 rounded"
                                >
                                    Previous
                                </button>
                                <button
                                    type="button"
                                    onClick={() => fetchFilteredApps(filteredPage + 1)}
                                    disabled={filteredPage === filteredTotalPages}
                                    className="btn bg-white text-gray-700 border border-gray-300 disabled:opacity-50 px-3 py-1 rounded"
                                >
                                    Next
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

export default Reports

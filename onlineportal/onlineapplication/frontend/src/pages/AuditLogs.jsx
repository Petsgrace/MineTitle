import React, { useState, useEffect } from 'react'
import { Filter, RefreshCw, ChevronLeft, ChevronRight, Shield, AlertCircle, CheckCircle2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import Breadcrumb from '../components/Breadcrumb'
import api from '../services/api'
import { getLocalAuditLogs } from '../utils/offlineDB'

const AuditLogs = ({ user }) => {
    const [logs, setLogs] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [totalCount, setTotalCount] = useState(0)
    const [totalPages, setTotalPages] = useState(1)

    const hasAccess = user && (
        user.role === 'admin' ||
        user.role === 'director' ||
        (user.privileges && user.privileges.includes('view_audit_logs'))
    )

    const [filters, setFilters] = useState({
        page: 1,
        page_size: 50,
        date_from: '',
        date_to: '',
        officer: '',
        action_type: '',
        application_id: ''
    })

    useEffect(() => {
        if (hasAccess) {
            fetchLogs()
        } else {
            setLoading(false)
        }
    }, [filters.page])

    const normalizeLocalLogs = (localItems, activeFilters = filters) => {
        return localItems
            .map(item => ({
                id: item.id || `LOCAL-${item.timestamp}`,
                timestamp: item.timestamp,
                officer: typeof item.actor === 'object' ? item.actor : {
                    name: item.actor || 'System Officer',
                    username: String(item.actor || 'system').toLowerCase().replace(/\s+/g, '_'),
                    role: item.from_stage || 'Staff'
                },
                action_type: item.action_type || 'WORKFLOW_ACTION',
                reference_number: item.reference_number || 'SYSTEM',
                comments: item.comment || item.comments || '-',
                block_hash: item.integrity_hash || item.block_hash || 'Genesis'
            }))
            .filter(item => {
                if (activeFilters.officer && !JSON.stringify(item.officer).toLowerCase().includes(activeFilters.officer.toLowerCase())) {
                    return false
                }
                if (activeFilters.action_type && !String(item.action_type).toLowerCase().includes(activeFilters.action_type.toLowerCase())) {
                    return false
                }
                if (activeFilters.application_id && !String(item.reference_number).toLowerCase().includes(activeFilters.application_id.toLowerCase())) {
                    return false
                }
                if (activeFilters.date_from && item.timestamp && new Date(item.timestamp) < new Date(activeFilters.date_from)) {
                    return false
                }
                if (activeFilters.date_to && item.timestamp && new Date(item.timestamp) > new Date(activeFilters.date_to + 'T23:59:59')) {
                    return false
                }
                return true
            })
    }

    const fetchLogs = async (overrideFilters = filters) => {
        try {
            setLoading(true)
            setError('')

            const params = new URLSearchParams()
            Object.entries(overrideFilters).forEach(([key, value]) => {
                if (value) params.append(key, value)
            })

            const response = await api.get(`/reports/audit-logs/?${params.toString()}`)
            const data = response.data || {}
            const serverLogs = Array.isArray(data.results) ? data.results : []
            const localLogs = normalizeLocalLogs(getLocalAuditLogs(), overrideFilters)

            // Merge without duplicate IDs
            const seenIds = new Set(serverLogs.map(l => String(l.id)))
            const merged = [
                ...localLogs.filter(l => !seenIds.has(String(l.id))),
                ...serverLogs
            ]
            setLogs(merged)
            setTotalCount(data.count && localLogs.length === 0 ? data.count : merged.length)
            setTotalPages(data.total_pages || Math.max(1, Math.ceil(merged.length / 50)))
        } catch (err) {
            console.error('Fetch logs error:', err)
            const localLogs = normalizeLocalLogs(getLocalAuditLogs(), overrideFilters)
            setLogs(localLogs)
            setTotalCount(localLogs.length)
            setTotalPages(Math.max(1, Math.ceil(localLogs.length / 50)))
            if (localLogs.length === 0) {
                setError('Audit log server unreachable. Showing local offline audit ledger.')
            }
        } finally {
            setLoading(false)
        }
    }

    const handleFilterChange = (key, value) => {
        setFilters(prev => ({ ...prev, [key]: value, page: 1 }))
    }

    const applyFilters = () => {
        fetchLogs(filters)
    }

    const clearFilters = () => {
        const cleared = {
            page: 1,
            page_size: 50,
            date_from: '',
            date_to: '',
            officer: '',
            action_type: '',
            application_id: ''
        }
        setFilters(cleared)
        fetchLogs(cleared)
    }

    const formatTimestamp = (ts) => {
        if (!ts) return 'N/A'
        try {
            const date = new Date(ts)
            return date.toLocaleString('en-GB', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false
            })
        } catch (e) {
            return String(ts)
        }
    }

    const getActionBadgeColor = (actionType) => {
        switch (actionType) {
            case 'LIMS_VERIFIED':
                return 'bg-blue-100 text-blue-800 border-blue-200'
            case 'ACCOUNTS_VERIFIED':
            case 'CLOUD_SYNC_SUCCESS':
                return 'bg-green-100 text-green-800 border-green-200'
            case 'SURVEYED':
                return 'bg-purple-100 text-purple-800 border-purple-200'
            case 'VALUATED':
            case 'SYNC_CONFLICT_RESOLVED':
                return 'bg-yellow-100 text-yellow-800 border-yellow-200'
            case 'APPROVED':
            case 'READY_FOR_COLLECTION':
                return 'bg-emerald-100 text-emerald-800 border-emerald-200'
            case 'REJECTED':
            case 'PRIVILEGE_REVOKE':
                return 'bg-red-100 text-red-800 border-red-200'
            case 'PRIVILEGE_ASSIGN':
                return 'bg-indigo-100 text-indigo-800 border-indigo-200'
            default:
                return 'bg-gray-100 text-gray-800 border-gray-200'
        }
    }

    if (!hasAccess) {
        return (
            <div className="card p-8 text-center max-w-md mx-auto my-12 border border-red-200 bg-red-50/50 rounded-2xl shadow-sm">
                <div className="w-16 h-16 rounded-full bg-red-100 text-red-600 mx-auto flex items-center justify-center mb-4">
                    <Shield size={32} />
                </div>
                <h2 className="text-xl font-bold text-slate-900 mb-2">Access Restricted</h2>
                <p className="text-sm text-slate-600 mb-6">You do not have access to view Audit Logs. Contact the System Administrator.</p>
                <Link to="/dashboard" className="btn bg-emerald-700 hover:bg-emerald-800 text-white font-bold py-2.5 px-6 rounded-xl text-sm">
                    Return to Dashboard
                </Link>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-gray-50 py-8">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <Breadcrumb items={[{ label: 'Home', path: '/' }, { label: 'Admin Portal', path: '/admin-dashboard' }, { label: 'Audit Logs' }]} />

                {/* Header */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 my-6">
                    <div>
                        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">National Audit Trail</h1>
                        <p className="text-sm text-gray-500 mt-1">Immutable cryptographic registry of all title deed transactions, sync conflict resolutions, and officer actions</p>
                    </div>
                    <button
                        type="button"
                        onClick={() => fetchLogs(filters)}
                        disabled={loading}
                        className="btn bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 flex items-center gap-2 shadow-sm font-semibold text-sm px-4 py-2"
                    >
                        <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                        {loading ? 'Refreshing...' : 'Refresh Logs'}
                    </button>
                </div>

                {/* Filters */}
                <div className="bg-white rounded-xl shadow-md border border-gray-200 p-5 mb-6">
                    <h3 className="text-base font-bold text-gray-900 mb-3 flex items-center">
                        <Filter size={18} className="mr-2 text-emerald-600" />
                        Search & Filter Logs
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 mb-4 text-xs">
                        <div>
                            <label className="block font-medium text-gray-700 mb-1">From Date: </label>
                            <input
                                type="date"
                                className="input text-xs w-full"
                                value={filters.date_from}
                                onChange={(e) => handleFilterChange('date_from', e.target.value)}
                            />
                        </div>
                        <div>
                            <label className="block font-medium text-gray-700 mb-1">To Date: </label>
                            <input
                                type="date"
                                className="input text-xs w-full"
                                value={filters.date_to}
                                onChange={(e) => handleFilterChange('date_to', e.target.value)}
                            />
                        </div>
                        <div>
                            <label className="block font-medium text-gray-700 mb-1">Officer Username: </label>
                            <input
                                type="text"
                                className="input text-xs w-full"
                                placeholder="Search officer..."
                                value={filters.officer}
                                onChange={(e) => handleFilterChange('officer', e.target.value)}
                            />
                        </div>
                        <div>
                            <label className="block font-medium text-gray-700 mb-1">Action Type: </label>
                            <input
                                type="text"
                                className="input text-xs w-full"
                                placeholder="e.g. LIMS_VERIFIED"
                                value={filters.action_type}
                                onChange={(e) => handleFilterChange('action_type', e.target.value)}
                            />
                        </div>
                        <div>
                            <label className="block font-medium text-gray-700 mb-1">App ID / Ref: </label>
                            <input
                                type="text"
                                className="input text-xs w-full"
                                placeholder="ID or Ref Number..."
                                value={filters.application_id}
                                onChange={(e) => handleFilterChange('application_id', e.target.value)}
                            />
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <button
                            type="button"
                            disabled={loading}
                            onClick={applyFilters}
                            className="btn bg-emerald-700 text-white hover:bg-emerald-800 text-xs py-2 px-4 font-semibold"
                        >
                            Apply Filters
                        </button>
                        <button
                            type="button"
                            disabled={loading}
                            onClick={clearFilters}
                            className="btn bg-gray-100 text-gray-700 hover:bg-gray-200 text-xs py-2 px-4"
                        >
                            Clear All
                        </button>
                    </div>
                </div>

                {error && (
                    <div className="bg-amber-50 text-amber-800 p-4 rounded-xl text-sm flex items-center gap-2 border border-amber-200 mb-6">
                        <AlertCircle size={18} />
                        <span>{error}</span>
                    </div>
                )}

                <div className="bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-gray-50 border-b border-gray-200">
                                <tr>
                                    <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Timestamp</th>
                                    <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Officer / User</th>
                                    <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Action</th>
                                    <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Dossier / Reference</th>
                                    <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Action Details</th>
                                    <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Block Hash</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 text-xs">
                                {loading ? (
                                    <tr>
                                        <td colSpan="6" className="p-12 text-center">
                                            <div className="flex flex-col items-center">
                                                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-emerald-600 mb-3"></div>
                                                <p className="text-gray-600 text-sm">Loading audit logs...</p>
                                            </div>
                                        </td>
                                    </tr>
                                ) : logs.length === 0 ? (
                                    <tr>
                                        <td colSpan="6" className="p-12 text-center text-gray-500 text-sm">
                                            No audit logs available yet
                                        </td>
                                    </tr>
                                ) : (
                                    logs.map((log) => (
                                        <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                                            <td className="px-5 py-3.5 text-gray-900 font-mono whitespace-nowrap">
                                                {formatTimestamp(log.timestamp)}
                                            </td>
                                            <td className="px-5 py-3.5">
                                                <div>
                                                    <div className="font-semibold text-gray-900">{log.officer?.name || 'System Official'}</div>
                                                    <div className="text-gray-500 text-[11px]">
                                                        User: @{log.officer?.username || 'system'} • Role: {log.officer?.role || 'Staff'}
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-5 py-3.5">
                                                <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border ${getActionBadgeColor(log.action_type)}`}>
                                                    {log.action_type ? log.action_type.replace(/_/g, ' ') : 'ACTION'}
                                                </span>
                                            </td>
                                            <td className="px-5 py-3.5">
                                                <div className="space-y-0.5">
                                                    <div className="font-semibold text-emerald-800">
                                                        Ref Number: {log.reference_number || log.application?.reference_number || (log.application?.id ? `#${log.application.id}` : 'N/A')}
                                                    </div>
                                                    {log.receipt_number && (
                                                        <div className="text-gray-600 font-mono text-[11px]">
                                                            Receipt Number: {log.receipt_number}
                                                        </div>
                                                    )}
                                                    {log.application?.farm_name && (
                                                        <div className="text-gray-500 text-[11px]">
                                                            Farm Name: {log.application.farm_name}
                                                        </div>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-5 py-3.5 text-gray-600 max-w-xs break-words">
                                                {log.comments || '-'}
                                            </td>
                                            <td className="px-5 py-3.5">
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded font-mono text-[10px] bg-gray-50 border border-gray-200 text-gray-700" title={log.block_hash || 'Genesis'}>
                                                    🔒 {log.block_hash ? `${log.block_hash.substring(0, 10)}...` : 'Genesis'}
                                                </span>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div className="bg-gray-50 px-5 py-3 border-t border-gray-200 flex items-center justify-between text-xs">
                            <div className="text-gray-600">
                                Page: {filters.page} of {totalPages} • Showing {logs.length} of {totalCount} logs
                            </div>
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={() => setFilters(prev => ({ ...prev, page: prev.page - 1 }))}
                                    disabled={filters.page === 1}
                                    className="btn bg-white text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1 px-3 py-1.5 border border-gray-300 rounded"
                                >
                                    <ChevronLeft size={14} />
                                    Previous
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setFilters(prev => ({ ...prev, page: prev.page + 1 }))}
                                    disabled={filters.page === totalPages}
                                    className="btn bg-white text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1 px-3 py-1.5 border border-gray-300 rounded"
                                >
                                    Next
                                    <ChevronRight size={14} />
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

export default AuditLogs

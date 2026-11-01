import React, { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Plus, FileText, Clock, CheckCircle, XCircle, Eye, Search, AlertCircle, RefreshCw, MessageSquare, DollarSign, Pencil } from 'lucide-react'
import api from '../services/api'
import Breadcrumb from '../components/Breadcrumb'
import Modal from '../components/Modal'

const FarmerDashboard = ({ user }) => {
    const navigate = useNavigate()
    const location = useLocation()
    const [applications, setApplications] = useState([])
    const [loading, setLoading] = useState(true)
    const [searchTerm, setSearchTerm] = useState('')
    const [error, setError] = useState('')
    const [success, setSuccess] = useState('')
    const [selectedApp, setSelectedApp] = useState(null)
    const [showAppealModal, setShowAppealModal] = useState(false)
    const [appealReason, setAppealReason] = useState('')
    const [paymentMethod, setPaymentMethod] = useState('')
    const [selectedBank, setSelectedBank] = useState('')
    const [submittingPayment, setSubmittingPayment] = useState(false)

    const BANK_CHOICES = [
        { value: 'FBC', label: 'FBC Bank' },
        { value: 'ZB', label: 'ZB Bank' },
        { value: 'CBZ', label: 'CBZ Bank' },
        { value: 'POSB', label: 'POSB' },
        { value: 'AFC', label: 'AFC Holdings' },
    ]

    useEffect(() => {
        if (location.state?.error) {
            setError(location.state.error)
            // Clear the state so the error goes away on refresh
            navigate(location.pathname, { replace: true, state: {} });
        }
    }, [location, navigate])

    const fetchApplications = async () => {
        try {
            // Read locally stored submissions for instant display
            let localApps = []
            try {
                localApps = JSON.parse(localStorage.getItem('my_submitted_applications') || '[]')
            } catch (e) {
                localApps = []
            }

            let serverApps = []
            try {
                const response = await api.get('/applications/')
                if (Array.isArray(response.data)) {
                    serverApps = response.data
                }
            } catch (err) {
                console.warn('Backend /applications/ fetch notice:', err)
            }

            // Merge server apps and local cached submissions (preserving local updates and unsynced items)
            const localByKey = new Map()
            localApps.forEach(item => {
                if (item && typeof item === 'object') {
                    if (item.id != null) localByKey.set(`id:${item.id}`, item)
                    if (item.reference_number) localByKey.set(`ref:${item.reference_number}`, item)
                }
            })

            const matchedKeys = new Set()
            const mergedServer = serverApps.map(app => {
                const byId = app.id != null ? localByKey.get(`id:${app.id}`) : null
                const byRef = app.reference_number ? localByKey.get(`ref:${app.reference_number}`) : null
                const localMatch = byId || byRef
                if (localMatch) {
                    if (localMatch.id != null) matchedKeys.add(`id:${localMatch.id}`)
                    if (localMatch.reference_number) matchedKeys.add(`ref:${localMatch.reference_number}`)
                    if (localMatch.local_updated) {
                        return { ...app, ...localMatch }
                    }
                }
                return app
            })

            const unsyncedLocal = localApps.filter(a => {
                if (!a || typeof a !== 'object') return false
                const idMatched = a.id != null && matchedKeys.has(`id:${a.id}`)
                const refMatched = a.reference_number && matchedKeys.has(`ref:${a.reference_number}`)
                return !idMatched && !refMatched
            })

            const combined = [...unsyncedLocal, ...mergedServer]

            const mappedData = combined.map(app => ({
                ...app,
                farm_name: app.farm_name || app.farm_id || 'Land Parcel',
                district: app.district || 'Unassigned',
                status: app.status || 'PENDING',
                created_at: app.created_at ? new Date(app.created_at).toLocaleDateString() : new Date().toLocaleDateString()
            }))
            setApplications(mappedData)
            setError('')
        } catch (err) {
            console.error('Fetch error:', err)
            const localApps = JSON.parse(localStorage.getItem('my_submitted_applications') || '[]')
            if (localApps.length > 0) {
                setApplications(localApps.map(app => ({
                    ...app,
                    farm_name: app.farm_name || app.farm_id || 'Land Parcel',
                    district: app.district || 'Unassigned',
                    status: app.status || 'PENDING',
                    created_at: app.created_at ? new Date(app.created_at).toLocaleDateString() : new Date().toLocaleDateString()
                })))
            } else {
                setError('Failed to load applications. Please try again later.')
            }
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchApplications()
    }, [])

    // Simulation removed - payments are physical/external
    /*
    const handlePaySurveyFee = async (appId) => {
        try {
            setError('')
            setSuccess('')
            await axios.post(`/api/applications/${appId}/pay_survey_fee/`)
            setSuccess('Survey fee paid successfully! A surveyor will now complete the technical assessment.')
            fetchApplications()
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } catch (err) {
            console.error('Payment error:', err)
            setError('Failed to simulate survey fee payment.')
        }
    }
    */

    const handleResubmit = (appId) => {
        navigate(`/apply?id=${appId}`)
    }

    const handleEdit = (appId) => {
        navigate(`/apply?id=${appId}&edit=true`)
    }

    const handleAppeal = async () => {
        if (!appealReason.trim()) {
            setError('Please provide a reason for your appeal')
            return
        }
        try {
            setError('')
            setSuccess('')
            await api.post(`/applications/${selectedApp.id}/appeal_rejection/`, { reason: appealReason })
            setSuccess('Your appeal has been submitted successfully!')
            setShowAppealModal(false)
            setAppealReason('')
            fetchApplications()
            setSelectedApp(null)
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } catch (err) {
            console.error('Appeal error:', err)
            setError('Failed to submit appeal: ' + (err.response?.data?.error || 'Unknown error'))
        }
    }

    const handleSubmitPaymentSelection = async () => {
        if (!paymentMethod) {
            setError('Please select a payment method.')
            return
        }
        if (paymentMethod === 'MORTGAGE' && !selectedBank) {
            setError('Please select a bank for mortgage payment.')
            return
        }

        try {
            setSubmittingPayment(true)
            setError('')
            setSuccess('')

            const payload = { payment_method: paymentMethod }
            if (paymentMethod === 'MORTGAGE') {
                payload.selected_bank = selectedBank
            }

            await api.post(`/applications/${selectedApp.id}/select-payment/`, payload)
            setSuccess('Payment method selected successfully! Check your email for One Stop Center invitation.')
            setPaymentMethod('')
            setSelectedBank('')
            fetchApplications()
            setSelectedApp(null)
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } catch (err) {
            console.error('Payment selection error:', err)
            setError('Failed to submit payment selection: ' + (err.response?.data?.error || 'Unknown error'))
        } finally {
            setSubmittingPayment(false)
        }
    }

    // Lock body scroll when modal is open
    useEffect(() => {
        if (selectedApp) {
            document.body.style.overflow = 'hidden'
            // Handle escape key
            const handleEscape = (e) => {
                if (e.key === 'Escape') setSelectedApp(null)
            }
            document.addEventListener('keydown', handleEscape)
            return () => {
                document.body.style.overflow = 'unset'
                document.removeEventListener('keydown', handleEscape)
            }
        }
    }, [selectedApp])

    const getStatusConfig = (status) => {
        const configs = {
            'PENDING': { label: 'Pending Review', color: 'bg-yellow-100 text-yellow-800', icon: <Clock size={14} /> },
            'QUERIED': { label: 'Needs Attention', color: 'bg-orange-100 text-orange-800', icon: <AlertCircle size={14} /> },
            'RESUBMITTED': { label: 'Resubmitted', color: 'bg-cyan-100 text-cyan-800', icon: <RefreshCw size={14} /> },
            'LIMS_VERIFIED': { label: 'LIMS Verified', color: 'bg-blue-100 text-blue-800', icon: <CheckCircle size={14} /> },
            'ZLC_VERIFIED': { label: 'ZLC Verified', color: 'bg-purple-100 text-purple-800', icon: <CheckCircle size={14} /> },
            'SURVEYED': { label: 'Survey Complete', color: 'bg-indigo-100 text-indigo-800', icon: <CheckCircle size={14} /> },
            'SELECT_PAYMENT': { label: 'Select Payment Method', color: 'bg-amber-100 text-amber-800', icon: <DollarSign size={14} /> },
            'AWAITING_PAYMENT': { label: 'Awaiting Final Payment', color: 'bg-amber-100 text-amber-800', icon: <DollarSign size={14} /> },
            'AGREEMENT_OF_SALE': { label: 'Proceed to Agreement of Sale', color: 'bg-emerald-100 text-emerald-800', icon: <FileText size={14} /> },
            'AWAITING_SURVEY_FEE': { label: 'Awaiting Survey Fee', color: 'bg-rose-100 text-rose-800', icon: <AlertCircle size={14} /> },
            'SURVEY_FEE_PAID': { label: 'Survey Fee Paid', color: 'bg-green-100 text-green-800', icon: <CheckCircle size={14} /> },
            'PAYMENT_VERIFIED': { label: 'Payment Verified', color: 'bg-teal-100 text-teal-800', icon: <CheckCircle size={14} /> },
            'READY_FOR_COLLECTION': { label: 'Ready for Collection', color: 'bg-emerald-100 text-emerald-800', icon: <CheckCircle size={14} /> },
            'RESETTLEMENT_VERIFIED': { label: 'Resettlement Verified', color: 'bg-blue-100 text-blue-800', icon: <CheckCircle size={14} /> },
            'ZLC_CLEARED': { label: 'ZLC Cleared', color: 'bg-purple-100 text-purple-800', icon: <CheckCircle size={14} /> },
            'GIS_VALIDATED': { label: 'GIS Validated', color: 'bg-indigo-100 text-indigo-800', icon: <CheckCircle size={14} /> },
            'VALUATED': { label: 'Valuation Complete', color: 'bg-emerald-100 text-emerald-800', icon: <DollarSign size={14} /> },
            'APPROVED': { label: 'Approved', color: 'bg-green-100 text-green-800', icon: <CheckCircle size={14} /> },
            'REJECTED': { label: 'Rejected', color: 'bg-red-100 text-red-800', icon: <XCircle size={14} /> },
        }
        return configs[status] || configs['PENDING']
    }

    const filteredApplications = applications.filter(app => {
        if (!searchTerm || !searchTerm.trim()) return true
        const q = searchTerm.toLowerCase().trim()
        return (
            (app.farm_name || '').toLowerCase().includes(q) ||
            (app.reference_number || '').toLowerCase().includes(q) ||
            String(app.id || '').toLowerCase().includes(q) ||
            (app.district || '').toLowerCase().includes(q) ||
            (app.farmer || '').toLowerCase().includes(q) ||
            (app.receipt_number || app.statutory_fee_receipt || '').toLowerCase().includes(q) ||
            (app.status || '').toLowerCase().includes(q)
        )
    })

    return (
        <div>
            {error && (
                <div className="alert alert-error">
                    <div className="alert-icon">
                        <AlertCircle size={20} />
                    </div>
                    <span>{error}</span>
                </div>
            )}

            {success && (
                <div className="alert alert-success">
                    <div className="alert-icon">
                        <CheckCircle size={20} />
                    </div>
                    <span>{success}</span>
                </div>
            )}

            <Breadcrumb items={[
                { label: 'Home', link: '/' },
                { label: 'Dashboard' }
            ]} />

            {/* Header Section */}
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h2 className="text-3xl font-bold text-gray-900">Welcome, {user?.name || 'Farmer'}</h2>
                    <p className="text-gray-600 mt-1">Manage your Title Deed applications</p>
                </div>
                {applications.length === 0 && (
                    <button
                        onClick={() => navigate('/apply')}
                        className="btn btn-primary flex items-center gap-2 hover:shadow-lg transition-all"
                    >
                        <Plus size={20} /> New Application
                    </button>
                )}
            </div>

            {/* Stats Cards */}
            <div className="grid md:grid-cols-4 gap-4 mb-8">
                <div className="card border-l-4 border-yellow-500 hover:shadow-lg transition">
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Pending</p>
                    <p className="text-3xl font-bold text-yellow-600 mt-2">
                        {applications.filter(a => a.status === 'PENDING').length}
                    </p>
                </div>
                <div className="card border-l-4 border-blue-500 hover:shadow-lg transition">
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">In Progress</p>
                    <p className="text-3xl font-bold text-blue-600 mt-2">
                        {applications.filter(a => ['LIMS_VERIFIED', 'ZLC_VERIFIED', 'SURVEYED', 'SELECT_PAYMENT', 'AWAITING_PAYMENT', 'PAYMENT_VERIFIED'].includes(a.status)).length}
                    </p>
                </div>
                <div className="card border-l-4 border-emerald-500 hover:shadow-lg transition">
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Completed</p>
                    <p className="text-3xl font-bold text-emerald-600 mt-2">
                        {applications.filter(a => ['APPROVED', 'READY_FOR_COLLECTION'].includes(a.status)).length}
                    </p>
                </div>
                <div className="card border-l-4 border-gray-500 hover:shadow-lg transition">
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Total Applications</p>
                    <p className="text-3xl font-bold text-gray-700 mt-2">{applications.length}</p>
                </div>
            </div>

            {/* Applications List */}
            <div className="card">
                <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm mb-8">
                    <div className="flex flex-row gap-4 items-center">
                        <div className="flex-1 relative">
                            <Search className="absolute left-3 top-3 text-gray-400" size={20} />
                            <input
                                className="input pl-11 mt-0 w-full h-11 bg-gray-50 border-gray-200 focus:bg-white transition-all shadow-inner"
                                placeholder="Search by Farm Name, ID, or District..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <div className="hidden lg:flex items-center gap-2 pl-4 border-l border-gray-200">
                            <div className="flex flex-col">
                                <span className="text-[10px] font-bold text-gray-400 uppercase leading-none mb-1">Total Found</span>
                                <span className="text-lg font-bold text-emerald-700 leading-none">{filteredApplications.length}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {loading ? (
                    <div className="text-center py-12">
                        <div className="text-gray-400 text-lg">Loading applications...</div>
                    </div>
                ) : filteredApplications.length === 0 ? (
                    <div className="text-center py-12">
                        <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                        <p className="text-gray-500">No applications found</p>
                        <button onClick={() => navigate('/apply')} className="btn btn-primary mt-4">
                            Start Your First Application
                        </button>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-gray-50 border-b">
                                <tr>
                                    <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase">ID</th>
                                    <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase">Farm Name</th>
                                    <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase">District</th>
                                    <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase">Submitted</th>
                                    <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase">Status</th>
                                    <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {filteredApplications.map(app => {
                                    const statusConfig = getStatusConfig(app.status)
                                    return (
                                        <tr key={app.id} className="hover:bg-gray-50 transition">
                                            <td className="px-4 py-4 text-sm font-mono text-emerald-700 font-bold">#{app.id}</td>
                                            <td className="px-4 py-4">
                                                <p className="font-semibold">{app.farm_name}</p>
                                            </td>
                                            <td className="px-4 py-4 text-sm text-gray-600">{app.district}</td>
                                            <td className="px-4 py-4 text-sm text-gray-500">{app.created_at}</td>
                                            <td className="px-4 py-4">
                                                <span className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase flex items-center gap-1 w-fit ${statusConfig.color}`}>
                                                    {statusConfig.icon}
                                                    {statusConfig.label}
                                                </span>
                                            </td>
                                            <td className="px-4 py-4 text-right">
                                                <div className="flex justify-end gap-2">
                                                    <button
                                                        onClick={() => {
                                                            console.log('Eye icon clicked, app:', app)
                                                            setSelectedApp(app)
                                                        }}
                                                        className="p-2 text-emerald-600 hover:bg-emerald-50 rounded transition"
                                                        title="View Details"
                                                    >
                                                        <Eye size={18} />
                                                    </button>
                                                    {app.status === 'PENDING' && (
                                                        <button
                                                            onClick={() => handleEdit(app.id)}
                                                            className="p-2 text-amber-600 hover:bg-amber-50 rounded transition"
                                                            title="Edit Application"
                                                        >
                                                            <Pencil size={18} />
                                                        </button>
                                                    )}
                                                    {app.status === 'QUERIED' && (
                                                        <button
                                                            onClick={() => handleResubmit(app.id)}
                                                            className="p-2 text-cyan-600 hover:bg-cyan-50 rounded transition"
                                                            title="Edit & Resubmit"
                                                        >
                                                            <RefreshCw size={18} />
                                                        </button>
                                                    )}
                                                    {app.status === 'REJECTED' && (
                                                        <button
                                                            onClick={() => {
                                                                setSelectedApp(app)
                                                                setShowAppealModal(true)
                                                            }}
                                                            className="p-2 text-blue-600 hover:bg-blue-50 rounded transition"
                                                            title="Appeal Rejection"
                                                        >
                                                            <MessageSquare size={18} />
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Application Detail Modal */}
            <Modal
                isOpen={!!selectedApp}
                onClose={() => setSelectedApp(null)}
                title={selectedApp ? `Application #${selectedApp.id} - ${selectedApp.farm_name}` : ''}
            >
                {selectedApp && (
                    <div className="space-y-6">
                        {/* Status Banner */}
                        <div className={`p-4 rounded-lg border ${getStatusConfig(selectedApp.status).color.replace('text-', 'border-').replace('bg-', 'bg-opacity-10 ')}`}>
                            <div className="flex items-center gap-3">
                                {getStatusConfig(selectedApp.status).icon}
                                <div>
                                    <p className="font-bold text-sm uppercase">Status: {selectedApp.status.replace('_', ' ')}</p>
                                    <p className="text-xs opacity-90">Last updated: {selectedApp.created_at}</p>
                                </div>
                            </div>
                        </div>

                        {/* Rejection/Query Reason Display */}
                        {selectedApp.rejection_reason && (
                            <div className="bg-orange-50 border border-orange-200 p-4 rounded-lg">
                                <div className="flex items-start gap-2">
                                    <AlertCircle size={18} className="text-orange-600 mt-0.5" />
                                    <div>
                                        <p className="text-xs font-bold text-orange-800 uppercase mb-1">Reason for Query</p>
                                        <p className="text-sm text-orange-900">{selectedApp.rejection_reason}</p>
                                        {selectedApp.status === 'QUERIED' && (
                                            <button
                                                className="mt-3 btn btn-sm bg-emerald-600 text-white hover:bg-emerald-700"
                                                onClick={() => handleResubmit(selectedApp.id)}
                                            >
                                                <RefreshCw size={16} className="inline mr-1" /> Edit & Resubmit Application
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Survey Fee Notification */}
                        {/* Survey Fee Notification */}
                        {selectedApp.status === 'AWAITING_SURVEY_FEE' && (
                            <div className="bg-rose-50 border border-rose-200 p-4 rounded-lg">
                                <div className="flex items-start gap-3">
                                    <div className="p-2 bg-rose-100 rounded-lg text-rose-600">
                                        <DollarSign size={20} />
                                    </div>
                                    <div className="flex-1">
                                        <p className="text-xs font-bold text-rose-800 uppercase mb-1">Survey Fee Required</p>
                                        <p className="text-sm text-rose-900 mb-3">
                                            A technical survey is required for your property. Please visit the Department of Surveyor General to pay the technical survey fee of <strong>${selectedApp.survey_fee}</strong>.
                                        </p>
                                        <div className="bg-white p-3 rounded border border-rose-100 text-xs text-gray-500">
                                            Once payment is made, your status will be updated by the accounts department.
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Survey Fee Paid Status */}
                        {/* Survey Fee Paid Status */}
                        {selectedApp.status === 'SURVEY_FEE_PAID' && (
                            <div className="bg-green-50 border border-green-200 p-4 rounded-lg">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-green-100 rounded-lg text-green-600">
                                        <CheckCircle size={20} />
                                    </div>
                                    <div>
                                        <p className="text-xs font-bold text-green-800 uppercase">Waiting for Survey</p>
                                        <p className="text-sm text-green-900">Payment received. A surveyor is currently determining the status in the office and will update the portal shortly.</p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Payment Method Selection */}
                        {selectedApp.status === 'SELECT_PAYMENT' && !selectedApp.payment_plan && (
                            <div className="space-y-6">
                                {/* Valuation Result Summary Card */}
                                <div className="bg-white p-6 rounded-xl border-2 border-emerald-500 shadow-lg relative overflow-hidden">
                                    <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-50 rounded-full -mr-16 -mt-16 opacity-50" />
                                    <div className="relative z-10">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <div className="flex items-center gap-2 mb-1">
                                                    <CheckCircle size={16} className="text-emerald-600" />
                                                    <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">Valuation Approved</span>
                                                </div>
                                                <h3 className="text-2xl font-black text-gray-900 leading-tight">Your Approved Purchase Price</h3>
                                            </div>
                                            <div className="p-3 bg-emerald-600 text-white rounded-2xl shadow-inner">
                                                <DollarSign size={28} />
                                            </div>
                                        </div>

                                        <div className="mt-4 flex items-baseline gap-2">
                                            <span className="text-4xl font-extrabold text-emerald-600 tracking-tight">
                                                {selectedApp.purchase_price ? `$${parseFloat(selectedApp.purchase_price).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'Calculating...'}
                                            </span>
                                            <span className="text-sm font-bold text-gray-400 uppercase">Total</span>
                                        </div>

                                        <div className="mt-4 p-3 bg-gray-50 rounded-lg border border-gray-100">
                                            <p className="text-[11px] text-gray-600 flex items-start gap-2">
                                                <AlertCircle size={14} className="text-gray-400 mt-0.5 flex-shrink-0" />
                                                <span>
                                                    <strong>Note:</strong> This is the standard purchase price. Payment-specific incentives, such as the <strong>15% Cash Discount</strong>, will be applied automatically after you select your preferred payment method below.
                                                </span>
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-gradient-to-br from-emerald-50 to-green-50 border-2 border-emerald-300 p-6 rounded-xl shadow-md">
                                    <div className="flex items-center gap-3 mb-6">
                                        <div className="p-2 bg-emerald-600 rounded-lg text-white shadow-md">
                                            <FileText size={24} />
                                        </div>
                                        <div>
                                            <h3 className="text-lg font-bold text-emerald-900">Select Payment Plan</h3>
                                            <p className="text-sm text-emerald-700">Choose your preferred financing option</p>
                                        </div>
                                    </div>

                                    <div className="space-y-4">
                                        <div className="space-y-3">
                                            <label className="block text-sm font-bold text-gray-800">Payment Method *</label>

                                            <div className="space-y-2">
                                                <label className="flex items-center p-4 border-2 rounded-lg cursor-pointer hover:bg-emerald-50 transition-colors"
                                                    style={{ borderColor: paymentMethod === 'CASH' ? '#10b981' : '#e5e7eb' }}>
                                                    <input
                                                        type="radio"
                                                        name="paymentMethod"
                                                        value="CASH"
                                                        checked={paymentMethod === 'CASH'}
                                                        onChange={(e) => setPaymentMethod(e.target.value)}
                                                        className="mr-3 w-4 h-4 text-emerald-600"
                                                    />
                                                    <div>
                                                        <p className="font-semibold text-gray-900">Cash Payment</p>
                                                        <p className="text-xs text-gray-600">Pay the full amount directly</p>
                                                    </div>
                                                </label>

                                                <label className="flex items-center p-4 border-2 rounded-lg cursor-pointer hover:bg-emerald-50 transition-colors"
                                                    style={{ borderColor: paymentMethod === 'MORTGAGE' ? '#10b981' : '#e5e7eb' }}>
                                                    <input
                                                        type="radio"
                                                        name="paymentMethod"
                                                        value="MORTGAGE"
                                                        checked={paymentMethod === 'MORTGAGE'}
                                                        onChange={(e) => setPaymentMethod(e.target.value)}
                                                        className="mr-3 w-4 h-4 text-emerald-600"
                                                    />
                                                    <div>
                                                        <p className="font-semibold text-gray-900">Mortgage</p>
                                                        <p className="text-xs text-gray-600">Finance through a bank</p>
                                                    </div>
                                                </label>
                                            </div>
                                        </div>

                                        {paymentMethod === 'MORTGAGE' && (
                                            <div>
                                                <label className="block text-sm font-bold text-gray-800 mb-2">Select Bank *</label>
                                                <select
                                                    className="input w-full"
                                                    value={selectedBank}
                                                    onChange={(e) => setSelectedBank(e.target.value)}
                                                >
                                                    <option value="">-- Choose a bank --</option>
                                                    {BANK_CHOICES.map(bank => (
                                                        <option key={bank.value} value={bank.value}>{bank.label}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        )}

                                        <button
                                            className="btn bg-emerald-600 text-white hover:bg-emerald-700 w-full py-3 font-bold text-base shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                                            onClick={handleSubmitPaymentSelection}
                                            disabled={submittingPayment || !paymentMethod || (paymentMethod === 'MORTGAGE' && !selectedBank)}
                                        >
                                            {submittingPayment ? 'Submitting...' : 'Confirm Payment Method'}
                                        </button>

                                        <p className="text-xs text-gray-600 text-center">
                                            After selection, you will receive an invitation to visit the One Stop Center to sign your Agreement of Sale
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* One Stop Center Invitation (Agreement of Sale Stage) */}
                        {selectedApp.status === 'AGREEMENT_OF_SALE' && (
                            <div className="bg-emerald-50 border-2 border-emerald-200 p-6 rounded-xl shadow-inner">
                                <div className="flex items-start gap-4">
                                    <div className="p-3 bg-emerald-100 rounded-xl text-emerald-600">
                                        <FileText size={24} />
                                    </div>
                                    <div className="flex-1">
                                        <h3 className="text-lg font-bold text-emerald-900 mb-1">Visit One Stop Center</h3>
                                        <p className="text-sm text-emerald-800 mb-4">
                                            Your payment method has been confirmed. You are now invited to visit the One Stop Center physically to sign your Agreement of Sale.
                                        </p>

                                        <div className="grid md:grid-cols-2 gap-4">
                                            <div className="bg-white p-4 rounded-lg border border-emerald-100">
                                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Location</p>
                                                <p className="text-sm font-bold text-gray-900">One Stop Center Block 2 Makombe Building</p>
                                                <p className="text-xs text-gray-600">Corner Hebert Chitepo and Harare Street, Harare</p>
                                                <p className="text-xs font-bold text-emerald-700 mt-1">Phone: +263719012035</p>
                                                <div className="mt-3 pt-3 border-t border-gray-100">

                                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Office Hours</p>
                                                    <p className="text-xs font-medium text-emerald-700">Mon - Fri: 8:00 AM - 4:30 PM</p>
                                                </div>
                                            </div>

                                            <div className="bg-white p-4 rounded-lg border border-emerald-100">
                                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Required Items</p>
                                                <ul className="space-y-1.5">
                                                    <li className="flex items-center gap-2 text-xs text-gray-700">
                                                        <CheckCircle size={12} className="text-emerald-500" /> National ID (Original)
                                                    </li>
                                                    <li className="flex items-center gap-2 text-xs text-gray-700">
                                                        <CheckCircle size={12} className="text-emerald-500" /> Tenure Document (Original)
                                                    </li>
                                                    <li className="flex items-center gap-2 text-xs text-gray-700">
                                                        <CheckCircle size={12} className="text-emerald-500" /> Proof of Payment
                                                    </li>
                                                    <li className="flex items-center gap-2 text-xs font-bold text-emerald-800">
                                                        <CheckCircle size={12} className="text-emerald-500" /> $10 Processing Fee
                                                    </li>
                                                </ul>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}


                        {selectedApp.appeal_reason && (
                            <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg">
                                <p className="text-xs font-bold text-blue-800 uppercase mb-1">Your Appeal</p>
                                <p className="text-sm text-blue-900">{selectedApp.appeal_reason}</p>
                            </div>
                        )}


                        <div className="grid md:grid-cols-2 gap-6">
                            <div className="space-y-4">
                                <h4 className="font-semibold text-gray-900 border-b pb-2">Farm Information</h4>
                                <div className="grid grid-cols-2 gap-2 text-sm">
                                    <span className="text-gray-500">District:</span>
                                    <span className="font-medium text-gray-900">{selectedApp.district}</span>

                                    <span className="text-gray-500">Plot Number:</span>
                                    <span className="font-medium text-gray-900">{selectedApp.farm_id || 'Not assigned yet'}</span>

                                    <span className="text-gray-500">Farm Name:</span>
                                    <span className="font-medium text-gray-900">{selectedApp.farm_name}</span>

                                    <span className="text-gray-500">Extent:</span>
                                    <span className="font-medium text-gray-900">{selectedApp.farm_extent} Ha</span>

                                    <span className="text-gray-500">Tenure Type:</span>
                                    <span className="font-medium text-gray-900">{selectedApp.tenure_document_type}</span>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <h4 className="font-semibold text-gray-900 border-b pb-2">Payment Details</h4>
                                <div className="grid grid-cols-2 gap-2 text-sm">
                                    <span className="text-gray-500">Purchase Price:</span>
                                    <span className="font-medium text-gray-900">
                                        {selectedApp.purchase_price ? (
                                            `$${selectedApp.purchase_price}`
                                        ) : (
                                            ['SURVEYED', 'VALUATED'].includes(selectedApp.status) ?
                                                'Pending Director Approval' :
                                                'Calculating...'
                                        )}
                                    </span>

                                    <span className="text-gray-500">Payment Plan:</span>
                                    <span className="font-medium text-gray-900">
                                        {selectedApp.payment_plan || 'Not set'}
                                    </span>

                                    <span className="text-gray-500">Bank:</span>
                                    <span className="font-medium text-gray-900">
                                        {selectedApp.selected_bank || 'Not set'}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <h4 className="font-semibold text-gray-900 border-b pb-2">Verification Progress</h4>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div className={`text-center p-3 rounded bg-gray-50 ${selectedApp.lims_verification_status ? 'border-emerald-500 border' : ''}`}>
                                    <div className={`w-3 h-3 rounded-full mx-auto mb-2 ${selectedApp.lims_verification_status ? 'bg-emerald-600' : 'bg-gray-300'}`} />
                                    <span className="text-xs font-bold text-gray-600">LIMS Check</span>
                                </div>
                                <div className={`text-center p-3 rounded bg-gray-50 ${selectedApp.zlc_verification_status ? 'border-emerald-500 border' : ''}`}>
                                    <div className={`w-3 h-3 rounded-full mx-auto mb-2 ${selectedApp.zlc_verification_status ? 'bg-emerald-600' : 'bg-gray-300'}`} />
                                    <span className="text-xs font-bold text-gray-600">ZLC Check</span>
                                </div>
                                <div className={`text-center p-3 rounded bg-gray-50 ${selectedApp.is_surveyed ? 'border-emerald-500 border' : ''}`}>
                                    <div className={`w-3 h-3 rounded-full mx-auto mb-2 ${selectedApp.is_surveyed ? 'bg-emerald-600' : 'bg-gray-300'}`} />
                                    <span className="text-xs font-bold text-gray-600">Surveyed</span>
                                </div>
                                <div className={`text-center p-3 rounded bg-gray-50 ${selectedApp.valuation_approved ? 'border-emerald-500 border' : ''}`}>
                                    <div className={`w-3 h-3 rounded-full mx-auto mb-2 ${selectedApp.valuation_approved ? 'bg-emerald-600' : 'bg-gray-300'}`} />
                                    <span className="text-xs font-bold text-gray-600">Valuated</span>
                                </div>
                            </div>
                        </div>

                        {/* FINAL PRICE FOOTER */}
                        {selectedApp.purchase_price && (
                            <div style={{
                                marginTop: '1.5rem',
                                marginBottom: '0.5rem',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                padding: '1.25rem 1.5rem',
                                background: 'linear-gradient(to right, #064e3b, #065f46)',
                                borderRadius: '0.75rem',
                                boxShadow: '0 10px 25px rgba(6, 78, 59, 0.3)',
                                border: '1px solid #047857'
                            }}>
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                    <span style={{ fontSize: '0.875rem', fontWeight: '700', color: '#ffffff', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Final Purchase Price</span>
                                    {selectedApp.is_cash_payment && (
                                        <span style={{ fontSize: '0.75rem', color: '#a7f3d0', fontWeight: '500', marginTop: '2px' }}>Includes 15% Cash Discount</span>
                                    )}
                                </div>
                                <span style={{ fontSize: '1.875rem', fontWeight: '800', color: '#ffffff', letterSpacing: '-0.025em' }}>
                                    ${parseFloat(selectedApp.purchase_price).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                            </div>
                        )}

                        {/* Action Buttons */}
                        {selectedApp.status === 'PENDING' && (
                            <div className="mt-6 pt-6 border-t">
                                <div className="bg-amber-50 border border-amber-200 p-4 rounded-lg mb-4 flex items-start gap-2">
                                    <AlertCircle size={16} className="text-amber-600 mt-0.5 flex-shrink-0" />
                                    <p className="text-xs text-amber-800">
                                        Your application is currently under review. You may still edit and update your details before it is processed.
                                    </p>
                                </div>
                                <button
                                    className="btn bg-amber-600 text-white hover:bg-amber-700 w-full"
                                    onClick={() => {
                                        setSelectedApp(null)
                                        handleEdit(selectedApp.id)
                                    }}
                                >
                                    <Pencil size={18} className="inline mr-2" /> Edit Application
                                </button>
                            </div>
                        )}
                        {selectedApp.status === 'REJECTED' && !selectedApp.appeal_reason && (
                            <div className="mt-6 pt-6 border-t">
                                <button
                                    className="btn bg-emerald-600 text-white hover:bg-emerald-700 w-full"
                                    onClick={() => setShowAppealModal(true)}
                                >
                                    <MessageSquare size={18} className="inline mr-2" /> Submit Appeal
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </Modal>

            {/* Appeal Modal */}
            <Modal
                isOpen={showAppealModal}
                onClose={() => {
                    setShowAppealModal(false)
                    setAppealReason('')
                }}
                title="Submit Appeal"
            >
                <div className="space-y-4">
                    <p className="text-sm text-gray-600">Explain why you believe this rejection should be reconsidered. Your appeal will be reviewed by an administrator.</p>
                    <textarea
                        className="input w-full min-h-[120px]"
                        placeholder="Enter your appeal reason (e.g., 'The rejection was based on incorrect information. I have now provided the correct documents.')..."
                        value={appealReason}
                        onChange={(e) => setAppealReason(e.target.value)}
                    />
                    <div className="flex gap-3">
                        <button
                            className="btn bg-emerald-600 text-white hover:bg-emerald-700 flex-1"
                            onClick={handleAppeal}
                        >
                            Submit Appeal
                        </button>
                        <button
                            className="btn bg-gray-200 text-gray-700 hover:bg-gray-300 flex-1"
                            onClick={() => {
                                setShowAppealModal(false)
                                setAppealReason('')
                            }}
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            </Modal>
        </div>
    )
}

export default FarmerDashboard

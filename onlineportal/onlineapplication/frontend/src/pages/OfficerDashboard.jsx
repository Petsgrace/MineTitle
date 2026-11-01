import React, { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import {
    Search, Filter, Eye, Check, X, Info, FileText, FilePlus, AlertCircle,
    CheckCircle, DollarSign, MessageSquare, Briefcase, Users,
    ChevronDown, ChevronRight, ArrowUpRight, Clock, MapPin,
    RefreshCw, Sliders, ShieldAlert, BarChart2
} from 'lucide-react'
import Breadcrumb from '../components/Breadcrumb'
import Modal from '../components/Modal'
import StatCard from '../components/StatCard'
import StatusBadge from '../components/StatusBadge'
import SearchFilter from '../components/SearchFilter'
import useApplications from '../hooks/useApplications'
import useStats from '../hooks/useStats'
import useApplicationFilters from '../hooks/useApplicationFilters'
import applicationService from '../services/applicationService'
import { calculateSurveyFee } from '../utils/pricingUtils'
import { getStatusColor } from '../utils/statusUtils'
import { addToQueue, recordLocalAuditLog, getBeneficiaryMedia } from '../utils/offlineDB'

const OfficerDashboard = ({ user }) => {
    const [selectedApp, setSelectedApp] = useState(null)
    const [success, setSuccess] = useState('')
    const [showQueryModal, setShowQueryModal] = useState(false)
    const [queryReason, setQueryReason] = useState('')
    const [actionLoading, setActionLoading] = useState(false)
    const [tenureRegistryFilter, setTenureRegistryFilter] = useState('ALL')

    // Use custom hooks for data management
    const { applications, loading, error, setError, refreshApplications } = useApplications()
    const { stats, refreshStats } = useStats()

    // Initialize filter based on user role
    const { searchTerm, setSearchTerm, filterStatus, setFilterStatus, filteredApplications } = useApplicationFilters(applications)

    // Form state for various officer inputs
    const [officerComments, setOfficerComments] = useState('')
    const [isRecalculatingAI, setIsRecalculatingAI] = useState(false)
    const [aiError, setAiError] = useState('')
    const [aiSuccess, setAiSuccess] = useState('')

    // C4: What-If simulation state
    const [showWhatIf, setShowWhatIf] = useState(false)
    const [whatIfDistrict, setWhatIfDistrict] = useState('Goromonzi')
    const [whatIfHectares, setWhatIfHectares] = useState(50)
    const [whatIfOverlap, setWhatIfOverlap] = useState(false)
    const [whatIfRatio, setWhatIfRatio] = useState(0.15)
    const [whatIfResult, setWhatIfResult] = useState(null)
    const [isSimulatingWhatIf, setIsSimulatingWhatIf] = useState(false)

    // C5: District Risk Heatmap & Ranking state
    const [districtRisks, setDistrictRisks] = useState([])
    const [showDistrictRisks, setShowDistrictRisks] = useState(false)
    const [loadingDistrictRisks, setLoadingDistrictRisks] = useState(false)
    const [hectarage, setHectarage] = useState('')
    const [newFarmName, setNewFarmName] = useState('')
    const [oldDistrict, setOldDistrict] = useState('')
    const [isFeePaid, setIsFeePaid] = useState(false)
    const [hasDisputes, setHasDisputes] = useState(false)
    const [disputeNature, setDisputeNature] = useState('')
    const [isAppFeePaid, setIsAppFeePaid] = useState(false)

    // Check if new officer has no department or channels assigned
    const isUnassigned = !user || 
        user.role === 'unassigned' || 
        (user.role === 'officer' && !user.department && (!user.channels || user.channels.length === 0) && (!user.privileges || user.privileges.length === 0));

    if (isUnassigned) {
        return (
            <div className="max-w-2xl mx-auto py-16 px-4 text-center">
                <div className="card p-8 bg-white border border-amber-200 rounded-2xl shadow-lg space-y-4">
                    <div className="w-16 h-16 rounded-full bg-amber-100 text-amber-700 mx-auto flex items-center justify-center">
                        <AlertCircle size={32} />
                    </div>
                    <h2 className="text-2xl font-bold text-gray-900">No access assigned yet. Contact the System Admin.</h2>
                    <p className="text-gray-600 text-sm max-w-md mx-auto">
                        Your officer account has been created, but your operational department, processing channels, and statutory endorsement privileges have not yet been provisioned.
                    </p>
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 font-mono text-left space-y-1">
                        <div><strong>Officer:</strong> {user?.username || 'New Officer'}</div>
                        <div><strong>Role:</strong> {user?.role || 'Unassigned'}</div>
                        <div><strong>Department:</strong> Unassigned</div>
                        <div><strong>Status:</strong> Pending System Administrator Privileges Assignment</div>
                    </div>
                    <div className="pt-2">
                        <Link to="/" className="btn border border-gray-300 text-gray-700 hover:bg-gray-50 px-5 py-2.5 rounded-xl text-xs font-bold inline-flex items-center gap-1.5">
                            Return to Public Portal
                        </Link>
                    </div>
                </div>
            </div>
        );
    }

    // Load district risk rankings on mount
    useEffect(() => {
        let isMounted = true
        const loadDistricts = async () => {
            try {
                setLoadingDistrictRisks(true)
                const data = await applicationService.getAIDistrictRisk()
                if (isMounted && data && Array.isArray(data.districts)) {
                    setDistrictRisks(data.districts)
                }
            } catch (err) {
                // Silently handle if unmocked in unit tests
            } finally {
                if (isMounted) setLoadingDistrictRisks(false)
            }
        }
        loadDistricts()
        return () => { isMounted = false }
    }, [])

    // C2: Recalculate AI Dispute Prediction
    const handleRecalculateAI = async () => {
        if (!selectedApp) return
        setIsRecalculatingAI(true)
        setAiError('')
        setAiSuccess('')
        try {
            const res = await applicationService.recalculateAIDispute(selectedApp.id)
            setSelectedApp(prev => ({
                ...prev,
                ai_conflict_score: res.ai_conflict_score ?? res.risk_score,
                ai_conflict_level: res.ai_conflict_level ?? res.risk_level,
                ai_risk_reasons: res.ai_risk_reasons ?? res.top_contributing_features,
                ai_model_version: res.ai_model_version || "Gradient Boosting v2.1 (Prototype)",
                ai_assessed_at: res.ai_assessed_at || new Date().toISOString(),
                ai_conflict_details: res,
            }))
            setAiSuccess('Dispute risk re-evaluated against latest cadastral & tenure registry data.')
            refreshApplications()
        } catch (err) {
            setAiError(err.response?.data?.error || 'Failed to recalculate AI risk.')
        } finally {
            setIsRecalculatingAI(false)
        }
    }

    // C4: What-If simulation handler
    const handleSimulateWhatIf = async (e) => {
        if (e) e.preventDefault()
        setIsSimulatingWhatIf(true)
        try {
            const res = await applicationService.simulateAIWhatIf({
                district: whatIfDistrict,
                hectares: parseFloat(whatIfHectares) || 50,
                has_overlap: whatIfOverlap,
                overlap_ratio: whatIfOverlap ? parseFloat(whatIfRatio) || 0.15 : 0.0,
            })
            setWhatIfResult(res)
        } catch (err) {
            console.error('What-If simulation error:', err)
        } finally {
            setIsSimulatingWhatIf(false)
        }
    }

    // Valuation state
    const [valuationParams, setValuationParams] = useState({
        farm_extent: '',
        arable_area: '',
        improvements_value: '',
        water_source_distance: '',
        nearest_town: '',
        distance_to_town: '',
        ecological_region: ''
    })
    const [calculatedPricing, setCalculatedPricing] = useState(null)
    const [isCalculating, setIsCalculating] = useState(false)
    const [manualPrice, setManualPrice] = useState('')
    const [priceOverrideReason, setPriceOverrideReason] = useState('')

    // Set default filter based on role once on initial load or when role changes
    const initializedRoleRef = useRef(null)
    useEffect(() => {
        const currentRole = user?.role || 'all'
        if (initializedRoleRef.current === currentRole) return

        if (currentRole === 'resettlement') {
            setFilterStatus('PENDING')
            initializedRoleRef.current = currentRole
        } else if (currentRole === 'lims') {
            setFilterStatus('RESETTLEMENT_VERIFIED')
            initializedRoleRef.current = currentRole
        } else if (currentRole === 'zlc') {
            setFilterStatus('LIMS_VERIFIED')
            initializedRoleRef.current = currentRole
        } else if (currentRole === 'gis') {
            setFilterStatus('ZLC_CLEARED')
            initializedRoleRef.current = currentRole
        } else if (currentRole === 'surveyor') {
            if (!loading) {
                const hasGis = (applications || []).some(a => a.status === 'GIS_VALIDATED')
                setFilterStatus(hasGis ? 'GIS_VALIDATED' : 'ZLC_VERIFIED')
                initializedRoleRef.current = currentRole
            }
        } else if (currentRole === 'valuation') {
            setFilterStatus('SURVEYED')
            initializedRoleRef.current = currentRole
        } else if (currentRole === 'director') {
            setFilterStatus('VALUATED')
            initializedRoleRef.current = currentRole
        } else if (currentRole === 'deeds' || currentRole === 'conveyancer') {
            setFilterStatus('APPROVED')
            initializedRoleRef.current = currentRole
        } else {
            setFilterStatus('all')
            initializedRoleRef.current = currentRole
        }
    }, [user?.role, applications, loading])

    // Hydrate high-res biometric photos & signature from IndexedDB when an application is opened
    useEffect(() => {
        if (!selectedApp) return;
        const key = selectedApp.reference_number || selectedApp.receipt_number || selectedApp.statutory_fee_receipt;
        if (!key) return;
        if (!selectedApp.beneficiary_photo_front || !selectedApp.beneficiary_signature) {
            getBeneficiaryMedia(key).then(media => {
                if (media) {
                    setSelectedApp(prev => prev ? ({
                        ...prev,
                        beneficiary_photo_front: prev.beneficiary_photo_front || media.beneficiary_photo_front,
                        beneficiary_photo_side: prev.beneficiary_photo_side || media.beneficiary_photo_side,
                        beneficiary_id_front: prev.beneficiary_id_front || media.beneficiary_id_front,
                        beneficiary_id_back: prev.beneficiary_id_back || media.beneficiary_id_back,
                        beneficiary_signature: prev.beneficiary_signature || media.beneficiary_signature
                    }) : prev);
                }
            }).catch(() => {});
        }
    }, [selectedApp?.id, selectedApp?.reference_number]);

    // Initialize valuation params when app selected
    useEffect(() => {
        if (selectedApp && (user?.role === 'valuation' || user?.role === 'director')) {
            setValuationParams({
                farm_extent: selectedApp.farm_extent || 0,
                arable_area: selectedApp.arable_area || 0,
                distance_to_town: selectedApp.distance_to_town || 0,
                nearest_town: selectedApp.nearest_town || '',
                ecological_region: selectedApp.ecological_region || '',
                improvements_value: selectedApp.improvements_value || 0,
                water_source_distance: selectedApp.water_source_distance || ''
            })
            calculatePrice({
                ...selectedApp,
                farm_extent: selectedApp.farm_extent || 0,
                arable_area: selectedApp.arable_area || 0,
                improvements_value: selectedApp.improvements_value || 0,
                water_source_distance: selectedApp.water_source_distance || ''
            })
        }
    }, [selectedApp])

    const calculatePrice = async (params) => {
        setIsCalculating(true)
        try {
            const payload = {
                ...params,
                district: selectedApp?.district,
                is_cash_payment: selectedApp?.is_cash_payment || false,
                farmer: {
                    is_war_veteran: selectedApp?.farmer_is_war_veteran || false,
                    is_civil_servant: selectedApp?.farmer_is_civil_servant || false,
                    civil_service_years: selectedApp?.farmer_civil_service_years || 0
                },
                spouses: selectedApp?.spouses || []
            }
            const data = await applicationService.calculatePricing(payload)
            setCalculatedPricing(data)
        } catch (err) {
            console.error(err)
        } finally {
            setIsCalculating(false)
        }
    }

    const handleValuationChange = (field, value) => {
        const newParams = { ...valuationParams, [field]: value }
        setValuationParams(newParams)
        calculatePrice(newParams)
    }

    const syncLocalApplicationUpdate = (appId, updates, isOfflineQueued = false) => {
        const nowIso = new Date().toISOString()
        const stageTimestampMap = {
            RESETTLEMENT_VERIFIED: { resettlement_verified_at: nowIso },
            LIMS_VERIFIED: { lims_verified_at: nowIso, lims_verification_status: true },
            ZLC_CLEARED: { zlc_cleared_at: nowIso, zlc_verification_status: true },
            GIS_VALIDATED: { gis_validated_at: nowIso },
            SURVEYED: { survey_approved_at: nowIso, is_surveyed: true },
            VALUATED: { valuated_at: nowIso, valuation_approved: true },
            APPROVED: { director_signed_at: nowIso },
            READY_FOR_COLLECTION: { deed_issued_at: nowIso },
            AGREEMENT_OF_SALE: { agreement_generated_at: nowIso }
        }
        const autoStageDates = (updates && updates.status && stageTimestampMap[updates.status]) || {}
        const enrichedUpdates = {
            ...updates,
            ...autoStageDates,
            last_stage_action_at: nowIso,
            updated_at: nowIso,
            local_updated: true,
            synced: !isOfflineQueued
        }

        try {
            const raw = localStorage.getItem('my_submitted_applications')
            const list = raw ? JSON.parse(raw) : []
            if (Array.isArray(list)) {
                let matched = false
                const updatedList = list.map(item => {
                    if (item && (String(item.id) === String(appId) || (selectedApp?.reference_number && item.reference_number === selectedApp.reference_number))) {
                        matched = true
                        return { ...item, ...enrichedUpdates }
                    }
                    return item
                })
                if (!matched && selectedApp) {
                    updatedList.unshift({ ...selectedApp, ...enrichedUpdates })
                }
                localStorage.setItem('my_submitted_applications', JSON.stringify(updatedList))
            }
        } catch (e) {
            console.warn('Could not sync local application update:', e)
        }

        recordLocalAuditLog({
            action_type: updates?.status || 'STAGE_TRANSITION',
            reference_number: selectedApp?.reference_number || `APP-${appId}`,
            actor: user?.name || user?.username || 'Actioning Officer',
            from_stage: selectedApp?.status || 'PENDING',
            to_stage: updates?.status || 'UPDATED',
            comment: `Stage auto-advanced from ${selectedApp?.status || 'PENDING'} to ${updates?.status || 'UPDATED'} at ${new Date(nowIso).toLocaleString()}. ${updates?.officer_comments || ''}`.trim()
        })
    }

    const handleAction = async (appId, actionType) => {
        console.log('🔍 handleAction called:', { appId, actionType, userRole: user?.role });
        setActionLoading(true)
        let nextLocalStatus = selectedApp?.status || 'PENDING'
        const localExtraUpdates = {}
        if (officerComments) localExtraUpdates.officer_comments = officerComments

        try {
            const payload = { officer_comments: officerComments }

            if (actionType === 'Reject') {
                nextLocalStatus = 'REJECTED'
                localExtraUpdates.rejection_reason = officerComments || queryReason || 'Application rejected by officer.'
                await applicationService.reject(appId, {
                    officer_comments: officerComments || queryReason || 'Application rejected by officer.',
                    reason: officerComments || queryReason || 'Application rejected by officer.'
                })
            } else if (actionType === 'Escalate') {
                nextLocalStatus = 'REFERRED'
                await applicationService.escalate(appId, payload)
            } else if (user?.role === 'resettlement') {
                nextLocalStatus = 'RESETTLEMENT_VERIFIED'
                await applicationService.transitionStage(appId, {
                    target_stage: 'RESETTLEMENT_VERIFIED',
                    comment: officerComments || 'Resettlement documentation verified.'
                })
            } else if (user?.role === 'lims') {
                payload.status_action = actionType === 'Query' ? 'QUERY' : 'VERIFIED'
                if (actionType === 'Query') payload.reason = queryReason
                nextLocalStatus = actionType === 'Query' ? 'QUERIED' : 'LIMS_VERIFIED'
                await applicationService.verifyLims(appId, payload)
            } else if (user?.role === 'accounts') {
                payload.is_paid = isAppFeePaid
                nextLocalStatus = 'ACCOUNTS_VERIFIED'
                await applicationService.verifyApplicationFee(appId, payload)
            } else if (user?.role === 'estates') {
                nextLocalStatus = 'ESTATES_VERIFIED'
                await applicationService.verifyEstates(appId, payload)
            } else if (user?.role === 'zlc') {
                payload.has_disputes = hasDisputes
                if (hasDisputes) payload.dispute_nature = disputeNature
                nextLocalStatus = hasDisputes ? 'QUERIED' : 'ZLC_CLEARED'
                await applicationService.verifyZlc(appId, payload)
            } else if (user?.role === 'gis') {
                nextLocalStatus = 'GIS_VALIDATED'
                await applicationService.transitionStage(appId, {
                    target_stage: 'GIS_VALIDATED',
                    comment: officerComments || 'GIS spatial boundaries validated.'
                })
            } else if (user?.role === 'surveyor') {
                if (actionType === 'RequireSurvey') {
                    nextLocalStatus = 'AWAITING_SURVEY_FEE'
                    await applicationService.requireTechnicalSurvey(appId)
                } else {
                    payload.farm_extent = hectarage
                    payload.farm_name = newFarmName
                    payload.old_district = oldDistrict
                    payload.is_fee_paid = isFeePaid
                    nextLocalStatus = 'SURVEYED'
                    if (hectarage) localExtraUpdates.farm_extent = hectarage
                    if (newFarmName) localExtraUpdates.farm_name = newFarmName
                    await applicationService.markSurveyed(appId, payload)
                }
            } else if (user?.role === 'valuation') {
                const valuationPayload = {
                    officer_comments: officerComments,
                    farm_extent: valuationParams.farm_extent,
                    arable_area: valuationParams.arable_area,
                    distance_to_town: valuationParams.distance_to_town,
                    nearest_town: valuationParams.nearest_town,
                    ecological_region: valuationParams.ecological_region
                };

                if (manualPrice) {
                    valuationPayload.manual_price = manualPrice;
                    valuationPayload.price_override_reason = priceOverrideReason;
                }

                nextLocalStatus = 'VALUATED'
                await applicationService.approveValuation(appId, valuationPayload)
            } else if (user?.role === 'director') {
                if (actionType === 'Conclude') {
                    nextLocalStatus = 'COMPLETED'
                    await applicationService.concludeApplication(appId, payload)
                } else {
                    const directorPayload = {
                        ...payload,
                        farm_extent: valuationParams.farm_extent,
                        arable_area: valuationParams.arable_area,
                        distance_to_town: valuationParams.distance_to_town,
                        nearest_town: valuationParams.nearest_town,
                        ecological_region: valuationParams.ecological_region,
                        improvements_value: valuationParams.improvements_value,
                        water_source_distance: valuationParams.water_source_distance,
                    };
                    if (manualPrice) {
                        directorPayload.manual_price = manualPrice;
                        directorPayload.price_override_reason = priceOverrideReason;
                    }
                    nextLocalStatus = 'APPROVED'
                    console.log('✅ Director approval - calling approve endpoint', { appId, directorPayload });
                    await applicationService.approve(appId, directorPayload)
                }
            } else if (user?.role === 'deeds') {
                nextLocalStatus = 'READY_FOR_COLLECTION'
                await applicationService.transitionStage(appId, {
                    target_stage: 'READY_FOR_COLLECTION',
                    comment: officerComments || 'Title Deed sealed and ready for collection.'
                })
            } else if (user?.role === 'conveyancer') {
                nextLocalStatus = 'AGREEMENT_OF_SALE'
                await applicationService.generateAgreement(appId)
            } else if (user?.role === 'admin') {
                const stageSequence = [
                    'PENDING',
                    'RESETTLEMENT_VERIFIED',
                    'LIMS_VERIFIED',
                    'ZLC_CLEARED',
                    'GIS_VALIDATED',
                    'SURVEYED',
                    'VALUATED',
                    'APPROVED',
                    'READY_FOR_COLLECTION'
                ]
                const currentStatus = selectedApp?.status || 'PENDING'
                const idx = stageSequence.indexOf(currentStatus)
                nextLocalStatus = (idx >= 0 && idx < stageSequence.length - 1)
                    ? stageSequence[idx + 1]
                    : 'APPROVED'
                await applicationService.transitionStage(appId, {
                    target_stage: nextLocalStatus,
                    comment: officerComments || `Admin advanced stage to ${nextLocalStatus}.`
                })
            }

            syncLocalApplicationUpdate(appId, { status: nextLocalStatus, ...localExtraUpdates })
            console.log('✅ Action successful!');
            setSuccess(`${actionType} successful!`)
            setOfficerComments('')
            refreshApplications()
            refreshStats()
            setSelectedApp(null)
        } catch (err) {
            console.error('❌ Action failed:', err)
            if (!err.response) {
                // Offline / unreachable backend fallback: persist update locally and queue for cloud sync
                syncLocalApplicationUpdate(appId, { status: nextLocalStatus, ...localExtraUpdates }, true)
                addToQueue({
                    url: `/applications/${appId}/transition/`,
                    method: 'POST',
                    body: {
                        target_stage: nextLocalStatus,
                        comment: officerComments || `${actionType} by ${user?.role || 'officer'}`,
                        updated_at: new Date().toISOString()
                    },
                    idempotency_key: `stage-${appId}-${nextLocalStatus}`,
                    entity_type: 'stage_transition'
                }).catch(() => {})
                setSuccess(`${actionType} saved locally (offline mode)!`)
                setOfficerComments('')
                refreshApplications()
                setSelectedApp(null)
            } else {
                console.error('Error details:', err.response?.data || err.message)
                setError(err.response?.data?.error || err.response?.data?.detail || "Action failed")
            }
        } finally {
            setActionLoading(false)
        }
    }

    const handleQuery = async () => {
        if (!selectedApp || !queryReason) return
        setActionLoading(true)
        try {
            if (user?.role === 'lims') {
                await applicationService.verifyLims(selectedApp.id, {
                    status_action: 'QUERY',
                    reason: queryReason
                })
            } else if (user?.role === 'director') {
                await applicationService.referBack(selectedApp.id, { reason: queryReason })
            } else {
                await applicationService.reject(selectedApp.id, { reason: queryReason })
            }

            const successMsg = user?.role === 'director'
                ? `Application #${selectedApp.id} has been referred back to valuation officer.`
                : `Application #${selectedApp.id} has been queried successfully!`
            setSuccess(successMsg)
            refreshApplications()
            refreshStats()
            setSelectedApp(null)
            setShowQueryModal(false)
            setQueryReason('')
            window.scrollTo({ top: 0, behavior: 'smooth' })
        } catch (err) {
            console.error(err)
            setError(err.response?.data?.error || 'Failed to process request.')
        } finally {
            setActionLoading(false)
        }
    }

    // Status options for filter
    const statusOptions = [
        { value: 'PENDING', label: '1. 🕒 PENDING (Resettlement Review)' },
        { value: 'RESETTLEMENT_VERIFIED', label: '2. 🏡 RESETTLEMENT_VERIFIED' },
        { value: 'LIMS_VERIFIED', label: '3. ✅ LIMS_VERIFIED' },
        { value: 'ZLC_CLEARED', label: '4. 🏢 ZLC_CLEARED' },
        { value: 'GIS_VALIDATED', label: '5. 📍 GIS_VALIDATED' },
        { value: 'SURVEYED', label: '6. 📐 SURVEYED' },
        { value: 'VALUATED', label: '7. 💰 VALUATED' },
        { value: 'APPROVED', label: '8. 🌟 APPROVED' },
        { value: 'READY_FOR_COLLECTION', label: '9. 🎁 READY_FOR_COLLECTION' },
    ]

    return (
        <div className="space-y-8">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900">Officer Dashboard</h1>
                    <p className="text-gray-500 mt-1">Manage and verify title deed applications</p>
                </div>
                <div className="flex items-center gap-3">
                    {user?.role !== 'surveyor' && user?.role !== 'zlc' && (
                    <Link
                        to="/apply"
                        className="btn flex items-center gap-2 font-bold px-4 py-2"
                        style={{ backgroundColor: '#1d4ed8', color: '#ffffff', border: '2px solid #1e40af', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}
                    >
                        <FilePlus size={18} />
                        Capture Hard-Copy Application
                    </Link>
                    )}
                    <Link
                        to="/gis-map"
                        className="btn flex items-center gap-2 font-bold px-4 py-2 text-gray-900 bg-white border-2 border-gray-300 shadow-sm"
                    >
                        <MapPin size={18} className="text-emerald-400" />
                        GIS Spatial Map
                    </Link>
                    <Link
                        to="/reports"
                        className="btn flex items-center gap-2 font-bold px-4 py-2"
                        style={{ backgroundColor: '#eab308', color: '#1a1a1a', border: '2px solid #ca8a04', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}
                    >
                        <FileText size={18} />
                        View Reports
                    </Link>
                    <div className="flex items-center gap-2 px-3 py-1 bg-white border border-gray-200 rounded-lg shadow-sm">
                        <Briefcase size={16} className="text-emerald-600" />
                        <span className="font-semibold text-sm text-emerald-900 capitalize">Role: {user?.role || 'Officer'}</span>
                    </div>
                </div>
            </div>

            {/* Success/Error Messages */}
            {success && (
                <div className="bg-green-50 text-green-700 p-4 rounded-lg text-sm flex items-center gap-2 border border-green-200">
                    <CheckCircle size={18} />
                    <span>{success}</span>
                </div>
            )}
            {error && (
                <div className="bg-red-50 text-red-700 p-4 rounded-lg text-sm flex items-center gap-2 border border-red-200">
                    <AlertCircle size={18} />
                    <span>{error}</span>
                </div>
            )}

            {/* Stats Cards - using extracted component */}
            <div className="grid md:grid-cols-3 gap-6 mb-8">
                <div className="bg-white p-6 rounded-xl border border-gray-200 border-l-4 border-l-amber-500 shadow-sm hover:shadow-md transition cursor-pointer" onClick={() => setFilterStatus('all')}>
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Pending Your Action</p>
                            <p className="text-3xl font-black text-amber-600">{stats.pending_count}</p>
                        </div>
                        <div className="p-2 bg-amber-50 rounded-lg text-amber-600">
                            <AlertCircle size={24} />
                        </div>
                    </div>
                    <p className="text-[10px] text-gray-400 mt-4 font-medium italic">Records requiring immediate attention</p>
                </div>

                <div className="bg-white p-6 rounded-xl border border-gray-200 border-l-4 border-l-emerald-500 shadow-sm hover:shadow-md transition">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Actioned Today</p>
                            <p className="text-3xl font-black text-emerald-600">{stats.today_count}</p>
                        </div>
                        <div className="p-2 bg-emerald-50 rounded-lg text-emerald-600">
                            <CheckCircle size={24} />
                        </div>
                    </div>
                    <p className="text-[10px] text-gray-400 mt-4 font-medium italic">Your progress for today</p>
                </div>

                <div className="bg-white p-6 rounded-xl border border-gray-200 border-l-4 border-l-blue-500 shadow-sm hover:shadow-md transition">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Cumulative Work</p>
                            <p className="text-3xl font-black text-blue-600">{stats.cumulative_count}</p>
                        </div>
                        <div className="p-2 bg-blue-50 rounded-lg text-blue-600">
                            <FileText size={24} />
                        </div>
                    </div>
                    <p className="text-[10px] text-gray-400 mt-4 font-medium italic">Total career actions on records</p>
                </div>
            </div>

            {/* C5: District Risk Ranking / Heatmap Accordion */}
            <div className="mb-6 bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <BarChart2 size={18} className="text-indigo-600" />
                        <h4 className="font-bold text-gray-900 text-sm">District Dispute Risk Index (From Real Stored Records)</h4>
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-semibold border border-indigo-200">
                            {districtRisks.length} Districts Analyzed
                        </span>
                    </div>
                    <button
                        type="button"
                        onClick={() => setShowDistrictRisks(!showDistrictRisks)}
                        className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition"
                    >
                        {showDistrictRisks ? 'Hide Heatmap ▲' : 'View Risk Heatmap ▼'}
                    </button>
                </div>

                {showDistrictRisks && (
                    <div className="mt-4 pt-3 border-t border-gray-100">
                        {districtRisks.length === 0 ? (
                            <p className="text-xs text-gray-500 py-2 italic">
                                No district dispute statistics recorded yet. Assessments will populate here automatically as applications are scored.
                            </p>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                                {districtRisks.map((d, idx) => {
                                    const avg = Math.round(d.avg_score || 0)
                                    const badgeClass = avg >= 70 ? 'bg-rose-100 text-rose-800 border-rose-300' :
                                                       avg >= 30 ? 'bg-amber-100 text-amber-800 border-amber-300' :
                                                       'bg-emerald-100 text-emerald-800 border-emerald-300'
                                    return (
                                        <div key={idx} className="p-3 bg-gray-50 rounded-lg border border-gray-200 space-y-1">
                                            <div className="flex justify-between items-center">
                                                <span className="font-bold text-xs text-gray-900">{d.district || 'Unspecified'}</span>
                                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${badgeClass}`}>
                                                    {avg}% Risk
                                                </span>
                                            </div>
                                            <div className="flex justify-between text-[11px] text-gray-600">
                                                <span>Applications: <strong>{d.total_scored}</strong></span>
                                                <span>High-Risk: <strong className="text-rose-600">{d.high_risk_count}</strong></span>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                        <p className="text-[10px] text-gray-400 mt-2 italic text-right">
                            Aggregated from stored AI conflict scores across statutory applications.
                        </p>
                    </div>
                )}
            </div>

            {/* Search and Filter - using extracted component */}
            <SearchFilter
                searchTerm={searchTerm}
                onSearchChange={setSearchTerm}
                filterStatus={filterStatus}
                onFilterChange={setFilterStatus}
                resultCount={filteredApplications.length}
                statusOptions={statusOptions}
            />

            {/* Applications Table with A1 vs A2 Registry Separation */}
            <div className="card">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
                    <h3 className="font-bold text-lg flex items-center gap-2">
                        <FileText size={20} className="text-emerald-600" />
                        Applications for Verification
                    </h3>
                    <div className="flex flex-wrap items-center gap-1.5 text-xs">
                        <button
                            type="button"
                            onClick={() => setTenureRegistryFilter('ALL')}
                            className={`px-3 py-1.5 rounded-lg font-bold border transition ${tenureRegistryFilter === 'ALL' ? 'bg-emerald-700 text-white border-emerald-800' : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'}`}
                        >
                            All Registry ({filteredApplications.length})
                        </button>
                        <button
                            type="button"
                            onClick={() => setTenureRegistryFilter('A1')}
                            className={`px-3 py-1.5 rounded-lg font-bold border transition ${tenureRegistryFilter === 'A1' ? 'bg-amber-600 text-white border-amber-700' : 'bg-amber-50 text-amber-900 border-amber-200 hover:bg-amber-100'}`}
                        >
                            A1 Registry (Permits / Offer Letters) ({filteredApplications.filter(a => /a1|offer letter|settlement/i.test(String(a.tenure_document_type || 'Offer Letter'))).length})
                        </button>
                        <button
                            type="button"
                            onClick={() => setTenureRegistryFilter('A2')}
                            className={`px-3 py-1.5 rounded-lg font-bold border transition ${tenureRegistryFilter === 'A2' ? 'bg-blue-600 text-white border-blue-700' : 'bg-blue-50 text-blue-900 border-blue-200 hover:bg-blue-100'}`}
                        >
                            A2 Registry (99-Year / A2 Leases) ({filteredApplications.filter(a => !/a1|offer letter|settlement/i.test(String(a.tenure_document_type || 'Offer Letter'))).length})
                        </button>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-gray-50 border-b">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">ID</th>
                                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">Applicant</th>
                                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">Farm Detail</th>
                                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">Status</th>
                                <th className="px-4 py-3 text-right text-xs font-bold text-gray-500 uppercase">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {loading ? (
                                <tr>
                                    <td colSpan="5" className="px-6 py-12 text-center text-gray-500">
                                        Loading applications...
                                    </td>
                                </tr>
                            ) : filteredApplications.length === 0 ? (
                                <tr>
                                    <td colSpan="5" className="px-6 py-12 text-center text-gray-500">
                                        No applications found matching your criteria.
                                    </td>
                                </tr>
                            ) : (
                                filteredApplications
                                    .filter(app => {
                                        if (tenureRegistryFilter === 'ALL') return true;
                                        const isA1 = /a1|offer letter|settlement/i.test(String(app.tenure_document_type || 'Offer Letter'));
                                        return tenureRegistryFilter === 'A1' ? isA1 : !isA1;
                                    })
                                    .map(app => {
                                        const isA1 = /a1|offer letter|settlement/i.test(String(app.tenure_document_type || 'Offer Letter'));
                                        return (
                                    <tr key={app.id} className="hover:bg-gray-50 transition">
                                        <td className="px-4 py-4 text-sm font-mono text-emerald-700 font-bold">
                                            <div>#{app.id}</div>
                                            {app.reference_number && <div className="text-[10px] text-gray-500">{app.reference_number}</div>}
                                        </td>
                                        <td className="px-4 py-4">
                                            <p className="font-semibold">{app.farmer}</p>
                                            <p className="text-xs text-gray-500">Submitted {app.date}</p>
                                        </td>
                                        <td className="px-4 py-4">
                                            <div className="flex items-center gap-1.5">
                                                <p className="text-sm font-medium">{app.farm_name}</p>
                                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${isA1 ? 'bg-amber-50 text-amber-800 border-amber-200' : 'bg-blue-50 text-blue-800 border-blue-200'}`}>
                                                    {isA1 ? 'A1' : 'A2'}
                                                </span>
                                            </div>
                                            <p className="text-xs text-emerald-600 font-medium">{app.district} • {app.tenure_document_type || 'Offer Letter'}</p>
                                        </td>
                                        <td className="px-4 py-4">
                                            <span className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase ${getStatusColor(app.status)}`}>
                                                {(app.status || 'PENDING').replace(/_/g, ' ')}
                                            </span>
                                        </td>
                                        <td className="px-4 py-4 text-right">
                                            <div className="flex justify-end gap-2">
                                                <button
                                                    className="p-2 text-emerald-600 hover:bg-emerald-50 rounded transition"
                                                    title="View Details"
                                                    onClick={() => {
                                                        setSelectedApp(app);
                                                        setOfficerComments(app.officer_comments || '');
                                                        setNewFarmName(app.farm_name || '');
                                                        setOldDistrict(app.old_district || '');
                                                    }}
                                                >
                                                    <Eye size={18} />
                                                </button>
                                                <button
                                                    onClick={() => setSelectedApp(app)}
                                                    className="btn btn-icon btn-primary"
                                                    title="Approve / Process"
                                                >
                                                    <Check size={18} />
                                                </button>
                                                {user?.role !== 'finance' && (
                                                    <button
                                                        onClick={() => {
                                                            setSelectedApp(app)
                                                            setShowQueryModal(true)
                                                        }}
                                                        className="btn btn-icon btn-danger"
                                                        title="Query / Reject"
                                                    >
                                                        <X size={18} />
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                        );
                                    })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Detail Modal - Keeping as is for now (too complex to extract fully in one go) */}
            {/* The modal content has been tested and works, keeping it inline for stability */}
            <Modal
                isOpen={!!selectedApp}
                onClose={() => setSelectedApp(null)}
                title="Application Details"
                maxWidth="max-w-4xl"
            >
                {selectedApp && (() => {
                    // Calculate pricingData once for the entire modal
                    const pricingData = {
                        ...selectedApp,
                        ...(calculatedPricing || {}),
                        // Preserve selectedApp values if calculatedPricing doesn't have them
                        ecological_region: calculatedPricing?.ecological_region || selectedApp.ecological_region,
                        base_rate_per_hectare: calculatedPricing?.base_rate_per_hectare || selectedApp.base_rate_per_hectare,
                        standard_rate_per_hectare: calculatedPricing?.standard_rate_per_hectare || selectedApp.standard_rate_per_hectare,
                        war_vet_concession_rate: calculatedPricing?.war_vet_concession_rate || selectedApp.war_vet_concession_rate,
                        war_vet_threshold_ha: calculatedPricing?.war_vet_threshold_ha || selectedApp.war_vet_threshold_ha,
                        land_class_discount: calculatedPricing?.land_class_discount ?? selectedApp.land_class_discount,
                        water_premium: calculatedPricing?.water_premium ?? selectedApp.water_premium,
                        town_premium: calculatedPricing?.town_premium ?? selectedApp.town_premium,
                        calculated_land_value: calculatedPricing?.calculated_land_value || selectedApp.calculated_land_value,
                        purchase_price: calculatedPricing?.purchase_price || selectedApp.purchase_price,
                    };

                    return (
                        <div className="space-y-6">
                            {/* C2: Full Dispute Risk Card */}
                            <div className={`p-4 rounded-xl border ${
                                (selectedApp.ai_conflict_level === 'HIGH' || selectedApp.has_disputes) 
                                    ? 'bg-rose-50 border-rose-200 text-rose-900' 
                                    : (selectedApp.ai_conflict_level === 'MEDIUM' 
                                        ? 'bg-amber-50 border-amber-200 text-amber-900' 
                                        : 'bg-emerald-50 border-emerald-200 text-emerald-900')
                            }`}>
                                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                                    <div className="flex items-center gap-2 font-bold text-sm">
                                        <span className="text-lg">🤖</span>
                                        <span>Dispute Risk Assessment</span>
                                        <span className="text-[11px] px-2 py-0.5 rounded bg-white/80 border border-gray-300 font-normal">
                                            {selectedApp.ai_model_version || 'Gradient Boosting Prototype v2.1'}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                                            (selectedApp.ai_conflict_level === 'HIGH' || selectedApp.has_disputes)
                                                ? 'bg-rose-100 text-rose-800 border border-rose-300'
                                                : (selectedApp.ai_conflict_level === 'MEDIUM'
                                                    ? 'bg-amber-100 text-amber-800 border border-amber-300'
                                                    : 'bg-emerald-100 text-emerald-800 border border-emerald-300')
                                        }`}>
                                            Dispute Risk: {(selectedApp.ai_conflict_score !== undefined && selectedApp.ai_conflict_score !== null) 
                                                ? `${selectedApp.ai_conflict_score}% (${selectedApp.ai_conflict_level || 'LOW'})` 
                                                : 'Not yet assessed'}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={handleRecalculateAI}
                                            disabled={isRecalculatingAI}
                                            className="px-2.5 py-1 text-xs font-bold bg-white text-gray-800 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-1 shadow-sm transition disabled:opacity-50"
                                            title="Recalculate risk against latest cadastral polygons and tenure registry"
                                        >
                                            <RefreshCw size={12} className={isRecalculatingAI ? "animate-spin text-indigo-600" : "text-gray-600"} />
                                            {isRecalculatingAI ? 'Recalculating...' : 'Recalculate'}
                                        </button>
                                        <span className="px-2 py-0.5 rounded bg-white text-gray-700 border border-gray-200 text-xs font-mono">
                                            🔒 SHA-256 Ledger
                                        </span>
                                    </div>
                                </div>

                                {/* Statutory Advisory Label & Evaluated Timestamp */}
                                <div className="bg-white/80 p-2.5 rounded-lg border border-gray-200/70 text-[11px] text-gray-700 mb-3 flex flex-wrap items-center justify-between gap-1">
                                    <span className="font-semibold text-gray-800">
                                        Prototype model - trained on synthetic data - advisory only
                                    </span>
                                    <span className="text-gray-500 font-mono">
                                        Last evaluated: {selectedApp.ai_assessed_at ? new Date(selectedApp.ai_assessed_at).toLocaleString() : 'Pending evaluation'}
                                    </span>
                                </div>

                                {/* Top 3 to 5 Contributing Factors in Plain Words */}
                                <div className="text-xs space-y-1.5 text-gray-800">
                                    <div className="font-bold text-gray-700">Top Contributing Factors:</div>
                                    {selectedApp.ai_risk_reasons && selectedApp.ai_risk_reasons.length > 0 ? (
                                        <ul className="list-disc list-inside space-y-1 pl-1">
                                            {selectedApp.ai_risk_reasons.slice(0, 5).map((reason, idx) => (
                                                <li key={idx} className="text-gray-700">
                                                    {typeof reason === 'string' ? reason : (reason.description || reason.feature || JSON.stringify(reason))}
                                                </li>
                                            ))}
                                        </ul>
                                    ) : (
                                        <div className="space-y-1 text-gray-600">
                                            <p>
                                                <strong>Cadastral Conflict Scan:</strong> {selectedApp.has_disputes 
                                                    ? `⚠️ Dispute detected: ${selectedApp.dispute_nature || 'Boundary collision under review'}` 
                                                    : '✅ Cadastral polygon boundary clear; no spatial collisions with gazetted parcels.'}
                                            </p>
                                            <p>
                                                <strong>Tenure Risk Vector:</strong> District baseline for {selectedApp.district || 'Zimbabwe'} synchronized.
                                            </p>
                                        </div>
                                    )}
                                </div>

                                {aiSuccess && <p className="text-xs text-emerald-700 mt-2 font-medium">✓ {aiSuccess}</p>}
                                {aiError && <p className="text-xs text-rose-700 mt-2 font-medium">⚠ {aiError}</p>}
                            </div>

                            {/* C4: What-If Simulation Panel (Advisory Demo - No Changes Saved) */}
                            <div className="bg-gradient-to-r from-slate-50 to-indigo-50/50 p-4 rounded-xl border border-indigo-100 text-xs">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-1.5 font-bold text-indigo-950">
                                        <Sliders size={15} className="text-indigo-600" />
                                        <span>What-If Scenario Simulator</span>
                                        <span className="text-[10px] text-gray-500 font-normal italic">(Advisory Demo - No records modified)</span>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setShowWhatIf(!showWhatIf)}
                                        className="text-indigo-600 hover:text-indigo-800 font-bold text-xs"
                                    >
                                        {showWhatIf ? 'Close Simulator ▲' : 'Open Simulator ▼'}
                                    </button>
                                </div>

                                {showWhatIf && (
                                    <form onSubmit={handleSimulateWhatIf} className="mt-3 pt-3 border-t border-indigo-100 space-y-3">
                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                            <div>
                                                <label className="block text-gray-700 font-semibold mb-1">Simulated District</label>
                                                <select
                                                    value={whatIfDistrict}
                                                    onChange={(e) => setWhatIfDistrict(e.target.value)}
                                                    className="w-full px-2.5 py-1.5 bg-white border border-gray-300 rounded-lg text-xs"
                                                >
                                                    <option value="Goromonzi">Goromonzi (High Volatility)</option>
                                                    <option value="Mazowe">Mazowe (High Volatility)</option>
                                                    <option value="Zvimba">Zvimba (Medium Volatility)</option>
                                                    <option value="Seke">Seke (Medium Volatility)</option>
                                                    <option value="Marondera">Marondera (Medium Volatility)</option>
                                                    <option value="Chegutu">Chegutu (Low Volatility)</option>
                                                    <option value="Chinhoyi">Chinhoyi (Low Volatility)</option>
                                                    <option value="Gweru">Gweru (Baseline)</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block text-gray-700 font-semibold mb-1">
                                                    Parcel Extent: <strong className="text-indigo-600">{whatIfHectares} Ha</strong>
                                                </label>
                                                <input
                                                    type="range"
                                                    min="5"
                                                    max="500"
                                                    step="5"
                                                    value={whatIfHectares}
                                                    onChange={(e) => setWhatIfHectares(Number(e.target.value))}
                                                    className="w-full mt-2"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-gray-700 font-semibold mb-1">Cadastral Boundary Overlap</label>
                                                <div className="flex items-center gap-3 pt-1">
                                                    <label className="inline-flex items-center gap-1.5 cursor-pointer">
                                                        <input
                                                            type="checkbox"
                                                            checked={whatIfOverlap}
                                                            onChange={(e) => setWhatIfOverlap(e.target.checked)}
                                                            className="rounded text-indigo-600"
                                                        />
                                                        <span className="text-gray-800 font-medium">Boundary Collision</span>
                                                    </label>
                                                    {whatIfOverlap && (
                                                        <span className="text-[11px] text-rose-600 font-bold">15% Spatial Clash</span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex items-center justify-between pt-1">
                                            <button
                                                type="submit"
                                                disabled={isSimulatingWhatIf}
                                                className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-xs shadow-sm transition disabled:opacity-50"
                                            >
                                                {isSimulatingWhatIf ? 'Running Simulation...' : 'Simulate Scenario'}
                                            </button>
                                            <span className="text-[10px] text-gray-500">Read-only endpoint: POST /api/v1/ai/what-if/</span>
                                        </div>

                                        {whatIfResult && (
                                            <div className={`mt-2 p-3 rounded-lg border text-xs ${
                                                whatIfResult.risk_level === 'HIGH' ? 'bg-rose-50 border-rose-200 text-rose-900' :
                                                whatIfResult.risk_level === 'MEDIUM' ? 'bg-amber-50 border-amber-200 text-amber-900' :
                                                'bg-emerald-50 border-emerald-200 text-emerald-900'
                                            }`}>
                                                <div className="flex items-center justify-between font-bold mb-1">
                                                    <span>Simulation Result: {whatIfResult.risk_score}% ({whatIfResult.risk_level} RISK)</span>
                                                    <span className="text-[10px] font-mono">Advisory Preview</span>
                                                </div>
                                                {whatIfResult.contributing_reasons && (
                                                    <ul className="list-disc list-inside space-y-0.5 text-[11px]">
                                                        {whatIfResult.contributing_reasons.map((r, i) => (
                                                            <li key={i}>{typeof r === 'string' ? r : r.description}</li>
                                                        ))}
                                                    </ul>
                                                )}
                                            </div>
                                        )}
                                    </form>
                                )}
                            </div>

                            {/* Main Info */}
                            <div className="space-y-6">
                                <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                                    <h4 className="text-sm font-bold text-gray-900 uppercase tracking-wide mb-4">Applicant Information</h4>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                                        <div className="p-2.5 bg-white rounded-lg border border-gray-200">
                                            <span className="text-gray-500 font-medium">Beneficiary: </span>
                                            <strong className="text-gray-900">{selectedApp.farmer || `${selectedApp.farmer_name || ''} ${selectedApp.farmer_surname || ''}`.trim()}</strong>
                                        </div>
                                        <div className="p-2.5 bg-white rounded-lg border border-gray-200">
                                            <span className="text-gray-500 font-medium">National ID: </span>
                                            <strong className="text-gray-900 font-mono">{selectedApp.national_id || 'N/A'}</strong>
                                        </div>
                                        <div className="p-2.5 bg-white rounded-lg border border-gray-200">
                                            <span className="text-gray-500 font-medium">Email: </span>
                                            <span className="text-gray-900">{selectedApp.email || 'N/A'}</span>
                                        </div>
                                        <div className="p-2.5 bg-white rounded-lg border border-gray-200">
                                            <span className="text-gray-500 font-medium">Mobile: </span>
                                            <span className="text-gray-900 font-mono">{selectedApp.telephone || 'N/A'}</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                                    <h4 className="text-sm font-bold text-gray-900 uppercase tracking-wide mb-4">Farm Details</h4>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                                        <div className="p-2.5 bg-white rounded-lg border border-gray-200">
                                            <span className="text-gray-500 font-medium">Receipt Number: </span>
                                            <strong className="text-gray-900 font-mono">{selectedApp.receipt_number || `TD-20261024-${String(selectedApp.id).padStart(6, '0')}`}</strong>
                                        </div>
                                        <div className="p-2.5 bg-white rounded-lg border border-gray-200">
                                            <span className="text-gray-500 font-medium">Ref Number: </span>
                                            <strong className="text-emerald-800 font-mono">{selectedApp.reference_number || `REF-${String(selectedApp.id).padStart(6, '0')}`}</strong>
                                        </div>
                                        <div className="p-2.5 bg-white rounded-lg border border-gray-200">
                                            <span className="text-gray-500 font-medium">Farm Name: </span>
                                            <strong className="text-gray-900">{selectedApp.farm_name || 'N/A'}</strong>
                                        </div>
                                        <div className="p-2.5 bg-white rounded-lg border border-gray-200">
                                            <span className="text-gray-500 font-medium">District: </span>
                                            <span className="text-gray-900">{selectedApp.district || 'N/A'}</span>
                                        </div>
                                        <div className="p-2.5 bg-white rounded-lg border border-gray-200">
                                            <span className="text-gray-500 font-medium">Plot Number: </span>
                                            <span className="text-gray-900 font-mono">{selectedApp.farm_id || 'Not assigned'}</span>
                                        </div>
                                        <div className="p-2.5 bg-white rounded-lg border border-gray-200">
                                            <span className="text-gray-500 font-medium">Total Extent: </span>
                                            <span className="text-gray-900 font-semibold">{selectedApp.farm_extent} Ha</span>
                                        </div>
                                        <div className="p-2.5 bg-white rounded-lg border border-gray-200">
                                            <span className="text-gray-500 font-medium">Estimated Value: </span>
                                            <strong className="text-emerald-700 font-bold">{selectedApp.purchase_price ? `$${Number(selectedApp.purchase_price).toLocaleString()}` : 'Pending Valuation'}</strong>
                                        </div>
                                        <div className="p-2.5 bg-white rounded-lg border border-gray-200">
                                            <span className="text-gray-500 font-medium">Time Stamp: </span>
                                            <span className="text-gray-700 font-mono">{selectedApp.created_at ? new Date(selectedApp.created_at).toISOString().replace('T', ' ').slice(0, 16) : '2026-10-24 11:24'}</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Uploaded Documents */}
                                <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                                    <h4 className="text-sm font-bold text-gray-900 uppercase tracking-wide mb-4">Uploaded Documents</h4>

                                    {/* Farmer Documents */}
                                    <div className="space-y-2 mb-4">
                                        <p className="text-xs font-semibold text-gray-600 uppercase">Applicant Documents</p>
                                        <div className="grid grid-cols-1 gap-2">
                                            {selectedApp.national_id_copy && (
                                                <a href={selectedApp.national_id_copy} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-3 py-2 bg-white border rounded-lg hover:bg-blue-50 hover:border-blue-300 transition group">
                                                    <span className="text-blue-600 text-lg">📄</span>
                                                    <span className="text-sm font-medium text-gray-700 group-hover:text-blue-700">National ID Copy</span>
                                                    <span className="ml-auto text-xs text-blue-600 font-semibold">View →</span>
                                                </a>
                                            )}
                                            {selectedApp.tenure_document && (
                                                <a href={selectedApp.tenure_document} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-3 py-2 bg-white border rounded-lg hover:bg-blue-50 hover:border-blue-300 transition group">
                                                    <span className="text-blue-600 text-lg">📋</span>
                                                    <span className="text-sm font-medium text-gray-700 group-hover:text-blue-700">Tenure Document</span>
                                                    <span className="ml-auto text-xs text-blue-600 font-semibold">View →</span>
                                                </a>
                                            )}
                                            {selectedApp.war_vet_id_copy && (
                                                <a href={selectedApp.war_vet_id_copy} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-3 py-2 bg-white border rounded-lg hover:bg-amber-50 hover:border-amber-300 transition group">
                                                    <span className="text-amber-600 text-lg">🎖️</span>
                                                    <span className="text-sm font-medium text-gray-700 group-hover:text-amber-700">War Veteran ID</span>
                                                    <span className="ml-auto text-xs text-amber-600 font-semibold">View →</span>
                                                </a>
                                            )}
                                            {selectedApp.employment_proof && (
                                                <a href={selectedApp.employment_proof} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-3 py-2 bg-white border rounded-lg hover:bg-blue-50 hover:border-blue-300 transition group">
                                                    <span className="text-blue-600 text-lg">💼</span>
                                                    <span className="text-sm font-medium text-gray-700 group-hover:text-blue-700">Employment Proof</span>
                                                    <span className="ml-auto text-xs text-blue-600 font-semibold">View →</span>
                                                </a>
                                            )}
                                            {selectedApp.other_attachments && (
                                                <a href={selectedApp.other_attachments} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-3 py-2 bg-white border rounded-lg hover:bg-blue-50 hover:border-blue-300 transition group">
                                                    <span className="text-gray-500 text-lg">📎</span>
                                                    <span className="text-sm font-medium text-gray-700 group-hover:text-blue-700">Other Attachments</span>
                                                    <span className="ml-auto text-xs text-blue-600 font-semibold">View →</span>
                                                </a>
                                            )}
                                            {!selectedApp.national_id_copy && !selectedApp.tenure_document && !selectedApp.war_vet_id_copy && !selectedApp.employment_proof && !selectedApp.other_attachments && (
                                                <p className="text-xs text-gray-400 italic px-2">No applicant documents uploaded</p>
                                            )}
                                        </div>
                                    </div>

                                    {/* Spouse Documents */}
                                    {selectedApp.spouses && selectedApp.spouses.length > 0 && selectedApp.spouses.some(s => s.war_vet_id_copy || s.employment_proof) && (
                                        <div className="space-y-2 border-t pt-3">
                                            <p className="text-xs font-semibold text-gray-600 uppercase">Spouse Documents</p>
                                            {selectedApp.spouses.map((spouse, idx) => (
                                                (spouse.war_vet_id_copy || spouse.employment_proof) && (
                                                    <div key={idx} className="ml-1">
                                                        <p className="text-xs font-medium text-purple-700 mb-1">
                                                            {spouse.first_name} {spouse.surname}
                                                        </p>
                                                        <div className="grid grid-cols-1 gap-2 ml-2">
                                                            {spouse.war_vet_id_copy && (
                                                                <a href={spouse.war_vet_id_copy} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-3 py-2 bg-white border rounded-lg hover:bg-purple-50 hover:border-purple-300 transition group">
                                                                    <span className="text-amber-600 text-lg">🎖️</span>
                                                                    <span className="text-sm font-medium text-gray-700 group-hover:text-purple-700">War Veteran ID</span>
                                                                    <span className="ml-auto text-xs text-purple-600 font-semibold">View →</span>
                                                                </a>
                                                            )}
                                                            {spouse.employment_proof && (
                                                                <a href={spouse.employment_proof} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-3 py-2 bg-white border rounded-lg hover:bg-purple-50 hover:border-purple-300 transition group">
                                                                    <span className="text-blue-600 text-lg">💼</span>
                                                                    <span className="text-sm font-medium text-gray-700 group-hover:text-purple-700">Employment Proof</span>
                                                                    <span className="ml-auto text-xs text-purple-600 font-semibold">View →</span>
                                                                </a>
                                                            )}
                                                        </div>
                                                    </div>
                                                )
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* Pricing Breakdown - Shown for all staff roles once calculated */}
                                {(selectedApp.purchase_price || calculatedPricing) && (

                                    <div className="bg-gradient-to-br from-emerald-50 to-teal-50 p-5 rounded-xl border-2 border-emerald-200 shadow-sm">
                                        <h4 className="text-sm font-bold text-emerald-900 uppercase tracking-wide mb-4">
                                            Purchase Price Valuation
                                        </h4>

                                        {/* Table-based Pricing Calculation */}
                                        <div className="bg-white rounded-lg border border-emerald-200 overflow-hidden">
                                            {/* Farm Basic Information */}
                                            <div className="bg-emerald-50 px-4 py-2 border-b border-emerald-200">
                                                <div className="grid grid-cols-2 gap-4 text-xs">
                                                    <div>
                                                        <span className="font-semibold text-gray-700">Region: </span>
                                                        <span className="text-gray-900">{pricingData.ecological_region || 'N/A'}</span>
                                                    </div>
                                                    <div>
                                                        <span className="font-semibold text-gray-700">Farm Size: </span>
                                                        <span className="text-gray-900">{selectedApp.farm_extent || 0} Ha</span>
                                                    </div>
                                                    {selectedApp.arable_area && (
                                                        <div className="col-span-2">
                                                            <span className="font-semibold text-gray-700">Arable Area: </span>
                                                            <span className="text-gray-900">
                                                                {selectedApp.arable_area} Ha ({selectedApp.farm_extent > 0 ? ((selectedApp.arable_area / selectedApp.farm_extent) * 100).toFixed(1) : 0}%)
                                                            </span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Progressive Rate Calculation Table */}
                                            {(() => {
                                                const isWarVet = pricingData.is_war_veteran || selectedApp.farmer_is_war_veteran;
                                                const totalHa = parseFloat(pricingData.hectares || pricingData.farm_extent || 0);
                                                const thresholdHa = parseFloat(pricingData.war_vet_threshold_ha || 10);
                                                const concessionRate = parseFloat(pricingData.war_vet_concession_rate || 6);
                                                const standardRate = parseFloat(pricingData.standard_rate_per_hectare || 825);
                                                
                                                // Calculate composite rate if war vet
                                                const baseRateToUse = (() => {
                                                    if (isWarVet && totalHa > 0) {
                                                        const concessionHa = Math.min(totalHa, thresholdHa);
                                                        const excessHa = Math.max(totalHa - thresholdHa, 0);
                                                        const baseVal = (concessionHa * concessionRate) + (excessHa * standardRate);
                                                        return baseVal / totalHa;
                                                    }
                                                    return parseFloat(pricingData.base_rate_per_hectare || 0);
                                                })();

                                                return (
                                                    <div className="divide-y divide-gray-200">
                                                        {/* Base Rate */}
                                                        {pricingData.base_rate_per_hectare && (
                                                            <div className="px-4 py-2.5 hover:bg-gray-50">
                                                                <div className="flex justify-between items-start">
                                                                    <div className="flex-1">
                                                                        <span className="text-sm font-semibold text-gray-900">Base Rate per Hectare</span>
                                                                        {isWarVet ? (
                                                                            <div>
                                                                                <p className="text-[10px] text-amber-700 font-semibold mt-0.5">
                                                                                    ⭐ War Veteran Concession Framework
                                                                                </p>
                                                                                <div className="mt-1 space-y-0.5 text-[10px] text-gray-500">
                                                                                    <p>• Concession Rate: {`$${concessionRate.toFixed(2)}/Ha`} (first {thresholdHa} Ha)</p>
                                                                                    <p>• Standard Rate for {pricingData.ecological_region}: {`$${standardRate.toFixed(2)}/Ha`}</p>
                                                                                </div>
                                                                            </div>
                                                                        ) : (
                                                                            <p className="text-[10px] text-gray-500 mt-0.5">Standard rate for {pricingData.ecological_region}</p>
                                                                        )}
                                                                    </div>
                                                                    <div className="text-right">
                                                                        {isWarVet ? (
                                                                            <div>
                                                                                <span className="text-sm font-bold text-blue-700">{`$${concessionRate.toFixed(2)}/Ha`}</span>
                                                                                {totalHa > thresholdHa && (
                                                                                    <p className="text-[9px] text-gray-500 mt-0.5">
                                                                                        {`Composite: $${baseRateToUse.toFixed(2)}/Ha`}
                                                                                    </p>
                                                                                )}
                                                                            </div>
                                                                        ) : (
                                                                            <span className="text-sm font-bold text-blue-700">{`$${parseFloat(pricingData.base_rate_per_hectare).toFixed(2)}/Ha`}</span>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        )}

                                                        {/* Land Class Discount */}
                                                        {pricingData.land_class_discount > 0 && pricingData.base_rate_per_hectare && (
                                                            <div className="px-4 py-2.5 bg-red-50/30">
                                                                <div className="flex justify-between items-center">
                                                                    <div className="flex-1">
                                                                        <span className="text-sm text-gray-700">Land Class Discount</span>
                                                                        <p className="text-[10px] text-gray-500 mt-0.5">Applied for farms with less than 80% arable land</p>
                                                                    </div>
                                                                    <div className="text-right">
                                                                        <span className="text-sm font-semibold text-red-600">-{parseFloat(pricingData.land_class_discount).toFixed(1)}%</span>
                                                                    </div>
                                                                </div>
                                                                <div className="flex justify-between items-center mt-2 pt-2 border-t border-red-200">
                                                                    <span className="text-xs font-medium text-gray-600">→ Adjusted Rate (Land Quality)</span>
                                                                    <span className="text-sm font-bold text-gray-900">
                                                                        {`$${(baseRateToUse * (1 - parseFloat(pricingData.land_class_discount) / 100)).toFixed(2)}/Ha`}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        )}

                                                        {/* Water Source Premium */}
                                                        {pricingData.water_premium > 0 && (
                                                            <div className="px-4 py-2.5 bg-blue-50/30">
                                                                <div className="flex justify-between items-center">
                                                                    <div className="flex-1">
                                                                        <span className="text-sm text-gray-700">Water Source Premium</span>
                                                                        <p className="text-[10px] text-gray-500 mt-0.5">
                                                                            {selectedApp.water_source_distance === 'on_farm' ? 'Water source on-site' :
                                                                                selectedApp.water_source_distance === 'within_5km' ? 'Within 5km' : 'Has water access'}
                                                                        </p>
                                                                    </div>
                                                                    <div className="text-right">
                                                                        <span className="text-sm font-semibold text-blue-600">+{parseFloat(pricingData.water_premium).toFixed(1)}%</span>
                                                                    </div>
                                                                </div>
                                                                {pricingData.base_rate_per_hectare && (
                                                                    <div className="flex justify-between items-center mt-2 pt-2 border-t border-blue-200">
                                                                        <span className="text-xs font-medium text-gray-600">→ Adjusted Rate (Water Access)</span>
                                                                        <span className="text-sm font-bold text-gray-900">
                                                                            {`$${(() => {
                                                                                let rate = baseRateToUse;
                                                                                if (pricingData.land_class_discount > 0) {
                                                                                    rate *= (1 - parseFloat(pricingData.land_class_discount) / 100);
                                                                                }
                                                                                rate *= (1 + parseFloat(pricingData.water_premium) / 100);
                                                                                return rate.toFixed(2);
                                                                            })()}/Ha`}
                                                                        </span>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}

                                                        {/* Town Proximity Premium/Discount */}
                                                        {pricingData.town_premium !== 0 && pricingData.town_premium !== undefined && (
                                                            <div className="px-4 py-2.5 bg-blue-50/30">
                                                                <div className="flex justify-between items-center">
                                                                    <div className="flex-1">
                                                                        <span className="text-sm text-gray-700">Town Proximity {pricingData.town_premium >= 0 ? 'Premium' : 'Discount'}</span>
                                                                        <p className="text-[10px] text-gray-500 mt-0.5">
                                                                            {selectedApp.distance_to_town || 0}km from {selectedApp.nearest_town || 'nearest town'}
                                                                        </p>
                                                                    </div>
                                                                    <div className="text-right">
                                                                        <span className={`text-sm font-semibold ${pricingData.town_premium >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                                                                            {pricingData.town_premium >= 0 ? '+' : ''}{parseFloat(pricingData.town_premium).toFixed(1)}%
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                                {pricingData.base_rate_per_hectare && (
                                                                    <div className="flex justify-between items-center mt-2 pt-2 border-t border-blue-200">
                                                                        <span className="text-xs font-medium text-gray-600">→ Final Rate per Hectare</span>
                                                                        <span className="text-sm font-bold text-emerald-700">
                                                                            {`$${(() => {
                                                                                let rate = baseRateToUse;
                                                                                if (pricingData.land_class_discount > 0) {
                                                                                    rate *= (1 - parseFloat(pricingData.land_class_discount) / 100);
                                                                                }
                                                                                if (pricingData.water_premium > 0) {
                                                                                    rate *= (1 + parseFloat(pricingData.water_premium) / 100);
                                                                                }
                                                                                rate *= (1 + parseFloat(pricingData.town_premium) / 100);
                                                                                return rate.toFixed(2);
                                                                            })()}/Ha`}
                                                                        </span>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}

                                                        {/* Total Land Purchase Price */}
                                                        {pricingData.calculated_land_value && (
                                                            <div className="px-4 py-3 bg-amber-50 border-t-2 border-amber-200">
                                                                <div className="flex justify-between items-center">
                                                                    <div>
                                                                        <span className="text-sm font-bold text-amber-900">Land Value (Before Beneficiary Discounts)</span>
                                                                        {pricingData.base_rate_per_hectare && (
                                                                            <p className="text-[10px] text-amber-700 mt-0.5">
                                                                                {`${totalHa} Ha × Final Rate: $${(() => {
                                                                                    let rate = baseRateToUse;
                                                                                    if (pricingData.land_class_discount > 0) {
                                                                                        rate *= (1 - parseFloat(pricingData.land_class_discount) / 100);
                                                                                    }
                                                                                    if (pricingData.water_premium > 0) {
                                                                                        rate *= (1 + parseFloat(pricingData.water_premium) / 100);
                                                                                    }
                                                                                    if (pricingData.town_premium !== undefined) {
                                                                                        rate *= (1 + parseFloat(pricingData.town_premium) / 100);
                                                                                    }
                                                                                    return rate.toFixed(2);
                                                                                })()}/Ha`}
                                                                            </p>
                                                                        )}
                                                                    </div>
                                                                    <span className="text-lg font-bold text-amber-700">
                                                                        ${parseFloat(pricingData.calculated_land_value).toFixed(2)}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        )}

                                                        {/* War Veteran Special Pricing Note */}
                                                        {isWarVet && (
                                                            <div className="px-4 py-3 bg-amber-50 border-t-2 border-amber-200">
                                                                <p className="text-xs text-amber-800 font-medium mb-1">⭐ War Veteran Concession Rate & 85% Discount Framework Applied</p>
                                                                <p className="text-[10px] text-amber-700">
                                                                    {`Concession Rate: $${concessionRate.toFixed(2)}/ha for ${pricingData.ecological_region || 'Region'} (Directive 20 April 2026)`}
                                                                </p>
                                                            </div>
                                                        )}

                                                        {/* Improvements */}
                                                        {selectedApp.improvements_value && parseFloat(selectedApp.improvements_value) > 0 && (
                                                            <div className="px-4 py-2.5 bg-green-50/30">
                                                                <div className="flex justify-between items-center">
                                                                    <span className="text-sm font-medium text-gray-700">Improvements Value</span>
                                                                    <span className="text-sm font-bold text-green-600">+${parseFloat(selectedApp.improvements_value).toFixed(2)}</span>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })()}
                                        </div>

                                        {/* Beneficiary Discounts Section */}
                                        <div className="mt-4 bg-white rounded-lg border border-purple-200 overflow-hidden">
                                            <div className="bg-purple-50 px-4 py-2 border-b border-purple-200 flex justify-between items-center">
                                                <h5 className="text-xs font-bold text-purple-900 uppercase">Beneficiary Discounts (Sequential Compounding)</h5>
                                                <span className="text-[10px] text-purple-700 font-medium">Applied highest to lowest %</span>
                                            </div>
                                            <div className="px-4 py-3 space-y-2">
                                                {/* Dynamic applied discounts if calculated by backend */}
                                                {pricingData.applied_discounts && pricingData.applied_discounts.length > 0 ? (
                                                    pricingData.applied_discounts.map((disc, idx) => (
                                                        <div key={idx} className="flex justify-between items-center py-1.5 px-2 bg-purple-50/50 rounded border border-purple-100">
                                                            <div>
                                                                <span className="text-sm font-medium text-purple-900">{disc.source}</span>
                                                                <span className="text-xs text-purple-700 ml-2">({disc.type})</span>
                                                            </div>
                                                            <div className="text-right">
                                                                <span className="text-sm font-bold text-purple-800">-{disc.rate}%</span>
                                                                {disc.amount > 0 && (
                                                                    <span className="text-xs text-gray-500 block">(-${disc.amount.toFixed(2)})</span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    ))
                                                ) : (
                                                    <>
                                                        {/* Cash Payment Discount */}
                                                        {selectedApp.is_cash_payment && (
                                                            <div className="flex justify-between items-center py-1.5 px-2 bg-blue-50 rounded">
                                                                <span className="text-sm text-blue-700">Cash Payment Option</span>
                                                                <span className="text-sm font-semibold text-blue-700">-15%</span>
                                                            </div>
                                                        )}

                                                        {/* Farmer War Veteran Discount */}
                                                        {selectedApp.farmer_is_war_veteran && (
                                                            <div className="flex justify-between items-center py-1.5 px-2 bg-emerald-50 rounded">
                                                                <span className="text-sm text-emerald-700">Farmer - War Veteran</span>
                                                                <span className="text-sm font-semibold text-emerald-700">-85%</span>
                                                            </div>
                                                        )}

                                                        {/* Farmer Ex-Detainee / Non-Combatant */}
                                                        {selectedApp.farmer_is_ex_detainee && (
                                                            <div className="flex justify-between items-center py-1.5 px-2 bg-emerald-50 rounded">
                                                                <span className="text-sm text-emerald-700">Farmer - Ex-Detainee / Non-Combatant</span>
                                                                <span className="text-sm font-semibold text-emerald-700">-30%</span>
                                                            </div>
                                                        )}

                                                        {/* Farmer Collaborator */}
                                                        {selectedApp.farmer_is_collaborator && (
                                                            <div className="flex justify-between items-center py-1.5 px-2 bg-emerald-50 rounded">
                                                                <span className="text-sm text-emerald-700">Farmer - Collaborator</span>
                                                                <span className="text-sm font-semibold text-emerald-700">-15%</span>
                                                            </div>
                                                        )}

                                                        {/* Farmer Civil Servant Discount */}
                                                        {selectedApp.farmer_is_civil_servant && (
                                                            <div className="flex justify-between items-center py-1.5 px-2 bg-emerald-50 rounded">
                                                                <span className="text-sm text-emerald-700">Farmer - Civil Servant ({selectedApp.farmer_civil_service_years || 0} years)</span>
                                                                <span className="text-sm font-semibold text-emerald-700">
                                                                    -{selectedApp.farmer_civil_service_years > 40 ? '30%' : selectedApp.farmer_civil_service_years > 20 ? '20%' : selectedApp.farmer_civil_service_years > 10 ? '10%' : '5%'}
                                                                </span>
                                                            </div>
                                                        )}

                                                        {/* Spouse Discounts */}
                                                        {selectedApp.spouses && selectedApp.spouses.length > 0 && selectedApp.spouses.map((spouse, idx) => (
                                                            <React.Fragment key={idx}>
                                                                {spouse.is_war_veteran && (
                                                                    <div className="flex justify-between items-center py-1.5 px-2 bg-purple-50 rounded">
                                                                        <span className="text-sm text-purple-700">Spouse ({spouse.first_name}) - War Veteran</span>
                                                                        <span className="text-sm font-semibold text-purple-700">-85%</span>
                                                                    </div>
                                                                )}
                                                                {spouse.is_ex_detainee && (
                                                                    <div className="flex justify-between items-center py-1.5 px-2 bg-purple-50 rounded">
                                                                        <span className="text-sm text-purple-700">Spouse ({spouse.first_name}) - Ex-Detainee / Non-Combatant</span>
                                                                        <span className="text-sm font-semibold text-purple-700">-30%</span>
                                                                    </div>
                                                                )}
                                                                {spouse.is_collaborator && (
                                                                    <div className="flex justify-between items-center py-1.5 px-2 bg-purple-50 rounded">
                                                                        <span className="text-sm text-purple-700">Spouse ({spouse.first_name}) - Collaborator</span>
                                                                        <span className="text-sm font-semibold text-purple-700">-15%</span>
                                                                    </div>
                                                                )}
                                                                {spouse.is_civil_servant && (
                                                                    <div className="flex justify-between items-center py-1.5 px-2 bg-purple-50 rounded">
                                                                        <span className="text-sm text-purple-700">Spouse ({spouse.first_name}) - Civil Servant ({spouse.civil_service_years || 0} yrs)</span>
                                                                        <span className="text-sm font-semibold text-purple-700">
                                                                            -{spouse.civil_service_years > 40 ? '30%' : spouse.civil_service_years > 20 ? '20%' : spouse.civil_service_years > 10 ? '10%' : '5%'}
                                                                        </span>
                                                                    </div>
                                                                )}
                                                            </React.Fragment>
                                                        ))}

                                                        {/* No discounts message */}
                                                        {!selectedApp.is_cash_payment &&
                                                            !selectedApp.farmer_is_war_veteran &&
                                                            !selectedApp.farmer_is_ex_detainee &&
                                                            !selectedApp.farmer_is_collaborator &&
                                                            !selectedApp.farmer_is_civil_servant &&
                                                            (!selectedApp.spouses || selectedApp.spouses.length === 0 ||
                                                                !selectedApp.spouses.some(s => s.is_war_veteran || s.is_ex_detainee || s.is_collaborator || s.is_civil_servant)) && (
                                                                <p className="text-xs text-gray-500 italic px-2">No beneficiary discounts applied</p>
                                                            )}
                                                    </>
                                                )}
                                            </div>
                                        </div>

                                        {/* Final Purchase Price After All Discounts */}
                                        {(pricingData?.purchase_price || selectedApp.purchase_price) && (
                                            <div className="mt-4 rounded-lg border-2 overflow-hidden shadow-lg" style={{ background: 'linear-gradient(to right, #047857, #065f46)', borderColor: '#10b981' }}>
                                                <div className="px-5 py-4">
                                                    <div className="flex justify-between items-center">
                                                        <div>
                                                            <h5 className="text-sm font-bold uppercase tracking-wide" style={{ color: '#ffffff' }}>Final Purchase Price</h5>
                                                            <p className="text-xs mt-0.5" style={{ color: '#ffffff', opacity: 0.95 }}>After all beneficiary discounts applied</p>
                                                        </div>
                                                        <div className="text-right">
                                                            <span className="text-3xl font-extrabold tracking-tight" style={{ color: '#ffffff' }}>
                                                                ${parseFloat(pricingData?.purchase_price || selectedApp.purchase_price).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                    </div>
                                )}


                                {/* VALUATION OFFICER INPUTS */}
                                {(user?.role === 'valuation' || user?.role === 'director') && (
                                    <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-100 space-y-4 mt-4">
                                        <h4 className="text-sm font-bold text-emerald-900 uppercase tracking-wide">
                                            Valuation Parameters {!selectedApp.valuation_approved ? '(Editable)' : '(Read Only)'}
                                        </h4>

                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-xs font-medium text-gray-700 mb-1">Farm Extent (Ha)</label>
                                                <input
                                                    type="number"
                                                    className="input text-sm h-9"
                                                    value={valuationParams.farm_extent}
                                                    onChange={(e) => handleValuationChange('farm_extent', e.target.value)}
                                                    disabled={selectedApp.valuation_approved && user.role !== 'director'} // Director can edit
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-medium text-gray-700 mb-1">Arable Area (Ha)</label>
                                                <input
                                                    type="number"
                                                    className="input text-sm h-9"
                                                    value={valuationParams.arable_area}
                                                    onChange={(e) => handleValuationChange('arable_area', e.target.value)}
                                                    disabled={selectedApp.valuation_approved && user.role !== 'director'}
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-medium text-gray-700 mb-1">Distance to Town (km)</label>
                                                <input
                                                    type="number"
                                                    className="input text-sm h-9"
                                                    value={valuationParams.distance_to_town}
                                                    onChange={(e) => handleValuationChange('distance_to_town', e.target.value)}
                                                    disabled={selectedApp.valuation_approved && user.role !== 'director'}
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-medium text-gray-700 mb-1">Nearest Town</label>
                                                <select
                                                    className="input text-sm h-9"
                                                    value={valuationParams.nearest_town}
                                                    onChange={(e) => handleValuationChange('nearest_town', e.target.value)}
                                                    disabled={selectedApp.valuation_approved && user.role !== 'director'}
                                                >
                                                    <option value="">Select Town</option>
                                                    {['Harare', 'Bulawayo', 'Gweru', 'Mutare', 'Marondera', 'Chinhoyi', 'Masvingo', 'Bindura', 'Kadoma', 'Kwekwe', 'Chegutu', 'Gwanda', 'Norton', 'Chitungwiza', 'Chiredzi', 'Rusape', 'Hwange', 'Beitbridge', 'Chipinge', 'Karoi', 'Chivhu', 'Nyanga', 'Banket', 'Victoria Falls', 'Zvishavane', 'Shurugwi', 'Redcliff', 'Ruwa', 'Mazowe'].map(town => (
                                                        <option key={town} value={town}>{town}</option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block text-xs font-medium text-gray-700 mb-1">Eco Region</label>
                                                <select
                                                    className="input text-sm h-9"
                                                    value={valuationParams.ecological_region}
                                                    onChange={(e) => handleValuationChange('ecological_region', e.target.value)}
                                                    disabled={selectedApp.valuation_approved && user.role !== 'director'}
                                                >
                                                    <option value="">Auto (District)</option>
                                                    <option value="1">Region 1</option>
                                                    <option value="2a">Region 2a</option>
                                                    <option value="2b">Region 2b</option>
                                                    <option value="3">Region 3</option>
                                                    <option value="4">Region 4</option>
                                                    <option value="5">Region 5</option>
                                                </select>
                                            </div>
                                        </div>

                                        {/* Manual Override Section */}
                                        <div className="pt-2 border-t border-emerald-200 mt-2">
                                            <label className="flex items-center gap-2 mb-2 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    className="checkbox checkbox-sm checkbox-warning"
                                                    checked={!!manualPrice}
                                                    onChange={(e) => {
                                                        if (!e.target.checked) {
                                                            setManualPrice('')
                                                            setPriceOverrideReason('')
                                                        }
                                                    }}
                                                />
                                                <span className="text-sm font-bold text-amber-800">Enable Manual Price Override</span>
                                            </label>

                                            {manualPrice !== '' && (
                                                <div className="space-y-3 pl-6 animate-fade-in">
                                                    <div>
                                                        <label className="block text-xs font-bold text-amber-800 mb-1">Manual Base Price ($) <span className="text-gray-500 font-normal">(Before discounts)</span></label>
                                                        <input
                                                            type="number"
                                                            className="input input-warning h-9 bg-white"
                                                            placeholder="Enter manual price..."
                                                            value={manualPrice}
                                                            onChange={(e) => setManualPrice(e.target.value)}
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs font-bold text-amber-800 mb-1">Reason for Override</label>
                                                        <input
                                                            type="text"
                                                            className="input input-warning h-9 bg-white"
                                                            placeholder="e.g. Ministerial directive, appeal outcome..."
                                                            value={priceOverrideReason}
                                                            onChange={(e) => setPriceOverrideReason(e.target.value)}
                                                        />
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        {isCalculating && <p className="text-xs text-blue-600 animate-pulse">Updating calculation...</p>}
                                    </div>
                                )}

                                <div className="pt-4">
                                    <label className="block text-sm font-medium mb-2">Officer Comments</label>
                                    <textarea
                                        className="input h-24 resize-none"
                                        placeholder="Add any internal notes or remarks..."
                                        value={officerComments}
                                        onChange={(e) => setOfficerComments(e.target.value)}
                                    />
                                </div>

                                {/* Role-specific forms remain inline for now - these are tested and working */}
                                {/* Surveyor Form */}
                                {user.role === 'surveyor' && (
                                    <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100 space-y-4 mt-4">
                                        <h4 className="text-sm font-bold text-indigo-900 uppercase tracking-wide">Survey Verification Details</h4>
                                        <div className="grid grid-cols-1 gap-4">
                                            <div>
                                                <label className="block text-sm font-medium mb-1.5">Measured Hectarage</label>
                                                <input
                                                    type="number"
                                                    className="input text-sm"
                                                    value={hectarage}
                                                    onChange={(e) => setHectarage(e.target.value)}
                                                    placeholder="e.g. 50.5"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium mb-1.5">Confirmed Farm Name</label>
                                                <input
                                                    type="text"
                                                    className="input text-sm"
                                                    value={newFarmName}
                                                    onChange={(e) => setNewFarmName(e.target.value)}
                                                    placeholder="e.g. New Farm Name"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium mb-1.5">Old District (if any)</label>
                                                <input
                                                    type="text"
                                                    className="input text-sm"
                                                    value={oldDistrict}
                                                    onChange={(e) => setOldDistrict(e.target.value)}
                                                    placeholder="Previous district name"
                                                />
                                            </div>

                                            <div className="p-3 bg-white rounded-lg border border-indigo-100">
                                                <label className="block text-sm font-bold text-indigo-900 mb-2">Survey Fee Payment Status</label>
                                                <div className="flex flex-col gap-2">
                                                    <label className="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-gray-50">
                                                        <input
                                                            type="radio"
                                                            name="surveyFee"
                                                            className="radio radio-primary radio-sm"
                                                            checked={isFeePaid === true}
                                                            onChange={() => setIsFeePaid(true)}
                                                        />
                                                        <span className="text-sm">Fee Paid (Proof Verified)</span>
                                                    </label>
                                                    <label className="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-gray-50">
                                                        <input
                                                            type="radio"
                                                            name="surveyFee"
                                                            className="radio radio-primary radio-sm"
                                                            checked={isFeePaid === false}
                                                            onChange={() => setIsFeePaid(false)}
                                                        />
                                                        <span className="text-sm">Fee NOT Paid</span>
                                                    </label>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Accounts Form */}
                                {user.role === 'accounts' && (
                                    <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-100 space-y-4 mt-4">
                                        <h4 className="text-sm font-bold text-emerald-900 uppercase tracking-wide">Application Fee Verification</h4>
                                        <label className="flex items-center gap-3 p-3 bg-white border rounded-lg cursor-pointer">
                                            <input
                                                type="checkbox"
                                                className="w-5 h-5 text-emerald-600 rounded"
                                                checked={isAppFeePaid}
                                                onChange={(e) => setIsAppFeePaid(e.target.checked)}
                                            />
                                            <span className="font-medium">Application Fee ($10) PAID</span>
                                        </label>
                                        {!isAppFeePaid && <p className="text-xs text-amber-600 font-medium">If unchecked, $10 will be added to the final Agreement of Sale.</p>}
                                    </div>
                                )}

                                {/* ZLC Form */}
                                {user.role === 'zlc' && (
                                    <div className="bg-red-50 p-4 rounded-xl border border-red-100 space-y-4 mt-4">
                                        <h4 className="text-sm font-bold text-red-900 uppercase tracking-wide">Dispute Verification</h4>
                                        <div className="space-y-4">
                                            <label className="flex items-center gap-3">
                                                <span className="font-medium text-gray-700">Are there any disputes logged against this farm?</span>
                                                <div className="flex items-center bg-white border rounded-lg p-1">
                                                    <button
                                                        className={`px-3 py-1 text-sm rounded-md transition ${!hasDisputes ? 'bg-emerald-100 text-emerald-700 font-bold' : 'text-gray-500'}`}
                                                        onClick={() => setHasDisputes(false)}
                                                    >
                                                        No / Clean
                                                    </button>
                                                    <div className="w-px h-4 bg-gray-200 mx-1"></div>
                                                    <button
                                                        className={`px-3 py-1 text-sm rounded-md transition ${hasDisputes ? 'bg-red-100 text-red-700 font-bold' : 'text-gray-500'}`}
                                                        onClick={() => setHasDisputes(true)}
                                                    >
                                                        Yes / Dispute
                                                    </button>
                                                </div>
                                            </label>

                                            {hasDisputes && (
                                                <div className="animate-fade-in">
                                                    <label className="block text-sm font-bold text-red-800 mb-1">Nature of Dispute *</label>
                                                    <input
                                                        className="input border-red-300 focus:border-red-500 focus:ring-red-200"
                                                        placeholder="e.g. Boundary Dispute, Double Allocation, Illegal Settler"
                                                        value={disputeNature}
                                                        onChange={(e) => setDisputeNature(e.target.value)}
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* Remaining role-specific UI sections... keeping inline for stability */}
                                {/* Action buttons */}
                                <div className="flex flex-wrap gap-3 mt-8 pt-6 border-t-2 border-gray-200">
                                    {user?.role === 'surveyor' ? (
                                        <>
                                            <button
                                                className="btn bg-emerald-600 text-white hover:bg-emerald-700 flex-1 min-w-[180px] shadow-lg font-bold"
                                                onClick={() => handleAction(selectedApp.id, 'Survey')}
                                                title="Mark survey as completed and submit verified data"
                                                disabled={actionLoading}
                                            >
                                                {actionLoading ? (
                                                    <><span style={{ display: 'inline-block' }} className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></span> Processing...</>
                                                ) : (
                                                    <><CheckCircle size={18} className="inline mr-2" /> Update Portal with Survey Results</>
                                                )}
                                            </button>
                                            <button
                                                className="btn bg-orange-600 text-white hover:bg-orange-700 flex-1 min-w-[180px] shadow-lg font-bold"
                                                onClick={() => handleAction(selectedApp.id, 'RequireSurvey')}
                                                title="Require survey fee from farmer"
                                                disabled={actionLoading}
                                            >
                                                {actionLoading ? (
                                                    <><span style={{ display: 'inline-block' }} className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></span> Processing...</>
                                                ) : (
                                                    <><DollarSign size={18} className="inline mr-2" /> Not Surveyed - Require Fee (${calculateSurveyFee(selectedApp.tenure_document_type)})</>
                                                )}
                                            </button>
                                        </>
                                    ) : (
                                        <button
                                            className="btn bg-emerald-600 text-white hover:bg-emerald-700 min-w-[100px] shadow-lg font-bold"
                                            style={{ alignSelf: 'flex-start' }}
                                            onClick={() => handleAction(selectedApp.id, 'Approve')}
                                            disabled={actionLoading}
                                        >
                                            {actionLoading ? (
                                                <><span style={{ display: 'inline-block' }} className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></span> Processing...</>
                                            ) : (
                                                <>
                                                    <Check size={18} className="inline mr-2" />
                                                    {user?.role === 'resettlement' ? 'Verify Resettlement' :
                                                        user?.role === 'lims' ? 'Verify' :
                                                        user?.role === 'accounts' ? 'Confirm Fee & Process' :
                                                            user?.role === 'estates' ? 'Verify Farmer Details' :
                                                                user?.role === 'zlc' ? (hasDisputes ? 'Log Dispute & Query' : 'Verify No Disputes') :
                                                                    user?.role === 'gis' ? 'Validate GIS' :
                                                                    user?.role === 'valuation' ? 'Approve Valuation' :
                                                                        user?.role === 'conveyancer' ? 'Generate Agreement' :
                                                                            user?.role === 'deeds' ? 'Seal & Issue Deed' :
                                                                            user?.role === 'director' ? 'Final Approval' : 'Approve'}
                                                </>
                                            )}
                                        </button>
                                    )}

                                    {/* Director Conclude Button - for completed payment applications */}
                                    {user?.role === 'director' && ['PAYMENT_VERIFIED', 'READY_FOR_COLLECTION'].includes(selectedApp.status) && (
                                        <button
                                            className="btn bg-emerald-600 text-white hover:bg-emerald-700 min-w-[100px] shadow-lg font-bold"
                                            style={{ alignSelf: 'flex-start' }}
                                            onClick={() => handleAction(selectedApp.id, 'Conclude')}
                                            disabled={actionLoading}
                                        >
                                            {actionLoading ? (
                                                <><span style={{ display: 'inline-block' }} className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></span> Processing...</>
                                            ) : (
                                                <><CheckCircle size={18} className="inline mr-2" /> Conclude & Notify Farmer</>
                                            )}
                                        </button>
                                    )}

                                    {!['READY_FOR_COLLECTION', 'REJECTED', 'APPROVED', 'COMPLETED'].includes(selectedApp.status) && user?.role !== 'valuation' && (
                                        <button className="btn bg-amber-600 text-white hover:bg-amber-700 min-w-[100px] shadow-lg font-bold" onClick={() => setShowQueryModal(true)} disabled={actionLoading}>
                                            <MessageSquare size={18} className="inline mr-2" /> {user.role === 'director' ? 'Refer Back' : 'Query'}
                                        </button>
                                    )}
                                    {user?.role !== 'surveyor' && user?.role !== 'valuation' && (
                                        <button
                                            className="btn bg-red-600 text-white hover:bg-red-700 min-w-[100px] shadow-lg font-bold"
                                            onClick={() => handleAction(selectedApp.id, 'Reject')}
                                            disabled={actionLoading}
                                        >
                                            {actionLoading ? (
                                                <><span style={{ display: 'inline-block' }} className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></span> Processing...</>
                                            ) : (
                                                <><X size={18} className="inline mr-2" /> Reject</>
                                            )}
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })()}
            </Modal>

            {/* Query / Refer Back Modal */}
            <Modal
                isOpen={showQueryModal}
                onClose={() => setShowQueryModal(false)}
                title={user?.role === 'director' ? 'Refer Back to Valuation Officer' : 'Query Application'}
                maxWidth="max-w-md"
            >
                <div className="space-y-4">
                    {user?.role === 'director' ? (
                        <div className="bg-amber-50 p-4 rounded-lg flex gap-3 text-amber-800 text-sm border border-amber-200">
                            <AlertCircle className="shrink-0" size={20} />
                            <p>This will send the application back to the <strong>Valuation Officer</strong> for corrections. The officer will be able to re-valuate the application based on your feedback.</p>
                        </div>
                    ) : (
                        <div className="bg-red-50 p-4 rounded-lg flex gap-3 text-red-800 text-sm">
                            <AlertCircle className="shrink-0" size={20} />
                            <p>This will send the application back to the farmer for correction. Please provide a clear reason.</p>
                        </div>
                    )}
                    <textarea
                        className="input h-32"
                        placeholder={user?.role === 'director' ? 'Enter reason for referring back to valuation officer...' : 'Enter reason for query...'}
                        value={queryReason}
                        onChange={(e) => setQueryReason(e.target.value)}
                    />
                    <div className="flex justify-end gap-3 pt-4">
                        <button onClick={() => setShowQueryModal(false)} className="btn btn-ghost">Cancel</button>
                        <button onClick={handleQuery} className={user?.role === 'director' ? 'btn bg-amber-600 text-white hover:bg-amber-700 font-bold' : 'btn btn-destructive'}>
                            {user?.role === 'director' ? 'Refer Back' : 'Submit Query'}
                        </button>
                    </div>
                </div>
            </Modal>
        </div>
    )
}

export default OfficerDashboard

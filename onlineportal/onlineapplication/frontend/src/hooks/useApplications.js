import { useState, useEffect } from 'react'
import applicationService from '../services/applicationService'
import { getQueue } from '../utils/offlineDB'

/**
 * Normalize an application record for OfficerDashboard display
 */
const normalizeApplication = (app) => {
    const firstName = app?.farmer_name || app?.first_name || ''
    const lastName = app?.farmer_surname || app?.surname || ''
    const derivedFarmer = (firstName || lastName)
        ? `${firstName || 'Unknown'} ${lastName || 'Applicant'}`.trim()
        : (app?.farmer || app?.walk_in_citizen_name || 'Unknown Applicant')

    return {
        ...app,
        id: app?.id || Math.random(),
        farmer: derivedFarmer,
        farm_name: app?.farm_name || app?.farm_id || 'Unnamed Farm',
        district: app?.district || 'N/A',
        status: app?.status || 'PENDING',
        officer_comments: app?.officer_comments || '',
        national_id: app?.national_id || app?.walk_in_national_id || 'N/A',
        telephone: app?.telephone || app?.walk_in_phone || 'N/A',
        email: app?.email || 'N/A',
        date: app?.created_at ? new Date(app.created_at).toLocaleDateString() : (app?.date || 'N/A')
    }
}

/**
 * Custom hook for managing applications data
 * Implements Single Responsibility Principle - only handles application state
 * 
 * @returns {Object} Applications state and methods
 */
const useApplications = () => {
    const [applications, setApplications] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')

    /**
     * Fetch applications from API and merge any locally cached/updated submissions
     */
    const fetchApplications = async () => {
        setLoading(true)
        setError('')

        let localApps = []
        try {
            localApps = JSON.parse(localStorage.getItem('my_submitted_applications') || '[]')
            if (!Array.isArray(localApps)) localApps = []
        } catch (e) {
            localApps = []
        }

        // Also include any IndexedDB offline-queue submissions that may not be in localStorage
        try {
            const queued = await getQueue()
            if (Array.isArray(queued)) {
                queued.forEach((item) => {
                    const body = typeof item?.body === 'string' ? JSON.parse(item.body) : item?.body
                    if (body && typeof body === 'object') {
                        const receipt = body.statutory_fee_receipt || body.receipt_number || ''
                        const ref = body.reference_number || (item.id ? `TD-2026-${String(item.id).padStart(6, '0')}` : '')
                        const alreadyInLocal = localApps.some(a =>
                            (ref && a.reference_number === ref) ||
                            (receipt && (a.statutory_fee_receipt === receipt || a.receipt_number === receipt))
                        )
                        if (!alreadyInLocal) {
                            localApps.push({
                                ...body,
                                id: body.id || item.id || Date.now(),
                                reference_number: ref || `TD-2026-${String(Date.now()).slice(-6)}`,
                                statutory_fee_receipt: receipt || 'N/A',
                                receipt_number: receipt || 'N/A',
                                status: body.status || 'PENDING',
                                created_at: body.created_at || item.timestamp || new Date().toISOString()
                            })
                        }
                    }
                })
            }
        } catch (qErr) {
            // Ignore IndexedDB error in non-browser/test environments
        }

        try {
            const data = await applicationService.fetchApplications()

            if (Array.isArray(data)) {
                const localByKey = new Map()
                localApps.forEach(item => {
                    if (item && typeof item === 'object') {
                        if (item.id != null) localByKey.set(`id:${item.id}`, item)
                        if (item.reference_number) localByKey.set(`ref:${item.reference_number}`, item)
                    }
                })

                const matchedKeys = new Set()
                const mergedServer = data
                    .filter(app => app && typeof app === 'object')
                    .map(app => {
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

                const unsyncedLocal = localApps.filter(item => {
                    if (!item || typeof item !== 'object') return false
                    const idMatched = item.id != null && matchedKeys.has(`id:${item.id}`)
                    const refMatched = item.reference_number && matchedKeys.has(`ref:${item.reference_number}`)
                    return !idMatched && !refMatched
                })

                const combined = [...unsyncedLocal, ...mergedServer].map(normalizeApplication)
                setApplications(combined)
            } else if (localApps.length > 0) {
                setApplications(localApps.filter(app => app && typeof app === 'object').map(normalizeApplication))
            } else {
                setApplications([])
            }
        } catch (err) {
            console.error('Fetch applications error:', err)
            if (localApps.length > 0) {
                setApplications(localApps.filter(app => app && typeof app === 'object').map(normalizeApplication))
            } else {
                setError('Failed to load applications.')
                setApplications([])
            }
        } finally {
            setLoading(false)
        }
    }

    /**
     * Refresh applications (alias for fetchApplications for clarity)
     */
    const refreshApplications = fetchApplications

    // Fetch on mount
    useEffect(() => {
        fetchApplications()
    }, [])

    return {
        applications,
        loading,
        error,
        fetchApplications,
        refreshApplications,
        setError
    }
}

export default useApplications

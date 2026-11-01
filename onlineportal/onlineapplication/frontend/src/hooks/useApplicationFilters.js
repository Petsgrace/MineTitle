import { useState, useMemo } from 'react'

/**
 * Custom hook for filtering applications
 * Handles search and status filtering logic
 * 
 * @param {Array} applications - List of applications to filter
 * @returns {Object} Filtered applications and filter controls
 */
const useApplicationFilters = (applications = []) => {
    const [searchTerm, setSearchTerm] = useState('')
    const [filterStatus, setFilterStatus] = useState('all')

    /**
     * Memoized filtered applications
     * Only recalculates when applications, searchTerm, or filterStatus change
     */
    const filteredApplications = useMemo(() => {
        return (applications || []).filter(app => {
            const farmerName = String(app.farmer || '').toLowerCase()
            const farmName = String(app.farm_name || '').toLowerCase()
            const appId = String(app.id || '').toLowerCase()
            const refNo = String(app.reference_number || '').toLowerCase()
            const district = String(app.district || '').toLowerCase()
            const nationalId = String(app.national_id || '').toLowerCase()
            const receiptNo = String(app.receipt_number || app.statutory_fee_receipt || '').toLowerCase()
            const search = String(searchTerm || '').toLowerCase().trim()

            const matchesSearch = !search ||
                farmerName.includes(search) ||
                farmName.includes(search) ||
                appId.includes(search) ||
                refNo.includes(search) ||
                district.includes(search) ||
                nationalId.includes(search) ||
                receiptNo.includes(search)

            const matchesFilter = filterStatus === 'all' || app.status === filterStatus

            return matchesSearch && matchesFilter
        })
    }, [applications, searchTerm, filterStatus])

    return {
        searchTerm,
        setSearchTerm,
        filterStatus,
        setFilterStatus,
        filteredApplications
    }
}

export default useApplicationFilters

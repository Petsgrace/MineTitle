/**
 * Status Utilities
 * Pure functions for status handling
 * Implements Single Responsibility Principle
 */

/**
 * Get CSS classes for status badge styling
 * @param {string} status - Application status
 * @returns {string} CSS classes
 */
export const getStatusColor = (status) => {
    const colors = {
        'PENDING': 'bg-yellow-100 text-yellow-800',
        'QUERIED': 'bg-orange-100 text-orange-800',
        'RESUBMITTED': 'bg-cyan-100 text-cyan-800',
        'LIMS_VERIFIED': 'bg-blue-100 text-blue-800',
        'ACCOUNTS_VERIFIED': 'bg-indigo-100 text-indigo-800',
        'ESTATES_VERIFIED': 'bg-purple-100 text-purple-800',
        'RESETTLEMENT_VERIFIED': 'bg-blue-100 text-blue-800',
        'REFERRED': 'bg-orange-100 text-orange-800',
        'ZLC_VERIFIED': 'bg-purple-100 text-purple-800',
        'SURVEYED': 'bg-indigo-100 text-indigo-800',
        'VALUATED': 'bg-cyan-100 text-cyan-800',
        'SELECT_PAYMENT': 'bg-amber-100 text-amber-800',
        'AWAITING_PAYMENT': 'bg-amber-100 text-amber-800',
        'PAYMENT_VERIFIED': 'bg-teal-100 text-teal-800',
        'READY_FOR_COLLECTION': 'bg-emerald-100 text-emerald-800',
        'AWAITING_SURVEY_FEE': 'bg-rose-100 text-rose-800',
        'SURVEY_FEE_PAID': 'bg-green-100 text-green-800 font-bold',
        'APPROVED': 'bg-green-100 text-green-800',
        'REJECTED': 'bg-red-100 text-red-800',
    }

    return colors[status] || 'bg-gray-100 text-gray-800'
}

/**
 * Format status string for display
 * Converts underscores to spaces
 * @param {string} status - Raw status string
 * @returns {string} Formatted status
 */
export const formatStatus = (status) => {
    if (!status) return 'N/A'
    return status.replace(/_/g, ' ')
}

/**
 * Check if status is a verified/approved state
 * @param {string} status - Application status
 * @returns {boolean} True if approved/verified
 */
export const isApprovedStatus = (status) => {
    const approvedStatuses = [
        'APPROVED',
        'LIMS_VERIFIED',
        'ZLC_VERIFIED',
        'RESETTLEMENT_VERIFIED',
        'SURVEYED',
        'VALUATED',
        'PAYMENT_VERIFIED'
    ]
    return approvedStatuses.includes(status)
}

/**
 * Check if status is pending/awaiting action
 * @param {string} status - Application status
 * @returns {boolean} True if pending
 */
export const isPendingStatus = (status) => {
    const pendingStatuses = ['PENDING', 'SELECT_PAYMENT', 'AWAITING_PAYMENT', 'AWAITING_SURVEY_FEE']
    return pendingStatuses.includes(status)
}

/**
 * Check if status is rejected/queried
 * @param {string} status - Application status
 * @returns {boolean} True if rejected/queried
 */
export const isRejectedStatus = (status) => {
    const rejectedStatuses = ['REJECTED', 'QUERIED']
    return rejectedStatuses.includes(status)
}

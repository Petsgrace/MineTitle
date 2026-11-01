import React from 'react'
import { getStatusColor, formatStatus } from '../utils/statusUtils'

/**
 * StatusBadge Component
 * Displays application status with appropriate styling
 * Implements Single Responsibility Principle - only renders status badge
 * 
 * @param {Object} props
 * @param {string} props.status - Application status
 * @param {string} props.className - Additional CSS classes (optional)
 */
const StatusBadge = ({ status, className = '' }) => {
    const colorClasses = getStatusColor(status)
    const formattedStatus = formatStatus(status)

    return (
        <span
            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${colorClasses} ${className}`}
        >
            {formattedStatus}
        </span>
    )
}

export default StatusBadge

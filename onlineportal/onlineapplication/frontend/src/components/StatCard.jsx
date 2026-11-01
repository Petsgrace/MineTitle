import React from 'react'

/**
 * StatCard Component
 * Displays a statistics card with icon
 * Reusable across dashboards
 * 
 * @param {Object} props
 * @param {string} props.title - Card title
 * @param {string|number} props.value - Display value
 * @param {React.Component} props.icon - Icon component (lucide-react)
 * @param {string} props.color - Icon text color class
 * @param {string} props.bg - Icon background color class
 * @param {Function} props.onClick - Optional click handler
 * @param {string} props.className - Additional CSS classes
 */
const StatCard = ({
    title,
    value,
    icon: Icon,
    color,
    bg,
    onClick,
    className = ''
}) => {
    return (
        <div
            className={`card p-6 flex items-start justify-between ${onClick ? 'cursor-pointer' : ''} ${className}`}
            onClick={onClick}
        >
            <div>
                <p className="text-sm font-medium text-gray-500 mb-1">{title}</p>
                <h3 className="text-3xl font-bold text-gray-900">{value}</h3>
            </div>
            <div className={`p-3 rounded-lg ${bg}`}>
                <Icon className={`w-6 h-6 ${color}`} />
            </div>
        </div>
    )
}

export default StatCard

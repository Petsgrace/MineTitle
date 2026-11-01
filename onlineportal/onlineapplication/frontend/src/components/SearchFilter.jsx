import React from 'react'
import { Search, Filter, ChevronDown } from 'lucide-react'

/**
 * SearchFilter Component
 * Combined search and filter controls for application lists
 * Reusable across different dashboards
 * 
 * @param {Object} props
 * @param {string} props.searchTerm - Current search term
 * @param {Function} props.onSearchChange - Search change handler
 * @param {string} props.filterStatus - Current filter status
 * @param {Function} props.onFilterChange - Filter change handler
 * @param {number} props.resultCount - Number of filtered results
 * @param {Array} props.statusOptions - Available status filter options
 */
const SearchFilter = ({
    searchTerm,
    onSearchChange,
    filterStatus,
    onFilterChange,
    resultCount,
    statusOptions = []
}) => {
    return (
        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm mb-8">
            <div className="flex flex-row gap-4 items-center">
                {/* Search Field */}
                <div className="flex-[2] relative">
                    <Search className="absolute left-3 top-3 text-gray-400 pointer-events-none" size={20} />
                    <input
                        className="input pl-11 mt-0 w-full h-11 bg-gray-50 border-gray-200 focus:bg-white transition-all shadow-inner"
                        placeholder="Search by Farmer, Farm Name, or #ID..."
                        value={searchTerm}
                        onChange={(e) => onSearchChange(e.target.value)}
                    />
                </div>

                {/* Status Filter */}
                <div className="flex-1 relative">
                    <Filter className="absolute left-3 top-3 text-gray-400 pointer-events-none" size={18} />
                    <select
                        className="input pl-10 mt-0 w-full h-11 bg-gray-50 border-gray-200 focus:bg-white transition-all appearance-none cursor-pointer"
                        value={filterStatus}
                        onChange={(e) => onFilterChange(e.target.value)}
                    >
                        <option value="all">All Statuses</option>
                        {statusOptions.map(option => (
                            <option key={option.value} value={option.value}>
                                {option.label}
                            </option>
                        ))}
                    </select>
                    <div className="absolute right-3 top-3.5 pointer-events-none text-gray-400">
                        <ChevronDown size={16} />
                    </div>
                </div>

                {/* Result Count */}
                <div className="hidden lg:flex items-center gap-2 pl-4 border-l border-gray-200">
                    <div className="flex flex-col">
                        <span className="text-[10px] font-bold text-gray-400 uppercase leading-none mb-1">
                            Total Found
                        </span>
                        <span className="text-lg font-bold text-emerald-700 leading-none">
                            {resultCount}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default SearchFilter

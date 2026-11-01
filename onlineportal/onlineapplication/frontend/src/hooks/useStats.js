import { useState, useEffect } from 'react'
import applicationService from '../services/applicationService'

/**
 * Custom hook for managing dashboard statistics
 * 
 * @returns {Object} Stats state and refresh method
 */
const useStats = () => {
    const [stats, setStats] = useState({
        pending_count: 0,
        today_count: 0,
        cumulative_count: 0
    })
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')

    /**
     * Fetch statistics from API
     */
    const fetchStats = async () => {
        setLoading(true)
        setError('')

        try {
            const data = await applicationService.fetchStats()
            setStats(data)
        } catch (err) {
            console.error('Stats fetch error:', err)
            setError('Failed to load statistics.')
        } finally {
            setLoading(false)
        }
    }

    /**
     * Refresh stats (alias for fetchStats)
     */
    const refreshStats = fetchStats

    // Fetch on mount
    useEffect(() => {
        fetchStats()
    }, [])

    return {
        stats,
        loading,
        error,
        fetchStats,
        refreshStats
    }
}

export default useStats

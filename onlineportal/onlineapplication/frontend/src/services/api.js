import axios from 'axios'
import { Capacitor } from '@capacitor/core'

/**
 * Determine dynamic base URL for web vs native Android shell
 */
export function getBaseURL() {
    const customUrl = localStorage.getItem('api_base_url')
    if (customUrl) return customUrl

    if (import.meta.env.VITE_API_URL) {
        return import.meta.env.VITE_API_URL
    }

    if (Capacitor.isNativePlatform()) {
        // D2: Use HTTPS endpoint in production builds
        if (import.meta.env.PROD) {
            return import.meta.env.VITE_API_HTTPS_URL || 'https://titledeeds.lands.gov.zw/api'
        }
        // 10.0.2.2 is the host loopback alias in Android debug emulator
        return 'http://10.0.2.2:8000/api'
    }

    return '/api'
}

/**
 * Get CSRF token from cookie
 */
function getCookie(name) {
    let cookieValue = null;
    if (document.cookie && document.cookie !== '') {
        const cookies = document.cookie.split(';');
        for (let i = 0; i < cookies.length; i++) {
            const cookie = cookies[i].trim();
            if (cookie.substring(0, name.length + 1) === (name + '=')) {
                cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                break;
            }
        }
    }
    return cookieValue;
}

/**
 * Base axios instance with default configuration
 * Provides centralized request/response handling
 */
const api = axios.create({
    baseURL: getBaseURL(),
    headers: {
        'Content-Type': 'application/json',
    },
    withCredentials: true,
    timeout: 6000,  // Send cookies with requests
})

/**
 * Request interceptor
 * Add CSRF token and authentication headers
 */
api.interceptors.request.use(
    (config) => {
        // Ensure dynamic baseURL if updated
        config.baseURL = getBaseURL()

        // Add CSRF token for unsafe methods
        if (!['GET', 'HEAD', 'OPTIONS'].includes(config.method.toUpperCase())) {
            const csrfToken = getCookie('csrftoken');
            if (csrfToken) {
                config.headers['X-CSRFToken'] = csrfToken;
            }
        }

        // Add auth token if available
        const token = localStorage.getItem('authToken')
        if (token) {
            config.headers.Authorization = `Bearer ${token}`
        }
        return config
    },
    (error) => {
        return Promise.reject(error)
    }
)

/**
 * Response interceptor
 * Handle errors globally
 */
api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 429) {
            const retryAfter = error.response.headers['retry-after']
            const waitTime = retryAfter ? `${retryAfter} seconds` : 'a moment'
            console.warn(`Rate limited. Retry after ${waitTime}.`)
            alert(`Too many requests. Please wait ${waitTime} and try again.`)
        } else if (error.response?.status === 401) {
            console.error('Unauthorized access')
        } else if (error.response?.status === 403) {
            console.error('Forbidden - check CSRF token or permissions')
        } else if (error.response?.status === 500) {
            console.error('Server error')
        }
        return Promise.reject(error)
    }
)

export default api

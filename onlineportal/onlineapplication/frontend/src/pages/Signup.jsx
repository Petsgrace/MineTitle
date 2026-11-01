import React, { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate } from 'react-router-dom'
import { UserPlus, AlertCircle, Loader2, CheckCircle } from 'lucide-react'
import api from '../services/api'
import { addToQueue, recordLocalAuditLog } from '../utils/offlineDB'

function normalizeZimbabwePhone(phone) {
    const raw = (phone || '').trim()
    const compact = raw.replace(/[\s\-()]/g, '')
    if (/^07\d{8}$/.test(compact)) {
        return '+263' + compact.slice(1)
    }
    if (/^2637\d{8}$/.test(compact)) {
        return '+' + compact
    }
    return raw
}

const Signup = () => {
    const navigate = useNavigate()
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState('')
    const [successMessage, setSuccessMessage] = useState('')

    const { register, handleSubmit, watch, formState: { errors } } = useForm({
        mode: 'onBlur'
    })

    const onSubmit = async (data) => {
        setIsLoading(true)
        setError('')
        setSuccessMessage('')

        const normalizedPhone = normalizeZimbabwePhone(data.telephone)
        const payload = {
            ...data,
            national_id: data.national_id.trim(),
            telephone: normalizedPhone
        }

        try {
            await api.post('/register/', payload)
            try {
                const localFarmers = JSON.parse(localStorage.getItem('registered_farmers') || '[]')
                const filtered = localFarmers.filter(
                    f => (f.national_id || '').toLowerCase() !== payload.national_id.toLowerCase() &&
                         (f.email || '').toLowerCase() !== (payload.email || '').toLowerCase()
                )
                filtered.push({
                    id: `farmer-${Date.now()}`,
                    national_id: payload.national_id,
                    first_name: payload.first_name,
                    last_name: payload.last_name,
                    name: `${payload.first_name || ''} ${payload.last_name || ''}`.trim(),
                    username: payload.national_id,
                    email: payload.email,
                    telephone: normalizedPhone,
                    password: payload.password,
                    role: 'farmer',
                    created_at: new Date().toISOString()
                })
                localStorage.setItem('registered_farmers', JSON.stringify(filtered))
            } catch (e) {
                // ignore storage quota errors
            }

            setSuccessMessage("Account created successfully! Redirecting to sign in...")
            setTimeout(() => {
                navigate('/login')
            }, 1800)
        } catch (err) {
            console.error('Registration error:', err)
            const backendError = err.response?.data

            if (backendError) {
                if (typeof backendError === 'object') {
                    if (backendError.national_id) {
                        const msg = Array.isArray(backendError.national_id) ? backendError.national_id[0] : backendError.national_id
                        if (String(msg).toLowerCase().includes('already exists') || String(msg).toLowerCase().includes('unique')) {
                            setError('ID number already registered. Please sign in or use another ID.')
                        } else {
                            setError(`National ID: ${msg}`)
                        }
                    } else if (backendError.email) {
                        const msg = Array.isArray(backendError.email) ? backendError.email[0] : backendError.email
                        if (String(msg).toLowerCase().includes('already exists') || String(msg).toLowerCase().includes('unique')) {
                            setError('Email address is already registered.')
                        } else {
                            setError(`Email: ${msg}`)
                        }
                    } else if (backendError.username) {
                        const msg = Array.isArray(backendError.username) ? backendError.username[0] : backendError.username
                        setError(`Username: ${msg}`)
                    } else if (backendError.password) {
                        const msg = Array.isArray(backendError.password) ? backendError.password[0] : backendError.password
                        setError(`Password: ${msg}`)
                    } else if (backendError.error) {
                        setError(backendError.error)
                    } else if (backendError.detail) {
                        setError(backendError.detail)
                    } else {
                        const combined = Object.entries(backendError)
                            .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
                            .join(' | ')
                        setError(combined || 'Validation error. Please verify your details.')
                    }
                } else if (typeof backendError === 'string' && !backendError.trim().startsWith('<')) {
                    setError(backendError)
                } else {
                    setError('Registration failed. Please check your details and try again.')
                }
            } else if (err.code === 'ERR_NETWORK' || !err.response) {
                // Offline registration fallback so mobile APK works seamlessly without connectivity
                try {
                    const localFarmers = JSON.parse(localStorage.getItem('registered_farmers') || '[]')
                    const duplicateId = localFarmers.find(
                        f => (f.national_id || '').replace(/[\s-]/g, '').toLowerCase() ===
                             payload.national_id.replace(/[\s-]/g, '').toLowerCase()
                    )
                    if (duplicateId) {
                        setError('ID number already registered. Please sign in or use another ID.')
                        return
                    }
                    const newFarmer = {
                        id: `farmer-${Date.now()}`,
                        national_id: payload.national_id,
                        first_name: payload.first_name,
                        last_name: payload.last_name,
                        name: `${payload.first_name || ''} ${payload.last_name || ''}`.trim(),
                        username: payload.national_id,
                        email: payload.email,
                        telephone: normalizedPhone,
                        password: payload.password,
                        role: 'farmer',
                        created_at: new Date().toISOString(),
                        pending_sync: true
                    }
                    localFarmers.push(newFarmer)
                    localStorage.setItem('registered_farmers', JSON.stringify(localFarmers))
                    await addToQueue({
                        url: '/api/register/',
                        method: 'POST',
                        body: payload,
                        idempotency_key: `farmer-register-${payload.national_id}`,
                        entity_type: 'farmer'
                    })
                    recordLocalAuditLog({
                        action_type: 'FARMER_REGISTER',
                        reference_number: payload.national_id,
                        actor: newFarmer.name,
                        stage: 'PORTAL_SIGNUP',
                        comment: `Registered beneficiary account (${payload.national_id}) offline; queued for cloud sync.`
                    })
                    setSuccessMessage("Account created successfully! Redirecting to sign in...")
                    setTimeout(() => {
                        navigate('/login')
                    }, 1500)
                } catch (offlineErr) {
                    setError('No connection, please try again.')
                }
            } else {
                setError('Registration failed. Please check your details and try again.')
            }
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <div className="max-w-md mx-auto py-12 px-4">
            <div className="card p-6 shadow-xl border border-gray-100 rounded-2xl">
                <div className="text-center mb-8">
                    <div className="bg-emerald-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                        <UserPlus className="text-emerald-700" size={32} />
                    </div>
                    <h2 className="text-2xl font-bold text-gray-900">Farmer Signup</h2>
                    <p className="text-gray-600 mt-2 text-sm">Create your digital land title profile</p>
                </div>

                {successMessage && (
                    <div className="bg-green-50 text-green-700 p-4 rounded-xl text-sm flex items-center gap-2 border border-green-200 mb-4 animate-fade-in">
                        <CheckCircle size={20} className="shrink-0" />
                        <span className="font-medium">{successMessage}</span>
                    </div>
                )}

                {error && (
                    <div className="bg-red-50 text-red-700 p-4 rounded-xl text-sm flex items-center gap-2 border border-red-200 mb-4">
                        <AlertCircle size={20} className="shrink-0" />
                        <span className="font-medium">{error}</span>
                    </div>
                )}

                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">National ID: </label>
                        <input
                            className={`input w-full ${errors.national_id ? 'border-red-600' : ''}`}
                            autoComplete="off"
                            {...register('national_id', {
                                required: 'National ID is required',
                                pattern: {
                                    value: /^\d{2}-?\d{6,8}-?[A-Z]-?\d{2}$/i,
                                    message: 'Format must be: 63-1234567-X-63'
                                }
                            })}
                            placeholder="63-1234567-X-63"
                        />
                        {errors.national_id && (
                            <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
                                <AlertCircle size={14} />
                                {errors.national_id.message}
                            </p>
                        )}
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">First Name: </label>
                            <input
                                className={`input w-full ${errors.first_name ? 'border-red-600' : ''}`}
                                autoComplete="off"
                                {...register('first_name', { required: 'First name is required' })}
                                placeholder="First Name"
                            />
                            {errors.first_name && (
                                <p className="text-xs text-red-600 mt-1">{errors.first_name.message}</p>
                            )}
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Surname: </label>
                            <input
                                className={`input w-full ${errors.last_name ? 'border-red-600' : ''}`}
                                autoComplete="off"
                                {...register('last_name', { required: 'Surname is required' })}
                                placeholder="Surname"
                            />
                            {errors.last_name && (
                                <p className="text-xs text-red-600 mt-1">{errors.last_name.message}</p>
                            )}
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number: </label>
                            <input
                                className={`input w-full ${errors.telephone ? 'border-red-600' : ''}`}
                                autoComplete="off"
                                {...register('telephone', { required: 'Phone number is required' })}
                                placeholder="+263 77..."
                            />
                            {errors.telephone && (
                                <p className="text-xs text-red-600 mt-1">{errors.telephone.message}</p>
                            )}
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Email: </label>
                            <input
                                className={`input w-full ${errors.email ? 'border-red-600' : ''}`}
                                type="email"
                                autoComplete="off"
                                {...register('email', {
                                    required: 'Email is required',
                                    pattern: {
                                        value: /\S+@\S+\.\S+/,
                                        message: 'Invalid email address'
                                    }
                                })}
                                placeholder="farmer@example.com"
                            />
                            {errors.email && (
                                <p className="text-xs text-red-600 mt-1">{errors.email.message}</p>
                            )}
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Password: </label>
                        <input
                            className={`input w-full ${errors.password ? 'border-red-600' : ''}`}
                            type="password"
                            autoComplete="new-password"
                            {...register('password', {
                                required: 'Password is required',
                                minLength: { value: 8, message: 'Password must be at least 8 characters' }
                            })}
                            placeholder="••••••••"
                        />
                        {errors.password && (
                            <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
                                <AlertCircle size={14} />
                                {errors.password.message}
                            </p>
                        )}
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Confirm Password: </label>
                        <input
                            className={`input w-full ${errors.confirm_password ? 'border-red-600' : ''}`}
                            type="password"
                            autoComplete="new-password"
                            {...register('confirm_password', {
                                required: 'Please confirm password',
                                validate: (val) => {
                                    if (watch('password') !== val) {
                                        return "Passwords do not match"
                                    }
                                }
                            })}
                            placeholder="••••••••"
                        />
                        {errors.confirm_password && (
                            <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
                                <AlertCircle size={14} />
                                {errors.confirm_password.message}
                            </p>
                        )}
                    </div>

                    <button
                        type="submit"
                        disabled={isLoading}
                        className="btn btn-primary w-full mt-6 py-3 text-base flex items-center justify-center gap-2 font-semibold shadow-md"
                    >
                        {isLoading ? (
                            <>
                                <Loader2 className="animate-spin" size={20} />
                                <span>Creating Account...</span>
                            </>
                        ) : (
                            'Create Account'
                        )}
                    </button>
                </form>

                <div className="mt-8 pt-6 border-t text-center">
                    <p className="text-gray-600 text-sm">
                        Already have an account? {' '}
                        <Link to="/login" className="text-emerald-700 font-bold hover:underline">Sign In</Link>
                    </p>
                </div>
            </div>
        </div>
    )
}

export default Signup

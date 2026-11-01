import React, { useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import api from '../services/api'
import { AlertCircle, Lock, Loader2, CheckCircle2 } from 'lucide-react'

const ResetPassword = () => {
    const { uidb64, token } = useParams()
    const navigate = useNavigate()
    const [password, setPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [error, setError] = useState('')
    const [successMessage, setSuccessMessage] = useState('')
    const [isLoading, setIsLoading] = useState(false)

    const handleSubmit = async (e) => {
        e.preventDefault()
        setIsLoading(true)
        setError('')
        
        if (password !== confirmPassword) {
            setError("Passwords do not match.")
            setIsLoading(false)
            return
        }
        
        if (password.length < 8) {
            setError("Password must be at least 8 characters long.")
            setIsLoading(false)
            return
        }

        try {
            const response = await api.post('/password-reset-confirm/', {
                uidb64,
                token,
                new_password: password
            })
            setSuccessMessage(response.data.status)
            setTimeout(() => {
                navigate('/login')
            }, 3000)
        } catch (err) {
            console.error('Password reset error:', err)
            setError(err.response?.data?.error || 'Failed to reset password. The link might be expired or invalid.')
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <div className="max-w-md mx-auto py-16">
            <div className="card p-8">
                {/* Header */}
                <div className="text-center mb-8">
                    <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Lock className="w-6 h-6 text-emerald-600" />
                    </div>
                    <h2 className="text-2xl font-bold text-gray-900">Set New Password</h2>
                    <p className="text-gray-500 mt-1 text-sm">Please enter your new password below</p>
                </div>

                {/* Messages */}
                {error && (
                    <div className="alert alert-error mb-4">
                        <div className="alert-icon">
                            <AlertCircle size={18} />
                        </div>
                        <span className="text-sm">{error}</span>
                    </div>
                )}
                {successMessage && (
                    <div className="bg-emerald-50 text-emerald-700 p-4 rounded-lg flex items-start gap-3 mb-4 border border-emerald-200">
                        <CheckCircle2 size={18} className="mt-0.5 shrink-0" />
                        <span className="text-sm font-medium">{successMessage} Redirecting to login...</span>
                    </div>
                )}

                {/* Form */}
                {!successMessage && (
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1.5">New Password</label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                <input
                                    className="input pl-10"
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="Enter new password"
                                    required
                                    minLength="8"
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1.5">Confirm Password</label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                <input
                                    className="input pl-10"
                                    type="password"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    placeholder="Confirm new password"
                                    required
                                />
                            </div>
                        </div>
                        <button
                            type="submit"
                            disabled={isLoading}
                            className="btn btn-primary w-full h-11 text-base font-semibold mt-6"
                        >
                            {isLoading ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                    Resetting...
                                </>
                            ) : (
                                'Reset Password'
                            )}
                        </button>
                    </form>
                )}

                {/* Footer */}
                {successMessage && (
                    <div className="mt-8 pt-6 border-t text-center space-y-3">
                        <Link to="/login" className="btn btn-primary w-full">
                            Go to Login
                        </Link>
                    </div>
                )}
            </div>
        </div>
    )
}

export default ResetPassword

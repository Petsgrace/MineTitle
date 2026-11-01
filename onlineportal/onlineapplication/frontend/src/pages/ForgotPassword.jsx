import React, { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import api from '../services/api'
import { AlertCircle, User as UserIcon, Loader2, ArrowLeft, CheckCircle2, KeyRound, ShieldCheck, Mail, Lock, Eye, EyeOff, RefreshCw, Clock } from 'lucide-react'

const ForgotPassword = () => {
    const navigate = useNavigate()
    
    // Steps: 'request' | 'verify' | 'success'
    const [step, setStep] = useState('request')
    
    // Step 1 state
    const [identifier, setIdentifier] = useState('')
    
    // Step 2 state
    const [claimedEmail, setClaimedEmail] = useState('')
    const [emailMasked, setEmailMasked] = useState('')
    const [recoveredUsername, setRecoveredUsername] = useState('')
    const [verificationCode, setVerificationCode] = useState('')
    const [newPassword, setNewPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    
    // 90-second countdown timer (1 min 30s)
    const [countdown, setCountdown] = useState(90)
    
    // UI state
    const [error, setError] = useState('')
    const [successMessage, setSuccessMessage] = useState('')
    const [isLoading, setIsLoading] = useState(false)

    // Countdown effect when in 'verify' step
    useEffect(() => {
        let timer = null
        if (step === 'verify' && countdown > 0) {
            timer = setInterval(() => {
                setCountdown((prev) => (prev > 0 ? prev - 1 : 0))
            }, 1000)
        }
        return () => {
            if (timer) clearInterval(timer)
        }
    }, [step, countdown])

    const formatTime = (totalSeconds) => {
        const mins = Math.floor(totalSeconds / 60)
        const secs = totalSeconds % 60
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
    }

    // Step 1: Request Verification Code to Claimed Email
    const handleRequestCode = async (e) => {
        if (e) e.preventDefault()
        setIsLoading(true)
        setError('')
        setSuccessMessage('')
        
        try {
            const isEmail = identifier.includes('@')
            const payload = isEmail ? { email: identifier.trim() } : { username: identifier.trim() }
            
            const response = await api.post('/password-reset/', payload)
            
            setClaimedEmail(response.data.email || identifier.trim())
            setEmailMasked(response.data.email_masked || identifier.trim())
            setRecoveredUsername(response.data.username || '')
            
            setSuccessMessage(response.data.status || 'Verification code sent to your claimed email address.')
            setCountdown(90) // Start 1m 30s countdown
            setStep('verify')
        } catch (err) {
            console.error('Password reset request error:', err)
            if (err.response?.status === 429) {
                const retryAfter = err.response.headers['retry-after']
                const waitText = retryAfter ? `Please wait ${retryAfter} seconds` : 'Please wait a moment'
                setError(`Too many requests. ${waitText} and try again.`)
            } else {
                setError(err.response?.data?.error || err.response?.data?.detail || 'Unable to dispatch verification code. Please check your email or ID.')
            }
        } finally {
            setIsLoading(false)
        }
    }

    // Step 2: Confirm Verification Code & Set New Password
    const handleVerifyAndReset = async (e) => {
        if (e) e.preventDefault()
        setError('')

        if (!verificationCode || verificationCode.trim().length < 6) {
            setError('Please enter the full 6-digit verification code sent to your email.')
            return
        }

        if (!newPassword || newPassword.length < 8) {
            setError('New password must be at least 8 characters long.')
            return
        }

        if (newPassword !== confirmPassword) {
            setError('Passwords do not match. Please re-enter your new password.')
            return
        }

        setIsLoading(true)

        try {
            const payload = {
                email: claimedEmail || identifier.trim(),
                verification_code: verificationCode.trim(),
                new_password: newPassword
            }

            const response = await api.post('/password-reset-confirm/', payload)
            
            setSuccessMessage(response.data.status || 'Password reset successfully! Account authenticity verified.')
            setStep('success')
        } catch (err) {
            console.error('Password reset verification error:', err)
            setError(err.response?.data?.error || err.response?.data?.detail || 'Verification failed. The code may be invalid or expired.')
        } finally {
            setIsLoading(false)
        }
    }

    // Resend verification code
    const handleResendCode = async () => {
        if (countdown > 0) return
        setVerificationCode('')
        await handleRequestCode()
    }

    return (
        <div className="max-w-md mx-auto py-12 px-4 sm:px-6">
            <div className="card p-6 sm:p-8 shadow-xl border border-gray-100 rounded-2xl bg-white">
                
                {/* Header Icon & Title */}
                <div className="text-center mb-6">
                    {step === 'success' ? (
                        <div className="w-14 h-14 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto mb-4 text-emerald-600 shadow-sm">
                            <CheckCircle2 className="w-8 h-8" />
                        </div>
                    ) : step === 'verify' ? (
                        <div className="w-14 h-14 bg-amber-100 rounded-2xl flex items-center justify-center mx-auto mb-4 text-amber-700 shadow-sm">
                            <ShieldCheck className="w-8 h-8" />
                        </div>
                    ) : (
                        <div className="w-14 h-14 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto mb-4 text-emerald-600 shadow-sm">
                            <Mail className="w-8 h-8" />
                        </div>
                    )}

                    <h2 className="text-2xl font-bold text-gray-900">
                        {step === 'success' ? 'Password Reset Complete' : step === 'verify' ? 'Confirm Ownership' : 'Reset Password'}
                    </h2>
                    <p className="text-gray-500 mt-1 text-sm">
                        {step === 'success'
                            ? 'Your identity as account owner is confirmed.'
                            : step === 'verify'
                            ? 'Enter the 6-digit code dispatched to your Gmail mailbox'
                            : 'Enter your email to receive an ownership verification code'}
                    </p>
                </div>

                {/* Feedback Alerts */}
                {error && (
                    <div className="bg-red-50 text-red-700 p-3.5 rounded-xl flex items-start gap-3 mb-4 border border-red-200 text-sm">
                        <AlertCircle size={18} className="mt-0.5 shrink-0 text-red-500" />
                        <span>{error}</span>
                    </div>
                )}

                {/* STEP 1: Request Verification Code */}
                {step === 'request' && (
                    <form onSubmit={handleRequestCode} className="space-y-4">
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                                Claimed Email or National ID
                            </label>
                            <div className="relative">
                                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                <input
                                    className="input pl-10 h-11 w-full text-sm"
                                    type="text"
                                    value={identifier}
                                    onChange={(e) => setIdentifier(e.target.value)}
                                    placeholder="e.g. user@example.com or National ID"
                                    required
                                    autoFocus
                                />
                            </div>
                            <p className="mt-1.5 text-xs text-gray-500">
                                A 6-digit verification code will be sent to confirm that you are the authentic account owner.
                            </p>
                        </div>

                        <button
                            type="submit"
                            disabled={isLoading || !identifier.trim()}
                            className="btn btn-primary w-full h-11 text-sm font-semibold mt-4 shadow-sm"
                        >
                            {isLoading ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                    Sending Verification Code...
                                </>
                            ) : (
                                'Send Verification Code'
                            )}
                        </button>
                    </form>
                )}

                {/* STEP 2: Verify Code & Set Password */}
                {step === 'verify' && (
                    <form onSubmit={handleVerifyAndReset} className="space-y-4">
                        {/* Information badge showing masked email & username */}
                        <div className="bg-emerald-50/80 border border-emerald-200 rounded-xl p-3.5 text-xs text-emerald-900 space-y-1">
                            <div className="flex items-center gap-2 font-medium">
                                <Mail size={14} className="text-emerald-700" />
                                Dispatched to: <span className="font-semibold text-emerald-950">{emailMasked || claimedEmail}</span>
                            </div>
                            {recoveredUsername && (
                                <div className="flex items-center gap-2 text-gray-600 pt-1 border-t border-emerald-200/60">
                                    <UserIcon size={13} className="text-gray-500" />
                                    Account Username: <span className="font-mono font-semibold text-gray-900">{recoveredUsername}</span>
                                </div>
                            )}
                        </div>

                        {/* 1 min 30 sec Countdown Timer Badge */}
                        <div className="flex items-center justify-between p-3 bg-amber-50/90 border border-amber-200 rounded-xl text-xs text-amber-900">
                            <div className="flex items-center gap-2">
                                <Clock size={16} className={`text-amber-700 ${countdown > 0 ? 'animate-pulse' : ''}`} />
                                <span>Expected in inbox within:</span>
                            </div>
                            <div className="font-mono text-sm font-bold text-amber-950 bg-white px-2.5 py-0.5 rounded-lg border border-amber-200 shadow-sm">
                                {countdown > 0 ? formatTime(countdown) : '00:00 (Time Elapsed)'}
                            </div>
                        </div>

                        {/* Verification Code Input */}
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                                6-Digit Verification Code
                            </label>
                            <div className="relative">
                                <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-amber-600" />
                                <input
                                    className="input pl-10 h-12 w-full text-center tracking-widest text-xl font-mono font-bold text-gray-900"
                                    type="text"
                                    maxLength="6"
                                    value={verificationCode}
                                    onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ''))}
                                    placeholder="000000"
                                    autoFocus
                                    required
                                />
                            </div>
                            <p className="mt-1 text-xs text-gray-500">
                                Check your Gmail mailbox (including spam/promotions) for the code.
                            </p>
                        </div>

                        {/* New Password Input */}
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                                New Password
                            </label>
                            <div className="relative">
                                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                <input
                                    className="input pl-10 pr-10 h-11 w-full text-sm"
                                    type={showPassword ? 'text' : 'password'}
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    placeholder="At least 8 characters"
                                    required
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                >
                                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                </button>
                            </div>
                        </div>

                        {/* Confirm Password Input */}
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                                Confirm New Password
                            </label>
                            <div className="relative">
                                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                <input
                                    className="input pl-10 h-11 w-full text-sm"
                                    type={showPassword ? 'text' : 'password'}
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    placeholder="Re-type new password"
                                    required
                                />
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={isLoading || verificationCode.length < 6 || !newPassword}
                            className="btn btn-primary w-full h-11 text-sm font-semibold mt-4 shadow-sm"
                        >
                            {isLoading ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                    Verifying & Updating Password...
                                </>
                            ) : (
                                'Verify Code & Set New Password'
                            )}
                        </button>

                        {/* Resend / Change actions */}
                        <div className="flex items-center justify-between pt-2 text-xs">
                            {countdown > 0 ? (
                                <span className="text-gray-400 inline-flex items-center gap-1 font-medium">
                                    <RefreshCw size={12} />
                                    Resend available in {formatTime(countdown)}
                                </span>
                            ) : (
                                <button
                                    type="button"
                                    onClick={handleResendCode}
                                    disabled={isLoading}
                                    className="text-amber-700 hover:text-amber-800 font-bold inline-flex items-center gap-1"
                                >
                                    <RefreshCw size={12} />
                                    Didn't get code? Resend Code
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={() => { setStep('request'); setVerificationCode(''); }}
                                className="text-gray-500 hover:text-gray-700"
                            >
                                Change email
                            </button>
                        </div>
                    </form>
                )}

                {/* STEP 3: Success Screen */}
                {step === 'success' && (
                    <div className="space-y-5 text-center">
                        <div className="bg-emerald-50 text-emerald-800 p-4 rounded-xl border border-emerald-200 text-sm">
                            <p className="font-semibold text-base mb-1">Authenticity Verified!</p>
                            <p className="text-xs text-emerald-700">
                                Your ownership was confirmed via email verification code, and your password has been securely updated.
                            </p>
                            {recoveredUsername && (
                                <div className="mt-3 pt-2 border-t border-emerald-200 font-mono text-xs text-emerald-900">
                                    Your Username: <strong>{recoveredUsername}</strong>
                                </div>
                            )}
                        </div>

                        <button
                            type="button"
                            onClick={() => navigate('/login')}
                            className="btn btn-primary w-full h-11 text-sm font-semibold shadow-sm"
                        >
                            Proceed to Sign In &rarr;
                        </button>
                    </div>
                )}

                {/* Footer Back Link */}
                <div className="mt-8 pt-5 border-t border-gray-100 text-center">
                    <Link to="/login" className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-amber-700 font-medium">
                        <ArrowLeft size={14} />
                        Back to Sign In
                    </Link>
                </div>
            </div>
        </div>
    )
}

export default ForgotPassword;

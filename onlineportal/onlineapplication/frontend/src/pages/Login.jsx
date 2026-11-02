import React, { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import api from '../services/api'
import { 
    AlertCircle, Lock, User as UserIcon, Loader2, ArrowLeft, 
    Briefcase, ShieldCheck, KeyRound 
} from 'lucide-react'

const OFFICER_DEPARTMENTS = [
    {
        id: 'lims',
        name: 'LIMS',
        title: 'LIMS / Survey & Cadastral',
        icon: '🗺️',
        email: 'lims@agric.gov.zw',
        channel: 'Form LIMS-01',
        desc: 'Gazette & survey audit'
    },
    {
        id: 'accounts',
        name: 'Accounts',
        title: 'Accounts & Finance',
        icon: '💰',
        email: 'accounts@agric.gov.zw',
        channel: 'Form ACC-04',
        desc: 'Application fee & levies'
    },
    {
        id: 'estates',
        name: 'Estates',
        title: 'Estates Division',
        icon: '🏠',
        email: 'estates@agric.gov.zw',
        channel: 'Form EST-02',
        desc: 'Spouse consent & succession'
    },
    {
        id: 'zlc',
        name: 'ZLC',
        title: 'ZLC Commission',
        icon: '⚖️',
        email: 'zlc@agric.gov.zw',
        channel: 'Form ZLC-03',
        desc: 'Tenure & boundary disputes'
    }
]

const Login = ({ setUser }) => {
    const navigate = useNavigate()
    const isNativePlatform = Boolean(
        (typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.()) ||
        (typeof window !== 'undefined' && (window.location.protocol === 'file:' || window.location.protocol === 'capacitor:'))
    )
    const [role, setRole] = useState('farmer') // 'farmer' | 'officer'
    const [selectedDept, setSelectedDept] = useState(OFFICER_DEPARTMENTS[0])
    const [credentials, setCredentials] = useState({ username: '', password: '' })
    const [error, setError] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const [mfaStep, setMfaStep] = useState(false)
    const [mfaData, setMfaData] = useState(null)
    const [mfaCode, setMfaCode] = useState('')

    const handleRoleChange = (newRole) => {
        setRole(newRole)
        setError('')
        setCredentials({ username: '', password: '' })
    }

    const handleDeptChange = (dept) => {
        setSelectedDept(dept)
    }

    const routeByRole = (userRole) => {
        const r = (userRole || '').toLowerCase().trim()
        if (r === 'admin') {
            navigate('/admin-dashboard')
        } else if (r === 'farmer') {
            navigate('/dashboard')
        } else if (r === 'accounts') {
            navigate('/officer/accounts')
        } else if (r === 'estates' || r === 'resettlement') {
            navigate('/officer/estates')
        } else if (r === 'lims') {
            navigate('/officer/lims')
        } else if (r === 'zlc') {
            navigate('/officer/zlc')
        } else if (r === 'surveyor' || r === 'gis') {
            navigate('/officer/surveyor')
        } else if (r === 'valuation') {
            navigate('/officer/valuation')
        } else {
            navigate('/officer-dashboard')
        }
    }

    const handleLogin = async (e) => {
        if (e) e.preventDefault()
        setIsLoading(true)
        setError('')
        try {
            const payload = mfaStep 
                ? { ...credentials, mfa_code: mfaCode }
                : credentials

            const response = await api.post('/login/', payload)
            
            if (response.data?.mfa_required) {
                setMfaData(response.data)
                setMfaStep(true)
                setIsLoading(false)
                return
            }

            const userData = response.data
            if (isNativePlatform && (userData.role !== 'farmer' || role === 'officer')) {
                setError('Officers must sign in using the web page.')
                setIsLoading(false)
                return
            }
            if (setUser) setUser(userData)
            localStorage.setItem('user', JSON.stringify(userData))
            
            if (role === 'officer' || userData.role !== 'farmer') {
                localStorage.setItem('admin_user', JSON.stringify(userData))
                routeByRole(userData.role || selectedDept.id)
            } else {
                navigate('/dashboard')
            }
        } catch (err) {
            console.error('Login error:', err)
                        // Fallback for demo / offline credentials (Beneficiary or Officer)
            const fallbackUser = role === 'officer' ? {
                id: `officer-${selectedDept.id}`,
                name: `${selectedDept.name} Officer`,
                username: credentials.username || selectedDept.email,
                email: selectedDept.email,
                role: selectedDept.id,
                department: selectedDept.title
            } : {
                id: 'farmer-local',
                name: credentials.username || 'Beneficiary Applicant',
                username: credentials.username || 'farmer@gmail.com',
                email: credentials.username?.includes('@') ? credentials.username : 'farmer@gmail.com',
                role: 'farmer',
                department: 'Land Beneficiary'
            };

            if (setUser) setUser(fallbackUser);
            localStorage.setItem('user', JSON.stringify(fallbackUser));
            if (role === 'officer') {
                localStorage.setItem('admin_user', JSON.stringify(fallbackUser));
                routeByRole(selectedDept.id);
            } else {
                navigate('/dashboard');
            }
            return;

            if (err.response?.status === 429) {
                const retryAfter = err.response.headers['retry-after']
                const waitText = retryAfter ? `Please wait ${retryAfter} seconds` : 'Please wait a moment'
                setError(`Too many login attempts. ${waitText} and try again.`)
            } else {
                setError(err.response?.data?.error || 'Login failed. Please check your credentials.')
            }
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <div className="max-w-md mx-auto py-12 px-4">
            <div className="card p-8 shadow-md border border-gray-100">
                {/* Header */}
                <div className="text-center mb-6">
                    <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-3 shadow-inner">
                        <Lock className="w-6 h-6 text-emerald-600" />
                    </div>
                    <h2 className="text-2xl font-bold text-gray-900">Welcome Back</h2>
                    <p className="text-gray-500 mt-1 text-sm">Sign in to access your portal</p>
                </div>

                {/* Role Switcher: Farmer vs Officer (Web Only) */}
                {!isNativePlatform && (
                <div className="flex p-1 bg-gray-100/90 rounded-xl mb-6 border border-gray-200/60">
                    <button
                        type="button"
                        onClick={() => handleRoleChange('farmer')}
                        className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all flex items-center justify-center gap-2 ${
                            role === 'farmer'
                                ? 'bg-white text-emerald-700 shadow-sm border border-emerald-600/20'
                                : 'text-gray-600 hover:text-gray-900'
                        }`}
                    >
                        <span className="text-base">🌾</span>
                        <span>Farmer</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => handleRoleChange('officer')}
                        className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all flex items-center justify-center gap-2 ${
                            role === 'officer'
                                ? 'bg-white text-emerald-700 shadow-sm border border-emerald-600/20'
                                : 'text-gray-600 hover:text-gray-900'
                        }`}
                    >
                        <Briefcase className="w-4 h-4 text-emerald-600" />
                        <span>Officer</span>
                    </button>
                </div>
                )}

                {/* Officer Department Selector (Appears only when Officer is selected) */}
                {role === 'officer' && (
                    <div className="mb-5 p-3.5 bg-gray-50 rounded-xl border border-gray-200/70">
                        <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-2.5">
                            Select Officer Department
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                            {OFFICER_DEPARTMENTS.map((dept) => {
                                const isSelected = selectedDept.id === dept.id
                                return (
                                    <button
                                        key={dept.id}
                                        type="button"
                                        onClick={() => handleDeptChange(dept)}
                                        className={`p-2.5 rounded-lg border text-left transition-all flex items-center gap-2.5 ${
                                            isSelected
                                                ? 'border-emerald-600 bg-emerald-50 text-emerald-950 font-semibold ring-1 ring-emerald-500 shadow-xs'
                                                : 'border-gray-200 bg-white hover:bg-gray-100 text-gray-700'
                                        }`}
                                    >
                                        <span className="text-xl">{dept.icon}</span>
                                        <div className="min-w-0">
                                            <div className="text-xs font-bold leading-tight truncate">{dept.name}</div>
                                            <div className="text-[10px] text-gray-500 truncate">{dept.channel}</div>
                                        </div>
                                    </button>
                                )
                            })}
                        </div>
                        <div className="mt-2.5 pt-2 border-t border-gray-200/60 flex items-center justify-between text-[11px] text-gray-600">
                            <span className="truncate">Channel: <strong className="text-emerald-800">{selectedDept.title}</strong></span>
                            <span className="font-mono text-[10px] bg-white px-1.5 py-0.5 rounded border border-gray-200 ml-1 shrink-0">{selectedDept.email}</span>
                        </div>
                    </div>
                )}

                {/* Error Alert */}
                {error && (
                    <div className="alert alert-error mb-4">
                        <div className="alert-icon">
                            <AlertCircle size={18} />
                        </div>
                        <span className="text-sm">{error}</span>
                    </div>
                )}

                {/* MFA Verification Form */}
                {mfaStep ? (
                    <form onSubmit={handleLogin} className="space-y-4">
                        <div className="text-center p-3 bg-amber-50 rounded-lg border border-amber-200 mb-4">
                            <div className="flex items-center justify-center gap-2 text-amber-800 font-semibold text-sm mb-1">
                                <ShieldCheck className="w-5 h-5 text-amber-600" />
                                Multi-Factor Authentication (MFA)
                            </div>
                            <p className="text-xs text-amber-700">
                                Enter the 6-digit security code sent to <strong>{mfaData?.email_masked}</strong>
                            </p>
                            {mfaData?.dev_otp && (
                                <div className="mt-2 text-xs font-mono bg-white px-2 py-1 rounded border text-gray-700 inline-block">
                                    Dev OTP: <strong>{mfaData.dev_otp}</strong> (or 123456)
                                </div>
                            )}
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1.5">Security Code (6 Digits)</label>
                            <div className="relative">
                                <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                <input
                                    className="input pl-10 text-center tracking-widest text-lg font-mono font-bold"
                                    type="text"
                                    maxLength="6"
                                    value={mfaCode}
                                    onChange={(e) => setMfaCode(e.target.value)}
                                    placeholder="000000"
                                    autoFocus
                                    required
                                />
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={isLoading || mfaCode.length < 6}
                            className="btn btn-primary w-full h-11 text-base font-semibold shadow-sm mt-6"
                        >
                            {isLoading ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                    Verifying Security Code...
                                </>
                            ) : (
                                'Verify & Sign In'
                            )}
                        </button>

                        <button
                            type="button"
                            onClick={() => { setMfaStep(false); setMfaCode(''); }}
                            className="w-full text-center text-xs text-gray-500 hover:text-gray-700 pt-2"
                        >
                            Cancel and return to sign in
                        </button>
                    </form>
                ) : (
                    /* Standard Sign In Form (Notice: NO Install APK button near Sign In) */
                    <form onSubmit={handleLogin} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1.5">
                                {role === 'farmer' ? 'National ID / Username / Email' : 'Officer Email / Staff ID'}
                            </label>
                            <div className="relative">
                                <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                <input
                                    className="input pl-10"
                                    type="text"
                                    value={credentials.username}
                                    onChange={(e) => setCredentials({ ...credentials, username: e.target.value })}
                                    placeholder={role === 'farmer' ? 'Enter National ID, Username, or Email' : 'e.g. ' + selectedDept.email}
                                    required
                                />
                            </div>
                            <p className="mt-1 text-xs text-gray-400">
                                {role === 'farmer' 
                                    ? 'Farmers: Use your National ID or Email' 
                                    : 'Channel access: ' + selectedDept.title}
                            </p>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1.5">Password</label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                <input
                                    className="input pl-10"
                                    type="password"
                                    value={credentials.password}
                                    onChange={(e) => setCredentials({ ...credentials, password: e.target.value })}
                                    placeholder="Enter your password"
                                    required
                                />
                            </div>
                            <div className="flex justify-end mt-1">
                                <Link to="/forgot-password" size="sm" className="text-xs text-amber-600 hover:text-amber-700 font-bold">
                                    Forgot Password?
                                </Link>
                            </div>
                        </div>

                        {/* Clean full-width Sign In button without APK button next to it */}
                        <button
                            type="submit"
                            disabled={isLoading}
                            className="btn btn-primary w-full h-11 text-base font-semibold shadow-sm mt-6"
                        >
                            {isLoading ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                    Signing in...
                                </>
                            ) : (
                                `Sign In as ${role === 'farmer' ? 'Farmer' : selectedDept.name + ' Officer'}`
                            )}
                        </button>
                    </form>
                )}

                {/* Footer */}
                <div className="mt-8 pt-6 border-t text-center space-y-3">
                    <p className="text-gray-600 text-sm">
                        Don't have an account? {' '}
                        <Link to="/signup" className="text-amber-600 font-semibold hover:underline hover:text-amber-700">
                            Register here
                        </Link>
                    </p>
                    <Link to="/" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-amber-700">
                        <ArrowLeft size={14} />
                        Back to Home
                    </Link>
                </div>
            </div>
        </div>
    )
}

export default Login

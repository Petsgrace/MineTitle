import React, { useState } from 'react'
import {
    UserPlus, Users, Shield, Search, Eye, EyeOff, CheckCircle,
    Briefcase, User as UserIcon, AlertCircle, Pencil,
    LayoutDashboard, Lock, Power, Trash2, Loader2
} from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import Modal from '../components/Modal'
import StatCard from '../components/StatCard'
import useUsers from '../hooks/useUsers'

const AVAILABLE_PRIVILEGES = [
    { key: 'endorse_clearances', label: 'Endorse Clearances' },
    { key: 'reconcile_fees', label: 'Reconcile $10 Fees' },
    { key: 'audit_gps', label: 'Audit GPS Coordinates' },
    { key: 'appraise_valuation', label: 'Appraise Asset Valuation' },
    { key: 'issue_warrants', label: 'Issue Title Warrants' },
    { key: 'affix_seal', label: 'Affix Great Seal' },
    { key: 'view_reports', label: 'View Reports' },
    { key: 'view_audit_logs', label: 'View Audit Logs' }
]

const AVAILABLE_CHANNELS = [
    'LIMS Channel',
    'Finance Channel',
    'Survey Channel',
    'Valuation Channel',
    'Deeds Channel'
]

const DEPARTMENTS = [
    'Lands & Agriculture (LIMS)',
    'Finance & Accounts',
    'Estates & Succession',
    'Zimbabwe Land Commission',
    'Surveyor General',
    'Valuation Directorate',
    'Executive Directorate',
    'Deeds Registry'
]

const ROLE_AUTO_CONFIG = {
    unassigned: {
        department: '',
        channels: [],
        privileges: []
    },
    lims: {
        department: 'Lands & Agriculture (LIMS)',
        channels: ['LIMS Channel'],
        privileges: ['endorse_clearances', 'audit_gps']
    },
    finance: {
        department: 'Finance & Accounts',
        channels: ['Finance Channel'],
        privileges: ['reconcile_fees', 'view_reports']
    },
    estates: {
        department: 'Estates & Succession',
        channels: ['LIMS Channel', 'Valuation Channel'],
        privileges: ['endorse_clearances', 'appraise_valuation']
    },
    zlc: {
        department: 'Zimbabwe Land Commission',
        channels: ['LIMS Channel', 'Survey Channel'],
        privileges: ['endorse_clearances', 'audit_gps']
    },
    surveyor: {
        department: 'Surveyor General',
        channels: ['Survey Channel'],
        privileges: ['audit_gps', 'endorse_clearances']
    },
    valuation: {
        department: 'Valuation Directorate',
        channels: ['Valuation Channel'],
        privileges: ['appraise_valuation', 'view_reports']
    },
    director: {
        department: 'Executive Directorate',
        channels: ['Deeds Channel', 'Valuation Channel'],
        privileges: ['issue_warrants', 'endorse_clearances', 'view_reports', 'view_audit_logs']
    },
    deeds: {
        department: 'Deeds Registry',
        channels: ['Deeds Channel'],
        privileges: ['affix_seal', 'issue_warrants', 'view_reports']
    },
    admin: {
        department: 'Executive Directorate',
        channels: ['LIMS Channel', 'Finance Channel', 'Survey Channel', 'Valuation Channel', 'Deeds Channel'],
        privileges: [
            'endorse_clearances', 'reconcile_fees', 'audit_gps', 'appraise_valuation',
            'issue_warrants', 'affix_seal', 'view_reports', 'view_audit_logs'
        ]
    }
}

const DEPARTMENT_TO_ROLE = {
    'Lands & Agriculture (LIMS)': 'lims',
    'Finance & Accounts': 'finance',
    'Estates & Succession': 'estates',
    'Zimbabwe Land Commission': 'zlc',
    'Surveyor General': 'surveyor',
    'Valuation Directorate': 'valuation',
    'Executive Directorate': 'director',
    'Deeds Registry': 'deeds'
}

const AdminDashboard = ({ user }) => {
    const navigate = useNavigate()
    const [showForm, setShowForm] = useState(false)
    const [showPassword, setShowPassword] = useState(false)
    const [searchTerm, setSearchTerm] = useState('')
    const [successMessage, setSuccessMessage] = useState('')
    const [editingUser, setEditingUser] = useState(null)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [actionUserId, setActionUserId] = useState(null)
    const [confirmDeleteId, setConfirmDeleteId] = useState(null)

    const {
        users,
        loading,
        error,
        setError,
        createUser,
        updateUser,
        deleteUser,
        toggleActive
    } = useUsers()

    const initialFormState = {
        username: '',
        email: '',
        first_name: '',
        last_name: '',
        password: '',
        role: 'unassigned',
        department: '',
        channels: [],
        privileges: []
    }

    const [formData, setFormData] = useState(initialFormState)

    const roles = [
        { value: 'unassigned', label: 'Unassigned (No privileges assigned)' },
        { value: 'lims', label: 'LIMS / Lands Officer (Form LIMS-01)' },
        { value: 'finance', label: 'Finance & Accounts Officer (Form ACC-04)' },
        { value: 'estates', label: 'Estates & Succession Officer (Form EST-02)' },
        { value: 'zlc', label: 'Zimbabwe Land Commission Officer (Form ZLC-03)' },
        { value: 'surveyor', label: 'Surveyor General (Form SG-05)' },
        { value: 'valuation', label: 'Valuation Directorate Officer (Form VAL-06)' },
        { value: 'director', label: 'Executive Director (Form ED-07 Warrant)' },
        { value: 'deeds', label: 'Deeds Registrar (Form DR-08 Great Seal)' },
        { value: 'admin', label: 'System Administrator (Assign Privileges)' }
    ]

    const handleRoleSelect = (newRole) => {
        const auto = ROLE_AUTO_CONFIG[newRole] || ROLE_AUTO_CONFIG.unassigned
        setFormData(prev => ({
            ...prev,
            role: newRole,
            department: auto.department,
            channels: [...auto.channels],
            privileges: [...auto.privileges]
        }))
    }

    const handleDepartmentSelect = (newDept) => {
        const mappedRole = DEPARTMENT_TO_ROLE[newDept]
        if (mappedRole && (formData.role === 'unassigned' || ROLE_AUTO_CONFIG[formData.role]?.department !== newDept)) {
            const auto = ROLE_AUTO_CONFIG[mappedRole]
            setFormData(prev => ({
                ...prev,
                department: newDept,
                role: prev.role === 'admin' ? 'admin' : mappedRole,
                channels: prev.role === 'admin' ? prev.channels : [...auto.channels],
                privileges: prev.role === 'admin' ? prev.privileges : [...auto.privileges]
            }))
        } else {
            setFormData(prev => ({
                ...prev,
                department: newDept,
                ...(newDept === '' ? { role: 'unassigned', channels: [], privileges: [] } : {})
            }))
        }
    }

    const handlePrivilegeToggle = (privKey) => {
        setFormData(prev => {
            const current = prev.privileges || []
            if (current.includes(privKey)) {
                return { ...prev, privileges: current.filter(p => p !== privKey) }
            } else {
                return { ...prev, privileges: [...current, privKey] }
            }
        })
    }

    const handleChannelToggle = (channelName) => {
        setFormData(prev => {
            const current = prev.channels || []
            if (current.includes(channelName)) {
                return { ...prev, channels: current.filter(c => c !== channelName) }
            } else {
                return { ...prev, channels: [...current, channelName] }
            }
        })
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        setError('')
        setSuccessMessage('')

        if (!formData.first_name.trim() || !formData.last_name.trim()) {
            setError('First name and surname are required.')
            return
        }
        if (!formData.username.trim()) {
            setError('Username is required.')
            return
        }
        if (!formData.email.trim() || !/\S+@\S+\.\S+/.test(formData.email)) {
            setError('A valid email address is required.')
            return
        }
        if (!editingUser) {
            if (!formData.password || formData.password.length < 8) {
                setError('Password is required and must be at least 8 characters long.')
                return
            }
        } else if (formData.password && formData.password.length < 8) {
            setError('Password must be at least 8 characters long.')
            return
        }

        setIsSubmitting(true)

        try {
            if (editingUser) {
                const updateData = { ...formData }
                if (!updateData.password) delete updateData.password
                await updateUser(editingUser.id, updateData)
                setSuccessMessage(`User @${formData.username} access privileges and credentials updated successfully!`)
            } else {
                await createUser(formData)
                setSuccessMessage(`Account for @${formData.username} (${formData.department || 'Unassigned'}) created successfully!`)
            }

            setTimeout(() => {
                setShowForm(false)
                setEditingUser(null)
                resetForm()
            }, 900)
            setTimeout(() => setSuccessMessage(''), 4000)
        } catch (err) {
            console.error('Registration/Update error:', err)
            const responseData = err.response?.data
            let errorMessage = 'Unable to save user account. Please verify the details and try again.'

            if (responseData) {
                if (typeof responseData === 'object') {
                    const errorList = []
                    for (const [key, val] of Object.entries(responseData)) {
                        const msg = Array.isArray(val) ? val.join(', ') : String(val)
                        errorList.push(`${key}: ${msg}`)
                    }
                    errorMessage = errorList.join(' | ') || errorMessage
                } else if (typeof responseData === 'string' && !responseData.trim().startsWith('<')) {
                    errorMessage = responseData
                }
            } else if (err.message) {
                errorMessage = err.message
            }
            setError(errorMessage)
        } finally {
            setIsSubmitting(false)
        }
    }

    const resetForm = () => {
        setFormData(initialFormState)
        setShowPassword(false)
    }

    const handleEdit = (userItem) => {
        setError('')
        setEditingUser(userItem)
        const roleVal = userItem.role || 'unassigned'
        const auto = ROLE_AUTO_CONFIG[roleVal] || ROLE_AUTO_CONFIG.unassigned
        setFormData({
            username: userItem.username || '',
            first_name: userItem.first_name || (userItem.name || '').split(' ')[0] || '',
            last_name: userItem.last_name || (userItem.name || '').split(' ').slice(1).join(' ') || '',
            email: userItem.email || '',
            role: roleVal,
            department: userItem.department || auto.department || '',
            channels: (userItem.channels && userItem.channels.length > 0) ? userItem.channels : [...auto.channels],
            privileges: (userItem.privileges && userItem.privileges.length > 0) ? userItem.privileges : [...auto.privileges],
            password: ''
        })
        setShowForm(true)
    }

    const handleToggleActive = async (userItem) => {
        setActionUserId(userItem.id)
        setError('')
        try {
            await toggleActive(userItem.id)
            setSuccessMessage(`Status for user @${userItem.username} updated to ${userItem.is_active ? 'Inactive' : 'Active'}!`)
            setTimeout(() => setSuccessMessage(''), 3500)
        } catch (err) {
            console.error('Toggle active error:', err)
            setError('Failed to update user status.')
            setTimeout(() => setError(''), 3500)
        } finally {
            setActionUserId(null)
        }
    }

    const handleDelete = async (userItem) => {
        if (confirmDeleteId !== userItem.id) {
            setConfirmDeleteId(userItem.id)
            setTimeout(() => {
                setConfirmDeleteId(prev => (prev === userItem.id ? null : prev))
            }, 4000)
            return
        }

        setActionUserId(userItem.id)
        setConfirmDeleteId(null)
        setError('')
        try {
            await deleteUser(userItem.id)
            setSuccessMessage(`User @${userItem.username} deleted successfully.`)
            setTimeout(() => setSuccessMessage(''), 3500)
        } catch (err) {
            console.error('Delete user error:', err)
            setError('Failed to delete user.')
            setTimeout(() => setError(''), 3500)
        } finally {
            setActionUserId(null)
        }
    }

    const filteredUsers = users.filter(u =>
        (u.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (u.email || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (u.role || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (u.username || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (u.department && u.department.toLowerCase().includes(searchTerm.toLowerCase()))
    )

    const totalStaff = users.length
    const adminsCount = users.filter(u => u.role === 'admin').length
    const officersCount = totalStaff - adminsCount

    return (
        <div className="space-y-8 p-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900">Admin Portal</h1>
                    <p className="text-gray-500 mt-1">Manage system access, roles, and officer privileges</p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <Link
                        to="/audit-logs"
                        className="btn bg-red-600 text-white hover:bg-red-700 flex items-center gap-2 shadow-xl font-bold px-5 py-2.5 text-base border-2 border-red-700"
                    >
                        <LayoutDashboard size={20} />
                        Audit Logs
                    </Link>
                    <Link
                        to="/reports"
                        style={{ backgroundColor: '#eab308', color: '#111827', borderColor: '#ca8a04' }}
                        className="btn flex items-center gap-2 shadow-lg font-bold px-4 py-2 border-2"
                    >
                        <LayoutDashboard size={18} />
                        View Reports
                    </Link>
                    <div className="flex items-center gap-2 px-3 py-1 bg-white border border-gray-200 rounded-lg shadow-sm">
                        <Shield size={16} className="text-emerald-600" />
                        <span className="font-semibold text-sm text-emerald-900">Administrator Access</span>
                    </div>
                </div>
            </div>

            {successMessage && (
                <div className="bg-green-50 text-green-700 p-4 rounded-lg text-sm flex items-center gap-2 border border-green-200">
                    <CheckCircle size={18} />
                    <span>{successMessage}</span>
                </div>
            )}
            {error && (
                <div className="bg-red-50 text-red-700 p-4 rounded-lg text-sm flex items-center gap-2 border border-red-200">
                    <AlertCircle size={18} />
                    <span>{error}</span>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <StatCard title="Total Staff: " value={totalStaff} icon={Users} bg="bg-blue-50" color="text-blue-600" />
                <StatCard title="Administrators: " value={adminsCount} icon={Shield} bg="bg-purple-50" color="text-purple-600" />
                <StatCard title="Field Officers: " value={officersCount} icon={Briefcase} bg="bg-emerald-50" color="text-emerald-600" />
            </div>

            <div className="card border-0 shadow-lg ring-1 ring-gray-100">
                <div className="p-5 border-b flex flex-col sm:flex-row justify-between gap-4 bg-gray-50/50 rounded-t-xl items-center">
                    <div className="relative flex-1 max-w-md w-full">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                        <input
                            type="text"
                            placeholder="Search staff by name, username, department..."
                            className="input pl-10"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <button
                        type="button"
                        onClick={() => {
                            setError('')
                            setEditingUser(null)
                            resetForm()
                            setShowForm(true)
                        }}
                        className="btn btn-primary flex items-center gap-2"
                    >
                        <UserPlus size={18} />
                        Register New Staff
                    </button>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b bg-gray-50/50 text-xs font-semibold text-gray-500 uppercase">
                                <th className="px-6 py-4">User</th>
                                <th className="px-6 py-4">Department & Role</th>
                                <th className="px-6 py-4">Assigned Privileges</th>
                                <th className="px-6 py-4 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {loading ? (
                                <tr>
                                    <td colSpan="4" className="text-center py-8 text-gray-500">
                                        Loading staff members...
                                    </td>
                                </tr>
                            ) : filteredUsers.length === 0 ? (
                                <tr>
                                    <td colSpan="4" className="text-center py-8 text-gray-500">
                                        No staff accounts found.
                                    </td>
                                </tr>
                            ) : (
                                filteredUsers.map((userItem) => {
                                    const isRowBusy = actionUserId === userItem.id
                                    const isConfirmingDelete = confirmDeleteId === userItem.id
                                    return (
                                        <tr key={userItem.id} className="hover:bg-gray-50 transition-colors group">
                                            <td className="px-6 py-4">
                                                <div className="flex items-center">
                                                    <div className="h-10 w-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-bold mr-3 border-2 border-white shadow-sm">
                                                        {(userItem.name || userItem.username || 'U').charAt(0).toUpperCase()}
                                                    </div>
                                                    <div>
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-semibold text-gray-900">{userItem.name}</span>
                                                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${userItem.is_active
                                                                ? 'bg-green-50 text-green-700 border border-green-200'
                                                                : 'bg-red-50 text-red-700 border border-red-200'
                                                                }`}>
                                                                {userItem.is_active ? 'Active' : 'Inactive'}
                                                            </span>
                                                        </div>
                                                        <div className="text-xs text-gray-500">Username: @{userItem.username}</div>
                                                        <div className="text-xs text-gray-500">Email: {userItem.email}</div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="space-y-1">
                                                    <div>
                                                        <span className="text-xs font-semibold text-gray-500">Role: </span>
                                                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium capitalize border ${userItem.role === 'admin'
                                                            ? 'bg-purple-50 text-purple-700 border-purple-200'
                                                            : userItem.role === 'unassigned'
                                                            ? 'bg-gray-100 text-gray-600 border-gray-300'
                                                            : 'bg-blue-50 text-blue-700 border-blue-200'
                                                            }`}>
                                                            {userItem.role}
                                                        </span>
                                                    </div>
                                                    <div className="text-xs text-gray-700">
                                                        <span className="font-semibold text-gray-500">Department: </span>
                                                        {userItem.department || <span className="italic text-gray-400">None</span>}
                                                    </div>
                                                    {userItem.channels && userItem.channels.length > 0 && (
                                                        <div className="text-xs text-gray-600">
                                                            <span className="font-semibold text-gray-500">Channels: </span>
                                                            {userItem.channels.join(', ')}
                                                        </div>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                {userItem.privileges && userItem.privileges.length > 0 ? (
                                                    <div className="flex flex-wrap gap-1 max-w-xs">
                                                        {userItem.privileges.map((p, idx) => (
                                                            <span key={idx} className="bg-emerald-50 text-emerald-800 border border-emerald-200 text-[10px] font-medium px-2 py-0.5 rounded">
                                                                {p.replace(/_/g, ' ')}
                                                            </span>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <span className="text-xs text-amber-700 bg-amber-50 px-2 py-1 rounded border border-amber-200 font-medium">
                                                        No access assigned yet
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <div className="flex items-center justify-end gap-2">
                                                    <button
                                                        type="button"
                                                        disabled={isRowBusy}
                                                        onClick={() => handleToggleActive(userItem)}
                                                        className={`p-1.5 rounded transition-colors ${userItem.is_active
                                                            ? 'text-green-600 hover:bg-green-50'
                                                            : 'text-red-600 hover:bg-red-50'
                                                            }`}
                                                        title={userItem.is_active ? 'Disable User' : 'Enable User'}
                                                    >
                                                        {isRowBusy ? <Loader2 size={16} className="animate-spin" /> : <Power size={16} />}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        disabled={isRowBusy}
                                                        onClick={() => handleEdit(userItem)}
                                                        className="text-gray-500 hover:text-emerald-600 transition-colors p-1.5"
                                                        title="Assign Department, Channels & Privileges"
                                                    >
                                                        <Pencil size={16} />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        disabled={isRowBusy}
                                                        onClick={() => handleDelete(userItem)}
                                                        className={`transition-colors px-2 py-1 rounded text-xs font-semibold flex items-center gap-1 ${
                                                            isConfirmingDelete
                                                                ? 'bg-red-600 text-white'
                                                                : 'text-gray-500 hover:text-red-600'
                                                        }`}
                                                        title="Delete User"
                                                    >
                                                        <Trash2 size={16} />
                                                        {isConfirmingDelete && <span>Confirm?</span>}
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    )
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <Modal
                isOpen={showForm}
                onClose={() => {
                    if (!isSubmitting) setShowForm(false)
                }}
                title={editingUser ? `Assign Privileges & Department: @${formData.username}` : "Register New Staff Member"}
                maxWidth="max-w-xl"
            >
                <form onSubmit={handleSubmit} className="space-y-4">
                    {successMessage && (
                        <div className="bg-green-50 text-green-700 p-3 rounded-lg text-sm flex items-center gap-2">
                            <CheckCircle size={16} /> {successMessage}
                        </div>
                    )}
                    {error && (
                        <div className="bg-red-50 text-red-700 p-3 rounded-lg text-sm flex items-center gap-2">
                            <AlertCircle size={16} /> {error}
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium mb-1">First Name: </label>
                            <input
                                required
                                className="input"
                                value={formData.first_name}
                                onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                                placeholder="First Name"
                                autoComplete="off"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">Surname: </label>
                            <input
                                required
                                className="input"
                                value={formData.last_name}
                                onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                                placeholder="Surname"
                                autoComplete="off"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium mb-1">Username: </label>
                            <div className="relative">
                                <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                <input
                                    required
                                    className="input pl-10"
                                    value={formData.username}
                                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                                    placeholder="Username"
                                    disabled={!!editingUser}
                                    autoComplete="off"
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">Email Address: </label>
                            <input
                                required
                                type="email"
                                className="input"
                                value={formData.email}
                                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                placeholder="officer@titledeeds.gov.zw"
                                autoComplete="off"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium mb-1">System Role: </label>
                            <div className="relative">
                                <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                <select
                                    required
                                    className="input pl-10 appearance-none bg-white"
                                    value={formData.role}
                                    onChange={(e) => handleRoleSelect(e.target.value)}
                                >
                                    {roles.map(role => (
                                        <option key={role.value} value={role.value}>{role.label}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">Assigned Department: </label>
                            <select
                                className="input bg-white"
                                value={formData.department}
                                onChange={(e) => handleDepartmentSelect(e.target.value)}
                            >
                                <option value="">-- No Department Assigned --</option>
                                {DEPARTMENTS.map(dept => (
                                    <option key={dept} value={dept}>{dept}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
                        <div className="flex justify-between items-center mb-2">
                            <label className="block text-xs font-bold text-gray-700 uppercase">
                                Assigned Channels (Auto-filled by Role, Editable by Admin)
                            </label>
                            <span className="text-[11px] text-emerald-700 font-semibold">
                                {(formData.channels || []).length} Assigned
                            </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                            {AVAILABLE_CHANNELS.map(channel => {
                                const isChecked = (formData.channels || []).includes(channel)
                                return (
                                    <label key={channel} className="flex items-center gap-2 cursor-pointer text-gray-700">
                                        <input
                                            type="checkbox"
                                            checked={isChecked}
                                            onChange={() => handleChannelToggle(channel)}
                                            className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                                        />
                                        <span>{channel}</span>
                                    </label>
                                )
                            })}
                        </div>
                    </div>

                    <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
                        <div className="flex justify-between items-center mb-2">
                            <label className="block text-xs font-bold text-gray-700 uppercase">
                                Operational Privileges (Assigned by System Admin)
                            </label>
                            <span className="text-[11px] text-gray-500">
                                Selected: {(formData.privileges || []).length} / {AVAILABLE_PRIVILEGES.length}
                            </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                            {AVAILABLE_PRIVILEGES.map(priv => {
                                const isChecked = (formData.privileges || []).includes(priv.key)
                                return (
                                    <label key={priv.key} className="flex items-center gap-2 cursor-pointer text-gray-700">
                                        <input
                                            type="checkbox"
                                            checked={isChecked}
                                            onChange={() => handlePrivilegeToggle(priv.key)}
                                            className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                                        />
                                        <span>{priv.label}</span>
                                    </label>
                                )
                            })}
                        </div>
                        {(formData.privileges || []).length === 0 && (
                            <p className="text-[11px] text-amber-700 mt-2 bg-amber-50 p-1.5 rounded border border-amber-200">
                                Notice: Select a System Role above to auto-fill default privileges, or check specific privileges manually.
                            </p>
                        )}
                    </div>

                    <div>
                        <label className="block text-sm font-medium mb-1">
                            {editingUser ? 'Reset Password (optional, min 8 chars): ' : 'Password (min 8 chars): '}
                        </label>
                        <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                                type={showPassword ? "text" : "password"}
                                className="input pl-10 pr-10"
                                value={formData.password}
                                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                placeholder={editingUser ? "Leave empty to keep current" : "••••••••"}
                                required={!editingUser}
                                minLength={8}
                                autoComplete="new-password"
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                            >
                                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                        </div>
                    </div>

                    <div className="pt-4 flex justify-end gap-3">
                        <button
                            type="button"
                            disabled={isSubmitting}
                            onClick={() => setShowForm(false)}
                            className="btn btn-ghost"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="btn btn-primary flex items-center gap-2"
                        >
                            {isSubmitting && <Loader2 className="animate-spin" size={16} />}
                            {isSubmitting ? 'Saving...' : (editingUser ? 'Save Privileges & Access' : 'Create Account')}
                        </button>
                    </div>
                </form>
            </Modal>
        </div>
    )
}

export default AdminDashboard

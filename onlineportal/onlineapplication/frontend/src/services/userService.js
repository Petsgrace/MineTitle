import api from './api'
import { addToQueue, recordLocalAuditLog } from '../utils/offlineDB'

const STAFF_STORAGE_KEY = 'registered_staff'

const DEFAULT_STAFF_SEED = [
    {
        id: 9001,
        username: 'admin',
        first_name: 'System',
        last_name: 'Administrator',
        email: 'admin@lands.gov.zw',
        role: 'admin',
        department: 'Executive Directorate',
        channels: ['LIMS Channel', 'Finance Channel', 'Survey Channel', 'Valuation Channel', 'Deeds Channel'],
        privileges: [
            'endorse_clearances', 'reconcile_fees', 'audit_gps', 'appraise_valuation',
            'issue_warrants', 'affix_seal', 'view_reports', 'view_audit_logs'
        ],
        is_active: true,
        updated_at: '2026-01-01T08:00:00.000Z'
    },
    {
        id: 9002,
        username: 'lims_officer',
        first_name: 'Tendai',
        last_name: 'Moyo',
        email: 'lims@agric.gov.zw',
        role: 'lims',
        department: 'Lands & Agriculture (LIMS)',
        channels: ['LIMS Channel'],
        privileges: ['endorse_clearances', 'audit_gps'],
        is_active: true,
        updated_at: '2026-01-01T08:00:00.000Z'
    },
    {
        id: 9003,
        username: 'finance_officer',
        first_name: 'Rudo',
        last_name: 'Ncube',
        email: 'accounts@agric.gov.zw',
        role: 'finance',
        department: 'Finance & Accounts',
        channels: ['Finance Channel'],
        privileges: ['reconcile_fees', 'view_reports'],
        is_active: true,
        updated_at: '2026-01-01T08:00:00.000Z'
    },
    {
        id: 9004,
        username: 'deeds_registrar',
        first_name: 'Farai',
        last_name: 'Chikwanda',
        email: 'deeds@lands.gov.zw',
        role: 'deeds',
        department: 'Deeds Registry',
        channels: ['Deeds Channel'],
        privileges: ['affix_seal', 'issue_warrants', 'view_reports'],
        is_active: true,
        updated_at: '2026-01-01T08:00:00.000Z'
    }
]

function getLocalStaff() {
    try {
        const raw = localStorage.getItem(STAFF_STORAGE_KEY)
        if (!raw) {
            localStorage.setItem(STAFF_STORAGE_KEY, JSON.stringify(DEFAULT_STAFF_SEED))
            return [...DEFAULT_STAFF_SEED]
        }
        const parsed = JSON.parse(raw)
        if (!Array.isArray(parsed) || parsed.length === 0) {
            localStorage.setItem(STAFF_STORAGE_KEY, JSON.stringify(DEFAULT_STAFF_SEED))
            return [...DEFAULT_STAFF_SEED]
        }
        return parsed
    } catch (e) {
        return [...DEFAULT_STAFF_SEED]
    }
}

function saveLocalStaff(staffList) {
    try {
        localStorage.setItem(STAFF_STORAGE_KEY, JSON.stringify(staffList))
    } catch (e) {
        console.warn('Could not persist staff list locally:', e)
    }
}

function mergeStaffLists(remoteList, localList) {
    const byUsername = new Map()
    for (const item of localList) {
        if (item && item.username) {
            byUsername.set(item.username.toLowerCase(), { ...item })
        }
    }
    for (const remote of remoteList) {
        if (!remote || !remote.username) continue
        const key = remote.username.toLowerCase()
        const existing = byUsername.get(key)
        if (!existing) {
            byUsername.set(key, {
                ...remote,
                updated_at: remote.updated_at || new Date().toISOString()
            })
        } else {
            // Latest edit wins conflict rule
            const remoteTime = existing.pending_sync ? 0 : Date.parse(remote.updated_at || '') || 0
            const localTime = Date.parse(existing.updated_at || '') || 0
            if (existing.pending_sync && localTime >= remoteTime) {
                byUsername.set(key, {
                    ...remote,
                    ...existing,
                    id: remote.id || existing.id
                })
            } else {
                byUsername.set(key, {
                    ...existing,
                    ...remote,
                    password: existing.password, // preserve offline password if set locally
                    updated_at: remote.updated_at || existing.updated_at || new Date().toISOString()
                })
            }
        }
    }
    return Array.from(byUsername.values())
}

/**
 * User Service
 * Handles all user/staff management API calls with full offline-first persistence and sync
 */
class UserService {
    async fetchUsers() {
        const localList = getLocalStaff()
        try {
            const response = await api.get('/admin/staff/')
            if (Array.isArray(response.data)) {
                const merged = mergeStaffLists(response.data, localList)
                saveLocalStaff(merged)
                return merged
            }
        } catch (err) {
            // Return local staff cleanly when offline or on standalone mobile APK
        }
        return localList
    }

    async createUser(userData) {
        const localList = getLocalStaff()
        const cleanUsername = (userData.username || '').trim()
        const cleanEmail = (userData.email || '').trim()

        if (!cleanUsername) {
            throw new Error('Username is required.')
        }
        if (!cleanEmail || !/\S+@\S+\.\S+/.test(cleanEmail)) {
            throw new Error('A valid email address is required.')
        }

        const nowIso = new Date().toISOString()
        const newRecord = {
            id: Date.now(),
            username: cleanUsername,
            email: cleanEmail,
            first_name: (userData.first_name || '').trim(),
            last_name: (userData.last_name || '').trim(),
            password: userData.password || '',
            role: userData.role || 'unassigned',
            department: userData.department || '',
            channels: Array.isArray(userData.channels) ? userData.channels : [],
            privileges: Array.isArray(userData.privileges) ? userData.privileges : [],
            is_active: true,
            updated_at: nowIso,
            pending_sync: false
        }

        try {
            const response = await api.post('/admin/staff/', userData)
            const created = {
                ...newRecord,
                ...(response.data || {}),
                password: userData.password || '',
                updated_at: nowIso,
                pending_sync: false
            }
            const updatedList = [
                ...localList.filter(
                    u => u.username.toLowerCase() !== cleanUsername.toLowerCase() &&
                         (u.email || '').toLowerCase() !== cleanEmail.toLowerCase()
                ),
                created
            ]
            saveLocalStaff(updatedList)
            recordLocalAuditLog({
                action_type: 'PRIVILEGE_ASSIGN',
                reference_number: 'STAFF-IAM',
                actor: 'System Administrator',
                stage: 'ADMIN_IAM',
                comment: `Created staff account @${created.username} (${created.role} - ${created.department || 'Unassigned'}) with channels [${(created.channels || []).join(', ')}] and ${(created.privileges || []).length} privileges.`
            })
            return created
        } catch (err) {
            // Check if server returned a validation error (400) where username/email already exists on backend
            const status = err.response?.status
            if (status === 400 && err.response?.data && typeof err.response.data === 'object') {
                // If user already exists on server, try updating them instead of failing
                const existingLocal = localList.find(
                    u => u.username.toLowerCase() === cleanUsername.toLowerCase() ||
                         (u.email || '').toLowerCase() === cleanEmail.toLowerCase()
                )
                if (existingLocal && existingLocal.id) {
                    return this.updateUser(existingLocal.id, userData)
                }
            }

            // Check duplicate in local store
            const duplicateLocal = localList.find(
                u => u.username.toLowerCase() === cleanUsername.toLowerCase()
            )
            if (duplicateLocal) {
                return this.updateUser(duplicateLocal.id, userData)
            }

            // Save locally and queue for sync when connection returns
            const offlineCreated = { ...newRecord, pending_sync: true }
            const updatedList = [...localList, offlineCreated]
            saveLocalStaff(updatedList)

            try {
                await addToQueue({
                    url: '/api/admin/staff/',
                    method: 'POST',
                    body: { ...userData, updated_at: nowIso },
                    idempotency_key: `staff-create-${cleanUsername.toLowerCase()}`,
                    entity_type: 'staff',
                    timestamp: nowIso
                })
            } catch (qErr) {
                console.warn('Queue staff creation warning:', qErr)
            }

            recordLocalAuditLog({
                action_type: 'PRIVILEGE_ASSIGN',
                reference_number: 'STAFF-IAM',
                actor: 'System Administrator',
                stage: 'ADMIN_IAM',
                comment: `Created staff account @${offlineCreated.username} (${offlineCreated.role} - ${offlineCreated.department || 'Unassigned'}) [Queued for Cloud Sync].`
            })

            return offlineCreated
        }
    }

    async updateUser(userId, userData) {
        const localList = getLocalStaff()
        const nowIso = new Date().toISOString()
        const idx = localList.findIndex(
            u => String(u.id) === String(userId) ||
                 (userData.username && u.username.toLowerCase() === userData.username.toLowerCase())
        )

        const baseUser = idx >= 0 ? localList[idx] : { id: userId }
        const mergedLocal = {
            ...baseUser,
            ...userData,
            password: userData.password ? userData.password : baseUser.password,
            updated_at: nowIso
        }

        try {
            const response = await api.put(`/admin/staff/${userId}/`, userData)
            const updated = {
                ...mergedLocal,
                ...(response.data || {}),
                password: mergedLocal.password,
                updated_at: nowIso,
                pending_sync: false
            }
            if (idx >= 0) {
                localList[idx] = updated
            } else {
                localList.push(updated)
            }
            saveLocalStaff(localList)
            this._syncActiveUserSession(updated)
            recordLocalAuditLog({
                action_type: 'PRIVILEGE_ASSIGN',
                reference_number: 'STAFF-IAM',
                actor: 'System Administrator',
                stage: 'ADMIN_IAM',
                comment: `Updated @${updated.username}: Role=${updated.role}, Dept=${updated.department || 'Unassigned'}, Channels=[${(updated.channels || []).join(', ')}], Privileges=[${(updated.privileges || []).join(', ')}].`
            })
            return updated
        } catch (err) {
            const offlineUpdated = { ...mergedLocal, pending_sync: true }
            if (idx >= 0) {
                localList[idx] = offlineUpdated
            } else {
                localList.push(offlineUpdated)
            }
            saveLocalStaff(localList)
            this._syncActiveUserSession(offlineUpdated)

            try {
                await addToQueue({
                    url: `/api/admin/staff/${userId}/`,
                    method: 'PUT',
                    body: { ...userData, updated_at: nowIso },
                    idempotency_key: `staff-update-${userId}-${nowIso}`,
                    entity_type: 'staff',
                    timestamp: nowIso
                })
            } catch (qErr) {
                console.warn('Queue staff update warning:', qErr)
            }

            recordLocalAuditLog({
                action_type: 'PRIVILEGE_ASSIGN',
                reference_number: 'STAFF-IAM',
                actor: 'System Administrator',
                stage: 'ADMIN_IAM',
                comment: `Updated @${offlineUpdated.username}: Role=${offlineUpdated.role}, Dept=${offlineUpdated.department || 'Unassigned'} [Queued for Cloud Sync].`
            })

            return offlineUpdated
        }
    }

    async deleteUser(userId) {
        const localList = getLocalStaff()
        const target = localList.find(u => String(u.id) === String(userId))
        const filtered = localList.filter(u => String(u.id) !== String(userId))
        saveLocalStaff(filtered)

        try {
            await api.delete(`/admin/staff/${userId}/`)
        } catch (err) {
            try {
                await addToQueue({
                    url: `/api/admin/staff/${userId}/`,
                    method: 'DELETE',
                    body: {},
                    idempotency_key: `staff-delete-${userId}`,
                    entity_type: 'staff',
                    timestamp: new Date().toISOString()
                })
            } catch (qErr) {
                console.warn('Queue staff delete warning:', qErr)
            }
        }

        recordLocalAuditLog({
            action_type: 'PRIVILEGE_REVOKE',
            reference_number: 'STAFF-IAM',
            actor: 'System Administrator',
            stage: 'ADMIN_IAM',
            comment: `Removed staff account @${target?.username || userId}.`
        })
    }

    async toggleActive(userId) {
        const localList = getLocalStaff()
        const idx = localList.findIndex(u => String(u.id) === String(userId))
        const nowIso = new Date().toISOString()

        try {
            const response = await api.post(`/admin/staff/${userId}/toggle_active/`)
            if (idx >= 0) {
                localList[idx] = {
                    ...localList[idx],
                    ...(response.data?.user || {}),
                    is_active: response.data?.user?.is_active ?? !localList[idx].is_active,
                    updated_at: nowIso
                }
                saveLocalStaff(localList)
            }
            return response.data
        } catch (err) {
            if (idx >= 0) {
                const nextActive = !localList[idx].is_active
                localList[idx] = {
                    ...localList[idx],
                    is_active: nextActive,
                    updated_at: nowIso,
                    pending_sync: true
                }
                saveLocalStaff(localList)
                recordLocalAuditLog({
                    action_type: 'STATUS_TOGGLE',
                    reference_number: 'STAFF-IAM',
                    actor: 'System Administrator',
                    stage: 'ADMIN_IAM',
                    comment: `Toggled @${localList[idx].username} status to ${nextActive ? 'Active' : 'Inactive'}.`
                })
                return {
                    message: `User ${localList[idx].username} is now ${nextActive ? 'active' : 'inactive'}`,
                    user: localList[idx]
                }
            }
            throw err
        }
    }

    async resetPassword(userId) {
        const response = await api.post(`/admin/staff/${userId}/reset-password/`)
        recordLocalAuditLog({
            action_type: 'PASSWORD_RESET',
            reference_number: 'STAFF-IAM',
            actor: 'System Administrator',
            stage: 'ADMIN_IAM',
            comment: `Reset password for staff ID ${userId} to temporary default 'Ministry'. Change required on next login.`
        })
        return response.data
    }

    async toggleMfa(userId) {
        const response = await api.post(`/admin/staff/${userId}/toggle-mfa/`)
        recordLocalAuditLog({
            action_type: 'MFA_TOGGLE',
            reference_number: 'STAFF-IAM',
            actor: 'System Administrator',
            stage: 'ADMIN_IAM',
            comment: `Toggled MFA for staff ID ${userId}.`
        })
        return response.data
    }

    async fetchOversight() {
        const response = await api.get('/admin/staff/oversight/')
        return response.data
    }

    _syncActiveUserSession(updatedUser) {
        try {
            const currentRaw = localStorage.getItem('user')
            if (!currentRaw) return
            const current = JSON.parse(currentRaw)
            if (
                current &&
                (String(current.id) === String(updatedUser.id) ||
                    (current.username && updatedUser.username && current.username.toLowerCase() === updatedUser.username.toLowerCase()))
            ) {
                const refreshed = {
                    ...current,
                    name: `${updatedUser.first_name || ''} ${updatedUser.last_name || ''}`.trim() || updatedUser.username,
                    role: updatedUser.role || current.role,
                    department: updatedUser.department || current.department,
                    channels: updatedUser.channels || current.channels || [],
                    privileges: updatedUser.privileges || current.privileges || []
                }
                localStorage.setItem('user', JSON.stringify(refreshed))
            }
        } catch (e) {
            // ignore
        }
    }
}

export default new UserService()

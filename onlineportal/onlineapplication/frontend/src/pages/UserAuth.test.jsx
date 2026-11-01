import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import Signup from './Signup'
import Login from './Login'
import Reports from './Reports'
import AuditLogs from './AuditLogs'
import OfficerDashboard from './OfficerDashboard'
import AdminDashboard from './AdminDashboard'
import SignaturePad from '../components/SignaturePad'
import { reconcileApplicationsWithConflictRule, getLocalAuditLogs } from '../utils/offlineDB'
import api from '../services/api'
import '@testing-library/jest-dom'

// Mock API service
vi.mock('../services/api', () => ({
    default: {
        get: vi.fn(),
        post: vi.fn(),
        put: vi.fn(),
        delete: vi.fn()
    }
}))

describe('User Creation, Authentication & Access Control', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        localStorage.clear()
    })

    it('creates a user successfully and displays a clear success message', async () => {
        api.post.mockResolvedValueOnce({
            data: {
                message: 'Farmer registered successfully',
                user_id: 101,
                username: '631234567X63'
            }
        })

        render(
            <BrowserRouter>
                <Signup />
            </BrowserRouter>
        )

        fireEvent.change(screen.getByPlaceholderText('63-1234567-X-63'), {
            target: { value: '63-1234567-X-63' }
        })
        fireEvent.change(screen.getByPlaceholderText('First Name'), {
            target: { value: 'Tendai' }
        })
        fireEvent.change(screen.getByPlaceholderText('Surname'), {
            target: { value: 'Mukaro' }
        })
        fireEvent.change(screen.getByPlaceholderText('+263 77...'), {
            target: { value: '+263772111222' }
        })
        fireEvent.change(screen.getByPlaceholderText('farmer@example.com'), {
            target: { value: 'tendai@farm.co.zw' }
        })

        const passwordInputs = screen.getAllByPlaceholderText('••••••••')
        fireEvent.change(passwordInputs[0], {
            target: { value: 'SecurePass123!' }
        })
        fireEvent.change(passwordInputs[1], {
            target: { value: 'SecurePass123!' }
        })

        const submitBtn = screen.getByRole('button', { name: /create account/i })
        fireEvent.click(submitBtn)

        await waitFor(() => {
            expect(api.post).toHaveBeenCalledWith('/register/', expect.objectContaining({
                national_id: '63-1234567-X-63',
                first_name: 'Tendai',
                last_name: 'Mukaro',
                email: 'tendai@farm.co.zw'
            }))
        })

        await waitFor(() => {
            expect(screen.getByText(/Account created successfully!/i)).toBeInTheDocument()
        })
    })

    it('displays helpful error message when national ID is already registered', async () => {
        api.post.mockRejectedValueOnce({
            response: {
                status: 400,
                data: {
                    national_id: ['A user with that national ID already exists.']
                }
            }
        })

        render(
            <BrowserRouter>
                <Signup />
            </BrowserRouter>
        )

        fireEvent.change(screen.getByPlaceholderText('63-1234567-X-63'), {
            target: { value: '63-1234567-X-63' }
        })
        fireEvent.change(screen.getByPlaceholderText('First Name'), {
            target: { value: 'Tendai' }
        })
        fireEvent.change(screen.getByPlaceholderText('Surname'), {
            target: { value: 'Mukaro' }
        })
        fireEvent.change(screen.getByPlaceholderText('+263 77...'), {
            target: { value: '+263772111222' }
        })
        fireEvent.change(screen.getByPlaceholderText('farmer@example.com'), {
            target: { value: 'tendai@farm.co.zw' }
        })

        const passwordInputs = screen.getAllByPlaceholderText('••••••••')
        fireEvent.change(passwordInputs[0], {
            target: { value: 'SecurePass123!' }
        })
        fireEvent.change(passwordInputs[1], {
            target: { value: 'SecurePass123!' }
        })

        const submitBtn = screen.getByRole('button', { name: /create account/i })
        fireEvent.click(submitBtn)

        await waitFor(() => {
            expect(screen.getByText(/ID number already registered/i)).toBeInTheDocument()
        })
    })

    it('confirms the created user can log in with valid credentials', async () => {
        const mockSetUser = vi.fn()
        api.post.mockResolvedValueOnce({
            data: {
                id: 101,
                username: 'tendai@farm.co.zw',
                email: 'tendai@farm.co.zw',
                name: 'Tendai Mukaro',
                role: 'farmer'
            }
        })

        render(
            <BrowserRouter>
                <Login setUser={mockSetUser} />
            </BrowserRouter>
        )

        const idOrEmailInput = screen.getByPlaceholderText('Enter National ID, Username, or Email')
        const passwordInput = screen.getByPlaceholderText(/enter your password/i)

        fireEvent.change(idOrEmailInput, {
            target: { value: 'tendai@farm.co.zw' }
        })
        fireEvent.change(passwordInput, {
            target: { value: 'SecurePass123!' }
        })

        const signInBtn = screen.getByRole('button', { name: /sign in as farmer/i })
        fireEvent.click(signInBtn)

        await waitFor(() => {
            expect(api.post).toHaveBeenCalledWith('/login/', expect.objectContaining({
                username: 'tendai@farm.co.zw',
                password: 'SecurePass123!'
            }))
            expect(mockSetUser).toHaveBeenCalledWith(expect.objectContaining({
                id: 101,
                role: 'farmer'
            }))
        })
    })

    it('shows "No access assigned yet. Contact the System Admin." for unassigned officer', () => {
        const unassignedOfficer = {
            id: 202,
            username: 'new_officer',
            name: 'New Officer',
            role: 'unassigned',
            department: '',
            channels: [],
            privileges: []
        }

        render(
            <BrowserRouter>
                <OfficerDashboard user={unassignedOfficer} />
            </BrowserRouter>
        )

        expect(screen.getByText(/No access assigned yet\. Contact the System Admin\./i)).toBeInTheDocument()
    })

    it('shows "No reports available yet" when reports have no data', async () => {
        api.get.mockResolvedValue({
            data: {
                total_applications: 0,
                results: []
            }
        })

        const adminUser = {
            id: 1,
            username: 'admin',
            name: 'System Admin',
            role: 'admin'
        }

        render(
            <BrowserRouter>
                <Reports user={adminUser} />
            </BrowserRouter>
        )

        await waitFor(() => {
            expect(screen.getByText(/No reports available yet for this selection\./i)).toBeInTheDocument()
        })
    })

    it('shows "No audit logs available yet" when audit logs have no data', async () => {
        api.get.mockResolvedValueOnce({
            data: {
                count: 0,
                total_pages: 1,
                results: []
            }
        })

        const adminUser = {
            id: 1,
            username: 'admin',
            name: 'System Admin',
            role: 'admin'
        }

        render(
            <BrowserRouter>
                <AuditLogs user={adminUser} />
            </BrowserRouter>
        )

        await waitFor(() => {
            expect(screen.getByText(/No audit logs available yet/i)).toBeInTheDocument()
        })
    })

    it('blocks unauthorized users from viewing Audit Logs with clear message', () => {
        const farmerUser = {
            id: 99,
            username: 'farmer_john',
            name: 'Farmer John',
            role: 'farmer'
        }

        render(
            <BrowserRouter>
                <AuditLogs user={farmerUser} />
            </BrowserRouter>
        )

        expect(screen.getByText(/You do not have access to view Audit Logs\. Contact the System Administrator\./i)).toBeInTheDocument()
    })

    it('auto-fills Department, Channels and Privileges when Admin selects a Role and saves user offline/online without error', async () => {
        api.get.mockResolvedValue({ data: [] })
        api.post.mockRejectedValueOnce(new Error('Network offline')) // simulate offline APK

        const adminUser = { id: 1, username: 'admin', name: 'System Admin', role: 'admin' }
        render(
            <BrowserRouter>
                <AdminDashboard user={adminUser} />
            </BrowserRouter>
        )

        const registerBtn = await screen.findByRole('button', { name: /register new staff/i })
        fireEvent.click(registerBtn)

        fireEvent.change(screen.getByPlaceholderText('First Name'), { target: { value: 'Chipo' } })
        fireEvent.change(screen.getByPlaceholderText('Surname'), { target: { value: 'Mutasa' } })
        fireEvent.change(screen.getByPlaceholderText('Username'), { target: { value: 'chipo_lims' } })
        fireEvent.change(screen.getByPlaceholderText('officer@titledeeds.gov.zw'), { target: { value: 'chipo@lands.gov.zw' } })
        fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'Password123!' } })

        // Select LIMS role -> should auto-fill Department = 'Lands & Agriculture (LIMS)'
        const selects = screen.getAllByRole('combobox')
        fireEvent.change(selects[0], { target: { value: 'lims' } })
        expect(selects[1].value).toBe('Lands & Agriculture (LIMS)')

        const createBtn = screen.getByRole('button', { name: /create account/i })
        fireEvent.click(createBtn)

        await waitFor(() => {
            expect(screen.getAllByText(/created successfully!/i).length).toBeGreaterThan(0)
        })
    })

    it('resolves sync conflicts deterministically using Latest-Edit-Wins and records an audit log entry', () => {
        const remoteApps = [
            {
                id: 501,
                reference_number: 'TD-2026-000501',
                farm_name: 'Mazowe Plot 12',
                status: 'PENDING',
                updated_at: '2026-10-01T10:00:00.000Z'
            }
        ]
        const localApps = [
            {
                id: 501,
                reference_number: 'TD-2026-000501',
                farm_name: 'Mazowe Plot 12',
                status: 'LIMS_VERIFIED',
                updated_at: '2026-10-01T12:30:00.000Z',
                synced: false
            }
        ]

        const merged = reconcileApplicationsWithConflictRule(remoteApps, localApps)
        expect(merged).toHaveLength(1)
        expect(merged[0].status).toBe('LIMS_VERIFIED')

        const logs = getLocalAuditLogs()
        expect(logs.some(l => l.action_type === 'SYNC_CONFLICT_RESOLVED' && l.reference_number === 'TD-2026-000501')).toBe(true)
    })

    it('rejects empty signatures in SignaturePad with an inline error and supports Clear and Undo buttons', async () => {
        const onSaveMock = vi.fn()
        render(<SignaturePad label="Beneficiary Signature" onSave={onSaveMock} required />)

        const openBtn = screen.getByRole('button', { name: /tap to sign in full-screen/i })
        fireEvent.click(openBtn)

        expect(screen.getAllByRole('button', { name: /clear/i }).length).toBeGreaterThan(0)
        expect(screen.getAllByRole('button', { name: /undo/i }).length).toBeGreaterThan(0)

        const saveBtn = screen.getByRole('button', { name: /save signature/i })
        fireEvent.click(saveBtn)

        expect(onSaveMock).not.toHaveBeenCalled()
        expect(screen.getByText(/Please draw a complete signature before saving/i)).toBeInTheDocument()
    })
})

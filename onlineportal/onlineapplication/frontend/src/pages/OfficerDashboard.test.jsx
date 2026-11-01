import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import OfficerDashboard from '../pages/OfficerDashboard'
import '@testing-library/jest-dom'

const renderWithRouter = (component) => {
    return render(
        <BrowserRouter>
            {component}
        </BrowserRouter>
    )
}

// Mock axios
vi.mock('../services/api', () => {
    const mockAxios = {
        get: vi.fn(),
        post: vi.fn(),
        create: vi.fn(() => mockAxios),
        defaults: { withCredentials: true, xsrfCookieName: '', xsrfHeaderName: '' },
        interceptors: {
            request: { use: vi.fn(), eject: vi.fn() },
            response: { use: vi.fn(), eject: vi.fn() }
        }
    }
    return {
        default: mockAxios
    }
})

import api from '../services/api'

describe('OfficerDashboard', () => {
    const mockUser = { role: 'admin' }
    const mockApps = [
        {
            id: 1,
            farmer_name: 'John',
            farmer_surname: 'Doe',
            status: 'PENDING',
            farm_name: 'Farm A',
            district: 'District 1',
            created_at: '2023-01-01'
        },
        {
            id: 2,
            farmer_name: 'Jane',
            farmer_surname: 'Smith',
            status: 'SURVEYED',
            farm_name: 'Farm B',
            district: 'District 2',
            created_at: '2023-01-02'
        },
        {
            id: 3,
            farmer_name: 'Bob',
            farmer_surname: 'Jones',
            status: 'APPROVED',
            farm_name: 'Farm C',
            district: 'District 1',
            created_at: '2023-01-03'
        },
        {
            id: 4,
            farmer_name: 'Alice',
            farmer_surname: 'Surveyor',
            status: 'ZLC_VERIFIED',
            farm_name: 'Farm D',
            district: 'District 2',
            created_at: '2023-01-04'
        },
        {
            id: 5,
            farmer_name: 'Director',
            farmer_surname: 'Appl',
            status: 'VALUATED',
            farm_name: 'Farm E',
            district: 'District 1',
            purchase_price: 50000.00,
            created_at: '2023-01-05'
        }
    ]
    const mockStats = {
        pending_count: 5,
        today_count: 2,
        cumulative_count: 100
    }

    beforeEach(() => {
        api.get.mockImplementation((url) => {
            if (url.includes('dashboard_stats')) return Promise.resolve({ data: mockStats })
            return Promise.resolve({ data: mockApps })
        })
        api.post.mockResolvedValue({ data: {} })
    })

    it('should render dashboard and fetch data', async () => {
        renderWithRouter(<OfficerDashboard user={mockUser} />)

        // Check Loading state
        expect(screen.getByText(/loading applications/i)).toBeInTheDocument()

        // Wait for data
        await waitFor(() => {
            const elements = screen.getAllByText(/John Doe/i)
            expect(elements.length).toBeGreaterThan(0)
        })

        // Check Stats
        const pendingStats = screen.getAllByText('5')
        expect(pendingStats.length).toBeGreaterThan(0)
        const todayStats = screen.getAllByText('2')
        expect(todayStats.length).toBeGreaterThan(0)

        // Check Table
        expect(screen.getAllByRole('row').length).toBeGreaterThan(1)
    })

    it('should filter applications by status', async () => {
        renderWithRouter(<OfficerDashboard user={mockUser} />)

        await waitFor(() => {
            const elements = screen.getAllByText(/John Doe/i)
            expect(elements.length).toBeGreaterThan(0)
        })

        // Select 'Approved' filter
        const filterSelect = screen.getByRole('combobox') // The select element
        fireEvent.change(filterSelect, { target: { value: 'APPROVED' } })

        // John Doe (PENDING) should disappear
        await waitFor(() => {
            expect(screen.queryByText(/John Doe/i)).not.toBeInTheDocument()
            const elements = screen.getAllByText(/Bob Jones/i)
            expect(elements.length).toBeGreaterThan(0)
        })
    })

    it('should search applications', async () => {
        renderWithRouter(<OfficerDashboard user={mockUser} />)

        await waitFor(() => {
            const elements = screen.getAllByText(/John Doe/i)
            expect(elements.length).toBeGreaterThan(0)
        })

        // Type in search
        const searchInput = screen.getByPlaceholderText(/search/i)
        fireEvent.change(searchInput, { target: { value: 'Jane' } })

        // Only Jane should be visible
        await waitFor(() => {
            expect(screen.queryByText(/John Doe/i)).not.toBeInTheDocument()
            const elements = screen.getAllByText(/Jane Smith/i)
            expect(elements.length).toBeGreaterThan(0)
        })
    })

    it('should show survey action buttons for surveyor', async () => {
        renderWithRouter(<OfficerDashboard user={{ role: 'surveyor' }} />)

        await waitFor(() => {
            const elements = screen.getAllByText(/Alice Surveyor/i)
            expect(elements.length).toBeGreaterThan(0)
        })

        // Click View Details
        const viewBtns = screen.getAllByTitle('View Details')
        fireEvent.click(viewBtns[0])

        // Modal should open
        await waitFor(() => {
            expect(screen.getByText(/application details/i)).toBeInTheDocument()
        })

        // Surveyor specific buttons should be present
        const surveyBtn = screen.getByText(/Update Portal with Survey Results/i)
        expect(surveyBtn).toBeInTheDocument()



        // Interaction: Select Fee Paid
        const feePaidRadio = screen.getByLabelText(/fee paid \(proof verified\)/i)
        fireEvent.click(feePaidRadio)

        // Click Verify
        fireEvent.click(surveyBtn)

        // Check backend call
        await waitFor(() => {
            expect(api.post).toHaveBeenCalledWith(
                expect.stringContaining('/applications/4/mark_surveyed/'),
                expect.objectContaining({
                    is_fee_paid: true
                })
            )
        })
    })

    it('should show approve button for director', async () => {
        renderWithRouter(<OfficerDashboard user={{ role: 'director' }} />)

        await waitFor(() => {
            expect(screen.getByText(/Director Appl/i)).toBeInTheDocument()
        })

        const viewBtns = screen.getAllByTitle('View Details')
        fireEvent.click(viewBtns[0])

        await waitFor(() => {
            expect(screen.getByText(/final approval/i)).toBeInTheDocument()
        })
    })
})

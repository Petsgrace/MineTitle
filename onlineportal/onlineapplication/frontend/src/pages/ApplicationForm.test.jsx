import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import ApplicationForm from '../pages/ApplicationForm'
import '@testing-library/jest-dom'

// Mock axios / api
vi.mock('../services/api', () => ({
    default: {
        get: vi.fn(() => Promise.resolve({ data: [] })),
        post: vi.fn(() => Promise.resolve({ data: { reference_number: 'TD-2026-00001' } })),
    }
}))

vi.mock('../utils/offlineDB', () => ({
    saveFormDraft: vi.fn(() => Promise.resolve(true)),
    getFormDraft: vi.fn(() => Promise.resolve(null)),
    clearFormDraft: vi.fn(() => Promise.resolve(true)),
}))

vi.mock('../services/mobileService', () => ({
    default: {
        getCurrentLocation: vi.fn(() => Promise.resolve({ latitude: -17.824858, longitude: 31.053028, accuracy: 5 })),
    }
}))

const renderWithRouter = (component) => {
    return render(
        <BrowserRouter>
            {component}
        </BrowserRouter>
    )
}

describe('Step 0 - Payment Gate', () => {
    beforeEach(() => {
        localStorage.clear()
    })

    it('should display the mandatory statutory processing fee notice and fixed USD $10.00', () => {
        renderWithRouter(<ApplicationForm user={{ role: 'farmer', name: 'Tendai Moyo' }} />)

        expect(screen.getByText(/"A processing fee of USD \$10 is required for your file to be attended to\."/i)).toBeInTheDocument()
        expect(screen.getAllByText(/USD \$10\.00/i).length).toBeGreaterThanOrEqual(1)
        expect(screen.getByText(/Non-editable/i)).toBeInTheDocument()
    })

    it('should generate a receipt number starting with TD- after confirmed payment', async () => {
        renderWithRouter(<ApplicationForm user={{ role: 'farmer', name: 'Tendai Moyo' }} />)

        const payButton = screen.getByText(/Pay USD \$10\.00 & Generate Receipt/i)
        fireEvent.click(payButton)

        await waitFor(() => {
            expect(screen.getByText(/Payment Confirmed/i)).toBeInTheDocument()
            expect(screen.getByText(/OFFICIAL STATUTORY PROCESSING FEE RECEIPT/i)).toBeInTheDocument()
            expect(screen.getByText(/Continue to Part 1: Farm Details/i)).toBeInTheDocument()
        })

        const receiptBadge = screen.getByText(/TD-\d{8}-[0-9A-Z]{6}/i)
        expect(receiptBadge).toBeInTheDocument()
    })

    it('should return to payment screen and not create receipt if payment fails or is cancelled', async () => {
        renderWithRouter(<ApplicationForm user={{ role: 'farmer', name: 'Tendai Moyo' }} />)

        const failButton = screen.getByText(/Simulate Cancel \/ Payment Failure/i)
        fireEvent.click(failButton)

        await waitFor(() => {
            expect(screen.getByText(/Payment was declined or cancelled/i)).toBeInTheDocument()
        })

        expect(screen.getByText(/Statutory Processing Fee Gate/i)).toBeInTheDocument()
        expect(screen.queryByText(/OFFICIAL STATUTORY PROCESSING FEE RECEIPT/i)).not.toBeInTheDocument()
    })
})

describe('Part 1 - Farm Details & Receipt Banner', () => {
    beforeEach(() => {
        localStorage.setItem('td_active_payment_record', JSON.stringify({
            receiptNumber: 'TD-20261023-ABC123',
            amount: 10,
            currency: 'USD',
            status: 'CONFIRMED'
        }))
    })

    it('should display the mandatory Receipt Number banner on top of Part 1', async () => {
        renderWithRouter(<ApplicationForm user={{ role: 'farmer' }} />)

        await waitFor(() => {
            expect(screen.getByText(/TD-20261023-ABC123/i)).toBeInTheDocument()
            expect(screen.getByText(/STATUTORY FEE PAID: USD \$10\.00/i)).toBeInTheDocument()
            expect(screen.getByText(/PART 1 - FARM DETAILS/i)).toBeInTheDocument()
        })
    })

    it('should have read-only Tenure Document Status for Beneficiary role', async () => {
        renderWithRouter(<ApplicationForm user={{ role: 'farmer' }} />)

        await waitFor(() => {
            expect(screen.getByText(/Read-Only for Beneficiary/i)).toBeInTheDocument()
        })
    })
})

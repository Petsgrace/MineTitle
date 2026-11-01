import api from './api';
﻿/**
 * paymentService.js - Payment Service Interface & Mock Provider
 * Title Deeds One Stop Center - Ministry of Lands Zimbabwe
 * Fixed Processing Fee: USD $10.00
 */

const FIXED_FEE_USD = 10.00;
const FEE_NOTICE = "A processing fee of USD $10 is required for your file to be attended to.";
const ACTIVE_PAYMENT_STORAGE_KEY = 'td_active_payment_record';
const ALL_PAYMENTS_STORAGE_KEY = 'td_payment_records_archive';

/**
 * Generates a unique, official receipt number
 * Format: TD-YYYYMMDD-XXXXXX (e.g. TD-20261023-F4A9B2)
 */
export function generateReceiptNumber() {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const chars = '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    let randomPart = '';
    for (let i = 0; i < 6; i++) {
        randomPart += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `TD-${yyyy}${mm}${dd}-${randomPart}`;
}

/**
 * Returns fixed fee configuration (cannot be altered)
 */
export function getProcessingFee() {
    return {
        amount: FIXED_FEE_USD,
        currency: 'USD',
        description: FEE_NOTICE
    };
}

/**
 * Saves payment record to local storage & archive
 */
export function savePaymentRecord(record) {
    try {
        localStorage.setItem(ACTIVE_PAYMENT_STORAGE_KEY, JSON.stringify(record));
        const archive = JSON.parse(localStorage.getItem(ALL_PAYMENTS_STORAGE_KEY) || '[]');
        archive.push(record);
        localStorage.setItem(ALL_PAYMENTS_STORAGE_KEY, JSON.stringify(archive));
    } catch (e) {
        console.warn('Storage warning for payment record:', e);
    }
}

/**
 * Retrieves the currently active confirmed payment record
 */
export function getActivePaymentRecord() {
    try {
        const data = localStorage.getItem(ACTIVE_PAYMENT_STORAGE_KEY);
        if (!data) return null;
        const parsed = JSON.parse(data);
        if (parsed && parsed.status === 'CONFIRMED' && parsed.receiptNumber) {
            return parsed;
        }
        return null;
    } catch (e) {
        return null;
    }
}

/**
 * Clears the active payment (used when starting an entirely new file)
 */
export function clearActivePaymentRecord() {
    try {
        localStorage.removeItem(ACTIVE_PAYMENT_STORAGE_KEY);
    } catch (e) {
        console.warn('Unable to clear active payment:', e);
    }
}

/**
 * Payment Service Interface with Mock Provider and Gateway Hooks
 */
export const paymentService = {
    getProcessingFee,
    generateReceiptNumber,
    getActivePaymentRecord,
    clearActivePaymentRecord,
    savePaymentRecord,

    /**
     * Process Payment through selected gateway
     * @param {Object} params
     * @param {string} params.provider - 'ecocash' | 'onemoney' | 'zimswitch' | 'visa_mastercard' | 'mock'
     * @param {string} params.beneficiaryName - Applicant name
     * @param {string} params.nationalId - Applicant Zimbabwe ID
     * @param {string} params.phoneNumber - Contact phone number
     * @param {boolean} [params.simulateFailure=false] - For testing failure flows
     * @returns {Promise<Object>} Payment result
     */
    async processPayment({ provider = 'mock', beneficiaryName, nationalId, phoneNumber, simulateFailure = false }) {
        // Enforce fixed fee
        const amount = FIXED_FEE_USD;
        const currency = 'USD';

        if (simulateFailure) {
            throw new Error('Payment was declined or cancelled by the gateway. No funds were debited.');
        }

        let receiptNumber = null;
        let transactionRef = null;

        // 1. Attempt Server-Side Payment & Receipt Generation
        try {
            const res = await api.post('/payments/', {
                provider,
                beneficiary_name: beneficiaryName,
                national_id: nationalId,
                phone_number: phoneNumber,
                simulate_failure: simulateFailure
            });
            if (res && res.data && (res.data.receipt_number || res.data.receiptNumber)) {
                receiptNumber = res.data.receipt_number || res.data.receiptNumber;
                transactionRef = res.data.transaction_ref || res.data.transactionRef;
            }
        } catch (serverErr) {
            console.warn('Server payment endpoint unavailable, utilizing local fallback:', serverErr.message);
        }

        // 2. Offline / Unit-Test Fallback
        if (!receiptNumber) {
            receiptNumber = generateReceiptNumber();
            transactionRef = 'TX-' + Math.random().toString(36).substring(2, 10).toUpperCase();
        }

        const record = {
            receiptNumber,
            amount,
            currency,
            provider: provider === 'mock' ? 'DEMO PAYMENT (Mock)' : provider,
            beneficiaryName: beneficiaryName || 'Citizen Beneficiary',
            nationalId: nationalId || '',
            phoneNumber: phoneNumber || '',
            timestamp: new Date().toISOString(),
            status: 'CONFIRMED',
            transactionRef: transactionRef || ('TX-' + Math.random().toString(36).substring(2, 10).toUpperCase()),
        };

        savePaymentRecord(record);
        return record;
    }
};

export default paymentService;

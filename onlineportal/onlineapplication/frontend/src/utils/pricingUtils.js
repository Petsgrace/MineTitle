/**
 * Pricing Utilities
 * Pure functions for pricing calculations
 * Implements Single Responsibility Principle
 */

/**
 * Calculate survey fee based on tenure document type
 * A1 farms: $300
 * A2 and others: $735
 * 
 * @param {string} tenureDocType - Type of tenure document
 * @returns {number} Survey fee in USD
 */
export const calculateSurveyFee = (tenureDocType) => {
    if (!tenureDocType) return 300

    const docType = tenureDocType.toUpperCase()

    // A1 farms get $300, everything else (A2, etc.) gets $735
    if (docType.includes('A1') || docType.includes('OFFER LETTER')) {
        return 300
    }

    return 735
}

/**
 * Format price for display
 * @param {number|string} price - Price value
 * @returns {string} Formatted price string
 */
export const formatPrice = (price) => {
    if (!price) return 'N/A'
    const numPrice = typeof price === 'string' ? parseFloat(price) : price
    return `$${numPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

"""
Fee Calculation Utilities
Pure functions for calculating various fees in the title deed application system.
Implements Single Responsibility Principle - only handles fee calculations.
"""

from decimal import Decimal


def calculate_survey_fee(tenure_document_type: str) -> Decimal:
    """
    Calculate survey fee based on tenure document type.
    
    A1 farms: $300
    All other farms: $735
    
    Args:
        tenure_document_type: Type of tenure document (e.g., "A1 Offer Letter", "A2 Permit")
    
    Returns:
        Survey fee as Decimal
    
    Examples:
        >>> calculate_survey_fee("A1 Offer Letter")
        Decimal('300.00')
        >>> calculate_survey_fee("A2 Permit")
        Decimal('735.00')
    """
    if not tenure_document_type:
        return Decimal('300.00')
    
    doc_type = str(tenure_document_type).upper()
    
    # Only A1 farms get lower fee
    if 'A1' in doc_type:
        return Decimal('300.00')
    
    # All others get standard fee
    return Decimal('735.00')


def calculate_conveyance_fee(purchase_price: Decimal) -> Decimal:
    """
    Calculate conveyance fee as 1% of purchase price.
    
    Args:
        purchase_price: Total purchase price
    
    Returns:
        Conveyance fee (1% of purchase price)
    
    Examples:
        >>> calculate_conveyance_fee(Decimal('10000'))
        Decimal('100.00')
    """
    if not purchase_price or purchase_price <= 0:
        return Decimal('0.00')
    
    price = Decimal(str(purchase_price))
    return (price * Decimal('0.01')).quantize(Decimal('0.01'))


def calculate_valuation_fee() -> Decimal:
    """
    Get fixed valuation fee.
    
    Returns:
        Fixed valuation fee of $450
    
    Examples:
        >>> calculate_valuation_fee()
        Decimal('450.00')
    """
    return Decimal('450.00')


def calculate_cash_discount(purchase_price: Decimal) -> Decimal:
    """
    Calculate cash payment discount (15% of purchase price).
    
    Args:
        purchase_price: Total purchase price
    
    Returns:
        Cash discount amount (15%)
    
    Examples:
        >>> calculate_cash_discount(Decimal('10000'))
        Decimal('1500.00')
    """
    if not purchase_price or purchase_price <= 0:
        return Decimal('0.00')
    
    price = Decimal(str(purchase_price))
    return (price * Decimal('0.15')).quantize(Decimal('0.01'))


def calculate_total_payable(purchase_price: Decimal, 
                           application_fee_paid: bool = True,
                           survey_fee_paid: bool = True,
                           survey_fee: Decimal = None) -> dict:
    """
    Calculate total amount payable including any unpaid fees.
    
    Args:
        purchase_price: Base purchase price
        application_fee_paid: Whether $10 application fee was paid
        survey_fee_paid: Whether survey fee was paid
        survey_fee: Survey fee amount (if applicable)
    
    Returns:
        Dictionary with breakdown:
        {
            'purchase_price': Decimal,
            'application_fee': Decimal,
            'survey_fee': Decimal,
            'total': Decimal,
            'breakdown': list of strings
        }
    """
    breakdown = []
    total = Decimal(str(purchase_price or 0))
    app_fee = Decimal('0.00')
    surv_fee = Decimal('0.00')
    
    breakdown.append(f"Purchase Price: ${total:.2f}")
    
    # Add application fee if not paid
    if not application_fee_paid:
        app_fee = Decimal('10.00')
        total += app_fee
        breakdown.append(f"Application Fee: ${app_fee:.2f} (Arrears)")
    
    # We no longer add survey fee if not paid as per user request
    if application_fee_paid and survey_fee_paid:
        pass # just fulfilling the if statement structure temporarily if needed, 
        # but actually we can just remove the survey fee addition completely.

    breakdown.append(f"TOTAL PAYABLE: ${total:.2f}")
    
    return {
        'purchase_price': Decimal(str(purchase_price or 0)),
        'application_fee': app_fee,
        'survey_fee': surv_fee,
        'total': total.quantize(Decimal('0.01')),
        'breakdown': breakdown
    }

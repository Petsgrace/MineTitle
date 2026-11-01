"""
Status Management Utilities
Pure functions for managing application status transitions.
Implements Single Responsibility Principle - only handles status logic.
"""

from typing import Optional


def get_next_status_after_query(queried_by: str) -> str:
    """
    Determine the next status when a farmer resubmits a queried application.
    Routes back to the appropriate stage based on who queried it.
    
    Args:
        queried_by: Role of officer who queried the application
                   ('lims', 'zlc', 'surveyor', 'valuation', 'director', 'finance')
    
    Returns:
        Next status string
    
    Examples:
        >>> get_next_status_after_query('lims')
        'PENDING'
        >>> get_next_status_after_query('zlc')
        'LIMS_VERIFIED'
    """
    status_routing = {
        'lims': 'PENDING',
        'zlc': 'LIMS_VERIFIED',
        'surveyor': 'ZLC_VERIFIED',
        'valuation': 'SURVEYED',
        'director': 'SURVEYED',  # Send back to Valuation stage
        'finance': 'AWAITING_PAYMENT',
        'estates': 'ACCOUNTS_VERIFIED',
    }
    
    return status_routing.get(queried_by, 'RESUBMITTED')


def can_transition_status(from_status: str, to_status: str, officer_role: Optional[str] = None) -> bool:
    """
    Validate if a status transition is allowed.
    
    Args:
        from_status: Current application status
        to_status: Desired new status
        officer_role: Role of officer making the change (optional)
    
    Returns:
        True if transition is allowed, False otherwise
    
    Examples:
        >>> can_transition_status('PENDING', 'LIMS_VERIFIED', 'lims')
        True
        >>> can_transition_status('APPROVED', 'PENDING')
        False
    """
    # Define valid transitions
    valid_transitions = {
        'PENDING': ['LIMS_VERIFIED', 'QUERIED', 'REJECTED'],
        'QUERIED': ['PENDING', 'LIMS_VERIFIED', 'RESUBMITTED'],
        'RESUBMITTED': ['PENDING', 'LIMS_VERIFIED', 'ZLC_VERIFIED', 'SURVEYED', 'AWAITING_PAYMENT'],
        'LIMS_VERIFIED': ['ACCOUNTS_VERIFIED', 'ESTATES_VERIFIED', 'ZLC_VERIFIED', 'QUERIED', 'REFERRED'],
        'REFERRED': ['ESTATES_VERIFIED', 'QUERIED'],
        'ACCOUNTS_VERIFIED': ['ESTATES_VERIFIED', 'QUERIED'],
        'ESTATES_VERIFIED': ['ZLC_VERIFIED', 'QUERIED'],
        'ZLC_VERIFIED': ['AWAITING_SURVEY_FEE', 'SURVEY_FEE_PAID', 'SURVEYED', 'QUERIED'],
        'AWAITING_SURVEY_FEE': ['SURVEY_FEE_PAID', 'QUERIED'],
        'SURVEY_FEE_PAID': ['SURVEYED', 'QUERIED'],
        'SURVEYED': ['VALUATED', 'QUERIED'],
        'VALUATED': ['APPROVED', 'AWAITING_PAYMENT', 'AGREEMENT_OF_SALE', 'QUERIED'],
        'APPROVED': ['AWAITING_PAYMENT', 'AGREEMENT_OF_SALE'],
        'AGREEMENT_OF_SALE': ['AWAITING_PAYMENT', 'PAYMENT_VERIFIED'],
        'AWAITING_PAYMENT': ['PAYMENT_VERIFIED', 'QUERIED'],
        'PAYMENT_VERIFIED': ['READY_FOR_COLLECTION'],
        'READY_FOR_COLLECTION': [],  # Final state
        'REJECTED': [],  # Terminal state
    }
    
    allowed_next_statuses = valid_transitions.get(from_status, [])
    return to_status in allowed_next_statuses


def get_role_default_filter(officer_role: str) -> str:
    """
    Get the default status filter for an officer role on their dashboard.
    
    Args:
        officer_role: Role of the officer
    
    Returns:
        Status filter value
    
    Examples:
        >>> get_role_default_filter('lims')
        'PENDING'
        >>> get_role_default_filter('surveyor')
        'ZLC_VERIFIED'
    """
    role_filters = {
        'lims': 'PENDING',
        'accounts': 'LIMS_VERIFIED',
        'finance': 'LIMS_VERIFIED',
        'estates': 'ACCOUNTS_VERIFIED',
        'resettlement': 'ACCOUNTS_VERIFIED',
        'zlc': 'LIMS_VERIFIED',
        'surveyor': 'ZLC_VERIFIED',
        'valuation': 'SURVEYED',
        'director': 'VALUATED',
        'conveyancer': 'APPROVED',
    }
    
    return role_filters.get(officer_role, 'all')


def get_queryset_statuses_for_role(officer_role: str) -> list:
    """
    Get the list of statuses an officer should see based on their role.
    
    Args:
        officer_role: Role of the officer
    
    Returns:
        List of status strings
    """
    role_statuses = {
        'lims': ['PENDING', 'LIMS_VERIFIED', 'QUERIED', 'RESUBMITTED'],
        'accounts': ['LIMS_VERIFIED', 'ACCOUNTS_VERIFIED', 'AWAITING_PAYMENT', 'PAYMENT_VERIFIED', 'READY_FOR_COLLECTION'],
        'finance': ['LIMS_VERIFIED', 'ACCOUNTS_VERIFIED', 'AWAITING_PAYMENT', 'PAYMENT_VERIFIED', 'READY_FOR_COLLECTION'],
        'estates': ['REFERRED', 'ESTATES_VERIFIED', 'ACCOUNTS_VERIFIED'],
        'resettlement': ['REFERRED', 'ESTATES_VERIFIED', 'ACCOUNTS_VERIFIED'],
        'zlc': ['LIMS_VERIFIED', 'ESTATES_VERIFIED', 'ZLC_VERIFIED'],
        'surveyor': ['ZLC_VERIFIED', 'AWAITING_SURVEY_FEE', 'SURVEY_FEE_PAID', 'SURVEYED'],
        'valuation': ['SURVEYED', 'VALUATED'],
        'director': ['VALUATED', 'APPROVED', 'AWAITING_PAYMENT', 'READY_FOR_COLLECTION', 'AGREEMENT_OF_SALE'],
        'conveyancer': ['VALUATED', 'APPROVED', 'AGREEMENT_OF_SALE'],
    }
    
    return role_statuses.get(officer_role, [])


def format_status_display(status: str) -> str:
    """
    Format status string for human-readable display.
    
    Args:
        status: Raw status string (e.g., 'LIMS_VERIFIED')
    
    Returns:
        Formatted status (e.g., 'LIMS Verified')
    
    Examples:
        >>> format_status_display('LIMS_VERIFIED')
        'LIMS Verified'
        >>> format_status_display('AWAITING_PAYMENT')
        'Awaiting Payment'
    """
    if not status:
        return 'Unknown'
    
    return status.replace('_', ' ').title()


def is_terminal_status(status: str) -> bool:
    """
    Check if a status is terminal (no further actions possible).
    
    Args:
        status: Application status
    
    Returns:
        True if status is terminal
    
    Examples:
        >>> is_terminal_status('READY_FOR_COLLECTION')
        True
        >>> is_terminal_status('PENDING')
        False
    """
    terminal_statuses = ['READY_FOR_COLLECTION', 'REJECTED']
    return status in terminal_statuses

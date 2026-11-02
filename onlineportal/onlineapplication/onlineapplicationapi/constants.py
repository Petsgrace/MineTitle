"""
Constants for Title Deeds One Stop Center: Unified Mobile App Title Deeds Processing & Land Management System.
Matches the sequential workflow and staff roles + admin.
"""

# The Sequential Stages
STAGE_PENDING = 'PENDING'
STAGE_ACCOUNTS_CLEARED = 'ACCOUNTS_CLEARED'
STAGE_RESETTLEMENT_VERIFIED = 'RESETTLEMENT_VERIFIED'
STAGE_ESTATES_CLEARED = 'ESTATES_CLEARED'
STAGE_LIMS_VERIFIED = 'LIMS_VERIFIED'
STAGE_ZLC_CLEARED = 'ZLC_CLEARED'
STAGE_GIS_VALIDATED = 'GIS_VALIDATED'
STAGE_SURVEYED = 'SURVEYED'
STAGE_VALUATED = 'VALUATED'
STAGE_APPROVED = 'APPROVED'
STAGE_READY_FOR_COLLECTION = 'READY_FOR_COLLECTION'

# Negative / Query / Dispute Stages
STAGE_LIMS_QUERIED = 'LIMS_QUERIED'
STAGE_ZLC_DISPUTED = 'ZLC_DISPUTED'
STAGE_ZLC_DOUBLE_ALLOCATION = 'ZLC_DOUBLE_ALLOCATION'
STAGE_NOT_SURVEYED = 'NOT_SURVEYED'
STAGE_SURVEY_UNAVAILABLE = 'SURVEY_UNAVAILABLE'

APPLICATION_STAGES = [
    (STAGE_PENDING, '1. PENDING (Applicant)'),
    (STAGE_ACCOUNTS_CLEARED, '2. ACCOUNTS_CLEARED (Accounts Officer)'),
    (STAGE_ESTATES_CLEARED, '3. ESTATES_CLEARED (Estates Officer)'),
    (STAGE_RESETTLEMENT_VERIFIED, '3b. RESETTLEMENT_VERIFIED (Resettlement Officer)'),
    (STAGE_LIMS_VERIFIED, '4. LIMS_VERIFIED (LIMS Officer)'),
    (STAGE_ZLC_CLEARED, '5. ZLC_CLEARED (Zimbabwe Land Commission)'),
    (STAGE_GIS_VALIDATED, '6. GIS_VALIDATED (GIS Officer)'),
    (STAGE_SURVEYED, '7. SURVEYED (Surveyor General)'),
    (STAGE_VALUATED, '8. VALUATED (Valuations Officer)'),
    (STAGE_APPROVED, '9. APPROVED (Director of Lands)'),
    (STAGE_READY_FOR_COLLECTION, '10. READY_FOR_COLLECTION (Deeds Registry)'),
    (STAGE_LIMS_QUERIED, 'LIMS_QUERIED (LIMS Query)'),
    (STAGE_ZLC_DISPUTED, 'ZLC_DISPUTED (ZLC Land Dispute)'),
    (STAGE_ZLC_DOUBLE_ALLOCATION, 'ZLC_DOUBLE_ALLOCATION (Double Allocation)'),
    (STAGE_NOT_SURVEYED, 'NOT_SURVEYED (Survey Required)'),
    (STAGE_SURVEY_UNAVAILABLE, 'SURVEY_UNAVAILABLE (Survey Status Unavailable)'),
]

STAGE_SEQUENCE = [
    STAGE_PENDING,
    STAGE_ACCOUNTS_CLEARED,
    STAGE_ESTATES_CLEARED,
    STAGE_RESETTLEMENT_VERIFIED,
    STAGE_LIMS_VERIFIED,
    STAGE_ZLC_CLEARED,
    STAGE_GIS_VALIDATED,
    STAGE_SURVEYED,
    STAGE_VALUATED,
    STAGE_APPROVED,
    STAGE_READY_FOR_COLLECTION,
]

# Staff & Citizen Roles (Core personas + admin)
ROLE_APPLICANT = 'applicant'
ROLE_ACCOUNTS = 'accounts'
ROLE_ESTATES = 'estates'
ROLE_RESETTLEMENT = 'resettlement'
ROLE_LIMS = 'lims'
ROLE_ZLC = 'zlc'
ROLE_GIS = 'gis'
ROLE_SURVEYOR = 'surveyor'
ROLE_VALUATION = 'valuation'
ROLE_DIRECTOR = 'director'
ROLE_DEEDS = 'deeds'
ROLE_ADMIN = 'admin'

STAFF_ROLES = [
    (ROLE_ACCOUNTS, 'Accounts Officer'),
    (ROLE_ESTATES, 'Estates Officer'),
    (ROLE_RESETTLEMENT, 'Resettlement Officer'),
    (ROLE_LIMS, 'LIMS Officer'),
    (ROLE_ZLC, 'ZLC Officer'),
    (ROLE_GIS, 'GIS Officer'),
    (ROLE_SURVEYOR, 'Surveyor General Officer'),
    (ROLE_VALUATION, 'Valuations Officer'),
    (ROLE_DIRECTOR, 'Director of Lands'),
    (ROLE_DEEDS, 'Deeds Registry Officer'),
    (ROLE_ADMIN, 'System Administrator'),
]

ALL_ROLES = [(ROLE_APPLICANT, 'Applicant / Citizen / Farmer')] + STAFF_ROLES

# Department Role Mapping to Actionable Stages
ROLE_STAGE_MAP = {
    ROLE_ACCOUNTS: [STAGE_PENDING, 'LODGED', 'PAYMENT_CONFIRMED'],
    ROLE_ESTATES: [STAGE_ACCOUNTS_CLEARED, 'ACCOUNTS_VERIFIED'],
    ROLE_RESETTLEMENT: [STAGE_ACCOUNTS_CLEARED, 'ACCOUNTS_VERIFIED', STAGE_PENDING],
    ROLE_LIMS: [STAGE_ESTATES_CLEARED, STAGE_RESETTLEMENT_VERIFIED],
    ROLE_ZLC: [STAGE_LIMS_VERIFIED],
    ROLE_GIS: [STAGE_ZLC_CLEARED, STAGE_GIS_VALIDATED],
    ROLE_SURVEYOR: [STAGE_ZLC_CLEARED, STAGE_GIS_VALIDATED],
    ROLE_VALUATION: [STAGE_SURVEYED],
    ROLE_DIRECTOR: [STAGE_VALUATED, STAGE_APPROVED],
    ROLE_DEEDS: [STAGE_VALUATED, STAGE_APPROVED],
}

# Default SLAs per stage in calendar days
DEFAULT_STAGE_SLAS = {
    STAGE_PENDING: 3,
    STAGE_ACCOUNTS_CLEARED: 3,
    STAGE_ESTATES_CLEARED: 5,
    STAGE_RESETTLEMENT_VERIFIED: 5,
    STAGE_LIMS_VERIFIED: 5,
    STAGE_ZLC_CLEARED: 7,
    STAGE_GIS_VALIDATED: 4,
    STAGE_SURVEYED: 10,
    STAGE_VALUATED: 5,
    STAGE_APPROVED: 5,
    STAGE_READY_FOR_COLLECTION: 3,
}

# Allowed Document File Fields Whitelist
ALLOWED_DOCUMENT_FIELDS = {
    'tenure_document',
    'national_id_copy',
    'other_attachments',
    'war_vet_id_copy',
    'employment_proof',
    'survey_diagram',
    'valuation_report',
    'offer_letter_document',
    'lease_document',
    'permit_document',
    'national_id_document',
    'portrait_photo',
    'photo_front',
    'photo_side',
    'id_front',
    'id_back',
    'signature'
}

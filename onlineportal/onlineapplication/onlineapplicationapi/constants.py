"""
Constants for Title Deeds One Stop Center: Unified Mobile App Title Deeds Processing & Land Management System.
Matches the 9-stage sequential workflow and 9 staff roles + admin.
"""

# The 9 Sequential Stages
STAGE_PENDING = 'PENDING'
STAGE_RESETTLEMENT_VERIFIED = 'RESETTLEMENT_VERIFIED'
STAGE_LIMS_VERIFIED = 'LIMS_VERIFIED'
STAGE_ZLC_CLEARED = 'ZLC_CLEARED'
STAGE_GIS_VALIDATED = 'GIS_VALIDATED'
STAGE_SURVEYED = 'SURVEYED'
STAGE_VALUATED = 'VALUATED'
STAGE_APPROVED = 'APPROVED'
STAGE_READY_FOR_COLLECTION = 'READY_FOR_COLLECTION'

APPLICATION_STAGES = [
    (STAGE_PENDING, '1. PENDING (Applicant)'),
    (STAGE_RESETTLEMENT_VERIFIED, '2. RESETTLEMENT_VERIFIED (Resettlement Officer)'),
    (STAGE_LIMS_VERIFIED, '3. LIMS_VERIFIED (LIMS Officer)'),
    (STAGE_ZLC_CLEARED, '4. ZLC_CLEARED (Zimbabwe Land Commission)'),
    (STAGE_GIS_VALIDATED, '5. GIS_VALIDATED (GIS Officer)'),
    (STAGE_SURVEYED, '6. SURVEYED (Surveyor General)'),
    (STAGE_VALUATED, '7. VALUATED (Valuations Officer)'),
    (STAGE_APPROVED, '8. APPROVED (Director of Lands)'),
    (STAGE_READY_FOR_COLLECTION, '9. READY_FOR_COLLECTION (Deeds Registry)'),
]

STAGE_SEQUENCE = [
    STAGE_PENDING,
    STAGE_RESETTLEMENT_VERIFIED,
    STAGE_LIMS_VERIFIED,
    STAGE_ZLC_CLEARED,
    STAGE_GIS_VALIDATED,
    STAGE_SURVEYED,
    STAGE_VALUATED,
    STAGE_APPROVED,
    STAGE_READY_FOR_COLLECTION,
]

# Staff & Citizen Roles (9 personas + separate admin)
ROLE_APPLICANT = 'applicant'
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
    ROLE_RESETTLEMENT: STAGE_PENDING,                   # Verifies PENDING -> advances to RESETTLEMENT_VERIFIED
    ROLE_LIMS: STAGE_RESETTLEMENT_VERIFIED,             # Verifies RESETTLEMENT_VERIFIED -> advances to LIMS_VERIFIED
    ROLE_ZLC: STAGE_LIMS_VERIFIED,                      # Clears LIMS_VERIFIED -> advances to ZLC_CLEARED
    ROLE_GIS: STAGE_ZLC_CLEARED,                        # Validates ZLC_CLEARED -> advances to GIS_VALIDATED
    ROLE_SURVEYOR: STAGE_GIS_VALIDATED,                 # Surveys GIS_VALIDATED -> advances to SURVEYED
    ROLE_VALUATION: STAGE_SURVEYED,                     # Valuates SURVEYED -> advances to VALUATED
    ROLE_DIRECTOR: STAGE_VALUATED,                      # Approves VALUATED -> advances to APPROVED
    ROLE_DEEDS: STAGE_APPROVED,                         # Deeds APPROVED -> advances to READY_FOR_COLLECTION
}

# Default SLAs per stage in calendar days
DEFAULT_STAGE_SLAS = {
    STAGE_PENDING: 3,
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
    'deed_document',
}

from decimal import Decimal
import re
import json
import hashlib
from datetime import timedelta
from django.db import models
from django.contrib.auth.models import User
from django.core.exceptions import ValidationError, PermissionDenied
from django.core.validators import FileExtensionValidator
from django.utils import timezone
from .utils.file_utils import secure_file_upload_path
from .utils.validators import validate_uploaded_file

# Zimbabwe National ID regex: XX-XXXXXXX-X-XX (e.g. 63-1234567-X-63 or 63-123456-X-63)
ZIMBABWE_NATIONAL_ID_REGEX = r'^\d{2}-?\d{6,7}-?[A-Z]-?\d{2}$'

def validate_zimbabwe_national_id(value):
    if not value:
        return
    cleaned = value.strip().upper()
    if not re.match(ZIMBABWE_NATIONAL_ID_REGEX, cleaned):
        raise ValidationError(
            f"Invalid Zimbabwean National ID format: '{value}'. Expected format: XX-XXXXXXX-X-XX (e.g., 63-1234567-X-63)."
        )

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

# Roles (Core personas + separate system admin)
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
ROLE_UNASSIGNED = 'unassigned'

STAFF_ROLES = [
    (ROLE_UNASSIGNED, 'Unassigned Officer'),
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

class FarmerProfile(models.Model):
    CITIZENSHIP_CHOICES = [
        ('Zimbabwean', 'Zimbabwean'),
        ('South African', 'South African'),
        ('Zambian', 'Zambian'),
        ('Mozambican', 'Mozambican'),
        ('Botswanan', 'Botswanan'),
        ('Other', 'Other'),
    ]
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='farmer_profile')
    surname = models.CharField(max_length=100, db_index=True)
    first_name = models.CharField(max_length=100)
    other_names = models.CharField(max_length=100, blank=True, null=True)
    sex = models.CharField(max_length=20)
    title = models.CharField(max_length=10)
    date_of_birth = models.DateField()
    # Farmer Profile national_id
    national_id = models.CharField(max_length=20, unique=True, db_index=True, validators=[validate_zimbabwe_national_id])
    marital_status = models.CharField(max_length=20)
    citizenship = models.CharField(max_length=50, choices=CITIZENSHIP_CHOICES, default='Zimbabwean')
    telephone = models.CharField(max_length=30)
    contact_address = models.TextField()
    email = models.EmailField()
    
    # Farmer Categories
    is_war_veteran = models.BooleanField(default=False)
    war_vet_number = models.CharField(max_length=50, blank=True, null=True)
    is_ex_detainee = models.BooleanField(default=False)
    is_collaborator = models.BooleanField(default=False)
    is_uniformed_forces = models.BooleanField(default=False)
    force_number = models.CharField(max_length=50, blank=True, null=True)
    is_business_person = models.BooleanField(default=False)
    is_youth = models.BooleanField(default=False)
    is_civil_servant = models.BooleanField(default=False)
    ec_number = models.CharField(max_length=50, blank=True, null=True)
    civil_service_years = models.PositiveIntegerField(null=True, blank=True)
    is_mp_senator = models.BooleanField(default=False)
    is_disabled = models.BooleanField(default=False)
    is_zepdra = models.BooleanField(default=False)
    is_councilor = models.BooleanField(default=False)
    is_traditional_chief = models.BooleanField(default=False)
    is_ordinary = models.BooleanField(default=False)
    is_other = models.BooleanField(default=False)
    other_category_specify = models.CharField(max_length=100, blank=True, null=True)
    years_of_service = models.IntegerField(null=True, blank=True)
    mfa_email_otp = models.CharField(max_length=128, blank=True, null=True)
    mfa_otp_created_at = models.DateTimeField(null=True, blank=True)
    mfa_otp_failed_attempts = models.IntegerField(default=0)
    mfa_verified_for_session = models.BooleanField(default=False)
    mfa_otp_failed_attempts = models.IntegerField(default=0)

    def clean(self):
        super().clean()
        if self.national_id:
            validate_zimbabwe_national_id(self.national_id)

    def __str__(self):
        return f"{self.first_name} {self.surname} ({self.national_id})"

class StaffProfile(models.Model):
    ROLE_CHOICES = STAFF_ROLES
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='staff_profile')
    role = models.CharField(max_length=50, choices=STAFF_ROLES, db_index=True, default=ROLE_UNASSIGNED)
    department = models.CharField(max_length=100, blank=True, default='')
    channels = models.JSONField(default=list, blank=True)
    privileges = models.JSONField(default=list, blank=True)
    national_id = models.CharField(max_length=30, blank=True, null=True, validators=[validate_zimbabwe_national_id])
    phone_number = models.CharField(max_length=30, blank=True, null=True)
    
    # Staff Email OTP MFA & Security Controls
    mfa_email_otp = models.CharField(max_length=128, blank=True, null=True)
    mfa_otp_created_at = models.DateTimeField(null=True, blank=True)
    mfa_verified_for_session = models.BooleanField(default=False)
    must_change_password = models.BooleanField(default=True)
    mfa_enabled = models.BooleanField(default=True)
    failed_login_attempts = models.IntegerField(default=0)
    locked_until = models.DateTimeField(null=True, blank=True)

    @property
    def is_unassigned(self) -> bool:
        if self.role in ('unassigned', ROLE_UNASSIGNED):
            return True
        if self.role == 'officer' and not self.department and not self.channels and not self.privileges:
            return True
        return False

    def is_mfa_valid(self, code: str) -> bool:
        if not self.mfa_email_otp or not self.mfa_otp_created_at:
            return False
        # 10-minute expiry
        if timezone.now() - self.mfa_otp_created_at > timedelta(minutes=10):
            return False
        return self.mfa_email_otp == code.strip()

    def __str__(self):
        return f"{self.user.username} - {self.get_role_display()} ({self.department})"

class TitleDeedApplication(models.Model):
    STATUS_CHOICES = APPLICATION_STAGES
    STAGE_CHOICES = APPLICATION_STAGES
    BANK_CHOICES = [
        ('FBC', 'FBC Bank'),
        ('ZB', 'ZB Bank'),
        ('CBZ', 'CBZ Bank'),
        ('POSB', 'POSB'),
        ('AFC', 'AFC Holdings'),
    ]

    PAYMENT_PLAN_CHOICES = [
        ('CASH', 'Cash'),
        ('MORTGAGE', 'Mortgage'),
    ]

    WATER_SOURCE_CHOICES = [
        ('dam', 'Dam'),
        ('river', 'River'),
        ('borehole', 'Borehole'),
        ('well', 'Well'),
        ('canal', 'Canal/Irrigation'),
        ('spring', 'Natural Spring'),
        ('none', 'No Water Source'),
    ]

    WATER_DISTANCE_CHOICES = [
        ('on_farm', 'On Farm'),
        ('1_3km', '1-3 km'),
        ('4_6km', '4-6 km'),
        ('7km_plus', '7+ km'),
    ]

    # Reference Number (Unique e.g. TD-2026-00001)
    reference_number = models.CharField(max_length=50, unique=True, null=True, blank=True, db_index=True)

    # Farmer / Applicant relation (null for Assisted Capture without account)
    farmer = models.OneToOneField(FarmerProfile, on_delete=models.CASCADE, related_name='application', null=True, blank=True)

    # Assisted Capture by an Officer
    is_assisted_capture = models.BooleanField(default=False)
    assisted_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='assisted_applications')
    walk_in_citizen_name = models.CharField(max_length=200, blank=True, null=True)
    walk_in_national_id = models.CharField(max_length=30, blank=True, null=True, db_index=True, validators=[validate_zimbabwe_national_id])
    walk_in_phone = models.CharField(max_length=30, blank=True, null=True)

    # Farm & Location Details
    province = models.CharField(max_length=100, blank=True, null=True, db_index=True)
    district = models.CharField(max_length=100, db_index=True)
    old_district = models.CharField(max_length=100, blank=True, null=True)
    farm_id = models.CharField(max_length=100, blank=True, null=True)
    farm_name = models.CharField(max_length=200, db_index=True)
    farm_extent = models.DecimalField(max_digits=12, decimal_places=4, default=0.0) # In hectares
    arable_area = models.DecimalField(max_digits=12, decimal_places=4, default=0.0)
    tenure_document_type = models.CharField(max_length=100, blank=True, null=True)
    nearest_town = models.CharField(max_length=100, blank=True, null=True)
    distance_to_town = models.DecimalField(max_digits=8, decimal_places=2, default=0.0)
    water_source_type = models.JSONField(default=list, blank=True)
    water_source_distance = models.CharField(max_length=50, blank=True, null=True)

    # 9-Stage Sequential Workflow
    status = models.CharField(max_length=50, choices=APPLICATION_STAGES, default=STAGE_PENDING, db_index=True)
    current_stage_entered_at = models.DateTimeField(default=timezone.now)
    current_stage_due_date = models.DateTimeField(null=True, blank=True)
    is_overdue = models.BooleanField(default=False, db_index=True)

    # Stage 2: Resettlement Checklist
    resettlement_offer_letter_verified = models.BooleanField(default=False)
    resettlement_spouse_cleared = models.BooleanField(default=False)
    resettlement_estate_cleared = models.BooleanField(default=False)
    resettlement_verified_at = models.DateTimeField(null=True, blank=True)

    # Stage 3: LIMS Checklist & Cadastral ID
    cadastral_id = models.CharField(max_length=100, blank=True, null=True, db_index=True)
    statutory_fee_receipt = models.CharField(max_length=100, blank=True, null=True)
    statutory_fee_paid = models.BooleanField(default=False)
    lims_verification_status = models.BooleanField(default=False)
    lims_verified_at = models.DateTimeField(null=True, blank=True)

    # Stage 4: ZLC Dispute Clearance
    has_disputes = models.BooleanField(default=False)
    has_double_allocation = models.BooleanField(default=False)
    dispute_nature = models.CharField(max_length=255, blank=True, null=True)
    dispute_comments = models.TextField(blank=True, null=True)
    zlc_verification_status = models.BooleanField(default=False)
    zlc_cleared_at = models.DateTimeField(null=True, blank=True)

    # Stage 5: GIS Boundary & PostGIS / Spatial Metrics
    boundary_coordinates = models.JSONField(
        null=True, blank=True,
        help_text="GeoJSON Polygon coordinates [lng, lat] for farm plot spatial mapping"
    )
    spatial_overlap_ratio = models.FloatField(default=0.0, help_text="Overlap area ratio (0.0 to 1.0)")
    overlapping_parcels_count = models.IntegerField(default=0)
    overlapping_parcels_details = models.JSONField(default=list, blank=True)
    gis_validated_at = models.DateTimeField(null=True, blank=True)

    # AI Conflict Predictor & Risk Assessment
    ai_conflict_score = models.IntegerField(default=0, help_text="AI Predicted dispute risk score (0-100)")
    ai_conflict_level = models.CharField(
        max_length=20, default="LOW",
        choices=[("LOW", "Low Risk"), ("MEDIUM", "Medium Risk"), ("HIGH", "High Risk")]
    )
    ai_conflict_details = models.JSONField(default=dict, blank=True)

    # Stage 6: Surveyor General Approval & Fees
    survey_farm_name_confirmed = models.CharField(max_length=255, blank=True, null=True)
    survey_hectarage_confirmed = models.DecimalField(max_digits=12, decimal_places=4, null=True, blank=True)
    survey_fee = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)
    is_survey_fee_paid = models.BooleanField(default=False)
    is_surveyed = models.BooleanField(default=False)
    survey_approved_at = models.DateTimeField(null=True, blank=True)
    survey_diagram = models.FileField(upload_to=secure_file_upload_path, null=True, blank=True)

    # Stage 7: Valuation Directorate
    improvements_description = models.TextField(blank=True, null=True)
    improvements_value = models.DecimalField(max_digits=14, decimal_places=2, default=0.00)
    base_land_value = models.DecimalField(max_digits=14, decimal_places=2, default=0.00)
    base_rate_per_hectare = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)
    valuation_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0.00)
    valuation_approved = models.BooleanField(default=False)
    valuated_at = models.DateTimeField(null=True, blank=True)
    valuation_report = models.FileField(upload_to=secure_file_upload_path, null=True, blank=True)

    # Stage 8: Executive Director Sign-off
    director_approved = models.BooleanField(default=False)
    director_signed_at = models.DateTimeField(null=True, blank=True)
    director_comments = models.TextField(blank=True, null=True)

    # Stage 9: Deeds Registry - Issued and Sealed
    deed_registration_number = models.CharField(max_length=100, blank=True, null=True)
    deed_seal_date = models.DateField(null=True, blank=True)
    deed_document = models.FileField(upload_to=secure_file_upload_path, null=True, blank=True)
    deed_issued_at = models.DateTimeField(null=True, blank=True)

    # Payment & Finance Information
    is_cash_payment = models.BooleanField(default=False)
    purchase_price = models.DecimalField(max_digits=14, decimal_places=2, default=0.00)
    calculated_land_value = models.DecimalField(max_digits=14, decimal_places=2, default=0.00)
    manual_valuation_price = models.DecimalField(max_digits=14, decimal_places=2, default=0.00)
    is_manually_valuated = models.BooleanField(default=False)
    land_class_discount = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)
    water_premium = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)
    town_premium = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)
    ecological_region = models.CharField(max_length=50, blank=True, null=True)
    payment_plan = models.CharField(max_length=50, blank=True, null=True)
    selected_bank = models.CharField(max_length=50, blank=True, null=True)
    payment_method_selected_at = models.DateTimeField(null=True, blank=True)
    payment_verified = models.BooleanField(default=False)
    application_fee_paid = models.BooleanField(default=False)
    collection_notification_sent = models.BooleanField(default=False)
    rejection_reason = models.TextField(blank=True, null=True)
    queried_by = models.CharField(max_length=100, blank=True, null=True)
    appeal_reason = models.TextField(blank=True, null=True)
    is_queried = models.BooleanField(default=False)
    query_message = models.TextField(blank=True, null=True)

    # Attached Documents (Whitelisted Secure Access)
    tenure_document = models.FileField(upload_to=secure_file_upload_path, null=True, blank=True)
    national_id_copy = models.FileField(upload_to=secure_file_upload_path, null=True, blank=True)
    other_attachments = models.FileField(upload_to=secure_file_upload_path, null=True, blank=True)
    war_vet_id_copy = models.FileField(upload_to=secure_file_upload_path, null=True, blank=True)
    employment_proof = models.FileField(upload_to=secure_file_upload_path, null=True, blank=True)

    # Complete Paper Form Fields (Parts 1 & 2)
    subdivision_number = models.CharField(max_length=100, blank=True, null=True)
    plot_number = models.CharField(max_length=100, blank=True, null=True)
    farm_survey_status = models.CharField(max_length=100, blank=True, null=True)
    gazette_date = models.DateField(null=True, blank=True)
    distance_to_main_road = models.DecimalField(max_digits=8, decimal_places=2, default=0.0)
    natural_region = models.CharField(max_length=50, blank=True, null=True)
    selected_land_classes = models.JSONField(default=list, blank=True)
    selected_water_sources = models.JSONField(default=list, blank=True)
    water_capacity_details = models.TextField(blank=True, null=True)
    improvements_list = models.JSONField(default=list, blank=True)
    farmer_categories_list = models.JSONField(default=list, blank=True)

    # Beneficiary Biometrics & Identity Documents
    beneficiary_photo_front = models.FileField(upload_to=secure_file_upload_path, null=True, blank=True)
    beneficiary_photo_side = models.FileField(upload_to=secure_file_upload_path, null=True, blank=True)
    beneficiary_id_front = models.FileField(upload_to=secure_file_upload_path, null=True, blank=True)
    beneficiary_id_back = models.FileField(upload_to=secure_file_upload_path, null=True, blank=True)
    beneficiary_signature = models.FileField(upload_to=secure_file_upload_path, null=True, blank=True)
    beneficiary_signature_date = models.DateField(null=True, blank=True)
    police_clearance = models.FileField(upload_to=secure_file_upload_path, null=True, blank=True)
    tax_clearance = models.FileField(upload_to=secure_file_upload_path, null=True, blank=True)

    # Official Use Section
    official_compiled_by = models.CharField(max_length=200, blank=True, null=True)
    official_checked_by = models.CharField(max_length=200, blank=True, null=True)

    # Idempotency & AI Assessment Metadata
    idempotency_key = models.CharField(max_length=100, blank=True, null=True, db_index=True)
    ai_risk_reasons = models.JSONField(default=list, blank=True)
    ai_model_version = models.CharField(max_length=100, blank=True, default='')
    ai_assessed_at = models.DateTimeField(null=True, blank=True)

    # 3-Factor Public Tracking: National ID + Ref Number + 6-digit PIN
    tracking_pin_hash = models.CharField(max_length=128, blank=True, null=True)
    tracking_pin_sent_at = models.DateTimeField(null=True, blank=True)
    tracking_pin_failed_attempts = models.IntegerField(default=0)
    tracking_pin_locked_until = models.DateTimeField(null=True, blank=True)

    # General Comments & Timestamps
    officer_comments = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    def get_applicant_national_id(self) -> str:
        if self.farmer and self.farmer.national_id:
            return self.farmer.national_id.strip().upper()
        if self.walk_in_national_id:
            return self.walk_in_national_id.strip().upper()
        return ""

    def set_tracking_pin(self, pin: str):
        from .services.tracking_service import hash_pin
        self.tracking_pin_hash = hash_pin(str(pin).strip())
        self.tracking_pin_sent_at = timezone.now()

    def verify_tracking_pin(self, pin: str) -> bool:
        from .services.tracking_service import verify_pin
        return verify_pin(str(pin).strip(), self.tracking_pin_hash)

    def save(self, *args, **kwargs):
        is_new = self.pk is None
        super().save(*args, **kwargs)
        if is_new and not self.reference_number:
            self.reference_number = f"TD-2026-{self.pk:05d}"
            TitleDeedApplication.objects.filter(pk=self.pk).update(reference_number=self.reference_number)

    def __str__(self):
        ref = self.reference_number or f"APP-{self.pk}"
        return f"{ref} - {self.farm_name} ({self.status})"

class SpouseDetail(models.Model):
    application = models.ForeignKey(TitleDeedApplication, on_delete=models.CASCADE, related_name='spouses')
    surname = models.CharField(max_length=100, blank=True, null=True)
    first_name = models.CharField(max_length=100, blank=True, null=True)
    national_id = models.CharField(max_length=30, blank=True, null=True, validators=[validate_zimbabwe_national_id])
    citizenship = models.CharField(max_length=50, default='Zimbabwean')
    is_war_veteran = models.BooleanField(default=False)
    war_vet_id_copy = models.FileField(upload_to=secure_file_upload_path, null=True, blank=True)
    is_ex_detainee = models.BooleanField(default=False)
    is_collaborator = models.BooleanField(default=False)
    is_civil_servant = models.BooleanField(default=False)
    civil_service_years = models.PositiveIntegerField(null=True, blank=True)
    employment_proof = models.FileField(upload_to=secure_file_upload_path, null=True, blank=True)
    title = models.CharField(max_length=20, blank=True, null=True, default='Mrs.')
    other_names = models.CharField(max_length=100, blank=True, null=True)
    date_of_birth = models.DateField(null=True, blank=True)
    telephone = models.CharField(max_length=50, blank=True, null=True)
    marriage_type = models.CharField(max_length=100, blank=True, null=True)
    marriage_certificate_number = models.CharField(max_length=100, blank=True, null=True)
    photo_front = models.FileField(upload_to=secure_file_upload_path, null=True, blank=True)
    photo_side = models.FileField(upload_to=secure_file_upload_path, null=True, blank=True)
    id_front = models.FileField(upload_to=secure_file_upload_path, null=True, blank=True)
    id_back = models.FileField(upload_to=secure_file_upload_path, null=True, blank=True)
    marriage_certificate = models.FileField(upload_to=secure_file_upload_path, null=True, blank=True)
    signature = models.FileField(upload_to=secure_file_upload_path, null=True, blank=True)
    signature_date = models.DateField(null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    def clean(self):
        super().clean()
        if self.national_id:
            validate_zimbabwe_national_id(self.national_id)

    def __str__(self):
        return f"{self.first_name} {self.surname} ({self.national_id})"

class WorkflowTransition(models.Model):
    """
    Database-driven workflow transitions defining sequential stages, allowed role,
    return capabilities, and configurable SLAs.
    """
    from_stage = models.CharField(max_length=50, choices=APPLICATION_STAGES)
    to_stage = models.CharField(max_length=50, choices=APPLICATION_STAGES)
    allowed_role = models.CharField(max_length=50, choices=STAFF_ROLES)
    is_return = models.BooleanField(default=False, help_text="True if returning to previous stage")
    requires_comment = models.BooleanField(default=True, help_text="Mandatory comment for returns or transitions")
    description = models.CharField(max_length=255, blank=True)
    sla_days = models.PositiveIntegerField(default=5, help_text="Configurable SLA in days")

    class Meta:
        unique_together = ('from_stage', 'to_stage', 'allowed_role')
        ordering = ['from_stage', 'to_stage']

    def __str__(self):
        dir_sym = "<-" if self.is_return else "->"
        return f"[{self.allowed_role}] {self.from_stage} {dir_sym} {self.to_stage} ({self.sla_days}d SLA)"

class StageSLA(models.Model):
    """
    Configurable Stage SLAs with notification recipients.
    """
    stage = models.CharField(max_length=50, unique=True, choices=APPLICATION_STAGES)
    department_name = models.CharField(max_length=100)
    sla_days = models.PositiveIntegerField(default=5)
    notification_email = models.EmailField(blank=True, default='')

    def __str__(self):
        return f"{self.department_name} ({self.stage}): {self.sla_days} Days"

class SurveyTariff(models.Model):
    """
    Configurable Survey Tariff table based on parcel area in hectares.
    """
    min_area_ha = models.DecimalField(max_digits=10, decimal_places=2)
    max_area_ha = models.DecimalField(max_digits=10, decimal_places=2)
    base_fee_usd = models.DecimalField(max_digits=10, decimal_places=2)
    per_hectare_rate_usd = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    description = models.CharField(max_length=200, blank=True)

    class Meta:
        ordering = ['min_area_ha']

    def calculate_fee(self, area_ha: float) -> float:
        area_dec = float(area_ha)
        fee = float(self.base_fee_usd)
        if self.per_hectare_rate_usd and area_dec > float(self.min_area_ha):
            fee += (area_dec - float(self.min_area_ha)) * float(self.per_hectare_rate_usd)
        return round(fee, 2)

    def __str__(self):
        return f"{self.min_area_ha} - {self.max_area_ha} ha: ${self.base_fee_usd} + ${self.per_hectare_rate_usd}/ha"

class ValuationTariff(models.Model):
    """
    Configurable Valuation Tariff table: base rate per hectare by ecological region and land class.
    """
    region = models.CharField(max_length=20, help_text="Ecological Region I through V")
    land_class = models.CharField(max_length=50, help_text="A1, A2, Commercial, Peri-urban, Communal")
    base_rate_per_ha_usd = models.DecimalField(max_digits=10, decimal_places=2)
    description = models.CharField(max_length=200, blank=True)

    class Meta:
        unique_together = ('region', 'land_class')
        ordering = ['region', 'land_class']

    def __str__(self):
        return f"{self.region} / {self.land_class}: ${self.base_rate_per_ha_usd}/ha"

class ApplicationAction(models.Model):
    """
    Blockchain-style (hash-chained), append-only immutable audit ledger.
    Block modifications (UPDATE and DELETE) are prohibited at the model level.
    """
    application = models.ForeignKey(TitleDeedApplication, on_delete=models.CASCADE, related_name='actions')
    officer = models.ForeignKey(User, on_delete=models.PROTECT, related_name='application_actions')
    from_stage = models.CharField(max_length=50, blank=True, default='')
    to_stage = models.CharField(max_length=50, blank=True, default='')
    action_type = models.CharField(max_length=50) # 'ADVANCE', 'RETURN', 'INITIAL_SUBMISSION', 'QUERY'
    comment = models.TextField(blank=True, default='')
    previous_hash = models.CharField(max_length=64, blank=True, default='')
    block_hash = models.CharField(max_length=64, blank=True, default='')
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ['id']

    def calculate_canonical_hash(self) -> str:
        payload = {
            "application_id": self.application_id,
            "officer_id": self.officer_id,
            "from_stage": self.from_stage or "",
            "to_stage": self.to_stage or "",
            "action_type": self.action_type or "",
            "comment": (self.comment or "").strip(),
            "timestamp": self.created_at.isoformat() if self.created_at else timezone.now().isoformat()
        }
        canonical_json = json.dumps(payload, sort_keys=True, separators=(',', ':'))
        return hashlib.sha256((self.previous_hash + canonical_json).encode('utf-8')).hexdigest()

    def save(self, *args, **kwargs):
        if self.comment is None:
            self.comment = ''
        # Strict immutability guard: block updates
        if self.pk is not None:
            raise PermissionDenied("ApplicationAction audit records are immutable and cannot be updated.")
        
        if not self.created_at:
            self.created_at = timezone.now()

        # Link previous hash in chain
        if not self.previous_hash:
            last_action = ApplicationAction.objects.filter(
                application=self.application
            ).order_by('id').last()
            
            if last_action and last_action.block_hash:
                self.previous_hash = last_action.block_hash
            else:
                self.previous_hash = "GENESIS_" + hashlib.sha256(f"APP_{self.application_id}".encode()).hexdigest()[:56]

        if not self.block_hash:
            self.block_hash = self.calculate_canonical_hash()

        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        # Strict immutability guard: block deletion
        raise PermissionDenied("ApplicationAction audit records cannot be deleted.")

    @classmethod
    def verify_application_ledger(cls, application_id: int) -> dict:
        actions = list(cls.objects.filter(application_id=application_id).order_by('id'))
        if not actions:
            return {"status": "EMPTY", "is_valid": True, "total_blocks": 0}

        expected_prev = "GENESIS_" + hashlib.sha256(f"APP_{application_id}".encode()).hexdigest()[:56]
        for idx, act in enumerate(actions):
            if act.previous_hash != expected_prev:
                return {
                    "status": "TAMPERED",
                    "is_valid": False,
                    "tampered_at_block": idx + 1,
                    "action_id": act.id,
                    "reason": "Previous hash pointer corrupted or block deleted"
                }
            recomputed = act.calculate_canonical_hash()
            if act.block_hash != recomputed:
                return {
                    "status": "TAMPERED",
                    "is_valid": False,
                    "tampered_at_block": idx + 1,
                    "action_id": act.id,
                    "reason": "Block content payload tampered"
                }
            expected_prev = act.block_hash

        return {
            "status": "SECURE",
            "is_valid": True,
            "total_blocks": len(actions),
            "latest_block_hash": actions[-1].block_hash
        }

    def __str__(self):
        hash_snip = self.block_hash[:8] if self.block_hash else 'PENDING'
        return f"{self.officer.username} - {self.action_type} on App {self.application_id} [Block: {hash_snip}]"

class EmailLog(models.Model):
    recipient = models.EmailField()
    subject = models.CharField(max_length=255)
    body = models.TextField()
    status = models.CharField(max_length=20, default='SUCCESS', choices=[('SUCCESS', 'Success'), ('FAILED', 'Failed')])
    application = models.ForeignKey(TitleDeedApplication, on_delete=models.SET_NULL, null=True, blank=True, related_name='email_logs')
    error_message = models.TextField(blank=True, null=True)
    sent_at = models.DateTimeField(auto_now_add=True)
    attempts = models.IntegerField(default=1)

    class Meta:
        ordering = ['-sent_at']

    def __str__(self):
        return f"{self.status} to {self.recipient} at {self.sent_at}: {self.subject}"

class Payment(models.Model):
    """
    Server-governed payment record for the statutory processing fee (USD $10.00).
    Receipt numbers are generated and validated on the server only.
    """
    receipt_number = models.CharField(max_length=50, unique=True, db_index=True)
    amount = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('10.00'))
    currency = models.CharField(max_length=10, default='USD')
    provider = models.CharField(max_length=50, default='mock')
    status = models.CharField(max_length=20, default='CONFIRMED', db_index=True)
    beneficiary_name = models.CharField(max_length=200, blank=True, default='')
    national_id = models.CharField(max_length=50, blank=True, default='', db_index=True)
    phone_number = models.CharField(max_length=50, blank=True, default='')
    is_used = models.BooleanField(default=False, db_index=True)
    used_for_application = models.ForeignKey(
        'TitleDeedApplication',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='payments'
    )
    transaction_ref = models.CharField(max_length=100, blank=True, default='')
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"Payment {self.receipt_number} - ${self.amount} {self.currency} ({self.status})"

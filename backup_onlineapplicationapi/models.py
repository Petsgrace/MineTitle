from django.db import models
from django.contrib.auth.models import User
from django.core.validators import FileExtensionValidator
from .utils.file_utils import secure_file_upload_path
from .utils.validators import validate_uploaded_file

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
    other_names = models.CharField(max_length=100, blank=True, null=True)  # Middle names
    sex = models.CharField(max_length=20)
    title = models.CharField(max_length=10)
    date_of_birth = models.DateField()
    national_id = models.CharField(max_length=20, unique=True, db_index=True)
    marital_status = models.CharField(max_length=20)
    citizenship = models.CharField(max_length=50, choices=CITIZENSHIP_CHOICES, default='Zimbabwean')
    telephone = models.CharField(max_length=20)
    contact_address = models.TextField()
    email = models.EmailField()
    
    # Farmer Categories (Section 2.13 - can select multiple)
    is_war_veteran = models.BooleanField(default=False)
    war_vet_number = models.CharField(max_length=50, blank=True, null=True)
    is_ex_detainee = models.BooleanField(default=False, help_text="Ex-Detainee / Restrictee / Non-Combatant Cadre (30% discount)")
    is_collaborator = models.BooleanField(default=False, help_text="Collaborator (15% discount)")
    is_uniformed_forces = models.BooleanField(default=False)
    force_number = models.CharField(max_length=50, blank=True, null=True)
    is_business_person = models.BooleanField(default=False)
    is_youth = models.BooleanField(default=False)  # 35 years and below
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
    
    # Years of service for civil servants and uniformed forces
    years_of_service = models.IntegerField(null=True, blank=True, help_text="Years of service for civil servants/uniformed forces")

    def __str__(self):
        return f"{self.first_name} {self.surname} ({self.national_id})"

class TitleDeedApplication(models.Model):
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

    STATUS_CHOICES = [
        ('PENDING', 'Pending'),
        ('REFERRED', 'Referred to Resettlement Officer'),
        ('QUERIED', 'Queried'),
        ('RESUBMITTED', 'Resubmitted'),
        ('LIMS_VERIFIED', 'LIMS Verified'),
        ('ACCOUNTS_VERIFIED', 'Accounts Verified'),
        ('ESTATES_VERIFIED', 'Estates Verified'),
        ('RESETTLEMENT_VERIFIED', 'Resettlement Verified'),
        ('ZLC_VERIFIED', 'ZLC Verified'),
        ('SURVEYED', 'Surveyed'),
        ('VALUATED', 'Valuated'),
        ('AWAITING_PAYMENT', 'Awaiting Payment'),
        ('SELECT_PAYMENT', 'Select Payment'),
        ('AGREEMENT_OF_SALE', 'Proceed to Agreement of Sale'),
        ('PAYMENT_VERIFIED', 'Payment Verified'),
        ('READY_FOR_COLLECTION', 'Ready for Collection'),
        ('COMPLETED', 'Completed'),
        ('AWAITING_SURVEY_FEE', 'Awaiting Survey Fee'),
        ('SURVEY_FEE_PAID', 'Survey Fee Paid'),
        ('APPROVED', 'Approved'),
        ('REJECTED', 'Rejected'),
    ]

    # Workflow Tracking
    application_fee_paid = models.BooleanField(default=False)
    has_disputes = models.BooleanField(default=False)
    dispute_nature = models.CharField(max_length=255, blank=True, null=True, help_text="e.g. Boundary Dispute, Double Allocation, Illegal Settler")
    dispute_comments = models.TextField(blank=True, null=True)
    
    # Confirmed Survey Details (Official values from Surveyor)
    survey_farm_name_confirmed = models.CharField(max_length=255, blank=True, null=True)
    survey_hectarage_confirmed = models.DecimalField(max_digits=10, decimal_places=4, blank=True, null=True)

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

    BENEFICIARY_CHOICES = [
        ('none', 'None'),
        ('cash', 'Cash Payment'),
        ('war_veteran', 'War Veteran'),
        ('civil_20plus', 'Civil Servant (20+ years)'),
        ('civil_10to19', 'Civil Servant (10-19 years)'),
    ]

    farmer = models.OneToOneField(FarmerProfile, on_delete=models.PROTECT, related_name='application')
    
    # Farm Details
    province = models.CharField(max_length=100, blank=True, null=True)
    district = models.CharField(max_length=100)
    old_district = models.CharField(max_length=100, blank=True, null=True)
    farm_id = models.CharField(max_length=50, db_index=True, null=True, blank=True)
    farm_name = models.CharField(max_length=200)
    farm_extent = models.DecimalField(max_digits=12, decimal_places=4)  # Total hectares
    arable_area = models.DecimalField(max_digits=12, decimal_places=4, null=True, blank=True)  # Arable hectares
    tenure_document_type = models.CharField(max_length=100)
    
    # Location Details (for pricing)
    nearest_town = models.CharField(max_length=100, blank=True, null=True)
    distance_to_town = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)  # km
    
    # Water Source Details
    water_source_type = models.JSONField(default=list, blank=True, null=True, help_text="List of selected water sources (e.g. ['dam', 'borehole'])")
    water_source_distance = models.CharField(max_length=20, choices=WATER_DISTANCE_CHOICES, blank=True, null=True)
    
    # Improvements (farmer input)
    improvements_description = models.TextField(blank=True, null=True)  # What farmer found on farm
    improvements_value = models.DecimalField(max_digits=15, decimal_places=2, null=True, blank=True)  # Estimated value
    
    # Ecological Region (for valuation override)
    ecological_region = models.CharField(max_length=5, blank=True, null=True, help_text="Valuation override for ecological region (1, 2a, 2b, 3, 4, 5)")
    
    # Manual Valuation Override
    manual_valuation_price = models.DecimalField(max_digits=15, decimal_places=2, null=True, blank=True, help_text="Manual override for base purchase price (before beneficiary discounts)")
    is_manually_valuated = models.BooleanField(default=False, help_text="Flag if price was manually set by officer")
    
    # Pricing Calculation Details (populated by pricing service)
    base_land_value = models.DecimalField(max_digits=15, decimal_places=2, null=True, blank=True, help_text="Base land value before adjustments")
    base_rate_per_hectare = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True, help_text="Base rate per hectare for the region")
    land_class_discount = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True, help_text="Land class discount percentage")
    water_premium = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True, help_text="Water source premium percentage")
    town_premium = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True, help_text="Town proximity premium percentage")

    
    # Beneficiary Categories (cumulative - farmer can qualify for multiple)
    is_cash_payment = models.BooleanField(default=False)  # 15% discount
    
    # Financial Selection
    purchase_price = models.DecimalField(max_digits=15, decimal_places=2, null=True, blank=True)
    calculated_land_value = models.DecimalField(max_digits=15, decimal_places=2, null=True, blank=True)
    payment_plan = models.CharField(max_length=20, choices=PAYMENT_PLAN_CHOICES, null=True, blank=True)
    selected_bank = models.CharField(max_length=10, choices=BANK_CHOICES, null=True, blank=True)
    payment_method_selected_at = models.DateTimeField(null=True, blank=True)
    
    # Survey Fee Status
    is_survey_fee_paid = models.BooleanField(default=False)
    survey_fee = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)

    # File Uploads 
    tenure_document = models.FileField(
        upload_to=secure_file_upload_path,
        validators=[validate_uploaded_file]
    )
    national_id_copy = models.FileField(
        upload_to=secure_file_upload_path,
        validators=[validate_uploaded_file]
    )
    other_attachments = models.FileField(
        upload_to=secure_file_upload_path, 
        blank=True, 
        null=True,
        validators=[validate_uploaded_file]
    )
    war_vet_id_copy = models.FileField(
        upload_to=secure_file_upload_path, 
        blank=True, 
        null=True,
        validators=[validate_uploaded_file]
    )
    employment_proof = models.FileField(
        upload_to=secure_file_upload_path, 
        blank=True, 
        null=True,
        validators=[validate_uploaded_file]
    )

    status = models.CharField(max_length=30, choices=STATUS_CHOICES, default='PENDING', db_index=True)
    
    # Officer notes/fields
    lims_verification_status = models.BooleanField(default=False)
    zlc_verification_status = models.BooleanField(default=False)
    is_surveyed = models.BooleanField(default=False)
    valuation_approved = models.BooleanField(default=False)
    
    officer_comments = models.TextField(blank=True, null=True)
    # Workflow Feedback & Finance
    rejection_reason = models.TextField(blank=True, null=True)
    queried_by = models.CharField(max_length=20, blank=True, null=True, db_index=True)
    appeal_reason = models.TextField(blank=True, null=True)
    payment_verified = models.BooleanField(default=False)
    collection_notification_sent = models.BooleanField(default=False)
    survey_fee = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)

    # Citizen Tracking (3-factor: National ID + Reference Number + PIN)
    tracking_pin_hash = models.CharField(
        max_length=128,
        blank=True,
        null=True,
        help_text="Hashed 6-digit tracking PIN sent to citizen for public status tracking"
    )
    tracking_pin_sent_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Timestamp when the tracking PIN was last sent to the citizen"
    )

    # GIS Map & Spatial Boundaries
    boundary_coordinates = models.JSONField(
        null=True,
        blank=True,
        help_text="GeoJSON Polygon coordinates for farm plot spatial mapping and conflict check"
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    @property
    def valuation_amount(self):
        return self.manual_valuation_price

    @valuation_amount.setter
    def valuation_amount(self, value):
        if value is not None:
            from decimal import Decimal
            if not isinstance(value, Decimal):
                value = Decimal(str(value))
        self.manual_valuation_price = value

    def __str__(self):
        return f"App {self.id}: {self.farm_name} ({self.status})"

    def clean(self):
        super().clean()
        from django.core.exceptions import ValidationError
        if self.arable_area and self.farm_extent:
            if self.arable_area > self.farm_extent:
                raise ValidationError({
                    'arable_area': 'Arable area cannot be greater than the total farm extent.'
                })

class SpouseDetail(models.Model):
    application = models.ForeignKey(TitleDeedApplication, on_delete=models.CASCADE, related_name='spouses')
    surname = models.CharField(max_length=100, blank=True, null=True)
    first_name = models.CharField(max_length=100, blank=True, null=True)
    national_id = models.CharField(max_length=20, blank=True, null=True)
    citizenship = models.CharField(
        max_length=50, 
        choices=FarmerProfile.CITIZENSHIP_CHOICES, 
        default='Zimbabwean',
        help_text="Spouse citizenship"
    )
    
    # Spouse beneficiary eligibility (adds to cumulative discount)
    is_war_veteran = models.BooleanField(default=False)
    war_vet_id_copy = models.FileField(
        upload_to=secure_file_upload_path, 
        blank=True, 
        null=True,
        validators=[validate_uploaded_file]
    )
    is_ex_detainee = models.BooleanField(default=False, help_text="Ex-Detainee / Restrictee / Non-Combatant Cadre (30% discount)")
    is_collaborator = models.BooleanField(default=False, help_text="Collaborator (15% discount)")
    is_civil_servant = models.BooleanField(default=False)
    civil_service_years = models.PositiveIntegerField(null=True, blank=True)
    employment_proof = models.FileField(
        upload_to=secure_file_upload_path, 
        blank=True, 
        null=True,
        validators=[validate_uploaded_file]
    )
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.first_name} {self.surname} (Spouse of App {self.application.id})"

class StaffProfile(models.Model):
    ROLE_CHOICES = [
        ('lims', 'LIMS Officer'),
        ('accounts', 'Accounts Officer'),
        ('estates', 'Estates Officer'),
        ('zlc', 'ZLC Officer'),
        ('surveyor', 'Surveyor'),
        ('valuation', 'Valuation Officer'),
        ('conveyancer', 'Conveyancer'),
        ('director', 'Director'),
        ('admin', 'Administrator'),
    ]
    
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='staff_profile')
    role = models.CharField(max_length=20, choices=ROLE_CHOICES)
    
    def __str__(self):
        return f"{self.user.username} - {self.get_role_display()}"
class ApplicationAction(models.Model):
    application = models.ForeignKey(TitleDeedApplication, on_delete=models.CASCADE, related_name='actions')
    officer = models.ForeignKey(User, on_delete=models.CASCADE)
    action_type = models.CharField(max_length=50) # e.g. 'VERIFIED', 'QUERIED', 'REJECTED', 'APPROVED'
    comment = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.officer.username} - {self.action_type} on App {self.application.id}"


class EmailLog(models.Model):
    """Track all email sending attempts for monitoring and debugging"""
    
    STATUS_CHOICES = [
        ('success', 'Success'),
        ('failed', 'Failed'),
        ('pending', 'Pending'),
    ]
    
    # Email details
    recipient = models.EmailField(help_text="Email recipient address")
    subject = models.CharField(max_length=255, help_text="Email subject line")
    body = models.TextField(help_text="Email body content")
    status = models.CharField(
        max_length=10, 
        choices=STATUS_CHOICES, 
        default='pending',
        db_index=True
    )
    
    # Related application (optional - some emails may not be application-related)
    application = models.ForeignKey(
        TitleDeedApplication, 
        on_delete=models.SET_NULL, 
        null=True, 
        blank=True,
        related_name='email_logs',
        help_text="Related application if applicable"
    )
    
    # Error tracking
    error_message = models.TextField(
        null=True, 
        blank=True,
        help_text="Error details if email failed"
    )
    
    # Metadata
    sent_at = models.DateTimeField(auto_now_add=True, db_index=True)
    attempts = models.IntegerField(default=1, help_text="Number of send attempts")
    
    class Meta:
        ordering = ['-sent_at']
        verbose_name = "Email Log"
        verbose_name_plural = "Email Logs"
        indexes = [
            models.Index(fields=['-sent_at', 'status']),
        ]
    
    def __str__(self):
        return f"{self.recipient} - {self.subject} ({self.status})"

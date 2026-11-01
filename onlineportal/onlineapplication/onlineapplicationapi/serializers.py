from django.contrib.auth.models import User
from rest_framework import serializers
from .models import FarmerProfile, TitleDeedApplication, SpouseDetail, StaffProfile, Payment
from .utils.id_utils import format_national_id

class SpouseDetailSerializer(serializers.ModelSerializer):
    first_name = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    national_id = serializers.CharField(required=False, allow_blank=True, allow_null=True)

    class Meta:
        model = SpouseDetail
        fields = '__all__'
        read_only_fields = ('application',)

    def to_internal_value(self, data):
        if hasattr(data, 'dict'):
            data = data.dict()
        elif hasattr(data, 'copy'):
            data = data.copy()

        import base64
        import uuid
        from django.core.files.base import ContentFile
        from django.core.files.uploadedfile import UploadedFile

        # Property mapping from frontend camelCase
        if 'dob' in data and not data.get('date_of_birth'):
            data['date_of_birth'] = data.pop('dob')
        if 'phone' in data and not data.get('telephone'):
            data['telephone'] = data.pop('phone')
        if 'photoFront' in data and not data.get('photo_front'):
            data['photo_front'] = data.pop('photoFront')
        if 'photoSide' in data and not data.get('photo_side'):
            data['photo_side'] = data.pop('photoSide')
        if 'idFront' in data and not data.get('id_front'):
            data['id_front'] = data.pop('idFront')
        if 'idBack' in data and not data.get('id_back'):
            data['id_back'] = data.pop('idBack')
        if 'signatureDate' in data and not data.get('signature_date'):
            data['signature_date'] = data.pop('signatureDate')

        file_keys = ['photo_front', 'photo_side', 'id_front', 'id_back', 'signature', 'war_vet_id_copy', 'employment_proof']
        for k in file_keys:
            if k in data and isinstance(data[k], str) and data[k].startswith('data:'):
                try:
                    fmt, b64data = data[k].split(';base64,')
                    ext = fmt.split('/')[-1]
                    if ext == 'jpeg': ext = 'jpg'
                    data[k] = ContentFile(base64.b64decode(b64data), name=f"{k}_{uuid.uuid4().hex[:8]}.{ext}")
                except Exception:
                    data.pop(k, None)
            elif k in data and not isinstance(data[k], (UploadedFile, ContentFile)):
                data.pop(k, None)

        if 'civil_service_years' in data and data['civil_service_years'] == '':
            data['civil_service_years'] = None

        return super().to_internal_value(data)

    def validate_national_id(self, value):
        """Format spouse national id"""
        if value and value.strip():
            return format_national_id(value)
        return value

class FarmerProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = FarmerProfile
        fields = '__all__'
        read_only_fields = ('user',)
    
    def validate_national_id(self, value):
        """Format farmer national id"""
        return format_national_id(value)
    
    def validate_email(self, value):
        """Validate email format"""
        from django.core.validators import EmailValidator
        from django.core.exceptions import ValidationError as DjangoValidationError
        
        validator = EmailValidator()
        try:
            validator(value)
        except DjangoValidationError:
            raise serializers.ValidationError("Please enter a valid email address")
        return value
    
    def validate_telephone(self, value):
        """Validate phone number format - must include country code"""
        if not value:
            return value
            
        # Remove spaces and dashes for validation
        clean_value = value.replace(' ', '').replace('-', '')
        
        # Must start with +
        if not clean_value.startswith('+'):
            raise serializers.ValidationError(
                "Phone number must include country code (e.g., +263 for Zimbabwe)"
            )
        
        # Extract digits after the + sign
        digits = clean_value[1:]
        if not digits.isdigit():
            raise serializers.ValidationError(
                "Phone number must contain only digits after country code"
            )
        
        # Minimum length check (country code + number)
        if len(clean_value) < 10:
            raise serializers.ValidationError(
                "Phone number is too short"
            )
            
        return value

    def validate_date_of_birth(self, value):
        """Validate that the farmer is over 18 years old."""
        from datetime import date
        today = date.today()
        if not value:
            return value
            
        # Calculate age
        age = today.year - value.year - ((today.month, today.day) < (value.month, value.day))
        
        if age < 18:
            raise serializers.ValidationError("You must be at least 18 years old to register as a farmer.")
            
        return value

class TitleDeedApplicationSerializer(serializers.ModelSerializer):
    spouses = SpouseDetailSerializer(many=True, required=False)
    farmer_name = serializers.CharField(source='farmer.first_name', read_only=True)
    farmer_surname = serializers.CharField(source='farmer.surname', read_only=True)
    national_id = serializers.CharField(source='farmer.national_id', read_only=True)
    telephone = serializers.CharField(source='farmer.telephone', read_only=True)
    email = serializers.CharField(source='farmer.email', read_only=True)
    date_of_birth = serializers.DateField(source='farmer.date_of_birth', read_only=True)
    plot_number = serializers.CharField(source='farm_id', required=False, allow_blank=True, allow_null=True)
    valuation_amount = serializers.DecimalField(max_digits=15, decimal_places=2, required=False, allow_null=True)
    standard_rate_per_hectare = serializers.SerializerMethodField()
    war_vet_concession_rate = serializers.SerializerMethodField()
    war_vet_threshold_ha = serializers.SerializerMethodField()
    
    # Farmer profile read-only fields (for pre-populating the edit form)
    farmer_title = serializers.CharField(source='farmer.title', read_only=True)
    farmer_sex = serializers.CharField(source='farmer.sex', read_only=True)
    farmer_marital_status = serializers.CharField(source='farmer.marital_status', read_only=True)
    farmer_citizenship = serializers.CharField(source='farmer.citizenship', read_only=True)
    farmer_contact_address = serializers.CharField(source='farmer.contact_address', read_only=True)
    farmer_other_names = serializers.CharField(source='farmer.other_names', read_only=True, allow_null=True)
    farmer_is_war_veteran = serializers.BooleanField(source='farmer.is_war_veteran', read_only=True)
    farmer_war_vet_number = serializers.CharField(source='farmer.war_vet_number', read_only=True, allow_null=True)
    farmer_is_ex_detainee = serializers.BooleanField(source='farmer.is_ex_detainee', read_only=True)
    farmer_is_collaborator = serializers.BooleanField(source='farmer.is_collaborator', read_only=True)
    farmer_is_uniformed_forces = serializers.BooleanField(source='farmer.is_uniformed_forces', read_only=True)
    farmer_force_number = serializers.CharField(source='farmer.force_number', read_only=True, allow_null=True)
    farmer_is_business_person = serializers.BooleanField(source='farmer.is_business_person', read_only=True)
    farmer_is_youth = serializers.BooleanField(source='farmer.is_youth', read_only=True)
    farmer_is_civil_servant = serializers.BooleanField(source='farmer.is_civil_servant', read_only=True)
    farmer_civil_service_years = serializers.IntegerField(source='farmer.civil_service_years', read_only=True, allow_null=True)
    farmer_ec_number = serializers.CharField(source='farmer.ec_number', read_only=True, allow_null=True)
    farmer_years_of_service = serializers.IntegerField(source='farmer.years_of_service', read_only=True, allow_null=True)
    farmer_is_mp_senator = serializers.BooleanField(source='farmer.is_mp_senator', read_only=True)
    farmer_is_disabled = serializers.BooleanField(source='farmer.is_disabled', read_only=True)
    farmer_is_zepdra = serializers.BooleanField(source='farmer.is_zepdra', read_only=True)
    farmer_is_councilor = serializers.BooleanField(source='farmer.is_councilor', read_only=True)
    farmer_is_traditional_chief = serializers.BooleanField(source='farmer.is_traditional_chief', read_only=True)
    farmer_is_ordinary = serializers.BooleanField(source='farmer.is_ordinary', read_only=True)
    farmer_is_other = serializers.BooleanField(source='farmer.is_other', read_only=True)
    farmer_other_category_specify = serializers.CharField(source='farmer.other_category_specify', read_only=True, allow_null=True)

    # Farmer Profile fields (writable, to update profile on submit)
    is_war_veteran = serializers.BooleanField(required=False, write_only=True)
    war_vet_number = serializers.CharField(required=False, allow_blank=True, write_only=True)
    is_ex_detainee = serializers.BooleanField(required=False, write_only=True)
    is_collaborator = serializers.BooleanField(required=False, write_only=True)
    is_uniformed_forces = serializers.BooleanField(required=False, write_only=True)
    force_number = serializers.CharField(required=False, allow_blank=True, write_only=True)
    years_of_service = serializers.IntegerField(required=False, allow_null=True, write_only=True)
    is_civil_servant = serializers.BooleanField(required=False, write_only=True)
    ec_number = serializers.CharField(required=False, allow_blank=True, write_only=True)
    civil_service_years = serializers.IntegerField(required=False, allow_null=True, write_only=True)

    class Meta:
        model = TitleDeedApplication
        fields = '__all__'
        read_only_fields = ('farmer', 'status', 'lims_verification_status', 'zlc_verification_status', 'is_surveyed', 'valuation_approved')

    def to_internal_value(self, data):
        # Create a mutable copy/dict to work with
        if hasattr(data, 'dict'):
            data = data.dict()
        elif hasattr(data, 'copy'):
            data = data.copy()
            
        # Handle plot_number -> farm_id mapping
        if 'plot_number' in data:
            # Only set farm_id if plot_number has a value
            if data['plot_number'] and isinstance(data['plot_number'], str) and data['plot_number'].strip():
                data['farm_id'] = data['plot_number']
            # Remove plot_number so it doesn't cause validation errors
            data.pop('plot_number', None)
        
        # Handle spouses if it comes as a string (happens with multipart/form-data)
        if 'spouses' in data and isinstance(data['spouses'], str):
            import json
            try:
                data['spouses'] = json.loads(data['spouses'])
                # Clean nested spouse fields that might come as empty strings
                if isinstance(data['spouses'], list):
                    for spouse in data['spouses']:
                        if 'civil_service_years' in spouse and spouse['civil_service_years'] == '':
                            spouse['civil_service_years'] = None
            except (json.JSONDecodeError, TypeError, AttributeError):
                data['spouses'] = []
        
        # Convert empty strings to None for numeric fields BEFORE validation
        numeric_fields = [
            'farm_extent', 'arable_area', 'distance_to_town',
            'improvements_value', 'civil_service_years', 'years_of_service',
            'purchase_price', 'calculated_land_value', 'survey_fee'
        ]
        
        for field in numeric_fields:
            if field in data and data[field] == '':
                data[field] = None
        
        # Convert string booleans to actual booleans
        boolean_fields = [
            'is_cash_payment', 'is_war_veteran', 'is_ex_detainee', 'is_collaborator',
            'is_uniformed_forces', 'is_civil_servant', 'is_business_person', 'is_youth',
        ]
        for field in boolean_fields:
            if field in data and isinstance(data[field], str):
                data[field] = data[field].lower() in ('true', '1', 'yes', 'on')
        
        import base64
        import uuid
        from django.core.files.base import ContentFile
        from django.core.files.uploadedfile import UploadedFile

        # Handle camelCase mappings for biometric/id/signature fields
        camel_map = {
            'beneficiaryPhotoFront': 'beneficiary_photo_front',
            'beneficiaryPhotoSide': 'beneficiary_photo_side',
            'beneficiaryIdFront': 'beneficiary_id_front',
            'beneficiaryIdBack': 'beneficiary_id_back',
            'beneficiarySignature': 'beneficiary_signature',
            'beneficiarySignDate': 'beneficiary_signature_date',
        }
        for c_key, s_key in camel_map.items():
            if c_key in data and s_key not in data:
                data[s_key] = data.pop(c_key)

        # Base64 file conversion and removal of empty strings
        file_fields = [
            'beneficiary_photo_front', 'beneficiary_photo_side',
            'beneficiary_id_front', 'beneficiary_id_back',
            'beneficiary_signature', 'police_clearance', 'tax_clearance',
            'tenure_document', 'national_id_copy', 'other_attachments',
            'war_vet_id_copy', 'employment_proof'
        ]
        for fld in file_fields:
            if fld in data and isinstance(data[fld], str) and data[fld].startswith('data:'):
                try:
                    fmt, b64str = data[fld].split(';base64,')
                    ext = fmt.split('/')[-1].lower()
                    if ext == 'jpeg': ext = 'jpg'
                    data[fld] = ContentFile(base64.b64decode(b64str), name=f"{fld}_{uuid.uuid4().hex[:8]}.{ext}")
                except Exception:
                    data.pop(fld, None)
            elif fld in data and not isinstance(data[fld], (UploadedFile, ContentFile)):
                data.pop(fld, None)
        
        return super().to_internal_value(data)

    def validate(self, data):
        arable_area = data.get('arable_area')
        farm_extent = data.get('farm_extent')
        
        # When patching, the fields might not be in data, so check instance too
        if arable_area is None and self.instance:
            arable_area = self.instance.arable_area
        if farm_extent is None and self.instance:
            farm_extent = self.instance.farm_extent

        if arable_area and farm_extent and arable_area > farm_extent:
            raise serializers.ValidationError({
                'arable_area': 'Arable area cannot be greater than the total farm extent.'
            })
            
        return data

    def to_representation(self, instance):
        """
        Hide purchase price and calculated land value from farmers 
        until the application is approved by the Director.
        
        Note: Farmers should ONLY see purchase_price (final price after ALL discounts),
        NOT calculated_land_value (land value before beneficiary discounts).
        """
        data = super().to_representation(instance)
        request = self.context.get('request')
        
        # Define statuses that represent Director Approval / Release to Farmer
        APPROVED_STATUSES = [
            'SELECT_PAYMENT',
            'AWAITING_PAYMENT', 
            'AGREEMENT_OF_SALE', 
            'PAYMENT_VERIFIED', 
            'READY_FOR_COLLECTION', 
            'APPROVED'
        ]
        
        user = getattr(request, 'user', None)
        
        # If the user is a farmer (authenticated but not staff)
        if user and user.is_authenticated and not user.is_staff:
            # Hide prices until director approves
            if instance.status not in APPROVED_STATUSES:
                data['purchase_price'] = None
                data['calculated_land_value'] = None
            else:
                # Even after approval, hide calculated_land_value from farmers
                # They should only see the final purchase_price after ALL discounts
                data['calculated_land_value'] = None
                
        return data

    def create(self, validated_data):
        spouses_data = validated_data.pop('spouses', [])
        
        # Ensure only model fields are passed to create
        model_fields = [f.name for f in TitleDeedApplication._meta.get_fields()]
        creation_data = {k: v for k, v in validated_data.items() if k in model_fields}

        application = TitleDeedApplication.objects.create(**creation_data)
        
        # Handle spouses and their files
        request = self.context.get('request')
        for index, spouse_data in enumerate(spouses_data):
            # Skip empty spouse entries
            if not spouse_data.get('first_name') and not spouse_data.get('surname') and not spouse_data.get('national_id'):
                continue

            # Try to find files for this spouse in request.FILES
            if request and request.FILES:
                for fld in ['war_vet_id_copy', 'employment_proof', 'photo_front', 'photo_side', 'id_front', 'id_back', 'signature']:
                    req_key = f'spouse_{index}_{fld}'
                    if req_key in request.FILES:
                        spouse_data[fld] = request.FILES[req_key]
            
            SpouseDetail.objects.create(application=application, **spouse_data)
            
        # Update Farmer Profile if beneficiary fields provided
        farmer = application.farmer
        profile_updated = False
        
        if 'is_war_veteran' in validated_data:
            farmer.is_war_veteran = validated_data['is_war_veteran']
            profile_updated = True
        if 'war_vet_number' in validated_data:
            farmer.war_vet_number = validated_data['war_vet_number']
            profile_updated = True
        if 'is_ex_detainee' in validated_data:
            farmer.is_ex_detainee = validated_data['is_ex_detainee']
            profile_updated = True
        if 'is_collaborator' in validated_data:
            farmer.is_collaborator = validated_data['is_collaborator']
            profile_updated = True
        if 'is_civil_servant' in validated_data:
            farmer.is_civil_servant = validated_data['is_civil_servant']
            profile_updated = True
        if 'ec_number' in validated_data:
            farmer.ec_number = validated_data['ec_number']
            profile_updated = True
        if 'civil_service_years' in validated_data:
            farmer.civil_service_years = validated_data['civil_service_years']
            profile_updated = True
            
        if profile_updated:
            farmer.save()
            
        return application

    def update(self, instance, validated_data):
        spouses_data = validated_data.pop('spouses', None)
        
        # Update core application fields
        model_fields = [f.name for f in TitleDeedApplication._meta.get_fields()]
        for attr, value in validated_data.items():
            if attr in model_fields:
                if value == '' and TitleDeedApplication._meta.get_field(attr).null:
                    value = None
                setattr(instance, attr, value)
        instance.save()
        
        # Update Farmer Profile
        farmer = instance.farmer
        profile_updated = False
        if 'is_war_veteran' in validated_data:
            farmer.is_war_veteran = validated_data['is_war_veteran']
            profile_updated = True
        if 'war_vet_number' in validated_data:
            farmer.war_vet_number = validated_data['war_vet_number']
            profile_updated = True
        if 'is_ex_detainee' in validated_data:
            farmer.is_ex_detainee = validated_data['is_ex_detainee']
            profile_updated = True
        if 'is_collaborator' in validated_data:
            farmer.is_collaborator = validated_data['is_collaborator']
            profile_updated = True
        if 'is_uniformed_forces' in validated_data:
            farmer.is_uniformed_forces = validated_data['is_uniformed_forces']
            profile_updated = True
        if 'force_number' in validated_data:
            farmer.force_number = validated_data['force_number']
            profile_updated = True
        if 'years_of_service' in validated_data:
            farmer.years_of_service = validated_data['years_of_service']
            profile_updated = True
        if 'is_civil_servant' in validated_data:
            farmer.is_civil_servant = validated_data['is_civil_servant']
            profile_updated = True
        if 'ec_number' in validated_data:
            farmer.ec_number = validated_data['ec_number']
            profile_updated = True
        if 'civil_service_years' in validated_data:
            farmer.civil_service_years = validated_data['civil_service_years']
            profile_updated = True
            
        if profile_updated:
            farmer.save()

        # Update spouses
        if spouses_data is not None:
            instance.spouses.all().delete()
            request = self.context.get('request')
            for index, spouse_data in enumerate(spouses_data):
                if request and request.FILES:
                    war_vet_key = f'spouse_{index}_war_vet_id_copy'
                    emp_key = f'spouse_{index}_employment_proof'
                    if war_vet_key in request.FILES:
                        spouse_data['war_vet_id_copy'] = request.FILES[war_vet_key]
                    if emp_key in request.FILES:
                        spouse_data['employment_proof'] = request.FILES[emp_key]
                
                SpouseDetail.objects.create(application=instance, **spouse_data)
        
        return instance

    def get_standard_rate_per_hectare(self, obj):
        from .districts import REGION_RATES, get_district_region
        region = obj.ecological_region or get_district_region(obj.district)
        return REGION_RATES.get(region, 500.00)

    def get_war_vet_concession_rate(self, obj):
        from .districts import WAR_VET_REGION_RATES, get_district_region
        if obj.farmer and obj.farmer.is_war_veteran:
            region = obj.ecological_region or get_district_region(obj.district)
            war_vet_info = WAR_VET_REGION_RATES.get(region, {'rate': 3.00, 'threshold_ha': 20})
            return war_vet_info['rate']
        return None

    def get_war_vet_threshold_ha(self, obj):
        from .districts import WAR_VET_REGION_RATES, get_district_region
        if obj.farmer and obj.farmer.is_war_veteran:
            region = obj.ecological_region or get_district_region(obj.district)
            war_vet_info = WAR_VET_REGION_RATES.get(region, {'rate': 3.00, 'threshold_ha': 20})
            return war_vet_info['threshold_ha']
        return None

class UserSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8, error_messages={'min_length': 'Password must be at least 8 characters long.'})
    national_id = serializers.CharField(write_only=True, required=True)
    telephone = serializers.CharField(write_only=True, required=True)
    first_name = serializers.CharField(required=True)
    last_name = serializers.CharField(required=True)

    class Meta:
        model = User
        fields = ('national_id', 'password', 'email', 'first_name', 'last_name', 'telephone')

    def validate_national_id(self, value):
        """Standardize and validate National ID"""
        from .models import validate_zimbabwe_national_id
        if not value:
            raise serializers.ValidationError("National ID is required.")
        try:
            validate_zimbabwe_national_id(value)
        except Exception as e:
            raise serializers.ValidationError(str(e))
        formatted_id = format_national_id(value)
        if User.objects.filter(username=formatted_id).exists() or FarmerProfile.objects.filter(national_id=formatted_id).exists():
            raise serializers.ValidationError("A user with this National ID is already registered.")
        return formatted_id

    def validate_email(self, value):
        if value and (User.objects.filter(email__iexact=value).exists() or FarmerProfile.objects.filter(email__iexact=value).exists()):
            raise serializers.ValidationError("This email address is already registered.")
        return value

    def create(self, validated_data):
        national_id = validated_data.pop('national_id')
        telephone = validated_data.pop('telephone')
        
        # Use formatted National ID as username
        user = User.objects.create_user(
            username=national_id,
            password=validated_data['password'],
            email=validated_data.get('email', ''),
            first_name=validated_data.get('first_name', ''),
            last_name=validated_data.get('last_name', '')
        )
        
        # Create corresponding FarmerProfile
        FarmerProfile.objects.create(
            user=user,
            national_id=national_id,
            first_name=user.first_name,
            surname=user.last_name,
            telephone=telephone,
            email=user.email,
            date_of_birth='1990-01-01',
            sex='Not Specified',
            title='Mr/Ms',
            marital_status='Single',
            citizenship='Zimbabwean',
            contact_address='Standard Address' 
        )
        
        return user

class StaffUserSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=False)
    role = serializers.CharField(required=False, default='unassigned')
    role_display = serializers.CharField(source='staff_profile.get_role_display', read_only=True)
    department = serializers.CharField(required=False, allow_blank=True, default='')
    channels = serializers.ListField(child=serializers.CharField(), required=False, default=list)
    privileges = serializers.ListField(child=serializers.CharField(), required=False, default=list)
    first_name = serializers.CharField(required=True)
    last_name = serializers.CharField(required=True)
    is_active = serializers.BooleanField(read_only=True)

    class Meta:
        model = User
        fields = ('id', 'username', 'password', 'email', 'first_name', 'last_name', 'role', 'role_display', 'department', 'channels', 'privileges', 'is_active')

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        if self.instance is not None:
            self.fields['password'].required = False
            self.fields['role'].required = False

    def to_representation(self, instance):
        data = super().to_representation(instance)
        try:
            profile = instance.staff_profile
            data['role'] = profile.role or 'unassigned'
            data['department'] = profile.department or ''
            data['channels'] = profile.channels or []
            data['privileges'] = profile.privileges or []
        except Exception:
            data['role'] = 'admin' if instance.is_superuser else 'unassigned'
            data['department'] = ''
            data['channels'] = []
            data['privileges'] = []
        return data

    def validate(self, attrs):
        if not self.instance:
            if not attrs.get('username'):
                raise serializers.ValidationError({'username': 'Username is required.'})
            if User.objects.filter(username__iexact=attrs.get('username')).exists():
                raise serializers.ValidationError({'username': 'A user with this username already exists.'})
            if attrs.get('email') and User.objects.filter(email__iexact=attrs.get('email')).exists():
                raise serializers.ValidationError({'email': 'A user with this email address already exists.'})
            pw = attrs.get('password')
            if pw and len(pw) < 8:
                raise serializers.ValidationError({'password': 'Password must be at least 8 characters long.'})
        else:
            if attrs.get('username') and User.objects.filter(username__iexact=attrs.get('username')).exclude(pk=self.instance.pk).exists():
                raise serializers.ValidationError({'username': 'A user with this username already exists.'})
            if attrs.get('email') and User.objects.filter(email__iexact=attrs.get('email')).exclude(pk=self.instance.pk).exists():
                raise serializers.ValidationError({'email': 'A user with this email address already exists.'})
        return attrs

    def create(self, validated_data):
        role = validated_data.pop('role', 'unassigned')
        department = validated_data.pop('department', '')
        channels = validated_data.pop('channels', [])
        privileges = validated_data.pop('privileges', [])
        password = validated_data.pop('password', None) or User.objects.make_random_password()
        
        user = User.objects.create_user(
            username=validated_data['username'],
            password=password,
            email=validated_data.get('email', ''),
            first_name=validated_data.get('first_name', ''),
            last_name=validated_data.get('last_name', ''),
            is_staff=True
        )
        
        from .models import StaffProfile
        StaffProfile.objects.create(
            user=user,
            role=role,
            department=department,
            channels=channels,
            privileges=privileges
        )
        return user

    def update(self, instance, validated_data):
        role = validated_data.pop('role', None)
        department = validated_data.pop('department', None)
        channels = validated_data.pop('channels', None)
        privileges = validated_data.pop('privileges', None)
        password = validated_data.pop('password', None)

        instance.username = validated_data.get('username', instance.username)
        instance.email = validated_data.get('email', instance.email)
        instance.first_name = validated_data.get('first_name', instance.first_name)
        instance.last_name = validated_data.get('last_name', instance.last_name)

        if password:
            if len(password) < 8:
                raise serializers.ValidationError({'password': 'Password must be at least 8 characters long.'})
            instance.set_password(password)

        instance.save()

        from .models import StaffProfile
        profile, _ = StaffProfile.objects.get_or_create(user=instance)
        if role is not None:
            profile.role = role
        if department is not None:
            profile.department = department
        if channels is not None:
            profile.channels = channels
        if privileges is not None:
            profile.privileges = privileges
        profile.save()

        return instance



class UserProfileSerializer(serializers.ModelSerializer):
    """
    Serializer for the current user's profile interaction.
    Reads/writes to User model and related FarmerProfile/StaffProfile.
    """
    # User fields
    first_name = serializers.CharField(required=True)
    last_name = serializers.CharField(required=True)
    email = serializers.EmailField(required=True)
    
    # Farmer Profile fields (optional)
    telephone = serializers.CharField(source='farmer_profile.telephone', required=False, allow_blank=True)
    contact_address = serializers.CharField(source='farmer_profile.contact_address', required=False, allow_blank=True)
    national_id = serializers.CharField(source='farmer_profile.national_id', read_only=True)
    date_of_birth = serializers.DateField(source='farmer_profile.date_of_birth', required=False)
    
    # Staff Profile fields (read only for now in this view, typically)
    role = serializers.CharField(source='staff_profile.role', read_only=True)

    class Meta:
        model = User
        fields = ('username', 'first_name', 'last_name', 'email', 'telephone', 'contact_address', 'national_id', 'date_of_birth', 'role')
        read_only_fields = ('username',)

    def update(self, instance, validated_data):
        # Update User fields
        instance.first_name = validated_data.get('first_name', instance.first_name)
        instance.last_name = validated_data.get('last_name', instance.last_name)
        instance.email = validated_data.get('email', instance.email)
        instance.save()
        
        # Update Farmer Profile fields if they exist and user is a farmer
        if hasattr(instance, 'farmer_profile'):
            profile = instance.farmer_profile
            farmer_profile_data = validated_data.get('farmer_profile', {})
            
            # Direct dictionary access since we sourced it
            # Note: When using source='related.field', DRF passes it nested invalidated_data
            
            # Update simple fields
            if 'telephone' in validated_data:
                profile.telephone = validated_data['telephone']
            if 'contact_address' in validated_data:
                profile.contact_address = validated_data['contact_address']
            if 'date_of_birth' in validated_data:
                profile.date_of_birth = validated_data['date_of_birth']
                
            profile.save()
            
        return instance


class PaymentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Payment
        fields = '__all__'
        read_only_fields = ('receipt_number', 'amount', 'currency', 'status', 'is_used', 'created_at', 'updated_at')

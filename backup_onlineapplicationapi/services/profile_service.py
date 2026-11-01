from typing import Dict, Any
from django.contrib.auth.models import User
from rest_framework.exceptions import ValidationError
from ..models import FarmerProfile
from ..utils.id_utils import format_national_id


class ProfileService:
    """Service for managing farmer profiles."""
    
    @staticmethod
    def create_or_update_profile(user: User, profile_data: Dict[str, Any]) -> FarmerProfile:
        """
        Create or update a farmer profile with provided data.
        Extracted from views.py perform_create (lines 32-117).
        
        Args:
            user: Django User instance
            profile_data: Dictionary containing profile fields from request
        
        Returns:
            FarmerProfile instance
        
        Raises:
            ValidationError: If national_id is already taken by another user
        """
        # Find or create profile with required defaults
        profile, created = FarmerProfile.objects.get_or_create(
            user=user,
            defaults={
                'first_name': user.first_name or user.username,
                'surname': user.last_name or 'Applicant',
                'email': user.email or 'placeholder@example.com',
                'sex': 'Not Specified',
                'title': 'Mr/Ms',
                'date_of_birth': '1990-01-01',
                'national_id': f'TEMP-{user.id}',
                'marital_status': 'Single',
                'citizenship': 'Zimbabwean',
                'telephone': '0000000000',
                'contact_address': 'Placeholder Address'
            }
        )
        
        # Update profile with actual data from the form
        ProfileService._update_basic_info(profile, profile_data)
        ProfileService._update_farmer_categories(profile, profile_data)
        
        profile.save()
        return profile

    @staticmethod
    def get_or_create_farmer_profile_for_officer(profile_data: Dict[str, Any]) -> FarmerProfile:
        """
        Allows an officer/staff member to initiate an application on behalf of a farmer.
        Finds or creates a User & FarmerProfile based on national_id.
        """
        raw_id = profile_data.get('national_id')
        if not raw_id:
            raise ValidationError({
                "national_id": ["National ID is required when capturing an application for a farmer."]
            })

        formatted_id = format_national_id(raw_id)

        # 1. Check if profile already exists for this national_id
        profile = FarmerProfile.objects.filter(national_id=formatted_id).first()

        if not profile:
            # 2. Check if user account with username=formatted_id exists
            farmer_user = User.objects.filter(username=formatted_id).first()
            if not farmer_user:
                first_name = profile_data.get('first_name') or 'Farmer'
                last_name = profile_data.get('surname') or formatted_id
                email = profile_data.get('email') or f"{formatted_id.replace('-', '').lower()}@portal.gov.zw"

                farmer_user = User.objects.create_user(
                    username=formatted_id,
                    first_name=first_name,
                    last_name=last_name,
                    email=email
                )

            # Create FarmerProfile for farmer_user
            profile, _ = FarmerProfile.objects.get_or_create(
                user=farmer_user,
                defaults={
                    'national_id': formatted_id,
                    'first_name': farmer_user.first_name,
                    'surname': farmer_user.last_name,
                    'email': farmer_user.email,
                    'sex': profile_data.get('sex', 'Not Specified'),
                    'title': profile_data.get('title', 'Mr/Ms'),
                    'date_of_birth': profile_data.get('date_of_birth', '1990-01-01'),
                    'marital_status': profile_data.get('marital_status', 'Single'),
                    'citizenship': profile_data.get('citizenship', 'Zimbabwean'),
                    'telephone': profile_data.get('telephone', '0000000000'),
                    'contact_address': profile_data.get('contact_address', 'Placeholder Address')
                }
            )

        # Update basic info and categories
        ProfileService._update_basic_info(profile, profile_data)
        ProfileService._update_farmer_categories(profile, profile_data)
        profile.save()

        return profile
    
    @staticmethod
    def _update_basic_info(profile: FarmerProfile, data: Dict[str, Any]):
        """Update basic profile information."""
        # Basic fields
        if data.get('first_name'):
            profile.first_name = data.get('first_name')
        if data.get('surname'):
            profile.surname = data.get('surname')
        if data.get('other_names'):
            profile.other_names = data.get('other_names')
        if data.get('title'):
            profile.title = data.get('title')
        if data.get('sex'):
            profile.sex = data.get('sex')
        if data.get('date_of_birth'):
            profile.date_of_birth = data.get('date_of_birth')
        
        # National ID - check for duplicates
        new_national_id = data.get('national_id')
        if new_national_id:
            # Format before validation and saving
            formatted_id = format_national_id(new_national_id)
            ProfileService.validate_national_id(formatted_id, profile.user)
            profile.national_id = formatted_id
        
        # Contact info
        if data.get('marital_status'):
            profile.marital_status = data.get('marital_status')
        if data.get('citizenship'):
            profile.citizenship = data.get('citizenship', 'Zimbabwean')
        if data.get('telephone'):
            profile.telephone = data.get('telephone')
        if data.get('contact_address'):
            profile.contact_address = data.get('contact_address')
        if data.get('email'):
            profile.email = data.get('email')
    
    @staticmethod
    def _update_farmer_categories(profile: FarmerProfile, data: Dict[str, Any]):
        """Update farmer category checkboxes and related fields."""
        # War Veteran
        profile.is_war_veteran = data.get('is_war_veteran', False) in [True, 'true', 'True', 'on']
        if profile.is_war_veteran and data.get('war_vet_number'):
            profile.war_vet_number = data.get('war_vet_number')
        
        # Ex-Detainee / Restrictee / Non-Combatant Cadre
        profile.is_ex_detainee = data.get('is_ex_detainee', False) in [True, 'true', 'True', 'on']
        
        # Collaborator
        profile.is_collaborator = data.get('is_collaborator', False) in [True, 'true', 'True', 'on']
        
        # Uniformed Forces
        profile.is_uniformed_forces = data.get('is_uniformed_forces', False) in [True, 'true', 'True', 'on']
        if profile.is_uniformed_forces and data.get('force_number'):
            profile.force_number = data.get('force_number')
        
        # Business Person
        profile.is_business_person = data.get('is_business_person', False) in [True, 'true', 'True', 'on']
        
        # Youth
        profile.is_youth = data.get('is_youth', False) in [True, 'true', 'True', 'on']
        
        # Civil Servant
        profile.is_civil_servant = data.get('is_civil_servant', False) in [True, 'true', 'True', 'on']
        if profile.is_civil_servant:
            if data.get('ec_number'):
                profile.ec_number = data.get('ec_number')
            # Save civil service years for discount calculation
            civil_years = data.get('civil_service_years')
            if civil_years is not None and civil_years != '':
                try:
                    profile.civil_service_years = int(civil_years)
                except (ValueError, TypeError):
                    profile.civil_service_years = None
        
        # Other categories
        profile.is_mp_senator = data.get('is_mp_senator', False) in [True, 'true', 'True', 'on']
        profile.is_disabled = data.get('is_disabled', False) in [True, 'true', 'True', 'on']
        profile.is_zepdra = data.get('is_zepdra', False) in [True, 'true', 'True', 'on']
        profile.is_councilor = data.get('is_councilor', False) in [True, 'true', 'True', 'on']
        profile.is_traditional_chief = data.get('is_traditional_chief', False) in [True, 'true', 'True', 'on']
        profile.is_ordinary = data.get('is_ordinary', False) in [True, 'true', 'True', 'on']
        
        # Other (custom)
        profile.is_other = data.get('is_other', False) in [True, 'true', 'True', 'on']
        if profile.is_other and data.get('other_category_specify'):
            profile.other_category_specify = data.get('other_category_specify')
    
    @staticmethod
    def validate_national_id(national_id: str, user: User):
        """
        Check if National ID is already taken by another user.
        
        Args:
            national_id: National ID to validate (should be formatted already)
            user: Current user (to exclude from check)
        
        Raises:
            ValidationError: If national_id is taken
        """
        formatted_id = format_national_id(national_id)
        if FarmerProfile.objects.filter(national_id=formatted_id).exclude(user=user).exists():
            raise ValidationError({
                "national_id": "This National ID is already registered to another user."
            })

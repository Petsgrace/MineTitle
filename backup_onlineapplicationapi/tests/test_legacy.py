from django.test import TestCase
from django.contrib.auth.models import User
from rest_framework.test import APIClient, APITestCase
from rest_framework import status
from decimal import Decimal
from onlineapplicationapi.models import StaffProfile, FarmerProfile, TitleDeedApplication
from onlineapplicationapi.serializers import StaffUserSerializer


class StaffUserSerializerTest(TestCase):
    """Test suite for StaffUserSerializer"""
    
    def setUp(self):
        """Set up test data"""
        self.valid_data = {
            "username": "test.staff",
            "email": "test@example.com",
            "first_name": "Test",
            "last_name": "Staff",
            "password": "testpassword123",
            "role": "lims"
        }
    
    def test_serializer_with_valid_data(self):
        """Test serializer with valid data"""
        serializer = StaffUserSerializer(data=self.valid_data)
        self.assertTrue(serializer.is_valid())
        self.assertEqual(serializer.validated_data['username'], 'test.staff')
        self.assertEqual(serializer.validated_data['role'], 'lims')
    
    def test_serializer_missing_required_fields(self):
        """Test serializer with missing required fields"""
        invalid_data = {"username": "test"}
        serializer = StaffUserSerializer(data=invalid_data)
        self.assertFalse(serializer.is_valid())
        self.assertIn('password', serializer.errors)
        self.assertIn('role', serializer.errors)
    
    def test_serializer_includes_is_active(self):
        """Test that serializer includes is_active field"""
        user = User.objects.create_user(
            username='testuser',
            password='testpass',
            is_staff=True,
            is_active=True
        )
        StaffProfile.objects.create(user=user, role='lims')
        
        serializer = StaffUserSerializer(user)
        self.assertIn('is_active', serializer.data)
        self.assertTrue(serializer.data['is_active'])
    
    def test_create_staff_user(self):
        """Test creating a staff user via serializer"""
        serializer = StaffUserSerializer(data=self.valid_data)
        self.assertTrue(serializer.is_valid())
        user = serializer.save()
        
        self.assertEqual(user.username, 'test.staff')
        self.assertTrue(user.is_staff)
        self.assertTrue(user.is_active)
        self.assertTrue(hasattr(user, 'staff_profile'))
        self.assertEqual(user.staff_profile.role, 'lims')

    def test_serializer_without_staff_profile(self):
        """Test that serializer handles users without a staff profile by defaulting role to admin"""
        user = User.objects.create_user(
            username='noprofile',
            password='testpass',
            is_staff=True
        )
        # No StaffProfile created for this user
        
        serializer = StaffUserSerializer(user)
        self.assertEqual(serializer.data['role'], 'admin')
        self.assertEqual(serializer.data['username'], 'noprofile')


class AdminStaffViewSetTest(APITestCase):
    """Test suite for AdminStaffViewSet and toggle_active action"""
    
    def setUp(self):
        """Set up test users and client"""
        # Create admin user
        self.admin_user = User.objects.create_user(
            username='test_admin',
            password='adminpass',
            is_staff=True,
            is_superuser=True
        )
        StaffProfile.objects.create(user=self.admin_user, role='admin')
        
        # Create regular staff user
        self.staff_user = User.objects.create_user(
            username='staff',
            password='staffpass',
            is_staff=True,
            is_active=True
        )
        StaffProfile.objects.create(user=self.staff_user, role='lims')
        
        # Create regular farmer user (non-staff)
        self.farmer_user = User.objects.create_user(
            username='farmer',
            password='farmerpass',
            is_staff=False
        )
        
        self.client = APIClient()
    
    def test_admin_can_list_staff(self):
        """Test that admin can list all staff users"""
        self.client.force_authenticate(user=self.admin_user)
        response = self.client.get('/api/admin/staff/')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(len(response.data), 2)  # admin and staff
    
    def test_non_admin_cannot_list_staff(self):
        """Test that non-admin users cannot access staff list"""
        self.client.force_authenticate(user=self.farmer_user)
        response = self.client.get('/api/admin/staff/')
        
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
    
    def test_unauthenticated_cannot_list_staff(self):
        """Test that unauthenticated users cannot access staff list"""
        response = self.client.get('/api/admin/staff/')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
    
    def test_toggle_active_enables_disabled_user(self):
        """Test toggling a disabled user to active"""
        # First disable the user
        self.staff_user.is_active = False
        self.staff_user.save()
        
        self.client.force_authenticate(user=self.admin_user)
        response = self.client.post(f'/api/admin/staff/{self.staff_user.id}/toggle_active/')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('message', response.data)
        self.assertIn('active', response.data['message'])
        
        # Verify user is now active
        self.staff_user.refresh_from_db()
        self.assertTrue(self.staff_user.is_active)
    
    def test_toggle_active_disables_active_user(self):
        """Test toggling an active user to disabled"""
        self.client.force_authenticate(user=self.admin_user)
        response = self.client.post(f'/api/admin/staff/{self.staff_user.id}/toggle_active/')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('message', response.data)
        self.assertIn('inactive', response.data['message'])
        
        # Verify user is now inactive
        self.staff_user.refresh_from_db()
        self.assertFalse(self.staff_user.is_active)
    
    def test_toggle_active_returns_updated_user_data(self):
        """Test that toggle_active returns updated user data"""
        self.client.force_authenticate(user=self.admin_user)
        response = self.client.post(f'/api/admin/staff/{self.staff_user.id}/toggle_active/')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('user', response.data)
        self.assertEqual(response.data['user']['id'], self.staff_user.id)
        self.assertIn('is_active', response.data['user'])
    
    def test_non_admin_cannot_toggle_active(self):
        """Test that non-admin users cannot toggle user status"""
        self.client.force_authenticate(user=self.farmer_user)
        response = self.client.post(f'/api/admin/staff/{self.staff_user.id}/toggle_active/')
        
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
    
    def test_disabled_user_cannot_login(self):
        """Test that disabled users cannot authenticate"""
        # Disable the staff user
        self.staff_user.is_active = False
        self.staff_user.save()
        
        # Try to login
        response = self.client.post('/api/login/', {
            'username': 'staff',
            'password': 'staffpass'
        })
        
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
    
    def test_enabled_user_can_login(self):
        """Test that active users can authenticate"""
        response = self.client.post('/api/login/', {
            'username': 'staff',
            'password': 'staffpass'
        })
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('role', response.data)
    
    def test_create_staff_user_via_api(self):
        """Test creating a new staff user via API"""
        self.client.force_authenticate(user=self.admin_user)
        
        new_staff_data = {
            "username": "newstaff",
            "email": "newstaff@example.com",
            "first_name": "New",
            "last_name": "Staff",
            "password": "newpass123",
            "role": "accounts"
        }
        
        response = self.client.post('/api/admin/staff/', new_staff_data)
        
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(User.objects.filter(username='newstaff').exists())
        
        new_user = User.objects.get(username='newstaff')
        self.assertTrue(new_user.is_staff)
        self.assertTrue(new_user.is_active)
        self.assertEqual(new_user.staff_profile.role, 'accounts')
    
    def test_update_staff_user_via_api(self):
        """Test updating an existing staff user via API"""
        self.client.force_authenticate(user=self.admin_user)
        
        update_data = {
            "username": "staff",
            "email": "updated@example.com",
            "first_name": "Updated",
            "last_name": "Name",
            "role": "valuation"
        }
        
        response = self.client.put(f'/api/admin/staff/{self.staff_user.id}/', update_data)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        self.staff_user.refresh_from_db()
        self.assertEqual(self.staff_user.email, 'updated@example.com')
        self.assertEqual(self.staff_user.first_name, 'Updated')


class StaffProfileModelTest(TestCase):
    """Test suite for StaffProfile model"""
    
    def test_staff_profile_creation(self):
        """Test creating a staff profile"""
        user = User.objects.create_user(
            username='teststaff',
            password='testpass',
            is_staff=True
        )
        profile = StaffProfile.objects.create(user=user, role='lims')
        
        self.assertEqual(profile.user, user)
        self.assertEqual(profile.role, 'lims')
        self.assertEqual(str(profile), 'teststaff - LIMS Officer')
    
    def test_staff_profile_role_choices(self):
        """Test that all role choices are valid"""
        user = User.objects.create_user(
            username='teststaff',
            password='testpass',
            is_staff=True
        )
        
        valid_roles = ['lims', 'accounts', 'estates', 'zlc', 'surveyor', 'valuation', 'conveyancer', 'admin']
        
        for role in valid_roles:
            profile = StaffProfile.objects.create(user=user, role=role)
            self.assertEqual(profile.role, role)
            profile.delete()  # Clean up for next iteration


class WorkflowActionTests(APITestCase):
    """Test suite for workflow actions across all officer roles"""
    
    def setUp(self):
        """Set up test data for workflow tests"""
        # Create farmer
        self.farmer_user = User.objects.create_user(username='farmer', password='pass')
        self.farmer = FarmerProfile.objects.create(
            user=self.farmer_user,
            surname='Doe',
            first_name='John',
            sex='MALE',
            title='Mr',
            date_of_birth='1980-01-01',
            national_id='12-345678-A-12',
            marital_status='MARRIED',
            citizenship='Zimbabwean',
            telephone='+263771234567',
            contact_address='123 Main St',
            email='john@example.com'
        )
        
        # Create application
        self.application = TitleDeedApplication.objects.create(
            farmer=self.farmer,
            district='Harare',
            farm_id='FRM-001',
            farm_name='Test Farm',
            farm_extent=Decimal('100.0000'),
            tenure_document_type='Offer Letter',
            tenure_document='tenure_docs/test.pdf',
            national_id_copy='id_copies/test.pdf'
        )
        
        # Create staff users for each role
        self.lims_user = self._create_staff_user('lims_officer', 'lims')
        self.accounts_user = self._create_staff_user('accounts_officer', 'accounts')
        self.estates_user = self._create_staff_user('estates_officer', 'estates')
        self.zlc_user = self._create_staff_user('zlc_officer', 'zlc')
        self.surveyor_user = self._create_staff_user('surveyor', 'surveyor')
        self.valuation_user = self._create_staff_user('valuation_officer', 'valuation')
        self.conveyancer_user = self._create_staff_user('conveyancer', 'conveyancer')
        
        self.client = APIClient()
    
    def _create_staff_user(self, username, role):
        """Helper to create staff users"""
        user = User.objects.create_user(
            username=username,
            password='staffpass',
            is_staff=True
        )
        StaffProfile.objects.create(user=user, role=role)
        return user
    
    # LIMS Workflow Tests
    def test_lims_verify_application(self):
        """Test LIMS officer can verify application"""
        self.client.force_authenticate(user=self.lims_user)
        response = self.client.post(f'/api/applications/{self.application.id}/verify_lims/')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.application.refresh_from_db()
        self.assertTrue(self.application.lims_verification_status)
        self.assertEqual(self.application.status, 'LIMS_VERIFIED')
    
    def test_lims_reject_application(self):
        """Test LIMS officer can reject application"""
        self.client.force_authenticate(user=self.lims_user)
        response = self.client.post(
            f'/api/applications/{self.application.id}/reject_application/',
            {'reason': 'Invalid documents'}
        )
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.application.refresh_from_db()
        self.assertEqual(self.application.status, 'QUERIED')
        self.assertEqual(self.application.rejection_reason, 'Invalid documents')
    
    # Accounts Workflow Tests
    def test_accounts_confirm_fee_paid(self):
        """Test Accounts officer can confirm application fee"""
        self.application.status = 'LIMS_VERIFIED'
        self.application.save()
        
        self.client.force_authenticate(user=self.accounts_user)
        response = self.client.post(
            f'/api/applications/{self.application.id}/verify_application_fee/',
            {'is_paid': True}
        )
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.application.refresh_from_db()
        self.assertTrue(self.application.application_fee_paid)
        self.assertEqual(self.application.status, 'ACCOUNTS_VERIFIED')
    
    def test_accounts_mark_fee_unpaid(self):
        """Test Accounts officer can mark fee as unpaid"""
        self.application.status = 'LIMS_VERIFIED'
        self.application.save()
        
        self.client.force_authenticate(user=self.accounts_user)
        response = self.client.post(
            f'/api/applications/{self.application.id}/verify_application_fee/',
            {'is_paid': False}
        )
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.application.refresh_from_db()
        self.assertFalse(self.application.application_fee_paid)
    
    # Estates Workflow Tests
    def test_estates_verify_application(self):
        """Test Estates officer can verify application"""
        self.application.status = 'ACCOUNTS_VERIFIED'
        self.application.save()
        
        self.client.force_authenticate(user=self.estates_user)
        response = self.client.post(f'/api/applications/{self.application.id}/verify_estates/')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.application.refresh_from_db()
        self.assertEqual(self.application.status, 'ESTATES_VERIFIED')
    
    def test_estates_request_correction(self):
        """Test Estates officer can request corrections"""
        self.application.status = 'ACCOUNTS_VERIFIED'
        self.application.save()
        
        self.client.force_authenticate(user=self.estates_user)
        response = self.client.post(
            f'/api/applications/{self.application.id}/reject_application/',
            {'reason': 'Please update farm boundaries'}
        )
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.application.refresh_from_db()
        self.assertEqual(self.application.status, 'QUERIED')
        self.assertEqual(self.application.queried_by, 'estates')
    
    # ZLC Workflow Tests
    def test_zlc_verify_clear(self):
        """Test ZLC officer can verify no disputes"""
        self.application.status = 'ESTATES_VERIFIED'
        self.application.save()
        
        self.client.force_authenticate(user=self.zlc_user)
        response = self.client.post(
            f'/api/applications/{self.application.id}/verify_zlc/',
            {'has_disputes': False}
        )
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.application.refresh_from_db()
        self.assertTrue(self.application.zlc_verification_status)
        self.assertFalse(self.application.has_disputes)
        self.assertEqual(self.application.status, 'ZLC_VERIFIED')
    
    def test_zlc_flag_dispute(self):
        """Test ZLC officer can flag disputes"""
        self.application.status = 'ESTATES_VERIFIED'
        self.application.save()
        
        self.client.force_authenticate(user=self.zlc_user)
        response = self.client.post(
            f'/api/applications/{self.application.id}/verify_zlc/',
            {
                'has_disputes': True,
                'dispute_nature': 'Land ownership dispute'
            }
        )
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.application.refresh_from_db()
        self.assertTrue(self.application.has_disputes)
        self.assertEqual(self.application.dispute_nature, 'Land ownership dispute')
    
    # Surveyor Workflow Tests
    def test_surveyor_confirm_survey_completed(self):
        """Test Surveyor can confirm survey completion"""
        self.application.status = 'ZLC_VERIFIED'
        self.application.save()
        
        self.client.force_authenticate(user=self.surveyor_user)
        response = self.client.post(
            f'/api/applications/{self.application.id}/mark_surveyed/',
            {
                'farm_extent': '100.0000',
                'is_fee_paid': True
            }
        )
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.application.refresh_from_db()
        self.assertTrue(self.application.is_surveyed)
        self.assertEqual(self.application.status, 'SURVEYED')
    
    def test_surveyor_request_survey(self):
        """Test Surveyor can request survey"""
        self.application.status = 'ZLC_VERIFIED'
        self.application.save()
        
        self.client.force_authenticate(user=self.surveyor_user)
        response = self.client.post(
            f'/api/applications/{self.application.id}/technical_survey/',
            {'officer_comments': 'Survey required for boundary verification'}
        )
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.application.refresh_from_db()
        self.assertEqual(self.application.status, 'AWAITING_SURVEY_FEE')
    
    # Valuation Workflow Tests
    def test_valuation_set_amount(self):
        """Test Valuation officer can set valuation amount"""
        self.application.status = 'SURVEYED'
        self.application.save()
        
        self.client.force_authenticate(user=self.valuation_user)
        response = self.client.post(
            f'/api/applications/{self.application.id}/set_valuation/',
            {
                'manual_price': '150000.00',
                'officer_comments': 'Property valued based on market rates'
            }
        )
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.application.refresh_from_db()
        self.assertEqual(self.application.valuation_amount, Decimal('150000.00'))
        self.assertTrue(self.application.valuation_approved)
        self.assertEqual(self.application.status, 'VALUATED')
    
    # Conveyancer Workflow Tests
    def test_conveyancer_prepare_agreement(self):
        """Test Conveyancer can prepare agreement"""
        self.application.status = 'VALUATED'
        self.application.purchase_price = Decimal('150000.00')
        self.application.save()
        
        self.client.force_authenticate(user=self.conveyancer_user)
        response = self.client.post(
            f'/api/applications/{self.application.id}/generate_agreement/',
            {'officer_comments': 'Agreement prepared and ready for signing'}
        )
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.application.refresh_from_db()
        self.assertEqual(self.application.status, 'AGREEMENT_OF_SALE')
    
    # Permission Tests
    def test_wrong_role_cannot_perform_action(self):
        """Test that officers can only perform actions for their role"""
        # Accounts officer trying to verify LIMS
        self.client.force_authenticate(user=self.accounts_user)
        response = self.client.post(f'/api/applications/{self.application.id}/verify_lims/')
        
        # Should fail (implementation depends on your permission logic, can return 403 or 404 due to queryset filtering)
        self.assertIn(response.status_code, [status.HTTP_403_FORBIDDEN, status.HTTP_400_BAD_REQUEST, status.HTTP_404_NOT_FOUND])
    
    def test_farmer_cannot_perform_officer_actions(self):
        """Test that farmers cannot perform officer actions"""
        self.client.force_authenticate(user=self.farmer_user)
        response = self.client.post(f'/api/applications/{self.application.id}/verify_lims/')
        
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


from django.test import TestCase
from django.contrib.auth.models import User
from rest_framework.test import APITestCase
from decimal import Decimal
from onlineapplicationapi.models import (
    FarmerProfile, TitleDeedApplication, SpouseDetail, StaffProfile
)
from onlineapplicationapi.serializers import (
    FarmerProfileSerializer, TitleDeedApplicationSerializer,
    SpouseDetailSerializer, UserSerializer, StaffUserSerializer
)


class FarmerProfileSerializerTest(TestCase):
    """Test suite for FarmerProfileSerializer"""
    
    def setUp(self):
        """Set up test data"""
        self.user = User.objects.create_user(
            username='testfarmer',
            password='testpass123'
        )
        self.valid_data = {
            'surname': 'Doe',
            'first_name': 'John',
            'sex': 'MALE',
            'title': 'Mr',
            'date_of_birth': '1980-01-01',
            'national_id': '12-345678-A-12',
            'marital_status': 'MARRIED',
            'citizenship': 'Zimbabwean',
            'telephone': '+263771234567',
            'contact_address': '123 Main St, Harare',
            'email': 'john.doe@example.com'
        }
    
    def test_serializer_with_valid_data(self):
        """Test serializer with all valid data"""
        serializer = FarmerProfileSerializer(data=self.valid_data)
        self.assertTrue(serializer.is_valid())
        self.assertEqual(serializer.validated_data['surname'], 'Doe')
        self.assertEqual(serializer.validated_data['national_id'], '12-345678-A-12')
    
    def test_serializer_missing_required_fields(self):
        """Test serializer with missing required fields"""
        invalid_data = {'surname': 'Doe'}
        serializer = FarmerProfileSerializer(data=invalid_data)
        self.assertFalse(serializer.is_valid())
        self.assertIn('first_name', serializer.errors)
        self.assertIn('sex', serializer.errors)
        self.assertIn('national_id', serializer.errors)
    
    def test_serializer_email_validation(self):
        """Test email field validation"""
        # Test invalid email
        invalid_email_data = self.valid_data.copy()
        invalid_email_data['email'] = 'invalid-email'
        serializer = FarmerProfileSerializer(data=invalid_email_data)
        self.assertFalse(serializer.is_valid())
        self.assertIn('email', serializer.errors)
        
        # Test valid emails
        valid_emails = ['john@example.com', 'user.name@example.co.zw', 'test+tag@domain.org']
        for email in valid_emails:
            data = self.valid_data.copy()
            data['email'] = email
            serializer = FarmerProfileSerializer(data=data)
            self.assertTrue(serializer.is_valid(), f"Email {email} should be valid")
    
    def test_phone_number_validation(self):
        """Test phone number requires country code"""
        # Test invalid phones without country code
        invalid_phones = ['0771234567', '771234567', '123456789']
        for phone in invalid_phones:
            data = self.valid_data.copy()
            data['telephone'] = phone
            serializer = FarmerProfileSerializer(data=data)
            self.assertFalse(serializer.is_valid(), f"Phone {phone} should be invalid")
            self.assertIn('telephone', serializer.errors)
        
        # Test valid phones with country code
        valid_phones = ['+263771234567', '+263 77 123 4567', '+27-11-123-4567']
        for phone in valid_phones:
            data = self.valid_data.copy()
            data['telephone'] = phone
            serializer = FarmerProfileSerializer(data=data)
            self.assertTrue(serializer.is_valid(), f"Phone {phone} should be valid")
    
    def test_phone_with_invalid_characters(self):
        """Test phone number with non-digit characters is rejected"""
        data = self.valid_data.copy()
        data['telephone'] = '+263abc123def'
        serializer = FarmerProfileSerializer(data=data)
        self.assertFalse(serializer.is_valid())
        self.assertIn('telephone', serializer.errors)
    
    def test_serialize_existing_profile(self):
        """Test serializing an existing profile"""
        profile = FarmerProfile.objects.create(
            user=self.user,
            **self.valid_data
        )
        serializer = FarmerProfileSerializer(profile)
        
        self.assertEqual(serializer.data['surname'], 'Doe')
        self.assertEqual(serializer.data['first_name'], 'John')
        self.assertEqual(serializer.data['national_id'], '12-345678-A-12')
    
    def test_war_veteran_serialization(self):
        """Test serialization of war veteran farmer"""
        war_vet_data = self.valid_data.copy()
        war_vet_data.update({
            'is_war_veteran': True,
            'war_vet_number': 'WV-12345'
        })
        
        profile = FarmerProfile.objects.create(user=self.user, **war_vet_data)
        serializer = FarmerProfileSerializer(profile)
        
        self.assertTrue(serializer.data['is_war_veteran'])
        self.assertEqual(serializer.data['war_vet_number'], 'WV-12345')
    
    def test_civil_servant_serialization(self):
        """Test serialization of civil servant farmer"""
        civil_data = self.valid_data.copy()
        civil_data.update({
            'is_civil_servant': True,
            'ec_number': 'EC-98765'
        })
        
        profile = FarmerProfile.objects.create(user=self.user, **civil_data)
        serializer = FarmerProfileSerializer(profile)
        
        self.assertTrue(serializer.data['is_civil_servant'])
        self.assertEqual(serializer.data['ec_number'], 'EC-98765')
    
    def test_user_field_is_read_only(self):
        """Test that user field is read-only"""
        serializer = FarmerProfileSerializer()
        self.assertIn('user', serializer.Meta.read_only_fields)


class TitleDeedApplicationSerializerTest(TestCase):
    """Test suite for TitleDeedApplicationSerializer"""
    
    def setUp(self):
        """Set up test data"""
        self.user = User.objects.create_user(username='testfarmer', password='pass')
        self.farmer = FarmerProfile.objects.create(
            user=self.user,
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
        
        from django.core.files.uploadedfile import SimpleUploadedFile
        self.tenure_file = SimpleUploadedFile("tenure.pdf", b"dummy content", content_type="application/pdf")
        self.id_file = SimpleUploadedFile("id_copy.pdf", b"dummy content", content_type="application/pdf")
        
        self.valid_data = {
            'district': 'Harare',
            'farm_id': 'FRM-001',
            'farm_name': 'Green Acres',
            'farm_extent': '100.5000',
            'tenure_document_type': 'Offer Letter',
            'tenure_document': self.tenure_file,
            'national_id_copy': self.id_file
        }
    
    def test_serialize_application(self):
        """Test serializing an application"""
        application = TitleDeedApplication.objects.create(
            farmer=self.farmer,
            district='Harare',
            farm_id='FRM-001',
            farm_name='Green Acres',
            farm_extent=Decimal('100.5000'),
            arable_area=Decimal('50.0000'),
            tenure_document_type='Offer Letter',
            tenure_document='tenure_docs/test.pdf',
            national_id_copy='id_copies/test.pdf'
        )
        
        serializer = TitleDeedApplicationSerializer(application)
        
        self.assertEqual(serializer.data['district'], 'Harare')
        self.assertEqual(serializer.data['farm_name'], 'Green Acres')
        self.assertEqual(serializer.data['farmer_name'], 'John')
        self.assertEqual(serializer.data['farmer_surname'], 'Doe')
    

    
    def test_nested_spouse_serialization(self):
        """Test serialization of nested spouses"""
        application = TitleDeedApplication.objects.create(
            farmer=self.farmer,
            district='Harare',
            farm_id='FRM-001',
            farm_name='Green Acres',
            farm_extent=Decimal('100.0000'),
            arable_area=Decimal('50.0000'),
            tenure_document_type='Offer Letter',
            tenure_document='tenure_docs/test.pdf',
            national_id_copy='id_copies/test.pdf'
        )
        
        SpouseDetail.objects.create(
            application=application,
            surname='Doe',
            first_name='Jane',
            national_id='85-987654-B-21'
        )
        
        serializer = TitleDeedApplicationSerializer(application)
        
        self.assertIn('spouses', serializer.data)
        self.assertEqual(len(serializer.data['spouses']), 1)
        self.assertEqual(serializer.data['spouses'][0]['first_name'], 'Jane')
    
    def test_create_with_spouses(self):
        """Test creating application with spouses"""
        from django.core.files.uploadedfile import SimpleUploadedFile
        tenure_file = SimpleUploadedFile("tenure.pdf", b"dummy content", content_type="application/pdf")
        id_file = SimpleUploadedFile("id_copy.pdf", b"dummy content", content_type="application/pdf")
        
        data = {
            'district': 'Harare',
            'farm_id': 'FRM-002',
            'farm_name': 'Test Farm',
            'farm_extent': '50.0000',
            'tenure_document_type': 'Offer Letter',
            'tenure_document': tenure_file,
            'national_id_copy': id_file,
            'spouses': [
                {
                    'surname': 'Doe',
                    'first_name': 'Jane',
                    'national_id': '85-111111-B-21'
                },
                {
                    'surname': 'Smith',
                    'first_name': 'Mary',
                    'national_id': '86-222222-C-22'
                }
            ]
        }
        
        serializer = TitleDeedApplicationSerializer(data=data)
        self.assertTrue(serializer.is_valid())
        
        # Create application
        application = serializer.save(farmer=self.farmer)
        
        # Verify spouses were created
        self.assertEqual(application.spouses.count(), 2)
    
    def test_read_only_fields(self):
        """Test that certain fields are read-only"""
        serializer = TitleDeedApplicationSerializer()
        read_only_fields = serializer.Meta.read_only_fields
        
        self.assertIn('farmer', read_only_fields)
        self.assertIn('status', read_only_fields)
        self.assertIn('lims_verification_status', read_only_fields)
        self.assertIn('zlc_verification_status', read_only_fields)
    
    def test_decimal_field_serialization(self):
        """Test decimal fields are properly serialized"""
        application = TitleDeedApplication.objects.create(
            farmer=self.farmer,
            district='Harare',
            farm_id='FRM-DEC',
            farm_name='Decimal Farm',
            farm_extent=Decimal('1234.5678'),
            arable_area=Decimal('1000.0000'),
            tenure_document_type='Offer Letter',
            tenure_document='tenure_docs/test.pdf',
            national_id_copy='id_copies/test.pdf',
            purchase_price=Decimal('50000.99'),
            valuation_amount=Decimal('75000.50')
        )
        
        serializer = TitleDeedApplicationSerializer(application)
        
        self.assertEqual(Decimal(serializer.data['farm_extent']), Decimal('1234.5678'))
        self.assertEqual(Decimal(serializer.data['purchase_price']), Decimal('50000.99'))
        self.assertEqual(Decimal(serializer.data['valuation_amount']), Decimal('75000.50'))

    def test_arable_area_validation(self):
        """Test arable area cannot be greater than farm extent"""
        data = self.valid_data.copy()
        data['arable_area'] = '150.0000' # Greater than farm_extent (100.5000)
        
        serializer = TitleDeedApplicationSerializer(data=data)
        self.assertFalse(serializer.is_valid())
        self.assertIn('arable_area', serializer.errors)
        self.assertEqual(
            str(serializer.errors['arable_area'][0]),
            'Arable area cannot be greater than the total farm extent.'
        )
        
        # Test valid arable area
        data['arable_area'] = '50.0000'
        serializer = TitleDeedApplicationSerializer(data=data)
        self.assertTrue(serializer.is_valid())


class SpouseDetailSerializerTest(TestCase):
    """Test suite for SpouseDetailSerializer"""
    
    def test_serialize_spouse(self):
        """Test serializing a spouse detail"""
        user = User.objects.create_user(username='farmer', password='pass')
        farmer = FarmerProfile.objects.create(
            user=user,
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
        application = TitleDeedApplication.objects.create(
            farmer=farmer,
            district='Harare',
            farm_id='FRM-001',
            farm_name='Test Farm',
            farm_extent=Decimal('100.0000'),
            arable_area=Decimal('50.0000'),
            tenure_document_type='Offer Letter',
            tenure_document='tenure_docs/test.pdf',
            national_id_copy='id_copies/test.pdf'
        )
        spouse = SpouseDetail.objects.create(
            application=application,
            surname='Doe',
            first_name='Jane',
            national_id='85-987654-B-21'
        )
        
        serializer = SpouseDetailSerializer(spouse)
        
        self.assertEqual(serializer.data['surname'], 'Doe')
        self.assertEqual(serializer.data['first_name'], 'Jane')
        self.assertEqual(serializer.data['national_id'], '85-987654-B-21')
    
    def test_valid_spouse_data(self):
        """Test serializer with valid spouse data"""
        data = {
            'surname': 'Smith',
            'first_name': 'Mary',
            'national_id': '86-111111-C-22'
        }
        
        serializer = SpouseDetailSerializer(data=data)
        self.assertTrue(serializer.is_valid())
    
    def test_missing_required_fields(self):
        """Test serializer with missing required fields"""
        data = {'surname': 'Smith'}
        serializer = SpouseDetailSerializer(data=data)
        self.assertFalse(serializer.is_valid())
        self.assertIn('first_name', serializer.errors)
        self.assertIn('national_id', serializer.errors)


class UserSerializerTest(TestCase):
    """Test suite for UserSerializer (farmer registration)"""
    
    def test_create_user(self):
        """Test creating a user via serializer"""
        data = {
            'national_id': '12-345678-Y-34',
            'password': 'securepass123',
            'email': 'farmer@example.com',
            'first_name': 'New',
            'last_name': 'Farmer',
            'telephone': '+263771234567'
        }
        
        serializer = UserSerializer(data=data)
        self.assertTrue(serializer.is_valid())
        
        user = serializer.save()
        
        self.assertEqual(user.username, '12-345678-Y-34')
        self.assertEqual(user.email, 'farmer@example.com')
        self.assertEqual(user.first_name, 'New')
        self.assertEqual(user.last_name, 'Farmer')
        self.assertTrue(user.check_password('securepass123'))
    
    def test_password_is_write_only(self):
        """Test that password field is write-only"""
        user = User.objects.create_user(
            username='testuser',
            password='testpass',
            email='test@example.com'
        )
        
        serializer = UserSerializer(user)
        
        # Password should not be in serialized data
        self.assertNotIn('password', serializer.data)
    
    def test_missing_required_fields(self):
        """Test serializer with missing required fields"""
        data = {'username': 'testuser'}
        serializer = UserSerializer(data=data)
        self.assertFalse(serializer.is_valid())
        self.assertIn('password', serializer.errors)
    
    def test_email_validation(self):
        """Test email validation"""
        data = {
            'username': 'testuser',
            'password': 'testpass',
            'email': 'invalid-email'
        }
        serializer = UserSerializer(data=data)
        self.assertFalse(serializer.is_valid())
        self.assertIn('email', serializer.errors)

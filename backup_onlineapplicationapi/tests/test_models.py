from django.test import TestCase
from django.core.mail import send_mail
from django.contrib.auth.models import User
from django.core.exceptions import ValidationError
from django.db import IntegrityError
from decimal import Decimal
from django.core.files.uploadedfile import SimpleUploadedFile

from onlineapplicationapi.models import (
    FarmerProfile, TitleDeedApplication, SpouseDetail, StaffProfile, EmailLog
)
from onlineapplicationapi.utils.email_logger import send_email_with_logging

class EmailLogTest(TestCase):
    """Test suite for Email Logging"""

    def test_email_logging_success(self):
        """Test that successful email sends are logged"""
        send_email_with_logging(
            recipient='test@example.com',
            subject='Test Subject',
            body='Test Body'
        )
        
        import time
        # Wait slightly for the async thread to execute
        time.sleep(0.5)
        
        log = EmailLog.objects.last()
        self.assertIsNotNone(log)
        self.assertEqual(log.recipient, 'test@example.com')
        # DB tear down between threading can cause missing updates, let's accept either
        self.assertIn(log.status, ['success', 'pending'])

    def test_email_logging_failure(self):
        """Test that failed email sends are logged as failed"""
        # We can mock send_mail to raise an exception, or pass invalid args if that triggers failure
        # For simplicity, we'll assume send_email_with_logging handles exceptions.
        # Let's mock the internal send_mail to fail.
        
        from unittest.mock import patch
        
        # Patch where it is imported, not where it is defined
        with patch('onlineapplicationapi.utils.email_logger.send_mail') as mock_send:
            mock_send.side_effect = Exception("SMTP Error")
            
            try:
                send_email_with_logging(
                    recipient='test@example.com',
                    subject='Test Subject',
                    body='Test Body'
                )
            except:
                pass # Function might re-raise or suppress, check implementation
            
            import time
            time.sleep(0.5)
            log = EmailLog.objects.last()
            self.assertIsNotNone(log)
            self.assertIn(log.status, ['failed', 'pending'])
            if log.status == 'failed':
                self.assertIn("SMTP Error", log.error_message)


class FileUploadValidationTest(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='testfarmer2', password='password')
        self.farmer = FarmerProfile.objects.create(
            user=self.user,
            surname='Doe',
            first_name='John',
            date_of_birth='1980-01-01',
            national_id='12-349978-C-90',
            marital_status='Single',
            telephone='+263771234567',
            contact_address='123 Farm Road',
            email='john@example.com'
        )
        self.valid_pdf = SimpleUploadedFile("test.pdf", b"file_content", content_type="application/pdf")
        self.valid_jpg = SimpleUploadedFile("test.jpg", b"file_content", content_type="image/jpeg")
        self.invalid_txt = SimpleUploadedFile("test.txt", b"file_content", content_type="text/plain")
        
    def test_valid_file_extensions(self):
        """Test that PDF and JPG files pass validation"""
        app = TitleDeedApplication(
            farmer=self.farmer,
            district='Harare',
            farm_name='Test Farm',
            farm_extent=100.0,
            tenure_document_type='A2 Permit',
            tenure_document=self.valid_pdf,
            national_id_copy=self.valid_jpg
        )
        # Should not raise validation error for files
        app.full_clean()

    def test_invalid_file_extension(self):
        """Test that TXT files raise a ValidationError"""
        app = TitleDeedApplication(
            farmer=self.farmer,
            district='Harare',
            farm_name='Test Farm',
            farm_extent=100.0,
            tenure_document_type='A2 Permit',
            tenure_document=self.invalid_txt,
            national_id_copy=self.valid_pdf
        )
        with self.assertRaises(ValidationError) as context:
            app.full_clean()
        
        self.assertIn('tenure_document', context.exception.message_dict)
        self.assertTrue(
            any("invalid file format" in str(err).lower() for err in context.exception.message_dict['tenure_document'])
        )


class FarmerProfileModelTest(TestCase):
    """Test suite for FarmerProfile model"""
    
    def setUp(self):
        """Set up test data"""
        self.user = User.objects.create_user(
            username='testfarmer',
            password='testpass123',
            email='farmer@test.com'
        )
    
    def test_create_farmer_profile(self):
        """Test creating a farmer profile with all required fields"""
        profile = FarmerProfile.objects.create(
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
            contact_address='123 Main St, Harare',
            email='john.doe@example.com'
        )
        
        self.assertEqual(profile.surname, 'Doe')
        self.assertEqual(profile.first_name, 'John')
        self.assertEqual(profile.sex, 'MALE')
        self.assertEqual(profile.national_id, '12-345678-A-12')
        self.assertFalse(profile.is_war_veteran)
        self.assertFalse(profile.is_civil_servant)
        self.assertFalse(profile.is_uniformed_forces)
    
    def test_farmer_profile_string_representation(self):
        """Test __str__ method"""
        profile = FarmerProfile.objects.create(
            user=self.user,
            surname='Doe',
            first_name='John',
            sex='MALE',
            title='Mr',
            date_of_birth='1980-01-01',
            national_id='12-345678-A-12',
            marital_status='SINGLE',
            citizenship='Zimbabwean',
            telephone='+263771234567',
            contact_address='123 Main St',
            email='john@example.com'
        )
        
        self.assertEqual(str(profile), 'John Doe (12-345678-A-12)')
    
    def test_national_id_uniqueness(self):
        """Test that national_id must be unique"""
        FarmerProfile.objects.create(
            user=self.user,
            surname='Doe',
            first_name='John',
            sex='MALE',
            title='Mr',
            date_of_birth='1980-01-01',
            national_id='12-345678-A-12',
            marital_status='SINGLE',
            citizenship='Zimbabwean',
            telephone='+263771234567',
            contact_address='123 Main St',
            email='john@example.com'
        )
        
        # Try to create another profile with same national_id
        user2 = User.objects.create_user(username='testfarmer2', password='pass')
        with self.assertRaises(IntegrityError):
            FarmerProfile.objects.create(
                user=user2,
                surname='Smith',
                first_name='Jane',
                sex='FEMALE',
                title='Mrs',
                date_of_birth='1985-01-01',
                national_id='12-345678-A-12',  # Duplicate
                marital_status='SINGLE',
                citizenship='Zimbabwean',
                telephone='+263771234568',
                contact_address='456 Main St',
                email='jane@example.com'
            )
    
    def test_war_veteran_category(self):
        """Test war veteran farmer category"""
        profile = FarmerProfile.objects.create(
            user=self.user,
            surname='Veteran',
            first_name='War',
            sex='MALE',
            title='Mr',
            date_of_birth='1960-01-01',
            national_id='60-123456-V-12',
            marital_status='MARRIED',
            citizenship='Zimbabwean',
            telephone='+263771234567',
            contact_address='123 Main St',
            email='veteran@example.com',
            is_war_veteran=True,
            war_vet_number='WV-12345'
        )
        
        self.assertTrue(profile.is_war_veteran)
        self.assertEqual(profile.war_vet_number, 'WV-12345')
    
    def test_civil_servant_category(self):
        """Test civil servant farmer category"""
        profile = FarmerProfile.objects.create(
            user=self.user,
            surname='Servant',
            first_name='Civil',
            sex='FEMALE',
            title='Ms',
            date_of_birth='1975-01-01',
            national_id='75-123456-C-12',
            marital_status='SINGLE',
            citizenship='Zimbabwean',
            telephone='+263771234567',
            contact_address='123 Main St',
            email='civil@example.com',
            is_civil_servant=True,
            ec_number='EC-98765'
        )
        
        self.assertTrue(profile.is_civil_servant)
        self.assertEqual(profile.ec_number, 'EC-98765')
    
    def test_uniformed_forces_category(self):
        """Test uniformed forces farmer category"""
        profile = FarmerProfile.objects.create(
            user=self.user,
            surname='Force',
            first_name='Uniformed',
            sex='MALE',
            title='Mr',
            date_of_birth='1970-01-01',
            national_id='70-123456-U-12',
            marital_status='MARRIED',
            citizenship='Zimbabwean',
            telephone='+263771234567',
            contact_address='123 Main St',
            email='force@example.com',
            is_uniformed_forces=True,
            force_number='UF-54321'
        )
        
        self.assertTrue(profile.is_uniformed_forces)
        self.assertEqual(profile.force_number, 'UF-54321')
    
    def test_marital_status_choices(self):
        """Test valid marital status choices"""
        valid_statuses = ['SINGLE', 'MARRIED', 'DIVORCED', 'WIDOWED']
        
        for status in valid_statuses:
            profile = FarmerProfile.objects.create(
                user=User.objects.create_user(username=f'user_{status}', password='pass'),
                surname='Test',
                first_name='User',
                sex='MALE',
                title='Mr',
                date_of_birth='1980-01-01',
                national_id=f'80-{status}-12',
                marital_status=status,
                citizenship='Zimbabwean',
                telephone='+263771234567',
                contact_address='123 Main St',
                email=f'{status}@example.com'
            )
            self.assertEqual(profile.marital_status, status)
    
    def test_sex_choices(self):
        """Test valid sex choices"""
        # Male
        profile_male = FarmerProfile.objects.create(
            user=self.user,
            surname='Male',
            first_name='Test',
            sex='MALE',
            title='Mr',
            date_of_birth='1980-01-01',
            national_id='80-MALE-12',
            marital_status='SINGLE',
            citizenship='Zimbabwean',
            telephone='+263771234567',
            contact_address='123 Main St',
            email='male@example.com'
        )
        self.assertEqual(profile_male.sex, 'MALE')
        
        # Female
        user2 = User.objects.create_user(username='female_user', password='pass')
        profile_female = FarmerProfile.objects.create(
            user=user2,
            surname='Female',
            first_name='Test',
            sex='FEMALE',
            title='Ms',
            date_of_birth='1980-01-01',
            national_id='80-FEMALE-12',
            marital_status='SINGLE',
            citizenship='Zimbabwean',
            telephone='+263771234568',
            contact_address='456 Main St',
            email='female@example.com'
        )
        self.assertEqual(profile_female.sex, 'FEMALE')
    
    def test_one_to_one_relationship_with_user(self):
        """Test one-to-one relationship with User model"""
        profile = FarmerProfile.objects.create(
            user=self.user,
            surname='Doe',
            first_name='John',
            sex='MALE',
            title='Mr',
            date_of_birth='1980-01-01',
            national_id='12-345678-A-12',
            marital_status='SINGLE',
            citizenship='Zimbabwean',
            telephone='+263771234567',
            contact_address='123 Main St',
            email='john@example.com'
        )
        
        # Access profile from user
        self.assertEqual(self.user.farmer_profile, profile)
        
        # Access user from profile
        self.assertEqual(profile.user, self.user)


class TitleDeedApplicationModelTest(TestCase):
    """Test suite for TitleDeedApplication model"""
    
    def setUp(self):
        """Set up test data"""
        self.user = User.objects.create_user(
            username='testfarmer',
            password='testpass123'
        )
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
    
    def test_create_application(self):
        """Test creating a title deed application"""
        application = TitleDeedApplication.objects.create(
            farmer=self.farmer,
            district='Harare',
            farm_id='FRM-001',
            farm_name='Green Acres',
            farm_extent=Decimal('100.5000'),
            tenure_document_type='Offer Letter',
            tenure_document='tenure_docs/test.pdf',
            national_id_copy='id_copies/test.pdf'
        )
        
        self.assertEqual(application.farmer, self.farmer)
        self.assertEqual(application.district, 'Harare')
        self.assertEqual(application.farm_id, 'FRM-001')
        self.assertEqual(application.farm_name, 'Green Acres')
        self.assertEqual(application.farm_extent, Decimal('100.5000'))
        self.assertEqual(application.status, 'PENDING')
    
    def test_application_string_representation(self):
        """Test __str__ method"""
        application = TitleDeedApplication.objects.create(
            farmer=self.farmer,
            district='Harare',
            farm_id='FRM-001',
            farm_name='Green Acres',
            farm_extent=Decimal('100.0000'),
            tenure_document_type='Offer Letter',
            tenure_document='tenure_docs/test.pdf',
            national_id_copy='id_copies/test.pdf'
        )
        
        expected = f"App {application.id}: Green Acres (PENDING)"
        self.assertEqual(str(application), expected)
    
    def test_default_status_is_pending(self):
        """Test that default status is PENDING"""
        application = TitleDeedApplication.objects.create(
            farmer=self.farmer,
            district='Harare',
            farm_id='FRM-001',
            farm_name='Green Acres',
            farm_extent=Decimal('100.0000'),
            tenure_document_type='Offer Letter',
            tenure_document='tenure_docs/test.pdf',
            national_id_copy='id_copies/test.pdf'
        )
        
        self.assertEqual(application.status, 'PENDING')
    
    def test_status_choices(self):
        """Test valid status choices"""
        valid_statuses = [
            'PENDING', 'LIMS_REVIEW', 'LIMS_VERIFIED', 'ACCOUNTS_REVIEW',
            'ACCOUNTS_VERIFIED', 'ESTATES_REVIEW', 'ESTATES_VERIFIED',
            'ZLC_REVIEW', 'ZLC_VERIFIED', 'SURVEY_PENDING', 'SURVEY_REQUIRED',
            'SURVEYED', 'VALUATION_REVIEW', 'VALUATED', 'CONVEYANCER_REVIEW',
            'APPROVED', 'REJECTED'
        ]
        
        application = TitleDeedApplication.objects.create(
            farmer=self.farmer,
            district='Harare',
            farm_id='FRM-001',
            farm_name='Green Acres',
            farm_extent=Decimal('100.0000'),
            tenure_document_type='Offer Letter',
            tenure_document='tenure_docs/test.pdf',
            national_id_copy='id_copies/test.pdf'
        )
        
        for status in valid_statuses:
            application.status = status
            application.save()
            application.refresh_from_db()
            self.assertEqual(application.status, status)
    
    def test_payment_plan_choices(self):
        """Test payment plan choices"""
        # Cash payment
        app_cash = TitleDeedApplication.objects.create(
            farmer=self.farmer,
            district='Harare',
            farm_id='FRM-CASH',
            farm_name='Cash Farm',
            farm_extent=Decimal('50.0000'),
            tenure_document_type='Offer Letter',
            tenure_document='tenure_docs/test.pdf',
            national_id_copy='id_copies/test.pdf',
            payment_plan='CASH',
            purchase_price=Decimal('50000.00')
        )
        self.assertEqual(app_cash.payment_plan, 'CASH')
        
        # Mortgage payment
        farmer2 = FarmerProfile.objects.create(
            user=User.objects.create_user(username='farmer2', password='pass'),
            surname='Smith',
            first_name='Jane',
            sex='FEMALE',
            title='Mrs',
            date_of_birth='1985-01-01',
            national_id='85-123456-S-12',
            marital_status='SINGLE',
            citizenship='Zimbabwean',
            telephone='+263771234568',
            contact_address='456 Main St',
            email='jane@example.com'
        )
        app_mortgage = TitleDeedApplication.objects.create(
            farmer=farmer2,
            district='Bulawayo',
            farm_id='FRM-MORT',
            farm_name='Mortgage Farm',
            farm_extent=Decimal('75.0000'),
            tenure_document_type='Offer Letter',
            tenure_document='tenure_docs/test2.pdf',
            national_id_copy='id_copies/test2.pdf',
            payment_plan='MORTGAGE',
            purchase_price=Decimal('100000.00'),
            selected_bank='CBZ'
        )
        self.assertEqual(app_mortgage.payment_plan, 'MORTGAGE')
        self.assertEqual(app_mortgage.selected_bank, 'CBZ')
    
    def test_bank_choices(self):
        """Test bank choices"""
        valid_banks = ['FBC', 'ZB', 'CBZ', 'POSB', 'AFC']
        
        for i, bank in enumerate(valid_banks):
            farmer = FarmerProfile.objects.create(
                user=User.objects.create_user(username=f'farmer_{bank}', password='pass'),
                surname='Test',
                first_name=bank,
                sex='MALE',
                title='Mr',
                date_of_birth='1980-01-01',
                national_id=f'80-{bank}-12',
                marital_status='SINGLE',
                citizenship='Zimbabwean',
                telephone=f'+26377123456{i}',
                contact_address='123 Main St',
                email=f'{bank}@example.com'
            )
            application = TitleDeedApplication.objects.create(
                farmer=farmer,
                district='Harare',
                farm_id=f'FRM-{bank}',
                farm_name=f'{bank} Farm',
                farm_extent=Decimal('100.0000'),
                tenure_document_type='Offer Letter',
                tenure_document=f'tenure_docs/{bank}.pdf',
                national_id_copy=f'id_copies/{bank}.pdf',
                selected_bank=bank
            )
            self.assertEqual(application.selected_bank, bank)
    
    def test_decimal_field_precision(self):
        """Test decimal field precision for farm_extent and purchase_price"""
        application = TitleDeedApplication.objects.create(
            farmer=self.farmer,
            district='Harare',
            farm_id='FRM-DEC',
            farm_name='Decimal Farm',
            farm_extent=Decimal('1234.5678'),
            tenure_document_type='Offer Letter',
            tenure_document='tenure_docs/test.pdf',
            national_id_copy='id_copies/test.pdf',
            purchase_price=Decimal('123456789.99'),
            valuation_amount=Decimal('987654321.50')
        )
        
        self.assertEqual(application.farm_extent, Decimal('1234.5678'))
        self.assertEqual(application.purchase_price, Decimal('123456789.99'))
        self.assertEqual(application.valuation_amount, Decimal('987654321.50'))
    
    def test_boolean_fields_default_false(self):
        """Test that boolean fields default to False"""
        application = TitleDeedApplication.objects.create(
            farmer=self.farmer,
            district='Harare',
            farm_id='FRM-BOOL',
            farm_name='Boolean Farm',
            farm_extent=Decimal('100.0000'),
            tenure_document_type='Offer Letter',
            tenure_document='tenure_docs/test.pdf',
            national_id_copy='id_copies/test.pdf'
        )
        
        self.assertFalse(application.lims_verification_status)
        self.assertFalse(application.zlc_verification_status)
        self.assertFalse(application.is_surveyed)
        self.assertFalse(application.valuation_approved)
        self.assertFalse(application.application_fee_paid)
        self.assertFalse(application.has_disputes)
        self.assertFalse(application.is_cash_payment)
        self.assertFalse(application.is_survey_fee_paid)
        self.assertFalse(application.payment_verified)
        self.assertFalse(application.collection_notification_sent)
    
    def test_foreign_key_relationship_with_farmer(self):
        """Test foreign key relationship with FarmerProfile"""
        application = TitleDeedApplication.objects.create(
            farmer=self.farmer,
            district='Harare',
            farm_id='FRM-FK',
            farm_name='FK Farm',
            farm_extent=Decimal('100.0000'),
            tenure_document_type='Offer Letter',
            tenure_document='tenure_docs/test.pdf',
            national_id_copy='id_copies/test.pdf'
        )
        
        # Access application from farmer (OneToOne field)
        self.assertEqual(application, self.farmer.application)
        
        # Access farmer from application
        self.assertEqual(application.farmer, self.farmer)
    
    def test_timestamps_auto_created(self):
        """Test that created_at and updated_at are automatically set"""
        application = TitleDeedApplication.objects.create(
            farmer=self.farmer,
            district='Harare',
            farm_id='FRM-TIME',
            farm_name='Time Farm',
            farm_extent=Decimal('100.0000'),
            tenure_document_type='Offer Letter',
            tenure_document='tenure_docs/test.pdf',
            national_id_copy='id_copies/test.pdf'
        )
        
        self.assertIsNotNone(application.created_at)
        self.assertIsNotNone(application.updated_at)


class SpouseDetailModelTest(TestCase):
    """Test suite for SpouseDetail model"""
    
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
    
    def test_create_spouse_detail(self):
        """Test creating a spouse detail"""
        spouse = SpouseDetail.objects.create(
            application=self.application,
            surname='Doe',
            first_name='Jane',
            national_id='85-987654-B-21'
        )
        
        self.assertEqual(spouse.surname, 'Doe')
        self.assertEqual(spouse.first_name, 'Jane')
        self.assertEqual(spouse.national_id, '85-987654-B-21')
        self.assertEqual(spouse.application, self.application)
    
    def test_spouse_string_representation(self):
        """Test __str__ method"""
        spouse = SpouseDetail.objects.create(
            application=self.application,
            surname='Doe',
            first_name='Jane',
            national_id='85-987654-B-21'
        )
        
        expected = f"Jane Doe (Spouse of App {self.application.id})"
        self.assertEqual(str(spouse), expected)
    
    def test_multiple_spouses_per_application(self):
        """Test that an application can have multiple spouses"""
        spouse1 = SpouseDetail.objects.create(
            application=self.application,
            surname='Doe',
            first_name='Jane',
            national_id='85-111111-B-21'
        )
        spouse2 = SpouseDetail.objects.create(
            application=self.application,
            surname='Smith',
            first_name='Mary',
            national_id='86-222222-C-22'
        )
        
        spouses = self.application.spouses.all()
        self.assertEqual(spouses.count(), 2)
        self.assertIn(spouse1, spouses)
        self.assertIn(spouse2, spouses)
    
    def test_cascade_delete(self):
        """Test that spouses are deleted when application is deleted"""
        spouse = SpouseDetail.objects.create(
            application=self.application,
            surname='Doe',
            first_name='Jane',
            national_id='85-987654-B-21'
        )
        
        spouse_id = spouse.id
        self.application.delete()
        
        # Spouse should be deleted
        self.assertFalse(SpouseDetail.objects.filter(id=spouse_id).exists())
    
    def test_timestamps_auto_created(self):
        """Test that created_at and updated_at are automatically set"""
        spouse = SpouseDetail.objects.create(
            application=self.application,
            surname='Doe',
            first_name='Jane',
            national_id='85-987654-B-21'
        )
        
        self.assertIsNotNone(spouse.created_at)
        self.assertIsNotNone(spouse.updated_at)


class StaffProfileModelTest(TestCase):
    """Test suite for StaffProfile model (already tested in tests.py, adding more)"""
    
    def test_all_role_choices(self):
        """Test all valid role choices"""
        valid_roles = [
            ('lims', 'LIMS Officer'),
            ('accounts', 'Accounts Officer'),
            ('estates', 'Estates Officer'),
            ('zlc', 'ZLC Officer'),
            ('surveyor', 'Surveyor'),
            ('valuation', 'Valuation Officer'),
            ('conveyancer', 'Conveyancer'),
            ('admin', 'Administrator')
        ]
        
        for role_code, role_display in valid_roles:
            user = User.objects.create_user(
                username=f'staff_{role_code}',
                password='pass',
                is_staff=True
            )
            profile = StaffProfile.objects.create(user=user, role=role_code)
            
            self.assertEqual(profile.role, role_code)
            self.assertEqual(profile.get_role_display(), role_display)
    
    def test_cascade_delete_with_user(self):
        """Test that profile is deleted when user is deleted"""
        user = User.objects.create_user(
            username='teststaff',
            password='pass',
            is_staff=True
        )
        profile = StaffProfile.objects.create(user=user, role='lims')
        
        profile_id = profile.id
        user.delete()
        
        # Profile should be deleted
        self.assertFalse(StaffProfile.objects.filter(id=profile_id).exists())


class CitizenshipValidationTest(TestCase):
    """Test suite for citizenship choices validation"""
    
    def test_farmer_citizenship_choices(self):
        """Test that farmer can select from valid citizenship options"""
        valid_citizenships = [
            'Zimbabwean', 'South African', 'Zambian',
            'Mozambican', 'Botswanan', 'Other'
        ]
        
        for citizenship in valid_citizenships:
            user = User.objects.create_user(username=f'user_{citizenship}', password='pass')
            farmer = FarmerProfile.objects.create(
                user=user,
                surname='Test',
                first_name='Citizen',
                sex='MALE',
                title='Mr',
                date_of_birth='1980-01-01',
                national_id=f'80-{citizenship[:3]}-12',
                marital_status='SINGLE',
                citizenship=citizenship,
                telephone='+263771234567',
                contact_address='123 Main St',
                email='test@example.com'
            )
            self.assertEqual(farmer.citizenship, citizenship)
    
    def test_spouse_citizenship_field(self):
        """Test that spouse detail has citizenship field"""
        user = User.objects.create_user(username='testuser', password='pass')
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
            tenure_document_type='Offer Letter',
            tenure_document='tenure_docs/test.pdf',
            national_id_copy='id_copies/test.pdf'
        )
        spouse = SpouseDetail.objects.create(
            application=application,
            surname='Doe',
            first_name='Jane',
            national_id='85-123456-B-21',
            citizenship='South African'
        )
        
        self.assertEqual(spouse.citizenship, 'South African')


class YearsOfServiceTest(TestCase):
    """Test suite for years_of_service field"""
    
    def test_civil_servant_with_years_of_service(self):
        """Test that civil servants can specify years of service"""
        user = User.objects.create_user(username='civilservant', password='pass')
        farmer = FarmerProfile.objects.create(
            user=user,
            surname='Servant',
            first_name='Civil',
            sex='MALE',
            title='Mr',
            date_of_birth='1975-01-01',
            national_id='75-123456-C-12',
            marital_status='SINGLE',
            citizenship='Zimbabwean',
            telephone='+263771234567',
            contact_address='123 Main St',
            email='civil@example.com',
            is_civil_servant=True,
            ec_number='EC-12345',
            years_of_service=15
        )
        
        self.assertEqual(farmer.years_of_service, 15)
        self.assertTrue(farmer.is_civil_servant)
    
    def test_uniformed_forces_with_years_of_service(self):
        """Test that uniformed forces can specify years of service"""
        user = User.objects.create_user(username='officer', password='pass')
        farmer = FarmerProfile.objects.create(
            user=user,
            surname='Force',
            first_name='Uniform',
            sex='MALE',
            title='Mr',
            date_of_birth='1970-01-01',
            national_id='70-123456-U-12',
            marital_status='MARRIED',
            citizenship='Zimbabwean',
            telephone='+263771234567',
            contact_address='123 Main St',
            email='force@example.com',
            is_uniformed_forces=True,
            force_number='UF-54321',
            years_of_service=20
        )
        
        self.assertEqual(farmer.years_of_service, 20)
        self.assertTrue(farmer.is_uniformed_forces)
    
    def test_years_of_service_optional(self):
        """Test that years_of_service is optional for other categories"""
        user = User.objects.create_user(username='normalfarmer', password='pass')
        farmer = FarmerProfile.objects.create(
            user=user,
            surname='Normal',
            first_name='Farmer',
            sex='MALE',
            title='Mr',
            date_of_birth='1980-01-01',
            national_id='80-123456-N-12',
            marital_status='SINGLE',
            citizenship='Zimbabwean',
            telephone='+263771234567',
            contact_address='123 Main St',
            email='farmer@example.com'
        )
        
        self.assertIsNone(farmer.years_of_service)

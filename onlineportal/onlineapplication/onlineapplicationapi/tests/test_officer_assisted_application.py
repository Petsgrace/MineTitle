"""
Unit tests for Officer Assisted Application Creation (Capturing hard-copy applications on behalf of farmers).
"""

from decimal import Decimal
from django.test import TestCase
from django.contrib.auth.models import User
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient
from onlineapplicationapi.models import FarmerProfile, TitleDeedApplication, StaffProfile, ApplicationAction


class OfficerAssistedApplicationTests(TestCase):

    def setUp(self):
        self.client = APIClient()

        # Create Officer User
        self.officer_user = User.objects.create_user(
            username='officer_lims',
            password='password123',
            first_name='Officer',
            last_name='LIMS',
            is_staff=True
        )
        StaffProfile.objects.create(user=self.officer_user, role='lims')

        # Create Farmer User (Existing)
        self.existing_farmer_user = User.objects.create_user(
            username='63-999999-Z-63',
            password='password123',
            first_name='Grace',
            last_name='Mugabe'
        )
        self.existing_farmer_profile = FarmerProfile.objects.create(
            user=self.existing_farmer_user,
            national_id='63-999999-Z-63',
            first_name='Grace',
            surname='Mugabe',
            date_of_birth='1970-01-01',
            sex='Female',
            title='Mrs',
            marital_status='Single',
            citizenship='Zimbabwean',
            telephone='0711111111',
            contact_address='Harare'
        )

    def test_officer_creates_application_for_new_farmer(self):
        """
        Officer captures a hard-copy application for a farmer who is NOT registered in the system yet.
        System should automatically create the User & FarmerProfile, link the application, and log an audit action.
        """
        self.client.login(username='officer_lims', password='password123')

        payload = {
            'national_id': '08-123456-X-08',
            'first_name': 'Kudakwashe',
            'surname': 'Tagwirei',
            'date_of_birth': '1982-05-15',
            'sex': 'Male',
            'title': 'Dr',
            'marital_status': 'Married',
            'citizenship': 'Zimbabwean',
            'telephone': '+263772123456',
            'contact_address': 'Borrowdale Brooke, Harare',
            'farm_name': 'Oaklands Estate',
            'district': 'Goromonzi',
            'farm_extent': '50.0',
            'arable_area': '40.0',
            'tenure_document_type': 'A2 Permit',
            'tenure_document': SimpleUploadedFile('doc1.pdf', b'%PDF-1.4 sample content', 'application/pdf'),
            'national_id_copy': SimpleUploadedFile('doc2.pdf', b'%PDF-1.4 sample content', 'application/pdf')
        }

        res = self.client.post('/api/applications/', payload, format='multipart')
        if res.status_code != 201:
            print("\nTEST 1 ERRORS:", res.data)
        self.assertEqual(res.status_code, 201)

        # 1. Verify FarmerProfile was created
        profile = FarmerProfile.objects.filter(national_id='08-123456-X-08').first()
        self.assertIsNotNone(profile)
        self.assertEqual(profile.first_name, 'Kudakwashe')
        self.assertEqual(profile.surname, 'Tagwirei')

        # 2. Verify Application linked to farmer profile
        app = TitleDeedApplication.objects.filter(farmer=profile).first()
        self.assertIsNotNone(app)
        self.assertEqual(app.farm_name, 'Oaklands Estate')

        # 3. Verify audit action log created by officer
        audit = ApplicationAction.objects.filter(application=app, action_type='OFFICER_INITIATED').first()
        self.assertIsNotNone(audit)
        self.assertEqual(audit.officer, self.officer_user)

    def test_officer_creates_application_for_existing_farmer(self):
        """
        Officer captures a hard-copy application for a farmer who ALREADY has a profile.
        """
        self.client.login(username='officer_lims', password='password123')

        payload = {
            'national_id': '63-999999-Z-63',
            'first_name': 'Grace',
            'surname': 'Mugabe',
            'date_of_birth': '1970-01-01',
            'sex': 'Female',
            'title': 'Mrs',
            'marital_status': 'Single',
            'citizenship': 'Zimbabwean',
            'telephone': '+263711111111',
            'contact_address': 'Zvimba',
            'farm_name': 'Highfield Farm',
            'district': 'Zvimba',
            'farm_extent': '80.0',
            'arable_area': '60.0',
            'tenure_document_type': 'Offer Letter',
            'tenure_document': SimpleUploadedFile('doc3.pdf', b'%PDF-1.4 sample content', 'application/pdf'),
            'national_id_copy': SimpleUploadedFile('doc4.pdf', b'%PDF-1.4 sample content', 'application/pdf')
        }

        res = self.client.post('/api/applications/', payload, format='multipart')
        self.assertEqual(res.status_code, 201)

        # Linked to existing profile
        app = TitleDeedApplication.objects.filter(farmer=self.existing_farmer_profile).first()
        self.assertIsNotNone(app)
        self.assertEqual(app.farm_name, 'Highfield Farm')

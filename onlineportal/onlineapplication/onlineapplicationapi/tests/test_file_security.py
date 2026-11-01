"""
Unit tests for secure file uploads and document access control.
"""

import io
from django.test import TestCase
from django.contrib.auth.models import User
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.exceptions import ValidationError
from onlineapplicationapi.models import FarmerProfile, TitleDeedApplication
from onlineapplicationapi.utils.validators import validate_uploaded_file
from onlineapplicationapi.utils.file_utils import secure_file_upload_path


class FileUploadSecurityTests(TestCase):

    def setUp(self):
        # Create test users
        self.farmer_user = User.objects.create_user(
            username='farmer1', password='password123', first_name='John', last_name='Moyo'
        )
        self.other_farmer_user = User.objects.create_user(
            username='farmer2', password='password123', first_name='Jane', last_name='Doe'
        )
        self.staff_user = User.objects.create_user(
            username='officer1', password='password123', is_staff=True
        )

        self.farmer_profile = FarmerProfile.objects.create(
            user=self.farmer_user,
            national_id='63-111111-A-63',
            first_name='John',
            surname='Moyo',
            date_of_birth='1985-01-01',
            sex='Male',
            title='Mr',
            marital_status='Single',
            citizenship='Zimbabwean',
            telephone='0712345678',
            contact_address='Harare'
        )

        self.valid_pdf = SimpleUploadedFile(
            name='test_doc.pdf',
            content=b'%PDF-1.4 test pdf content',
            content_type='application/pdf'
        )

    def test_secure_file_upload_path_obfuscation(self):
        """Verify filenames are replaced with UUIDs and correctly structured."""
        app = TitleDeedApplication(farmer=self.farmer_profile)
        path = secure_file_upload_path(app, 'confidential_user_id.pdf')
        
        self.assertTrue(path.startswith('uploads\\titledeedapplication') or path.startswith('uploads/titledeedapplication'))
        self.assertTrue(path.endswith('.pdf'))
        self.assertNotIn('confidential_user_id', path)

    def test_file_extension_validation(self):
        """Verify unauthorized file extensions (.exe, .sh) are rejected."""
        bad_file = SimpleUploadedFile('script.exe', b'binary content', content_type='application/octet-stream')
        with self.assertRaises(ValidationError) as ctx:
            validate_uploaded_file(bad_file)
        self.assertIn("Invalid file format '.exe'", str(ctx.exception))

    def test_file_size_validation(self):
        """Verify files over 10MB are rejected."""
        large_content = b'0' * (11 * 1024 * 1024)  # 11 MB
        large_file = SimpleUploadedFile('large.pdf', large_content, content_type='application/pdf')
        with self.assertRaises(ValidationError) as ctx:
            validate_uploaded_file(large_file)
        self.assertIn('exceeds the maximum allowed limit', str(ctx.exception))

    def test_secure_document_download_access_control(self):
        """Verify authorization rules on SecureDocumentDownloadView."""
        app = TitleDeedApplication.objects.create(
            farmer=self.farmer_profile,
            district='Harare',
            farm_name='Kopje View',
            farm_extent=50.0,
            tenure_document_type='A2 Permit',
            tenure_document=self.valid_pdf
        )

        url = f'/api/applications/{app.id}/document/tenure_document/'

        # Unauthenticated request -> 403 Forbidden (DRF default for unauthenticated APIView)
        res = self.client.get(url)
        self.assertEqual(res.status_code, 403)

        # Other farmer -> 403 Forbidden
        self.client.login(username='farmer2', password='password123')
        res = self.client.get(url)
        self.assertEqual(res.status_code, 403)

        # Owner farmer -> 200 OK
        self.client.login(username='farmer1', password='password123')
        res = self.client.get(url)
        self.assertEqual(res.status_code, 200)

        # Staff Officer -> 200 OK
        self.client.login(username='officer1', password='password123')
        res = self.client.get(url)
        self.assertEqual(res.status_code, 200)

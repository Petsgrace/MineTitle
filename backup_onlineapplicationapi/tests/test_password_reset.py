from django.urls import reverse
from rest_framework.test import APITestCase
from rest_framework import status
from django.contrib.auth.models import User
from django.core import mail
from django.utils.http import urlsafe_base64_encode
from django.utils.encoding import force_bytes
from django.contrib.auth.tokens import default_token_generator

class PasswordResetTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username='user1', 
            password='oldpassword', 
            email='user1@example.com',
            first_name='John',
            last_name='Doe'
        )

    def test_password_reset_request_email(self):
        url = reverse('password-reset')
        data = {'email': 'user1@example.com'}
        
        # Test request by email
        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('link has been sent', response.data['status'])
        
        # Verify an email would be sent by `send_email_with_logging`
        # Mocking or checking EmailLog if we had time, but let's check basic response for now.
        
    def test_password_reset_request_username(self):
        url = reverse('password-reset')
        data = {'username': 'user1'}
        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_password_reset_confirm(self):
        url = reverse('password-reset-confirm')
        
        uid = urlsafe_base64_encode(force_bytes(self.user.pk))
        token = default_token_generator.make_token(self.user)
        
        data = {
            'uidb64': uid,
            'token': token,
            'new_password': 'newpassword123'
        }
        
        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        # Verify password is changed
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password('newpassword123'))
        
    def test_password_reset_confirm_invalid_token(self):
        url = reverse('password-reset-confirm')
        uid = urlsafe_base64_encode(force_bytes(self.user.pk))
        
        data = {
            'uidb64': uid,
            'token': 'invalid-token',
            'new_password': 'newpassword123'
        }
        
        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

"""
Tests for API rate limiting (throttling).

Defines test-specific throttle subclasses with hardcoded low rates.
Patches the throttle_classes directly on the view classes.
Clears the throttle cache between tests to ensure isolation.
"""

from django.test import TestCase
from django.contrib.auth.models import User
from django.core.cache import cache
from rest_framework.test import APIClient, APITestCase
from rest_framework import status
from unittest.mock import patch

from onlineapplicationapi.throttles import (
    LoginRateThrottle,
    RegisterRateThrottle,
    AnonBurstRateThrottle,
    UserBurstRateThrottle,
    UserSustainedRateThrottle,
)
from onlineapplicationapi.views import (
    LoginView,
    RegisterViewSet,
    SetCSRFCookieView,
    TitleDeedApplicationViewSet,
)


# --- Test-specific throttle subclasses with hard-coded low rates ---

class TestLoginThrottle(LoginRateThrottle):
    rate = '3/min'


class TestRegisterThrottle(RegisterRateThrottle):
    rate = '2/min'


class TestAnonBurstThrottle(AnonBurstRateThrottle):
    rate = '5/min'


class TestUserBurstThrottle(UserBurstRateThrottle):
    rate = '5/min'


class TestUserSustainedThrottle(UserSustainedRateThrottle):
    rate = '20/min'


# --- Test cases ---

class LoginThrottleTest(APITestCase):
    """Test rate limiting on the login endpoint."""

    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.user = User.objects.create_user(
            username='testfarmer', password='testpass123'
        )

    def tearDown(self):
        cache.clear()

    @patch.object(LoginView, 'throttle_classes', [TestLoginThrottle])
    def test_login_allowed_within_limit(self):
        """Logins within the rate limit should succeed."""
        for _ in range(3):
            response = self.client.post('/api/login/', {
                'username': 'testfarmer', 'password': 'testpass123'
            })
            self.assertEqual(response.status_code, status.HTTP_200_OK)

    @patch.object(LoginView, 'throttle_classes', [TestLoginThrottle])
    def test_login_blocked_after_limit(self):
        """The 4th login attempt within a minute should be throttled."""
        for _ in range(3):
            self.client.post('/api/login/', {
                'username': 'testfarmer', 'password': 'wrong'
            })

        response = self.client.post('/api/login/', {
            'username': 'testfarmer', 'password': 'testpass123'
        })
        self.assertEqual(response.status_code, status.HTTP_429_TOO_MANY_REQUESTS)

    @patch.object(LoginView, 'throttle_classes', [TestLoginThrottle])
    def test_login_throttle_returns_retry_after(self):
        """Throttled response should include Retry-After header."""
        for _ in range(3):
            self.client.post('/api/login/', {
                'username': 'testfarmer', 'password': 'wrong'
            })

        response = self.client.post('/api/login/', {
            'username': 'testfarmer', 'password': 'wrong'
        })
        self.assertEqual(response.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        self.assertIn('Retry-After', response.headers)


class RegisterThrottleTest(APITestCase):
    """Test rate limiting on the registration endpoint."""

    def setUp(self):
        cache.clear()
        self.client = APIClient()

    def tearDown(self):
        cache.clear()

    @patch.object(RegisterViewSet, 'throttle_classes', [TestRegisterThrottle])
    def test_register_blocked_after_limit(self):
        """The 3rd registration attempt should be throttled (limit is 2/min)."""
        for i in range(2):
            self.client.post('/api/register/', {
                'username': f'newuser{i}',
                'password': 'StrongPass123!',
                'email': f'user{i}@test.com',
            })

        response = self.client.post('/api/register/', {
            'username': 'newuser_extra',
            'password': 'StrongPass123!',
            'email': 'extra@test.com',
        })
        self.assertEqual(response.status_code, status.HTTP_429_TOO_MANY_REQUESTS)


class AuthenticatedThrottleTest(APITestCase):
    """Test burst rate limiting for authenticated users."""

    def setUp(self):
        cache.clear()
        self.user = User.objects.create_user(
            username='staffuser', password='testpass123', is_staff=True
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def tearDown(self):
        cache.clear()

    @patch.object(
        TitleDeedApplicationViewSet, 'throttle_classes',
        [TestUserBurstThrottle, TestUserSustainedThrottle],
    )
    def test_authenticated_requests_within_limit(self):
        """Authenticated requests within burst limit should succeed."""
        for _ in range(5):
            response = self.client.get('/api/applications/')
            self.assertEqual(response.status_code, status.HTTP_200_OK)

    @patch.object(
        TitleDeedApplicationViewSet, 'throttle_classes',
        [TestUserBurstThrottle, TestUserSustainedThrottle],
    )
    def test_authenticated_burst_blocked_after_limit(self):
        """The 6th request within a minute should be throttled (limit is 5/min)."""
        for _ in range(5):
            self.client.get('/api/applications/')

        response = self.client.get('/api/applications/')
        self.assertEqual(response.status_code, status.HTTP_429_TOO_MANY_REQUESTS)


class AnonBurstThrottleTest(APITestCase):
    """Test burst rate limiting for anonymous requests."""

    def setUp(self):
        cache.clear()
        self.client = APIClient()

    def tearDown(self):
        cache.clear()

    @patch.object(SetCSRFCookieView, 'throttle_classes', [TestAnonBurstThrottle])
    def test_anon_csrf_blocked_after_limit(self):
        """Anonymous CSRF requests should be throttled after burst limit."""
        for _ in range(5):
            self.client.get('/api/csrf-cookie/')

        response = self.client.get('/api/csrf-cookie/')
        self.assertEqual(response.status_code, status.HTTP_429_TOO_MANY_REQUESTS)

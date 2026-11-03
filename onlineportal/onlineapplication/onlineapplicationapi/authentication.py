"""
Signed Token Authentication for Title Deeds One Stop Center API.
Issues and validates cryptographically signed session tokens.
Enforces real-time account active verification on every API call.
"""

from rest_framework import authentication, exceptions
from django.core import signing
from django.contrib.auth.models import User
from django.utils import timezone

TOKEN_SALT = 'officer-session-token-salt'
TOKEN_MAX_AGE = 86400 * 7  # 7 days

def generate_signed_token(user, role=None, privileges=None):
    """Generate a tamper-proof cryptographically signed session token."""
    profile = getattr(user, 'staff_profile', None)
    effective_role = role or getattr(profile, 'role', 'admin' if user.is_superuser else 'farmer')
    effective_privileges = privileges if privileges is not None else getattr(profile, 'privileges', [])
    payload = {
        'user_id': user.id,
        'username': user.username,
        'email': user.email,
        'role': effective_role,
        'privileges': effective_privileges,
        'must_change_password': getattr(profile, 'must_change_password', False),
        'timestamp': timezone.now().isoformat()
    }
    return signing.dumps(payload, salt=TOKEN_SALT)

class SignedTokenAuthentication(authentication.BaseAuthentication):
    """
    DRF Authentication class that validates Bearer <signed_token>.
    Guarantees that deactivated accounts (is_active == False) are rejected immediately.
    """
    def authenticate(self, request):
        auth_header = request.headers.get('Authorization') or request.META.get('HTTP_AUTHORIZATION')
        if not auth_header or not auth_header.startswith('Bearer '):
            return None

        token = auth_header.split(' ', 1)[1].strip()
        if not token:
            return None

        try:
            payload = signing.loads(token, salt=TOKEN_SALT, max_age=TOKEN_MAX_AGE)
        except signing.SignatureExpired:
            raise exceptions.AuthenticationFailed('Session token has expired. Please sign in again.')
        except signing.BadSignature:
            raise exceptions.AuthenticationFailed('Invalid session token signature.')

        user_id = payload.get('user_id')
        try:
            user = User.objects.select_related('staff_profile').get(id=user_id)
        except User.DoesNotExist:
            raise exceptions.AuthenticationFailed('User account does not exist.')

        if not user.is_active:
            raise exceptions.AuthenticationFailed('Account deactivated by System Administrator.')

        return (user, token)


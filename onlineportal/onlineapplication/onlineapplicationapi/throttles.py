"""
Custom DRF throttle classes for rate limiting API endpoints.

Tiered throttling:
- LoginRateThrottle: Strict limit on login attempts (brute-force protection)
- RegisterRateThrottle: Strict limit on registration (spam protection)
- AnonBurstRateThrottle: Moderate limit for unauthenticated requests
- UserBurstRateThrottle: Per-minute burst limit for authenticated users
- UserSustainedRateThrottle: Daily cap for authenticated users
"""

from rest_framework.throttling import SimpleRateThrottle


class LoginRateThrottle(SimpleRateThrottle):
    """
    Limits login attempts by IP address.
    Protects against brute-force credential attacks.
    """
    scope = 'login'

    def get_cache_key(self, request, view):
        return self.cache_format % {
            'scope': self.scope,
            'ident': self.get_ident(request),
        }


class RegisterRateThrottle(SimpleRateThrottle):
    """
    Limits registration attempts by IP address.
    Prevents spam account creation.
    """
    scope = 'register'

    def get_cache_key(self, request, view):
        return self.cache_format % {
            'scope': self.scope,
            'ident': self.get_ident(request),
        }


class AnonBurstRateThrottle(SimpleRateThrottle):
    """
    Burst rate limit for anonymous (unauthenticated) users, keyed by IP.
    Applied to public endpoints like CSRF cookie and session check.
    """
    scope = 'anon_burst'

    def get_cache_key(self, request, view):
        # Only throttle unauthenticated requests
        if request.user and request.user.is_authenticated:
            return None
        return self.cache_format % {
            'scope': self.scope,
            'ident': self.get_ident(request),
        }


class UserBurstRateThrottle(SimpleRateThrottle):
    """
    Per-minute burst limit for authenticated users, keyed by user ID.
    Prevents rapid-fire API abuse from logged-in accounts.
    """
    scope = 'user_burst'

    def get_cache_key(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return None
        return self.cache_format % {
            'scope': self.scope,
            'ident': request.user.pk,
        }


class UserSustainedRateThrottle(SimpleRateThrottle):
    """
    Daily cap for authenticated users, keyed by user ID.
    Prevents excessive overall usage over a 24-hour period.
    """
    scope = 'user_sustained'

    def get_cache_key(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return None
        return self.cache_format % {
            'scope': self.scope,
            'ident': request.user.pk,
        }

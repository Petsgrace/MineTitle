"""
Custom permissions for the Online Application API
"""
from rest_framework import permissions
import logging

logger = logging.getLogger(__name__)


class IsOfficerOrAdmin(permissions.BasePermission):
    """
    Custom permission to allow officers and admins to access verification endpoints.
    Officers are users with a StaffProfile with specific roles.
    Admins are users with is_staff=True.
    """
    
    def has_permission(self, request, view):
        # User must be authenticated
        if not request.user or not request.user.is_authenticated:
            return False
            
        # Admins always have permission
        if request.user.is_staff:
            return True
        
        # Check if user has a staff profile with an officer role
        officer_roles = ['lims', 'accounts', 'finance', 'estates', 'resettlement', 
                        'zlc', 'surveyor', 'valuation', 'director', 'conveyancer', 'admin']
        
        try:
            # Access the role through the staff_profile relationship
            user_role = request.user.staff_profile.role
            return user_role in officer_roles
        except AttributeError:
            # User doesn't have a staff_profile
            return False
        except Exception:
            return False


class IsFarmer(permissions.BasePermission):
    """
    Permission for farmer-only endpoints.
    """
    
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        
        # Users without staff_profile are farmers
        return not hasattr(request.user, 'staff_profile')

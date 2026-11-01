"""
Role-Based Access Control (RBAC) Permissions for Title Deeds Processing.
Enforces strict queue isolation: staff can only see their department's queue
and act only on their stage. Unauthorized actions return HTTP 403 Forbidden.
"""
from rest_framework import permissions
from onlineapplicationapi.constants import (
    ROLE_ADMIN, ROLE_DIRECTOR, ROLE_STAGE_MAP, ROLE_APPLICANT
)

class IsAssignedStaffOrAdmin(permissions.BasePermission):
    """
    D4: Server-side RBAC:
    Allows authenticated staff officers who have an active operational assignment
    (assigned department, role, and operational privileges) or superuser/admin.
    Unassigned officers and citizens are strictly prohibited from accessing staff
    reports, audit logs, and workflow transition endpoints.
    """
    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if user.is_superuser:
            return True
        if hasattr(user, 'staff_profile'):
            profile = user.staff_profile
            if getattr(profile, 'is_unassigned', False) or profile.role == 'unassigned':
                return False
            if profile.role == 'officer' and not profile.department and not profile.channels and not profile.privileges:
                return False
            return True
        return False

class IsStaffOfficer(permissions.BasePermission):
    """Allows authenticated staff members with a valid StaffProfile."""
    def has_permission(self, request, view):
        return bool(
            request.user and request.user.is_authenticated and (
                request.user.is_staff and (request.user.is_superuser or (hasattr(request.user, 'staff_profile') and not getattr(request.user.staff_profile, 'is_unassigned', False)))
            )
        )

class IsOfficerOrAdmin(permissions.BasePermission):
    """Allows officers and admins."""
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        return bool(request.user.is_staff or request.user.is_superuser or hasattr(request.user, 'staff_profile'))

class IsFarmer(permissions.BasePermission):
    """Allows citizens/farmers only."""
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        return not hasattr(request.user, 'staff_profile')

class IsAdminOrDirector(permissions.BasePermission):
    """Allows system administrators and Director of Lands."""
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.user.is_superuser:
            return True
        if hasattr(request.user, 'staff_profile'):
            return request.user.staff_profile.role in (ROLE_ADMIN, ROLE_DIRECTOR)
        return False

class CanActOnApplicationStage(permissions.BasePermission):
    """
    RBAC Object-level permission:
    A staff member can act ONLY on applications currently at their department's stage.
    Admin and Director have ministerial supervisory permissions.
    """
    def has_object_permission(self, request, view, obj):
        if not request.user or not request.user.is_authenticated:
            return False
            
        if request.user.is_superuser:
            return True
            
        if hasattr(request.user, 'staff_profile'):
            role = request.user.staff_profile.role
            if role == ROLE_ADMIN:
                return True
            if role == ROLE_DIRECTOR and obj.status in ('VALUATED', 'APPROVED'):
                return True
                
            expected_stage = ROLE_STAGE_MAP.get(role)
            return obj.status == expected_stage
            
        # Citizen / Farmer
        if obj.farmer and obj.farmer.user == request.user:
            return request.method in permissions.SAFE_METHODS
            
        return False

class IsApplicantOrOwner(permissions.BasePermission):
    """Allows citizens to view or edit their own applications only."""
    def has_object_permission(self, request, view, obj):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.user.is_superuser or (hasattr(request.user, 'staff_profile') and request.user.staff_profile.role == ROLE_ADMIN):
            return True
        if obj.farmer and obj.farmer.user == request.user:
            return True
        return False

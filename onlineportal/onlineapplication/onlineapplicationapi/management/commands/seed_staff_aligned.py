"""
Seed script to create the 9 departmental staff personas + admin user
for end-to-end RBAC and sequential testing.
"""
from django.core.management.base import BaseCommand
from django.contrib.auth.models import User
from onlineapplicationapi.models import StaffProfile

STAFF_ACCOUNTS = [
    ('resettlement_officer', 'resettlement@lands.gov.zw', 'resettlement', 'Resettlement Department', '63-1000001-A-63'),
    ('lims_officer', 'lims@lands.gov.zw', 'lims', 'Land Information Management System', '63-1000002-B-63'),
    ('zlc_officer', 'zlc@lands.gov.zw', 'zlc', 'Zimbabwe Land Commission', '63-1000003-C-63'),
    ('gis_officer', 'gis@lands.gov.zw', 'gis', 'National GIS Directorate', '63-1000004-D-63'),
    ('surveyor_officer', 'surveyor@lands.gov.zw', 'surveyor', 'Department of the Surveyor General', '63-1000005-E-63'),
    ('valuation_officer', 'valuation@lands.gov.zw', 'valuation', 'Valuations Directorate', '63-1000006-F-63'),
    ('director_officer', 'director@lands.gov.zw', 'director', 'Executive Directorate of Lands', '63-1000007-G-63'),
    ('deeds_officer', 'deeds@justice.gov.zw', 'deeds', 'Department of Deeds Registry', '63-1000008-H-63'),
    ('admin_officer', 'admin@lands.gov.zw', 'admin', 'IT Systems Administration', '63-1000009-J-63'),
]

class Command(BaseCommand):
    help = "Seeds all 9 department officer accounts and assigns StaffProfile personas."

    def handle(self, *args, **options):
        self.stdout.write("Provisioning the 9 departmental staff personas...")
        for username, email, role, dept, nat_id in STAFF_ACCOUNTS:
            user, created = User.objects.get_or_create(
                username=username,
                defaults={
                    'email': email,
                    'is_staff': True,
                    'is_active': True,
                }
            )
            user.set_password('Ministry2026!')
            user.is_staff = True
            user.save()

            StaffProfile.objects.update_or_create(
                user=user,
                defaults={
                    'role': role,
                    'department': dept,
                    'national_id': nat_id,
                    'phone_number': '+263772000000',
                }
            )
            action_str = "Created" if created else "Updated"
            self.stdout.write(self.style.SUCCESS(f"{action_str} officer account: {username} [{role}]"))

"""
Management command to seed staff/officer users according to Ministry specification.
Usage:
  python manage.py seed_staff
"""

from django.core.management.base import BaseCommand
from django.contrib.auth.models import User
from onlineapplicationapi.models import StaffProfile

STAFF_ACCOUNTS = [
    {
        'role': 'admin',
        'username': 'admin',
        'email': 'admin@lands.gov.zw',
        'first_name': 'System',
        'last_name': 'Administrator',
        'department': 'Executive Directorate',
        'is_superuser': True,
        'channels': ['LIMS Channel', 'Finance Channel', 'Survey Channel', 'Valuation Channel', 'Deeds Channel'],
        'privileges': [
            'endorse_clearances', 'reconcile_fees', 'audit_gps', 'appraise_valuation',
            'issue_warrants', 'affix_seal', 'view_reports', 'view_audit_logs', 'manage_staff'
        ]
    },
    {
        'role': 'accounts',
        'username': 'accounts',
        'email': 'accounts@lands.gov.zw',
        'first_name': 'Accounts',
        'last_name': 'Officer',
        'department': 'Finance & Accounts',
        'is_superuser': False,
        'channels': ['Finance Channel'],
        'privileges': ['reconcile_fees', 'view_applications']
    },
    {
        'role': 'estates',
        'username': 'estate',
        'email': 'estate@lands.gov.zw',
        'first_name': 'Estates',
        'last_name': 'Officer',
        'department': 'Estates & Succession',
        'is_superuser': False,
        'channels': ['LIMS Channel'],
        'privileges': ['endorse_clearances', 'view_applications']
    },
    {
        'role': 'lims',
        'username': 'lims',
        'email': 'lims@lands.gov.zw',
        'first_name': 'LIMS',
        'last_name': 'Officer',
        'department': 'Lands & Agriculture (LIMS)',
        'is_superuser': False,
        'channels': ['LIMS Channel'],
        'privileges': ['endorse_clearances', 'audit_gps', 'view_applications']
    },
    {
        'role': 'zlc',
        'username': 'zlc',
        'email': 'zlc@lands.gov.zw',
        'first_name': 'ZLC',
        'last_name': 'Officer',
        'department': 'Zimbabwe Land Commission',
        'is_superuser': False,
        'channels': ['Survey Channel'],
        'privileges': ['endorse_clearances', 'view_applications']
    },
    {
        'role': 'surveyor_general',
        'username': 'sg',
        'email': 'sg@lands.gov.zw',
        'first_name': 'Surveyor General',
        'last_name': 'Officer',
        'department': 'Surveyor General',
        'is_superuser': False,
        'channels': ['Survey Channel'],
        'privileges': ['audit_gps', 'endorse_clearances', 'view_applications']
    },
    {
        'role': 'valuation',
        'username': 'valuation',
        'email': 'valuation@lands.gov.zw',
        'first_name': 'Valuation',
        'last_name': 'Officer',
        'department': 'Valuation Directorate',
        'is_superuser': False,
        'channels': ['Valuation Channel'],
        'privileges': ['appraise_valuation', 'view_reports', 'view_applications']
    },
]

class Command(BaseCommand):
    help = 'Seed official Ministry staff accounts with initial temporary password Ministry.'

    def handle(self, *args, **options):
        self.stdout.write(self.style.MIGRATE_HEADING('Seeding Ministry staff accounts...'))
        self.stdout.write('-' * 60)

        created_count = 0
        updated_count = 0

        for data in STAFF_ACCOUNTS:
            # Query by username or email
            user = User.objects.filter(username=data['username']).first()
            if not user:
                user = User.objects.filter(email__iexact=data['email']).first()

            is_new = False
            if not user:
                user = User(username=data['username'])
                is_new = True

            user.username = data['username']
            user.email = data['email']
            user.first_name = data['first_name']
            user.last_name = data['last_name']
            user.is_staff = True
            user.is_active = True
            user.is_superuser = data['is_superuser']
            user.set_password('Ministry')
            user.save()

            profile, _ = StaffProfile.objects.get_or_create(user=user)
            profile.role = data['role']
            profile.department = data['department']
            profile.channels = data['channels']
            profile.privileges = data['privileges']
            profile.must_change_password = True
            profile.mfa_enabled = True
            profile.failed_login_attempts = 0
            profile.locked_until = None
            profile.save()

            if is_new:
                created_count += 1
                self.stdout.write(self.style.SUCCESS(
                    f"  [+] Created {data['role'].upper():12s} user: '{data['username']}' ({data['email']})"
                ))
            else:
                updated_count += 1
                self.stdout.write(self.style.WARNING(
                    f"  [*] Updated {data['role'].upper():12s} user: '{data['username']}' ({data['email']})"
                ))

        self.stdout.write('-' * 60)
        self.stdout.write(self.style.SUCCESS(
            f'Seeding complete! Created: {created_count}, Updated: {updated_count}'
        ))
        self.stdout.write('All accounts reset to temporary password: "Ministry" (must change on first login)')

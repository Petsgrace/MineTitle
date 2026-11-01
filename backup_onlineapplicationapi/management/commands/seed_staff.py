"""
Management command to seed staff/officer users.

Consolidates the former standalone scripts:
  - create_staff_users.py
  - create_test_users.py
  - create_test_user.py
  - setup_admin_user.py

Usage:
  python manage.py seed_staff
"""

from django.core.management.base import BaseCommand
from django.contrib.auth.models import User
from onlineapplicationapi.models import StaffProfile


# All staff roles and their default test credentials
STAFF_USERS = [
    {'username': 'admin',          'email': 'admin@test.com',        'password': 'admin123',      'role': 'admin',       'first_name': 'Super',  'last_name': 'Admin',       'is_superuser': True},
    {'username': 'lims@test.com',  'email': 'lims@test.com',         'password': 'test123',       'role': 'lims',        'first_name': 'John',   'last_name': 'LIMS',        'is_superuser': False},
    {'username': 'accounts@test.com', 'email': 'accounts@test.com',  'password': 'test123',       'role': 'accounts',    'first_name': 'Jane',   'last_name': 'Accounts',    'is_superuser': False},
    {'username': 'estates@test.com',  'email': 'estates@test.com',   'password': 'test123',       'role': 'estates',     'first_name': 'Bob',    'last_name': 'Estates',     'is_superuser': False},
    {'username': 'zlc@test.com',      'email': 'zlc@test.com',       'password': 'test123',       'role': 'zlc',         'first_name': 'Alice',  'last_name': 'ZLC',         'is_superuser': False},
    {'username': 'surveyor@test.com', 'email': 'surveyor@test.com',  'password': 'test123',       'role': 'surveyor',    'first_name': 'Tom',    'last_name': 'Surveyor',    'is_superuser': False},
    {'username': 'valuation@test.com','email': 'valuation@test.com', 'password': 'test123',       'role': 'valuation',   'first_name': 'Sarah',  'last_name': 'Valuation',   'is_superuser': False},
    {'username': 'conveyancer@test.com','email': 'conveyancer@test.com','password': 'test123',     'role': 'conveyancer', 'first_name': 'Mike',   'last_name': 'Conveyancer', 'is_superuser': True},
    {'username': 'director@test.com', 'email': 'director@test.com',  'password': 'test123',       'role': 'director',    'first_name': 'David',  'last_name': 'Director',    'is_superuser': False},
]


class Command(BaseCommand):
    help = 'Seed the database with staff/officer users for all roles.'

    def handle(self, *args, **options):
        self.stdout.write(self.style.MIGRATE_HEADING('Seeding staff users...'))
        self.stdout.write('-' * 50)

        created_count = 0
        updated_count = 0

        for data in STAFF_USERS:
            user, created = User.objects.get_or_create(
                username=data['username'],
                defaults={
                    'email': data['email'],
                    'first_name': data['first_name'],
                    'last_name': data['last_name'],
                    'is_staff': True,
                    'is_superuser': data['is_superuser'],
                }
            )

            # Always reset password to the known value
            user.set_password(data['password'])
            user.email = data['email']
            user.first_name = data['first_name']
            user.last_name = data['last_name']
            user.is_staff = True
            user.is_superuser = data['is_superuser']
            user.save()

            # Create or update StaffProfile
            profile, profile_created = StaffProfile.objects.get_or_create(
                user=user,
                defaults={'role': data['role']}
            )
            if not profile_created and profile.role != data['role']:
                profile.role = data['role']
                profile.save()

            if created:
                created_count += 1
                self.stdout.write(self.style.SUCCESS(
                    f"  ✅ Created {data['role'].upper()} user: {data['username']}"
                ))
            else:
                updated_count += 1
                self.stdout.write(self.style.WARNING(
                    f"  ℹ️  Updated {data['role'].upper()} user: {data['username']}"
                ))

        self.stdout.write('-' * 50)
        self.stdout.write(self.style.SUCCESS(
            f'Done! Created: {created_count}, Updated: {updated_count}'
        ))
        self.stdout.write('')
        self.stdout.write('Login credentials:')
        for data in STAFF_USERS:
            self.stdout.write(f"  {data['role'].upper():15s} → {data['username']} / {data['password']}")

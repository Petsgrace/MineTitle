"""
Management command to clear farmer/application data.

Consolidates the former standalone scripts:
  - clear_applications.py
  - remove_dummy_data.py

Usage:
  python manage.py clear_data              # Clears all farmer data (keeps staff)
  python manage.py clear_data --include-staff  # Also removes staff users (except superusers)
"""

from django.core.management.base import BaseCommand
from django.contrib.auth.models import User
from onlineapplicationapi.models import (
    FarmerProfile, TitleDeedApplication, SpouseDetail, ApplicationAction
)


class Command(BaseCommand):
    help = 'Clear all farmer profiles, applications, and related data. Staff users are preserved by default.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--include-staff',
            action='store_true',
            help='Also remove staff users (superusers are always kept).',
        )
        parser.add_argument(
            '--no-confirm',
            action='store_true',
            help='Skip the confirmation prompt.',
        )

    def handle(self, *args, **options):
        include_staff = options['include_staff']

        if not options['no_confirm']:
            self.stdout.write(self.style.WARNING(
                '\n⚠️  This will permanently delete:'
            ))
            self.stdout.write(f'  • {ApplicationAction.objects.count()} application actions')
            self.stdout.write(f'  • {SpouseDetail.objects.count()} spouse details')
            self.stdout.write(f'  • {TitleDeedApplication.objects.count()} title deed applications')
            self.stdout.write(f'  • {FarmerProfile.objects.count()} farmer profiles')

            non_staff_users = User.objects.filter(is_staff=False, is_superuser=False)
            self.stdout.write(f'  • {non_staff_users.count()} non-staff user accounts')

            if include_staff:
                staff_users = User.objects.filter(is_staff=True, is_superuser=False)
                self.stdout.write(f'  • {staff_users.count()} staff user accounts')

            confirm = input('\nType "yes" to continue: ')
            if confirm.lower() != 'yes':
                self.stdout.write(self.style.ERROR('Aborted.'))
                return

        self.stdout.write(self.style.MIGRATE_HEADING('Starting data cleanup...'))

        # Delete in order to respect foreign key constraints
        count = ApplicationAction.objects.count()
        ApplicationAction.objects.all().delete()
        self.stdout.write(f'  Deleted {count} application actions')

        count = SpouseDetail.objects.count()
        SpouseDetail.objects.all().delete()
        self.stdout.write(f'  Deleted {count} spouse details')

        count = TitleDeedApplication.objects.count()
        TitleDeedApplication.objects.all().delete()
        self.stdout.write(f'  Deleted {count} title deed applications')

        count = FarmerProfile.objects.count()
        FarmerProfile.objects.all().delete()
        self.stdout.write(f'  Deleted {count} farmer profiles')

        # Delete non-staff users
        non_staff = User.objects.filter(is_staff=False, is_superuser=False)
        count = non_staff.count()
        non_staff.delete()
        self.stdout.write(f'  Deleted {count} non-staff user accounts')

        # Optionally delete staff (but never superusers)
        if include_staff:
            staff = User.objects.filter(is_staff=True, is_superuser=False)
            count = staff.count()
            staff.delete()
            self.stdout.write(f'  Deleted {count} staff user accounts')

        remaining = User.objects.count()
        self.stdout.write(self.style.SUCCESS(
            f'\n✅ Cleanup complete! Remaining users: {remaining}'
        ))

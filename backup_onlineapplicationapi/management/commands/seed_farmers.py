"""
Management command to seed dummy farmer data.

Consolidates the former standalone scripts:
  - populate_dummy_data.py
  - create_test_farmer.py

Usage:
  python manage.py seed_farmers          # Creates 30 dummy farmers (default)
  python manage.py seed_farmers --count 10
"""

import random
from datetime import datetime

from django.core.management.base import BaseCommand
from django.contrib.auth.models import User
from onlineapplicationapi.models import FarmerProfile, TitleDeedApplication


FIRST_NAMES = [
    "James", "John", "Robert", "Michael", "William",
    "David", "Richard", "Joseph", "Thomas", "Charles",
    "Mary", "Patricia", "Jennifer", "Linda", "Elizabeth",
    "Barbara", "Susan", "Jessica", "Sarah", "Karen",
]

SURNAMES = [
    "Smith", "Johnson", "Williams", "Brown", "Jones",
    "Garcia", "Miller", "Davis", "Rodriguez", "Martinez",
    "Hernandez", "Lopez", "Gonzalez", "Wilson", "Anderson",
    "Thomas", "Taylor", "Moore", "Jackson", "Martin",
]

DISTRICTS = [
    "Harare", "Bulawayo", "Mutare", "Gweru", "Kwekwe",
    "Kadoma", "Masvingo", "Chinhoyi", "Marondera", "Bindura",
]

STATUSES = [
    "PENDING", "LIMS_VERIFIED", "ZLC_VERIFIED",
    "SURVEYED", "VALUATED", "APPROVED", "REJECTED",
]

BANKS = ["FBC", "ZB", "CBZ", "POSB", "AFC"]


class Command(BaseCommand):
    help = 'Seed the database with dummy farmer profiles and applications.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--count',
            type=int,
            default=30,
            help='Number of dummy farmers to create (default: 30)',
        )

    def handle(self, *args, **options):
        count = options['count']
        self.stdout.write(self.style.MIGRATE_HEADING(
            f'Creating {count} dummy farmers and applications...'
        ))

        created = 0
        for i in range(count):
            first_name = random.choice(FIRST_NAMES)
            surname = random.choice(SURNAMES)
            username = f"farmer_{random.randint(1000, 9999)}_{i}"
            email = f"{username}@example.com"
            national_id = (
                f"{random.randint(10, 99)}-{random.randint(100000, 999999)} "
                f"{random.choice('ABCDEFGH')}{random.randint(10, 99)}"
            )

            # Create Django user
            user = User.objects.create_user(
                username=username, email=email, password='password123'
            )

            # Create farmer profile
            farmer = FarmerProfile.objects.create(
                user=user,
                surname=surname,
                first_name=first_name,
                sex=random.choice(['Male', 'Female']),
                title=random.choice(['Mr', 'Mrs', 'Ms', 'Dr']),
                date_of_birth=datetime(1970, 1, 1).date(),
                national_id=national_id,
                marital_status=random.choice(['Single', 'Married', 'Divorced']),
                citizenship="Zimbabwean",
                telephone=f"07{random.randint(10000000, 99999999)}",
                contact_address=f"{random.randint(1, 100)} Main St, {random.choice(DISTRICTS)}",
                email=email,
            )

            # Determine status and derived flags
            app_status = random.choice(STATUSES)
            lims_verified = app_status != 'PENDING'
            zlc_verified = app_status in ['ZLC_VERIFIED', 'SURVEYED', 'VALUATED', 'APPROVED']
            surveyed = app_status in ['SURVEYED', 'VALUATED', 'APPROVED']
            valuated = app_status in ['VALUATED', 'APPROVED']

            # Create application
            TitleDeedApplication.objects.create(
                farmer=farmer,
                district=random.choice(DISTRICTS),
                farm_id=f"FARM-{random.randint(100, 999)}",
                farm_name=f"{surname} Farm {random.randint(1, 10)}",
                farm_extent=random.uniform(5.0, 500.0),
                tenure_document_type="99 Year Lease",
                purchase_price=random.uniform(1000.0, 50000.0),
                payment_plan=random.choice(['CASH', 'MORTGAGE']),
                selected_bank=random.choice(BANKS) if random.choice([True, False]) else None,
                status=app_status,
                lims_verification_status=lims_verified,
                zlc_verification_status=zlc_verified,
                is_surveyed=surveyed,
                valuation_approved=valuated,
            )

            created += 1
            self.stdout.write(f"  Created farmer {first_name} {surname} ({app_status})")

        self.stdout.write(self.style.SUCCESS(f'\nDone! Created {created} farmer records.'))

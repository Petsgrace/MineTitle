"""
Django Management Command: migrate_to_supabase
Connects to Supabase hosted PostgreSQL + PostGIS database, runs migrations,
enables PostGIS extension, seeds statutory workflows and staff, and optionally
migrates records from local SQLite.
"""
import os
import sys
from pathlib import Path
from django.core.management.base import BaseCommand
from django.core.management import call_command
from django.conf import settings
from django.db import connection

class Command(BaseCommand):
    help = 'Validates Supabase connection, enables PostGIS, runs migrations, and seeds workflows.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--with-data',
            action='store_true',
            help='Also migrate existing local SQLite data to Supabase'
        )

    def handle(self, *args, **options):
        self.stdout.write(self.style.MIGRATE_HEADING("=== SUPABASE ONLINE DEPLOYMENT & MIGRATION ==="))
        
        db_settings = settings.DATABASES['default']
        engine = db_settings.get('ENGINE', '')
        host = db_settings.get('HOST', '')
        name = db_settings.get('NAME', '')
        user = db_settings.get('USER', '')

        self.stdout.write(f"Target Host: {host}")
        self.stdout.write(f"Target Database: {name}")
        self.stdout.write(f"Database Engine: {engine}")

        if 'sqlite3' in engine:
            self.stdout.write(self.style.WARNING(
                "\n[WARNING] Currently connected to local SQLite!\n"
                "To connect to Supabase, provide DATABASE_URL in your .env file:\n"
                "  DATABASE_URL=postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres\n"
            ))
            return

        # 1. Test Connection
        self.stdout.write("\n1. Testing Supabase PostgreSQL connection...")
        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT version();")
                row = cursor.fetchone()
                version = row[0] if row else "Unknown"
                self.stdout.write(self.style.SUCCESS(f"  Connected successfully!\n  Server: {version[:80]}..."))
                
                # Check/Enable PostGIS
                self.stdout.write("2. Enabling PostGIS extension in Supabase...")
                try:
                    cursor.execute("CREATE EXTENSION IF NOT EXISTS postgis;")
                    cursor.execute("SELECT PostGIS_Version();")
                    pg_version = cursor.fetchone()
                    self.stdout.write(self.style.SUCCESS(f"  PostGIS enabled! Version: {pg_version[0] if pg_version else 'Active'}"))
                except Exception as e:
                    self.stdout.write(self.style.WARNING(f"  PostGIS notice: {e}"))
        except Exception as e:
            self.stderr.write(self.style.ERROR(f"Failed to connect to Supabase: {e}"))
            return

        # 2. Run Migrations
        self.stdout.write("\n3. Running Django migrations on Supabase database...")
        try:
            call_command('migrate', interactive=False)
            self.stdout.write(self.style.SUCCESS("  All database tables migrated cleanly on Supabase!"))
        except Exception as e:
            self.stderr.write(self.style.ERROR(f"Migration error: {e}"))
            return

        # 3. Seed statutory workflows and staff
        self.stdout.write("\n4. Seeding statutory workflows and roles...")
        try:
            if Path(settings.BASE_DIR / 'onlineapplicationapi' / 'management' / 'commands' / 'seed_staff_aligned.py').exists():
                call_command('seed_staff_aligned')
                self.stdout.write(self.style.SUCCESS("  Statutory staff and workflows seeded!"))
        except Exception as e:
            self.stdout.write(self.style.WARNING(f"  Seeding note: {e}"))

        # 4. Optional Data Migration
        if options['with_data']:
            self.stdout.write("\n5. Migrating local data from SQLite to Supabase...")
            try:
                call_command('migrate_sqlite_to_postgis')
                self.stdout.write(self.style.SUCCESS("  Data migration completed!"))
            except Exception as e:
                self.stderr.write(self.style.ERROR(f"  Data migration note: {e}"))

        self.stdout.write(self.style.SUCCESS("\n=== SUPABASE DEPLOYMENT READY ==="))
        self.stdout.write("The system is connected to Supabase and ready to serve online traffic.")

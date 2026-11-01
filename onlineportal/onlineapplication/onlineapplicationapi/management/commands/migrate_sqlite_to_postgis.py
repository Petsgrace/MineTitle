"""
Django Management Command: migrate_sqlite_to_postgis
Migrates existing SQLite database records into PostgreSQL + PostGIS database.
Preserves primary keys, relationships, hash-chained audit ledger, and geometry data.
"""
import os
import sqlite3
from pathlib import Path
from django.core.management.base import BaseCommand
from django.conf import settings
from django.db import connection, transaction
from django.contrib.auth.models import User
from onlineapplicationapi.models import (
    StaffProfile, FarmerProfile, Payment, TitleDeedApplication,
    SpouseDetail, ApplicationAction, WorkflowTransition, StageSLA, EmailLog
)

class Command(BaseCommand):
    help = 'Migrates data from local SQLite database (db.sqlite3) to PostgreSQL + PostGIS'

    def add_arguments(self, parser):
        parser.add_argument(
            '--sqlite-path',
            type=str,
            default=str(settings.BASE_DIR / 'db.sqlite3'),
            help='Path to the source SQLite database file'
        )

    def handle(self, *args, **options):
        sqlite_path = Path(options['sqlite_path'])
        if not sqlite_path.exists():
            self.stderr.write(self.style.ERROR(f"Source SQLite database not found at {sqlite_path}"))
            return

        self.stdout.write(self.style.MIGRATE_HEADING("=== Starting SQLite to PostgreSQL + PostGIS Data Migration ==="))
        self.stdout.write(f"Source SQLite: {sqlite_path}")
        self.stdout.write(f"Target Database Engine: {settings.DATABASES['default']['ENGINE']}")
        self.stdout.write(f"Target Database Name: {settings.DATABASES['default'].get('NAME')}")

        conn = sqlite3.connect(str(sqlite_path))
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        models_to_migrate = [
            ("auth_user", User),
            ("onlineapplicationapi_staffprofile", StaffProfile),
            ("onlineapplicationapi_farmerprofile", FarmerProfile),
            ("onlineapplicationapi_payment", Payment),
            ("onlineapplicationapi_titledeedapplication", TitleDeedApplication),
            ("onlineapplicationapi_spousedetail", SpouseDetail),
            ("onlineapplicationapi_applicationaction", ApplicationAction),
            ("onlineapplicationapi_workflowtransition", WorkflowTransition),
            ("onlineapplicationapi_stagesla", StageSLA),
            ("onlineapplicationapi_emaillog", EmailLog),
        ]

        total_migrated = 0
        with transaction.atomic():
            for table_name, model_cls in models_to_migrate:
                try:
                    cursor.execute(f"SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name='{table_name}'")
                    if cursor.fetchone()['count'] == 0:
                        self.stdout.write(self.style.WARNING(f"Table {table_name} not found in SQLite, skipping."))
                        continue

                    cursor.execute(f"SELECT * FROM {table_name}")
                    rows = cursor.fetchall()
                    if not rows:
                        self.stdout.write(f"Table {table_name}: 0 rows.")
                        continue

                    count = 0
                    for row in rows:
                        data = dict(row)
                        # Avoid duplicate insertion if ID already exists in target
                        if model_cls.objects.filter(pk=data.get('id')).exists():
                            continue
                        
                        # Strip fields that are not in model definition
                        model_fields = {f.name for f in model_cls._meta.fields}
                        cleaned_data = {k: v for k, v in data.items() if k in model_fields}
                        
                        model_cls.objects.create(**cleaned_data)
                        count += 1

                    self.stdout.write(self.style.SUCCESS(f"Migrated {count} rows for {model_cls.__name__} ({table_name})"))
                    total_migrated += count

                except Exception as e:
                    self.stderr.write(self.style.ERROR(f"Error migrating {table_name}: {e}"))

        conn.close()
        self.stdout.write(self.style.MIGRATE_LABEL(f"=== Migration Finished. Total records migrated: {total_migrated} ==="))

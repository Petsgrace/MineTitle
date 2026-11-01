"""
Management command to verify the cryptographic integrity of the blockchain-style
(hash-chained) audit ledger across all Title Deed applications.
"""
from django.core.management.base import BaseCommand
from onlineapplicationapi.models import TitleDeedApplication, ApplicationAction

class Command(BaseCommand):
    help = "Verifies the cryptographic hash-chained audit ledger for all title deed applications."

    def add_arguments(self, parser):
        parser.add_argument(
            '--application-id',
            type=int,
            help='Check a specific application ID only',
        )

    def handle(self, *args, **options):
        app_id = options.get('application_id')
        if app_id:
            qs = TitleDeedApplication.objects.filter(id=app_id)
        else:
            qs = TitleDeedApplication.objects.all().order_by('id')

        total_checked = 0
        total_blocks = 0
        tampered_count = 0
        self.stdout.write(self.style.NOTICE("Starting blockchain-style audit ledger verification..."))

        for app in qs:
            res = ApplicationAction.verify_application_ledger(app.id)
            total_checked += 1
            blocks = res.get('total_blocks', 0)
            total_blocks += blocks

            if not res.get('is_valid', True):
                tampered_count += 1
                self.stdout.write(self.style.ERROR(
                    f"[TAMPERED] Application {app.reference_number or app.id}: "
                    f"Block #{res.get('tampered_at_block')} failed! Reason: {res.get('reason')}"
                ))
            else:
                if blocks > 0:
                    self.stdout.write(self.style.SUCCESS(
                        f"[VALID] Application {app.reference_number or app.id}: "
                        f"{blocks} blocks verified. Latest hash: {res.get('latest_block_hash')[:16]}..."
                    ))

        self.stdout.write("--------------------------------------------------")
        if tampered_count == 0:
            self.stdout.write(self.style.SUCCESS(
                f"Ledger Verification Complete: {total_checked} applications, {total_blocks} total blocks verified. ZERO tamper events detected."
            ))
        else:
            self.stdout.write(self.style.ERROR(
                f"Ledger Verification Alert: Found {tampered_count} tampered application ledgers out of {total_checked}!"
            ))

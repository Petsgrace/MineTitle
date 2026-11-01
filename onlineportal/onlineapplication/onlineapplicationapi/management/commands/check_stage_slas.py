"""
Management command to scan for overdue applications, flag them with is_overdue=True,
and dispatch escalation emails to department notification addresses.
"""
from django.core.management.base import BaseCommand
from onlineapplicationapi.services.workflow_service import check_overdue_applications

class Command(BaseCommand):
    help = "Checks applications against their stage due dates and flags overdue items."

    def handle(self, *args, **options):
        self.stdout.write(self.style.NOTICE("Scanning applications for stage SLA compliance..."))
        result = check_overdue_applications()
        count = result.get('overdue_flagged_count', 0)
        if count > 0:
            self.stdout.write(self.style.WARNING(
                f"Flagged {count} newly overdue application(s): {result.get('flagged_application_ids')}"
            ))
        else:
            self.stdout.write(self.style.SUCCESS("All active applications are within SLA tolerances."))

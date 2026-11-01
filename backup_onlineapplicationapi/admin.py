from django.contrib import admin
from django.utils.html import format_html
from .models import (
    FarmerProfile, TitleDeedApplication, SpouseDetail, 
    StaffProfile, ApplicationAction, EmailLog
)


@admin.register(EmailLog)
class EmailLogAdmin(admin.ModelAdmin):
    """Admin interface for email logs with filtering and search"""
    
    list_display = [
        'recipient', 
        'subject_short', 
        'status_badge', 
        'application_link', 
        'sent_at',
        'attempts'
    ]
    list_filter = ['status', 'sent_at']
    search_fields = ['recipient', 'subject', 'application__id', 'error_message']
    readonly_fields = ['sent_at', 'status_badge', 'error_display', 'attempts']
    date_hierarchy = 'sent_at'
    actions = ['retry_failed_emails']
    
    fieldsets = (
        ('Email Details', {
            'fields': ('recipient', 'subject', 'body'),
            'description': 'You can edit the recipient email address to correct typos before retrying.'
        }),
        ('Status', {
            'fields': ('status', 'status_badge', 'attempts', 'sent_at')
        }),
        ('Related Data', {
            'fields': ('application',)
        }),
        ('Error Information', {
            'fields': ('error_message', 'error_display'),
            'classes': ('collapse',)
        }),
    )
    
    def get_readonly_fields(self, request, obj=None):
        """Make recipient editable only for failed emails"""
        if obj and obj.status == 'failed':
            # For failed emails, allow editing recipient
            return ['sent_at', 'status_badge', 'error_display', 'attempts', 'status']
        return ['sent_at', 'status_badge', 'error_display', 'attempts', 'recipient', 'subject', 'body', 'status']
    
    def retry_failed_emails(self, request, queryset):
        """Admin action to retry sending failed emails"""
        from .utils.email_logger import send_email_with_logging
        
        failed_emails = queryset.filter(status='failed')
        success_count = 0
        
        for email_log in failed_emails:
            # Increment attempts
            email_log.attempts += 1
            email_log.save(update_fields=['attempts'])
            
            # Try sending with potentially updated recipient
            success = send_email_with_logging(
                recipient=email_log.recipient,
                subject=email_log.subject,
                body=email_log.body,
                application=email_log.application
            )
            
            if success:
                success_count += 1
                # Mark old entry as retried (don't delete in case of audit needs)
                email_log.status = 'success'
                email_log.error_message = f"Retried successfully after {email_log.attempts} attempts"
                email_log.save()
        
        self.message_user(
            request,
            f"Successfully retried {success_count} out of {failed_emails.count()} failed emails."
        )
    retry_failed_emails.short_description = "Retry sending failed emails"
    
    def subject_short(self, obj):
        """Truncate long subjects"""
        if len(obj.subject) > 50:
            return f"{obj.subject[:50]}..."
        return obj.subject
    subject_short.short_description = "Subject"
    
    def status_badge(self, obj):
        """Display status with color coding"""
        colors = {
            'success': '#28a745',
            'failed': '#dc3545',
            'pending': '#ffc107'
        }
        return format_html(
            '<span style="background-color: {}; color: white; padding: 3px 10px; border-radius: 3px;">{}</span>',
            colors.get(obj.status, '#6c757d'),
            obj.get_status_display()
        )
    status_badge.short_description = "Status"
    
    def application_link(self, obj):
        """Link to related application if exists"""
        if obj.application:
            return format_html(
                '<a href="/admin/onlineapplicationapi/titledeedapplication/{}/change/">App #{}</a>',
                obj.application.id,
                obj.application.id
            )
        return "-"
    application_link.short_description = "Application"
    
    def error_display(self, obj):
        """Format error message for display"""
        if obj.error_message:
            return format_html('<pre style="white-space: pre-wrap;">{}</pre>', obj.error_message)
        return "No errors"
    error_display.short_description = "Error Details"


@admin.register(TitleDeedApplication)
class TitleDeedApplicationAdmin(admin.ModelAdmin):
    """Admin interface for applications"""
    list_display = ['id', 'farmer', 'farm_name', 'district', 'status', 'created_at']
    list_filter = ['status', 'district', 'created_at']
    search_fields = ['farmer_details__surname', 'farmer_details__first_name', 'farm_name']
    readonly_fields = ['created_at', 'updated_at']
    
    fieldsets = (
        ('Farmer Information', {
            'fields': ('farmer_details',)
        }),
        ('Farm Details', {
            'fields': ('farm_name', 'district', 'plot_number', 'farm_extent')
        }),
        ('Status', {
            'fields': ('status', 'created_at', 'updated_at')
        }),
    )


admin.site.register(FarmerProfile)
admin.site.register(SpouseDetail)
admin.site.register(StaffProfile)
admin.site.register(ApplicationAction)


# --- Dashboard Statistics Patch ---

from django.utils import timezone
from datetime import timedelta
from django.db.models import Count, Q

if not hasattr(admin.site, 'is_patched_for_stats'):
    original_index = admin.site.index

    def index_with_stats(request, extra_context=None):
        """
        Custom admin index with email statistics injected into context
        """
        extra_context = extra_context or {}
        
        # Get email statistics for last 7 days
        since = timezone.now() - timedelta(days=7)
        
        email_stats = EmailLog.objects.filter(sent_at__gte=since).aggregate(
            total=Count('id'),
            successful=Count('id', filter=Q(status='success')),
            failed=Count('id', filter=Q(status='failed')),
            pending=Count('id', filter=Q(status='pending'))
        )
        
        total = email_stats['total'] or 0
        successful = email_stats['successful'] or 0
        success_rate = (successful / total * 100) if total > 0 else 0
        
        # Get recent failed emails
        recent_failures = EmailLog.objects.filter(
            status='failed'
        ).order_by('-sent_at')[:10]
        
        # Get today's stats
        today = timezone.now().date()
        today_stats = EmailLog.objects.filter(
            sent_at__date=today
        ).aggregate(
            total=Count('id'),
            successful=Count('id', filter=Q(status='success')),
            failed=Count('id', filter=Q(status='failed'))
        )
        
        extra_context.update({
            'email_stats': {
                'total': total,
                'successful': successful,
                'failed': email_stats['failed'],
                'pending': email_stats['pending'],
                'success_rate': round(success_rate, 1),
            },
            'today_stats': today_stats,
            'recent_failures': recent_failures,
        })
        
        return original_index(request, extra_context=extra_context)

    # Apply the patch
    admin.site.index = index_with_stats
    admin.site.is_patched_for_stats = True
    
    # Customize admin headers
    admin.site.site_header = "Title Deed Application Administration"
    admin.site.site_title = "Title Deed Admin"
    admin.site.index_title = "Application Management Dashboard"

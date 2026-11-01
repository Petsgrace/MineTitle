"""
Email logging utility for tracking all email sending attempts.
Wraps Django's send_mail to log successes and failures.
"""

from django.core.mail import send_mail
from django.conf import settings
from onlineapplicationapi.models import EmailLog
import logging

logger = logging.getLogger(__name__)


import threading

def _send_mail_async(email_log_id, recipient, subject, body, html_message=None):
    """
    Background worker function that performs the actual SMTP call and updates
    the log entry.
    """
    try:
        # Fetch the pending email log instance
        # In tests, this might fail because the test database tears down before the thread runs
        try:
            email_log = EmailLog.objects.get(id=email_log_id)
        except EmailLog.DoesNotExist:
            logger.warning(f"EmailLog {email_log_id} not found. DB might have been cleared by a test.")
            return
        
        # Attempt to send email
        logger.info(f"Sending email to {recipient}: {subject}")
        send_mail(
            subject=subject,
            message=body,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[recipient],
            fail_silently=False,
            html_message=html_message
        )
        
        # Update log to success
        email_log.status = 'success'
        email_log.save(update_fields=['status'])
        
        logger.info(f"Email sent successfully to {recipient}")
        
    except Exception as e:
        # Log failure
        error_message = str(e)
        logger.error(f"Failed to send email to {recipient}: {error_message}")
        
        try:
            email_log = EmailLog.objects.get(id=email_log_id)
            email_log.status = 'failed'
            email_log.error_message = error_message
            email_log.save(update_fields=['status', 'error_message'])
        except Exception as inner_e:
            logger.error(f"Failed to update failed email log: {str(inner_e)}")

def send_email_with_logging(recipient, subject, body, application=None, html_message=None):
    """
    Queue email and log the attempt to database. The actual sending happens
    asynchronously in a background thread to prevent blocking.
    
    Args:
        recipient (str): Email recipient address
        subject (str): Email subject line
        body (str): Plain text email body
        application (TitleDeedApplication, optional): Related application
        html_message (str, optional): HTML version of email body
        
    Returns:
        bool: True if email queued successfully, False otherwise
    """
    try:
        # Create pending log entry
        email_log = EmailLog.objects.create(
            recipient=recipient,
            subject=subject,
            body=body,
            status='pending',
            application=application
        )
        
        # Spawn a thread to handle the SMTP sending immediately
        thread = threading.Thread(
            target=_send_mail_async,
            args=(email_log.id, recipient, subject, body, html_message)
        )
        thread.daemon = True
        thread.start()
        
        return True
        
    except Exception as e:
        error_message = str(e)
        logger.error(f"Failed to queue email to {recipient}: {error_message}")
        
        # If log creation failed, try to create a failed log
        try:
            EmailLog.objects.create(
                recipient=recipient,
                subject=subject,
                body=body,
                status='failed',
                application=application,
                error_message=f"Log creation failed: {error_message}"
            )
        except Exception:
            pass
            
        return False


def retry_failed_email(email_log_id):
    """
    Retry sending a failed email.
    
    Args:
        email_log_id (int): ID of the EmailLog entry to retry
        
    Returns:
        bool: True if retry successful, False otherwise
    """
    try:
        email_log = EmailLog.objects.get(id=email_log_id, status='failed')
        
        # Increment attempt counter
        email_log.attempts += 1
        email_log.save(update_fields=['attempts'])
        
        # Try sending again
        success = send_email_with_logging(
            recipient=email_log.recipient,
            subject=email_log.subject,
            body=email_log.body,
            application=email_log.application
        )
        
        if success:
            # Delete the old failed log since we created a new success log
            email_log.delete()
            
        return success
        
    except EmailLog.DoesNotExist:
        logger.error(f"EmailLog {email_log_id} not found or not failed")
        return False
    except Exception as e:
        logger.error(f"Error retrying email {email_log_id}: {str(e)}")
        return False


def get_email_statistics(days=7):
    """
    Get email sending statistics for the last N days.
    
    Args:
        days (int): Number of days to analyze
        
    Returns:
        dict: Statistics including total, success, failed counts and rate
    """
    from datetime.timedelta import timedelta
    from django.utils import timezone
    from django.db.models import Count, Q
    
    since = timezone.now() - timedelta(days=days)
    
    stats = EmailLog.objects.filter(sent_at__gte=since).aggregate(
        total=Count('id'),
        successful=Count('id', filter=Q(status='success')),
        failed=Count('id', filter=Q(status='failed')),
        pending=Count('id', filter=Q(status='pending'))
    )
    
    total = stats['total'] or 0
    successful = stats['successful'] or 0
    
    success_rate = (successful / total * 100) if total > 0 else 0
    
    return {
        'total': total,
        'successful': successful,
        'failed': stats['failed'],
        'pending': stats['pending'],
        'success_rate': round(success_rate, 2),
        'period_days': days
    }

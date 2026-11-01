"""
Email Service
Handles all email composition and sending for the application.
Implements Single Responsibility Principle - only handles email operations.
"""

from typing import Optional
from ..models import TitleDeedApplication
from ..utils.email_logger import send_email_with_logging


class EmailService:
    """Service for composing and sending application-related emails."""
    
    EMAIL_SIGNATURE = """

Kind Regards,
Title Deeds One Stop Center"""
    
    @staticmethod
    def _send_email(application: TitleDeedApplication, subject: str, message: str):
        """
        Internal method to send email with logging.
        
        Args:
            application: Application instance
            subject: Email subject
            message: Email body (signature will be appended)
        """
        recipient_email = application.farmer.email
        full_message = f"{message}{EmailService.EMAIL_SIGNATURE}"
        
        print(f"Sending email to {recipient_email}: {subject}")
        send_email_with_logging(
            recipient=recipient_email,
            subject=subject,
            body=full_message,
            application=application
        )
    
    @staticmethod
    def send_application_received(application: TitleDeedApplication):
        """
        Send welcome email when application is successfully submitted.
        
        Args:
            application: Newly created application
        """
        farmer = application.farmer
        message = f'''Dear {farmer.first_name},

Your title deed application for farm "{application.farm_name}" has been successfully submitted.

Application ID: #{application.id}
Status: Pending Review

You will receive email updates as your application progresses through the verification stages.

Thank you for using the Title Deeds One Stop Center online portal.'''
        
        EmailService._send_email(
            application,
            'Application Received - Title Deed Application',
            message
        )
    
    @staticmethod
    def send_lims_verified(application: TitleDeedApplication):
        """Send email when LIMS verification is complete."""
        message = 'Your application has been verified by LIMS.'
        EmailService._send_email(application, 'Application Update: LIMS Verified', message)
    
    @staticmethod
    def send_lims_query(application: TitleDeedApplication, reason: str):
        """Send email when LIMS queries the application."""
        message = f'Your application has been queried by LIMS. Reason: {reason}'
        EmailService._send_email(application, 'Application Update: LIMS Query', message)
    
    @staticmethod
    def send_zlc_verified(application: TitleDeedApplication):
        """Send email when ZLC verification is complete."""
        message = 'Your application has been verified by the Zimbabwe Land Commission.'
        EmailService._send_email(application, 'Application Update: ZLC Verified', message)
    
    @staticmethod
    def send_dispute_logged(application: TitleDeedApplication, dispute_nature: str):
        """Send email when a dispute is logged."""
        message = f'A dispute has been logged against your farm: {dispute_nature}. Please contact the office.'
        EmailService._send_email(application, 'Application Update: Dispute Logged', message)
    
    @staticmethod
    def send_survey_fee_notice(application: TitleDeedApplication, fee_amount):
        """
        Send email notifying farmer of required survey fee.
        
        Args:
            application: Application instance
            fee_amount: Survey fee amount
        """
        farmer = application.farmer
        message = f'''Dear {farmer.first_name},

A technical survey is required for your farm "{application.farm_name}".

Survey Fee Required: ${fee_amount}

Please proceed to pay the survey fee to continue with your application. Once payment is confirmed, a surveyor will be assigned to measure and verify your farm details.

Payment can be made at your nearest District Lands Office.'''
        
        EmailService._send_email(application, 'Survey Fee Required', message)
    
    @staticmethod
    def send_survey_complete(application: TitleDeedApplication, hectarage, fee_note: str):
        """Send email when survey is completed."""
        message = f'Your farm has been surveyed. Confirmed Extent: {hectarage} Ha. {fee_note}'
        EmailService._send_email(application, 'Application Update: Survey Complete', message)
    
    @staticmethod
    def send_valuation_approved(application: TitleDeedApplication):
        """
        Send email when valuation is approved and sent to Director.
        
        Args:
            application: Application instance
        """
        farmer = application.farmer
        message = f'''Dear {farmer.first_name},
        
Your application #{application.id} for farm "{application.farm_name}" has been valued.

Your application has been sent for final review and valuation.

You will be notified once the final review is complete and you will receive payment instructions.

Thank you for your patience.'''
        
        EmailService._send_email(
            application,
            'Valuation Approved - Purchase Price Calculated',
            message
        )
    
    @staticmethod
    def send_director_approval_payment_invitation(application: TitleDeedApplication):
        """
        Send email when Director approves, inviting farmer to select payment method.
        
        Args:
            application: Application instance
        """
        farmer = application.farmer
        message = f'''Dear {farmer.first_name},

Great news! Your application #{application.id} for farm "{application.farm_name}" has been approved following final valuation.

PURCHASE PRICE: ${application.purchase_price:,.2f}

NEXT STEPS - SELECT YOUR PAYMENT PLAN:
Please log in to the Online Application Portal at your earliest convenience to select your preferred payment option:
1. CASH (15% Discount available for full payment)
2. MORTGAGE (Select your preferred participating bank)

Once you select your payment method online, you will receive an invitation to visit the One Stop Center to sign your Agreement of Sale.

ONE STOP CENTER LOCATION:
Lands DepartmentHeadquarters
Block 2 Makombe Building Corner Harare Street and Herbet Chitepo Avenue

If you have any questions, please contact our support team.

Best regards,
Land Tenure Implementation Committee'''
        
        EmailService._send_email(
            application,
            'Action Required: Select Payment Method - Final Valuation Complete',
            message
        )
    
    @staticmethod
    def send_one_stop_center_invitation(application: TitleDeedApplication, payment_info: str):
        """
        Send invitation to visit One Stop Center after payment selection.
        
        Args:
            application: Application instance
            payment_info: Formatted payment method info
        """
        farmer = application.farmer
        payment_method = application.payment_plan
        
        message = f'''Dear {farmer.first_name},

Thank you for selecting your payment method for farm "{application.farm_name}".

PAYMENT SELECTION CONFIRMED:
════════════════════════════════════════
{payment_info}
Purchase Price: ${application.purchase_price}
════════════════════════════════════════

NEXT STEP - VISIT ONE STOP CENTER:
You are now invited to visit the One Stop Center physically to sign your Agreement of Sale and proceed with payment arrangements.

ONE STOP CENTER LOCATION:
One Stop Center Block 2 Makombe Building,
Corner Hebert Chitepo and Harare Street, Harare
Phone: +263719012035


REQUIRED DOCUMENTS TO BRING:
✓ National ID
✓ Tenure Document (Original and Copy)
✓ Proof of Payment (if already paid)
✓ $10 Processing Fee (for Agreement processing)


OFFICE HOURS:
Monday - Friday: 8:00 AM - 4:30 PM
(Closed on Public Holidays)

We look forward to finalizing your title deed process.'''
        
        EmailService._send_email(
            application,
            'Invitation to Visit One Stop Center - Sign Agreement of Sale',
            message
        )
    
    @staticmethod
    def send_agreement_generated(application: TitleDeedApplication, breakdown_text: str):
        """Send email when Agreement of Sale is generated."""
        message = f'Your Agreement of Sale has been generated.\\n\\n{breakdown_text}'
        EmailService._send_email(application, 'Agreement of Sale Ready', message)
    
    @staticmethod
    def send_title_deed_ready(application: TitleDeedApplication):
        """Send email when payment is verified and title deed is ready."""
        message = 'Your payment has been verified and your Title Deed is ready for collection.'
        EmailService._send_email(application, 'Title Deed Ready', message)
    
    @staticmethod
    def send_query_notification(application: TitleDeedApplication, reason: str):
        """
        Send email when application is queried by any officer.
        
        Args:
            application: Application instance
            reason: Reason for query
        """
        farmer = application.farmer
        message = f'''Dear {farmer.first_name},

Your Title Deed application (Application ID: #{application.id}) has been queried and requires your attention.

Reason for Query:
{reason}

To resolve this query, please visit your nearest District Lands Office with the required documentation. You may also respond through the online portal by resubmitting your application with the corrected information.

If you have any questions, please contact your nearest District Lands Office for assistance.'''
        
        EmailService._send_email(
            application,
            'Application Queried - Action Required',
            message
        )
    
    @staticmethod
    def send_rejection_notification(application: TitleDeedApplication, reason: str):
        """
        Send email when application is rejected.
        
        Args:
            application: Application instance
            reason: Reason for rejection
        """
        farmer = application.farmer
        message = f'''Dear {farmer.first_name},

We regret to inform you that your title deed application for farm "{application.farm_name}" has been rejected.

Reason: {reason}

If you believe this decision was made in error, please contact the LIMS office for further assistance.

Regards,
LIMS Team'''
        
        EmailService._send_email(
            application,
            'Application Rejected - Title Deed Application',
            message
        )

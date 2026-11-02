"""
Email Service
Handles all email composition and sending for the application.
Implements Single Responsibility Principle - only handles email operations.
"""

from typing import Optional
from ..models import TitleDeedApplication
from ..utils.email_logger import send_email_with_logging


class EmailService:

    @staticmethod
    def send_email_async(recipient: str, subject: str, body: str, application=None, html_message=None):
        """Asynchronously dispatches an email, logging every message in EmailLog without blocking."""
        try:
            return send_email_with_logging(
                recipient=recipient,
                subject=subject,
                body=body,
                application=application,
                html_message=html_message
            )
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning(f"Fallback logging for email dispatch failure: {e}")
            return None

    """Service for composing and sending application-related emails."""
    
    EMAIL_SIGNATURE = """

Kind Regards,
Title Deeds One Stop Center"""
    
    @staticmethod
    def send_verification_code(recipient_email: str, full_name: str, username: str, code: str):
        """
        Sends an official 6-digit ownership verification code to the user's Gmail box.
        Confirms the authenticity of the account owner for password reset and security actions.
        """
        subject = f"Verification Code: {code} - Title Deeds One Stop Center"
        
        body = f"""Dear {full_name or username},

You have requested to verify your identity and reset your password for the Unified Mobile App Title Deeds Processing & Land Management System.

Your 6-Digit Ownership Verification Code is:

    ================================
             [ {code} ]
    ================================

This verification code confirms your authenticity as the account owner.
It is valid for 15 minutes. For security reasons, never share this verification code with anyone.

Account Details:
- Registered Username / National ID: {username}
- Destination Mailbox: {recipient_email}

If you did not request this verification code, please ignore this email.

{EmailService.EMAIL_SIGNATURE}
Title Deeds One Stop Interactive Desk
Ministry of Lands, Agriculture, Fisheries, Water and Rural Development"""

        html_message = f"""
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 14px; background-color: #ffffff; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
            <div style="background: linear-gradient(135deg, #065f46 0%, #047857 100%); padding: 24px; border-radius: 10px; text-align: center; color: #ffffff; margin-bottom: 24px;">
                <h1 style="margin: 0; font-size: 20px; font-weight: 700; letter-spacing: 0.5px;">MINISTRY OF LANDS & AGRICULTURE</h1>
                <p style="margin: 4px 0 0 0; font-size: 13px; opacity: 0.9;">Title Deeds One Stop Center - Interactive Communication Desk</p>
            </div>
            
            <p style="font-size: 15px; color: #1e293b; margin-top: 0;">Dear <strong>{full_name or username}</strong>,</p>
            
            <p style="font-size: 14px; color: #475569; line-height: 1.6;">
                You have requested to confirm your account ownership and reset your password. Use the official 6-digit verification code below to verify your identity:
            </p>
            
            <div style="background-color: #f0fdf4; border: 2px dashed #059669; border-radius: 12px; padding: 20px; text-align: center; margin: 24px 0;">
                <div style="font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 1.5px; color: #065f46; margin-bottom: 8px;">
                    Ownership Authenticity Code
                </div>
                <div style="font-size: 38px; font-weight: 800; letter-spacing: 10px; color: #047857; font-family: 'Courier New', monospace;">
                    {code}
                </div>
                <div style="font-size: 12px; color: #15803d; margin-top: 8px;">
                    Valid for 15 minutes &bull; Single-use only
                </div>
            </div>
            
            <div style="background-color: #f8fafc; border-radius: 8px; padding: 14px 18px; margin-bottom: 24px; border: 1px solid #e2e8f0; font-size: 13px; color: #334155;">
                <div style="margin-bottom: 6px;"><strong>Registered Username / National ID:</strong> <span style="font-family: monospace; color: #0f172a; font-weight: 600;">{username}</span></div>
                <div><strong>Destination Mailbox:</strong> <span style="color: #0f172a;">{recipient_email}</span></div>
            </div>
            
            <p style="font-size: 12px; color: #64748b; line-height: 1.5; margin-bottom: 0;">
                <strong>Security Reminder:</strong> Ministry officers will never ask you for your verification code. If you did not initiate this request, you can safely disregard this email.
            </p>
            
            <div style="border-top: 1px solid #e2e8f0; margin-top: 24px; padding-top: 16px; font-size: 12px; color: #94a3b8; text-align: center;">
                Title Deeds One Stop Center Interactive Dispatch System<br/>
                Harare, Zimbabwe
            </div>
        </div>
        """
        
        try:
            return send_email_with_logging(
                recipient=recipient_email,
                subject=subject,
                body=body,
                html_message=html_message
            )
        except Exception as e:
            print(f"Error sending verification code to {recipient_email}: {e}")
            return False

    @staticmethod
    def send_mfa_otp(recipient_email: str, officer_name: str, otp_code: str):
        """
        Sends MFA 2-Factor authentication verification code to staff member.
        """
        subject = "Title Deeds One Stop Center MFA Security Verification Code"
        body = f"""Dear {officer_name},

Your 6-digit Multi-Factor Authentication (MFA) security code is:

    {otp_code}

This code expires in 5 minutes. Do not share this verification code with anyone.

If you did not initiate this login request, please alert the Security Administrator immediately.
{EmailService.EMAIL_SIGNATURE}"""
        try:
            send_email_with_logging(
                recipient=recipient_email,
                subject=subject,
                body=body,
                application=None
            )
        except Exception as e:
            print(f"Error sending MFA email to {recipient_email}: {e}")

    @staticmethod
    def _get_farmer_name(application: TitleDeedApplication) -> str:
        if application and getattr(application, 'farmer', None) and getattr(application.farmer, 'first_name', None):
            return application.farmer.first_name
        if application and getattr(application, 'beneficiary_name', None):
            return application.beneficiary_name.split()[0]
        return "Valued Beneficiary"

    @staticmethod
    def _send_email(application: TitleDeedApplication, subject: str, message: str):
        """
        Internal method to send email with logging.
        
        Args:
            application: Application instance
            subject: Email subject
            message: Email body (signature will be appended)
        """
        recipient_email = None
        if application and getattr(application, 'farmer', None) and getattr(application.farmer, 'email', None):
            recipient_email = application.farmer.email
        elif application and getattr(application, 'email', None):
            recipient_email = application.email
        
        if not recipient_email:
            print(f"[EmailService] Skipping email '{subject}' - no recipient email on application #{getattr(application, 'id', None)}")
            return

        full_message = f"{message}{EmailService.EMAIL_SIGNATURE}"
        
        print(f"Sending email to {recipient_email}: {subject}")
        try:
            send_email_with_logging(
                recipient=recipient_email,
                subject=subject,
                body=full_message,
                application=application
            )
        except Exception as e:
            print(f"[EmailService] Error sending email to {recipient_email}: {e}")
    
    @staticmethod
    def send_application_received(application: TitleDeedApplication):
        """
        Send welcome email when application is successfully submitted.
        
        Args:
            application: Newly created application
        """
        farmer_name = EmailService._get_farmer_name(application)
        message = f'''Dear {farmer_name},

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
        farmer_name = EmailService._get_farmer_name(application)
        message = f'''Dear {farmer_name},

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
        farmer_name = EmailService._get_farmer_name(application)
        message = f'''Dear {farmer_name},
        
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
        farmer_name = EmailService._get_farmer_name(application)
        message = f'''Dear {farmer_name},

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
        farmer_name = EmailService._get_farmer_name(application)
        message = f'''Dear {farmer_name},

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
        farmer_name = EmailService._get_farmer_name(application)
        message = f'''Dear {farmer_name},

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

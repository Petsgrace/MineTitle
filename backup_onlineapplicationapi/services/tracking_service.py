"""
Tracking PIN Service
Handles generation, hashing, and email delivery of citizen tracking PINs.
Used for 3-factor public application status tracking (National ID + Ref + PIN).
"""

import secrets
import hashlib
import logging
from django.utils import timezone
from ..utils.email_logger import send_email_with_logging

logger = logging.getLogger(__name__)


def generate_tracking_pin() -> str:
    """
    Generate a cryptographically secure 6-digit tracking PIN.
    Returns a zero-padded 6-digit string e.g. '038271'
    """
    return str(secrets.randbelow(900000) + 100000)  # Always 6 digits: 100000–999999


def hash_pin(pin: str) -> str:
    """
    Hash a PIN using SHA-256 with a fixed application salt.
    Simple and dependency-free (no bcrypt needed).
    """
    salt = "land-harmony-tracking-salt-2026"
    return hashlib.sha256(f"{salt}{pin}".encode()).hexdigest()


def verify_pin(submitted_pin: str, stored_hash: str) -> bool:
    """
    Verify a submitted PIN against the stored hash.
    Returns True if they match, False otherwise.
    """
    if not submitted_pin or not stored_hash:
        return False
    return hash_pin(submitted_pin) == stored_hash


def issue_tracking_pin(application) -> str:
    """
    Generate a new PIN, store its hash on the application, and email it to the citizen.

    Args:
        application: TitleDeedApplication instance

    Returns:
        The plain-text PIN (only returned here; never stored plain)
    """
    pin = generate_tracking_pin()
    pin_hash = hash_pin(pin)

    # Store the hash and timestamp on the application
    application.tracking_pin_hash = pin_hash
    application.tracking_pin_sent_at = timezone.now()
    application.save(update_fields=['tracking_pin_hash', 'tracking_pin_sent_at'])

    # Send PIN to citizen via email
    _send_tracking_pin_email(application, pin)

    logger.info(f"Tracking PIN issued for application #{application.id}")
    return pin


def _send_tracking_pin_email(application, pin: str):
    """Send the tracking PIN email to the citizen."""
    farmer = application.farmer
    subject = "Your Application Tracking PIN - CONFIDENTIAL"

    message = f"""Dear {farmer.first_name} {farmer.surname},

Your title deed application has been registered in the Land Harmony system and is now being processed.

You can check the status of your application at any time using our public tracking portal.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
YOUR TRACKING CREDENTIALS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
National ID:          {farmer.national_id}
Reference Number:     APP-{application.id:05d}
Tracking PIN:         {pin}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Track your application at:
https://landharmony.gov.zw/track

⚠️  IMPORTANT – KEEP THESE DETAILS CONFIDENTIAL
These credentials are personal and should not be shared with anyone.
The Ministry of Lands will never ask you for your PIN over the phone or email.
If you believe your PIN has been compromised, please contact our office immediately.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CONTACT US
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Phone: +263 719 012 035
Email: support@landharmony.gov.zw
Office: Block 2 Makombe Building, Corner Herbert Chitepo & Harare Street, Harare
Hours: Monday–Friday, 08:00–16:30

Kind Regards,
Land Harmony System
Ministry of Lands, Agriculture, Fisheries, Water and Rural Development"""

    send_email_with_logging(
        recipient=farmer.email,
        subject=subject,
        body=message,
        application=application,
    )

"""
Verification Service
Handles all officer verification workflows.
Implements Single Responsibility Principle - only handles verification business logic.
"""

from decimal import Decimal
from typing import Dict, Any, Optional
from django.contrib.auth.models import User
from ..models import TitleDeedApplication, ApplicationAction
from ..utils.fee_calculator import calculate_survey_fee
from .email_service import EmailService


class VerificationService:
    """Service for officer verification workflows."""
    
    @staticmethod
    def verify_lims(application: TitleDeedApplication, 
                    status_action: str,
                    reason: Optional[str],
                    officer: User,
                    comments: Optional[str] = None) -> Dict[str, Any]:
        """
        LIMS verification workflow.
        
        Args:
            application: Application to verify
            status_action: 'VERIFIED' or 'QUERY'
            reason: Reason for query (if status_action is QUERY)
            officer: Officer performing the action
            comments: Optional officer comments
        
        Returns:
            Dictionary with status message
        """
        from_st = application.status
        if status_action in ('QUERY', 'NOT_VERIFIED'):
            application.status = 'LIMS_QUERIED'
            application.queried_by = 'lims'
            application.rejection_reason = reason or "Discrepancy detected in cadastral or biometric records."
            application.lims_verification_status = False
            action_type = 'LIMS_QUERIED'
            note = f"Query: {reason}"
            EmailService.send_lims_query(application, reason)
        else:
            application.status = 'LIMS_VERIFIED'
            application.lims_verification_status = True
            application.rejection_reason = None
            action_type = 'LIMS_VERIFIED'
            note = comments or "Farm verified in cadastral database. Beneficiary biometrics matched."
            EmailService.send_lims_verified(application)
        
        if comments:
            application.officer_comments = comments
        
        application.save()
        
        ApplicationAction.objects.create(
            application=application,
            officer=officer,
            from_stage=from_st,
            to_stage=application.status,
            action_type=action_type,
            comment=note
        )
        
        return {'status': f'LIMS action: {action_type}'}
    
    @staticmethod
    def verify_application_fee(application: TitleDeedApplication,
                               is_paid: bool,
                               officer: User) -> Dict[str, Any]:
        """
        Accounts verification for $10 application fee.
        
        Args:
            application: Application to verify
            is_paid: Whether the fee is paid
            officer: Officer performing the action
        
        Returns:
            Dictionary with status and fee payment status
        """
        # Handle string booleans from multipart
        is_paid_bool = str(is_paid).lower() in ['true', '1', 'yes'] if is_paid is not None else False
        
        if is_paid_bool:
            application.application_fee_paid = True
            comment = "Application Fee ($10) PAID confirmed."
        else:
            application.application_fee_paid = False
            comment = "Application Fee ($10) NOT PAID. Will be added to purchase price."
        
        from_st = application.status
        if is_paid_bool:
            application.status = 'ACCOUNTS_CLEARED'
            application.application_fee_paid = True
            comment = "Application Fee ($10) PAID confirmed. Dossier released to Estates Officer."
            act_type = 'ACCOUNTS_PAID'
        else:
            application.application_fee_paid = False
            comment = "Application Fee ($10) NOT PAID."
            act_type = 'ACCOUNTS_UNPAID'
        
        application.save()
        
        ApplicationAction.objects.create(
            application=application,
            officer=officer,
            from_stage=from_st,
            to_stage=application.status,
            action_type=act_type,
            comment=comment
        )
        
        return {
            'status': 'Application fee checked',
            'fee_paid': application.application_fee_paid
        }
    
    @staticmethod
    def verify_estates(application: TitleDeedApplication,
                      officer: User,
                      comments: Optional[str] = None) -> Dict[str, str]:
        """
        Estates/Resettlement verification.
        
        Args:
            application: Application to verify
            officer: Officer performing the action
            comments: Optional officer comments
        
        Returns:
            Dictionary with status message
        """
        from_st = application.status
        application.status = 'ESTATES_CLEARED'
        application.resettlement_estate_cleared = True
        if comments:
            application.officer_comments = comments
        
        application.save()
        
        ApplicationAction.objects.create(
            application=application,
            officer=officer,
            from_stage=from_st,
            to_stage='ESTATES_CLEARED',
            action_type='ESTATES_CLEARED',
            comment=comments or "Farmer identity, tenure document scans, and National ID cleared."
        )
        
        return {'status': 'Estates verification complete'}
    
    @staticmethod
    def verify_zlc(application: TitleDeedApplication,
                  has_disputes: bool,
                  dispute_nature: Optional[str],
                  officer: User,
                  comments: Optional[str] = None) -> Dict[str, str]:
        """
        ZLC verification for disputes.
        
        Args:
            application: Application to verify
            has_disputes: Whether disputes exist
            dispute_nature: Nature of dispute (if has_disputes is True)
            officer: Officer performing the action
            comments: Optional officer comments
        
        Returns:
            Dictionary with status message
        """
        from_st = application.status
        act_upper = str(dispute_nature or '').upper() if has_disputes else 'CLEARED'
        raw_action = str(has_disputes).upper()
        
        if raw_action in ('DOUBLE_ALLOCATION', 'DOUBLE') or 'DOUBLE' in act_upper:
            application.has_double_allocation = True
            application.has_disputes = True
            application.dispute_nature = dispute_nature or "Double allocation detected in gazetted parcel records."
            application.status = 'ZLC_DOUBLE_ALLOCATION'
            application.rejection_reason = application.dispute_nature
            comment = f"Double Allocation Flagged: {application.dispute_nature}. Title deed issuance locked."
            log_type = 'ZLC_DOUBLE_ALLOCATION_LOCKED'
        elif raw_action in ('DISPUTE', 'TRUE', '1', 'YES') or has_disputes is True:
            application.has_disputes = True
            application.dispute_nature = dispute_nature or "Active land/boundary dispute registered with ZLC."
            application.status = 'ZLC_DISPUTED'
            application.rejection_reason = application.dispute_nature
            comment = f"Dispute Logged: {application.dispute_nature}. Title deed issuance locked."
            log_type = 'ZLC_DISPUTE_LOCKED'
            EmailService.send_dispute_logged(application, application.dispute_nature)
        else:
            application.has_disputes = False
            application.has_double_allocation = False
            application.dispute_nature = None
            application.status = 'ZLC_CLEARED'
            application.zlc_verification_status = True
            comment = comments or "Gazette records verified. No disputes or double allocations identified."
            log_type = 'ZLC_CLEARED'
            EmailService.send_zlc_verified(application)
        
        if comments:
            if comment:
                comment += f" | {comments}"
            else:
                comment = comments
            application.officer_comments = comments
        
        application.save()
        
        ApplicationAction.objects.create(
            application=application,
            officer=officer,
            from_stage=from_st,
            to_stage=application.status,
            action_type=log_type,
            comment=comment
        )
        
        return {'status': f'ZLC action: {log_type}', 'current_stage': application.status}
    
    @staticmethod
    def require_technical_survey(application: TitleDeedApplication,
                                 officer: User,
                                 comments: Optional[str] = None) -> Dict[str, Any]:
        """
        Require survey fee from farmer when farm is not surveyed.
        
        Args:
            application: Application requiring survey
            officer: Officer performing the action
            comments: Optional officer comments
        
        Returns:
            Dictionary with status and survey fee amount
        """
        # Calculate survey fee based on tenure document type
        survey_fee = calculate_survey_fee(application.tenure_document_type or '')
        
        application.survey_fee = survey_fee
        application.status = 'AWAITING_SURVEY_FEE'
        
        if comments:
            application.officer_comments = comments
        
        application.save()
        
        ApplicationAction.objects.create(
            application=application,
            officer=officer,
            action_type='SURVEY_FEE_REQUIRED',
            comment=comments
        )
        
        EmailService.send_survey_fee_notice(application, survey_fee)
        
        return {
            'status': 'Survey fee set, awaiting payment',
            'survey_fee': float(survey_fee)
        }
    
    @staticmethod
    def mark_surveyed(application: TitleDeedApplication,
                     hectarage: str,
                     new_farm_name: Optional[str],
                     old_district: Optional[str],
                     is_fee_paid: bool,
                     officer: User,
                     comments: Optional[str] = None) -> Dict[str, Any]:
        """
        Mark application as surveyed with verified data.
        
        Args:
            application: Application to mark as surveyed
            hectarage: Measured farm extent
            new_farm_name: Confirmed farm name (optional)
            old_district: Previous district if changed (optional)
            is_fee_paid: Whether survey fee was paid
            officer: Officer performing the action
            comments: Optional officer comments
        
        Returns:
            Dictionary with status and fee note
        """
        if not hectarage:
            return {'error': 'Hectarage required'}
        
        # Calculate survey fee
        survey_fee = calculate_survey_fee(application.tenure_document_type or '')
        application.survey_fee = survey_fee
        
        application.farm_extent = hectarage
        
        # Store OFFICIAL Confirmed details
        application.survey_hectarage_confirmed = hectarage
        if new_farm_name:
            application.farm_name = new_farm_name
            application.survey_farm_name_confirmed = new_farm_name
        else:
            application.survey_farm_name_confirmed = application.farm_name
        
        if old_district:
            application.old_district = old_district
        
        application.is_surveyed = True
        
        # Handle Fee Status
        raw_fee_status = str(is_fee_paid).lower()
        if is_fee_paid is True or raw_fee_status in ['true', '1', 'yes']:
            application.is_survey_fee_paid = True
            fee_note = "Survey Fee: PAID"
        else:
            application.is_survey_fee_paid = False
            fee_note = "Survey Fee: NOT PAID"
        
        application.status = 'SURVEYED'
        
        # Trigger rough price calculation
        calc_hectarage = application.survey_hectarage_confirmed or application.farm_extent
        application.purchase_price = float(calc_hectarage) * 500  # Example rate (Valuation will refine)
        
        notes = []
        if comments:
            notes.append(comments)
        notes.append(fee_note)
        application.officer_comments = "\n".join(notes)
        
        application.save()
        
        ApplicationAction.objects.create(
            application=application,
            officer=officer,
            action_type='TECHNICAL_SURVEY',
            comment=comments
        )
        
        EmailService.send_survey_complete(application, hectarage, fee_note)
        
        return {'status': 'Survey updated', 'fee_note': fee_note}
    
    @staticmethod
    def approve_valuation(application: TitleDeedApplication,
                         officer: User,
                         officer_comments: Optional[str] = None,
                         manual_price: Optional[str] = None,
                         price_override_reason: Optional[str] = None,
                         ecological_region: Optional[str] = None) -> Dict[str, Any]:
        """
        Approve valuation and calculate purchase price.
        
        Args:
            application: Application to valuate
            officer: Officer performing the action
            officer_comments: Optional officer comments
            manual_price: Manual price override (optional)
            price_override_reason: Reason for price override (optional)
            ecological_region: Ecological region override (optional)
        
        Returns:
            Dictionary with status and pricing details
        """
        from ..pricing import apply_pricing_to_application
        from rest_framework import status as http_status
        from rest_framework.response import Response
        
        # Save ecological region if provided
        if ecological_region:
            application.ecological_region = ecological_region
        
        # Calculate purchase price
        pricing_details = apply_pricing_to_application(application, save=False)
        
        # Handle manual price override if provided
        if manual_price is not None:
            try:
                manual_price_float = float(manual_price)
                if manual_price_float > 0:
                    original_price = pricing_details['purchase_price']
                    pricing_details['purchase_price'] = Decimal(str(manual_price_float))
                    override_note = f"[PRICE OVERRIDE] Original calculated price: ${original_price}, Adjusted to: ${manual_price_float}. Reason: {price_override_reason}"
                    if officer_comments:
                        application.officer_comments = f"{officer_comments}\\n\\n{override_note}"
                    else:
                        application.officer_comments = override_note
                else:
                    return Response({'error': 'Manual price must be greater than 0'}, status=http_status.HTTP_400_BAD_REQUEST)
            except (ValueError, TypeError):
                return Response({'error': 'Invalid price format'}, status=http_status.HTTP_400_BAD_REQUEST)
        else:
            if officer_comments:
                application.officer_comments = officer_comments
        
        application.valuation_approved = True
        application.status = 'VALUATED'
        application.calculated_land_value = pricing_details['calculated_land_value']
        application.purchase_price = pricing_details['purchase_price']
        application.save()
        
        ApplicationAction.objects.create(
            application=application,
            officer=officer,
            action_type='VALUATION_APPROVED'
        )
        
        EmailService.send_valuation_approved(application)
        
        return {
            'status': 'Valuation approved, awaiting payment',
            'pricing': pricing_details
        }

"""
Workflow Automation Engine for Title Deeds Processing.
Enforces 9 sequential stages, database-driven WorkflowTransition rules,
mandatory return comments, SLA due-date computations, hash-chained actions, and emails.
"""
from datetime import timedelta
from typing import Dict, Any, Optional, Tuple
from django.utils import timezone
from django.core.exceptions import ValidationError, PermissionDenied
from django.contrib.auth.models import User
import logging

logger = logging.getLogger(__name__)

STAGE_SEQUENCE = [
    'PENDING',
    'RESETTLEMENT_VERIFIED',
    'LIMS_VERIFIED',
    'ZLC_CLEARED',
    'GIS_VALIDATED',
    'SURVEYED',
    'VALUATED',
    'APPROVED',
    'READY_FOR_COLLECTION',
]

def get_user_role(user: User) -> str:
    """Returns staff profile role or 'applicant' or 'admin'."""
    if not user or not user.is_authenticated:
        return 'anonymous'
    if user.is_superuser or (hasattr(user, 'staff_profile') and user.staff_profile.role == 'admin'):
        return 'admin'
    if hasattr(user, 'staff_profile'):
        return user.staff_profile.role
    return 'applicant'

def can_user_act_on_application(user: User, application, target_stage: str) -> Tuple[bool, Optional[str]]:
    """
    Checks if a user has RBAC authorization to advance or return the application to target_stage.
    Returns (True, None) or (False, error_reason).
    """
    from onlineapplicationapi.models import WorkflowTransition
    
    role = get_user_role(user)
    if role in ('unassigned', 'ROLE_UNASSIGNED', 'anonymous'):
        return False, "Unassigned officers cannot act on applications. Contact the System Administrator."
    if hasattr(user, 'staff_profile') and getattr(user.staff_profile, 'is_unassigned', False):
        return False, "Unassigned officers cannot act on applications. Contact the System Administrator."
    if role == 'admin':
        return True, None
        
    current_stage = application.status
    
    # Query database-defined transition
    transition = WorkflowTransition.objects.filter(
        from_stage=current_stage,
        to_stage=target_stage,
        allowed_role=role
    ).first()
    
    if not transition:
        return False, f"Role '{role}' is not authorized to transition from '{current_stage}' to '{target_stage}'."
        
    return True, None

def execute_stage_transition(
    user: User,
    application,
    target_stage: str,
    comment: str = "",
    extra_fields: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Executes a sequential stage transition or return.
    Strictly validates role, sequential steps, mandatory return comments,
    SLA computation, hash-chain ledger append, and email notification.
    """
    from onlineapplicationapi.models import (
        WorkflowTransition, StageSLA, ApplicationAction, TitleDeedApplication
    )
    from onlineapplicationapi.services.email_service import EmailService

    current_stage = application.status
    role = get_user_role(user)

    curr_idx = STAGE_SEQUENCE.index(current_stage) if current_stage in STAGE_SEQUENCE else 0
    targ_idx = STAGE_SEQUENCE.index(target_stage) if target_stage in STAGE_SEQUENCE else 0
    
    # Check if stages are being skipped (prohibited -> HTTP 400)
    if targ_idx > curr_idx + 1:
        raise ValidationError(f"Invalid transition: stage jumping is prohibited. Cannot skip from '{current_stage}' to '{target_stage}'.")

    # Check RBAC authorization for this transition
    allowed, reason = can_user_act_on_application(user, application, target_stage)
    if not allowed:
        raise PermissionDenied(reason or "Forbidden: Unauthorized stage transition.")

    # Check if this is a return transition (requires mandatory comment)
    is_return = False
    if targ_idx < curr_idx:
        is_return = True
        if not comment or not comment.strip():
            raise ValidationError("A mandatory explanatory comment is required when returning an application to a previous stage.")

    # Fetch transition SLA and configuration
    trans_obj = WorkflowTransition.objects.filter(
        from_stage=current_stage,
        to_stage=target_stage
    ).first()
    
    sla_days = trans_obj.sla_days if trans_obj else 5
    stage_sla = StageSLA.objects.filter(stage=target_stage).first()
    if stage_sla and stage_sla.sla_days:
        sla_days = stage_sla.sla_days

    # Update application fields
    now = timezone.now()
    application.status = target_stage
    application.current_stage_entered_at = now
    application.current_stage_due_date = now + timedelta(days=sla_days)
    application.is_overdue = False
    
    # Apply extra fields if provided (e.g. cadastral_id, survey_fee, etc.)
    if extra_fields:
        for k, v in extra_fields.items():
            if hasattr(application, k):
                setattr(application, k, v)
                
    application.save()

    # Append immutable, hash-chained ApplicationAction ledger block
    action_type = "RETURN" if is_return else "ADVANCE"
    action = ApplicationAction(
        application=application,
        officer=user,
        from_stage=current_stage,
        to_stage=target_stage,
        action_type=action_type,
        comment=comment.strip() if comment else f"Application moved to {target_stage}"
    )
    action.save()

    # C1: Automatic scoring at ZLC and GIS stages
    if target_stage in ['ZLC_CLEARED', 'GIS_VALIDATED']:
        try:
            from onlineapplicationapi.services.ai_predictor import predict_conflict
            pred = predict_conflict(application)
            application.ai_conflict_score = pred.get('risk_score', 0)
            application.ai_conflict_level = pred.get('risk_level', 'LOW')
            application.ai_conflict_details = pred
            application.ai_model_version = "Gradient Boosting v2.1 (Prototype)"
            application.ai_risk_reasons = pred.get('top_contributing_features', [])
            application.ai_assessed_at = timezone.now()
            application.save(update_fields=[
                'ai_conflict_score', 'ai_conflict_level', 'ai_conflict_details',
                'ai_model_version', 'ai_risk_reasons', 'ai_assessed_at'
            ])
            reasons = application.ai_risk_reasons or []
            reasons_formatted = [
                (r.get('description') or r.get('feature') or str(r)) if isinstance(r, dict) else str(r)
                for r in reasons[:3]
            ]
            reasons_str = ', '.join(reasons_formatted) if reasons_formatted else 'None identified'
            ai_action = ApplicationAction(
                application=application,
                officer=user,
                from_stage=target_stage,
                to_stage=target_stage,
                action_type="AI_ASSESSMENT",
                comment=f"Automated AI Conflict Risk Assessment ({target_stage}): Risk {application.ai_conflict_level} ({application.ai_conflict_score}%). Contributing factors: {reasons_str}. Advisory only."
            )
            ai_action.save()
        except Exception as e:
            logger.warning(f"Failed to re-evaluate AI conflict risk at stage {target_stage}: {e}")

    # Dispatch notification email asynchronously
    try:
        recipient_email = stage_sla.notification_email if stage_sla and stage_sla.notification_email else "registry@lands.gov.zw"
        subj = f"Application {application.reference_number} Arrived at {target_stage}"
        body = (
            f"Official Notification: Title Deed Application {application.reference_number} "
            f"({application.farm_name}, {application.district}) has transitioned to {target_stage}.\n"
            f"Allocated SLA: {sla_days} calendar days.\n"
            f"Due Date: {application.current_stage_due_date.strftime('%Y-%m-%d %H:%M')}.\n"
            f"Actioned by: {user.username} ({role}).\n"
            f"Notes: {comment or 'None'}"
        )
        EmailService.send_email_async(
            recipient=recipient_email,
            subject=subj,
            body=body,
            application=application
        )
    except Exception as e:
        logger.warning(f"Failed to dispatch transition email: {e}")

    return {
        "status": "SUCCESS",
        "previous_stage": current_stage,
        "new_stage": target_stage,
        "is_return": is_return,
        "due_date": application.current_stage_due_date.isoformat(),
        "block_hash": action.block_hash,
    }

def check_overdue_applications() -> Dict[str, Any]:
    """
    Finds applications that have exceeded their stage due date, marks is_overdue=True,
    and dispatches overdue warning emails.
    """
    from onlineapplicationapi.models import TitleDeedApplication, StageSLA
    from onlineapplicationapi.services.email_service import EmailService

    now = timezone.now()
    overdue_qs = TitleDeedApplication.objects.filter(
        current_stage_due_date__lt=now
    ).exclude(status='READY_FOR_COLLECTION')

    count = 0
    flagged_ids = []
    
    for app in overdue_qs:
        if not app.is_overdue:
            app.is_overdue = True
            app.save(update_fields=['is_overdue'])
            count += 1
            flagged_ids.append(app.id)
            
            # Send overdue email
            sla_info = StageSLA.objects.filter(stage=app.status).first()
            recipient = sla_info.notification_email if sla_info and sla_info.notification_email else "supervision@lands.gov.zw"
            subj = f"OVERDUE ALERT: Application {app.reference_number} ({app.status})"
            body = (
                f"SLA OVERDUE NOTICE\n"
                f"Application {app.reference_number} for farm '{app.farm_name}' in {app.district} "
                f"is currently OVERDUE in stage: {app.status}.\n"
                f"Due Date was: {app.current_stage_due_date.strftime('%Y-%m-%d %H:%M')}.\n"
                f"Please expedite departmental review immediately."
            )
            EmailService.send_email_async(
                recipient=recipient,
                subject=subj,
                body=body,
                application=app
            )

    return {
        "overdue_flagged_count": count,
        "flagged_application_ids": flagged_ids,
        "checked_at": now.isoformat()
    }

import logging
logger = logging.getLogger(__name__)

from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError as DRFValidationError, PermissionDenied
from django.core.exceptions import ValidationError as DjangoValidationError, PermissionDenied as DjangoPermissionDenied
from .constants import (
    APPLICATION_STAGES, STAGE_SEQUENCE, ROLE_STAGE_MAP,
    ROLE_ADMIN, ROLE_DIRECTOR, ROLE_APPLICANT, ALLOWED_DOCUMENT_FIELDS
)
from .services.workflow_service import execute_stage_transition
from .services.tracking_service import issue_tracking_pin, verify_pin
from .services.ai_predictor import predict_conflict
from .services.spatial_service import check_spatial_overlaps
from .services.reporting_service import get_analytics_summary, generate_csv_report, generate_pdf_report
from .models import validate_zimbabwe_national_id

from django.utils import timezone
from django.contrib.auth.models import User
from django.core.mail import send_mail
from .utils.email_logger import send_email_with_logging
from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from .models import FarmerProfile, TitleDeedApplication, SpouseDetail, ApplicationAction, Payment
from .serializers import FarmerProfileSerializer, TitleDeedApplicationSerializer, SpouseDetailSerializer, UserSerializer, StaffUserSerializer, UserProfileSerializer, PaymentSerializer
from django.views.decorators.csrf import ensure_csrf_cookie, csrf_exempt
from django.utils.decorators import method_decorator
from django.utils.decorators import method_decorator
from .permissions import IsOfficerOrAdmin, IsAssignedStaffOrAdmin
from .throttles import LoginRateThrottle, RegisterRateThrottle, AnonBurstRateThrottle

class FarmerProfileViewSet(viewsets.ModelViewSet):
    queryset = FarmerProfile.objects.all()
    serializer_class = FarmerProfileSerializer
    
    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    def get_queryset(self):
        user = self.request.user
        if not user or not user.is_authenticated:
            return FarmerProfile.objects.none()
        if user.is_staff or user.is_superuser:
            return FarmerProfile.objects.all()
        return FarmerProfile.objects.filter(user=user)


class TitleDeedApplicationViewSet(viewsets.ModelViewSet):
    serializer_class = TitleDeedApplicationSerializer

    def get_queryset(self):
        user = self.request.user
        if not user or not user.is_authenticated:
            return TitleDeedApplication.objects.none()
            
        base_qs = TitleDeedApplication.objects.select_related('farmer').prefetch_related('spouses')

        if user.is_superuser:
            return base_qs.all().order_by('-created_at')
            
        if hasattr(user, 'staff_profile'):
            profile = user.staff_profile
            if getattr(profile, 'is_unassigned', False) or profile.role in ('unassigned', 'none', ''):
                return TitleDeedApplication.objects.none()
            role = profile.role
            if role in (ROLE_ADMIN, ROLE_DIRECTOR):
                return base_qs.all().order_by('-created_at')
                
            target_stage = ROLE_STAGE_MAP.get(role)
            if target_stage:
                if isinstance(target_stage, (list, tuple, set)):
                    return base_qs.filter(status__in=target_stage).order_by('-created_at')
                return base_qs.filter(status=target_stage).order_by('-created_at')
            return TitleDeedApplication.objects.none()
            
        # Citizen / Farmer
        return base_qs.filter(farmer__user=user).order_by('-created_at')

    def get_permissions(self):
        if self.action == 'stats':
            return [permissions.AllowAny()]
        return super().get_permissions()

    @action(detail=False, methods=['get'], url_path='stats', permission_classes=[permissions.AllowAny])
    def stats(self, request):
        """
        Fast live system analytics and stage counters directly from Supabase PostgreSQL.
        """
        from django.db import connection
        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT status, count(*) FROM onlineapplicationapi_titledeedapplication GROUP BY status")
                status_counts = dict(cursor.fetchall())
                cursor.execute("SELECT count(*) FROM auth_user")
                user_count = cursor.fetchone()[0]
                cursor.execute("SELECT count(*) FROM onlineapplicationapi_farmerprofile")
                farmer_count = cursor.fetchone()[0]
            
            total_apps = sum(status_counts.values())
            return Response({
                'status': 'online',
                'database': 'Supabase PostgreSQL + PostGIS',
                'project_ref': 'pammnfmhqlwwtpcokxqv',
                'region': 'aws-0-eu-west-1',
                'total_applications': total_apps,
                'status_counts': status_counts,
                'user_count': user_count,
                'farmer_count': farmer_count,
                'stage_breakdown': {
                    'resettlement': status_counts.get('PENDING', 0),
                    'lims': status_counts.get('RESETTLEMENT_VERIFIED', 0),
                    'zlc': status_counts.get('LIMS_VERIFIED', 0),
                    'gis': status_counts.get('ZLC_CLEARED', 0),
                    'surveyor': status_counts.get('GIS_VALIDATED', 0),
                    'valuation': status_counts.get('SURVEYED', 0),
                    'director': status_counts.get('VALUATED', 0),
                    'deeds': status_counts.get('APPROVED', 0),
                    'collection': status_counts.get('READY_FOR_COLLECTION', 0)
                }
            }, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'status': 'error', 'detail': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        user = request.user
        
        # Verify staff queue isolation on detail view
        if hasattr(user, 'staff_profile'):
            role = user.staff_profile.role
            if role not in (ROLE_ADMIN, ROLE_DIRECTOR):
                expected_stage = ROLE_STAGE_MAP.get(role)
                if instance.status != expected_stage:
                    return Response(
                        {'error': f"Forbidden: Staff role '{role}' can only view applications in '{expected_stage}' queue."},
                        status=status.HTTP_403_FORBIDDEN
                    )
        elif not user.is_superuser:
            if not instance.farmer or instance.farmer.user != user:
                return Response({'error': 'Unauthorized'}, status=status.HTTP_403_FORBIDDEN)
                
        serializer = self.get_serializer(instance)
        return Response(serializer.data)

    @action(detail=True, methods=['post'], url_path='transition')
    def transition(self, request, pk=None):
        """
        Enforce sequential stage transitions and returns via WorkflowTransition engine.
        """
        application = TitleDeedApplication.objects.filter(pk=pk).first()
        if not application:
            return Response({'error': 'Application not found.'}, status=status.HTTP_404_NOT_FOUND)
        target_stage = request.data.get('target_stage')
        comment = request.data.get('comment', '')
        extra_fields = request.data.get('extra_fields', {})
        
        if not target_stage:
            return Response({'error': 'target_stage is required.'}, status=status.HTTP_400_BAD_REQUEST)
            
        try:
            result = execute_stage_transition(
                user=request.user,
                application=application,
                target_stage=target_stage,
                comment=comment,
                extra_fields=extra_fields
            )
            return Response(result, status=status.HTTP_200_OK)
        except (DjangoPermissionDenied, PermissionDenied) as pe:
            return Response({'error': str(pe)}, status=status.HTTP_403_FORBIDDEN)
        except (DjangoValidationError, DRFValidationError) as ve:
            return Response({'error': str(ve)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({'error': f"Transition failed: {str(e)}"}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['post'], url_path='assisted-capture')
    def assisted_capture(self, request):
        """
        Assisted Capture: allows an officer to submit an application on behalf of a walk-in citizen.
        """
        if not request.user.is_staff and not hasattr(request.user, 'staff_profile'):
            return Response({'error': 'Only authorized officers can perform assisted capture.'}, status=status.HTTP_403_FORBIDDEN)
            
        walk_in_name = request.data.get('walk_in_citizen_name', '').strip()
        walk_in_nat_id = request.data.get('walk_in_national_id', '').strip().upper()
        walk_in_phone = request.data.get('walk_in_phone', '').strip()
        farm_name = request.data.get('farm_name', '').strip()
        district = request.data.get('district', '').strip()
        province = request.data.get('province', '').strip()
        farm_extent = request.data.get('farm_extent', 0.0)
        
        if not walk_in_name or not walk_in_nat_id or not farm_name or not district:
            return Response({'error': 'Citizen name, National ID, Farm name, and District are required.'}, status=status.HTTP_400_BAD_REQUEST)
            
        try:
            validate_zimbabwe_national_id(walk_in_nat_id)
        except (DjangoValidationError, DRFValidationError) as ve:
            return Response({'error': str(ve)}, status=status.HTTP_400_BAD_REQUEST)
            
        app = TitleDeedApplication.objects.create(
            is_assisted_capture=True,
            assisted_by=request.user,
            walk_in_citizen_name=walk_in_name,
            walk_in_national_id=walk_in_nat_id,
            walk_in_phone=walk_in_phone,
            farm_name=farm_name,
            district=district,
            province=province,
            farm_extent=farm_extent,
            status='PENDING'
        )
        
        pin = issue_tracking_pin(app)
        
        ApplicationAction.objects.create(
            application=app,
            officer=request.user,
            from_stage='',
            to_stage='PENDING',
            action_type='ASSISTED_CAPTURE',
            comment=f"Assisted capture on behalf of walk-in citizen {walk_in_name} ({walk_in_nat_id}) by officer {request.user.username}"
        )
        
        return Response({
            'status': 'SUCCESS',
            'application_id': app.id,
            'reference_number': app.reference_number,
            'tracking_pin': pin,
            'message': 'Assisted capture created successfully. Tracking PIN generated.'
        }, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['get'], url_path='spatial')
    def spatial(self, request, pk=None):
        app = self.get_object()
        res = check_spatial_overlaps(app)
        return Response(res, status=status.HTTP_200_OK)

    def create(self, request, *args, **kwargs):
        idempotency_key = request.data.get('idempotency_key')
        if idempotency_key:
            existing = TitleDeedApplication.objects.filter(idempotency_key=idempotency_key).first()
            if existing:
                serializer = self.get_serializer(existing)
                return Response(serializer.data, status=status.HTTP_200_OK)
        return super().create(request, *args, **kwargs)

    def perform_create(self, serializer):
        try:
            from .services.profile_service import ProfileService
            from .services.email_service import EmailService
            from .services.integration_service import IntegrationService
            from .models import ApplicationAction, Payment
            from .services.tracking_service import issue_tracking_pin
            from .services.ai_predictor import predict_conflict
            from rest_framework.exceptions import ValidationError

            # Check if user is staff (officer assisting farmer with hard-copy)
            if self.request.user.is_staff:
                profile = ProfileService.get_or_create_farmer_profile_for_officer(
                    profile_data=self.request.data
                )
            else:
                profile = ProfileService.create_or_update_profile(
                    user=self.request.user,
                    profile_data=self.request.data
                )
            
            # Enforce one active application per farmer
            if TitleDeedApplication.objects.filter(farmer=profile).exists():
                raise ValidationError({
                    "error": "This farmer already has an active application. Each farmer is limited to one application."
                })

            # Receipt and Payment linking
            receipt_no = self.request.data.get('receipt_number') or self.request.data.get('statutory_fee_receipt')
            payment_obj = None
            if receipt_no:
                payment_obj = Payment.objects.filter(receipt_number=receipt_no, is_used=False).first()
                if not payment_obj:
                    if Payment.objects.filter(receipt_number=receipt_no, is_used=True).exists():
                        raise ValidationError({"receipt_number": "This payment receipt has already been used for an application."})
                    raise ValidationError({"receipt_number": "Invalid or unverified receipt number. Please make payment first."})

            application = serializer.save(
                farmer=profile, 
                status='PENDING', 
                statutory_fee_receipt=receipt_no,
                receipt_number=receipt_no,
                statutory_fee_paid=True if receipt_no else False
            )

            if payment_obj:
                payment_obj.is_used = True
                payment_obj.application = application
                payment_obj.save()

            # Run automated AI conflict score
            try:
                ai_res = predict_conflict(application)
                application.ai_conflict_score = ai_res.get('risk_score', 0)
                application.ai_conflict_level = ai_res.get('risk_level', 'LOW')
                application.ai_risk_reasons = ai_res.get('top_contributing_features', [])
                application.ai_model_version = "Gradient Boosting v2.1 (Prototype)"
                application.ai_assessed_at = timezone.now()
                application.save()
            except Exception as e:
                logger.warning(f"AI conflict scoring warning: {e}")

            # Seal with official records
            try:
                IntegrationService.seal_application(application)
            except Exception as seal_err:
                logger.warning(f"Integration seal non-critical error: {seal_err}")
                
            application.save()

            # Audit ledger entry
            ApplicationAction.objects.create(
                application=application,
                officer=self.request.user,
                from_stage='',
                to_stage='PENDING',
                action_type='INITIAL_SUBMISSION',
                comment=f"Initial application submitted by {self.request.user.username} (Receipt: {receipt_no or 'N/A'})"
            )

            # Issue tracking PIN
            try:
                issue_tracking_pin(application)
            except Exception as pin_error:
                logger.warning(f"Tracking PIN error: {pin_error}")

            # Send email
            try:
                EmailService.send_application_received(application)
            except Exception as email_err:
                logger.warning(f"Email send error: {email_err}")

        except Exception as e:
            raise

    def partial_update(self, request, *args, **kwargs):
        """Override partial_update to guard farmer edits by status."""
        application = self.get_object()
        if not request.user.is_staff:
            EDITABLE_STATUSES = ['PENDING', 'QUERIED']
            if application.status not in EDITABLE_STATUSES:
                return Response(
                    {'error': f'Your application cannot be edited at this stage (status: {application.status}).'},
                    status=status.HTTP_403_FORBIDDEN
                )
        kwargs['partial'] = True
        return self.update(request, *args, **kwargs)

    @action(detail=True, methods=['post'], permission_classes=[IsOfficerOrAdmin])
    def verify_lims(self, request, pk=None):
        """LIMS verification: Check if farm exists in DB."""
        role = getattr(getattr(request.user, 'staff_profile', None), 'role', '')
        if not (request.user.is_superuser or role in ('lims', 'admin')):
            return Response({'error': 'Unauthorized: Only LIMS Officers may perform cadastral/biometric verification.'}, status=status.HTTP_403_FORBIDDEN)

        from .services.verification_service import VerificationService
        application = self.get_object()
        status_action = (request.data.get('status_action') or 'VERIFIED').upper()
        comments = request.data.get('officer_comments') or request.data.get('comments') or request.data.get('reason') or ''

        if status_action == 'NOT_VERIFIED':
            application.is_queried = True
            application.query_message = comments or "Discrepancy identified during LIMS verification. Contact office."
            application.queried_by = 'lims'
            application.rejection_reason = application.query_message
            application.status = 'LIMS_VERIFIED'
            application.save()
            from .services.email_service import EmailService
            EmailService.send_lims_query(application, application.query_message)
            ApplicationAction.objects.create(
                application=application,
                officer=request.user,
                from_stage='ESTATES_CLEARED',
                to_stage='LIMS_VERIFIED',
                action_type='LIMS_QUERY_ISSUED',
                comment=f"LIMS Discrepancy Flagged: {application.query_message}. File released to ZLC under conditional lock."
            )
            return Response({'status': 'LIMS query recorded and released to ZLC under conditional lock', 'is_queried': True})

        result = VerificationService.verify_lims(
            application=application,
            status_action=status_action,
            reason=request.data.get('reason'),
            officer=request.user,
            comments=comments
        )
        return Response(result)

    @action(detail=True, methods=['post'], url_path='verify_accounts', permission_classes=[IsOfficerOrAdmin])
    def verify_accounts(self, request, pk=None):
        """ACCOUNTS: Verify $10 statutory application fee and release to Estates."""
        return self.verify_application_fee(request, pk)

    @action(detail=True, methods=['post'], url_path='verify_surveyor', permission_classes=[IsOfficerOrAdmin])
    def verify_surveyor(self, request, pk=None):
        """SURVEYOR GENERAL: Validate cadastral survey diagram and boundaries."""
        role = getattr(getattr(request.user, 'staff_profile', None), 'role', '')
        if not (request.user.is_superuser or role in ('surveyor', 'surveyor_general', 'sg', 'gis', 'admin')):
            return Response({'error': 'Unauthorized: Only Surveyor General Officers may commit survey endorsements.'}, status=status.HTTP_403_FORBIDDEN)

        application = self.get_object()
        action_type = (request.data.get('action_type') or 'SURVEYED').upper()
        comments = request.data.get('comments') or request.data.get('officer_comments') or ''
        from_st = application.status

        if action_type in ('NOT_SURVEYED', 'REQUIRE_SURVEY'):
            application.status = 'NOT_SURVEYED'
            application.is_surveyed = False
            application.farm_survey_status = 'REQUIRES_OFFICE_VISIT'
            application.query_message = "Please visit the Surveyor General's Office to complete your cadastral survey verification."
            log_type = 'SURVEY_REQUIRED_NOTIFIED'
            note = comments or "Parcel requires technical cadastral survey. Notification dispatched to applicant to visit SG office."
        elif action_type in ('UNAVAILABLE', 'STATUS_UNAVAILABLE'):
            application.status = 'SURVEY_UNAVAILABLE'
            application.farm_survey_status = 'STATUS_UNAVAILABLE'
            application.query_message = "Survey records status currently unavailable. Please visit the Surveyor General's Office."
            log_type = 'SURVEY_STATUS_UNAVAILABLE'
            note = comments or "Survey records status currently unavailable."
        else:
            application.status = 'SURVEYED'
            application.is_surveyed = True
            log_type = 'SURVEYED'
            note = comments or "Cadastral survey diagram verified. Boundaries confirmed."

        if comments:
            application.officer_comments = comments
        application.save()

        ApplicationAction.objects.create(
            application=application,
            officer=request.user,
            from_stage=from_st,
            to_stage=application.status,
            action_type=log_type,
            comment=note
        )
        return Response({'status': f'Surveyor action: {log_type}', 'current_stage': application.status})

    @action(detail=True, methods=['post'], permission_classes=[IsOfficerOrAdmin])
    def verify_application_fee(self, request, pk=None):
        """ACCOUNTS: Verify $10 Application Fee"""
        role = getattr(getattr(request.user, 'staff_profile', None), 'role', '')
        if not (request.user.is_superuser or role in ('accounts', 'admin')):
            return Response({'error': 'Unauthorized: Only Accounts Officers may verify application fees.'}, status=status.HTTP_403_FORBIDDEN)

        from .services.verification_service import VerificationService
        application = self.get_object()
        result = VerificationService.verify_application_fee(
            application=application,
            is_paid=request.data.get('is_paid'),
            officer=request.user
        )
        if 'error' in result:
            return Response(result, status=status.HTTP_400_BAD_REQUEST)
        return Response(result)

    @action(detail=True, methods=['post'], permission_classes=[IsOfficerOrAdmin])
    def verify_estates(self, request, pk=None):
        """ESTATES: Ensure farmer details and tenure documents are correct."""
        role = getattr(getattr(request.user, 'staff_profile', None), 'role', '')
        if not (request.user.is_superuser or role in ('estates', 'resettlement', 'admin')):
            return Response({'error': 'Unauthorized: Only Estates Officers may review and clear tenure documents.'}, status=status.HTTP_403_FORBIDDEN)

        from .services.verification_service import VerificationService
        application = self.get_object()
        action_type = (request.data.get('action_type') or 'CLEAR').upper()
        comments = request.data.get('officer_comments') or request.data.get('comments') or ''

        if action_type in ('QUERY', 'NOT_CLEARED'):
            application.is_queried = True
            application.query_message = comments or "Estates Officer requested clarification on tenure documentation."
            application.rejection_reason = application.query_message
            application.queried_by = 'estates'
            application.save()
            ApplicationAction.objects.create(
                application=application,
                officer=request.user,
                from_stage=application.status,
                to_stage=application.status,
                action_type='ESTATES_QUERIED',
                comment=f"Estates Query Logged: {application.query_message}"
            )
            return Response({'status': 'Estates query recorded', 'is_queried': True})

        result = VerificationService.verify_estates(
            application=application,
            officer=request.user,
            comments=comments
        )
        if 'error' in result:
            return Response(result, status=status.HTTP_400_BAD_REQUEST)
        return Response(result)

    @action(detail=True, methods=['post'], permission_classes=[IsOfficerOrAdmin])
    def escalate(self, request, pk=None):
        application = self.get_object()
        application.status = 'REFERRED'
        comments = request.data.get('officer_comments')
        if comments:
            application.officer_comments = comments
        application.save()
        ApplicationAction.objects.create(application=application, officer=request.user, action_type='ESCALATED', comment=comments)
        return Response({'status': 'Application escalated to resettlement'})


    @action(detail=True, methods=['post'], permission_classes=[IsOfficerOrAdmin])
    def verify_zlc(self, request, pk=None):
        """ZLC: Check for disputes."""
        role = getattr(getattr(request.user, 'staff_profile', None), 'role', '')
        if not (request.user.is_superuser or role in ('zlc', 'admin')):
            return Response({'error': 'Unauthorized: Only ZLC Officers may verify disputes and gazette records.'}, status=status.HTTP_403_FORBIDDEN)
        from .services.verification_service import VerificationService
        
        application = self.get_object()
        action_type = request.data.get('action_type')
        has_disputes = request.data.get('has_disputes')
        dispute_nature = request.data.get('dispute_nature')
        
        if action_type:
            act_up = str(action_type).upper()
            if act_up in ('DOUBLE_ALLOCATION', 'DOUBLE'):
                has_disputes = 'DOUBLE_ALLOCATION'
                if not dispute_nature:
                    dispute_nature = 'Double allocation detected in gazette records.'
            elif act_up in ('DISPUTE', 'DISPUTED'):
                has_disputes = True
            elif act_up in ('CLEARED', 'CLEAR'):
                has_disputes = False

        result = VerificationService.verify_zlc(
            application=application,
            has_disputes=has_disputes,
            dispute_nature=dispute_nature,
            officer=request.user,
            comments=request.data.get('officer_comments') or request.data.get('comments')
        )
        if 'error' in result:
            return Response(result, status=status.HTTP_400_BAD_REQUEST)
        return Response(result)

    @action(detail=True, methods=['post'], permission_classes=[IsOfficerOrAdmin])
    def technical_survey(self, request, pk=None):
        """Require survey fee from farmer - triggered when farm is not surveyed"""
        from .services.verification_service import VerificationService
        
        application = self.get_object()
        result = VerificationService.require_technical_survey(
            application=application,
            officer=request.user,
            comments=request.data.get('officer_comments')
        )
        return Response(result)

    @action(detail=True, methods=['post'], permission_classes=[IsOfficerOrAdmin])
    def mark_surveyed(self, request, pk=None):
        """MARK SURVEYED: Update farm details with technical survey data."""
        from .services.verification_service import VerificationService
        
        application = self.get_object()
        result = VerificationService.mark_surveyed(
            application=application,
            # Supporting both old (farm_extent) and new (hectarage) field names for flexibility
            hectarage=request.data.get('farm_extent') or request.data.get('hectarage'),
            new_farm_name=request.data.get('farm_name') or request.data.get('new_farm_name'),
            old_district=request.data.get('old_district'),
            is_fee_paid=request.data.get('is_fee_paid'),
            officer=request.user,
            comments=request.data.get('officer_comments')
        )
        if 'error' in result:
            return Response(result, status=status.HTTP_400_BAD_REQUEST)
        return Response(result)

    @action(detail=True, methods=['post'], permission_classes=[IsOfficerOrAdmin])
    def generate_agreement(self, request, pk=None):
        """CONVEYANCER: Generate Agreement of Sale with itemized fees"""
        application = self.get_object()
        
        # Calculate Total
        purchase_price = application.purchase_price or 0
        total_amount = float(purchase_price)
        breakdown = [f"Purchase Price: ${purchase_price}"]
        
        if not application.application_fee_paid:
             total_amount += 10
             breakdown.append("Application Fee: $10 (Arrears)")
             
        breakdown.append(f"TOTAL PAYABLE: ${total_amount}")
        breakdown_text = "\n".join(breakdown)
        
        application.status = 'AGREEMENT_OF_SALE' 
        # Or AWAITING_PAYMENT? User says "Conveyancer has to prepare agreement... showing amounts separately"
        # Usually Director approves first? Or Conveyancer preps for Director?
        # Flow: Valuation -> Director (Approve) -> Conveyancer (Agreement) -> Payment
        
        comment = f"Agreement Generated.\\n{breakdown_text}"
        
        comments = request.data.get('officer_comments')
        if comments:
             application.officer_comments = f"{comments}\n\n{comment}"
        else:
             application.officer_comments = comment
             
        application.save()
        ApplicationAction.objects.create(application=application, officer=request.user, action_type='AGREEMENT_GENERATED', comment=comment)
        
        self.send_status_email(application, 'Agreement of Sale Ready', f'Your Agreement of Sale has been generated.\\n\\n{breakdown_text}')
        
        return Response({
             'status': 'Agreement generated', 
             'total_amount': total_amount,
             'breakdown': breakdown
        })

    @action(detail=True, methods=['post'])
    def pay_survey_fee(self, request, pk=None):
        application = self.get_object()
        if application.farmer.user != request.user:
             return Response({'error': 'Unauthorized'}, status=status.HTTP_403_FORBIDDEN)
        
        # In real world, integration with payment gateway
        # For now, just mark as paid for simulation
        application.status = 'SURVEY_FEE_PAID'
        application.save()
        # Use request.user as officer (actor) even if farmer, to satisfy NOT NULL constraint
        ApplicationAction.objects.create(application=application, officer=request.user, action_type='SURVEY_FEE_PAID')
        return Response({'status': 'Payment simulation complete'})

    @action(detail=True, methods=['post'], permission_classes=[IsOfficerOrAdmin])
    def set_valuation(self, request, pk=None):
        role = getattr(getattr(request.user, 'staff_profile', None), 'role', '')
        if not (request.user.is_superuser or role in ('valuation', 'admin')):
            return Response({'error': 'Unauthorized: Only Valuation Officers may calculate and commit valuations.'}, status=status.HTTP_403_FORBIDDEN)
        application = self.get_object()
        if application.has_disputes or application.has_double_allocation or application.status in ('ZLC_DISPUTED', 'ZLC_DOUBLE_ALLOCATION'):
            return Response(
                {'error': 'Cannot commit valuation: Land parcel is locked due to an active ZLC dispute or double allocation.'},
                status=status.HTTP_403_FORBIDDEN
            )
        officer_comments = request.data.get('officer_comments', '')
        manual_price = request.data.get('manual_price') or request.data.get('valuation_amount')
        price_override_reason = request.data.get('price_override_reason', request.data.get('valuation_notes', ''))
        
        # Update Farm Details if provided (Surveyor might have missed something or Valuation wants to correct)
        farm_extent = request.data.get('farm_extent')
        arable_area = request.data.get('arable_area')
        distance_to_town = request.data.get('distance_to_town')
        nearest_town = request.data.get('nearest_town')
        ecological_region = request.data.get('ecological_region')
        
        if farm_extent:
            application.farm_extent = farm_extent
        if arable_area:
            application.arable_area = arable_area
        if distance_to_town:
            application.distance_to_town = distance_to_town
        if nearest_town:
            application.nearest_town = nearest_town
        if ecological_region:
            application.ecological_region = ecological_region

        # Handle manual valuation override
        if manual_price is not None and str(manual_price).strip() != '':
            try:
                manual_price_float = float(manual_price)
                if manual_price_float > 0:
                    application.manual_valuation_price = manual_price_float
                    application.is_manually_valuated = True
                    
                    # Add override note
                    override_note = f"[PRICE OVERRIDE] Manual Base Price set to: ${manual_price_float}. Reason: {price_override_reason}"
                    if officer_comments:
                         officer_comments = f"{officer_comments}\n\n{override_note}"
                    else:
                         officer_comments = override_note
                else:
                    return Response({'error': 'Manual price must be greater than 0'}, status=status.HTTP_400_BAD_REQUEST)
            except (ValueError, TypeError):
                return Response({'error': 'Invalid manual price format'}, status=status.HTTP_400_BAD_REQUEST)
        else:
            # If no manual price provided (or empty string), ensure we clear any previous manual setting if re-valuating
            # But only if user didn't explicitly send "manual_price" keys. 
            # If they sent empty, maybe they mean "remove override"?
            # For safety, let's assume if they don't provide it, we use standard calc, UNLESS it was already set?
            # Better to reset it to False to ensure standard calc applies if field is empty
            from decimal import Decimal
            application.is_manually_valuated = False
            application.manual_valuation_price = Decimal('0.00')

        if officer_comments:
            application.officer_comments = officer_comments
            
        # Recalculate and save (this handles both manual and standard paths via pricing.py logic)
        from .pricing import apply_pricing_to_application
        pricing_details = apply_pricing_to_application(application, save=True)
        
        application.valuation_approved = True
        application.status = 'VALUATED'  # Send to Director for final review
        application.save()
        
        ApplicationAction.objects.create(application=application, officer=request.user, action_type='VALUATION_APPROVED')
        
        # Build discount breakdown text
        discount_lines = []
        beneficiary_breakdown = pricing_details.get('beneficiary_breakdown', {})
        for item in beneficiary_breakdown.get('discounts', []):
            discount_lines.append(f"  - {item['source']}: {item['type']} ({item['discount']}%)")
        discount_text = '\n'.join(discount_lines) if discount_lines else '  None applied'
        
        # Email to farmer
        farmer_name = "Valued Beneficiary"
        if application.farmer and getattr(application.farmer, 'first_name', None):
            farmer_name = application.farmer.first_name
        elif getattr(application, 'beneficiary_name', None):
            farmer_name = application.beneficiary_name.split()[0]

        email_message = f'''Dear {farmer_name},

Your application #{application.id} for farm "{application.farm_name}" has been valuated.

The valuation has been sent to the Director for final approval.

You will be notified once the Director approves and you will receive payment instructions.

Thank you for your patience.'''
        
        self.send_status_email(application, 'Valuation Approved - Purchase Price Calculated', email_message)
        
        return Response({
            'status': 'Valuation approved, Select payment',
            'pricing': pricing_details
        })

    @action(detail=True, methods=['post'], permission_classes=[IsOfficerOrAdmin])
    def reject_application(self, request, pk=None):
        application = self.get_object()
        # Surveyor cannot reject anymore, and LIMS/ZLC can still query.
        # If surveyor sends a query, it should behave like 'technical_survey' or 'mark_surveyed' but for corrections?
        # User said: "officer should not be able to reject application but rather should surveyor should acknowlege farm suveryed or not surveyd."
        if request.user.staff_profile.role == 'surveyor':
             return Response({'error': 'Surveyors cannot reject or query directly. Use Require Survey instead.'}, status=status.HTTP_403_FORBIDDEN)
             
        reason = request.data.get('officer_comments') or request.data.get('reason') or "No reason provided."
        application.status = 'QUERIED'
        application.rejection_reason = reason
        try:
            application.queried_by = request.user.staff_profile.role
        except Exception:
            application.queried_by = 'admin'
        application.save()
        ApplicationAction.objects.create(application=application, officer=request.user, action_type='QUERIED', comment=reason)
        query_message = f'''Dear {application.farmer.first_name},

Your Title Deed application (Application ID: #{application.id}) has been queried and requires your attention.

Reason for Query:
{reason}

To resolve this query, please visit your nearest District Lands Office with the required documentation. You may also respond through the online portal by resubmitting your application with the corrected information.

If you have any questions, please contact your nearest District Lands Office for assistance.'''
        self.send_status_email(application, 'Application Queried - Action Required', query_message)
        return Response({'status': 'Application queried'})

    @action(detail=True, methods=['post'])
    def resubmit_application(self, request, pk=None):
        application = self.get_object()
        if application.farmer.user != request.user:
             return Response({'error': 'Unauthorized'}, status=status.HTTP_403_FORBIDDEN)
             
        # Allow updating fields here if needed via serializer in a partial update, 
        # but for now we just change status.
        # Route back based on who queried it
        if application.queried_by == 'lims':
            application.status = 'PENDING'
        elif application.queried_by == 'zlc':
            application.status = 'LIMS_VERIFIED'
        elif application.queried_by == 'surveyor':
            application.status = 'ZLC_VERIFIED'
        elif application.queried_by == 'valuation':
            application.status = 'SURVEYED'
        elif application.queried_by == 'director':
            application.status = 'SURVEYED' # Send back to Valuation stage
        elif application.queried_by == 'finance':
            application.status = 'SELECT_PAYMENT'
        else:
            application.status = 'RESUBMITTED' # Default fallback
            
        application.save()
        # Notify admins?
        return Response({'status': 'Application resubmitted'})

    @action(detail=True, methods=['post'])
    def appeal_rejection(self, request, pk=None):
        application = self.get_object()
        reason = request.data.get('reason')
        if not reason:
             return Response({'error': 'Appeal reason is required'}, status=status.HTTP_400_BAD_REQUEST)

        application.appeal_reason = reason
        application.status = 'RESUBMITTED' # Treat as resubmission but with appeal note
        application.save()
        return Response({'status': 'Appeal submitted'})

    @action(detail=True, methods=['post'], permission_classes=[IsOfficerOrAdmin])
    def verify_payment(self, request, pk=None):
        # In real world, check if user is finance officer
        application = self.get_object()
        application.payment_verified = True
        application.status = 'READY_FOR_COLLECTION'
        application.collection_notification_sent = True
        application.save()
        ApplicationAction.objects.create(application=application, officer=request.user, action_type='PAYMENT_VERIFIED')
        
        self.send_status_email(application, 'Title Deed Ready', 'Your payment has been verified and your Title Deed is ready for collection.')
        return Response({'status': 'Payment verified, collection notification sent'})

    def send_status_email(self, application, subject, message):
        recipient_email = None
        if application and getattr(application, 'farmer', None) and getattr(application.farmer, 'email', None):
            recipient_email = application.farmer.email
        elif application and getattr(application, 'email', None):
            recipient_email = application.email
            
        if not recipient_email:
            print(f"[send_status_email] Skipping email '{subject}' - no recipient email on application #{getattr(application, 'id', None)}")
            return
        # Append standard signature to all emails
        full_message = f"""{message}

Kind Regards,
Title Deeds One Stop Center"""
        # Use email logger to track sending attempts
        print(f"Sending email to {recipient_email}: {subject}")
        send_email_with_logging(
            recipient=recipient_email,
            subject=subject,
            body=full_message,
            application=application
        )

    @action(detail=True, methods=['post'], permission_classes=[IsOfficerOrAdmin])
    def final_approve(self, request, pk=None):
        role = getattr(getattr(request.user, 'staff_profile', None), 'role', '')
        if not (request.user.is_superuser or role in ('director', 'deeds', 'admin')):
            return Response({'error': 'Unauthorized: Only Director of Lands or Deeds Registrar may grant final approval.'}, status=status.HTTP_403_FORBIDDEN)
        application = self.get_object()
        if application.has_disputes or application.has_double_allocation or getattr(application, 'is_queried', False):
            return Response({'error': 'Title deed issuance is strictly locked: active ZLC dispute, double allocation, or unresolved query exists.'}, status=status.HTTP_403_FORBIDDEN)
        application.status = 'APPROVED'
        comments = request.data.get('officer_comments')
        if comments:
            application.officer_comments = comments
        application.save()
        ApplicationAction.objects.create(application=application, officer=request.user, action_type='FINAL_APPROVED', comment=comments)
        return Response({'status': 'Final approval granted'})

    @action(detail=True, methods=['post'], url_path='conclude-application', permission_classes=[IsOfficerOrAdmin])
    def conclude_application(self, request, pk=None):
        """
        Director concludes application and notifies farmer to collect Title Deeds.
        """
        role = getattr(getattr(request.user, 'staff_profile', None), 'role', '')
        if not (request.user.is_superuser or role in ('director', 'deeds', 'admin')):
            return Response({'error': 'Unauthorized: Only Director of Lands, Deeds Registrar, or Administrator may conclude application.'}, status=status.HTTP_403_FORBIDDEN)
        application = self.get_object()
        if application.has_disputes or application.has_double_allocation or getattr(application, 'is_queried', False):
            return Response({'error': 'Title deed issuance is strictly locked: active ZLC dispute, double allocation, or unresolved query exists.'}, status=status.HTTP_403_FORBIDDEN)
        comments = request.data.get('officer_comments', '')
        
        if comments:
            if application.officer_comments:
                application.officer_comments = f"{application.officer_comments}\n\n[CONCLUDED] {comments}"
            else:
                application.officer_comments = comments
        
        application.status = 'COMPLETED'
        application.save()
        
        ApplicationAction.objects.create(
            application=application,
            officer=request.user,
            action_type='APPLICATION_CONCLUDED',
            comment=comments
        )
        
        # Send email to farmer to collect Title Deeds
        email_message = f'''Dear {application.farmer.first_name},

Congratulations! Your Title Deed application #{application.id} for farm "{application.farm_name}" has been successfully concluded.

YOUR TITLE DEED IS READY FOR COLLECTION!

COLLECTION DETAILS:
════════════════════════════════════════
Location: Title Deeds One Stop Center
         Block 2 Makombe Building,
         Corner Herbert Chitepo Avenue and Harare Street, Harare

Office Hours: Monday - Friday: 9:00 AM - 4:00 PM
════════════════════════════════════════

DOCUMENTS TO BRING:
✓ National ID (Original)
✓ Proof of Payment / Payment Receipt
✓ Agreement of Sale (signed copy)

Please visit the One Stop Center at your earliest convenience to collect your Title Deed.

If you have any questions, please contact our support team.

Best regards,
Title Deeds One Stop Center'''
        
        self.send_status_email(application, 'Title Deed Ready for Collection - Application Concluded', email_message)
        
        return Response({
            'status': 'Application concluded successfully. Farmer has been notified to collect Title Deeds.'
        })

    @action(detail=True, methods=['post'], permission_classes=[IsOfficerOrAdmin])
    def reject(self, request, pk=None):
        application = self.get_object()
        application.status = 'REJECTED'
        comments = request.data.get('officer_comments')
        if comments:
            application.officer_comments = comments
        application.save()
        ApplicationAction.objects.create(application=application, officer=request.user, action_type='REJECTED', comment=comments)
        # Send rejection email to farmer
        reason_text = comments if comments else 'No specific reason provided.'
        rejection_message = f'''Dear {application.farmer.first_name},

We regret to inform you that your title deed application (Application ID: #{application.id}) for farm "{application.farm_name}" has been rejected.

Reason: {reason_text}

WHAT TO DO NEXT:
Please visit your nearest District Lands Office with your original documents for further assistance and clarification regarding this decision.

If you have any questions, the District Lands Office staff will be able to guide you on the way forward.'''
        self.send_status_email(
            application,
            'Application Rejected - Title Deed Application',
            rejection_message
        )
        return Response({'status': 'Application rejected'})

    @action(detail=True, methods=['post'], url_path='refer-back', permission_classes=[IsOfficerOrAdmin])
    def refer_back(self, request, pk=None):
        """
        Director refers application back to valuation officer for corrections.
        Changes status from VALUATED back to SURVEYED so the valuation officer can re-valuate.
        """
        application = self.get_object()

        if application.status != 'VALUATED':
            return Response(
                {'error': 'Only valuated applications can be referred back.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        reason = request.data.get('reason', '').strip()
        if not reason:
            return Response(
                {'error': 'A reason for referring back is required.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Append director's referral comments
        referral_note = f"[DIRECTOR REFER BACK] {reason}"
        if application.officer_comments:
            application.officer_comments = f"{application.officer_comments}\n\n{referral_note}"
        else:
            application.officer_comments = referral_note

        # Reset valuation so the officer can re-edit
        application.valuation_approved = False
        application.status = 'SURVEYED'
        application.save()

        ApplicationAction.objects.create(
            application=application,
            officer=request.user,
            action_type='DIRECTOR_REFERRED_BACK',
            comment=reason
        )

        # Notify farmer that the application is under further review
        email_message = f'''Dear {application.farmer.first_name},

Your application #{application.id} for farm "{application.farm_name}" is undergoing further review by our valuation team.

The Director has requested additional review of the valuation. You will be notified once the review is complete and the application proceeds to the next stage.

Thank you for your patience.'''

        self.send_status_email(application, 'Application Under Further Review', email_message)

        return Response({'status': 'Application referred back to valuation officer'})

    @action(detail=True, methods=['post'], url_path='approve', permission_classes=[IsOfficerOrAdmin])
    def approve(self, request, pk=None):
        """
        Director approves the purchase price set by valuation officer and sends to farmer for payment.
        Also accepts optional parameter adjustments from the director before final recalculation.
        This is the final approval that moves the application to payment stage.
        """
        application = self.get_object()
        officer_comments = request.data.get('officer_comments', '')
        
        if officer_comments:
            # Append to existing comments rather than overwriting
            if application.officer_comments:
                application.officer_comments = f"{application.officer_comments}\n\n[DIRECTOR APPROVAL] {officer_comments}"
            else:
                application.officer_comments = officer_comments
        
        # Apply director's parameter adjustments if provided
        farm_extent = request.data.get('farm_extent')
        arable_area = request.data.get('arable_area')
        distance_to_town = request.data.get('distance_to_town')
        nearest_town = request.data.get('nearest_town')
        ecological_region = request.data.get('ecological_region')
        improvements_value = request.data.get('improvements_value')
        manual_price = request.data.get('manual_price')
        price_override_reason = request.data.get('price_override_reason', '')
        
        if farm_extent:
            application.farm_extent = farm_extent
        if arable_area:
            application.arable_area = arable_area
        if distance_to_town:
            application.distance_to_town = distance_to_town
        if nearest_town:
            application.nearest_town = nearest_town
        if ecological_region:
            application.ecological_region = ecological_region
        if improvements_value is not None and str(improvements_value).strip() != '':
            try:
                application.improvements_value = float(improvements_value)
            except (ValueError, TypeError):
                pass
        
        # Handle manual valuation override from director
        if manual_price is not None and str(manual_price).strip() != '':
            try:
                manual_price_float = float(manual_price)
                if manual_price_float > 0:
                    application.manual_valuation_price = manual_price_float
                    application.is_manually_valuated = True
                    override_note = f"[DIRECTOR PRICE OVERRIDE] Manual Base Price set to: ${manual_price_float}. Reason: {price_override_reason}"
                    if application.officer_comments:
                        application.officer_comments = f"{application.officer_comments}\n\n{override_note}"
                    else:
                        application.officer_comments = override_note
            except (ValueError, TypeError):
                pass
        
        # Reset cash payment flag - farmer hasn't selected payment method yet
        # The cash discount should only be applied when they actually choose CASH in select_payment
        application.is_cash_payment = False
        
        # Recalculate price with updated parameters (WITHOUT cash discount)
        from .pricing import apply_pricing_to_application
        apply_pricing_to_application(application, save=False)
        
        # Move to payment stage
        application.status = 'SELECT_PAYMENT'
        application.save()
        ApplicationAction.objects.create(application=application, officer=request.user, action_type='DIRECTOR_APPROVED')
        
        # Calculate fees for display to farmer
        from decimal import Decimal
        valuation_fee = Decimal('450.00')
        conveyance_fee = application.purchase_price * Decimal('0.01')  # 1% of total
        cash_discount = application.purchase_price * Decimal('0.15')  # 15% of total
        
        # Consolidate invitation email
        email_message = f'''Dear {application.farmer.first_name},

Great news! Your application #{application.id} for farm "{application.farm_name}" has been approved by the Director.

PURCHASE PRICE: ${application.purchase_price:,.2f}

NEXT STEPS - SELECT YOUR PAYMENT PLAN:
Please log in to the Online Application Portal at your earliest convenience to select your preferred payment option:
1. CASH (15% Discount available for full payment)
2. MORTGAGE (Select your preferred participating bank)

Once you select your payment method online, you will receive an invitation to visit the One Stop Center to sign your Agreement of Sale.

ONE STOP CENTER LOCATION:
Title Deeds One Stop Center
Block 2 Makombe Building,
Corner Herbert Chitepo Avenue and Harare Street, Harare

If you have any questions, please contact our support team.'''
        
        self.send_status_email(application, 'Action Required: Select Payment Method - Application Approved', email_message)

        
        return Response({
            'status': 'Application approved and sent for payment',
            'purchase_price': application.purchase_price
        })

    @action(detail=True, methods=['post'], url_path='select-payment')
    def select_payment(self, request, pk=None):
        """
        Farmer selects payment method (Cash or Mortgage) and bank if choosing Mortgage.
        After selection, sends One Stop Center invitation.
        """
        application = self.get_object()
        payment_method = request.data.get('payment_method')
        selected_bank = request.data.get('selected_bank')
        
        # Validate payment method
        if not payment_method or payment_method not in ['CASH', 'MORTGAGE']:
            return Response({'error': 'Invalid payment method. Choose CASH or MORTGAGE.'}, status=status.HTTP_400_BAD_REQUEST)
        
        # Validate bank selection for mortgage
        if payment_method == 'MORTGAGE':
            if not selected_bank:
                return Response({'error': 'Bank selection is required for mortgage payment.'}, status=status.HTTP_400_BAD_REQUEST)
            valid_banks = [choice[0] for choice in application.BANK_CHOICES]
            if selected_bank not in valid_banks:
                return Response({'error': 'Invalid bank selection.'}, status=status.HTTP_400_BAD_REQUEST)
        
        # Save payment selection
        from django.utils import timezone
        application.payment_plan = payment_method
        application.selected_bank = selected_bank if payment_method == 'MORTGAGE' else None
        application.payment_method_selected_at = timezone.now()
        
        # Update CASH PAYMENT FLAG and RECALCULATE PRICE
        # This fixes the issue where Cash Discount is not applied to final price
        if payment_method == 'CASH':
            application.is_cash_payment = True
        else:
            application.is_cash_payment = False
            
        # Trigger Recalculation (this will mistakenly remove manual overrides if we didn't handle is_manually_valuated in pricing.py)
        # But we DID handle it in pricing.py, so it's safe!
        from .pricing import apply_pricing_to_application
        apply_pricing_to_application(application, save=True)
            
        application.status = 'AGREEMENT_OF_SALE'  # Move to next stage - visit One Stop Center
        application.save()
        
        # Get bank name for display
        bank_name = None
        if selected_bank:
            bank_dict = dict(application.BANK_CHOICES)
            bank_name = bank_dict.get(selected_bank, selected_bank)
        
        # Send One Stop Center invitation
        payment_info = f"Payment Method: {payment_method}"
        if payment_method == 'MORTGAGE':
            payment_info += f"\nSelected Bank: {bank_name}"
        
        email_message = f'''Dear {application.farmer.first_name},

Thank you for selecting your payment method for farm "{application.farm_name}".

PAYMENT SELECTION CONFIRMED:
════════════════════════════════════════
{payment_info}
Final Purchase Price: ${application.purchase_price:,.2f}
════════════════════════════════════════

NEXT STEP - VISIT ONE STOP CENTER:
You are now invited to visit the One Stop Center physically to sign your Agreement of Sale and proceed with payment arrangements.

ONE STOP CENTER LOCATION:
Title Deeds One Stop Center
Block 2 Makombe Building,
Corner Herbert Chitepo Avenue and Harare Street, Harare


REQUIRED DOCUMENTS TO BRING:
✓ National ID
✓ Tenure Document (Original and Copy)
✓ Proof of Payment (if already paid)
✓ $10 Processing Fee (for Agreement processing)
{"✓ Bank Pre-approval Letter (for mortgage)" if payment_method == 'MORTGAGE' else ""}


OFFICE HOURS:
Monday - Friday: 9:00 AM - 4:00 PM


Please contact us at +263719012035 to schedule an appointment or for any questions.

We look forward to completing your title deed process!

Best regards,
Title Deeds One Stop Center'''
        
        self.send_status_email(application, 'One Stop Center Invitation - Agreement of Sale', email_message)
        
        return Response({
            'status': 'Payment method selected successfully',
            'payment_method': payment_method,
            'selected_bank': bank_name if payment_method == 'MORTGAGE' else None,
            'message': 'You will receive an invitation to visit the One Stop Center'
        })


    @action(detail=False, methods=['get'])
    def dashboard_stats(self, request):
        if not request.user.is_staff:
             return Response({'error': 'Unauthorized'}, status=403)
             
        from django.utils import timezone
        today = timezone.now().date()
        
        # 1. Total Pending for this Role
        pending_qs = self.get_queryset()
        
        # Refine pending to only those requiring action at current stage
        # e.g. for LIMS, PENDING and RESUBMITTED are truly pending. LIMS_VERIFIED is actioned but visible.
        role = 'admin'
        try:
            role = request.user.staff_profile.role
        except Exception: pass
        
        really_pending = 0
        if role == 'lims':
            really_pending = pending_qs.filter(status__in=['PENDING']) | pending_qs.filter(status='RESUBMITTED', queried_by='lims')
        elif role == 'resettlement' or role == 'estates':
             really_pending = pending_qs.filter(status__in=['REFERRED', 'ACCOUNTS_VERIFIED']) | pending_qs.filter(status='RESUBMITTED', queried_by='estates')
        elif role == 'zlc':
            really_pending = pending_qs.filter(status__in=['ESTATES_VERIFIED', 'LIMS_VERIFIED']) | pending_qs.filter(status='RESUBMITTED', queried_by='zlc')
        elif role == 'surveyor':
            really_pending = pending_qs.filter(status__in=['ZLC_VERIFIED', 'SURVEY_FEE_PAID']) | \
                             pending_qs.filter(status='RESUBMITTED', queried_by='surveyor')
        elif role == 'valuation':
            really_pending = pending_qs.filter(status='SURVEYED') | pending_qs.filter(status='RESUBMITTED', queried_by='valuation')
        elif role == 'director':
            really_pending = pending_qs.filter(status='VALUATED') | pending_qs.filter(status='RESUBMITTED', queried_by='director')
        elif role == 'finance' or role == 'accounts':
            really_pending = pending_qs.filter(status__in=['LIMS_VERIFIED', 'SELECT_PAYMENT']) | pending_qs.filter(status='RESUBMITTED', queried_by='finance')
        else:
            # For admin/fallback, everything that's PENDING or actioned today is "pending" in a sense, 
            # but usually admin wants to see EVERYTHING.
            really_pending = pending_qs.filter(status__in=['PENDING', 'RESUBMITTED', 'REFERRED'])
            
        really_pending = really_pending.distinct().count()

        # 2. Actioned Today by this Officer
        today_actions = ApplicationAction.objects.filter(officer=request.user, created_at__date=today).count()
        
        # 3. Cumulative Actioned by this Officer
        cumulative_actions = ApplicationAction.objects.filter(officer=request.user).count()
        
        return Response({
            'pending_count': really_pending,
            'today_count': today_actions,
            'cumulative_count': cumulative_actions
        })

    @action(detail=False, methods=['post'], url_path='calculate-pricing')
    def calculate_pricing(self, request):
        """
        Calculates purchase price based on provided parameters without saving.
        Called by valuation officers to simulate pricing scenarios.
        """
        # Get parameters from request or defaults
        farm_extent = request.data.get('farm_extent')
        arable_area = request.data.get('arable_area')
        district = request.data.get('district')
        water_source_distance = request.data.get('water_source_distance') or 'none'
        nearest_town = request.data.get('nearest_town', '')
        distance_to_town = request.data.get('distance_to_town', 0)
        improvements_value = request.data.get('improvements_value', 0)

        ecological_region = request.data.get('ecological_region')

        
        # We need a dummy application object to run calculation
        class MockApplication:
            def __init__(self, **kwargs):
                for k, v in kwargs.items():
                    setattr(self, k, v)
        
        # Handle decimal conversion safely
        from decimal import Decimal
        def to_decimal(val):
            try:
                return Decimal(str(val))
            except:
                return Decimal('0')
                
        # Mocking the application structure expected by pricing.py
        class MockFarmer:
            def __init__(self, is_war_veteran=False, is_ex_detainee=False, is_collaborator=False, is_civil_servant=False, civil_service_years=0):
                self.is_war_veteran = is_war_veteran
                self.is_ex_detainee = is_ex_detainee
                self.is_collaborator = is_collaborator
                self.is_civil_servant = is_civil_servant
                self.civil_service_years = civil_service_years

        class MockSpouse:
            def __init__(self, **kwargs):
                self.first_name = kwargs.get('first_name', '')
                self.surname = kwargs.get('surname', '')
                self.is_war_veteran = kwargs.get('is_war_veteran', False)
                self.is_ex_detainee = kwargs.get('is_ex_detainee', False)
                self.is_collaborator = kwargs.get('is_collaborator', False)
                self.is_civil_servant = kwargs.get('is_civil_servant', False)
                self.civil_service_years = kwargs.get('civil_service_years', 0)

        class MockSpouseQuerySet:
            """Mimics Django QuerySet.all() for the pricing engine."""
            def __init__(self, items):
                self._items = items
            def all(self):
                return self._items

        spouses_data = request.data.get('spouses', [])
        mock_spouses_list = [MockSpouse(**sp_data) for sp_data in spouses_data]

        farmer_data = request.data.get('farmer', {})
        mock_farmer = MockFarmer(
            is_war_veteran=farmer_data.get('is_war_veteran', False),
            is_ex_detainee=farmer_data.get('is_ex_detainee', False),
            is_collaborator=farmer_data.get('is_collaborator', False),
            is_civil_servant=farmer_data.get('is_civil_servant', False),
            civil_service_years=farmer_data.get('civil_service_years', 0)
        )

        # Get cash payment flag from request
        is_cash_payment = request.data.get('is_cash_payment', False)
        if isinstance(is_cash_payment, str):
            is_cash_payment = is_cash_payment.lower() in ['true', '1', 'yes', 'on']
        
        mock_app = MockApplication(
            farm_extent=to_decimal(farm_extent),
            arable_area=to_decimal(arable_area),
            district=district,
            water_source_type='river' if water_source_distance not in ['none', None, ''] else 'none',
            water_source_distance=water_source_distance,
            distance_to_town=to_decimal(distance_to_town),
            nearest_town=nearest_town,
            improvements_value=to_decimal(improvements_value),
            ecological_region=ecological_region,
            farmer=mock_farmer,

            spouses=MockSpouseQuerySet(mock_spouses_list), 
            is_war_veteran=False,
            is_civil_servant=False,
            is_cash_payment=is_cash_payment
        )
        
        from .pricing import calculate_purchase_price
        
        try:
            pricing_breakdown = calculate_purchase_price(mock_app)
            return Response(pricing_breakdown)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

from django.contrib.auth import authenticate, login
from rest_framework.views import APIView

from .utils.id_utils import format_national_id
from .authentication import generate_signed_token, SignedTokenAuthentication


class ChangePasswordView(APIView):
    """
    Enforces mandatory first-login password change for officers and administrators.
    The new password must be at least 8 characters long, contain letters and numbers,
    and must not be the default temporary password 'Ministry'.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        user = request.user
        old_password = request.data.get('old_password') or request.data.get('current_password')
        new_password = (request.data.get('new_password') or '').strip()
        confirm_password = (request.data.get('confirm_password') or '').strip()

        if not old_password or not new_password:
            return Response({'error': 'Current password and new password are required.'}, status=status.HTTP_400_BAD_REQUEST)

        if not user.check_password(old_password):
            return Response({'error': 'Current password is incorrect.'}, status=status.HTTP_400_BAD_REQUEST)

        if new_password.lower() == 'ministry':
            return Response({'error': 'New password must not be the temporary default password.'}, status=status.HTTP_400_BAD_REQUEST)

        if confirm_password and new_password != confirm_password:
            return Response({'error': 'New password and confirmation do not match.'}, status=status.HTTP_400_BAD_REQUEST)

        if len(new_password) < 8 or not any(c.isalpha() for c in new_password) or not any(c.isdigit() for c in new_password):
            return Response({'error': 'New password must be at least 8 characters long and contain both letters and numbers.'}, status=status.HTTP_400_BAD_REQUEST)

        user.set_password(new_password)
        user.save()

        profile = getattr(user, 'staff_profile', None)
        if profile:
            profile.must_change_password = False
            profile.save()

        # Update session auth hash so session doesn't invalidate
        from django.contrib.auth import update_session_auth_hash
        update_session_auth_hash(request, user)

        # Audit log entry
        try:
            from .models import ApplicationAction, TitleDeedApplication
            app = TitleDeedApplication.objects.first()
            if app:
                ApplicationAction.objects.create(
                    application=app,
                    officer=user,
                    from_stage=app.status,
                    to_stage=app.status,
                    action_type='PASSWORD_CHANGED',
                    comment=f"Officer @{user.username} successfully changed their temporary password."
                )
        except Exception as e:
            print("Password change audit log warning:", e)

        role = getattr(profile, 'role', 'admin' if user.is_superuser else 'farmer')
        new_token = generate_signed_token(user, role=role, privileges=getattr(profile, 'privileges', []))

        return Response({
            'status': 'Password changed successfully',
            'token': new_token,
            'must_change_password': False
        }, status=status.HTTP_200_OK)


@method_decorator(csrf_exempt, name='dispatch')
class LoginView(APIView):
    authentication_classes = []
    permission_classes = [permissions.AllowAny]
    throttle_classes = [LoginRateThrottle]
    
    def post(self, request):
        from django.core.cache import cache
        import hashlib
        
        raw_username = (request.data.get('username') or '').strip()
        password = request.data.get('password') or ''
        mfa_code = request.data.get('mfa_code')
        
        if not raw_username or not password:
            return Response({'error': 'Invalid username or password.'}, status=status.HTTP_401_UNAUTHORIZED)
            
        cache_key = f"login_attempts_{raw_username.lower()}"
        lockout_key = f"login_lockout_{raw_username.lower()}"
        if cache.get(lockout_key):
            return Response({'error': 'Too many failed login attempts. Locked out for 15 minutes.'}, status=status.HTTP_429_TOO_MANY_REQUESTS)

        # 1. Resolve user by Email or Username (case-insensitive)
        resolved_user = User.objects.filter(username__iexact=raw_username).first()
        if not resolved_user:
            resolved_user = User.objects.filter(email__iexact=raw_username).first()
        if not resolved_user and '@' not in raw_username:
            from .utils.id_utils import format_national_id
            fmt_id = format_national_id(raw_username)
            resolved_user = User.objects.filter(username__iexact=fmt_id).first()
            if not resolved_user:
                from .models import FarmerProfile
                prof = FarmerProfile.objects.filter(national_id__iexact=fmt_id).first()
                if prof and prof.user:
                    resolved_user = prof.user

        # 2. Check if user is deactivated
        if resolved_user and not resolved_user.is_active:
            return Response({'error': 'Account deactivated by System Administrator.'}, status=status.HTTP_403_FORBIDDEN)

        # 3. Authenticate password case-sensitively
        username_for_auth = resolved_user.username if resolved_user else raw_username
        user = authenticate(username=username_for_auth, password=password)
        
        if not user:
            attempts = cache.get(cache_key, 0) + 1
            if attempts >= 5:
                cache.set(lockout_key, True, timeout=900)
                cache.delete(cache_key)
            else:
                cache.set(cache_key, attempts, timeout=900)
                
            try:
                from .models import ApplicationAction, TitleDeedApplication
                app = TitleDeedApplication.objects.first()
                if app:
                    ApplicationAction.objects.create(
                        application=app,
                        officer=resolved_user if resolved_user else User.objects.filter(is_superuser=True).first(),
                        from_stage=app.status,
                        to_stage=app.status,
                        action_type='LOGIN_FAILED',
                        comment=f"Failed login attempt for identifier '{raw_username}' (Attempt {attempts}/5)."
                    )
            except Exception:
                pass
                
            return Response({'error': 'Invalid username or password.'}, status=status.HTTP_401_UNAUTHORIZED)
            
        cache.delete(cache_key)
        cache.delete(lockout_key)
        
        profile = getattr(user, 'staff_profile', None)
        role = getattr(profile, 'role', 'admin' if user.is_superuser else 'farmer')
        
        # 4. MFA Step (for officers/staff by default)
        mfa_required = (user.is_staff and getattr(profile, 'mfa_enabled', True))
        if mfa_required:
            otp_key = f"mfa_hashed_otp_{user.id}"
            attempt_key = f"mfa_attempts_{user.id}"
            mfa_attempts = cache.get(attempt_key, 0)
            if mfa_attempts >= 5:
                return Response({'error': 'Too many failed MFA verification attempts. Locked out for 15 minutes.'}, status=status.HTTP_429_TOO_MANY_REQUESTS)
                
            if mfa_code:
                cached_hash = cache.get(otp_key)
                code_hash = hashlib.sha256(f"{user.id}:{mfa_code.strip()}:{settings.SECRET_KEY}".encode()).hexdigest()
                is_valid_test = (settings.DEBUG or getattr(settings, 'TESTING', False)) and mfa_code.strip() == '123456'
                if (cached_hash and code_hash == cached_hash) or is_valid_test:
                    cache.delete(otp_key)
                    cache.delete(attempt_key)
                else:
                    cache.set(attempt_key, mfa_attempts + 1, timeout=900)
                    return Response({'error': 'Invalid or expired MFA security code.'}, status=status.HTTP_400_BAD_REQUEST)
            else:
                import random
                from .services.email_service import EmailService
                otp = f"{random.randint(100000, 999999)}"
                hashed_otp = hashlib.sha256(f"{user.id}:{otp}:{settings.SECRET_KEY}".encode()).hexdigest()
                cache.set(otp_key, hashed_otp, timeout=600)
                cache.set(attempt_key, 0, timeout=600)
                
                officer_name = f"{user.first_name} {user.last_name}".strip() or role
                if user.email:
                    EmailService.send_mfa_otp(user.email, officer_name, otp)
                    
                masked_email = f"{user.email[:2]}***@{user.email.split('@')[-1]}" if user.email and '@' in user.email else "user@lands.gov.zw"
                resp_payload = {
                    'mfa_required': True,
                    'username': user.username,
                    'email_masked': masked_email,
                    'message': f'Multi-Factor Authentication required. A 6-digit security OTP has been dispatched to {masked_email} (expires in 10 minutes).'
                }
                if settings.DEBUG or getattr(settings, 'TESTING', False):
                    resp_payload['dev_otp'] = otp
                return Response(resp_payload, status=status.HTTP_200_OK)

        login(request, user)
        token = generate_signed_token(user, role=role, privileges=getattr(profile, 'privileges', []))
        name = f"{user.first_name} {user.last_name}".strip() or user.username
        must_change_password = getattr(profile, 'must_change_password', False)
        
        return Response({
            'name': name,
            'first_name': user.first_name,
            'last_name': user.last_name,
            'role': role,
            'username': user.username,
            'email': user.email,
            'department': getattr(profile, 'department', '') or '',
            'channels': getattr(profile, 'channels', []) or [],
            'privileges': getattr(profile, 'privileges', []) or [],
            'is_active': user.is_active,
            'must_change_password': must_change_password,
            'token': token
        })


class CheckSessionView(APIView):
    permission_classes = [permissions.AllowAny]
    throttle_classes = [AnonBurstRateThrottle]
    
    def get(self, request):
        if not (request.user and request.user.is_authenticated):
            auth = SignedTokenAuthentication()
            auth_res = auth.authenticate(request)
            if auth_res:
                request.user = auth_res[0]

        if request.user and request.user.is_authenticated:
            if not request.user.is_active:
                return Response({'error': 'Account deactivated by System Administrator.'}, status=status.HTTP_403_FORBIDDEN)
                
            profile = getattr(request.user, 'staff_profile', None)
            role = getattr(profile, 'role', 'admin' if request.user.is_superuser else 'farmer')
            token = generate_signed_token(request.user, role=role, privileges=getattr(profile, 'privileges', []))
            name = f"{request.user.first_name} {request.user.last_name}".strip() or request.user.username
            
            return Response({
                'name': name,
                'first_name': request.user.first_name,
                'last_name': request.user.last_name,
                'role': role,
                'username': request.user.username,
                'email': request.user.email,
                'department': getattr(profile, 'department', '') or '',
                'channels': getattr(profile, 'channels', []) or [],
                'privileges': getattr(profile, 'privileges', []) or [],
                'is_active': request.user.is_active,
                'must_change_password': getattr(profile, 'must_change_password', False),
                'token': token
            })
            
        return Response({'error': 'No active session'}, status=status.HTTP_401_UNAUTHORIZED)


class LogoutView(APIView):
    permission_classes = [permissions.AllowAny]
    throttle_classes = [AnonBurstRateThrottle]
    
    def post(self, request):
        """Logout user and clear session"""
        from django.contrib.auth import logout
        logout(request)
        return Response({'status': 'Logged out successfully'})

class RegisterViewSet(viewsets.GenericViewSet, viewsets.mixins.CreateModelMixin):
    permission_classes = [permissions.AllowAny]
    serializer_class = UserSerializer

    def create(self, request, *args, **kwargs):
        national_id = request.data.get('national_id', '').strip().upper()
        if national_id:
            try:
                validate_zimbabwe_national_id(national_id)
            except (DjangoValidationError, DRFValidationError) as ve:
                return Response({'error': str(ve)}, status=status.HTTP_400_BAD_REQUEST)
        return super().create(request, *args, **kwargs)

class AdminStaffViewSet(viewsets.ModelViewSet):
    queryset = User.objects.filter(is_staff=True)
    serializer_class = StaffUserSerializer
    permission_classes = [permissions.IsAdminUser]

    def get_queryset(self):
        return User.objects.filter(is_staff=True).select_related('staff_profile')

    def perform_create(self, serializer):
        user = serializer.save()
        self._record_privilege_audit(user, "ASSIGN", "Created staff account & assigned privileges")

    def perform_update(self, serializer):
        user = serializer.save()
        self._record_privilege_audit(user, "MODIFY", "Modified staff department, role, or privileges")

    def _record_privilege_audit(self, target_user, action_type, description):
        try:
            from .models import ApplicationAction, TitleDeedApplication
            app = TitleDeedApplication.objects.first()
            if app:
                profile = getattr(target_user, 'staff_profile', None)
                role = getattr(profile, 'role', 'unassigned')
                dept = getattr(profile, 'department', 'Unassigned')
                channels = getattr(profile, 'channels', [])
                privileges = getattr(profile, 'privileges', [])
                admin_name = getattr(self.request.user, 'username', 'System Admin')
                ApplicationAction.objects.create(
                    application=app,
                    officer=self.request.user if getattr(self.request.user, 'is_authenticated', False) else target_user,
                    from_stage=app.status,
                    to_stage=app.status,
                    action_type='PRIVILEGE_ASSIGN',
                    comment=f"{description}: Admin '{admin_name}' assigned to '{target_user.username}' -> Role: {role}, Dept: {dept}, Channels: {channels}, Privileges: {privileges}"
                )
        except Exception as e:
            print("Failed to record privilege audit:", e)
    
    def check_permissions(self, request):
        super().check_permissions(request)
        role = getattr(getattr(request.user, 'staff_profile', None), 'role', '')
        if not (request.user.is_superuser or role == 'admin'):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('Administrator privileges required.')

    @action(detail=True, methods=['post'])
    def toggle_active(self, request, pk=None):
        """Toggle the is_active status of a staff user"""
        user = self.get_object()
        user.is_active = not user.is_active
        user.save()
        self._record_privilege_audit(user, "MODIFY", f"Toggled active status to {user.is_active}")
        serializer = self.get_serializer(user)
        return Response({
            'message': f'User {user.username} is now {"active" if user.is_active else "inactive"}',
            'user': serializer.data
        })

    @action(detail=True, methods=['post'], url_path='reset-password')
    def reset_password(self, request, pk=None):
        """Reset a staff officer password to initial temporary 'Ministry' and set must_change_password=True"""
        user = self.get_object()
        user.set_password('Ministry')
        user.save()
        profile = getattr(user, 'staff_profile', None)
        if profile:
            profile.must_change_password = True
            profile.save()
        self._record_privilege_audit(user, "RESET_PASSWORD", "Reset officer password to temporary 'Ministry' (must change on next login)")
        return Response({'message': f"Password for officer @{user.username} has been reset to temporary 'Ministry'. Password change required on next login."})

    @action(detail=True, methods=['post'], url_path='toggle-mfa')
    def toggle_mfa(self, request, pk=None):
        """Toggle MFA enforcement for a staff account"""
        user = self.get_object()
        profile, _ = StaffProfile.objects.get_or_create(user=user)
        profile.mfa_enabled = not profile.mfa_enabled
        profile.save()
        self._record_privilege_audit(user, "TOGGLE_MFA", f"Toggled MFA to {profile.mfa_enabled}")
        return Response({
            'message': f"MFA for @{user.username} is now {'enabled' if profile.mfa_enabled else 'disabled'}.",
            'mfa_enabled': profile.mfa_enabled
        })

    @action(detail=False, methods=['get'], url_path='oversight')
    def oversight(self, request):
        """Admin & Director read-only oversight: counts per stage, SLA overdue files (> 3 days), staff count"""
        from django.db.models import Count
        from django.utils import timezone
        from datetime import timedelta
        from .models import TitleDeedApplication

        stage_counts = dict(
            TitleDeedApplication.objects.values('status')
            .annotate(total=Count('id'))
            .values_list('status', 'total')
        )
        overdue_cutoff = timezone.now() - timedelta(days=3)
        overdue_count = TitleDeedApplication.objects.exclude(
            status__in=['APPROVED', 'READY_FOR_COLLECTION']
        ).filter(updated_at__lt=overdue_cutoff).count()

        total_apps = TitleDeedApplication.objects.count()
        active_staff = User.objects.filter(is_staff=True, is_active=True).count()
        disputed_count = TitleDeedApplication.objects.filter(has_disputes=True).count()
        queried_count = TitleDeedApplication.objects.filter(is_queried=True).count()

        return Response({
            'stage_counts': stage_counts,
            'overdue_count': overdue_count,
            'total_applications': total_apps,
            'active_staff': active_staff,
            'disputed_count': disputed_count,
            'queried_count': queried_count,
            'sla_target_days': 3
        })

class ReportViewSet(viewsets.ViewSet):
    permission_classes = [permissions.IsAuthenticated, IsAssignedStaffOrAdmin]

    @action(detail=False, methods=['get'], url_path='summary')
    def summary(self, request):
        from .services.reporting_service import get_analytics_summary
        return Response(get_analytics_summary(), status=status.HTTP_200_OK)

    @action(detail=False, methods=['get'], url_path='export-csv')
    def export_csv(self, request):
        from .services.reporting_service import generate_csv_report
        csv_data = generate_csv_report()
        response = HttpResponse(csv_data, content_type='text/csv')
        response['Content-Disposition'] = 'attachment; filename="title_deeds_applications_report.csv"'
        return response

    @action(detail=False, methods=['get'], url_path='export-pdf')
    def export_pdf(self, request):
        from .services.reporting_service import generate_pdf_report
        pdf_bytes = generate_pdf_report()
        response = HttpResponse(pdf_bytes, content_type='application/pdf')
        response['Content-Disposition'] = 'inline; filename="title_deeds_executive_summary.pdf"'
        return response

    """
    ViewSet for generating role-based reports.
    Each action returns JSON data for role-specific analytics.
    """

    @action(detail=False, methods=['get'], url_path='admin-overview')
    def admin_overview(self, request):
        return self.director_report(request)
    
    @action(detail=False, methods=['get'], url_path='director')
    def director_report(self, request):
        """Comprehensive system report for Director"""
        from django.db.models import Count, Sum, Avg, Q
        from django.utils import timezone
        from datetime import timedelta
        
        # Summary statistics
        total_applications = TitleDeedApplication.objects.count()
        status_breakdown = TitleDeedApplication.objects.values('status').annotate(count=Count('id'))
        
        # Financial summary
        total_revenue = TitleDeedApplication.objects.filter(
            status__in=['PAYMENT_VERIFIED', 'READY_FOR_COLLECTION', 'APPROVED']
        ).aggregate(total=Sum('purchase_price'))['total'] or 0
        
        pending_payments = TitleDeedApplication.objects.filter(
            status__in=['AWAITING_PAYMENT', 'AGREEMENT_OF_SALE']
        ).aggregate(total=Sum('purchase_price'))['total'] or 0
        
        survey_fees_collected = TitleDeedApplication.objects.filter(
            status__in=['SURVEY_FEE_PAID', 'SURVEYED', 'VALUATED', 'AWAITING_PAYMENT']
        ).aggregate(total=Sum('survey_fee'))['total'] or 0
        
        # Payment method breakdown
        payment_breakdown = TitleDeedApplication.objects.filter(
            payment_plan__isnull=False
        ).values('payment_plan').annotate(count=Count('id'))
        
        # District analysis
        district_breakdown = TitleDeedApplication.objects.values('district').annotate(
            count=Count('id')
        ).order_by('-count')[:10]
        
        # Applications pending > 30 days
        thirty_days_ago = timezone.now() - timedelta(days=30)
        long_pending = TitleDeedApplication.objects.filter(
            created_at__lt=thirty_days_ago,
            status__in=['PENDING', 'LIMS_VERIFIED', 'RESETTLEMENT_VERIFIED', 'ZLC_VERIFIED', 'SURVEYED', 'VALUATED']
        ).count()
        
        # Officer performance
        officer_stats = ApplicationAction.objects.values(
            'officer__username'
        ).annotate(
            actions_count=Count('id')
        ).order_by('-actions_count')[:10]
        
        # Recent activity (last 7 days)
        seven_days_ago = timezone.now() - timedelta(days=7)
        recent_count = TitleDeedApplication.objects.filter(created_at__gte=seven_days_ago).count()
        
        return Response({
            'summary': {
                'total_applications': total_applications,
                'status_breakdown': list(status_breakdown),
                'total_revenue': float(total_revenue),
                'pending_payments': float(pending_payments),
                'survey_fees_collected': float(survey_fees_collected),
                'long_pending_count': long_pending,
                'recent_7_days': recent_count
            },
            'payment_methods': list(payment_breakdown),
            'districts': list(district_breakdown),
            'officer_performance': list(officer_stats)
        })
    
    @action(detail=False, methods=['get'], url_path='director-applications')
    def director_applications(self, request):
        """Return paginated list of applications for Director drill-down, with optional status filter."""
        status_filter = request.query_params.get('status', '')
        page = int(request.query_params.get('page', 1))
        page_size = int(request.query_params.get('page_size', 25))

        qs = TitleDeedApplication.objects.select_related('farmer').all().order_by('-created_at')

        if status_filter:
            qs = qs.filter(status=status_filter)

        total_count = qs.count()
        start = (page - 1) * page_size
        end = start + page_size
        applications = qs[start:end]

        results = []
        for app in applications:
            results.append({
                'id': app.id,
                'farm_name': app.farm_name,
                'farmer_name': f"{app.farmer.first_name} {app.farmer.surname}",
                'district': app.district,
                'status': app.status,
                'created_at': app.created_at.isoformat(),
                'purchase_price': float(app.purchase_price) if app.purchase_price else None,
            })

        return Response({
            'count': total_count,
            'page': page,
            'page_size': page_size,
            'total_pages': (total_count + page_size - 1) // page_size if total_count > 0 else 1,
            'results': results,
        })

    @action(detail=False, methods=['get'], url_path='lims')
    def lims_report(self, request):
        """LIMS Officer specific report"""
        from django.db.models import Count
        
        pending_verification = TitleDeedApplication.objects.filter(status='PENDING').count()
        verified_count = TitleDeedApplication.objects.filter(status__in=[
            'LIMS_VERIFIED', 'RESETTLEMENT_VERIFIED', 'ZLC_VERIFIED', 'SURVEYED', 
            'VALUATED', 'SELECT_PAYMENT', 'PAYMENT_VERIFIED'
        ]).count()
        referred_to_resettlement = TitleDeedApplication.objects.filter(status='REFERRED').count()
        queried_count = TitleDeedApplication.objects.filter(status='QUERIED').count()
        
        # Recent activity by this officer
        my_actions = ApplicationAction.objects.filter(
            officer=request.user, 
            action_type__in=['LIMS_VERIFIED', 'QUERIED', 'REFERRED']
        ).count()
        
        return Response({
            'summary': {
                'pending_verification': pending_verification,
                'verified_count': verified_count,
                'referred_to_resettlement': referred_to_resettlement,
                'queried_count': queried_count,
                'my_actions': my_actions
            }
        })
    
    @action(detail=False, methods=['get'], url_path='resettlement')
    def resettlement_report(self, request):
        """Resettlement Officer specific report"""
        pending_verification = TitleDeedApplication.objects.filter(status='REFERRED').count()
        verified_count = ApplicationAction.objects.filter(
            officer=request.user,
            action_type='RESETTLEMENT_VERIFIED'
        ).count()
        
        return Response({
            'summary': {
                'pending_verification': pending_verification,
                'verified_count': verified_count
            }
        })
    
    @action(detail=False, methods=['get'], url_path='zlc')
    def zlc_report(self, request):
        """ZLC Officer specific report"""
        from django.db.models import Count
        
        pending_verification = TitleDeedApplication.objects.filter(status='RESETTLEMENT_VERIFIED').count()
        verified_count = ApplicationAction.objects.filter(
            officer=request.user,
            action_type='ZLC_VERIFIED'
        ).count()
        
        # By district
        district_breakdown = TitleDeedApplication.objects.filter(
            status__in=['RESETTLEMENT_VERIFIED', 'ZLC_VERIFIED']
        ).values('district').annotate(count=Count('id'))
        
        return Response({
            'summary': {
                'pending_verification': pending_verification,
                'verified_count': verified_count
            },
            'districts': list(district_breakdown)
        })
    
    @action(detail=False, methods=['get'], url_path='surveyor')
    def surveyor_report(self, request):
        """Surveyor specific report"""
        from django.db.models import Sum
        
        pending_survey = TitleDeedApplication.objects.filter(status='ZLC_VERIFIED').count()
        awaiting_fee = TitleDeedApplication.objects.filter(status='AWAITING_SURVEY_FEE').count()
        fee_paid = TitleDeedApplication.objects.filter(status='SURVEY_FEE_PAID').count()
        surveyed = ApplicationAction.objects.filter(
            officer=request.user,
            action_type='SURVEYED'
        ).count()
        
        total_fees = TitleDeedApplication.objects.filter(
            status__in=['SURVEY_FEE_PAID', 'SURVEYED']
        ).aggregate(total=Sum('survey_fee'))['total'] or 0
        
        return Response({
            'summary': {
                'pending_survey': pending_survey,
                'awaiting_survey_fee': awaiting_fee,
                'survey_fee_paid': fee_paid,
                'completed_surveys': surveyed,
                'total_survey_fees': float(total_fees)
            }
        })
    
    @action(detail=False, methods=['get'], url_path='valuation')
    def valuation_report(self, request):
        """Valuation Officer specific report"""
        from django.db.models import Count, Avg
        
        pending_valuation = TitleDeedApplication.objects.filter(status='SURVEYED').count()
        valuated_count = TitleDeedApplication.objects.filter(valuation_approved=True).count()
        
        # Price overrides (check officer_comments for override keywords)
        price_overrides = TitleDeedApplication.objects.filter(
            officer_comments__icontains='PRICE OVERRIDE'
        ).count()
        
        avg_purchase_price = TitleDeedApplication.objects.filter(
            purchase_price__isnull=False
        ).aggregate(avg=Avg('purchase_price'))['avg'] or 0
        
        return Response({
            'summary': {
                'pending_valuation': pending_valuation,
                'valuated_count': valuated_count,
                'price_overrides': price_overrides,
                'avg_purchase_price': float(avg_purchase_price)
            }
        })
    
    @action(detail=False, methods=['get'], url_path='finance')
    def finance_report(self, request):
        """Finance Officer specific report"""
        from django.db.models import Sum, Count
        
        pending_verification = TitleDeedApplication.objects.filter(
            status__in=['AGREEMENT_OF_SALE']
        ).count()
        
        payment_verified = TitleDeedApplication.objects.filter(status='PAYMENT_VERIFIED').count()
        
        # Revenue by payment method
        cash_revenue = TitleDeedApplication.objects.filter(
            payment_plan='CASH',
            status='PAYMENT_VERIFIED'
        ).aggregate(total=Sum('purchase_price'))['total'] or 0
        
        mortgage_revenue = TitleDeedApplication.objects.filter(
            payment_plan='MORTGAGE',
            status='PAYMENT_VERIFIED'
        ).aggregate(total=Sum('purchase_price'))['total'] or 0
        
        # Outstanding payments
        outstanding = TitleDeedApplication.objects.filter(
            status__in=['SELECT_PAYMENT', 'AGREEMENT_OF_SALE']
        ).aggregate(total=Sum('purchase_price'))['total'] or 0
        
        # Survey fees
        survey_fees = TitleDeedApplication.objects.filter(
            status__in=['SURVEY_FEE_PAID', 'SURVEYED', 'VALUATED']
        ).aggregate(total=Sum('survey_fee'))['total'] or 0
        
        return Response({
            'summary': {
                'pending_verification': pending_verification,
                'payment_verified': payment_verified,
                'cash_revenue': float(cash_revenue),
                'mortgage_revenue': float(mortgage_revenue),
                'total_revenue': float(cash_revenue + mortgage_revenue),
                'outstanding_payments': float(outstanding),
                'survey_fees_collected': float(survey_fees)
            }
        })
    
    @action(detail=False, methods=['get'], url_path='role-applications')
    def role_applications(self, request):
        """Return paginated applications filtered by role and optional status.
        Used by all officer roles for drill-down from report stat cards."""
        role = request.query_params.get('role', '')
        status_filter = request.query_params.get('status', '')
        page = int(request.query_params.get('page', 1))
        page_size = int(request.query_params.get('page_size', 25))

        qs = TitleDeedApplication.objects.select_related('farmer').all().order_by('-created_at')

        # Apply role-based default filtering
        role_status_map = {
            'lims': ['PENDING', 'LIMS_VERIFIED', 'QUERIED', 'REFERRED', 'RESUBMITTED'],
            'resettlement': ['REFERRED', 'RESETTLEMENT_VERIFIED'],
            'zlc': ['RESETTLEMENT_VERIFIED', 'ZLC_VERIFIED'],
            'surveyor': ['ZLC_VERIFIED', 'AWAITING_SURVEY_FEE', 'SURVEY_FEE_PAID', 'SURVEYED'],
            'valuation': ['SURVEYED', 'VALUATED'],
            'finance': ['AGREEMENT_OF_SALE', 'PAYMENT_VERIFIED', 'SELECT_PAYMENT'],
            'director': [],  # Director sees all
        }

        if status_filter:
            qs = qs.filter(status=status_filter)
        elif role in role_status_map and role_status_map[role]:
            qs = qs.filter(status__in=role_status_map[role])

        total_count = qs.count()
        start = (page - 1) * page_size
        end = start + page_size
        applications = qs[start:end]

        results = []
        for app in applications:
            results.append({
                'id': app.id,
                'farm_name': app.farm_name,
                'farmer_name': f"{app.farmer.first_name} {app.farmer.last_name}",
                'district': app.district,
                'status': app.status,
                'created_at': app.created_at.isoformat(),
                'purchase_price': float(app.purchase_price) if app.purchase_price else None,
                'farm_extent': float(app.farm_extent) if app.farm_extent else None,
                'survey_fee': float(app.survey_fee) if app.survey_fee else None,
            })

        return Response({
            'count': total_count,
            'page': page,
            'page_size': page_size,
            'total_pages': (total_count + page_size - 1) // page_size if total_count > 0 else 1,
            'results': results,
        })
    
    @action(detail=False, methods=['get'], url_path='audit-logs')
    def audit_logs(self, request):
        """
        Admin-only endpoint to retrieve all audit logs (ApplicationAction records)
        with filtering capabilities.
        """
        from datetime import datetime, timedelta
        
        # Get all application actions
        logs = ApplicationAction.objects.select_related(
            'officer', 'officer__staff_profile', 'application', 'application__farmer'
        ).all()
        
        # Apply filters
        date_from = request.query_params.get('date_from')
        date_to = request.query_params.get('date_to')
        officer_username = request.query_params.get('officer')
        action_type = request.query_params.get('action_type')
        application_id = request.query_params.get('application_id')
        
        if date_from:
            logs = logs.filter(created_at__gte=date_from)
        if date_to:
            # Add one day to include the entire end date
            end_date = datetime.strptime(date_to, '%Y-%m-%d') + timedelta(days=1)
            logs = logs.filter(created_at__lt=end_date)
        if officer_username:
            logs = logs.filter(officer__username__icontains=officer_username)
        if action_type:
            logs = logs.filter(action_type__iexact=action_type)
        if application_id:
            logs = logs.filter(application_id=application_id)
        
        # Pagination
        page_size = int(request.query_params.get('page_size', 50))
        page = int(request.query_params.get('page', 1))
        start = (page - 1) * page_size
        end = start + page_size
        
        total_count = logs.count()
        paginated_logs = logs[start:end]
        
        # Serialize data
        results = []
        for log in paginated_logs:
            results.append({
                'id': log.id,
                'timestamp': log.created_at.isoformat(),
                'officer': {
                    'username': log.officer.username,
                    'name': f"{log.officer.first_name} {log.officer.last_name}",
                    'role': getattr(log.officer.staff_profile, 'role', 'N/A') if hasattr(log.officer, 'staff_profile') else 'N/A',
                },
                'action_type': log.action_type,
                'application': {
                    'id': log.application.id,
                    'farm_name': log.application.farm_name,
                    'farmer_name': f"{log.application.farmer.first_name} {log.application.farmer.surname}",
                },
                'receipt_number': getattr(log.application, 'receipt_number', None) or getattr(log.application, 'statutory_fee_receipt', None) or 'No receipt on file',
                'reference_number': getattr(log.application, 'reference_number', None) or f"REF-{log.application.id:06d}",
                'comments': log.comment or '',
                'previous_hash': log.previous_hash,
                'block_hash': log.block_hash,
            })
        
        return Response({
            'count': total_count,
            'page': page,
            'page_size': page_size,
            'total_pages': (total_count + page_size - 1) // page_size,
            'results': results
        })


    @action(detail=False, methods=['get'], url_path='gis')
    def gis_report(self, request):
        """GIS Spatial Cadastral & Conflict Analysis Report (D6)"""
        from onlineapplicationapi.models import TitleDeedApplication
        total = TitleDeedApplication.objects.count()
        with_coords = TitleDeedApplication.objects.exclude(boundary_coordinates__isnull=True).exclude(boundary_coordinates='').count()
        overlap_count = TitleDeedApplication.objects.filter(spatial_overlap_ratio__gt=0).count()
        disputes = TitleDeedApplication.objects.filter(has_disputes=True).count()
        return Response({
            "report_name": "GIS Spatial Cadastral & Conflict Analysis Report",
            "total_parcels": total,
            "digitized_parcels": with_coords,
            "boundary_conflicts_detected": overlap_count,
            "disputed_parcels": disputes,
            "generated_at": timezone.now().isoformat()
        })

    @action(detail=False, methods=['get'], url_path='deeds')
    def deeds_report(self, request):
        """Deeds Registry Great Seal Issuance & Collection Report (D6)"""
        from onlineapplicationapi.models import TitleDeedApplication
        ready = TitleDeedApplication.objects.filter(status='READY_FOR_COLLECTION').count()
        approved = TitleDeedApplication.objects.filter(status='APPROVED').count()
        return Response({
            "report_name": "Deeds Registry Great Seal Issuance & Collection Report",
            "approved_by_director": approved,
            "ready_for_collection": ready,
            "generated_at": timezone.now().isoformat()
        })

    def export_audit_logs(self, request):
        """
        Export audit logs to CSV
        """
        import csv
        from django.http import HttpResponse
        from datetime import datetime, timedelta

        # Get logs with filtering
        logs = ApplicationAction.objects.select_related(
            'officer', 'officer__staff_profile', 'application', 'application__farmer'
        ).all().order_by('-created_at')

        # Apply filters
        date_from = request.query_params.get('date_from')
        date_to = request.query_params.get('date_to')
        officer_username = request.query_params.get('officer')
        action_type = request.query_params.get('action_type')
        application_id = request.query_params.get('application_id')
        
        if date_from:
            logs = logs.filter(created_at__gte=date_from)
        if date_to:
            end_date = datetime.strptime(date_to, '%Y-%m-%d') + timedelta(days=1)
            logs = logs.filter(created_at__lt=end_date)
        if officer_username:
            logs = logs.filter(officer__username__icontains=officer_username)
        if action_type:
            logs = logs.filter(action_type__iexact=action_type)
        if application_id:
            logs = logs.filter(application_id=application_id)

        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = f'attachment; filename="audit_logs_{datetime.now().strftime("%Y%m%d_%H%M%S")}.csv"'

        writer = csv.writer(response)
        writer.writerow(['Timestamp', 'Officer Username', 'Officer Name', 'Officer Role', 'Action', 'Application ID', 'Farm Name', 'Farmer', 'Comments'])

        for log in logs:
            writer.writerow([
                log.created_at.strftime('%Y-%m-%d %H:%M:%S'),
                log.officer.username,
                f"{log.officer.first_name} {log.officer.last_name}",
                getattr(log.officer.staff_profile, 'role', 'N/A') if hasattr(log.officer, 'staff_profile') else 'N/A',
                log.action_type,
                log.application.id,
                log.application.farm_name,
                f"{log.application.farmer.first_name} {log.application.farmer.surname}",
                log.comment or ''
            ])

        return response

class SetCSRFCookieView(APIView):
    permission_classes = [permissions.AllowAny]
    throttle_classes = [AnonBurstRateThrottle]
    
    @method_decorator(ensure_csrf_cookie)
    def get(self, request):
        return Response({'success': 'CSRF cookie set'})

from rest_framework.views import APIView
class UserProfileView(APIView):
    """
    Endpoint for users to view and update their own profile details.
    """
    permission_classes = [permissions.IsAuthenticated]
    
    def get(self, request):
        serializer = UserProfileSerializer(request.user)
        return Response(serializer.data)
        
    def put(self, request):
        serializer = UserProfileSerializer(request.user, data=request.data, partial=True)
        if serializer.is_valid():
            user = serializer.save()
            # Return fresh data to ensure frontend has latest
            return Response(UserProfileSerializer(user).data)

@method_decorator(csrf_exempt, name='dispatch')
class PasswordResetRequestView(APIView):
    authentication_classes = []
    """
    Endpoint for requesting a password reset verification code.
    Generates a secure 6-digit verification code, sends it to the user's claimed email,
    and returns instructions to verify ownership and set a new password.
    """
    permission_classes = [permissions.AllowAny]
    throttle_classes = [AnonBurstRateThrottle]

    def post(self, request):
        username = (request.data.get('username') or '').strip()
        email = (request.data.get('email') or '').strip()
        identifier = email or username
        
        user = None
        if identifier:
            if '@' in identifier:
                user = User.objects.filter(email__iexact=identifier).first()
                if not user:
                    from .models import FarmerProfile
                    prof = FarmerProfile.objects.filter(email__iexact=identifier).first()
                    if prof and prof.user:
                        user = prof.user
            if not user:
                formatted_id = format_national_id(identifier)
                user = User.objects.filter(username__iexact=formatted_id).first()
                if not user:
                    user = User.objects.filter(username__iexact=identifier).first()
                if not user:
                    from .models import FarmerProfile
                    prof = FarmerProfile.objects.filter(national_id__iexact=formatted_id).first()
                    if not prof:
                        prof = FarmerProfile.objects.filter(national_id__iexact=identifier).first()
                    if prof and prof.user:
                        user = prof.user
            if not user:
                user = User.objects.filter(email__iexact=identifier).first()
            
        if user:
            # Sync user email if missing on User model but present on FarmerProfile
            if not user.email and hasattr(user, 'farmer_profile') and user.farmer_profile.email:
                user.email = user.farmer_profile.email
                user.save(update_fields=['email'])

        if user and user.email:
            import random
            from django.core.cache import cache
            
            # Generate 6-digit verification code
            verification_code = f"{random.randint(100000, 999999)}"
            
            # Store in cache for 15 minutes (900 seconds)
            cache_payload = {
                'code': verification_code,
                'user_id': user.id,
                'email': user.email.lower()
            }
            cache.set(f"pwd_reset_code_{user.id}", verification_code, timeout=900)
            cache.set(f"pwd_reset_code_email_{user.email.lower()}", cache_payload, timeout=900)
            if user.username:
                cache.set(f"pwd_reset_code_user_{user.username.lower()}", cache_payload, timeout=900)

            # Mask email for privacy (e.g. pe***@gmail.com)
            parts = user.email.split('@')
            if len(parts) == 2 and len(parts[0]) > 2:
                masked_email = f"{parts[0][:2]}***@{parts[1]}"
            else:
                masked_email = user.email

            # Send official verification email via OneStop Email Service
            from .services.email_service import EmailService
            full_name = f"{user.first_name} {user.last_name}".strip() or user.username
            EmailService.send_verification_code(
                recipient_email=user.email,
                full_name=full_name,
                username=user.username,
                code=verification_code
            )

            from django.conf import settings
            response_data = {
                'status': f'A verification code has been dispatched to {masked_email}.',
                'email': user.email,
                'email_masked': masked_email,
                'username': user.username,
                'step': 'verify'
            }

            # The verification code is strictly dispatched to the user's email mailbox and NEVER returned to the client interface
            return Response(response_data)
            
        return Response({'status': 'If an account with that email or username exists, a verification code has been dispatched.'})


@method_decorator(csrf_exempt, name='dispatch')
class PasswordResetConfirmView(APIView):
    authentication_classes = []
    """
    Endpoint for confirming password reset with either:
    1. Verification Code (OTP) sent to the claimed email (primary).
    2. Token + uidb64 link (backward compatibility).
    """
    permission_classes = [permissions.AllowAny]
    throttle_classes = [AnonBurstRateThrottle]

    def post(self, request):
        code = (request.data.get('verification_code') or request.data.get('code') or '').strip()
        email = (request.data.get('email') or request.data.get('username') or '').strip()
        new_password = request.data.get('new_password')
        
        # Branch 1: Verification Code based reset
        if code and email:
            if not new_password or len(new_password) < 8:
                return Response({'error': 'Password must be at least 8 characters long.'}, status=status.HTTP_400_BAD_REQUEST)
                
            from django.core.cache import cache
            from django.conf import settings
            
            # Find user
            user = None
            if '@' in email:
                user = User.objects.filter(email__iexact=email).first()
                if not user:
                    from .models import FarmerProfile
                    prof = FarmerProfile.objects.filter(email__iexact=email).first()
                    if prof and prof.user:
                        user = prof.user
            if not user:
                user = User.objects.filter(username__iexact=email).first()
            if not user:
                formatted_id = format_national_id(email)
                user = User.objects.filter(username__iexact=formatted_id).first()
                if not user:
                    from .models import FarmerProfile
                    prof = FarmerProfile.objects.filter(national_id__iexact=formatted_id).first()
                    if not prof:
                        prof = FarmerProfile.objects.filter(national_id__iexact=email).first()
                    if prof and prof.user:
                        user = prof.user

            if not user:
                return Response({'error': 'Account not found for the provided email or username.'}, status=status.HTTP_404_NOT_FOUND)

            # Check verification code from cache
            cached_code = cache.get(f"pwd_reset_code_{user.id}")
            if not cached_code:
                cache_payload = cache.get(f"pwd_reset_code_email_{user.email.lower()}")
                if cache_payload and isinstance(cache_payload, dict):
                    cached_code = cache_payload.get('code')

            # Fallback for dev mode
            is_valid = False
            if cached_code and cached_code == code:
                is_valid = True
            elif settings.DEBUG and code == '123456':
                is_valid = True
            else:
                # Fallback: check recent EmailLog in DB sent in last 15 mins containing the code
                from django.utils import timezone
                from datetime import timedelta
                from .models import EmailLog
                recent_log = EmailLog.objects.filter(
                    recipient__iexact=user.email,
                    sent_at__gte=timezone.now() - timedelta(minutes=15)
                ).order_by('-id').first()
                if recent_log and code in recent_log.body:
                    is_valid = True

            if not is_valid:
                return Response({'error': 'Invalid or expired verification code. Please check your email and try again.'}, status=status.HTTP_400_BAD_REQUEST)

            # Code verified! Set new password
            user.set_password(new_password)
            user.save()

            # Clean up verification caches
            cache.delete(f"pwd_reset_code_{user.id}")
            cache.delete(f"pwd_reset_code_email_{user.email.lower()}")
            if user.username:
                cache.delete(f"pwd_reset_code_user_{user.username.lower()}")

            return Response({
                'status': 'Password reset successfully! Your authenticity as account owner is confirmed.',
                'username': user.username
            })

        # Branch 2: Legacy Token/uidb64 based reset
        uidb64 = request.data.get('uidb64')
        token = request.data.get('token')
        
        if uidb64 and token and new_password:
            from django.utils.http import urlsafe_base64_decode
            from django.utils.encoding import force_str
            from django.contrib.auth.tokens import default_token_generator
            
            try:
                uid = force_str(urlsafe_base64_decode(uidb64))
                user = User.objects.get(pk=uid)
            except (TypeError, ValueError, OverflowError, User.DoesNotExist):
                user = None

            if user is not None and default_token_generator.check_token(user, token):
                user.set_password(new_password)
                user.save()
                return Response({'status': 'Password has been reset successfully.'})
            else:
                return Response({'error': 'Invalid or expired reset link.'}, status=status.HTTP_400_BAD_REQUEST)

        return Response({'error': 'Missing required fields. Please provide verification code and email or valid reset link.'}, status=status.HTTP_400_BAD_REQUEST)


class IntegrationViewSet(viewsets.ViewSet):
    """
    ViewSet for handling external government API integrations (Simulated).
    """
    permission_classes = [permissions.IsAuthenticated]

    @action(detail=False, methods=['get'], url_path='all')
    def fetch_all(self, request):
        national_id = request.query_params.get('id')
        if not national_id:
            return Response({'error': 'National ID is required'}, status=status.HTTP_400_BAD_REQUEST)
        
        from .services.integration_service import IntegrationService
        data = IntegrationService.fetch_display_data(national_id)
        
        if not data:
            return Response({'error': 'No record found for this National ID across government databases.'}, status=status.HTTP_404_NOT_FOUND)
            
        return Response(data)


from django.http import FileResponse, HttpResponse, Http404
from django.conf import settings

class SecureDocumentDownloadView(APIView):
    """
    Secure Document Access Endpoint (E2).
    Enforces strict whitelist for files, biometric front/side photos, ID cards, and signatures.
    Requester must be application owner or assigned staff officer.
    Every download is logged in the hash-chained audit ledger.
    """
    permission_classes = [permissions.IsAuthenticated]

    ALLOWED_FIELDS = {
        'tenure_document',
        'national_id_copy',
        'other_attachments',
        'war_vet_id_copy',
        'employment_proof',
        'survey_diagram',
        'valuation_report',
        'deed_document',
        'beneficiary_photo_front',
        'photo_side',
        'id_front',
        'id_back',
        'signature',
        'spouse_id_front',
        'spouse_id_back',
        'spouse_photo',
    }

    def get(self, request, application_id, field_name):
        if field_name not in self.ALLOWED_FIELDS:
            return Response({'error': f"Field '{field_name}' is not in allowed document fields."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            application = TitleDeedApplication.objects.select_related('farmer__user').get(pk=application_id)
        except TitleDeedApplication.DoesNotExist:
            raise Http404("Application not found.")

        user = request.user
        is_owner = (application.farmer and application.farmer.user == user)
        is_admin_or_director = user.is_superuser or (
            hasattr(user, 'staff_profile') and user.staff_profile.role in ('admin', 'director')
        )
        
        # Check permissions: Farmers: own documents only. Staff: only applications currently in their department queue.
        if is_owner:
            pass # allowed
        elif is_admin_or_director:
            pass # allowed
        elif hasattr(user, 'staff_profile') or user.is_staff:
            role = user.staff_profile.role if hasattr(user, 'staff_profile') else 'admin'
            expected_stage = ROLE_STAGE_MAP.get(role)
            if application.status != expected_stage:
                return Response(
                    {'error': f"Forbidden: Staff role '{role}' can only access documents for applications currently in '{expected_stage}' queue."},
                    status=status.HTTP_403_FORBIDDEN
                )
        else:
            return Response({'error': 'Unauthorized to access this document.'}, status=status.HTTP_403_FORBIDDEN)

        # Explicit whitelisted mapping without getattr
        field_map = {
            'tenure_document': application.tenure_document,
            'national_id_copy': application.national_id_copy,
            'other_attachments': application.other_attachments,
            'war_vet_id_copy': application.war_vet_id_copy,
            'employment_proof': application.employment_proof,
            'survey_diagram': getattr(application, 'survey_diagram', None),
            'valuation_report': getattr(application, 'valuation_report', None),
            'deed_document': getattr(application, 'deed_document', None),
            'beneficiary_photo_front': getattr(application, 'beneficiary_photo_front', None),
            'photo_side': getattr(application, 'photo_side', None),
            'id_front': getattr(application, 'id_front', None),
            'id_back': getattr(application, 'id_back', None),
            'signature': getattr(application, 'signature', None),
            'spouse_id_front': getattr(application, 'spouse_id_front', None),
            'spouse_id_back': getattr(application, 'spouse_id_back', None),
            'spouse_photo': getattr(application, 'spouse_photo', None),
        }
        file_obj = field_map.get(field_name)
        if not file_obj or not file_obj.name:
            raise Http404("Document file does not exist.")

        # E2: Log every document view or download in the immutable audit ledger
        try:
            ApplicationAction.objects.create(
                application=application,
                officer=user,
                from_stage=application.status,
                to_stage=application.status,
                action_type="DOCUMENT_ACCESS",
                comment=f"Protected document '{field_name}' accessed by {user.username}."
            )
        except Exception as e:
            logger.warning(f"Failed to log document access in audit ledger: {e}")

        try:
            return FileResponse(
                file_obj.open('rb'),
                as_attachment=False,
                filename=file_obj.name.split('/')[-1]
            )
        except FileNotFoundError:
            raise Http404("Physical file missing from storage.")

class TrackApplicationView(APIView):
    """
    Public Citizen Application Tracking Endpoint (No Auth Required).
    Verifies 3 factors:
    1. National ID
    2. Reference Number (e.g. TD-2026-00005 or APP-00005)
    3. Secret 6-digit Tracking PIN
    Returns generic 401 message on any discrepancy.
    Locks out for 15 minutes after 5 consecutive failures.
    """
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        from django.utils import timezone
        from datetime import timedelta
        national_id = str(request.data.get('national_id', '')).strip().upper()
        ref_num_raw = str(request.data.get('reference_number', '')).strip().upper()
        pin = str(request.data.get('receipt_number') or request.data.get('pin') or '').strip()

        GENERIC_ERROR = "Invalid verification details provided."

        if not national_id or not ref_num_raw or not pin:
            return Response({'error': GENERIC_ERROR}, status=status.HTTP_401_UNAUTHORIZED)

        # Lookup by reference number or ID
        app = TitleDeedApplication.objects.filter(reference_number__iexact=ref_num_raw).first()
        if not app:
            clean_id = ref_num_raw.replace('TD-2026-', '').replace('APP-', '').replace('APP', '').lstrip('0')
            try:
                app = TitleDeedApplication.objects.filter(id=int(clean_id)).first()
            except ValueError:
                pass

        if not app:
            return Response({'error': GENERIC_ERROR}, status=status.HTTP_401_UNAUTHORIZED)

        # Check Lockout
        now = timezone.now()
        if app.tracking_pin_locked_until and app.tracking_pin_locked_until > now:
            return Response(
                {'error': "Too many failed attempts. Public tracking temporarily locked out."},
                status=status.HTTP_401_UNAUTHORIZED
            )

        # Check National ID
        app_nat_id = app.get_applicant_national_id()
        id_match = (app_nat_id == national_id)

        # Check PIN
        app_receipt = (app.statutory_fee_receipt or '').strip().upper()
        receipt_match = bool(app_receipt and app_receipt == pin.upper()) or app.payments.filter(receipt_number__iexact=pin).exists()
        pin_match = receipt_match or verify_pin(pin, app.tracking_pin_hash)

        if not id_match or not pin_match:
            app.tracking_pin_failed_attempts = (app.tracking_pin_failed_attempts or 0) + 1
            if app.tracking_pin_failed_attempts >= 5:
                app.tracking_pin_locked_until = now + timedelta(minutes=15)
            app.save(update_fields=['tracking_pin_failed_attempts', 'tracking_pin_locked_until'])
            return Response({'error': GENERIC_ERROR}, status=status.HTTP_401_UNAUTHORIZED)

        # Reset failures on match
        if app.tracking_pin_failed_attempts > 0 or app.tracking_pin_locked_until:
            app.tracking_pin_failed_attempts = 0
            app.tracking_pin_locked_until = None
            app.save(update_fields=['tracking_pin_failed_attempts', 'tracking_pin_locked_until'])

        # Return 9-stage timeline
        curr_idx = STAGE_SEQUENCE.index(app.status) if app.status in STAGE_SEQUENCE else 0
        timeline = []
        for i, (st_key, st_label) in enumerate(APPLICATION_STAGES):
            if i < curr_idx:
                state_str = "COMPLETED"
            elif i == curr_idx:
                state_str = "CURRENT"
            else:
                state_str = "PENDING"
            timeline.append({
                "stage": i + 1,
                "key": st_key,
                "label": st_label,
                "state": state_str,
            })

        return Response({
            "success": True,
            "reference_number": app.reference_number or f"APP-{app.id:05d}",
            "farm_name": app.farm_name,
            "district": app.district,
            "province": app.province,
            "status": app.status,
            "current_stage": curr_idx + 1,
            "due_date": app.current_stage_due_date.isoformat() if app.current_stage_due_date else None,
            "is_overdue": app.is_overdue,
            "timeline": timeline,
            "updated_at": app.updated_at.isoformat(),
        }, status=status.HTTP_200_OK)

class GISFarmsView(APIView):
    """
    GIS Farms Endpoint returning GeoJSON FeatureCollection of all application farm boundaries.
    Accessible to officers for boundary spatial mapping and overlap conflict checking.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        applications = TitleDeedApplication.objects.select_related('farmer').all()
        features = []

        for app in applications:
            coords = app.boundary_coordinates
            # Fallback mock polygon coords if none specified
            if not coords:
                # Default coordinates around Zimbabwe central region
                base_lat = -17.82 + (app.id % 10) * 0.05
                base_lng = 31.05 + (app.id % 8) * 0.05
                coords = [
                    [base_lng, base_lat],
                    [base_lng + 0.03, base_lat],
                    [base_lng + 0.03, base_lat - 0.03],
                    [base_lng, base_lat - 0.03],
                    [base_lng, base_lat]
                ]

            feature = {
                "type": "Feature",
                "id": app.id,
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [coords] if isinstance(coords[0], list) and not isinstance(coords[0][0], list) else coords
                },
                "properties": {
                    "application_id": app.id,
                    "reference_number": f"APP-{app.id:05d}",
                    "farm_name": app.farm_name,
                    "farmer_name": f"{app.farmer.first_name} {app.farmer.surname}" if app.farmer else "Unknown",
                    "district": app.district,
                    "province": app.province,
                    "size_hectares": str(app.size_hectares),
                    "status": app.status,
                    "has_disputes": app.has_disputes
                }
            }
            features.append(feature)

        return Response({
            "type": "FeatureCollection",
            "features": features
        })





class AIDisputePredictionView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def _calculate_and_persist(self, request, pk):
        try:
            application = TitleDeedApplication.objects.get(pk=pk)
        except TitleDeedApplication.DoesNotExist:
            return Response({'error': 'Application not found'}, status=status.HTTP_404_NOT_FOUND)

        from onlineapplicationapi.services.ai_predictor import predict_conflict
        prediction = predict_conflict(application)

        # Persist metrics
        application.ai_conflict_score = prediction.get('risk_score', 0)
        application.ai_conflict_level = prediction.get('risk_level', 'LOW')
        application.ai_conflict_details = prediction
        application.ai_model_version = "Gradient Boosting v2.1 (Prototype)"
        application.ai_risk_reasons = prediction.get('top_contributing_features', [])
        application.ai_assessed_at = timezone.now()
        application.save(update_fields=[
            'ai_conflict_score', 'ai_conflict_level', 'ai_conflict_details',
            'ai_model_version', 'ai_risk_reasons', 'ai_assessed_at'
        ])

        try:
            reasons = application.ai_risk_reasons or []
            reasons_formatted = [
                (r.get('description') or r.get('feature') or str(r)) if isinstance(r, dict) else str(r)
                for r in reasons[:3]
            ]
            reasons_str = ', '.join(reasons_formatted) if reasons_formatted else 'None identified'
            ApplicationAction.objects.create(
                application=application,
                officer=request.user if request.user.is_authenticated else (User.objects.filter(is_superuser=True).first() or User.objects.first()),
                from_stage=application.status,
                to_stage=application.status,
                action_type="AI_ASSESSMENT",
                comment=f"AI Dispute Prediction recalculated: Risk {application.ai_conflict_level} ({application.ai_conflict_score}%). Contributing factors: {reasons_str}. Prototype model - advisory only."
            )
        except Exception as e:
            logger.warning(f"Failed to log AI recalculation audit action: {e}")

        resp_data = dict(prediction)
        resp_data.update({
            'ai_conflict_score': application.ai_conflict_score,
            'ai_conflict_level': application.ai_conflict_level,
            'ai_model_version': application.ai_model_version,
            'ai_risk_reasons': application.ai_risk_reasons,
            'ai_assessed_at': application.ai_assessed_at.isoformat() if application.ai_assessed_at else None,
            'advisory_notice': "Prototype model - trained on synthetic data - advisory only",
        })
        return Response(resp_data)

    def get(self, request, pk):
        return self._calculate_and_persist(request, pk)

    def post(self, request, pk):
        return self._calculate_and_persist(request, pk)

class BlockchainAuditVerifyView(APIView):
    """
    Blockchain-style Cryptographic Audit Ledger Verification Endpoint.
    Verifies SHA-256 block hash chaining from Genesis block to head, proving
    the audit trail is mathematically tamper-free.
    """
    permission_classes = [permissions.IsAuthenticated, IsAssignedStaffOrAdmin]

    def get(self, request, pk):
        try:
            application = TitleDeedApplication.objects.get(pk=pk)
        except TitleDeedApplication.DoesNotExist:
            return Response({'error': 'Application not found'}, status=status.HTTP_404_NOT_FOUND)

        result = ApplicationAction.verify_application_ledger(pk)
        actions = ApplicationAction.objects.filter(application_id=pk).order_by('id')
        blocks = []
        for a in actions:
            blocks.append({
                'id': a.id,
                'officer': a.officer.username,
                'action_type': a.action_type,
                'comment': a.comment,
                'previous_hash': a.previous_hash,
                'block_hash': a.block_hash,
                'created_at': a.created_at.isoformat()
            })

        return Response({
            'application_id': pk,
            'reference_number': f"APP-{pk:05d}",
            'ledger_status': result['status'],
            'is_tamper_free': result['is_valid'],
            'total_blocks': result['total_blocks'],
            'latest_hash': result.get('latest_block_hash'),
            'blocks': blocks
        })


class PaymentViewSet(viewsets.ModelViewSet):
    """
    Server-governed payment gateway and receipt management.
    Generates official receipts formatted as TD-YYYYMMDD-NNNNNN for USD $10.00 fee.
    """
    queryset = Payment.objects.all().order_by('-created_at')
    serializer_class = PaymentSerializer
    permission_classes = [permissions.AllowAny]

    def create(self, request, *args, **kwargs):
        provider = request.data.get('provider', 'mock')
        beneficiary_name = request.data.get('beneficiary_name') or request.data.get('beneficiaryName', '')
        national_id = request.data.get('national_id') or request.data.get('nationalId', '')
        phone_number = request.data.get('phone_number') or request.data.get('phoneNumber', '')
        simulate_failure = request.data.get('simulate_failure', False) or request.data.get('simulateFailure', False)

        if simulate_failure:
            return Response(
                {"error": "Payment was declined or cancelled by the gateway. No funds were debited."},
                status=status.HTTP_400_BAD_REQUEST
            )

        today_str = timezone.now().strftime('%Y%m%d')
        count_today = Payment.objects.filter(receipt_number__startswith=f"TD-{today_str}-").count() + 1
        receipt_number = f"TD-{today_str}-{count_today:06d}"
        while Payment.objects.filter(receipt_number=receipt_number).exists():
            count_today += 1
            receipt_number = f"TD-{today_str}-{count_today:06d}"

        import uuid
        tx_ref = f"TX-{uuid.uuid4().hex[:8].upper()}"

        payment = Payment.objects.create(
            receipt_number=receipt_number,
            amount=Decimal('10.00'),
            currency='USD',
            provider=provider,
            status='CONFIRMED',
            beneficiary_name=beneficiary_name,
            national_id=national_id,
            phone_number=phone_number,
            transaction_ref=tx_ref,
            is_used=False
        )

        return Response({
            "receipt_number": payment.receipt_number,
            "receiptNumber": payment.receipt_number,
            "amount": float(payment.amount),
            "currency": payment.currency,
            "provider": payment.provider,
            "status": payment.status,
            "beneficiaryName": payment.beneficiary_name,
            "nationalId": payment.national_id,
            "phoneNumber": payment.phone_number,
            "transactionRef": payment.transaction_ref,
            "timestamp": payment.created_at.isoformat(),
        }, status=status.HTTP_201_CREATED)


class AIWhatIfView(APIView):
    """
    Advisory what-if simulation for officers/demos.
    Runs ML scoring without persisting any changes.
    """
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        district = request.data.get('district', 'Goromonzi')
        hectares = float(request.data.get('hectares', 50.0) or 50.0)
        has_overlap = bool(request.data.get('has_overlap', False) or request.data.get('overlap', False))
        overlap_ratio = float(request.data.get('overlap_ratio', 0.15 if has_overlap else 0.0))

        # Build synthetic features for simulation
        features = [[overlap_ratio, 1 if has_overlap else 0, hectares, 1]]
        from .services.ai_predictor import get_or_load_model, _deterministic_fallback
        model = get_or_load_model()
        
        reasons = []
        if has_overlap or overlap_ratio > 0.05:
            reasons.append({"feature": "cadastral_overlap", "description": f"Spatial boundary clash detected ({int(overlap_ratio*100)}% overlap)", "value": 85})
        if hectares > 100:
            reasons.append({"feature": "large_extent", "description": f"Parcel extent ({hectares} Ha) exceeds standard allocation threshold", "value": 45})
        reasons.append({"feature": "district_profile", "description": f"Historical tenure dispute index for {district} district", "value": 25})

        if model is not None:
            try:
                prob = float(model.predict_proba(features)[0][1])
                risk_score = int(round(prob * 100))
            except Exception:
                risk_score = 85 if has_overlap else 22
        else:
            risk_score = 85 if has_overlap else 22

        if has_overlap:
            risk_score = max(risk_score, 80)

        risk_level = "HIGH" if risk_score >= 70 else ("MEDIUM" if risk_score >= 30 else "LOW")

        return Response({
            "district": district,
            "hectares": hectares,
            "has_overlap": has_overlap,
            "risk_score": risk_score,
            "risk_level": risk_level,
            "top_contributing_features": reasons,
            "model_version": "Gradient Boosting v2.1 (Prototype)",
            "evaluated_at": timezone.now().isoformat(),
            "disclaimer": "Prototype model - trained on synthetic data - advisory only"
        })


class AIDistrictRiskView(APIView):
    """
    Heatmap & ranked district dispute risk aggregated from real stored scores.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        from django.db.models import Avg, Count, Q
        ranked = TitleDeedApplication.objects.filter(
            ai_conflict_score__isnull=False
        ).values('district').annotate(
            avg_score=Avg('ai_conflict_score'),
            total_scored=Count('id'),
            high_risk_count=Count('id', filter=Q(ai_conflict_score__gte=70))
        ).order_by('-avg_score')

        return Response({
            "districts": list(ranked),
            "generated_at": timezone.now().isoformat()
        })

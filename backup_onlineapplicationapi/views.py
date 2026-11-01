from django.contrib.auth.models import User
from django.core.mail import send_mail
from .utils.email_logger import send_email_with_logging
from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from .models import FarmerProfile, TitleDeedApplication, SpouseDetail, ApplicationAction
from .serializers import FarmerProfileSerializer, TitleDeedApplicationSerializer, SpouseDetailSerializer, UserSerializer, StaffUserSerializer, UserProfileSerializer
from django.views.decorators.csrf import ensure_csrf_cookie
from django.utils.decorators import method_decorator
from .permissions import IsOfficerOrAdmin
from .throttles import LoginRateThrottle, RegisterRateThrottle, AnonBurstRateThrottle

class FarmerProfileViewSet(viewsets.ModelViewSet):
    queryset = FarmerProfile.objects.all()
    serializer_class = FarmerProfileSerializer
    
    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    def get_queryset(self):
        if self.request.user.is_staff:
            return FarmerProfile.objects.all()
        return FarmerProfile.objects.filter(user=self.request.user)

class TitleDeedApplicationViewSet(viewsets.ModelViewSet):
    queryset = TitleDeedApplication.objects.all()
    serializer_class = TitleDeedApplicationSerializer

    def perform_create(self, serializer):
        """Create application with farmer profile and seal with official government data."""
        try:
            from .services.profile_service import ProfileService
            from .services.email_service import EmailService
            from .services.integration_service import IntegrationService
            
            from .models import ApplicationAction

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
            
            # Enforce one application per farmer
            if TitleDeedApplication.objects.filter(farmer=profile).exists():
                from rest_framework.exceptions import ValidationError
                raise ValidationError({
                    "error": "This farmer already has an active application. Each farmer is limited to one application."
                })
            
            # Create application and then seal it with official data
            application = serializer.save(farmer=profile)
            
            # Log audit trail if captured by officer
            if self.request.user.is_staff:
                ApplicationAction.objects.create(
                    application=application,
                    officer=self.request.user,
                    action_type='OFFICER_INITIATED',
                    comment=f"Hard copy application captured on behalf of farmer by officer {self.request.user.username}"
                )
            
            # SEAL with official records (overrides manual entry with official data)
            IntegrationService.seal_application(application)
            application.save()
            
            # Send confirmation email (non-blocking)
            try:
                EmailService.send_application_received(application)
            except Exception as email_error:
                print(f"Email send failed (non-critical): {email_error}")

            # Generate and send Tracking PIN for 3-factor citizen tracking
            try:
                from .services.tracking_service import issue_tracking_pin
                issue_tracking_pin(application)
            except Exception as pin_error:
                print(f"Tracking PIN issuance failed (non-critical): {pin_error}")
                
        except Exception as e:
            import traceback
            print(f"ERROR in perform_create: {str(e)}")
            print(traceback.format_exc())
            raise

    def partial_update(self, request, *args, **kwargs):
        """Override partial_update to guard farmer edits by status."""
        application = self.get_object()
        # Farmers can only edit PENDING or QUERIED applications
        if not request.user.is_staff:
            EDITABLE_STATUSES = ['PENDING', 'QUERIED']
            if application.status not in EDITABLE_STATUSES:
                return Response(
                    {'error': f'Your application cannot be edited at this stage (status: {application.status}).'},
                    status=status.HTTP_403_FORBIDDEN
                )
        kwargs['partial'] = True
        return self.update(request, *args, **kwargs)

    def get_queryset(self):
        user = self.request.user
        if user.is_staff:
            try:
                role = user.staff_profile.role
                if role == 'lims':
                    # LIMS sees PENDING, LIMS_VERIFIED, and anything QUERIED/RESUBMITTED by them (or legacy with no tag)
                    return TitleDeedApplication.objects.filter(status__in=['PENDING', 'LIMS_VERIFIED']) | \
                           TitleDeedApplication.objects.filter(status__in=['QUERIED', 'RESUBMITTED'], queried_by='lims') | \
                           TitleDeedApplication.objects.filter(status__in=['QUERIED', 'RESUBMITTED'], queried_by__isnull=True)
                if role == 'resettlement' or role == 'estates':
                    return TitleDeedApplication.objects.filter(status__in=['REFERRED', 'LIMS_VERIFIED', 'ACCOUNTS_VERIFIED', 'ESTATES_VERIFIED']) | \
                           TitleDeedApplication.objects.filter(status__in=['QUERIED', 'RESUBMITTED'], queried_by='estates')
                if role == 'zlc':
                    return TitleDeedApplication.objects.filter(status__in=['LIMS_VERIFIED', 'ACCOUNTS_VERIFIED', 'ESTATES_VERIFIED', 'ZLC_VERIFIED']) | \
                           TitleDeedApplication.objects.filter(status__in=['QUERIED', 'RESUBMITTED'], queried_by='zlc')
                if role == 'surveyor':
                    return TitleDeedApplication.objects.filter(status__in=['ZLC_VERIFIED', 'AWAITING_SURVEY_FEE', 'SURVEY_FEE_PAID', 'SURVEYED']) | \
                           TitleDeedApplication.objects.filter(status__in=['QUERIED', 'RESUBMITTED'], queried_by='surveyor')
                if role == 'valuation':
                    return TitleDeedApplication.objects.filter(status__in=['SURVEYED', 'VALUATED']) | \
                           TitleDeedApplication.objects.filter(status__in=['QUERIED', 'RESUBMITTED'], queried_by__in=['valuation', 'director'])
                if role == 'conveyancer':
                    return TitleDeedApplication.objects.filter(status__in=['VALUATED', 'APPROVED', 'AGREEMENT_OF_SALE']) | \
                           TitleDeedApplication.objects.filter(status__in=['QUERIED', 'RESUBMITTED'], queried_by='conveyancer')
                if role == 'director':
                    return TitleDeedApplication.objects.filter(status__in=['VALUATED', 'APPROVED', 'SELECT_PAYMENT', 'READY_FOR_COLLECTION', 'AGREEMENT_OF_SALE']) | \
                           TitleDeedApplication.objects.filter(status__in=['QUERIED', 'RESUBMITTED'], queried_by='director')
                if role == 'finance' or role == 'accounts':
                    return TitleDeedApplication.objects.filter(status__in=['LIMS_VERIFIED', 'ACCOUNTS_VERIFIED', 'SELECT_PAYMENT', 'PAYMENT_VERIFIED', 'READY_FOR_COLLECTION']) | \
                           TitleDeedApplication.objects.filter(status__in=['QUERIED', 'RESUBMITTED'], queried_by='finance')
                # Admin sees all
                return TitleDeedApplication.objects.all()
            except Exception:
                return TitleDeedApplication.objects.all()
        return TitleDeedApplication.objects.filter(farmer__user=user)

    @action(detail=True, methods=['post'], permission_classes=[IsOfficerOrAdmin])
    def verify_lims(self, request, pk=None):
        """LIMS verification: Check if farm exists in DB."""
        from .services.verification_service import VerificationService
        
        application = self.get_object()
        result = VerificationService.verify_lims(
            application=application,
            status_action=request.data.get('status_action'),
            reason=request.data.get('reason'),
            officer=request.user,
            comments=request.data.get('officer_comments')
        )
        return Response(result)

    @action(detail=True, methods=['post'], permission_classes=[IsOfficerOrAdmin])
    def verify_application_fee(self, request, pk=None):
        """ACCOUNTS: Verify $10 Application Fee"""
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
        """ESTATES: Ensure farmer details are correct."""
        from .services.verification_service import VerificationService
        
        application = self.get_object()
        result = VerificationService.verify_estates(
            application=application,
            officer=request.user,
            comments=request.data.get('officer_comments')
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
        from .services.verification_service import VerificationService
        
        application = self.get_object()
        result = VerificationService.verify_zlc(
            application=application,
            has_disputes=request.data.get('has_disputes'),
            dispute_nature=request.data.get('dispute_nature'),
            officer=request.user,
            comments=request.data.get('officer_comments')
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
        application = self.get_object()
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
            application.is_manually_valuated = False
            application.manual_valuation_price = None

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
        email_message = f'''Dear {application.farmer.first_name},

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
        recipient_email = application.farmer.email
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
        application = self.get_object()
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
        application = self.get_object()
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

class LoginView(APIView):
    permission_classes = [permissions.AllowAny]
    throttle_classes = [LoginRateThrottle]
    
    def post(self, request):
        username = request.data.get('username')
        password = request.data.get('password')
        
        # Automatically format username if it's a National ID
        if username:
            username = format_national_id(username)
            
        user = authenticate(username=username, password=password)
        if user:
            login(request, user)
            # Determine role: farmers are NOT staff, officers/admins are staff
            if user.is_staff:
                try:
                    role = user.staff_profile.role
                except Exception as e:
                    # Staff user without profile defaults to admin
                    print(f"WARNING: Staff user {user.username} has no StaffProfile! Error: {e}")
                    print(f"User is_staff: {user.is_staff}, is_superuser: {user.is_superuser}")
                    role = 'admin'
            else:
                # Regular users are farmers
                role = 'farmer'
            
            name = f"{user.first_name} {user.last_name}".strip()
            if not name:
                name = user.username
                
            national_id = getattr(getattr(user, 'farmer_profile', None), 'national_id', None) or user.username
                
            return Response({
                'name': name,
                'first_name': user.first_name,
                'last_name': user.last_name,
                'role': role,
                'username': user.username,
                'national_id': national_id
            })
        return Response({'error': 'Invalid credentials'}, status=status.HTTP_401_UNAUTHORIZED)

class CheckSessionView(APIView):
    permission_classes = [permissions.AllowAny]
    throttle_classes = [AnonBurstRateThrottle]
    
    def get(self, request):
        """Check if user has an active session and return user data"""
        if request.user and request.user.is_authenticated:
            # Determine role: farmers are NOT staff, officers/admins are staff  
            if request.user.is_staff:
                try:
                    role = request.user.staff_profile.role
                except Exception:
                    # Staff user without profile defaults to admin
                    role = 'admin'
            else:
                # Regular users are farmers
                role = 'farmer'
            
            name = f"{request.user.first_name} {request.user.last_name}".strip()
            if not name:
                name = request.user.username
                
            national_id = getattr(getattr(request.user, 'farmer_profile', None), 'national_id', None) or request.user.username
                
            return Response({
                'name': name,
                'first_name': request.user.first_name,
                'last_name': request.user.last_name,
                'role': role,
                'username': request.user.username,
                'national_id': national_id
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
    queryset = User.objects.all()
    permission_classes = [permissions.AllowAny]
    throttle_classes = [RegisterRateThrottle]
    serializer_class = UserSerializer

class AdminStaffViewSet(viewsets.ModelViewSet):
    queryset = User.objects.filter(is_staff=True)
    serializer_class = StaffUserSerializer
    permission_classes = [permissions.IsAdminUser]

    def get_queryset(self):
        # Allow admins to see all staff, but maybe filter out superusers?
        return User.objects.filter(is_staff=True).select_related('staff_profile')
    
    @action(detail=True, methods=['post'])
    def toggle_active(self, request, pk=None):
        """Toggle the is_active status of a staff user"""
        user = self.get_object()
        user.is_active = not user.is_active
        user.save()
        serializer = self.get_serializer(user)
        return Response({
            'message': f'User {user.username} is now {"active" if user.is_active else "inactive"}',
            'user': serializer.data
        })

class ReportViewSet(viewsets.ViewSet):
    """
    ViewSet for generating role-based reports.
    Each action returns JSON data for role-specific analytics.
    """
    permission_classes = [permissions.IsAuthenticated, permissions.IsAdminUser]
    
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
                'comments': log.comment or '',
            })
        
        return Response({
            'count': total_count,
            'page': page,
            'page_size': page_size,
            'total_pages': (total_count + page_size - 1) // page_size,
            'results': results
        })


    @action(detail=False, methods=['get'], url_path='export-audit-logs')
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

class PasswordResetRequestView(APIView):
    """
    Endpoint for requesting a password reset email.
    """
    permission_classes = [permissions.AllowAny]
    throttle_classes = [AnonBurstRateThrottle]

    def post(self, request):
        username = request.data.get('username')
        email = request.data.get('email')
        
        user = None
        if username:
            user = User.objects.filter(username=username).first()
        elif email:
            user = User.objects.filter(email=email).first()
            
        if user and user.email:
            from django.contrib.auth.tokens import default_token_generator
            from django.utils.http import urlsafe_base64_encode
            from django.utils.encoding import force_bytes
            
            uid = urlsafe_base64_encode(force_bytes(user.pk))
            token = default_token_generator.make_token(user)
            
            # frontend URL
            origin = request.headers.get('Origin')
            if not origin:
                from django.conf import settings
            origin = getattr(settings, 'FRONTEND_URL', 'http://localhost:5173')
            
            reset_url = f"{origin}/reset-password/{uid}/{token}"
            
            email_message = f'''Dear {user.first_name or user.username},

You have requested to reset your password. Click the link below to set a new password:

{reset_url}

If you did not request this, please ignore this email.

Kind Regards,
Title Deeds One Stop Center'''
            
            send_email_with_logging(
                recipient=user.email,
                subject='Password Reset Request',
                body=email_message
            )

            # In development or when email credentials are not yet set up, return reset_url directly
            from django.conf import settings
            if settings.DEBUG or not getattr(settings, 'EMAIL_HOST_USER', None):
                return Response({
                    'status': f'A password reset link has been generated for {user.email}.',
                    'reset_url': reset_url
                })
            
        # Return success regardless of whether user was found (security best practice)
        return Response({'status': 'If an account with that username or email exists, a password reset link has been sent.'})

class PasswordResetConfirmView(APIView):
    """
    Endpoint for confirming a password reset with token and new password.
    """
    permission_classes = [permissions.AllowAny]
    throttle_classes = [AnonBurstRateThrottle]

    def post(self, request):
        uidb64 = request.data.get('uidb64')
        token = request.data.get('token')
        new_password = request.data.get('new_password')
        
        if not all([uidb64, token, new_password]):
            return Response({'error': 'Missing required fields.'}, status=status.HTTP_400_BAD_REQUEST)
            
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
    Secure Document Access Endpoint.
    Verifies role/owner authorization before serving application attachments.
    Supports Nginx X-Accel-Redirect when configured in production.
    """
    permission_classes = [permissions.IsAuthenticated]

    ALLOWED_FIELDS = [
        'tenure_document',
        'national_id_copy',
        'other_attachments',
        'war_vet_id_copy',
        'employment_proof',
    ]

    def get(self, request, application_id, field_name):
        if field_name not in self.ALLOWED_FIELDS:
            return Response({'error': 'Invalid document field.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            application = TitleDeedApplication.objects.select_related('farmer__user').get(pk=application_id)
        except TitleDeedApplication.DoesNotExist:
            raise Http404("Application not found.")

        # Access control: Farmer owner OR staff officer
        is_owner = (application.farmer and application.farmer.user == request.user)
        is_staff = request.user.is_staff
        if not (is_owner or is_staff):
            return Response({'error': 'Unauthorized to access this document.'}, status=status.HTTP_403_FORBIDDEN)

        file_obj = getattr(application, field_name, None)
        if not file_obj or not file_obj.name:
            raise Http404("Document file does not exist.")

        # Check if Nginx X-Accel-Redirect handoff is enabled (Deployment setting)
        if getattr(settings, 'USE_ACCEL_REDIRECT', False):
            response = HttpResponse()
            response['X-Accel-Redirect'] = f"/protected_media/{file_field.name}"
            response['Content-Type'] = ''
            return response

        # Application-level fallback: Serve via FileResponse
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
    2. Reference Number (e.g. APP-00005 or 5)
    3. Secret 6-digit Tracking PIN
    Returns minimal, safe status details on match.
    Returns generic security error on any discrepancy.
    """
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        national_id = str(request.data.get('national_id', '')).strip().upper()
        ref_num_raw = str(request.data.get('reference_number', '')).strip().upper()
        pin = str(request.data.get('pin', '')).strip()

        if not national_id or not ref_num_raw or not pin:
            return Response(
                {'error': 'All 3 fields (National ID, Reference Number, PIN) are required.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Clean reference number (APP-00005 -> 5)
        clean_id_str = ref_num_raw.replace('APP-', '').replace('APP', '').lstrip('0')
        try:
            app_id = int(clean_id_str)
        except ValueError:
            return Response(
                {'error': 'Invalid credentials provided. Please check your National ID, Reference Number, and PIN.'},
                status=status.HTTP_401_UNAUTHORIZED
            )

        try:
            application = TitleDeedApplication.objects.select_related('farmer').get(id=app_id)
        except TitleDeedApplication.DoesNotExist:
            return Response(
                {'error': 'Invalid credentials provided. Please check your National ID, Reference Number, and PIN.'},
                status=status.HTTP_401_UNAUTHORIZED
            )

        # Check National ID
        if application.farmer.national_id.strip().upper() != national_id:
            return Response(
                {'error': 'Invalid credentials provided. Please check your National ID, Reference Number, and PIN.'},
                status=status.HTTP_401_UNAUTHORIZED
            )

        # Check PIN
        from .services.tracking_service import verify_pin
        if not verify_pin(pin, application.tracking_pin_hash):
            return Response(
                {'error': 'Invalid credentials provided. Please check your National ID, Reference Number, and PIN.'},
                status=status.HTTP_401_UNAUTHORIZED
            )

        # Stage timeline definitions
        STATUS_TIMELINE = [
            {'stage': 1, 'key': 'PENDING', 'label': 'Submitted'},
            {'stage': 2, 'key': 'LIMS_VERIFIED', 'label': 'LIMS Ownership Verified'},
            {'stage': 3, 'key': 'ACCOUNTS_VERIFIED', 'label': 'Fee Paid'},
            {'stage': 4, 'key': 'ESTATES_VERIFIED', 'label': 'Estates Verified'},
            {'stage': 5, 'key': 'ZLC_VERIFIED', 'label': 'ZLC Clearance'},
            {'stage': 6, 'key': 'SURVEYED', 'label': 'Survey Completed'},
            {'stage': 7, 'key': 'VALUATED', 'label': 'Valuation Approved'},
            {'stage': 8, 'key': 'APPROVED', 'label': 'Director Approved'},
            {'stage': 9, 'key': 'READY_FOR_COLLECTION', 'label': 'Deed Ready for Collection'},
        ]

        current_stage = 1
        for item in STATUS_TIMELINE:
            if item['key'] == application.status:
                current_stage = item['stage']
                break

        return Response({
            'success': True,
            'reference_number': f"APP-{application.id:05d}",
            'farm_name': application.farm_name,
            'district': application.district,
            'province': application.province,
            'status': application.status,
            'status_display': application.get_status_display(),
            'current_stage': current_stage,
            'total_stages': len(STATUS_TIMELINE),
            'timeline': STATUS_TIMELINE,
            'has_disputes': application.has_disputes,
            'updated_at': application.updated_at.isoformat()
        })


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




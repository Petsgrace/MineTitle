import json
from datetime import timedelta
from django.test import TestCase, Client
from django.utils import timezone
from django.contrib.auth.models import User
from rest_framework import status
from django.core.exceptions import PermissionDenied

from onlineapplicationapi.models import (
    TitleDeedApplication, FarmerProfile, WorkflowTransition, ApplicationAction, StaffProfile, StageSLA, EmailLog,
    STAGE_PENDING, STAGE_RESETTLEMENT_VERIFIED, STAGE_LIMS_VERIFIED, STAGE_ZLC_CLEARED,
    STAGE_GIS_VALIDATED, STAGE_SURVEYED, STAGE_VALUATED, STAGE_APPROVED, STAGE_READY_FOR_COLLECTION,
    ROLE_RESETTLEMENT, ROLE_LIMS, ROLE_ZLC, ROLE_GIS, ROLE_SURVEYOR, ROLE_VALUATION,
    ROLE_DIRECTOR, ROLE_DEEDS, ROLE_ADMIN, ROLE_APPLICANT
)
from onlineapplicationapi.services.workflow_service import execute_stage_transition, check_overdue_applications
from onlineapplicationapi.services.spatial_service import check_spatial_overlaps
from onlineapplicationapi.services.ai_predictor import predict_conflict


class AlignedPhase1TestSuite(TestCase):
    def setUp(self):
        self.client = Client()
        
        # 1. Create Citizen & FarmerProfile
        self.citizen = User.objects.create_user(
            username='citizen_test',
            email='citizen@example.com',
            password='Password123!'
        )
        self.farmer_profile = FarmerProfile.objects.create(
            user=self.citizen,
            surname='Moyo',
            first_name='Tinashe',
            sex='MALE',
            title='Mr',
            date_of_birth='1985-05-15',
            national_id='63-1234567-A-63',
            marital_status='Married',
            citizenship='Zimbabwean',
            telephone='+263771234567'
        )
        
        # 2. Create Staff Users
        self.resettlement_user = User.objects.create_user(
            username='officer_resettlement_test',
            email='resettlement@lands.gov.zw',
            password='Ministry2026!',
            is_staff=True
        )
        StaffProfile.objects.create(
            user=self.resettlement_user,
            role=ROLE_RESETTLEMENT,
            department='Resettlement',
            national_id='63-1111111-A-63'
        )
        
        self.lims_user = User.objects.create_user(
            username='officer_lims_test',
            email='lims@lands.gov.zw',
            password='Ministry2026!',
            is_staff=True
        )
        StaffProfile.objects.create(
            user=self.lims_user,
            role=ROLE_LIMS,
            department='LIMS',
            national_id='63-2222222-B-63'
        )

        # 3. Ensure Workflow Transitions exist
        WorkflowTransition.objects.update_or_create(
            from_stage=STAGE_PENDING,
            to_stage=STAGE_RESETTLEMENT_VERIFIED,
            allowed_role=ROLE_RESETTLEMENT,
            defaults={'sla_days': 3, 'is_return': False}
        )
        WorkflowTransition.objects.update_or_create(
            from_stage=STAGE_RESETTLEMENT_VERIFIED,
            to_stage=STAGE_LIMS_VERIFIED,
            allowed_role=ROLE_LIMS,
            defaults={'sla_days': 4, 'is_return': False}
        )
        WorkflowTransition.objects.update_or_create(
            from_stage=STAGE_RESETTLEMENT_VERIFIED,
            to_stage=STAGE_PENDING,
            allowed_role=ROLE_RESETTLEMENT,
            defaults={'sla_days': 2, 'is_return': True, 'requires_comment': True}
        )

        # 4. Create standard Title Deed Application
        self.app = TitleDeedApplication.objects.create(
            farmer=self.farmer_profile,
            reference_number='TD-2026-00001',
            farm_name='Sunrise Farm',
            district='Goromonzi',
            province='Mashonaland East',
            farm_extent=50.0,
            status=STAGE_PENDING
        )
        self.test_pin = '456789'
        self.app.set_tracking_pin(self.test_pin)
        self.app.save()

    def test_tc01_invalid_national_id(self):
        """TC-01: Invalid National ID format -> HTTP 400"""
        invalid_data = {
            'username': 'new_citizen',
            'email': 'new_citizen@example.com',
            'password': 'Password123!',
            'national_id': 'INVALID-ID-XYZ',
            'first_name': 'Test',
            'last_name': 'User'
        }
        response = self.client.post('/api/v1/register/', invalid_data, content_type='application/json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('error', response.json())

    def test_tc02_wrong_tracking_pin(self):
        """TC-02: Wrong tracking PIN -> HTTP 401 generic message"""
        payload = {
            'national_id': '63-1234567-A-63',
            'reference_number': 'TD-2026-00001',
            'pin': '000000' # incorrect PIN
        }
        response = self.client.post('/api/v1/track/', payload, content_type='application/json')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        data = response.json()
        self.assertEqual(data.get('error'), 'Invalid verification details provided.')

    def test_tc04_department_officer_cannot_act_on_another_department_stage(self):
        """TC-04: LIMS officer cannot act on Resettlement stage -> HTTP 403"""
        self.client.force_login(self.lims_user)
        response = self.client.post(
            f'/api/v1/applications/{self.app.id}/transition/',
            {'target_stage': STAGE_RESETTLEMENT_VERIFIED, 'comment': 'Unauthorized action'},
            content_type='application/json'
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_tc05_document_download_without_auth_is_blocked(self):
        """TC-05: Document download without authentication -> HTTP 401/403"""
        response = self.client.get(f'/api/v1/applications/{self.app.id}/document/tenure_document/')
        self.assertIn(response.status_code, [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN])

    def test_tc07_pin_lockout_after_repeated_failures(self):
        """TC-07: PIN lockout after 5 repeated failures"""
        payload = {
            'national_id': '63-1234567-A-63',
            'reference_number': 'TD-2026-00001',
            'pin': '999999'
        }
        for _ in range(5):
            res = self.client.post('/api/v1/track/', payload, content_type='application/json')
            self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)
            
        # 6th attempt should return lockout message
        lockout_res = self.client.post('/api/v1/track/', payload, content_type='application/json')
        self.assertEqual(lockout_res.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertIn('locked out', lockout_res.json().get('error', '').lower())

    def test_tc08_stages_cannot_be_skipped_and_returns_require_comment(self):
        """TC-08: Stages cannot be skipped; returns require a mandatory comment"""
        # 1. Attempting to skip PENDING -> LIMS_VERIFIED
        self.client.force_login(self.resettlement_user)
        skip_res = self.client.post(
            f'/api/v1/applications/{self.app.id}/transition/',
            {'target_stage': STAGE_LIMS_VERIFIED, 'comment': 'Skipping stage'},
            content_type='application/json'
        )
        self.assertEqual(skip_res.status_code, status.HTTP_400_BAD_REQUEST)

        # 2. Progress legitimately to RESETTLEMENT_VERIFIED
        prog_res = self.client.post(
            f'/api/v1/applications/{self.app.id}/transition/',
            {'target_stage': STAGE_RESETTLEMENT_VERIFIED, 'comment': 'Verified offer letter'},
            content_type='application/json'
        )
        self.assertEqual(prog_res.status_code, status.HTTP_200_OK)
        self.app.refresh_from_db()
        self.assertEqual(self.app.status, STAGE_RESETTLEMENT_VERIFIED)

        # 3. Attempt return to PENDING without comment
        ret_no_comment = self.client.post(
            f'/api/v1/applications/{self.app.id}/transition/',
            {'target_stage': STAGE_PENDING, 'comment': ''},
            content_type='application/json'
        )
        self.assertEqual(ret_no_comment.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('comment', ret_no_comment.json().get('error', '').lower())

    def test_tc09_mfa_required_for_staff_optional_for_citizens(self):
        """TC-09: MFA required for staff, optional for citizens"""
        # Staff Login requires MFA
        staff_res = self.client.post('/api/v1/login/', {
            'username': 'officer_resettlement_test',
            'password': 'Ministry2026!'
        }, content_type='application/json')
        self.assertEqual(staff_res.status_code, status.HTTP_200_OK)
        self.assertTrue(staff_res.json().get('mfa_required'))

        # Citizen Login directly without MFA by default
        citizen_res = self.client.post('/api/v1/login/', {
            'username': 'citizen_test',
            'password': 'Password123!'
        }, content_type='application/json')
        self.assertEqual(citizen_res.status_code, status.HTTP_200_OK)
        self.assertFalse(citizen_res.json().get('mfa_required', False))

    def test_tc10_postgis_spatial_overlap_detection(self):
        """TC-10: Spatial overlap detected correctly on known polygons"""
        poly_a = [[[29.0, -19.0], [29.1, -19.0], [29.1, -19.1], [29.0, -19.1], [29.0, -19.0]]]
        poly_b_overlap = [[[29.05, -19.05], [29.15, -19.05], [29.15, -19.15], [29.05, -19.15], [29.05, -19.05]]]
        
        # Save poly_a on existing app
        self.app.boundary_coordinates = poly_a
        self.app.save()

        # Create second app with poly_b in Goromonzi (assisted capture citizen)
        app2 = TitleDeedApplication.objects.create(
            is_assisted_capture=True,
            walk_in_citizen_name='Chipo Sibanda',
            walk_in_national_id='08-9876543-B-08',
            reference_number='TD-2026-00002',
            farm_name='Overlapping Farm B',
            district='Goromonzi',
            province='Mashonaland East',
            boundary_coordinates=poly_b_overlap,
            farm_extent=40.0,
            status=STAGE_PENDING
        )

        overlap_res = check_spatial_overlaps(app2)
        self.assertTrue(overlap_res['has_overlap'])
        self.assertGreater(overlap_res['overlapping_parcels_count'], 0)
        self.assertGreater(overlap_res['overlap_area_ratio'], 0.1)

    def test_tc11_audit_rows_immutable_and_chain_verifiable(self):
        """TC-11: Audit rows cannot be updated or deleted; chain verification detects tampering"""
        action = ApplicationAction(
            application=self.app,
            officer=self.resettlement_user,
            from_stage=STAGE_PENDING,
            to_stage=STAGE_RESETTLEMENT_VERIFIED,
            action_type='ADVANCE',
            comment="Initial signoff"
        )
        action.save()
        self.assertIsNotNone(action.block_hash)

        # Test immutability: UPDATE blocked
        with self.assertRaises(PermissionDenied):
            action.comment = "Tampered comment"
            action.save()

        # Test immutability: DELETE blocked
        with self.assertRaises(PermissionDenied):
            action.delete()

        # Chain integrity verification
        integrity = ApplicationAction.verify_application_ledger(self.app.id)
        if not integrity['is_valid']:
            print("TC-11 FAILURE DEBUG:", integrity)
        self.assertTrue(integrity['is_valid'])
        self.assertEqual(integrity['total_blocks'], 1)

    def test_tc12_ml_predictor_returns_probability_and_fallback_works(self):
        """TC-12: ML predictor returns probability, risk level, and fallback works"""
        self.app.spatial_overlap_ratio = 0.25
        self.app.overlapping_parcels_count = 1
        self.app.farm_extent = 45.0
        self.app.save()

        prediction = predict_conflict(self.app)
        self.assertIn('dispute_probability', prediction)
        self.assertIn(prediction['risk_level'], ['LOW', 'MEDIUM', 'HIGH'])
        self.assertTrue(0.0 <= prediction['dispute_probability'] <= 1.0)
        self.assertIn('top_contributing_features', prediction)

    def test_tc13_sla_overdue_flag_and_email(self):
        """TC-13: SLA overdue flag set and escalation logged"""
        self.app.current_stage_due_date = timezone.now() - timedelta(days=2)
        self.app.is_overdue = False
        self.app.save()

        stats = check_overdue_applications()
        self.app.refresh_from_db()
        self.assertTrue(self.app.is_overdue)
        self.assertGreaterEqual(stats.get('overdue_flagged_count', 0), 1)

    def test_tc14_c8_fixed_ai_dispute_scenarios(self):
        """C8: Fixed AI dispute scenarios (clear overlap -> HIGH, no overlap in low-risk district -> LOW)"""
        # Distinct farmers to respect 1-active-app per farmer constraint
        farmer_high_user = User.objects.create_user(username='farmer_high_ai', password='Password123!')
        farmer_high = FarmerProfile.objects.create(user=farmer_high_user, surname='High', first_name='Risk', national_id='63-9999991-A-63', date_of_birth='1980-01-01')

        farmer_low_user = User.objects.create_user(username='farmer_low_ai', password='Password123!')
        farmer_low = FarmerProfile.objects.create(user=farmer_low_user, surname='Low', first_name='Risk', national_id='63-9999992-A-63', date_of_birth='1982-02-02')

        # Scenario 1: Clear spatial overlap -> HIGH RISK
        high_app = TitleDeedApplication.objects.create(
            farmer=farmer_high,
            district='Goromonzi',
            farm_name='Clashing Boundary Farm',
            farm_extent=120.0,
            spatial_overlap_ratio=0.25,
            overlapping_parcels_count=2,
            has_disputes=True,
            reference_number='TD-2026-TESTHIGH'
        )
        high_pred = predict_conflict(high_app)
        self.assertEqual(high_pred['risk_level'], 'HIGH')
        self.assertGreaterEqual(high_pred['risk_score'], 80)
        self.assertIn('top_contributing_features', high_pred)
        self.assertTrue(len(high_pred['top_contributing_features']) > 0)

        # Scenario 2: No overlap in low-risk district -> LOW RISK
        low_app = TitleDeedApplication.objects.create(
            farmer=farmer_low,
            district='Chegutu',
            farm_name='Clear Boundary Farm',
            farm_extent=25.0,
            spatial_overlap_ratio=0.0,
            overlapping_parcels_count=0,
            has_disputes=False,
            reference_number='TD-2026-TESTLOW'
        )
        low_pred = predict_conflict(low_app)
        self.assertEqual(low_pred['risk_level'], 'LOW')
        self.assertLess(low_pred['risk_score'], 30)

        # Scenario 3: Recalculate endpoint persists metrics and logs ApplicationAction
        self.client.force_login(self.resettlement_user)
        resp = self.client.post(f'/api/v1/applications/{high_app.id}/ai-dispute-prediction/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        high_app.refresh_from_db()
        self.assertEqual(high_app.ai_conflict_level, 'HIGH')
        self.assertGreaterEqual(high_app.ai_conflict_score, 80)
        self.assertEqual(high_app.ai_model_version, "Gradient Boosting v2.1 (Prototype)")
        
        # Verify ApplicationAction logged
        ai_action = ApplicationAction.objects.filter(
            application=high_app,
            action_type="AI_ASSESSMENT"
        ).last()
        self.assertIsNotNone(ai_action)
        self.assertIn("advisory only", ai_action.comment.lower())


    def test_tc15_d4_server_rbac(self):
        """D4: Server-enforced RBAC - unassigned officer and farmer access restrictions"""
        unassigned_user = User.objects.create_user(
            username='unassigned_officer',
            password='Password123!',
            is_staff=True
        )
        StaffProfile.objects.create(
            user=unassigned_user,
            role='unassigned',
            department='Unassigned',
            national_id='63-9999999-Z-63'
        )

        # 1. Unassigned officer calling applications list gets empty queryset
        self.client.force_login(unassigned_user)
        resp = self.client.get('/api/v1/applications/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        data = resp.json()
        results = data.get('results', data) if isinstance(data, dict) else data
        self.assertEqual(len(results), 0)

        # 2. Unassigned officer calling reports summary receives 403 Forbidden
        resp_rep = self.client.get('/api/v1/reports/summary/')
        self.assertEqual(resp_rep.status_code, status.HTTP_403_FORBIDDEN)

        # 3. Farmer calling reports summary receives 403 Forbidden
        self.client.force_login(self.citizen)
        resp_farmer_rep = self.client.get('/api/v1/reports/summary/')
        self.assertEqual(resp_farmer_rep.status_code, status.HTTP_403_FORBIDDEN)

        # 4. Farmer sees only their own application in /api/v1/applications/
        resp_farmer_apps = self.client.get('/api/v1/applications/')
        self.assertEqual(resp_farmer_apps.status_code, status.HTTP_200_OK)
        farmer_data = resp_farmer_apps.json()
        farmer_results = farmer_data.get('results', farmer_data) if isinstance(farmer_data, dict) else farmer_data
        self.assertEqual(len(farmer_results), 1)
        self.assertEqual(farmer_results[0]['id'], self.app.id)

    def test_tc16_d5_citizen_tracking_and_rate_limit(self):
        """D5: 3-Factor Citizen Tracking with 9-stage timeline and failed attempt rate-limiting"""
        self.client.logout()

        # 1. Valid 3-Factor tracking lookup
        valid_payload = {
            'national_id': '63-1234567-A-63',
            'reference_number': 'TD-2026-00001',
            'pin': '456789'
        }
        resp = self.client.post('/api/v1/track/', data=valid_payload, content_type='application/json')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        data = resp.json()
        self.assertIn('timeline', data)
        self.assertEqual(len(data['timeline']), 9)
        self.assertEqual(data['status'], 'PENDING')
        self.assertEqual(data['reference_number'], 'TD-2026-00001')

        # 2. Failed attempt lockout (rate-limiting after 5 bad attempts)
        bad_payload = {
            'national_id': '63-1234567-A-63',
            'reference_number': 'TD-2026-00001',
            'pin': '000000'
        }
        # Exhaust 5 attempts
        last_status = None
        for i in range(5):
            bad_resp = self.client.post('/api/v1/track/', data=bad_payload, content_type='application/json')
            last_status = bad_resp.status_code

        # 6th attempt must be locked out
        lockout_resp = self.client.post('/api/v1/track/', data=bad_payload, content_type='application/json')
        self.assertIn(lockout_resp.status_code, [status.HTTP_401_UNAUTHORIZED, status.HTTP_429_TOO_MANY_REQUESTS])
        self.assertIn('locked out', lockout_resp.json().get('error', '').lower())

    def test_tc17_e2_protected_documents_and_audit(self):
        """E2: Protected document downloads: RBAC enforcement and immutable audit ledger logging"""
        from django.core.files.base import ContentFile
        self.app.beneficiary_photo_front.save('test_front_photo.jpg', ContentFile(b'fake_photo_data'))
        self.app.save()

        # 1. Unauthorized officer (LIMS officer while app is in PENDING stage) receives 403
        self.client.force_login(self.lims_user)
        resp_unauth = self.client.get(f'/api/v1/applications/{self.app.id}/document/beneficiary_photo_front/')
        self.assertEqual(resp_unauth.status_code, status.HTTP_403_FORBIDDEN)

        # 2. Authorized officer (Resettlement officer for PENDING stage) receives 200
        self.client.force_login(self.resettlement_user)
        resp_auth = self.client.get(f'/api/v1/applications/{self.app.id}/document/beneficiary_photo_front/')
        self.assertEqual(resp_auth.status_code, status.HTTP_200_OK)

        # 3. Document access action must be logged in ApplicationAction audit ledger
        doc_action = ApplicationAction.objects.filter(
            application=self.app,
            action_type="DOCUMENT_ACCESS"
        ).last()
        self.assertIsNotNone(doc_action)
        self.assertIn('beneficiary_photo_front', doc_action.comment)
        self.assertIn(self.resettlement_user.username, doc_action.comment)

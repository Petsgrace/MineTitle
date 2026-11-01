from django.test import TestCase
from django.contrib.auth.models import User
from rest_framework.test import APIClient, APITestCase
from rest_framework import status
from decimal import Decimal
from onlineapplicationapi.models import StaffProfile, FarmerProfile, TitleDeedApplication

class PaymentWorkflowTest(APITestCase):
    """Test suite for Payment Workflows (Survey Fee & Purchase Price)"""
    
    def setUp(self):
        self.client = APIClient()
        
        # Staff
        self.surveyor = self._create_staff('surveyor_user', 'surveyor')
        self.valuation = self._create_staff('valuation_user', 'valuation')
        self.director = self._create_staff('director_user', 'director')
        self.finance = self._create_staff('finance_user', 'finance')
        
        # Farmer & Application
        self.farmer_user = User.objects.create_user(username='farmer_payment', password='password')
        self.farmer = FarmerProfile.objects.create(
            user=self.farmer_user, surname='Pay', first_name='John', sex='Male',
            title='Mr', date_of_birth='1980-01-01', national_id="ID-PAY-001",
            email='pay@example.com', citizenship='Zimbabwean'
        )
        self.app = TitleDeedApplication.objects.create(
            farmer=self.farmer,
            district='Harare',
            farm_name='Payment Farm',
            farm_extent=Decimal('50.0000'),
            tenure_document_type='Offer Letter (A1)', # Should trigger $300 fee
            status='ZLC_VERIFIED'
        )

    def _create_staff(self, username, role):
        user = User.objects.create_user(username=username, password='password', is_staff=True)
        StaffProfile.objects.create(user=user, role=role)
        return user

    def test_technical_survey_fee_logic(self):
        """Test that A1 Offer Letter triggers $300 fee"""
        self.client.force_authenticate(user=self.surveyor)
        # Request survey
        response = self.client.post(f'/api/applications/{self.app.id}/technical_survey/', {'officer_comments': 'Need survey'})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        self.app.refresh_from_db()
        self.assertEqual(self.app.survey_fee, Decimal('300.00'))
        self.assertEqual(self.app.status, 'AWAITING_SURVEY_FEE')

    def test_technical_survey_fee_A2(self):
        """Test that A2/Other triggers $735 fee"""
        self.app.tenure_document_type = '99 Year Lease (A2)'
        self.app.save()
        
        self.client.force_authenticate(user=self.surveyor)
        response = self.client.post(f'/api/applications/{self.app.id}/technical_survey/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        self.app.refresh_from_db()
        self.assertEqual(self.app.survey_fee, Decimal('735.00'))

    def test_pay_survey_fee(self):
        """Test farmer paying survey fee"""
        self.app.status = 'AWAITING_SURVEY_FEE'
        self.app.survey_fee = Decimal('300.00')
        self.app.save()
        
        self.client.force_authenticate(user=self.farmer_user)
        response = self.client.post(f'/api/applications/{self.app.id}/pay_survey_fee/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        self.app.refresh_from_db()
        self.assertEqual(self.app.status, 'SURVEY_FEE_PAID')

    def test_mark_surveyed_fee_paid(self):
        """Test marking surveyed with Fee Paid sets flags correctly"""
        self.app.status = 'ZLC_VERIFIED'
        self.app.save()
        
        self.client.force_authenticate(user=self.surveyor)
        data = {
            'farm_extent': '55.0000',
            'farm_name': 'Surveyed Farm',
            'is_fee_paid': True
        }
        response = self.client.post(f'/api/applications/{self.app.id}/mark_surveyed/', data)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        self.app.refresh_from_db()
        self.assertEqual(self.app.status, 'SURVEYED')
        self.assertTrue(self.app.is_survey_fee_paid)
        self.assertIn('Survey Fee: PAID', self.app.officer_comments)
        self.assertEqual(self.app.purchase_price, Decimal('27500.00'))

    def test_mark_surveyed_fee_unpaid(self):
        """Test marking surveyed with Fee NOT Paid adds note to agreement"""
        self.app.status = 'ZLC_VERIFIED'
        self.app.save()
        
        self.client.force_authenticate(user=self.surveyor)
        data = {
            'farm_extent': '55.0000',
            'farm_name': 'Surveyed Farm',
            'is_fee_paid': False
        }
        response = self.client.post(f'/api/applications/{self.app.id}/mark_surveyed/', data)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        self.app.refresh_from_db()
        self.assertEqual(self.app.status, 'SURVEYED') # Still proceeds!
        self.assertFalse(self.app.is_survey_fee_paid)
        self.assertIn('Survey Fee: NOT PAID', self.app.officer_comments)
        self.assertEqual(self.app.purchase_price, Decimal('27500.00')) 

    def test_director_approve_flow(self):
        """Test Director approval flow"""
        self.app.status = 'VALUATED'
        self.app.purchase_price = Decimal('30000.00')
        self.app.save()
        
        self.client.force_authenticate(user=self.director)
        response = self.client.post(f'/api/applications/{self.app.id}/approve/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        self.app.refresh_from_db()
        self.assertEqual(self.app.status, 'SELECT_PAYMENT')

    def test_select_payment_method_mortgage(self):
        """Test selecting Mortgage payment method"""
        self.app.status = 'AWAITING_PAYMENT'
        self.app.purchase_price = Decimal('30000.00')
        self.app.save()
        
        self.client.force_authenticate(user=self.farmer_user)
        data = {
            'payment_method': 'MORTGAGE',
            'selected_bank': 'CBZ'
        }
        response = self.client.post(f'/api/applications/{self.app.id}/select-payment/', data)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        self.app.refresh_from_db()
        self.assertEqual(self.app.payment_plan, 'MORTGAGE')
        self.assertEqual(self.app.selected_bank, 'CBZ')
        self.assertEqual(self.app.status, 'AGREEMENT_OF_SALE')

    def test_fail_mortgage_without_bank(self):
        """Test failure when selecting Mortgage without bank"""
        self.app.status = 'AWAITING_PAYMENT'
        self.app.save()
        
        self.client.force_authenticate(user=self.farmer_user)
        data = {'payment_method': 'MORTGAGE'} # Missing bank
        response = self.client.post(f'/api/applications/{self.app.id}/select-payment/', data)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

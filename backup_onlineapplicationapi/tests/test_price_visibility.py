from django.test import TestCase
from django.contrib.auth.models import User
from rest_framework.test import APIRequestFactory, force_authenticate
from onlineapplicationapi.models import TitleDeedApplication, FarmerProfile, StaffProfile
from onlineapplicationapi.serializers import TitleDeedApplicationSerializer
from decimal import Decimal

class PriceVisibilityTest(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        
        # Create users
        self.farmer_user = User.objects.create_user(username='farmer', password='password')
        self.staff_user = User.objects.create_user(username='staff', password='password', is_staff=True)
        
        # Create profiles
        self.farmer_profile = FarmerProfile.objects.create(
            user=self.farmer_user,
            first_name='John',
            surname='Doe',
            email='john@example.com',
            date_of_birth='1980-01-01',
            national_id='123456789',
            sex='Male',
            title='Mr',
            marital_status='Single',
            telephone='+263777123456',
            contact_address='123 Farm St'
        )
        StaffProfile.objects.create(user=self.staff_user, role='lims')
        
        # Create application
        self.app = TitleDeedApplication.objects.create(
            farmer=self.farmer_profile,
            district='Mutare',
            farm_name='Green Acres',
            farm_extent=Decimal('100.5'),
            status='VALUATED',
            purchase_price=Decimal('50000.00'),
            calculated_land_value=Decimal('50000.00')
        )

    def test_price_hidden_from_farmer_when_valuated(self):
        """Farmer should NOT see purchase_price when status is VALUATED"""
        request = self.factory.get('/api/applications/')
        request.user = self.farmer_user
        
        serializer = TitleDeedApplicationSerializer(self.app, context={'request': request})
        data = serializer.data
        
        self.assertIsNone(data.get('purchase_price'), "Purchase price should be hidden (None) for farmer at VALUATED status")
        self.assertIsNone(data.get('calculated_land_value'), "Calculated land value should be hidden (None) for farmer at VALUATED status")

    def test_price_visible_to_staff_when_valuated(self):
        """Staff should ALWAYS see purchase_price"""
        request = self.factory.get('/api/applications/')
        request.user = self.staff_user
        
        serializer = TitleDeedApplicationSerializer(self.app, context={'request': request})
        data = serializer.data
        
        self.assertEqual(Decimal(str(data['purchase_price'])), Decimal('50000.00'), "Staff should see the purchase price")

    def test_price_visible_to_farmer_when_awaiting_payment(self):
        """Farmer should see purchase_price when status is AWAITING_PAYMENT (approved)"""
        self.app.status = 'AWAITING_PAYMENT'
        self.app.save()
        
        request = self.factory.get('/api/applications/')
        request.user = self.farmer_user
        
        serializer = TitleDeedApplicationSerializer(self.app, context={'request': request})
        data = serializer.data
        
        self.assertEqual(Decimal(str(data['purchase_price'])), Decimal('50000.00'), "Farmer should see purchase price at AWAITING_PAYMENT status")

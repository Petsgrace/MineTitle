"""
Unit tests for updated Land Purchase Incentives pricing engine.
Ref: Land Tenure Implementation Committee Directive (20 April 2026)
"""

from decimal import Decimal
from django.test import TestCase
from django.contrib.auth.models import User
from onlineapplicationapi.models import FarmerProfile, TitleDeedApplication, SpouseDetail
from onlineapplicationapi.pricing import calculate_purchase_price, apply_pricing_to_application


class CompoundedPricingTests(TestCase):

    def setUp(self):
        self.user = User.objects.create_user(username='farmer1', password='password123')
        self.farmer = FarmerProfile.objects.create(
            user=self.user,
            national_id='63-123456-A-63',
            first_name='Tendai',
            surname='Moyo',
            date_of_birth='1975-01-01',
            sex='Male',
            title='Mr',
            marital_status='Married',
            citizenship='Zimbabwean',
            telephone='0712345678',
            contact_address='Harare'
        )

    def test_war_veteran_concession_base_rate_and_85_percent_discount(self):
        """
        War Veteran on Region 2 farm (10 Ha).
        Region 2 Concession Base Rate: $6.00 / ha.
        Base Land Value = 10 Ha * $6.00 = $60.00.
        85% overall discount applied: $60.00 * (1 - 0.85) = $9.00.
        """
        self.farmer.is_war_veteran = True
        self.farmer.save()

        app = TitleDeedApplication.objects.create(
            farmer=self.farmer,
            district='Makoni',  # Region 2b
            farm_name='War Vet Farm',
            farm_extent=Decimal('10.0'),
            arable_area=Decimal('10.0'),
            tenure_document_type='A2 Permit'
        )

        pricing = calculate_purchase_price(app)
        
        self.assertEqual(pricing['base_rate_per_hectare'], Decimal('6.00'))
        self.assertEqual(pricing['base_land_value'], Decimal('60.00'))
        self.assertEqual(pricing['calculated_land_value'], Decimal('60.00'))
        self.assertEqual(pricing['purchase_price'], Decimal('9.00'))

    def test_civil_servant_tiered_discounts(self):
        """
        Verify Civil Servant tier rates:
          - 6 years  -> 5%
          - 15 years -> 10%
          - 25 years -> 20%
          - 45 years -> 30%
        """
        app = TitleDeedApplication.objects.create(
            farmer=self.farmer,
            district='Makoni',  # Region 2b (Standard rate $825/ha)
            farm_name='Test Farm',
            farm_extent=Decimal('10.0'),
            arable_area=Decimal('10.0'),
            tenure_document_type='A2 Permit'
        )
        
        # Standard base: 10 * 825 = $8250.00
        self.farmer.is_civil_servant = True

        # Case A: 6 years -> 5% discount
        self.farmer.civil_service_years = 6
        self.farmer.save()
        pricing = calculate_purchase_price(app)
        # 8250 * 0.95 = 7837.50
        self.assertEqual(pricing['purchase_price'], Decimal('7837.50'))

        # Case B: 15 years -> 10% discount
        self.farmer.civil_service_years = 15
        self.farmer.save()
        pricing = calculate_purchase_price(app)
        # 8250 * 0.90 = 7425.00
        self.assertEqual(pricing['purchase_price'], Decimal('7425.00'))

        # Case C: 25 years -> 20% discount
        self.farmer.civil_service_years = 25
        self.farmer.save()
        pricing = calculate_purchase_price(app)
        # 8250 * 0.80 = 6600.00
        self.assertEqual(pricing['purchase_price'], Decimal('6600.00'))

        # Case D: 45 years -> 30% discount
        self.farmer.civil_service_years = 45
        self.farmer.save()
        pricing = calculate_purchase_price(app)
        # 8250 * 0.70 = 5775.00
        self.assertEqual(pricing['purchase_price'], Decimal('5775.00'))

    def test_ex_detainee_and_collaborator_discounts(self):
        """
        Verify Ex-Detainee (30%) and Collaborator (15%) standalone discounts.
        """
        app = TitleDeedApplication.objects.create(
            farmer=self.farmer,
            district='Gweru',  # Region 3 (Standard rate $500/ha)
            farm_name='Cadre Farm',
            farm_extent=Decimal('10.0'),
            arable_area=Decimal('10.0'),
            tenure_document_type='A2 Permit'
        )
        # Base: 10 * 500 = $5000.00

        # Ex-Detainee: 30% -> 5000 * 0.70 = $3500.00
        self.farmer.is_ex_detainee = True
        self.farmer.save()
        pricing = calculate_purchase_price(app)
        self.assertEqual(pricing['purchase_price'], Decimal('3500.00'))

        # Collaborator: 15% -> 5000 * 0.85 = $4250.00
        self.farmer.is_ex_detainee = False
        self.farmer.is_collaborator = True
        self.farmer.save()
        pricing = calculate_purchase_price(app)
        self.assertEqual(pricing['purchase_price'], Decimal('4250.00'))

    def test_multiplicative_compounding_prevents_zero_or_negative_price(self):
        """
        Verify multi-category stacking with war vet threshold:
        Farmer is War Vet (85%), Civil Servant 25 yrs (20%), and selects Cash Payment (15%).
        Region 2b: concession rate $6/ha for first 10 Ha.
        Farm size = 10 Ha (at threshold) -> Base: 10 * $6.00 = $60.00
          Step 1 (85%): $60.00 * 0.15 = $9.00
          Step 2 (20%): $9.00 * 0.80 = $7.20
          Step 3 (15%): $7.20 * 0.85 = $6.12
        Price must be exactly $6.12 (positive and non-zero).
        """
        self.farmer.is_war_veteran = True
        self.farmer.is_civil_servant = True
        self.farmer.civil_service_years = 25
        self.farmer.save()

        app = TitleDeedApplication.objects.create(
            farmer=self.farmer,
            district='Makoni', # Region 2b: concession $6/ha, threshold 10 Ha
            farm_name='Compound Farm',
            farm_extent=Decimal('10.0'), # 10 Ha at concession rate: 10 * 6 = $60
            arable_area=Decimal('10.0'),
            tenure_document_type='A2 Permit',
            is_cash_payment=True
        )

        pricing = calculate_purchase_price(app)
        self.assertEqual(pricing['calculated_land_value'], Decimal('60.00'))
        self.assertEqual(pricing['purchase_price'], Decimal('6.12'))

    def test_spouse_discounts_compound_with_farmer(self):
        """
        Farmer is Civil Servant 15 yrs (10%), Spouse is War Veteran (85%).
        Starting Base Value: $1,000.00.
          Step 1 (85% Spouse War Vet): $1000 * 0.15 = $150.00
          Step 2 (10% Farmer Civil Servant): $150 * 0.90 = $135.00
        Final Price: $135.00
        """
        self.farmer.is_civil_servant = True
        self.farmer.civil_service_years = 15
        self.farmer.save()

        app = TitleDeedApplication.objects.create(
            farmer=self.farmer,
            district='Harare', # Reg 3 default -> let's mock base to 1000
            farm_name='Joint Farm',
            farm_extent=Decimal('2.0'), # Reg 3 is $500/ha -> 2 * 500 = $1000.00
            arable_area=Decimal('2.0'),
            tenure_document_type='A2 Permit'
        )

        SpouseDetail.objects.create(
            application=app,
            first_name='Grace',
            surname='Moyo',
            is_war_veteran=True
        )

        pricing = calculate_purchase_price(app)
        self.assertEqual(pricing['calculated_land_value'], Decimal('1000.00'))
        self.assertEqual(pricing['purchase_price'], Decimal('135.00'))

# Pricing Calculation Service for Title Deed Applications
# Ref: Land Tenure Implementation Committee Directive (20 April 2026)

from decimal import Decimal
from .districts import (
    REGION_RATES,
    WAR_VET_REGION_RATES,
    WATER_DISTANCE_PREMIUM, 
    BENEFICIARY_DISCOUNTS,
    get_district_region,
    get_city_premium
)


def calculate_land_class(arable_area, total_area):
    """
    Determine land class based on arable percentage.
    Returns the discount percentage to apply.
    """
    if total_area <= 0:
        return Decimal('0')
    
    arable_percentage = (arable_area / total_area) * 100
    
    if arable_percentage >= 80:
        return Decimal('0')
    elif arable_percentage >= 60:
        return Decimal('1.5')
    elif arable_percentage >= 40:
        return Decimal('2.0')
    else:
        return Decimal('2.5')


def get_civil_servant_discount(years: int) -> Decimal:
    """
    Tiered civil servant discount based on years of service (serving or retired).
    Ref: 20 April 2026 Directive:
      > 40 years: 30%
      > 20 years: 20%
      > 10 years: 10%
      > 5 years:  5%
    """
    if not years:
        return Decimal('0')
    if years > 40:
        return Decimal('30')
    elif years > 20:
        return Decimal('20')
    elif years > 10:
        return Decimal('10')
    elif years > 5:
        return Decimal('5')
    return Decimal('0')


def extract_person_discounts(person, source_label: str) -> list:
    """
    Extract all eligible beneficiary discounts for a given person (farmer or spouse).
    
    Returns list of dicts: [{'source': str, 'type': str, 'rate': Decimal}]
    """
    discounts = []
    if not person:
        return discounts
        
    # 1. War Veteran (85%)
    if getattr(person, 'is_war_veteran', False):
        discounts.append({
            'source': source_label,
            'type': 'War Veteran',
            'rate': Decimal('85')
        })

    # 2. Ex-Detainee / Restrictee / Non-Combatant (30%)
    if getattr(person, 'is_ex_detainee', False):
        discounts.append({
            'source': source_label,
            'type': 'Ex-Detainee / Non-Combatant',
            'rate': Decimal('30')
        })

    # 3. Collaborator (15%)
    if getattr(person, 'is_collaborator', False):
        discounts.append({
            'source': source_label,
            'type': 'Collaborator',
            'rate': Decimal('15')
        })

    # 4. Civil Servant (5% to 30%)
    if getattr(person, 'is_civil_servant', False):
        years = getattr(person, 'civil_service_years', 0) or getattr(person, 'years_of_service', 0) or 0
        rate = get_civil_servant_discount(int(years))
        if rate > 0:
            discounts.append({
                'source': source_label,
                'type': f'Civil Servant ({years} yrs)',
                'rate': rate
            })

    return discounts


def calculate_purchase_price(application):
    """
    Calculate the total purchase price based on valuation parameters and official incentives.
    
    Ref: Land Tenure Implementation Committee Directive (20 April 2026)
    
    Formula & Flow:
    1. Base Land Value:
       - War Veterans: Total hectares × Regional Concession Rate ($10, $6, $3, $1.50, $1.17 / ha)
       - Non-War Veterans: Total hectares × Regional Standard Rate
       
    2. Adjustments (Land Class, Water Source, Town Proximity) -> Adjusted Base Value
    
    3. Multiplicative Compounding Discounts:
       All eligible discounts (Farmer + Spouses + Cash Payment option) are sorted from
       highest percentage to lowest percentage and applied sequentially to the remaining balance:
         running_price = running_price * (1 - rate / 100)
       This ensures the price never reaches 0 or becomes negative.
       
    4. Final Purchase Price = Discounted Land Value + Improvements Value
    """
    region = application.ecological_region or get_district_region(application.district)
    farmer = getattr(application, 'farmer', None)
    is_war_veteran = farmer and getattr(farmer, 'is_war_veteran', False)

    # 1. Base Rate Selection
    standard_rate = Decimal(str(REGION_RATES.get(region, 500.00)))
    hectares = Decimal(str(application.farm_extent or 0))
    arable_area = Decimal(str(application.arable_area or hectares))
    concession_rate = None
    threshold = None

    if is_war_veteran:
        # War Vet concession rate applies only to the first X hectares (threshold).
        # Any hectares beyond the threshold are charged at the standard region rate.
        war_vet_info = WAR_VET_REGION_RATES.get(region, {'rate': 3.00, 'threshold_ha': 20})
        concession_rate = Decimal(str(war_vet_info['rate']))
        threshold = Decimal(str(war_vet_info['threshold_ha']))

        concession_ha = min(hectares, threshold)
        excess_ha = max(hectares - threshold, Decimal('0'))
        base_land_value = (concession_ha * concession_rate) + (excess_ha * standard_rate)
    else:
        base_land_value = hectares * standard_rate

    # Check for Manual Valuation Override
    is_manually_valuated = getattr(application, 'is_manually_valuated', False)
    manual_price = getattr(application, 'manual_valuation_price', None)

    if is_manually_valuated and manual_price is not None:
        starting_value = Decimal(str(manual_price))
        land_class_discount = Decimal('0')
        water_premium = Decimal('0')
        town_premium = Decimal('0')
    else:
        # Land Class Discount
        land_class_discount = calculate_land_class(arable_area, hectares)
        land_class_multiplier = Decimal('1') - (land_class_discount / Decimal('100'))

        # Water Source Premium
        water_premium = Decimal('0')
        if application.water_source_type and application.water_source_type != 'none':
            if application.water_source_type in ('Dam', 'River', 'dam', 'river'):
                water_distance = application.water_source_distance or 'on_farm'
                water_premium = Decimal(str(WATER_DISTANCE_PREMIUM.get(water_distance, 0)))
        water_multiplier = Decimal('1') + (water_premium / Decimal('100'))

        # Town Proximity Premium/Discount
        town_premium = Decimal('0')
        if application.nearest_town and application.distance_to_town is not None:
            town_premium = Decimal(str(get_city_premium(
                application.nearest_town, 
                float(application.distance_to_town)
            )))
        town_multiplier = Decimal('1') + (town_premium / Decimal('100'))

        # Calculate Adjusted Base Value before beneficiary discounts
        starting_value = base_land_value * land_class_multiplier * water_multiplier * town_multiplier

    # Collect ALL eligible discounts
    all_discounts = []
    
    # Farmer discounts
    all_discounts.extend(extract_person_discounts(farmer, 'Farmer'))

    # Spouse discounts
    try:
        spouses = application.spouses.all()
        for spouse in spouses:
            spouse_label = f"Spouse ({spouse.first_name or ''} {spouse.surname or ''})".strip()
            all_discounts.extend(extract_person_discounts(spouse, spouse_label))
    except Exception:
        pass

    # Cash Payment discount (15%)
    if getattr(application, 'is_cash_payment', False):
        all_discounts.append({
            'source': 'Payment Selection',
            'type': 'Cash Payment Discount',
            'rate': Decimal('15')
        })

    # Sort discounts in descending order (highest % first) for compounding
    all_discounts.sort(key=lambda d: d['rate'], reverse=True)

    # Apply Multiplicative Compounding
    running_value = starting_value
    applied_breakdown = []

    for item in all_discounts:
        rate = item['rate']
        discount_amount = (running_value * (rate / Decimal('100'))).quantize(Decimal('0.01'))
        running_value -= discount_amount
        applied_breakdown.append({
            'source': item['source'],
            'type': item['type'],
            'rate': float(rate),
            'amount': float(discount_amount)
        })

    discounted_land_value = running_value.quantize(Decimal('0.01'))
    improvements_value = Decimal(str(application.improvements_value or 0)) if not is_manually_valuated else Decimal('0')
    total_purchase_price = (discounted_land_value + improvements_value).quantize(Decimal('0.01'))

    return {
        'base_land_value': base_land_value.quantize(Decimal('0.01')),
        'land_class_discount': land_class_discount,
        'water_premium': water_premium,
        'town_premium': town_premium,
        'calculated_land_value': starting_value.quantize(Decimal('0.01')),
        'discounted_land_value': discounted_land_value,
        'improvements_value': improvements_value.quantize(Decimal('0.01')),
        'purchase_price': total_purchase_price,
        'applied_discounts': applied_breakdown,
        'ecological_region': region,
        'base_rate_per_hectare': concession_rate if is_war_veteran else standard_rate,
        'standard_rate_per_hectare': standard_rate,
        'war_vet_concession_rate': float(concession_rate) if is_war_veteran else None,
        'war_vet_threshold_ha': float(threshold) if is_war_veteran else None,
        'hectares': hectares,
        'is_war_veteran': is_war_veteran,
        'is_manual': is_manually_valuated
    }


def calculate_cumulative_beneficiary_discount(application):
    """Legacy helper for backward compatibility."""
    pricing = calculate_purchase_price(application)
    return {
        'discounts': pricing['applied_discounts'],
        'total_discount': Decimal('0'),  # Not additive anymore
    }


def apply_pricing_to_application(application, save=True):
    """
    Calculate and apply pricing to an application.
    Optionally saves the application with updated pricing.
    """
    pricing = calculate_purchase_price(application)
    
    application.calculated_land_value = pricing['calculated_land_value']
    application.purchase_price = pricing['purchase_price']
    
    if not application.ecological_region:
        application.ecological_region = pricing['ecological_region']
    
    application.base_land_value = pricing.get('base_land_value')
    application.land_class_discount = pricing.get('land_class_discount')
    application.water_premium = pricing.get('water_premium')
    application.town_premium = pricing.get('town_premium')
    application.base_rate_per_hectare = pricing.get('base_rate_per_hectare')
    
    if save:
        application.save()
    
    return pricing

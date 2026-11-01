"""
Fees and Valuation Engine.
Calculates Survey Fee and Statutory Valuation based on configurable database tariff tables.
"""
from typing import Dict, Any, Tuple
from decimal import Decimal
import logging

logger = logging.getLogger(__name__)

def calculate_survey_fee_for_area(area_ha: float | Decimal) -> Decimal:
    """
    Calculates survey fee based on parcel area from the SurveyTariff table.
    """
    from onlineapplicationapi.models import SurveyTariff
    
    area_dec = Decimal(str(area_ha or 0.0))
    if area_dec <= 0:
        return Decimal('150.00')

    tariff = SurveyTariff.objects.filter(
        min_area_ha__lte=area_dec,
        max_area_ha__gte=area_dec
    ).first()

    if not tariff:
        # Fallback to largest tariff or default
        tariff = SurveyTariff.objects.order_by('-max_area_ha').first()

    if tariff:
        fee = Decimal(str(tariff.base_fee_usd))
        if tariff.per_hectare_rate_usd and area_dec > tariff.min_area_ha:
            fee += (area_dec - tariff.min_area_ha) * Decimal(str(tariff.per_hectare_rate_usd))
        return round(fee, 2)

    return Decimal('250.00')

def calculate_land_valuation(
    region: str,
    land_class: str,
    area_ha: float | Decimal,
    improvements_value: float | Decimal = Decimal('0.00')
) -> Dict[str, Any]:
    """
    Computes statutory land valuation:
    valuation = base_rate_per_ha (by region & land class) * area_ha + assessed_improvements.
    """
    from onlineapplicationapi.models import ValuationTariff
    
    area_dec = Decimal(str(area_ha or 0.0))
    imp_dec = Decimal(str(improvements_value or 0.0))
    
    clean_reg = (region or 'Region II').strip()
    clean_cls = (land_class or 'A1').strip()
    
    tariff = ValuationTariff.objects.filter(
        region__iexact=clean_reg,
        land_class__iexact=clean_cls
    ).first()
    
    if not tariff:
        tariff = ValuationTariff.objects.filter(region__iexact=clean_reg).first()
    if not tariff:
        tariff = ValuationTariff.objects.first()
        
    base_rate = Decimal(str(tariff.base_rate_per_ha_usd)) if tariff else Decimal('350.00')
    base_land_val = round(base_rate * area_dec, 2)
    total_val = round(base_land_val + imp_dec, 2)
    
    return {
        "region": clean_reg,
        "land_class": clean_cls,
        "base_rate_per_ha": float(base_rate),
        "area_ha": float(area_dec),
        "base_land_value": float(base_land_val),
        "improvements_value": float(imp_dec),
        "total_valuation": float(total_val),
    }

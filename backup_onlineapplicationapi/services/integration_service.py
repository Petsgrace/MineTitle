"""
Integration Service
A service class to orchestrate pulling data from simulation APIs.
"""

from typing import Dict, Any, Optional
from ..utils.api_simulators import GovernmentApiSimulator

class IntegrationService:
    """Service for external data integration."""
    
    @staticmethod
    def fetch_display_data(national_id: str) -> Optional[Dict[str, Any]]:
        """
        Fetches only non-sensitive data for frontend verification.
        
        Returns:
            Dictionary with name and surname to indicate identity found, or None.
        """
        data = GovernmentApiSimulator.get_rg_data(national_id)
        if not data:
            return None
            
        return {
            "first_name": data.get('first_name'),
            "surname": data.get('surname'),
            "is_verified": True
        }

    @staticmethod
    def seal_application(application):
        """
        Merges official official data (RG, SG, ZLC) into a TitleDeedApplication object.
        Used on server-side creation to override/verify user input.
        """
        national_id = getattr(application, 'farmer', None).national_id if hasattr(application, 'farmer') and application.farmer else None
        if not national_id:
            return
        data = GovernmentApiSimulator.query_all(national_id)
        
        if data:
            # Personal details from RG
            rg = data.get('rg', {})
            application.date_of_birth = rg.get('dob')
            application.sex = rg.get('sex')
            application.marital_status = rg.get('marital_status')
            application.citizenship = rg.get('citizenship')
            # Farm details from SG
            sg = data.get('sg', {})
            application.farm_name = sg.get('farm_name')
            application.farm_extent = sg.get('farm_extent')
            application.district = sg.get('district')
            application.old_district = sg.get('old_district')
            application.plot_number = sg.get('farm_id')
            
            # Categories from PSC/WarVets
            psc = data.get('psc', {})
            application.is_civil_servant = psc.get('is_civil_servant', False)
            application.ec_number = psc.get('ec_number')
            application.civil_service_years = psc.get('years_of_service', 0)
            
            war_vet = data.get('war_vet', {})
            application.is_war_veteran = war_vet.get('is_war_veteran', False)
            application.war_vet_number = war_vet.get('war_vet_number')
            
            # ZLC dispute status can be logged/checked
            zlc = data.get('zlc', {})
            if zlc.get('has_disputes'):
                application.officer_comments = f"[SYSTEM] ZLC ALERT: {zlc.get('dispute_nature')}. {zlc.get('dispute_comments')}"
        
        return application

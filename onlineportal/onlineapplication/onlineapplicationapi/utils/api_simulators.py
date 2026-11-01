"""
Api Simulators
Contains mock data and logic for the 5 external APIs.
1. Registrar General (RG)
2. Public Service Commission (PSC)
3. War Veterans
4. Surveyor General (SG)
5. Zimbabwe Land Commission (ZLC)
"""

from datetime import date

# Mock database of "Official" data keyed by National ID
MOCK_DATA_BY_ID = {
    "63-123456-A-63": {
        "rg": {
            "first_name": "Tendai",
            "surname": "Moyo",
            "other_names": "Jameson",
            "dob": "1985-05-15",
            "sex": "Male",
            "marital_status": "Married",
            "citizenship": "Zimbabwean",
            "status": "Living",
            "title": "Mr"
        },
        "psc": {
            "is_civil_servant": True,
            "ec_number": "EC123456-B",
            "years_of_service": 15
        },
        "war_vet": {
            "is_war_veteran": False,
            "war_vet_number": None
        },
        "sg": {
            "farm_name": "Kopje View Farm",
            "farm_extent": 125.50,
            "district": "Makoni",
            "old_district": "Makoni",
            "farm_id": "LOT-502-KOPJE"
        },
        "zlc": {
            "has_disputes": False,
            "dispute_nature": None,
            "dispute_comments": "Clear Title Track"
        }
    },
    "63-987654-H-12": {
        "rg": {
            "first_name": "Sakhile",
            "surname": "Ndlovu",
            "other_names": "Grace",
            "dob": "1978-02-28",
            "sex": "Female",
            "marital_status": "Widowed",
            "citizenship": "Zimbabwean",
            "status": "Living",
            "title": "Mrs"
        },
        "psc": {
            "is_civil_servant": False,
            "ec_number": None,
            "years_of_service": None
        },
        "war_vet": {
            "is_war_veteran": True,
            "war_vet_number": "WV-HAR-9023"
        },
        "sg": {
            "farm_name": "Valley Meadows",
            "farm_extent": 80.00,
            "district": "Mazowe",
            "old_district": "Mazowe",
            "farm_id": "PLOT-78-VALLEY"
        },
        "zlc": {
            "has_disputes": True,
            "dispute_nature": "Boundary Dispute",
            "dispute_comments": "Ongoing court case regarding fence line with Plot 79"
        }
    }
}

class GovernmentApiSimulator:
    """Simulates response from government APIs based on National ID."""
    
    @staticmethod
    def query_all(national_id: str):
        """Fetches data from all simulators for a given ID."""
        data = MOCK_DATA_BY_ID.get(national_id)
        if not data:
            return None
        return data

    @staticmethod
    def get_rg_data(national_id: str):
        data = MOCK_DATA_BY_ID.get(national_id)
        return data['rg'] if data else None

    @staticmethod
    def get_psc_data(national_id: str):
        data = MOCK_DATA_BY_ID.get(national_id)
        return data['psc'] if data else None

    @staticmethod
    def get_war_vet_data(national_id: str):
        data = MOCK_DATA_BY_ID.get(national_id)
        return data['war_vet'] if data else None

    @staticmethod
    def get_sg_data(national_id: str):
        data = MOCK_DATA_BY_ID.get(national_id)
        return data['sg'] if data else None

    @staticmethod
    def get_zlc_data(national_id: str):
        data = MOCK_DATA_BY_ID.get(national_id)
        return data['zlc'] if data else None

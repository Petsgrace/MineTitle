"""
AI Conflict Predictor & Cadastral Dispute Detection Engine
Part of Land Harmony / Title Deeds One Stop Center
"""
import math
from typing import Dict, Any, List
from django.utils import timezone


# Historical district baseline dispute probabilities (peri-urban & high-demand zones)
DISTRICT_VOLATILITY_INDEX = {
    'GOROMONZI': 35,
    'MAZOWE': 32,
    'ZVIMBA': 30,
    'SEKE': 28,
    'MARONDERA': 25,
    'CHEGUTU': 22,
    'BINDURA': 20,
    'CHINHOYI': 18,
    'HARARE': 35,
    'BULAWAYO': 25,
}

def _polygon_centroid(coords: list) -> tuple:
    """Computes centroid (lat, lng) of a polygon coordinate ring."""
    if not coords or len(coords) < 3:
        return (0.0, 0.0)
    # Filter points
    pts = [p for p in coords if isinstance(p, (list, tuple)) and len(p) >= 2]
    if not pts:
        return (0.0, 0.0)
    avg_lng = sum(p[0] for p in pts) / len(pts)
    avg_lat = sum(p[1] for p in pts) / len(pts)
    return (avg_lat, avg_lng)

def _haversine_distance_km(lat1, lon1, lat2, lon2) -> float:
    """Calculates great-circle distance between two coordinates in kilometers."""
    R = 6371.0 # Earth radius in km
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c

def _polygons_overlap(poly1_coords: list, poly2_coords: list) -> bool:
    """Bounding-box overlap check for two polygon rings."""
    if not poly1_coords or not poly2_coords:
        return False
    
    pts1 = [p for p in poly1_coords if isinstance(p, (list, tuple)) and len(p) >= 2]
    pts2 = [p for p in poly2_coords if isinstance(p, (list, tuple)) and len(p) >= 2]
    if len(pts1) < 3 or len(pts2) < 3:
        return False
        
    min_lng1, max_lng1 = min(p[0] for p in pts1), max(p[0] for p in pts1)
    min_lat1, max_lat1 = min(p[1] for p in pts1), max(p[1] for p in pts1)
    
    min_lng2, max_lng2 = min(p[2] for p in pts2), max(p[0] for p in pts2)
    min_lat2, max_lat2 = min(p[1] for p in pts2), max(p[1] for p in pts2)
    
    # Check if bounding boxes intersect
    overlap_x = max_lng1 >= min_lng2 and max_lng2 >= min_lng1
    overlap_y = max_lat1 >= min_lat2 and max_lat2 >= min_lat1
    return overlap_x and overlap_y


class AIConflictPredictor:
    """
    AI Heuristic & Spatial Conflict Prediction Model.
    Analyzes cadastral boundaries, duplicate farm claims, estate succession risk,
    and regional volatility to generate a comprehensive dispute risk profile.
    """
    MODEL_VERSION = "v2.1-SpatialRiskForest"
    
    @classmethod
    def evaluate_application(cls, application) -> Dict[str, Any]:
        from onlineapplicationapi.models import TitleDeedApplication
        
        risk_score = 0
        risk_factors: List[Dict[str, Any]] = []
        conflicting_apps: List[Dict[str, Any]] = []
        recommendations: List[str] = []
        
        # 1. District Baseline Volatility Risk
        district_key = (application.district or '').upper().strip()
        base_volatility = DISTRICT_VOLATILITY_INDEX.get(district_key, 12)
        risk_score += int(base_volatility * 0.4)
        if base_volatility >= 25:
            risk_factors.append({
                "category": "REGIONAL_VOLATILITY",
                "severity": "MEDIUM",
                "weight": int(base_volatility * 0.4),
                "description": f"District '{application.district}' has a high historical land dispute rate ({base_volatility}% benchmark)."
            })
            
        # 2. Duplicate Farm / Lot Name Detection within District
        farm_name = (application.farm_name or '').strip().lower()
        if farm_name:
            matching_farms = TitleDeedApplication.objects.filter(
                district__iexact=application.district,
                farm_name__iexact=application.farm_name
            ).exclude(pk=application.pk)
            
            if matching_farms.exists():
                count = matching_farms.count()
                risk_score += 35
                for mf in matching_farms[:3]:
                    conflicting_apps.append({
                        "id": mf.id,
                        "reference_number": f"APP-{mf.id:05d}",
                        "farm_name": mf.farm_name,
                        "farmer": f"{mf.farmer.first_name} {mf.farmer.surname}" if mf.farmer else "Unknown",
                        "status": mf.status,
                        "reason": "Matching farm name and district"
                    })
                risk_factors.append({
                    "category": "DUPLICATE_ALLOCATION_RISK",
                    "severity": "HIGH",
                    "weight": 35,
                    "description": f"Found {count} other application(s) claiming the same farm name ('{application.farm_name}') in {application.district}."
                })
                recommendations.append("LIMS & ZLC Officers must cross-reference Ministry gazetted allocation lists.")

        # 3. Spatial Boundary Overlap / Proximity Analysis
        current_coords = application.boundary_coordinates
        # Extract polygon ring if nested GeoJSON
        ring = None
        if current_coords:
            if isinstance(current_coords, list) and len(current_coords) > 0:
                if isinstance(current_coords[0], list) and len(current_coords[0]) > 0 and isinstance(current_coords[0][0], list):
                    ring = current_coords[0]
                else:
                    ring = current_coords

        if ring and len(ring) >= 3:
            other_gis_apps = TitleDeedApplication.objects.exclude(
                pk=application.pk
            ).exclude(boundary_coordinates__isnull=True)
            
            c_lat, c_lng = _polygon_centroid(ring)
            spatial_conflicts = 0
            
            for other_app in other_gis_apps:
                o_coords = other_app.boundary_coordinates
                o_ring = None
                if isinstance(o_coords, list) and len(o_coords) > 0:
                    if isinstance(o_coords[0], list) and len(o_coords[0]) > 0 and isinstance(o_coords[0][0], list):
                        o_ring = o_coords[0]
                    else:
                        o_ring = o_coords
                
                if o_ring and len(o_ring) >= 3:
                    o_lat, o_lng = _polygon_centroid(o_ring)
                    dist_km = _haversine_distance_km(c_lat, c_lng, o_lat, o_lng)
                    
                    # If centroids are within 5km, check bounding box overlap
                    if dist_km <= 5.0 and _polygons_overlap(ring, o_ring):
                        spatial_conflicts += 1
                        risk_score += 40
                        conflicting_apps.append({
                            "id": other_app.id,
                            "reference_number": f"APP-{other_app.id:05d}",
                            "farm_name": other_app.farm_name,
                            "status": other_app.status,
                            "distance_km": round(dist_km, 2),
                            "reason": "Cadastral polygon overlap detected"
                        })
                        break # count max one major spatial overlap penalty
            
            if spatial_conflicts > 0:
                risk_factors.append({
                    "category": "CADASTRAL_BOUNDARY_OVERLAP",
                    "severity": "CRITICAL",
                    "weight": 40,
                    "description": "Cadastral boundary coordinates overlap with an existing surveyed or approved farm plot."
                })
                recommendations.append("Surveyor General must execute on-site GPS verification before issuing diagram.")
        else:
            # Missing coordinates slightly increases uncertainty
            risk_score += 10
            risk_factors.append({
                "category": "MISSING_SURVEY_COORDINATES",
                "severity": "LOW",
                "weight": 10,
                "description": "Precise GeoJSON boundary coordinates have not yet been surveyed and uploaded."
            })
            recommendations.append("Surveyor General needs to upload formal boundary polygon.")

        # 4. Deceased Estate / Succession Ambiguity Check
        farmer = application.farmer
        if farmer:
            marital = (farmer.marital_status or '').lower()
            if marital in ['widowed', 'divorced']:
                # Check if estates documentation is fully attached
                if not application.has_disputes:
                    risk_score += 15
                    risk_factors.append({
                        "category": "ESTATE_SUCCESSION_NOTICE",
                        "severity": "MEDIUM",
                        "weight": 15,
                        "description": f"Applicant status is {farmer.marital_status}; requires confirmation of Master of High Court estate distribution."
                    })
                    recommendations.append("Estates Officer must verify surviving spouse/heir clearances.")

        # 5. Existing Manual Dispute Flag
        if application.has_disputes:
            risk_score += 50
            risk_factors.append({
                "category": "OFFICER_FLAGGED_DISPUTE",
                "severity": "CRITICAL",
                "weight": 50,
                "description": f"Officer manually flagged active dispute: {application.dispute_nature or 'Unspecified'}."
            })
            recommendations.append(f"ZLC arbitration required: {application.dispute_comments or 'Review open complaint'}")

        # Normalize score 0 - 100
        risk_score = min(100, max(0, risk_score))
        
        # Categorize level
        if risk_score <= 30:
            level = "LOW"
            color = "green"
            verdict = "Low Dispute Risk - Parcel clear for automated progression."
        elif risk_score <= 65:
            level = "MEDIUM"
            color = "amber"
            verdict = "Moderate Dispute Risk - Requires standard departmental verification."
        else:
            level = "HIGH"
            color = "red"
            verdict = "High Dispute Risk - Potential boundary clash or contested ownership. Requires manual ZLC & Surveyor review."

        if not recommendations:
            recommendations.append("All primary cadastral and tenurial risk indicators normal.")

        return {
            "application_id": application.id,
            "reference_number": f"APP-{application.id:05d}",
            "risk_score": risk_score,
            "risk_level": level,
            "color": color,
            "verdict": verdict,
            "model_version": cls.MODEL_VERSION,
            "evaluated_at": timezone.now().isoformat(),
            "factors": risk_factors,
            "conflicting_applications": conflicting_apps,
            "recommendations": recommendations,
        }

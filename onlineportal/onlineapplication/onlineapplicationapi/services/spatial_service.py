"""
Spatial Service for Cadastral Boundary Operations and GIS Validation.
Supports PostGIS ST_Intersects and pure-Python / Shapely geometry fallback.
"""
import math
from typing import Dict, Any, List, Tuple
from shapely.geometry import shape, Polygon, MultiPolygon
from shapely.ops import unary_union
import logging

logger = logging.getLogger(__name__)

# District baseline dispute volatility benchmarks (%)
DISTRICT_VOLATILITY_RATES = {
    'GOROMONZI': 0.35,
    'MAZOWE': 0.32,
    'ZVIMBA': 0.30,
    'SEKE': 0.28,
    'MARONDERA': 0.25,
    'CHEGUTU': 0.22,
    'BINDURA': 0.20,
    'CHINHOYI': 0.18,
    'HARARE': 0.35,
    'BULAWAYO': 0.25,
    'GWERU': 0.15,
    'MUTARE': 0.16,
    'MASVINGO': 0.14,
    'KWEKWE': 0.15,
}

def get_district_dispute_rate(district: str) -> float:
    if not district:
        return 0.15
    return DISTRICT_VOLATILITY_RATES.get(district.strip().upper(), 0.12)

def normalize_geojson_polygon(coords) -> Polygon | None:
    """
    Parses various GeoJSON coordinate formats into a valid Shapely Polygon.
    Handles GeoJSON Feature, Geometry, nested rings, or coordinate lists.
    """
    if not coords:
        return None
    try:
        if isinstance(coords, dict):
            geom = coords.get('geometry', coords)
            sh = shape(geom)
            if isinstance(sh, (Polygon, MultiPolygon)):
                return sh
            return None
        
        # If coordinates list [[lng, lat], ...]
        if isinstance(coords, list):
            if len(coords) == 0:
                return None
            # Check nesting
            if isinstance(coords[0], list):
                if len(coords[0]) > 0 and isinstance(coords[0][0], list):
                    # Multi-ring: [[[x, y], [x, y], ...]]
                    return Polygon(coords[0])
                else:
                    return Polygon(coords)
    except Exception as e:
        logger.warning(f"Error parsing polygon coordinates: {e}")
        return None
    return None

def calculate_polygon_area_ha(poly: Polygon) -> float:
    """
    Approximates geodesic area of a polygon in hectares from WGS84 coordinates.
    1 degree lat ~ 111.32 km, 1 degree lng ~ 111.32 * cos(lat) km.
    """
    if not poly or poly.is_empty:
        return 0.0
    try:
        centroid = poly.centroid
        lat_rad = math.radians(centroid.y)
        m_per_deg_lat = 111320.0
        m_per_deg_lng = 111320.0 * math.cos(lat_rad)
        
        # Projected coordinates in meters
        ext_coords = list(poly.exterior.coords)
        meter_coords = [(x * m_per_deg_lng, y * m_per_deg_lat) for x, y in ext_coords]
        proj_poly = Polygon(meter_coords)
        sq_meters = proj_poly.area
        return round(sq_meters / 10000.0, 4) # 1 ha = 10,000 sq meters
    except Exception as e:
        logger.warning(f"Error calculating geodesic area: {e}")
        return 0.0


def check_spatial_overlaps_postgis(application, candidate_queryset=None) -> Dict[str, Any] | None:
    """
    Executes PostGIS ST_Intersects and ST_Area when PostgreSQL + PostGIS backend is active (D1).
    Returns the exact same structure as the Shapely fallback.
    """
    from django.db import connection
    import json
    
    if connection.vendor != 'postgresql':
        return None
        
    try:
        from django.conf import settings
        if 'django.contrib.gis' not in getattr(settings, 'INSTALLED_APPS', []):
            return None
            
        boundary = application.boundary_coordinates
        if not boundary:
            return None
        if isinstance(boundary, (dict, list)):
            geojson_str = json.dumps(boundary)
        else:
            geojson_str = str(boundary)
            
        with connection.cursor() as cursor:
            cursor.execute("""
                SELECT 
                    id,
                    reference_number,
                    farm_name,
                    farm_id,
                    status,
                    ST_Area(ST_Intersection(
                        ST_SetSRID(ST_GeomFromGeoJSON(%s), 4326)::geography,
                        ST_SetSRID(ST_GeomFromGeoJSON(boundary_coordinates::text), 4326)::geography
                    )) / 10000.0 AS overlap_ha,
                    ST_Area(ST_SetSRID(ST_GeomFromGeoJSON(%s), 4326)::geography) / 10000.0 AS parcel_ha
                FROM onlineapplicationapi_titledeedapplication
                WHERE district = %s AND id != %s AND boundary_coordinates IS NOT NULL
                  AND ST_Intersects(
                      ST_SetSRID(ST_GeomFromGeoJSON(%s), 4326),
                      ST_SetSRID(ST_GeomFromGeoJSON(boundary_coordinates::text), 4326)
                  );
            """, [geojson_str, geojson_str, application.district, application.id, geojson_str])
            rows = cursor.fetchall()
            
            parcel_area_ha = float(application.farm_extent or 0.0)
            overlapping_parcels = []
            total_overlap_ha = 0.0
            
            for row in rows:
                other_id, ref_num, farm_name, farm_id, status_val, overlap_ha, calc_parcel_ha = row
                if calc_parcel_ha and parcel_area_ha <= 0.0:
                    parcel_area_ha = float(calc_parcel_ha)
                inter_area_ha = round(float(overlap_ha or 0.0), 4)
                ratio = round(inter_area_ha / max(parcel_area_ha, 0.001), 4)
                if ratio > 0.0001:
                    total_overlap_ha += inter_area_ha
                    overlapping_parcels.append({
                        "application_id": other_id,
                        "reference_number": ref_num or f"APP-{other_id:05d}",
                        "farm_name": farm_name,
                        "cadastral_id": farm_id,
                        "overlap_area_ha": inter_area_ha,
                        "overlap_ratio": ratio,
                        "status": status_val,
                    })
                    
            total_ratio = min(1.0, round(total_overlap_ha / max(parcel_area_ha, 0.001), 4))
            return {
                "has_overlap": len(overlapping_parcels) > 0,
                "overlap_area_ratio": total_ratio,
                "overlapping_parcels_count": len(overlapping_parcels),
                "overlapping_parcels": overlapping_parcels,
                "parcel_area_ha": parcel_area_ha,
                "geojson_valid": True,
            }
    except Exception as e:
        logger.warning(f"PostGIS ST_Intersects query failed or not configured, using Shapely fallback: {e}")
        return None

def check_spatial_overlaps(application, candidate_queryset=None) -> Dict[str, Any]:
    # D1: PostGIS ST_Intersects / ST_Area check with Shapely fallback
    postgis_res = check_spatial_overlaps_postgis(application, candidate_queryset)
    if postgis_res is not None:
        return postgis_res

    """
    Runs spatial overlap detection (ST_Intersects equivalent) for an application
    against other parcels in the same district.
    Returns overlapping parcels and exact overlap area ratio.
    """
    from onlineapplicationapi.models import TitleDeedApplication
    
    current_poly = normalize_geojson_polygon(application.boundary_coordinates)
    if not current_poly or current_poly.is_empty:
        return {
            "has_overlap": False,
            "overlap_area_ratio": 0.0,
            "overlapping_parcels_count": 0,
            "overlapping_parcels": [],
            "parcel_area_ha": float(application.farm_extent or 0.0),
            "geojson_valid": False,
        }

    parcel_area_ha = calculate_polygon_area_ha(current_poly)
    if parcel_area_ha <= 0.0:
        parcel_area_ha = float(application.farm_extent or 1.0)

    if candidate_queryset is None:
        candidate_queryset = TitleDeedApplication.objects.filter(
            district__iexact=application.district
        ).exclude(pk=application.pk).exclude(boundary_coordinates__isnull=True)

    overlapping_parcels = []
    intersected_polygons = []

    for other_app in candidate_queryset:
        other_poly = normalize_geojson_polygon(other_app.boundary_coordinates)
        if not other_poly or other_poly.is_empty:
            continue
        
        try:
            if current_poly.intersects(other_poly):
                intersection = current_poly.intersection(other_poly)
                if not intersection.is_empty and intersection.area > 0:
                    inter_area_ha = calculate_polygon_area_ha(intersection)
                    overlap_ratio = round(inter_area_ha / max(parcel_area_ha, 0.001), 4)
                    
                    if overlap_ratio > 0.0001:
                        intersected_polygons.append(intersection)
                        overlapping_parcels.append({
                            "application_id": other_app.id,
                            "reference_number": other_app.reference_number or f"APP-{other_app.id:05d}",
                            "farm_name": other_app.farm_name,
                            "cadastral_id": getattr(other_app, 'cadastral_id', None) or other_app.farm_id,
                            "overlap_area_ha": inter_area_ha,
                            "overlap_ratio": overlap_ratio,
                            "status": other_app.status,
                        })
        except Exception as e:
            logger.warning(f"Intersection calculation error between {application.id} and {other_app.id}: {e}")

    # Total combined overlap area
    total_overlap_ratio = 0.0
    if intersected_polygons:
        try:
            combined_inter = unary_union(intersected_polygons)
            combined_area_ha = calculate_polygon_area_ha(combined_inter)
            total_overlap_ratio = min(1.0, round(combined_area_ha / max(parcel_area_ha, 0.001), 4))
        except Exception:
            total_overlap_ratio = min(1.0, sum(p["overlap_ratio"] for p in overlapping_parcels))

    return {
        "has_overlap": len(overlapping_parcels) > 0,
        "overlap_area_ratio": total_overlap_ratio,
        "overlapping_parcels_count": len(overlapping_parcels),
        "overlapping_parcels": overlapping_parcels,
        "parcel_area_ha": parcel_area_ha,
        "geojson_valid": True,
    }

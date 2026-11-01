# Zimbabwe Districts Reference Data
# Maps districts to ecological regions for pricing calculations

# Ecological Region Rates per Hectare (USD)
REGION_RATES = {
    '1': 1000.00,
    '2a': 840.00,
    '2b': 825.00,
    '3': 500.00,
    '4': 375.00,
    '5': 300.00,
}

# War Veteran Concession Rates per Hectare (USD)
# Ref: Land Tenure Implementation Committee Directive (20 April 2026)
# The concession rate applies only to the first X hectares (typical farm size for the region).
# Any hectares beyond the threshold are charged at the standard REGION_RATES.
WAR_VET_REGION_RATES = {
    '1':  {'rate': 10.00, 'threshold_ha': 6},    # Region 1: $10/ha for first 6 Ha
    '2a': {'rate': 6.00,  'threshold_ha': 10},   # Region 2a: $6/ha for first 10 Ha
    '2b': {'rate': 6.00,  'threshold_ha': 10},   # Region 2b: $6/ha for first 10 Ha
    '3':  {'rate': 3.00,  'threshold_ha': 20},   # Region 3: $3/ha for first 20 Ha
    '4':  {'rate': 1.50,  'threshold_ha': 40},   # Region 4: $1.50/ha for first 40 Ha
    '5':  {'rate': 1.17,  'threshold_ha': 70},   # Region 5: $1.17/ha for first 70 Ha
}


# City/Town Categories for proximity premium
# Category 1: Major cities (highest premium)
# Category 2: Secondary cities (16-25% premium)
# Category 3: Towns (10-15% premium)
CITY_CATEGORIES = {
    # Category 1 - Capital
    'Harare': {'category': 1, 'premium': 100},
    
    # Category 2 - Major Cities
    'Bulawayo': {'category': 2, 'premium': 25},
    'Gweru': {'category': 2, 'premium': 22},
    'Mutare': {'category': 2, 'premium': 20},
    'Marondera': {'category': 2, 'premium': 20},
    'Chinhoyi': {'category': 2, 'premium': 20},
    'Masvingo': {'category': 2, 'premium': 18},
    'Bindura': {'category': 2, 'premium': 18},
    
    # Category 3 - Towns
    'Kadoma': {'category': 3, 'premium': 15},
    'Kwekwe': {'category': 3, 'premium': 15},
    'Chegutu': {'category': 3, 'premium': 15},
    'Gwanda': {'category': 3, 'premium': 15},
    'Norton': {'category': 3, 'premium': 15},
    'Chitungwiza': {'category': 3, 'premium': 15},
    'Chiredzi': {'category': 3, 'premium': 12},
    'Rusape': {'category': 3, 'premium': 12},
    'Hwange': {'category': 3, 'premium': 12},
    'Beitbridge': {'category': 3, 'premium': 10},
    'Chipinge': {'category': 3, 'premium': 10},
    'Karoi': {'category': 3, 'premium': 10},
    'Chivhu': {'category': 3, 'premium': 10},
    'Nyanga': {'category': 3, 'premium': 10},
    'Banket': {'category': 3, 'premium': 10},
    'Victoria Falls': {'category': 3, 'premium': 12},
    'Zvishavane': {'category': 3, 'premium': 10},
    'Shurugwi': {'category': 3, 'premium': 10},
    'Redcliff': {'category': 3, 'premium': 10},
    'Ruwa': {'category': 3, 'premium': 12},
    'Mazowe': {'category': 3, 'premium': 12},
}

# Zimbabwe Districts with Ecological Regions
# Region 1: High rainfall >1000mm (Eastern Highlands)
# Region 2a: 750-1000mm (suitable for intensive farming)
# Region 2b: 750-1000mm (suitable for intensive farming, slightly drier)
# Region 3: 650-800mm (semi-intensive farming)
# Region 4: 450-650mm (semi-extensive farming)
# Region 5: <450mm (extensive farming only)

ZIMBABWE_DISTRICTS = {
    # Manicaland Province
    'Buhera': {'region': '4', 'province': 'Manicaland'},
    'Chimanimani': {'region': '1', 'province': 'Manicaland'},
    'Chipinge': {'region': '2a', 'province': 'Manicaland'},
    'Makoni': {'region': '2b', 'province': 'Manicaland'},
    'Mutare': {'region': '2a', 'province': 'Manicaland'},
    'Mutasa': {'region': '1', 'province': 'Manicaland'},
    'Nyanga': {'region': '1', 'province': 'Manicaland'},
    
    # Mashonaland Central Province
    'Bindura': {'region': '2b', 'province': 'Mashonaland Central'},
    'Centenary': {'region': '2b', 'province': 'Mashonaland Central'},
    'Guruve': {'region': '3', 'province': 'Mashonaland Central'},
    'Mazowe': {'region': '2b', 'province': 'Mashonaland Central'},
    'Mbire': {'region': '4', 'province': 'Mashonaland Central'},
    'Mount Darwin': {'region': '3', 'province': 'Mashonaland Central'},
    'Rushinga': {'region': '4', 'province': 'Mashonaland Central'},
    'Shamva': {'region': '2b', 'province': 'Mashonaland Central'},
    
    # Mashonaland East Province
    'Chikomba': {'region': '3', 'province': 'Mashonaland East'},
    'Goromonzi': {'region': '2b', 'province': 'Mashonaland East'},
    'Hwedza': {'region': '2b', 'province': 'Mashonaland East'},
    'Marondera': {'region': '2b', 'province': 'Mashonaland East'},
    'Mudzi': {'region': '4', 'province': 'Mashonaland East'},
    'Murehwa': {'region': '2b', 'province': 'Mashonaland East'},
    'Mutoko': {'region': '4', 'province': 'Mashonaland East'},
    'Seke': {'region': '2b', 'province': 'Mashonaland East'},
    'UMP': {'region': '3', 'province': 'Mashonaland East'},
    
    
    # Mashonaland West Province
    'Chegutu': {'region': '2b', 'province': 'Mashonaland West'},
    'Chinhoyi': {'region': '2b', 'province': 'Mashonaland West'},
    'Hurungwe': {'region': '3', 'province': 'Mashonaland West'},
    'Kadoma': {'region': '3', 'province': 'Mashonaland West'},
    'Kariba': {'region': '5', 'province': 'Mashonaland West'},
    'Makonde': {'region': '2b', 'province': 'Mashonaland West'},
    'Mhondoro-Ngezi': {'region': '3', 'province': 'Mashonaland West'},
    'Sanyati': {'region': '4', 'province': 'Mashonaland West'},
    'Zvimba': {'region': '2b', 'province': 'Mashonaland West'},
    'Norton': {'region': '2b', 'province': 'Mashonaland West'},
    'Karoi': {'region': '3', 'province': 'Mashonaland West'},
    
    # Masvingo Province
    'Bikita': {'region': '4', 'province': 'Masvingo'},
    'Chiredzi': {'region': '5', 'province': 'Masvingo'},
    'Chivi': {'region': '5', 'province': 'Masvingo'},
    'Gutu': {'region': '4', 'province': 'Masvingo'},
    'Masvingo': {'region': '4', 'province': 'Masvingo'},
    'Mwenezi': {'region': '5', 'province': 'Masvingo'},
    'Zaka': {'region': '4', 'province': 'Masvingo'},
    
    # Matabeleland North Province
    'Binga': {'region': '5', 'province': 'Matabeleland North'},
    'Bubi': {'region': '4', 'province': 'Matabeleland North'},
    'Hwange': {'region': '5', 'province': 'Matabeleland North'},
    'Lupane': {'region': '4', 'province': 'Matabeleland North'},
    'Nkayi': {'region': '4', 'province': 'Matabeleland North'},
    'Tsholotsho': {'region': '4', 'province': 'Matabeleland North'},
    'Umguza': {'region': '4', 'province': 'Matabeleland North'},
    'Victlsoria Falls': {'region': '5', 'province': 'Matabeleland North'},
    
    # Matabeleland South Province
    'Beitbridge': {'region': '5', 'province': 'Matabeleland South'},
    'Bulilima': {'region': '4', 'province': 'Matabeleland South'},
    'Gwanda': {'region': '5', 'province': 'Matabeleland South'},
    'Insiza': {'region': '4', 'province': 'Matabeleland South'},
    'Mangwe': {'region': '5', 'province': 'Matabeleland South'},
    'Matobo': {'region': '4', 'province': 'Matabeleland South'},
    'Umzingwane': {'region': '4', 'province': 'Matabeleland South'},
    'Plumtree': {'region': '4', 'province': 'Matabeleland South'},
    
    # Midlands Province
    'Chirumanzu': {'region': '3', 'province': 'Midlands'},
    'Gokwe North': {'region': '3', 'province': 'Midlands'},
    'Gokwe South': {'region': '3', 'province': 'Midlands'},
    'Gweru': {'region': '3', 'province': 'Midlands'},
    'Kwekwe': {'region': '3', 'province': 'Midlands'},
    'Mberengwa': {'region': '4', 'province': 'Midlands'},
    'Shurugwi': {'region': '3', 'province': 'Midlands'},
    'Zvishavane': {'region': '4', 'province': 'Midlands'},
    'Redcliff': {'region': '3', 'province': 'Midlands'},
}

# Water source types
WATER_SOURCE_TYPES = [
    ('dam', 'Dam'),
    ('river', 'River'),
    ('borehole', 'Borehole'),
    ('well', 'Well'),
    ('canal', 'Canal/Irrigation'),
    ('spring', 'Natural Spring'),
    ('none', 'No Water Source'),
]

# Water source distance categories and premiums
WATER_DISTANCE_PREMIUM = {
    'on_farm': 20,  # 20% premium
    '1_3km': 15,    # 15% premium
    '4_6km': 10,    # 10% premium
    '7km_plus': 5,  # 5% premium
}

# Land class discounts (based on arable percentage)
LAND_CLASS_DISCOUNTS = {
    '1_2': 0,      # Class 1-2: 0% discount
    '3_4': 1.5,    # Class 3-4: 1.5% discount
    '5_6': 2.0,    # Class 5-6: 2% discount
    '7_8': 2.5,    # Class 7-8: 2.5% discount
}

# Beneficiary category discounts (Applied sequentially via multiplicative compounding)
# Ref: Land Tenure Implementation Committee Directive (20 April 2026)
BENEFICIARY_DISCOUNTS = {
    'war_veteran': 85.0,  # War veteran: 85% overall discount
    'ex_detainee': 30.0,  # Ex-detainee / restrictee / non-combatant: 30% discount
    'collaborator': 15.0, # Collaborator: 15% discount
    'civil_gt40': 30.0,   # Civil servant >40 years: 30% discount
    'civil_gt20': 20.0,   # Civil servant >20 years: 20% discount
    'civil_gt10': 10.0,   # Civil servant >10 years: 10% discount
    'civil_gt5': 5.0,     # Civil servant >5 years: 5% discount
    'cash': 15.0,         # Cash payment: 15% discount
    'none': 0.0,
}

# Distance to town adjustments
TOWN_DISTANCE_ADJUSTMENT = {
    '0_40km': 0,      # 0-40km: Premium applies (from city category)
    '41_80km': -1.5,  # 41-80km: 1.5% discount
    '81_120km': -2.0, # 81-120km: 2% discount
}


def get_district_region(district_name):
    """Get the ecological region for a district."""
    district = ZIMBABWE_DISTRICTS.get(district_name)
    if district:
        return district['region']
    return '3'  # Default to region 3 if not found


def get_city_premium(nearest_town, distance_km):
    """Get the town proximity premium/discount."""
    city_info = CITY_CATEGORIES.get(nearest_town, {'category': 3, 'premium': 10})
    
    if distance_km <= 40:
        return city_info['premium']
    elif distance_km <= 80:
        return -1.5  # Discount
    elif distance_km <= 120:
        return -2.0  # Discount
    else:
        return -2.0  # Max discount


def get_district_choices():
    """Return district choices for form dropdowns."""
    return [(name, f"{name} ({data['province']})") 
            for name, data in sorted(ZIMBABWE_DISTRICTS.items())]

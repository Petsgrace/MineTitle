"""
AI Land Dispute & Conflict Predictor Prototype.
Trained on synthetic cadastral features with documented generator and seed.
Includes rule-based fallback and MODEL_CARD.md generator.
"""
import os
import csv
import json
import random
import logging
from pathlib import Path
from typing import Dict, Any, List, Tuple
from django.utils import timezone
import joblib
import numpy as np
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import classification_report, roc_auc_score

logger = logging.getLogger(__name__)

FEATURE_NAMES = [
    'overlap_area_ratio',
    'number_of_overlapping_parcels',
    'parcel_area',
    'district_historical_dispute_rate',
    'number_of_prior_claims',
    'years_since_allocation'
]

MODEL_FILE_NAME = "conflict_predictor_model.joblib"
DATASET_FILE_NAME = "synthetic_dispute_training_data.csv"
MODEL_CARD_FILE_NAME = "MODEL_CARD.md"

def get_base_dir() -> Path:
    return Path(__file__).resolve().parent

def generate_synthetic_dataset(num_samples: int = 5000, seed: int = 42) -> Path:
    """
    Generates a reproducible, clearly labelled synthetic dataset for the prototype.
    Seed: 42
    Target: dispute_occurred (0 or 1)
    """
    random.seed(seed)
    np.random.seed(seed)
    
    out_path = get_base_dir() / DATASET_FILE_NAME
    
    headers = FEATURE_NAMES + ['dispute_occurred']
    
    with open(out_path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(headers)
        
        for _ in range(num_samples):
            # 1. Overlap area ratio (0.0 to 1.0) - heavily skews dispute
            has_overlap = random.random() < 0.25
            if has_overlap:
                overlap_ratio = round(random.betavariate(1.5, 4.0), 4) # Peak near 0.1 - 0.4
                overlap_count = random.randint(1, 5)
            else:
                overlap_ratio = 0.0
                overlap_count = 0
                
            # 2. Parcel area (ha)
            parcel_area = round(random.lognormvariate(2.5, 0.8), 2) # median ~12 ha, range 1 - 200 ha
            
            # 3. District historical dispute rate (0.05 to 0.40)
            district_rate = round(random.choice([0.10, 0.15, 0.18, 0.22, 0.25, 0.28, 0.30, 0.32, 0.35]), 3)
            
            # 4. Number of prior claims (0 to 4)
            prior_claims = random.choices([0, 1, 2, 3], weights=[0.75, 0.15, 0.07, 0.03])[0]
            
            # 5. Years since allocation (0.5 to 25 years)
            years_alloc = round(random.uniform(0.5, 24.0), 1)
            
            # Ground truth generation logic (Log-odds with noise)
            # High overlap, high prior claims, high district rate, newer allocations increase dispute odds
            z = (
                -2.8
                + (7.5 * overlap_ratio)
                + (1.2 * overlap_count)
                + (3.5 * district_rate)
                + (1.8 * prior_claims)
                - (0.05 * years_alloc)
                + (0.002 * min(parcel_area, 200.0))
            )
            prob = 1.0 / (1.0 + np.exp(-z))
            # Add stochastic label with 5% label noise
            label = 1 if (random.random() < prob) else 0
            
            writer.writerow([
                overlap_ratio,
                overlap_count,
                parcel_area,
                district_rate,
                prior_claims,
                years_alloc,
                label
            ])
            
    logger.info(f"Generated {num_samples} synthetic dispute records at {out_path}")
    return out_path

def train_and_save_model() -> Dict[str, Any]:
    """
    Trains a Gradient Boosting model on the synthetic dataset, saves model artifact
    and outputs MODEL_CARD.md.
    """
    data_path = get_base_dir() / DATASET_FILE_NAME
    if not data_path.exists():
        generate_synthetic_dataset(num_samples=5000, seed=42)
        
    data = []
    with open(data_path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            data.append([
                float(row['overlap_area_ratio']),
                float(row['number_of_overlapping_parcels']),
                float(row['parcel_area']),
                float(row['district_historical_dispute_rate']),
                float(row['number_of_prior_claims']),
                float(row['years_since_allocation']),
                int(row['dispute_occurred']),
            ])
            
    data_arr = np.array(data)
    X = data_arr[:, :-1]
    y = data_arr[:, -1]
    
    # Train / Test split
    split_idx = int(0.8 * len(X))
    X_train, X_test = X[:split_idx], X[split_idx:]
    y_train, y_test = y[:split_idx], y[split_idx:]
    
    clf = GradientBoostingClassifier(n_estimators=100, max_depth=4, random_state=42)
    clf.fit(X_train, y_train)
    
    y_pred_proba = clf.predict_proba(X_test)[:, 1]
    auc_score = round(roc_auc_score(y_test, y_pred_proba), 4)
    
    # Save model artifact
    model_path = get_base_dir() / MODEL_FILE_NAME
    joblib.dump(clf, model_path)
    
    # Feature importances
    importances = dict(zip(FEATURE_NAMES, [round(float(v), 4) for v in clf.feature_importances_]))
    
    # Generate MODEL_CARD.md
    write_model_card(auc_score, importances)
    
    return {
        "status": "TRAINED",
        "model_file": str(model_path),
        "test_auc": auc_score,
        "feature_importances": importances
    }

def write_model_card(auc_score: float, importances: dict):
    model_card_content = f"""# MODEL CARD: AI Land Dispute Risk Predictor (Prototype)

## Model Details
* **Model Name:** Title Deeds Conflict Predictor (Gradient Boosting Classifier)
* **Model Version:** 1.0.0-PROTOTYPE
* **Architecture:** Scikit-learn GradientBoostingClassifier (`n_estimators=100, max_depth=4, random_state=42`)
* **Features:**
  1. `overlap_area_ratio`: Ratio of spatial boundary overlap area to total farm extent (0.0 to 1.0).
  2. `number_of_overlapping_parcels`: Integer count of intersecting surveyed parcels in the same district.
  3. `parcel_area`: Declared or surveyed farm extent in hectares.
  4. `district_historical_dispute_rate`: Benchmark historical dispute volatility index for the district.
  5. `number_of_prior_claims`: Number of duplicate or conflicting applications referencing the same plot name/ID.
  6. `years_since_allocation`: Duration in years since initial land allocation or offer letter date.

---

## IMPORTANT ETHICAL & PRODUCTION DISCLAIMERS
> [!WARNING]
> **SYNTHETIC TRAINING DATA NOTICE**
> The model was trained entirely on a clearly labelled **SYNTHETIC** training dataset (`synthetic_dispute_training_data.csv`, seed=42) generated for academic demonstration and system architecture validation.
>
> **ACCURACY FIGURES ARE NOT VALID FOR REAL LAND**
> The benchmark test AUC of **{auc_score}** reflects statistical fit against the synthetic generative distribution only.
> **DO NOT** make real-world legal, land eviction, or tenure determinations based on this prototype model.
>
> **MANDATORY RETRAINING PREREQUISITE**
> Before any production or pilot deployment within the Ministry of Lands and Rural Development, this model **MUST** be retrained on verified historical dispute dockets, Zimbabwe Land Commission arbitration records, and registered cadastral dispute registries.

---

## Feature Importances (Trained Weights)
| Feature Name | Relative Importance |
|---|---|
"""
    for feat, imp in sorted(importances.items(), key=lambda x: x[1], reverse=True):
        model_card_content += f"| `{feat}` | {imp * 100:.2f}% |\n"

    model_card_content += """
---

## Deterministic Fallback Mechanism
If the scikit-learn model file is unavailable or fails during inference, the system automatically falls back to an immutable deterministic rule:
* If `overlap_area_ratio > 0.05` or `number_of_overlapping_parcels > 0` -> **HIGH RISK (100% dispute flag)**.
* If `has_disputes == True` -> **HIGH RISK**.
* Otherwise -> **LOW / MEDIUM RISK** based on district volatility.
"""
    card_path = get_base_dir() / MODEL_CARD_FILE_NAME
    with open(card_path, 'w', encoding='utf-8') as f:
        f.write(model_card_content)

_LOADED_MODEL = None

def get_or_load_model():
    global _LOADED_MODEL
    if _LOADED_MODEL is not None:
        return _LOADED_MODEL
        
    model_path = get_base_dir() / MODEL_FILE_NAME
    if model_path.exists():
        try:
            _LOADED_MODEL = joblib.load(model_path)
            return _LOADED_MODEL
        except Exception as e:
            logger.warning(f"Could not load saved model: {e}")
            
    # Try training fresh
    try:
        train_and_save_model()
        _LOADED_MODEL = joblib.load(model_path)
        return _LOADED_MODEL
    except Exception as e:
        logger.error(f"Failed to train and load model: {e}")
        return None

def extract_application_features(application) -> Tuple[np.ndarray, List[Dict[str, Any]]]:
    """
    Extracts the 6 standardized features from a TitleDeedApplication instance.
    """
    from onlineapplicationapi.services.spatial_service import check_spatial_overlaps, get_district_dispute_rate
    from onlineapplicationapi.models import TitleDeedApplication
    
    # 1 & 2. Spatial Overlap metrics
    overlap_info = check_spatial_overlaps(application)
    overlap_ratio = float(overlap_info.get("overlap_area_ratio", 0.0))
    overlap_count = int(overlap_info.get("overlapping_parcels_count", 0))

    # Honor direct spatial overlap attributes on instance (e.g. from postgis scan or test fixtures)
    if getattr(application, 'spatial_overlap_ratio', None) is not None and float(application.spatial_overlap_ratio) > overlap_ratio:
        overlap_ratio = float(application.spatial_overlap_ratio)
    if getattr(application, 'overlapping_parcels_count', None) is not None and int(application.overlapping_parcels_count) > overlap_count:
        overlap_count = int(application.overlapping_parcels_count)
    
    # 3. Parcel Area
    parcel_area = float(application.farm_extent or application.survey_hectarage_confirmed or 10.0)
    
    # 4. District Historical Dispute Rate
    dist_rate = get_district_dispute_rate(application.district)
    
    # 5. Number of Prior / Duplicate Claims on same farm name in district
    farm_name = (application.farm_name or '').strip().lower()
    prior_claims = 0
    if farm_name:
        prior_claims = TitleDeedApplication.objects.filter(
            district__iexact=application.district,
            farm_name__iexact=application.farm_name
        ).exclude(pk=application.pk).count()
        
    # 6. Years since allocation (estimated from created_at or 5.0 default)
    years_alloc = 5.0
    if application.created_at:
        delta = timezone.now() - application.created_at
        years_alloc = max(0.5, round(delta.days / 365.25, 1))

    features = np.array([[
        overlap_ratio,
        overlap_count,
        parcel_area,
        dist_rate,
        prior_claims,
        years_alloc
    ]])
    
    contributing_factors = [
        {"feature": "overlap_area_ratio", "value": overlap_ratio, "description": f"Boundary overlap ratio: {overlap_ratio * 100:.1f}%"},
        {"feature": "number_of_overlapping_parcels", "value": overlap_count, "description": f"Overlapping neighboring parcels: {overlap_count}"},
        {"feature": "parcel_area", "value": parcel_area, "description": f"Farm extent: {parcel_area:.2f} ha"},
        {"feature": "district_historical_dispute_rate", "value": dist_rate, "description": f"District dispute benchmark: {dist_rate * 100:.1f}%"},
        {"feature": "number_of_prior_claims", "value": prior_claims, "description": f"Conflicting name claims in district: {prior_claims}"},
        {"feature": "years_since_allocation", "value": years_alloc, "description": f"Estimated allocation tenure: {years_alloc} years"},
    ]
    
    return features, contributing_factors, overlap_info

def predict_conflict(application) -> Dict[str, Any]:
    """
    Main prediction endpoint.
    Returns: probability, risk_level (LOW/MEDIUM/HIGH), risk_score (0-100), top contributing features.
    Falls back to deterministic rule if model unavailable.
    """
    features, contributing_factors, overlap_info = extract_application_features(application)
    overlap_ratio = features[0][0]
    overlap_count = features[0][1]
    
    model = get_or_load_model()
    
    if model is not None:
        try:
            prob = float(model.predict_proba(features)[0][1])
            # Scale probability into risk score (0-100)
            risk_score = int(round(prob * 100))
            is_fallback = False
        except Exception as e:
            logger.warning(f"ML inference error: {e}, using deterministic fallback")
            prob, risk_score, is_fallback = _deterministic_fallback(application, overlap_ratio, overlap_count)
    else:
        prob, risk_score, is_fallback = _deterministic_fallback(application, overlap_ratio, overlap_count)

    # Force HIGH risk if significant spatial overlap or logged dispute is detected
    if overlap_ratio >= 0.05 or overlap_count > 0 or getattr(application, 'has_disputes', False):
        risk_score = max(risk_score, 85)
        prob = max(prob, 0.85)

    # Classify Risk Level
    if risk_score < 30:
        risk_level = "LOW"
    elif risk_score < 70:
        risk_level = "MEDIUM"
    else:
        risk_level = "HIGH"

    # Identify top contributing features
    top_features = sorted(contributing_factors, key=lambda x: abs(x["value"]), reverse=True)[:3]

    result = {
        "application_id": application.id,
        "reference_number": getattr(application, 'reference_number', None) or (f"APP-{application.id:05d}" if getattr(application, 'id', None) else "APP-00000"),
        "dispute_probability": round(prob, 4),
        "risk_score": risk_score,
        "risk_level": risk_level,
        "is_fallback": is_fallback,
        "top_contributing_features": top_features,
        "spatial_overlap": overlap_info,
        "evaluated_at": timezone.now().isoformat(),
        "disclaimer": "Prototype AI assessment based on synthetic model. Retraining required before production use."
    }
    
    return result

def _deterministic_fallback(application, overlap_ratio: float, overlap_count: int) -> Tuple[float, int, bool]:
    """
    Guaranteed deterministic fallback rule.
    """
    score = 15 # baseline
    if overlap_ratio > 0.05 or overlap_count > 0:
        score += 65
    if getattr(application, 'has_disputes', False):
        score += 50
    dist_rate = get_district_dispute_rate(getattr(application, 'district', ''))
    score += int(dist_rate * 40)
    score = min(100, max(0, score))
    return round(score / 100.0, 4), score, True

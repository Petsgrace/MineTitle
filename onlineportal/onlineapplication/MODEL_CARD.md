# MODEL CARD: AI Land Dispute Risk Predictor (Prototype)

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
> The benchmark test AUC of **0.9** reflects statistical fit against the synthetic generative distribution only.
> **DO NOT** make real-world legal, land eviction, or tenure determinations based on this prototype model.
>
> **MANDATORY RETRAINING PREREQUISITE**
> Before any production or pilot deployment within the Ministry of Lands and Rural Development, this model **MUST** be retrained on verified historical dispute dockets, Zimbabwe Land Commission arbitration records, and registered cadastral dispute registries.

---

## Feature Importances (Trained Weights)
| Feature Name | Relative Importance |
|---|---|
| `overlap_area_ratio` | 62.40% |
| `number_of_prior_claims` | 25.16% |
| `years_since_allocation` | 4.28% |
| `parcel_area` | 3.77% |
| `number_of_overlapping_parcels` | 3.19% |
| `district_historical_dispute_rate` | 1.19% |

---

## Deterministic Fallback Mechanism
If the scikit-learn model file is unavailable or fails during inference, the system automatically falls back to an immutable deterministic rule:
* If `overlap_area_ratio > 0.05` or `number_of_overlapping_parcels > 0` -> **HIGH RISK (100% dispute flag)**.
* If `has_disputes == True` -> **HIGH RISK**.
* Otherwise -> **LOW / MEDIUM RISK** based on district volatility.

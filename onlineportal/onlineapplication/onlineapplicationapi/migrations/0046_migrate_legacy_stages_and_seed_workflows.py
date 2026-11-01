# Generated data migration to normalize legacy application statuses and seed workflow transitions

from django.db import migrations

def migrate_legacy_statuses_and_seed_workflow(apps, schema_editor):
    TitleDeedApplication = apps.get_model('onlineapplicationapi', 'TitleDeedApplication')
    WorkflowTransition = apps.get_model('onlineapplicationapi', 'WorkflowTransition')
    StageSLA = apps.get_model('onlineapplicationapi', 'StageSLA')
    SurveyTariff = apps.get_model('onlineapplicationapi', 'SurveyTariff')
    ValuationTariff = apps.get_model('onlineapplicationapi', 'ValuationTariff')

    # Status conversion dictionary
    STATUS_MAP = {
        'SUBMITTED': 'PENDING',
        'PENDING': 'PENDING',
        'REFERRED': 'RESETTLEMENT_VERIFIED',
        'QUERIED': 'PENDING',
        'RESUBMITTED': 'PENDING',
        'ACCOUNTS_VERIFIED': 'RESETTLEMENT_VERIFIED',
        'ESTATES_VERIFIED': 'RESETTLEMENT_VERIFIED',
        'RESETTLEMENT_VERIFIED': 'RESETTLEMENT_VERIFIED',
        'LIMS_VERIFIED': 'LIMS_VERIFIED',
        'VERIFIED': 'LIMS_VERIFIED',
        'ZLC_VERIFIED': 'ZLC_CLEARED',
        'ZLC_CLEARED': 'ZLC_CLEARED',
        'GIS_VALIDATED': 'GIS_VALIDATED',
        'AWAITING_SURVEY_FEE': 'GIS_VALIDATED',
        'SURVEY_FEE_PAID': 'GIS_VALIDATED',
        'SURVEYED': 'SURVEYED',
        'VALUATED': 'VALUATED',
        'AWAITING_PAYMENT': 'VALUATED',
        'SELECT_PAYMENT': 'VALUATED',
        'AGREEMENT_OF_SALE': 'VALUATED',
        'PAYMENT_VERIFIED': 'APPROVED',
        'APPROVED': 'APPROVED',
        'DEED_ENGROSSED': 'READY_FOR_COLLECTION',
        'READY_FOR_COLLECTION': 'READY_FOR_COLLECTION',
        'COMPLETED': 'READY_FOR_COLLECTION',
        'REJECTED': 'PENDING',
    }

    # Normalize existing applications
    for app in TitleDeedApplication.objects.all():
        old_st = app.status or 'PENDING'
        new_st = STATUS_MAP.get(old_st, 'PENDING')
        app.status = new_st
        if not app.reference_number:
            app.reference_number = f"TD-2026-{app.pk:05d}"
        app.save()

    # Seed Stage SLAs
    SLAS = [
        ('PENDING', 'Applicant Submission', 3, 'applications@lands.gov.zw'),
        ('RESETTLEMENT_VERIFIED', 'Resettlement Department', 5, 'resettlement@lands.gov.zw'),
        ('LIMS_VERIFIED', 'Land Information Management System', 5, 'lims@lands.gov.zw'),
        ('ZLC_CLEARED', 'Zimbabwe Land Commission', 7, 'clearance@zlc.gov.zw'),
        ('GIS_VALIDATED', 'National GIS Directorate', 4, 'gis@lands.gov.zw'),
        ('SURVEYED', 'Surveyor General Department', 10, 'surveys@lands.gov.zw'),
        ('VALUATED', 'Valuations Directorate', 5, 'valuations@lands.gov.zw'),
        ('APPROVED', 'Director of Lands Executive', 5, 'director@lands.gov.zw'),
        ('READY_FOR_COLLECTION', 'Deeds Registry Department', 3, 'deeds@justice.gov.zw'),
    ]
    for stage, dept, days, email in SLAS:
        StageSLA.objects.update_or_create(
            stage=stage,
            defaults={'department_name': dept, 'sla_days': days, 'notification_email': email}
        )

    # Seed 9-Stage Workflow Transitions (Forward and Return)
    TRANSITIONS = [
        # Forward Transitions
        ('PENDING', 'RESETTLEMENT_VERIFIED', 'resettlement', False, True, 'Verify allocation documents, spouse & deceased-estate checklist', 5),
        ('RESETTLEMENT_VERIFIED', 'LIMS_VERIFIED', 'lims', False, True, 'Verify cadastral ID and statutory fee payment', 5),
        ('LIMS_VERIFIED', 'ZLC_CLEARED', 'zlc', False, True, 'Resolve disputes and sign off land commission clearance', 7),
        ('ZLC_CLEARED', 'GIS_VALIDATED', 'gis', False, True, 'Verify spatial parcel boundaries and conflict risk review', 4),
        ('GIS_VALIDATED', 'SURVEYED', 'surveyor', False, True, 'Cadastral survey approval and survey fee invoice', 10),
        ('SURVEYED', 'VALUATED', 'valuation', False, True, 'Standard valuation by region, land class and improvements', 5),
        ('VALUATED', 'APPROVED', 'director', False, True, 'Ministerial executive title deed sign-off', 5),
        ('APPROVED', 'READY_FOR_COLLECTION', 'deeds', False, True, 'Deed registration, sealing, and issuance for collection', 3),

        # Return Transitions (Mandatory comment required)
        ('RESETTLEMENT_VERIFIED', 'PENDING', 'resettlement', True, True, 'Return to applicant for documentation amendment', 3),
        ('LIMS_VERIFIED', 'RESETTLEMENT_VERIFIED', 'lims', True, True, 'Return to Resettlement for allocation clarification', 3),
        ('ZLC_CLEARED', 'LIMS_VERIFIED', 'zlc', True, True, 'Return to LIMS for parcel identification correction', 3),
        ('GIS_VALIDATED', 'ZLC_CLEARED', 'gis', True, True, 'Return to ZLC due to contested spatial boundaries', 3),
        ('SURVEYED', 'GIS_VALIDATED', 'surveyor', True, True, 'Return to GIS for beacon and coordinate alignment', 3),
        ('VALUATED', 'SURVEYED', 'valuation', True, True, 'Return to Surveyor General for area recalculation', 3),
        ('APPROVED', 'VALUATED', 'director', True, True, 'Return to Valuation for assessment review', 3),
        ('READY_FOR_COLLECTION', 'APPROVED', 'deeds', True, True, 'Return to Director for signature clarification', 3),
    ]

    for f_st, t_st, role, is_ret, req_comm, desc, sla in TRANSITIONS:
        WorkflowTransition.objects.update_or_create(
            from_stage=f_st,
            to_stage=t_st,
            allowed_role=role,
            defaults={
                'is_return': is_ret,
                'requires_comment': req_comm,
                'description': desc,
                'sla_days': sla
            }
        )

    # Seed Survey Tariffs
    SURVEY_DATA = [
        (0.00, 5.00, 150.00, 0.00, 'Smallholder A1 / Peri-urban parcel up to 5 ha'),
        (5.01, 20.00, 250.00, 15.00, 'Medium farm plot 5-20 ha'),
        (20.01, 100.00, 500.00, 10.00, 'Commercial farm 20-100 ha'),
        (100.01, 1000.00, 1200.00, 5.00, 'Large agricultural holding 100-1000 ha'),
    ]
    for min_a, max_a, base_f, per_ha, desc in SURVEY_DATA:
        SurveyTariff.objects.update_or_create(
            min_area_ha=min_a,
            max_area_ha=max_a,
            defaults={'base_fee_usd': base_f, 'per_hectare_rate_usd': per_ha, 'description': desc}
        )

    # Seed Valuation Tariffs
    VALUATION_DATA = [
        ('Region I', 'A1', 450.00, 'High rainfall intensive agriculture A1'),
        ('Region I', 'A2', 650.00, 'High rainfall commercial A2'),
        ('Region II', 'A1', 350.00, 'Intensive cropping zone A1'),
        ('Region II', 'A2', 500.00, 'Intensive cropping zone A2'),
        ('Region III', 'A1', 250.00, 'Semi-intensive farming A1'),
        ('Region III', 'A2', 380.00, 'Semi-intensive farming A2'),
        ('Region IV', 'A1', 180.00, 'Semi-extensive livestock/cropping A1'),
        ('Region IV', 'A2', 260.00, 'Semi-extensive livestock/cropping A2'),
        ('Region V', 'A1', 120.00, 'Extensive ranching zone A1'),
        ('Region V', 'A2', 180.00, 'Extensive ranching zone A2'),
    ]
    for reg, l_class, rate, desc in VALUATION_DATA:
        ValuationTariff.objects.update_or_create(
            region=reg,
            land_class=l_class,
            defaults={'base_rate_per_ha_usd': rate, 'description': desc}
        )

def reverse_migration(apps, schema_editor):
    pass

class Migration(migrations.Migration):

    dependencies = [
        ('onlineapplicationapi', '0045_stagesla_surveytariff_valuationtariff_and_more'),
    ]

    operations = [
        migrations.RunPython(migrate_legacy_statuses_and_seed_workflow, reverse_migration),
    ]

"""
Reporting and Analytics Engine for Title Deeds Processing.
Provides aggregates: applications per stage, average days per stage, overdue applications,
bottleneck stage, conflict risk distribution, fees collected, province/district breakdown,
and CSV/PDF exports via reportlab.
"""
import io
import csv
from datetime import timedelta
from typing import Dict, Any, List
from django.utils import timezone
from django.db.models import Count, Sum, Avg, F
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle

def get_analytics_summary() -> Dict[str, Any]:
    from onlineapplicationapi.models import TitleDeedApplication, APPLICATION_STAGES
    from onlineapplicationapi.constants import STAGE_SEQUENCE

    total_apps = TitleDeedApplication.objects.count()
    
    # 1. Applications per Stage
    stage_counts_qs = TitleDeedApplication.objects.values('status').annotate(count=Count('id'))
    stage_counts_map = {item['status']: item['count'] for item in stage_counts_qs}
    stage_breakdown = [
        {"stage": st_key, "label": st_label, "count": stage_counts_map.get(st_key, 0)}
        for st_key, st_label in APPLICATION_STAGES
    ]

    # 2. Average Days per Stage & Bottleneck Identification
    # Estimated from active stage entered_at vs now
    now = timezone.now()
    stage_durations = {}
    for st_key in STAGE_SEQUENCE:
        apps_in_stage = TitleDeedApplication.objects.filter(status=st_key)
        count = apps_in_stage.count()
        if count > 0:
            total_days = 0.0
            for app in apps_in_stage:
                entered = app.current_stage_entered_at or app.created_at
                if entered:
                    total_days += max(0.1, (now - entered).total_seconds() / 86400.0)
            avg_days = round(total_days / count, 1)
        else:
            avg_days = 0.0
        stage_durations[st_key] = avg_days

    # Bottleneck stage (stage with highest average dwell time)
    bottleneck_stage = max(stage_durations.items(), key=lambda x: x[1])[0] if stage_durations else "PENDING"
    bottleneck_avg_days = stage_durations.get(bottleneck_stage, 0.0)

    # 3. Overdue Applications
    overdue_qs = TitleDeedApplication.objects.filter(is_overdue=True)
    overdue_count = overdue_qs.count()
    overdue_list = [
        {
            "id": app.id,
            "reference_number": app.reference_number or f"APP-{app.id:05d}",
            "farm_name": app.farm_name,
            "district": app.district,
            "status": app.status,
            "due_date": app.current_stage_due_date.isoformat() if app.current_stage_due_date else None,
        }
        for app in overdue_qs[:20]
    ]

    # 4. Conflict Risk Distribution
    risk_qs = TitleDeedApplication.objects.values('ai_conflict_level').annotate(count=Count('id'))
    risk_map = {item['ai_conflict_level']: item['count'] for item in risk_qs}
    conflict_distribution = {
        "LOW": risk_map.get("LOW", 0),
        "MEDIUM": risk_map.get("MEDIUM", 0),
        "HIGH": risk_map.get("HIGH", 0),
    }

    # 5. Financial Fees Collected
    fee_agg = TitleDeedApplication.objects.aggregate(
        total_survey=Sum('survey_fee'),
        total_valuation=Sum('valuation_amount')
    )
    total_survey_fees = float(fee_agg['total_survey'] or 0.0)
    total_valuation_fees = float(fee_agg['total_valuation'] or 0.0)
    total_statutory_fees = float(TitleDeedApplication.objects.filter(statutory_fee_paid=True).count() * 50.0)

    # 6. Applications by Province & District
    province_breakdown = list(
        TitleDeedApplication.objects.values('province').annotate(count=Count('id')).order_by('-count')
    )
    district_breakdown = list(
        TitleDeedApplication.objects.values('district').annotate(count=Count('id')).order_by('-count')[:15]
    )

    return {
        "total_applications": total_apps,
        "stage_breakdown": stage_breakdown,
        "stage_durations_avg_days": stage_durations,
        "bottleneck_stage": bottleneck_stage,
        "bottleneck_avg_days": bottleneck_avg_days,
        "overdue_count": overdue_count,
        "overdue_applications": overdue_list,
        "conflict_distribution": conflict_distribution,
        "financials": {
            "total_survey_fees": total_survey_fees,
            "total_valuation_amount": total_valuation_fees,
            "total_statutory_application_fees": total_statutory_fees,
            "grand_total_revenue": total_survey_fees + total_statutory_fees,
        },
        "province_breakdown": province_breakdown,
        "district_breakdown": district_breakdown,
        "generated_at": now.isoformat(),
    }

def generate_csv_report() -> str:
    """Generates standard CSV export of all applications."""
    from onlineapplicationapi.models import TitleDeedApplication
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Reference Number", "Applicant Name", "National ID", "Farm Name",
        "Province", "District", "Hectares", "Current Stage", "Overdue",
        "Due Date", "Survey Fee ($)", "Valuation Amount ($)", "AI Risk Level"
    ])
    for app in TitleDeedApplication.objects.all().order_by('id'):
        nat_id = app.get_applicant_national_id()
        name = ""
        if app.farmer:
            name = f"{app.farmer.first_name} {app.farmer.surname}"
        elif app.walk_in_citizen_name:
            name = app.walk_in_citizen_name
            
        writer.writerow([
            app.reference_number or f"APP-{app.id:05d}",
            name,
            nat_id,
            app.farm_name,
            app.province,
            app.district,
            float(app.farm_extent or 0.0),
            app.status,
            "YES" if app.is_overdue else "NO",
            app.current_stage_due_date.strftime('%Y-%m-%d') if app.current_stage_due_date else "N/A",
            float(app.survey_fee or 0.0),
            float(app.valuation_amount or 0.0),
            app.ai_conflict_level
        ])
    return output.getvalue()

def generate_pdf_report() -> bytes:
    """Generates official executive summary PDF report using reportlab."""
    summary = get_analytics_summary()
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=letter, rightMargin=36, leftMargin=36, topMargin=36, bottomMargin=36)
    elements = []
    styles = getSampleStyleSheet()

    # Title Banner
    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Heading1'],
        fontSize=18,
        leading=22,
        textColor=colors.HexColor('#047857'),
        alignment=1
    )
    sub_style = ParagraphStyle(
        'DocSub',
        parent=styles['Normal'],
        fontSize=10,
        leading=14,
        textColor=colors.HexColor('#475569'),
        alignment=1
    )
    elements.append(Paragraph("MINISTRY OF LANDS AND RURAL DEVELOPMENT", title_style))
    elements.append(Paragraph("TITLE DEEDS ONE STOP CENTER & LAND HARMONY", sub_style))
    elements.append(Paragraph("Executive Operational & Workflow Analytics Report", styles['Heading3']))
    elements.append(Spacer(1, 12))

    # Executive Summary Key Metrics Table
    data = [
        ["Total Applications", str(summary['total_applications']), "Bottleneck Stage", f"{summary['bottleneck_stage']} ({summary['bottleneck_avg_days']}d)"],
        ["Overdue Applications", str(summary['overdue_count']), "Statutory Fees Collected", f"${summary['financials']['total_statutory_application_fees']:,.2f}"],
        ["High Risk Conflict Plots", str(summary['conflict_distribution']['HIGH']), "Survey Fees Billed", f"${summary['financials']['total_survey_fees']:,.2f}"],
    ]
    t = Table(data, colWidths=[140, 120, 150, 130])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#F8FAFC')),
        ('TEXTCOLOR', (0,0), (-1,-1), colors.HexColor('#0F172A')),
        ('FONTNAME', (0,0), (-1,-1), 'Helvetica-Bold'),
        ('BOTTOMPADDING', (0,0), (-1,-1), 6),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#CBD5E1')),
    ]))
    elements.append(t)
    elements.append(Spacer(1, 14))

    # Stage Breakdown Table
    elements.append(Paragraph("Departmental Queue Distribution", styles['Heading4']))
    stage_data = [["Stage Index & Name", "Active Queue Count", "Avg Dwell Time"]]
    for item in summary['stage_breakdown']:
        avg_d = summary['stage_durations_avg_days'].get(item['stage'], 0.0)
        stage_data.append([item['label'], str(item['count']), f"{avg_d} days"])
    st_table = Table(stage_data, colWidths=[320, 110, 110])
    st_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#047857')),
        ('TEXTCOLOR', (0,0), (-1,0), colors.white),
        ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#CBD5E1')),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, colors.HexColor('#F1F5F9')]),
    ]))
    elements.append(st_table)

    doc.build(elements)
    buffer.seek(0)
    return buffer.getvalue()

"""
Export Jacobi probe results as PDF, CSV, or JSON.
"""

import csv
import io
import json
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
)

router = APIRouter(prefix="/api/export")


def _sanitize_report(report: dict) -> dict:
    """Prepare report data for export (remove unnecessary fields)."""
    return {
        "session_id": report.get("session_id"),
        "target_name": report.get("target_name"),
        "target_url": report.get("target_url"),
        "timestamp": report.get("timestamp"),
        "baseline_price": report.get("baseline_price"),
        "max_price_spread": report.get("max_price_spread"),
        "max_price_spread_pct": report.get("max_price_spread_pct"),
        "topology_class": report.get("topology_class"),
        "discrimination_index": report.get("discrimination_index"),
        "discrimination_score": report.get("discrimination_score", 0),
        "gradients": report.get("gradients", []),
        "agents": [
            {
                "agent_id": a.get("agent_id"),
                "price": a.get("price"),
                "status": a.get("status"),
                "location": a.get("variables", {}).get("location"),
                "device": a.get("variables", {}).get("device"),
                "cookie": a.get("variables", {}).get("cookie"),
                "referrer": a.get("variables", {}).get("referrer"),
            }
            for a in report.get("agents", [])
        ],
    }


def _get_report(report_id: str) -> dict:
    """Get report from session store or demo data."""
    if report_id == "demo_session_static":
        from main import DEMO_RESULT
        return DEMO_RESULT
    from main import SESSION_STORE
    report = SESSION_STORE.get(report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    return report


@router.get("/{report_id}/json")
async def export_json(report_id: str):
    """Export as JSON file."""
    report = _get_report(report_id)
    data = _sanitize_report(report)
    json_bytes = json.dumps(data, indent=2, default=str).encode("utf-8")
    return StreamingResponse(
        io.BytesIO(json_bytes),
        media_type="application/json",
        headers={
            "Content-Disposition": f'attachment; filename="jacobi-probe-{report_id}.json"'
        },
    )


@router.get("/{report_id}/csv")
async def export_csv(report_id: str):
    """Export agent prices as CSV."""
    report = _get_report(report_id)
    data = _sanitize_report(report)

    output = io.StringIO()
    writer = csv.writer(output)

    # Header
    writer.writerow(["Agent ID", "Status", "Price", "Location", "Device", "Cookie", "Referrer"])

    # Rows
    for agent in data.get("agents", []):
        writer.writerow([
            agent.get("agent_id"),
            agent.get("status"),
            agent.get("price", ""),
            agent.get("location", ""),
            agent.get("device", ""),
            agent.get("cookie", ""),
            agent.get("referrer", ""),
        ])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="jacobi-probe-{report_id}.csv"'
        },
    )


@router.get("/{report_id}/pdf")
async def export_pdf(report_id: str):
    """Export as PDF report."""
    report = _get_report(report_id)
    data = _sanitize_report(report)

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=letter)
    styles = getSampleStyleSheet()

    story = []

    # Title
    title_style = ParagraphStyle(
        "JacobiTitle", parent=styles["Title"],
        fontSize=20, spaceAfter=6
    )
    story.append(Paragraph("JACOBI — Pricing Probe Report", title_style))
    story.append(Paragraph(
        f"Target: {data.get('target_name', 'Unknown')}",
        styles["Normal"]
    ))
    story.append(Spacer(1, 12))

    # Summary table
    summary_data = [
        ["Metric", "Value"],
        ["Baseline Price", f"${data.get('baseline_price', 0):.2f}"],
        ["Price Spread", f"${data.get('max_price_spread', 0):.2f}"],
        ["Spread (%)", f"{data.get('max_price_spread_pct', 0):.1f}%"],
        ["Topology", data.get('topology_class', 'unknown').upper()],
        ["Discrimination Index", f"${data.get('discrimination_index', 0):.2f}"],
        ["Discrimination Score", f"{data.get('discrimination_score', 0)}/100"],
    ]

    summary_table = Table(summary_data, colWidths=[200, 200])
    summary_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1a1a2e")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, 0), 10),
        ("FONTSIZE", (0, 1), (-1, -1), 9),
        ("ALIGN", (1, 1), (1, -1), "RIGHT"),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cccccc")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.HexColor("#f8f8f8"), colors.white]),
    ]))
    story.append(summary_table)
    story.append(Spacer(1, 20))

    # Gradients
    if data.get("gradients"):
        story.append(Paragraph("Pricing Gradients", styles["Heading2"]))
        grad_data = [["Factor", "High", "Low", "Delta", "Significant"]]
        for g in data["gradients"]:
            grad_data.append([
                g.get("variable_name", ""),
                f"${g.get('mean_price_high', 0):.2f}",
                f"${g.get('mean_price_low', 0):.2f}",
                f"${g.get('delta', 0):+.2f}",
                "Yes" if g.get("significant") else "No",
            ])

        grad_table = Table(grad_data, colWidths=[100, 80, 80, 80, 80])
        grad_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1a1a2e")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cccccc")),
        ]))
        story.append(grad_table)
        story.append(Spacer(1, 20))

    # Footer
    story.append(Spacer(1, 30))
    story.append(Paragraph(
        f"Generated by Jacobi — {datetime.now().strftime('%Y-%m-%d %H:%M')}",
        ParagraphStyle("Footer", parent=styles["Normal"], fontSize=8, textColor=colors.gray)
    ))

    doc.build(story)
    buf.seek(0)

    return StreamingResponse(
        buf,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="jacobi-probe-{report_id}.pdf"'
        },
    )

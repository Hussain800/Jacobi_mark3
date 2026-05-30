"""
Export Jacobi probe results as PDF, CSV, or JSON.
"""

import csv
import io
import json
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
)

from auth_user import get_optional_user
from profile_store import get_tier

router = APIRouter(prefix="/api/export")


async def _require_pro(user=Depends(get_optional_user)):
    """Gate dependency: exports are Pro-only."""
    if not user:
        raise HTTPException(
            status_code=401,
            detail={"error": "auth_required", "message": "Sign in to export reports."},
        )
    tier = await get_tier(user["id"])
    if tier != "pro":
        raise HTTPException(
            status_code=402,
            detail={
                "error": "pro_required",
                "message": "Exports are a Pro feature. Upgrade at /pricing to download PDF/CSV/JSON reports.",
            },
        )
    return user


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
async def export_json(report_id: str, _: dict = Depends(_require_pro)):
    """Export as JSON file. Pro-only."""
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
async def export_csv(report_id: str, _: dict = Depends(_require_pro)):
    """Export agent prices as CSV. Pro-only."""
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
async def export_pdf(report_id: str, _: dict = Depends(_require_pro)):
    """Export as professionally designed PDF report."""
    report = _get_report(report_id)
    data = _sanitize_report(report)

    buf = io.BytesIO()
    PAGE_W, PAGE_H = letter  # 612 x 792
    doc = SimpleDocTemplate(
        buf, pagesize=letter,
        leftMargin=42, rightMargin=42, topMargin=36, bottomMargin=36,
    )

    # ── Brand Colors ──
    JACOBI_GREEN = colors.HexColor("#00d992")
    DARK_NAVY = colors.HexColor("#0f1123")
    CARD_BG = colors.HexColor("#f8f9fc")
    WHITE = colors.white
    GRAY_TEXT = colors.HexColor("#6b7280")
    BORDER = colors.HexColor("#e5e7eb")
    RED = colors.HexColor("#f87171")
    AMBER = colors.HexColor("#facc15")
    ORANGE = colors.HexColor("#fb923c")
    BLUE_ACCENT = colors.HexColor("#60a5fa")

    TOPOLOGY_COLORS = {
        "uniform": JACOBI_GREEN,
        "selective": AMBER,
        "progressive": ORANGE,
        "aggressive": RED,
    }

    # ── Styles ──
    styles = getSampleStyleSheet()

    def _make_style(name, **kw):
        base = styles["Normal"]
        return ParagraphStyle(name, parent=base, **kw)

    s_title = _make_style("JT", fontSize=22, fontName="Helvetica-Bold", textColor=DARK_NAVY, spaceAfter=2)
    s_subtitle = _make_style("JS", fontSize=10, textColor=GRAY_TEXT, spaceAfter=16)
    s_h2 = _make_style("JH2", fontSize=13, fontName="Helvetica-Bold", textColor=DARK_NAVY, spaceBefore=18, spaceAfter=8)
    s_label = _make_style("JLabel", fontSize=9, textColor=GRAY_TEXT, fontName="Helvetica")
    s_value = _make_style("JValue", fontSize=13, fontName="Helvetica-Bold", textColor=DARK_NAVY)
    s_value_green = _make_style("JVG", fontSize=13, fontName="Helvetica-Bold", textColor=JACOBI_GREEN)
    s_badge = _make_style("JBadge", fontSize=9, fontName="Helvetica-Bold", textColor=WHITE)
    s_body = _make_style("JBody", fontSize=9, textColor=colors.HexColor("#374151"), leading=13)
    s_small = _make_style("JSmall", fontSize=7, textColor=GRAY_TEXT)
    s_footer = _make_style("JFooter", fontSize=7, textColor=GRAY_TEXT, alignment=1)

    story = []

    # ══════════════════════════════════════════════
    # HEADER
    # ══════════════════════════════════════════════
    topo = (data.get("topology_class") or "unknown").lower()
    topo_color = TOPOLOGY_COLORS.get(topo, BLUE_ACCENT)
    spread_pct = data.get("max_price_spread_pct", 0) or 0

    # Title row: [JACOBI badge]  [topology badge]
    header_data = [[
        Paragraph("<b>JACOBI</b> <font color='#6b7280'>Pricing Probe Report</font>", s_title),
        Paragraph(
            f'<font size="10">{topo.upper()}</font>',
            ParagraphStyle("BadgeStyle", parent=s_badge, fontSize=10, backColor=topo_color,
                           borderPadding=6, borderRadius=4, spaceBefore=4)
        ),
    ]]
    header_table = Table(header_data, colWidths=[PAGE_W - 150, 100])
    header_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ALIGN", (1, 0), (1, 0), "RIGHT"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
    ]))
    story.append(header_table)

    # Target URL
    story.append(Paragraph(
        f"<font size='8' color='#9ca3af'>{data.get('target_url', '')[:100]}</font>",
        s_small
    ))
    story.append(Spacer(1, 14))

    # ══════════════════════════════════════════════
    # KEY METRICS — 3-column card layout
    # ══════════════════════════════════════════════
    bp = data.get("baseline_price", 0) or 0
    spread = data.get("max_price_spread", 0) or 0
    score = data.get("discrimination_score", 0) or 0

    metrics = [
        ("BASELINE PRICE", f"${bp:,.2f}", JACOBI_GREEN),
        ("PRICE SPREAD", f"${spread:,.2f} ({spread_pct:.1f}%)", RED if spread > 0 else GRAY_TEXT),
        ("DISCRIMINATION", f"{score:.0f}/100", RED if score > 50 else (AMBER if score > 20 else JACOBI_GREEN)),
    ]

    card_w = (PAGE_W - 84) / 3 - 8
    metric_cards = []
    for label, val, color in metrics:
        card = Table([
            [Paragraph(f"<font size='7' color='#6b7280'>{label}</font>", s_small)],
            [Paragraph(f"<font size='16' color='{color}'>{val}</font>",
                        _make_style("MV", fontSize=16, fontName="Helvetica-Bold", textColor=color))],
        ], colWidths=[card_w])
        card.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), CARD_BG),
            ("TOPPADDING", (0, 0), (-1, -1), 10),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
            ("LEFTPADDING", (0, 0), (-1, -1), 12),
            ("RIGHTPADDING", (0, 0), (-1, -1), 12),
            ("ROUNDEDCORNERS", [4, 4, 4, 4]),
        ]))
        metric_cards.append(card)

    # Space cards evenly
    card_row = Table([metric_cards], colWidths=[card_w + 4, card_w + 4, card_w + 4])
    card_row.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(card_row)
    story.append(Spacer(1, 14))

    # ══════════════════════════════════════════════
    # PRICE RANGE BAR
    # ══════════════════════════════════════════════
    price_range = data.get("price_range") or report.get("price_range")
    if price_range and len(price_range) == 2 and price_range[1] > 0:
        story.append(Paragraph("PRICE RANGE", s_h2))
        rmin, rmax = price_range[0], price_range[1]
        span = rmax - rmin if rmax > rmin else 1

        bar_w = PAGE_W - 84
        bar_data = [[Table([
            [Paragraph(f"<font size='7'>${rmin:,.2f}</font>", s_small),
             Paragraph(f"<font size='7' color='#6b7280'>BASELINE ${bp:,.2f}</font>",
                       ParagraphStyle("X", parent=s_small, fontSize=7, textColor=GRAY_TEXT, alignment=1)),
             Paragraph(f"<font size='7'>${rmax:,.2f}</font>", s_small)],
        ], colWidths=[bar_w * 0.25, bar_w * 0.5, bar_w * 0.25])]]
        bar_table = Table(bar_data, colWidths=[bar_w])
        bar_table.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("ALIGN", (0, 0), (0, 0), "LEFT"),
            ("ALIGN", (1, 0), (1, 0), "CENTER"),
            ("ALIGN", (2, 0), (2, 0), "RIGHT"),
        ]))
        story.append(bar_table)

        # Draw the actual bar
        bp_frac = ((bp - rmin) / span) if span > 0 else 0.5
        bp_pos = bar_w * bp_frac

        bar_viz = Table([[
            Paragraph(
                f'<font size="1"> </font>',
                ParagraphStyle("Bar", fontSize=1, backColor=JACOBI_GREEN,
                               borderPadding=0, leading=1)
            )
        ]], colWidths=[bar_w], rowHeights=[6])
        bar_viz.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#e5e7eb")),
            ("LINEBELOW", (0, 0), (-1, -1), 0, WHITE),
        ]))
        story.append(bar_viz)
        story.append(Spacer(1, 8))

    # ══════════════════════════════════════════════
    # TOPOLOGY EXPLAINER
    # ══════════════════════════════════════════════
    topo_labels = {
        "uniform": "No significant price discrimination detected across all 24 agent identities.",
        "selective": "Mild discrimination detected — 1-2 variables show small price differences.",
        "progressive": "Significant discrimination — 2-3 variables show meaningful price gaps.",
        "aggressive": "Systematic price discrimination — 3+ variables show large, consistent price gaps.",
    }
    topo_explain = topo_labels.get(topo, "Analysis pending.")
    story.append(Paragraph(
        f'<font size="9" color="{topo_color}"><b>{topo.upper()}:</b></font> '
        f'<font size="9" color="#374151">{topo_explain}</font>',
        _make_style("TX", fontSize=9, leading=13)
    ))
    story.append(Spacer(1, 10))

    # ══════════════════════════════════════════════
    # GRADIENTS
    # ══════════════════════════════════════════════
    gradients = data.get("gradients", [])
    if gradients:
        story.append(Paragraph("VARIABLE IMPACT ANALYSIS", s_h2))

        for g in gradients:
            var_name = g.get("variable_name", "").replace("_", " ").title()
            delta = g.get("delta", 0)
            delta_pct = g.get("delta_pct", 0)
            sig = g.get("significant", False)
            high_label = g.get("state_high", "High")
            low_label = g.get("state_low", "Low")

            # Gradient row: label | bar | delta
            max_delta = max(abs(g.get("delta", 0)) for g in gradients) if gradients else 1
            bar_frac = min(abs(delta) / max_delta, 1.0) if max_delta > 0 else 0
            bar_color = RED if sig else GRAY_TEXT

            grad_row = Table([[
                Paragraph(f"<font size='8'><b>{var_name}</b></font>", s_body),
                Paragraph(f"<font size='7' color='#6b7280'>{low_label} → {high_label}</font>",
                          _make_style("GL", fontSize=7, textColor=GRAY_TEXT)),
                Paragraph(
                    f"<font size='8' color='{bar_color}'><b>${delta:+,.2f}</b> ({delta_pct:+.0f}%)</font>",
                    _make_style("GV", fontSize=8, fontName="Helvetica-Bold", textColor=bar_color, alignment=2)
                ),
            ]], colWidths=[90, (PAGE_W - 84 - 90 - 100), 100])

            grad_row.setStyle(TableStyle([
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("TOPPADDING", (0, 0), (-1, -1), 3),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
                ("LINEBELOW", (0, 0), (-1, -1), 0.5, BORDER),
            ]))
            story.append(grad_row)

    # ══════════════════════════════════════════════
    # AGENT SUMMARY (compact)
    # ══════════════════════════════════════════════
    agents = data.get("agents", [])
    if agents:
        story.append(Spacer(1, 6))
        story.append(Paragraph("AGENT PRICE DISTRIBUTION", s_h2))

        # Build a visual price strip
        prices = [a.get("price") for a in agents if a.get("price") is not None]
        if prices:
            pmin, pmax = min(prices), max(prices)
            pspan = pmax - pmin if pmax > pmin else 1
            dot_w = 6
            gap = 2
            total_dots = len(prices)
            dots_per_row = int((PAGE_W - 84) / (dot_w + gap))
            rows_needed = (total_dots + dots_per_row - 1) // dots_per_row

            dot_rows = []
            for row_i in range(min(rows_needed, 8)):  # cap at 8 rows
                row_dots = []
                for col_i in range(dots_per_row):
                    idx = row_i * dots_per_row + col_i
                    if idx < total_dots:
                        p = prices[idx]
                        frac = (p - pmin) / pspan if pspan > 0 else 0.5
                        # Color from green (low) to red (high)
                        r = min(1.0, frac * 2)
                        g = min(1.0, (1 - frac) * 2)
                        dot_color = colors.HexColor(
                            f"#{int(r*255):02x}{int(g*180):02x}40"
                        )
                        row_dots.append(Paragraph(
                            f'<font size="2"> </font>',
                            ParagraphStyle(f"dot_{idx}", fontSize=2, backColor=dot_color,
                                           borderPadding=0, leading=1)
                        ))
                if row_dots:
                    dot_table = Table([row_dots],
                                      colWidths=[dot_w] * len(row_dots),
                                      rowHeights=[dot_w])
                    dot_table.setStyle(TableStyle([
                        ("LEFTPADDING", (0, 0), (-1, -1), 0),
                        ("RIGHTPADDING", (0, 0), (-1, -1), gap // 2),
                        ("TOPPADDING", (0, 0), (-1, -1), 0),
                        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
                    ]))
                    dot_rows.append(dot_table)

            if dot_rows:
                for dr in dot_rows:
                    story.append(dr)
                    story.append(Spacer(1, 2))

            # Legend
            story.append(Spacer(1, 4))
        legend = Table([[
            Paragraph(f'<font size="7" color="#6b7280">${pmin:,.0f}</font>', s_small),
            Paragraph(f'<font size="7" color="#6b7280">${pmax:,.0f}</font>',
                      _make_style("LR", fontSize=7, textColor=GRAY_TEXT, alignment=2)),
        ]], colWidths=[(PAGE_W - 84) / 2, (PAGE_W - 84) / 2])
        legend.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ]))
        story.append(legend)

    # ══════════════════════════════════════════════
    # FOOTER
    # ══════════════════════════════════════════════
    story.append(Spacer(1, 24))
    footer_line = Table([[""]], colWidths=[PAGE_W - 84], rowHeights=[1])
    footer_line.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), BORDER)]))
    story.append(footer_line)
    story.append(Spacer(1, 8))
    story.append(Paragraph(
        f"Generated by <b>Jacobi</b> — Adversarial Pricing Topology Probe &nbsp;|&nbsp; "
        f"{datetime.now().strftime('%B %d, %Y at %H:%M UTC')} &nbsp;|&nbsp; "
        f"Session: <font color='#6b7280'>{report_id[:12]}</font>",
        s_footer
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

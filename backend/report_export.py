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
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Flowable,
)
from reportlab.graphics.shapes import Drawing, Rect, String, Line

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
                "response_time_ms": a.get("response_time_ms"),
                "location": a.get("variables", {}).get("location"),
                "device": a.get("variables", {}).get("device"),
                "cookie": a.get("variables", {}).get("cookie"),
                "referrer": a.get("variables", {}).get("referrer"),
                "language": a.get("variables", {}).get("language"),
                "proxy_type": a.get("proxy_type"),
                "evidence": a.get("evidence"),
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
async def export_pdf(report_id: str):
    """Export as professionally designed PDF report."""
    report = _get_report(report_id)
    data = _sanitize_report(report)

    buf = io.BytesIO()
    PW, PH = letter
    M = 36

    doc = SimpleDocTemplate(buf, pagesize=letter, leftMargin=M, rightMargin=M, topMargin=0, bottomMargin=M)

    # Brand
    GREEN = colors.HexColor("#00d992")
    NAVY = colors.HexColor("#0f1123")
    DARK = colors.HexColor("#1e293b")
    CARD = colors.HexColor("#f1f5f9")
    GRAY = colors.HexColor("#94a3b8")
    MUTED = colors.HexColor("#64748b")
    RED = colors.HexColor("#ef4444")
    AMBER = colors.HexColor("#f59e0b")
    BLUE = colors.HexColor("#3b82f6")
    WHITE = colors.white
    BORDER = colors.HexColor("#e2e8f0")

    TOPO_C = {"uniform": GREEN, "selective": AMBER, "progressive": colors.HexColor("#f97316"), "aggressive": RED}

    styles = getSampleStyleSheet()
    def S(name, **kw):
        return ParagraphStyle(name, parent=styles["Normal"], **kw)

    sH1 = S("H1", fontSize=20, fontName="Helvetica-Bold", textColor=WHITE, leading=24)
    sH2 = S("H2", fontSize=11, fontName="Helvetica-Bold", textColor=DARK, spaceBefore=16, spaceAfter=6)
    sBody = S("Body", fontSize=9, textColor=MUTED, leading=13)
    sSmall = S("Small", fontSize=7, textColor=GRAY)
    sMetric = S("Metric", fontSize=24, fontName="Helvetica-Bold", textColor=DARK, leading=28)
    sLabel = S("Label", fontSize=8, textColor=GRAY, fontName="Helvetica-Bold")
    sBadge = S("Badge", fontSize=9, fontName="Helvetica-Bold", textColor=WHITE, leading=12)
    sFooter = S("Footer", fontSize=7, textColor=GRAY, alignment=1)
    sRight = S("Right", fontSize=7, textColor=GRAY, alignment=2)

    topo = (data.get("topology_class") or "unknown").lower()
    topo_c = TOPO_C.get(topo, BLUE)
    bp = data.get("baseline_price", 0) or 0
    spread = data.get("max_price_spread", 0) or 0
    spread_pct = data.get("max_price_spread_pct", 0) or 0
    score = data.get("discrimination_score", 0) or 0

    story = []

    # ═══════════ HEADER BANNER ═══════════
    class HeaderBanner(Flowable):
        def __init__(self, w, h):
            Flowable.__init__(self)
            self.width = w
            self.height = h
        def draw(self):
            c = self.canv
            w, h = self.width, self.height
            c.setFillColor(NAVY)
            c.rect(0, 0, w, h, fill=1, stroke=0)
            c.setFillColor(GREEN)
            c.rect(0, h - 3, w, 3, fill=1, stroke=0)
            c.setFont("Helvetica-Bold", 20)
            c.setFillColor(WHITE)
            c.drawString(0, h - 30, "JACOBI")
            c.setFont("Helvetica", 10)
            c.setFillColor(GRAY)
            c.drawString(70, h - 30, "Pricing Topology Report")
            c.setFillColor(topo_c)
            bw = c.stringWidth(topo.upper(), "Helvetica-Bold", 11)
            c.roundRect(w - bw - 24, h - 34, bw + 20, 20, 4, fill=1, stroke=0)
            c.setFillColor(WHITE)
            c.setFont("Helvetica-Bold", 9)
            c.drawString(w - bw - 14, h - 28, topo.upper())
    story.append(HeaderBanner(PW - 2*M, 72))
    story.append(Spacer(1, 12))

    # ═══════════ TARGET URL ═══════════
    story.append(Paragraph(f"<font size='8' color='#94a3b8'>{data.get('target_url', '')[:110]}</font>", sSmall))
    story.append(Spacer(1, 14))

    # ═══════════ KEY METRICS ═══════════
    card_w = (PW - 2*M - 16) / 3
    def metric_card(label, value, accent):
        d = Drawing(card_w, 56)
        d.add(Rect(0, 0, card_w, 56, 6, 6, fillColor=CARD, strokeColor=BORDER, strokeWidth=0.5))
        d.add(String(10, 35, label, fontSize=7, fontName="Helvetica-Bold", fillColor=GRAY))
        d.add(String(10, 8, value, fontSize=20, fontName="Helvetica-Bold", fillColor=accent))
        return d

    m1 = metric_card("BASELINE PRICE", f"${bp:,.0f}", GREEN)
    spread_color = RED if spread > 0 else GRAY
    m2 = metric_card("PRICE SPREAD", f"${spread:,.0f}" if spread > 0 else "$0", spread_color)
    score_color = RED if score > 50 else (AMBER if score > 20 else GREEN)
    m3 = metric_card("DISCRIMINATION", f"{score:.0f}/100", score_color)

    card_table = Table([[m1, m2, m3]], colWidths=[card_w + 8, card_w + 8, card_w + 8])
    card_table.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0)]))
    story.append(card_table)
    story.append(Spacer(1, 16))

    # ═══════════ SPREAD % under cards ═══════════
    if spread > 0:
        story.append(Paragraph(f"<font size='8'>Price spread: <b>{spread_pct:.1f}%</b> of baseline</font>", sBody))
    else:
        story.append(Paragraph("<font size='8'>All agents observed identical pricing</font>", sBody))
    story.append(Spacer(1, 10))

    # ═══════════ GRADIENT BARS (drawn) ═══════════
    gradients = data.get("gradients", [])
    if gradients:
        story.append(Paragraph("VARIABLE IMPACT", sH2))
        max_delta = max(abs(g.get("delta", 0)) for g in gradients) or 1
        bar_area_w = PW - 2*M - 160

        for g in gradients:
            var = g.get("variable_name", "").replace("_", " ").title()
            delta = abs(g.get("delta", 0))
            delta_str = f"${g.get('delta', 0):+,.0f}"
            sig = g.get("significant", False)
            bar_w = (delta / max_delta) * bar_area_w if max_delta > 0 else 0
            bar_w = max(bar_w, 4) if delta > 0 else 0
            bar_c = RED if sig else GRAY

            d = Drawing(PW - 2*M, 28)
            d.add(String(0, 14, var, fontSize=8, fontName="Helvetica-Bold", fillColor=DARK))
            if bar_w > 0:
                d.add(Rect(120, 7, bar_w, 14, 3, 3, fillColor=bar_c, strokeColor=None))
            d.add(String(120 + bar_w + 6, 13, delta_str, fontSize=8, fontName="Helvetica-Bold", fillColor=bar_c))
            if sig:
                d.add(String(120 + bar_w + 58, 13, "(sig)", fontSize=7, fontName="Helvetica", fillColor=RED))
            d.add(Line(0, 0, PW - 2*M, 0, strokeColor=BORDER, strokeWidth=0.5))
            story.append(d)

    # ═══════════ PRICE RANGE BAR ═══════════
    price_range = report.get("price_range") or data.get("price_range")
    if price_range and len(price_range) == 2 and price_range[1] > 0:
        story.append(Spacer(1, 4))
        story.append(Paragraph("PRICE DISTRIBUTION", sH2))
        rmin, rmax = price_range[0], price_range[1]
        span = rmax - rmin if rmax > rmin else 1
        bw = PW - 2*M

        # Bar with baseline marker
        d = Drawing(bw, 40)
        bar_y = 18; bar_h = 8
        d.add(Rect(0, bar_y, bw, bar_h, 2, 2, fillColor=colors.HexColor("#e2e8f0"), strokeColor=None))
        bp_frac = (bp - rmin) / span if span else 0.5
        bp_x = bw * bp_frac
        d.add(Line(bp_x, bar_y - 4, bp_x, bar_y + bar_h + 4, strokeColor=GREEN, strokeWidth=2))
        d.add(String(0, 0, f"${rmin:,.0f}", fontSize=7, fontName="Helvetica", fillColor=GRAY))
        d.add(String(bp_x - 30, 0, f"${bp:,.0f}", fontSize=7, fontName="Helvetica-Bold", fillColor=GREEN))
        d.add(String(bw - 55, 0, f"${rmax:,.0f}", fontSize=7, fontName="Helvetica", fillColor=GRAY))
        story.append(d)
        story.append(Spacer(1, 4))

    # ═══════════ AGENT HEATMAP ═══════════
    agents = data.get("agents", [])
    prices = [a.get("price") for a in agents if a.get("price") is not None]
    if prices:
        story.append(Paragraph("24 AGENTS", sH2))
        pmin, pmax = min(prices), max(prices)
        pspan = pmax - pmin if pmax > pmin else 1
        dot_s = 7; gap = 2
        dots_per_row = int(bw / (dot_s + gap))
        sorted_prices = sorted(prices)

        rows = []
        for ri in range(4):
            row_dots = []
            for ci in range(min(dots_per_row, len(sorted_prices) - ri * dots_per_row)):
                idx = ri * dots_per_row + ci
                if idx < len(sorted_prices):
                    p = sorted_prices[idx]
                    frac = (p - pmin) / pspan if pspan > 0 else 0.5
                    r = int(min(255, frac * 2 * 255))
                    g = int(min(255, (1 - frac) * 2 * 255))
                    dot_c = colors.HexColor(f"#{r:02x}{g:02x}40")
                    row_dots.append(Paragraph(
                        '<font size="3"> </font>',
                        ParagraphStyle(f"d{idx}", fontSize=3, backColor=dot_c, borderPadding=0, leading=1)
                    ))
            if row_dots:
                dt = Table([row_dots], colWidths=[dot_s]*len(row_dots), rowHeights=[dot_s])
                dt.setStyle(TableStyle([("LEFTPADDING", (0,0), (-1,-1), 0), ("TOPPADDING", (0,0), (-1,-1), 0)]))
                rows.append(dt)

        for r in rows:
            story.append(r)
            story.append(Spacer(1, 2))

        # Legend
        legend_d = Drawing(bw, 14)
        legend_d.add(String(0, 0, f"${pmin:,.0f}", fontSize=7, fontName="Helvetica", fillColor=GRAY))
        legend_d.add(String(bw - 55, 0, f"${pmax:,.0f}", fontSize=7, fontName="Helvetica", fillColor=GRAY))
        story.append(legend_d)

    # ═══════════ TOPOLOGY VERDICT ═══════════
    verdicts = {
        "uniform": "No price discrimination detected. All agent identities observed the same price.",
        "selective": "Mild discrimination. 1-2 factors show small price differences (< 12%).",
        "progressive": "Significant discrimination. Multiple factors create meaningful price gaps.",
        "aggressive": "Systematic discrimination. Large, consistent gaps across multiple variables.",
    }
    story.append(Spacer(1, 12))
    story.append(Paragraph(f"<font size='9' color='{topo_c}'><b>{topo.upper()}</b></font>  "
                           f"<font size='9' color='#64748b'>{verdicts.get(topo, '')}</font>", sBody))

    # ═══════════ EXECUTIVE SUMMARY ═══════════
    story.append(Spacer(1, 20))
    story.append(Paragraph("EXECUTIVE SUMMARY", sH2))

    agents = data.get("agents", [])
    real_probes = sum(1 for a in agents if a.get("response_time_ms", 0) > 0)
    total_agents = len(agents)
    filled = total_agents - real_probes

    # Compute confidence
    succ = report.get("successful_agents", 0) or 0
    tot = report.get("total_agents", 24) or 24
    confidence = min(100, round((succ / tot) * 100)) if tot > 0 else 0

    # Suspected driver
    sig_gradients = [g for g in gradients if g.get("significant")]
    top_driver = sorted(sig_gradients, key=lambda g: abs(g.get("delta", 0)), reverse=True)[0] if sig_gradients else None
    sev_score = report.get("discrimination_score", 0) or 0
    sev_label = "Critical" if sev_score > 80 else ("High" if sev_score > 50 else ("Moderate" if sev_score > 20 else "Low"))

    summary_data = [
        ("Target URL", (data.get("target_url") or "")[:100]),
        ("Scan Timestamp", data.get("timestamp") or datetime.now().isoformat()),
        ("Real Probes Run", str(real_probes)),
    ]
    if filled > 0:
        summary_data.append(("Agents Skipped", f"{filled} (exact-uniform gate passed)"))
    summary_data.extend([
        ("Highest Price", f"${max([a.get('price', 0) or 0 for a in agents] or [0]):,.2f}"),
        ("Lowest Price", f"${min([a.get('price', 0) or 0 for a in agents if a.get('price') is not None] or [0]):,.2f}"),
        ("Max Spread", f"${spread:,.2f} ({spread_pct:.1f}%)"),
        ("Topology Verdict", topo.upper()),
        ("Confidence Score", f"{confidence}%"),
        ("Suspected Driver", top_driver["variable_name"].replace("_", " ").title() if top_driver else "None detected"),
        ("Severity", sev_label),
    ])

    sum_table = Table(
        [[Paragraph(f"<font size='8' color='#64748b'>{k}</font>", sSmall),
          Paragraph(f"<font size='8'><b>{v}</b></font>", S("SV", fontSize=8, fontName="Helvetica-Bold", textColor=DARK))]
         for k, v in summary_data],
        colWidths=[160, PW - 2*M - 160]
    )
    sum_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LINEBELOW", (0, 0), (-1, -2), 0.5, BORDER),
    ]))
    story.append(sum_table)

    # ═══════════ EVIDENCE APPENDIX ═══════════
    story.append(Spacer(1, 20))
    story.append(Paragraph("EVIDENCE APPENDIX", sH2))
    ev_agents = [a for a in agents if a.get("evidence") and a["evidence"].get("extraction_method") != "none"]
    if ev_agents:
        # Table header
        ev_header = ["Agent", "Region", "Device", "Price", "Raw Text", "Currency", "Method"]
        ev_widths = [50, 60, 70, 55, 130, 50, 80]
        ev_rows = [[
            Paragraph(f"<font size='7' color='#64748b'>{h}</font>",
                      S(f"EH{i}", fontSize=7, fontName="Helvetica-Bold", textColor=GRAY))
            for h in ev_header
        ]]
        for a in ev_agents:
            ev = a.get("evidence", {})
            vars_ = {"location": a.get("location", ""), "device": a.get("device", "")}
            ev_rows.append([
                Paragraph(f"<font size='7'>{a.get('agent_id', '')}</font>", sSmall),
                Paragraph(f"<font size='7'>{vars_.get('location', '—')}</font>", sSmall),
                Paragraph(f"<font size='7'>{vars_.get('device', '—')}</font>", sSmall),
                Paragraph(f"<font size='7'><b>${(a.get('price') or 0):,.2f}</b></font>",
                          S("EP", fontSize=7, fontName="Helvetica-Bold", textColor=DARK)),
                Paragraph(f"<font size='7'>{ev.get('price_raw_text') or 'N/A'}</font>", sSmall),
                Paragraph(f"<font size='7'>{ev.get('currency_detected') or 'N/A'}</font>", sSmall),
                Paragraph(f"<font size='7'>{ev.get('extraction_method') or 'N/A'}</font>", sSmall),
            ])

        ev_table = Table(ev_rows, colWidths=ev_widths)
        ev_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f1f5f9")),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ("LINEBELOW", (0, 0), (-1, -1), 0.5, BORDER),
        ]))
        story.append(ev_table)

        # Evidence stats
        story.append(Spacer(1, 8))
        story.append(Paragraph(
            f"<font size='7' color='#94a3b8'>{len(ev_agents)} of {total_agents} agents captured evidence "
            f"· {real_probes} real probes · {filled} skipped (uniform gate)</font>",
            sSmall
        ))
    else:
        story.append(Paragraph(
            "<font size='8' color='#64748b'>No evidence data available for this probe. "
            "Evidence capture requires a live BrightData probe (not a demo or cached result).</font>",
            sBody
        ))

    # ═══════════ METHODOLOGY ═══════════
    story.append(Spacer(1, 20))
    story.append(Paragraph("METHODOLOGY", sH2))
    methodology_text = (
        "Jacobi is an evidence-grade pricing intelligence platform that runs controlled "
        "buyer-context probes against target URLs. Each probe deploys synthetic shopper "
        "identities — varying location, device type, cookie profile, referrer source, and "
        "browser language — to detect price discrimination.</p><p>"
        "<b>How it works:</b> Jacobi sends real HTTP requests through BrightData's global "
        "proxy network. Each agent identity is routed through a different IP address and "
        "geographic region. The target page's HTML is parsed, and the listed price is "
        "extracted using site-specific selectors (e.g., Amazon's corePriceDisplay container, "
        "Booking.com's data-testid elements). Prices are normalized to USD for comparison.</p><p>"
        "<b>Uniform-gate optimization:</b> If the first 10 real probes return the exact same "
        "price (to the cent), the remaining agents are skipped. This saves time and BrightData "
        "credits without sacrificing accuracy — identical pricing means no discrimination "
        "exists. If any agent sees a different price, the full 24-agent audit runs.</p><p>"
        "<b>Statistical analysis:</b> Prices are grouped by discrimination variable (location, "
        "device, etc.) and compared using Welch's t-test. Variables with |t| > 2.0 are "
        "flagged as statistically significant. The discrimination index measures the total "
        "USD spread attributable to significant variables.</p><p>"
        "<b>Evidence integrity:</b> Every real probe captures the raw HTML excerpt, the "
        "exact price text as rendered on the page, the detected currency, and the extraction "
        "method used. This evidence is stored and can be independently verified."
    )
    story.append(Paragraph(methodology_text, S("Method", fontSize=8, textColor=DARK, leading=12)))

    # ═══════════ FOOTER ═══════════
    story.append(Spacer(1, 20))
    ts = datetime.now().strftime("%B %d, %Y")
    story.append(Paragraph(f"<font size='7' color='#94a3b8'>Jacobi · {ts} · Session {report_id[:12]}</font>", sFooter))

    doc.build(story)
    buf.seek(0)

    return StreamingResponse(
        buf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="jacobi-probe-{report_id}.pdf"'},
    )

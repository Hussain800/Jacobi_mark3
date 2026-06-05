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
    HRFlowable, KeepTogether,
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
        "mean_price": report.get("mean_price"),
        "price_range": report.get("price_range"),
        "max_price_spread": report.get("max_price_spread"),
        "max_price_spread_pct": report.get("max_price_spread_pct"),
        "topology_class": report.get("topology_class"),
        "discrimination_index": report.get("discrimination_index"),
        "discrimination_score": report.get("discrimination_score", 0),
        "successful_agents": report.get("successful_agents"),
        "failed_agents": report.get("failed_agents"),
        "detected_agents": report.get("detected_agents"),
        "total_agents": report.get("total_agents"),
        "control_stability": report.get("control_stability"),
        "elapsed_seconds": report.get("elapsed_seconds"),
        # Native (on-page) currency for the headline; USD is the normalized basis.
        "native_currency": report.get("native_currency"),
        "native_baseline_price": report.get("native_baseline_price"),
        "normalized_currency": report.get("normalized_currency", "USD"),
        "fx_rate_used": report.get("fx_rate_used"),
        "language_observations": report.get("language_observations", []),
        # Phase 5A honest probe accounting.
        "configured_agents": report.get("configured_agents") or report.get("total_agents"),
        "real_probes_executed": report.get("real_probes_executed"),
        "skipped_inferred_agents": report.get("skipped_inferred_agents"),
        "evidence_count": report.get("evidence_count"),
        "audit_depth": report.get("audit_depth"),
        # Math Engine v2: robust baseline, dispersion, Jacobian sensitivity
        # matrix, and the attribution-gated Price Exploitation Index.
        "robust_baseline": report.get("robust_baseline"),
        "mad_normalized_spread": report.get("mad_normalized_spread"),
        "gini_all": report.get("gini_all"),
        "sensitivity_matrix": report.get("sensitivity_matrix"),
        "pei": report.get("pei"),
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
                "native_price": a.get("native_price"),
                "native_currency": a.get("native_currency"),
                "normalized_price_usd": a.get("normalized_price_usd"),
                "browser_language": a.get("browser_language"),
                "language_label": a.get("language_label"),
                "evidence": a.get("evidence"),
            }
            for a in report.get("agents", [])
        ],
    }


# Session ids the frontend uses for the curated demo / case-study reports.
# All resolve to the static DEMO_RESULT so "Download PDF" works on case studies
# and investor demos (which never hit the live engine or persist a row).
_DEMO_IDS = {"demo", "demo_session_static", "demo_analyzed"}


async def _get_report(report_id: str) -> dict:
    """Get report from session store, Supabase, or demo data."""
    if report_id in _DEMO_IDS or report_id.startswith("demo"):
        from main import DEMO_RESULT
        return DEMO_RESULT
    from main import SESSION_STORE
    report = SESSION_STORE.get(report_id)
    if not report:
        try:
            from supabase_client import get_probe_by_session_id
            report = await get_probe_by_session_id(report_id)
        except Exception:
            pass
    if not report:
        # Last-resort: a fallback_* id (Next.js proxy fallback) or any unknown id
        # still gets a usable PDF from the demo result rather than a dead 404 in
        # the user's face. Real probes always resolve above.
        if report_id.startswith("fallback") or report_id.startswith("demo"):
            from main import DEMO_RESULT
            return DEMO_RESULT
        raise HTTPException(status_code=404, detail="Report not found")
    return report


@router.get("/{report_id}/json")
async def export_json(report_id: str, _: dict = Depends(_require_pro)):
    """Export as JSON file. Pro-only."""
    report = await _get_report(report_id)
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
    report = await _get_report(report_id)
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


def _derive_display_name(name, url):
    """A clean, human title for the report.

    If the user pasted a bare URL as the name (or gave none), derive a readable
    product/domain label (e.g. "Lenovo Legion Gaming GeForce Windows (amazon.ae)")
    instead of splashing the raw link across the title, abstract, params table and
    conclusion. The full URL is still shown once, on its own line in the
    Introduction. A real human name is returned unchanged.
    """
    from urllib.parse import urlparse
    nm = (name or "").strip()
    if nm and not nm.lower().startswith(("http://", "https://")):
        return nm  # already a human name — use as-is
    src = url or nm
    try:
        parsed = urlparse(src if src.lower().startswith(("http://", "https://"))
                          else "https://" + src)
        host = (parsed.netloc or "").replace("www.", "")
        skip = {"dp", "gp", "product", "ref", "d", "p", "item", "itm", "hotel", "s", "b"}
        cand = ""
        for seg in (parsed.path or "").split("/"):
            base = seg.split("?")[0]
            if not base or base.lower() in skip:
                continue
            alpha = sum(ch.isalpha() for ch in base)
            if ("-" in base or "_" in base or alpha >= 5) and not base.isdigit():
                if len(base) > len(cand):
                    cand = base  # the longest descriptive path segment wins
        slug = " ".join(cand.replace("-", " ").replace("_", " ").split())
        if slug.islower() or slug.isupper():
            slug = slug.title()  # only re-case all-lower/all-upper slugs
        if len(slug) > 56:
            slug = slug[:56].rsplit(" ", 1)[0] + "…"
        if slug and host:
            return f"{slug} ({host})"
        return host or "Unknown Target"
    except Exception:
        return nm[:60] if nm else "Unknown Target"


@router.get("/{report_id}/pdf")
async def export_pdf(report_id: str):
    """Export the probe as a research-grade, LaTeX-article-style PDF report.

    Pure white background, black Times-Roman serif text, a centered title block
    with an italic Abstract, numbered sections, booktabs-style tables, and a
    couple of restrained greyscale figures. Built entirely with ReportLab
    flowables so pagination is automatic and content never overlaps the footer.

    Hardened against real-world session shapes: every numeric field may be None
    or absent, agent/price lists may be empty, and divisions are guarded. Missing
    values render a clean "n/a" rather than a fabricated number.
    """
    report = await _get_report(report_id)
    data = _sanitize_report(report)

    # ------------------------------------------------------------------ helpers
    def _num(x):
        """Return a float if x is a real number, else None (treats None/''/bad as missing)."""
        if x is None:
            return None
        try:
            return float(x)
        except (TypeError, ValueError):
            return None

    def _money(x, dash="n/a"):
        v = _num(x)
        if v is None:
            return dash
        return f"${v:,.2f}"

    def _money0(x, dash="n/a"):
        v = _num(x)
        if v is None:
            return dash
        return f"${v:,.0f}"

    def _pct(x, dash="n/a"):
        v = _num(x)
        if v is None:
            return dash
        return f"{v:.1f}%"

    def _esc(s):
        """Escape text for ReportLab inline markup."""
        if s is None:
            return ""
        return (str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))

    def _titleize(s):
        if not s:
            return ""
        return str(s).replace("_", " ").title()

    # NOTE: a previous _softbreak() helper inserted U+200B between URL segments to
    # coax justified prose into wrapping long URLs. The base-14 PDF fonts (Times)
    # have no glyph for U+200B, so ReportLab drew each one as a .notdef box — the
    # "little blocks" seen inside the link. Long URLs now live on their own
    # left-aligned line and wrap via ReportLab's splitLongWords, so no zero-width
    # break characters are needed (and none are inserted).

    # ------------------------------------------------------------------ palette
    # Restrained, print-safe academic palette. White paper, black ink.
    INK = colors.HexColor("#111111")     # body / headings
    SLATE = colors.HexColor("#1a2b4a")   # single dark accent (rules, eyebrows)
    GREY = colors.HexColor("#555555")    # secondary captions
    LIGHTGREY = colors.HexColor("#888888")
    RULE = colors.HexColor("#333333")    # table rules
    HAIR = colors.HexColor("#bbbbbb")    # very light hairlines / axis
    SIGRED = colors.HexColor("#a11111")  # significant-value emphasis (text only)
    BARFILL = colors.HexColor("#444444") # greyscale figure bars
    BARLITE = colors.HexColor("#cccccc") # de-emphasised bars
    PANEL = colors.HexColor("#f5f5f5")   # very light header tint (optional)
    WHITE = colors.white

    PW, PH = letter
    M = 72  # ~1 inch margins, like a paper
    CONTENT_W = PW - 2 * M

    styles = getSampleStyleSheet()

    def S(name, **kw):
        return ParagraphStyle(name, parent=styles["Normal"], **kw)

    sTitle = S("PaperTitle", fontName="Times-Bold", fontSize=19, leading=23,
               textColor=INK, alignment=1, spaceAfter=4)
    sAuthor = S("Author", fontName="Times-Roman", fontSize=11, leading=14,
                textColor=INK, alignment=1, spaceAfter=2)
    sAffil = S("Affil", fontName="Times-Italic", fontSize=9.5, leading=12,
               textColor=GREY, alignment=1)
    sDate = S("Date", fontName="Times-Roman", fontSize=9.5, leading=12,
              textColor=GREY, alignment=1)

    sAbstractHead = S("AbsHead", fontName="Times-Bold", fontSize=9.5, leading=13,
                      textColor=INK, alignment=1, spaceBefore=4, spaceAfter=4)
    sAbstract = S("Abstract", fontName="Times-Italic", fontSize=9.5, leading=13.5,
                  textColor=INK, alignment=4,
                  leftIndent=20, rightIndent=20)

    sSection = S("Section", fontName="Times-Bold", fontSize=12, leading=15,
                 textColor=INK, spaceBefore=14, spaceAfter=5,
                 # Never leave a section heading stranded at the bottom of a page;
                 # it is pulled to the next page with its following content.
                 keepWithNext=True)
    sBody = S("Body", fontName="Times-Roman", fontSize=10, leading=14,
              textColor=INK, alignment=4, spaceAfter=6)
    # Long URLs render here: LEFT-aligned (never justified, so no stretched
    # spaces) and splitLongWords=1 so the link wraps cleanly at the right margin
    # without any inserted break characters.
    sTarget = S("Target", fontName="Times-Roman", fontSize=9, leading=12.5,
                textColor=GREY, alignment=0, spaceBefore=1, spaceAfter=8,
                splitLongWords=1)
    sCaption = S("Caption", fontName="Times-Italic", fontSize=8.5, leading=11,
                 textColor=GREY, alignment=1, spaceBefore=4, spaceAfter=10)
    sTblHead = S("TblHead", fontName="Times-Bold", fontSize=8.5, leading=11,
                 textColor=INK)
    sTblHeadR = S("TblHeadR", fontName="Times-Bold", fontSize=8.5, leading=11,
                  textColor=INK, alignment=2)
    sCell = S("Cell", fontName="Times-Roman", fontSize=8.5, leading=11,
              textColor=INK)
    sCellR = S("CellR", fontName="Times-Roman", fontSize=8.5, leading=11,
               textColor=INK, alignment=2)
    sCellMuted = S("CellMuted", fontName="Times-Roman", fontSize=8.5, leading=11,
                   textColor=GREY)
    sCellSig = S("CellSig", fontName="Times-Bold", fontSize=8.5, leading=11,
                 textColor=SIGRED, alignment=2)

    # ------------------------------------------------------------------ extracted, coerced values
    topo = (data.get("topology_class") or "unknown").lower()
    target_name = data.get("target_name") or "Unknown Target"
    target_url = data.get("target_url") or ""
    display_name = _derive_display_name(target_name, target_url)
    session_id = data.get("session_id") or report_id

    bp = _num(data.get("baseline_price"))
    mean_price = _num(data.get("mean_price"))
    spread = _num(data.get("max_price_spread"))
    spread_pct = _num(data.get("max_price_spread_pct"))
    score = _num(data.get("discrimination_score"))
    disc_index = _num(data.get("discrimination_index"))
    # Math Engine v2 — robust baseline + attribution-gated PEI.
    robust_bp = _num(data.get("robust_baseline"))
    gini_all = _num(data.get("gini_all"))
    _pei = data.get("pei") or {}
    pei_score = _num(_pei.get("score"))
    pei_interp = _pei.get("interpretation") or ""
    pei_basis = _pei.get("basis") or ""

    # Native (on-page) currency — the value the shopper actually sees. USD below
    # is the normalized comparison basis. All None-safe.
    native_ccy = data.get("native_currency")
    native_bp = _num(data.get("native_baseline_price"))

    def _native(val, dash="n/a"):
        """Format a native-currency amount, e.g. 'AED 11,600.00'. None-safe."""
        v = _num(val)
        if v is None or not native_ccy:
            return dash
        return f"{_esc(native_ccy)} {v:,.2f}"

    gradients = data.get("gradients") or []
    if not isinstance(gradients, list):
        gradients = []

    agents = data.get("agents") or []
    if not isinstance(agents, list):
        agents = []

    # Prices present across agents (guarded for None / non-numeric).
    agent_prices = [p for p in (_num(a.get("price")) for a in agents) if p is not None]
    p_min = min(agent_prices) if agent_prices else None
    p_max = max(agent_prices) if agent_prices else None

    # price_range from session (fall back to observed agent prices).
    pr = data.get("price_range")
    rmin = rmax = None
    if isinstance(pr, (list, tuple)) and len(pr) >= 2:
        rmin, rmax = _num(pr[0]), _num(pr[1])
    if rmin is None:
        rmin = p_min
    if rmax is None:
        rmax = p_max

    # Probe accounting (all guarded). Prefer the session's authoritative Phase-5A
    # counts when present; fall back to deriving them from the agent list.
    total_agents = len(agents)
    configured_agents = int(_num(data.get("configured_agents")) or total_agents or 0)
    real_probes = (int(_num(data.get("real_probes_executed")))
                   if data.get("real_probes_executed") is not None
                   else sum(1 for a in agents if (_num(a.get("response_time_ms")) or 0) > 0))
    filled = (int(_num(data.get("skipped_inferred_agents")))
              if data.get("skipped_inferred_agents") is not None
              else max(0, total_agents - real_probes))
    evidence_count = (int(_num(data.get("evidence_count")))
                      if data.get("evidence_count") is not None else None)
    audit_depth = data.get("audit_depth")
    succ = int(_num(data.get("successful_agents")) or 0)
    tot = int(_num(data.get("total_agents")) or total_agents or 0)
    confidence = min(100, round((succ / tot) * 100)) if tot > 0 else None

    sig_gradients = [g for g in gradients if g.get("significant")]
    top_driver = None
    if sig_gradients:
        top_driver = sorted(
            sig_gradients,
            key=lambda g: abs(_num(g.get("delta")) or 0),
            reverse=True,
        )[0]

    sev_label = "Indeterminate"
    if score is not None:
        sev_label = ("Critical" if score > 80 else
                     "High" if score > 50 else
                     "Moderate" if score > 20 else "Low")

    topo_titles = {
        "uniform": "No Price Discrimination Detected",
        "selective": "Selective Price Discrimination",
        "progressive": "Progressive Price Discrimination",
        "aggressive": "Aggressive Price Discrimination",
        "indeterminate": "Indeterminate — Spread Not Attributable",
        "insufficient_data": "Limited Coverage — Inconclusive",
        "unknown": "Inconclusive Pricing Topology",
    }
    topo_findings = {
        "uniform": ("all synthetic buyer identities observed an identical listed "
                    "price, indicating no detectable personalisation along the "
                    "tested dimensions"),
        "selective": ("one or two buyer attributes produced small but measurable "
                      "price differences, consistent with selective personalisation"),
        "progressive": ("several buyer attributes independently shifted the listed "
                        "price, producing a graded structure of price discrimination"),
        "aggressive": ("large and consistent price gaps appeared across multiple "
                       "buyer attributes, consistent with systematic price "
                       "discrimination"),
        "indeterminate": ("prices varied across identities, but no controlled buyer "
                          "attribute significantly moved the price, so the spread is "
                          "not attributable to price discrimination — on travel sites "
                          "this typically reflects different rooms or availability "
                          "across identities rather than the same product priced "
                          "differently"),
        "insufficient_data": ("too few identities returned a comparable price to "
                              "classify the pricing topology or assert discrimination"),
        "unknown": ("the probe did not return enough comparable observations to "
                    "classify the pricing topology"),
    }

    # ------------------------------------------------------------------ document
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=letter,
        leftMargin=M, rightMargin=M, topMargin=M, bottomMargin=M + 6,
        title=f"JACOBI Pricing Topology Report — {display_name}",
        author="JACOBI Pricing Intelligence",
    )

    footer_label = (f"JACOBI  ·  Pricing Topology Report  ·  "
                    f"{datetime.now().strftime('%B %d, %Y')}  ·  "
                    f"Session {str(session_id)[:16]}")

    def _on_page(canvas, doc_):
        canvas.saveState()
        # Thin footer rule.
        canvas.setStrokeColor(HAIR)
        canvas.setLineWidth(0.5)
        canvas.line(M, M - 22, PW - M, M - 22)
        canvas.setFont("Times-Roman", 7.5)
        canvas.setFillColor(GREY)
        canvas.drawString(M, M - 33, footer_label)
        page_num = canvas.getPageNumber()
        canvas.drawRightString(PW - M, M - 33, f"Page {page_num}")
        canvas.restoreState()

    story = []

    # ---- Title block --------------------------------------------------------
    story.append(Spacer(1, 6))
    story.append(Paragraph(
        f"Algorithmic Price Discrimination Audit:<br/>{_esc(display_name)}",
        sTitle,
    ))
    story.append(Spacer(1, 4))
    story.append(Paragraph("JACOBI Pricing Intelligence", sAuthor))
    story.append(Paragraph(
        "Adversarial Pricing-Topology Probe &mdash; Evidence-Grade Report",
        sAffil,
    ))
    ts_display = data.get("timestamp") or datetime.now().strftime("%Y-%m-%d")
    story.append(Paragraph(_esc(ts_display), sDate))
    story.append(Spacer(1, 6))
    story.append(HRFlowable(width="60%", thickness=0.8, color=SLATE,
                            spaceBefore=2, spaceAfter=12, hAlign="CENTER"))

    # ---- Abstract -----------------------------------------------------------
    abstract_bits = []
    abstract_bits.append(
        f"This report presents the results of a controlled buyer-context probe of "
        f"<i>{_esc(display_name)}</i>, classified as a "
        f"<b>{_esc(topo)}</b> pricing topology"
    )
    if bp is not None:
        abstract_bits.append(f" against a baseline price of {_money(bp)}")
    abstract_bits.append(". ")
    if spread is not None and spread > 0:
        sp_tail = f" ({_pct(spread_pct)} of baseline)" if spread_pct is not None else ""
        abstract_bits.append(
            f"The maximum observed price spread across synthetic identities was "
            f"{_money(spread)}{sp_tail}. "
        )
    elif spread is not None:
        abstract_bits.append(
            "No price spread was observed across synthetic identities. "
        )
    if top_driver is not None:
        abstract_bits.append(
            f"The dominant driver was the <b>{_esc(_titleize(top_driver.get('variable_name')))}</b> "
            f"attribute. "
        )
    abstract_bits.append(
        f"In summary, {topo_findings.get(topo, topo_findings['unknown'])}."
    )

    story.append(Paragraph("Abstract", sAbstractHead))
    story.append(Paragraph("".join(abstract_bits), sAbstract))
    story.append(Spacer(1, 6))
    story.append(HRFlowable(width="100%", thickness=0.4, color=HAIR,
                            spaceBefore=2, spaceAfter=4))

    # ---- 1. Introduction ----------------------------------------------------
    story.append(Paragraph("1.&nbsp;&nbsp;Introduction", sSection))
    intro = (
        "Online retailers and travel platforms increasingly tailor the prices a "
        "visitor sees to inferred attributes such as location, device, browsing "
        "history, and referral source. JACOBI audits this behaviour empirically by "
        "dispatching a panel of synthetic buyer identities at a single target URL "
        "and comparing the prices each identity is served. This report documents "
        f"an audit of <b>{_esc(display_name)}</b>. The objective is to determine "
        "whether, and along which attributes, the target applies price "
        "discrimination, and to preserve verifiable evidence for each observation."
    )
    story.append(Paragraph(intro, sBody))
    # The full URL is shown exactly once, here, on its own LEFT-aligned line so it
    # wraps cleanly at the margin — never justified (no stretched spaces) and with
    # no inserted break characters (no .notdef boxes).
    if target_url:
        story.append(Paragraph(
            f"<b>Target&nbsp;URL:</b>&nbsp;&nbsp;{_esc(str(target_url)[:300])}", sTarget))

    # ---- 2. Methodology -----------------------------------------------------
    story.append(Paragraph("2.&nbsp;&nbsp;Methodology", sSection))
    method = (
        "Each audit deploys up to 24 synthetic buyer identities against the target "
        "URL. The identities vary along five attributes &mdash; geographic location, "
        "device class, cookie-history profile, referral source, and browser language "
        "&mdash; while holding the requested product constant. Requests are routed "
        "through a global residential and datacentre proxy network so that each "
        "identity originates from a distinct IP address and region. The listed price "
        "is extracted from the rendered page using site-specific selectors and "
        "recorded alongside its raw on-page text and detected currency."
    )
    story.append(Paragraph(method, sBody))
    method2 = (
        "Observed prices are grouped by attribute and compared using Welch's "
        "two-sample <i>t</i>-test; an attribute is flagged statistically significant "
        "when |<i>t</i>|&nbsp;&gt;&nbsp;2.0. The discrimination index is the total "
        "price spread attributable to significant attributes, and the topology class "
        "summarises the overall pattern (uniform, selective, progressive, or "
        "aggressive). When the first real probes return an identical price to the "
        "cent, the remaining identities are skipped under an exact-uniform gate; any "
        "divergence triggers the full panel."
    )
    story.append(Paragraph(method2, sBody))

    # ---- 3. Results ---------------------------------------------------------
    story.append(Paragraph("3.&nbsp;&nbsp;Results", sSection))

    res_lead = (
        f"The target was classified as a <b>{_esc(topo)}</b> topology &mdash; "
        f"{topo_titles.get(topo, topo_titles['unknown']).lower()}. "
    )
    if score is not None:
        res_lead += (f"The discrimination score was "
                     f"<b>{score:.0f}/100</b> ({_esc(sev_label.lower())} severity). ")
    if confidence is not None:
        res_lead += (f"Of {tot} planned identities, {succ} returned a usable "
                     f"price, giving a confidence of {confidence}%.")
    story.append(Paragraph(res_lead, sBody))

    # Table 1 — summary of key metrics (booktabs style).
    # Native (on-page) price is shown first when available; the USD figure is
    # explicitly labelled as the normalized comparison value.
    def _kv_rows():
        rows = [
            ("Target", _esc(display_name)),
            ("Topology class", _esc(topo.capitalize())),
        ]
        if native_bp is not None and native_ccy:
            rows.append(("Baseline price (native)", _native(native_bp)))
            rows.append(("Baseline price (USD, normalized)", _money(bp)))
        else:
            rows.append(("Baseline price", _money(bp)))
        rows += [
            ("Mean price", _money(mean_price)),
            ("Price range",
             (f"{_money(rmin)} &ndash; {_money(rmax)}"
              if (rmin is not None and rmax is not None) else "n/a")),
            ("Maximum spread",
             (f"{_money(spread)} ({_pct(spread_pct)})"
              if (spread is not None and spread > 0)
              else ("$0.00 (0.0%)" if spread is not None else "n/a"))),
            ("Discrimination index",
             (_money(disc_index) if disc_index is not None else "n/a")),
            ("Discrimination score",
             (f"{score:.0f} / 100" if score is not None else "n/a")),
            ("Severity", _esc(sev_label)),
            ("Configured agents", str(configured_agents)
             + (f" ({_esc(audit_depth)})" if audit_depth else "")),
            ("Real probes executed", f"{real_probes} of {configured_agents}"),
        ]
        if robust_bp is not None:
            rows.append(("Robust baseline (trimmed median)", _money(robust_bp)))
        if pei_score is not None:
            _pei_word = pei_interp.split("—")[0].strip() if pei_interp else ""
            rows.append(("Price Exploitation Index",
                         f"{pei_score:.0f} / 100"
                         + (f" ({_esc(_pei_word)})" if _pei_word else "")))
        if gini_all is not None:
            rows.append(("Observed dispersion (Gini)", f"{gini_all:.3f}"))
        if filled > 0:
            rows.append(("Agents skipped (inferred)",
                         f"{filled} (exact-uniform gate)"))
        if evidence_count is not None:
            rows.append(("Evidence captured", f"{evidence_count} agents"))
        if confidence is not None:
            rows.append(("Confidence", f"{confidence}%"))
        rows.append(("Suspected driver",
                     _esc(_titleize(top_driver.get("variable_name")))
                     if top_driver else "None detected"))
        return rows

    t1_data = [[Paragraph("Metric", sTblHead), Paragraph("Value", sTblHeadR)]]
    for k, v in _kv_rows():
        t1_data.append([
            Paragraph(_esc(k), sCellMuted),
            Paragraph(str(v), sCellR),
        ])
    col1 = CONTENT_W * 0.42
    t1 = Table(t1_data, colWidths=[col1, CONTENT_W - col1], hAlign="CENTER")
    t1.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, -1), "Times-Roman"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 3.5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3.5),
        ("LEFTPADDING", (0, 0), (-1, -1), 2),
        ("RIGHTPADDING", (0, 0), (-1, -1), 2),
        # booktabs: top rule, mid rule under header, bottom rule. No verticals.
        ("LINEABOVE", (0, 0), (-1, 0), 1.1, RULE),
        ("LINEBELOW", (0, 0), (-1, 0), 0.6, RULE),
        ("LINEBELOW", (0, -1), (-1, -1), 1.1, RULE),
    ]))
    story.append(Spacer(1, 4))
    story.append(KeepTogether([
        t1,
        Paragraph("Table 1. Summary of audit metrics for the target session.",
                  sCaption),
    ]))

    # Price Exploitation Index basis — the "why this verdict was / was not
    # claimed" line. This is the evidence-grade explanation of the gated score.
    if pei_basis:
        story.append(Spacer(1, 3))
        story.append(Paragraph(
            f"<b>Price Exploitation Index basis.</b> {_esc(pei_basis)}", sBody))

    # Figure 1 — price distribution (clean greyscale axis).
    # Only meaningful when prices actually vary; a single uniform price collapses
    # all ticks onto one point (the "$3,159$3,159" overlap), so we skip it and
    # state the uniform finding in prose instead.
    if (rmin is not None and rmax is not None and (rmax - rmin) > 0.01):
        fig = _price_axis_figure(
            CONTENT_W, rmin, rmax, bp, mean_price,
            HAIR, RULE, INK, GREY, SLATE,
        )
        story.append(Spacer(1, 6))
        story.append(KeepTogether([
            fig,
            Paragraph(
                "Figure 1. Distribution of observed prices across synthetic "
                "identities. Ticks mark the minimum, maximum, baseline, and mean.",
                sCaption),
        ]))
    elif bp is not None:
        story.append(Spacer(1, 2))
        story.append(Paragraph(
            f"All identities that returned a price observed the same value, "
            f"{_money(bp)}; no distribution figure is shown because the prices do "
            f"not vary.", sBody))

    # ---- 4. Evidence --------------------------------------------------------
    story.append(Paragraph("4.&nbsp;&nbsp;Evidence", sSection))

    # 4a. Variable-impact table + simple bar figure.
    # A uniform result often carries gradients whose deltas are all $0 — a table
    # of zeros and an all-empty bar chart is noise, so only render the impact
    # analysis when at least one attribute actually moved the price.
    gradients_meaningful = [
        g for g in gradients if abs(_num(g.get("delta")) or 0.0) > 0.005
    ]
    if gradients_meaningful:
        story.append(Paragraph(
            "Table 2 reports the per-attribute price differential. Statistically "
            "significant attributes (|<i>t</i>|&nbsp;&gt;&nbsp;2.0) are emphasised "
            "in <font color='#a11111'><b>dark red</b></font>.",
            sBody))

        t2_head = [
            Paragraph("Attribute", sTblHead),
            Paragraph("High state", sTblHead),
            Paragraph("Low state", sTblHead),
            Paragraph("&Delta; price", sTblHeadR),
            Paragraph("&Delta; %", sTblHeadR),
            Paragraph("<i>t</i>", sTblHeadR),
            Paragraph("Sig.", sTblHeadR),
        ]
        t2_data = [t2_head]
        sig_rows = []
        for gi, g in enumerate(gradients_meaningful):
            sig = bool(g.get("significant"))
            delta = _num(g.get("delta"))
            delta_pct = _num(g.get("delta_pct"))
            tstat = _num(g.get("t_statistic"))
            delta_cell_style = sCellSig if sig else sCellR
            t2_data.append([
                Paragraph(_esc(_titleize(g.get("variable_name"))), sCell),
                Paragraph(_esc(g.get("state_high") or "n/a"), sCellMuted),
                Paragraph(_esc(g.get("state_low") or "n/a"), sCellMuted),
                Paragraph((f"{'+' if (delta or 0) >= 0 else ''}{_money(delta)}"
                           if delta is not None else "n/a"), delta_cell_style),
                Paragraph((f"{delta_pct:+.1f}%" if delta_pct is not None else "n/a"),
                          sCellR),
                Paragraph((f"{tstat:.1f}" if tstat is not None else "n/a"), sCellR),
                Paragraph(("yes" if sig else "&mdash;"),
                          sCellSig if sig else sCellR),
            ])
            if sig:
                sig_rows.append(len(t2_data) - 1)

        # Proportional column widths.
        w = CONTENT_W
        cw = [w * 0.18, w * 0.21, w * 0.21, w * 0.12, w * 0.10, w * 0.08, w * 0.10]
        t2 = Table(t2_data, colWidths=cw, hAlign="CENTER", repeatRows=1)
        t2_style = [
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING", (0, 0), (-1, -1), 3.5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3.5),
            ("LEFTPADDING", (0, 0), (-1, -1), 3),
            ("RIGHTPADDING", (0, 0), (-1, -1), 3),
            ("LINEABOVE", (0, 0), (-1, 0), 1.1, RULE),
            ("LINEBELOW", (0, 0), (-1, 0), 0.6, RULE),
            ("LINEBELOW", (0, -1), (-1, -1), 1.1, RULE),
        ]
        t2.setStyle(TableStyle(t2_style))
        story.append(Spacer(1, 4))
        story.append(KeepTogether([
            t2,
            Paragraph(
                "Table 2. Per-attribute price differentials from Welch's "
                "<i>t</i>-test.", sCaption),
        ]))

        # Figure 2 — greyscale impact bars.
        fig2 = _impact_bars_figure(
            CONTENT_W, gradients_meaningful, _num, _titleize, _esc,
            BARFILL, BARLITE, SIGRED, INK, GREY, HAIR,
        )
        if fig2 is not None:
            story.append(Spacer(1, 4))
            story.append(KeepTogether([
                fig2,
                Paragraph(
                    "Figure 2. Magnitude of price impact per attribute. "
                    "Significant attributes are drawn darker.",
                    sCaption),
            ]))
    elif topo == "uniform":
        story.append(Paragraph(
            "Because every identity observed the same price, there are no "
            "per-attribute differentials to report; no attribute moved the price.",
            sBody))
    else:
        story.append(Paragraph(
            "No per-attribute price differentials were available for this session, "
            "so no variable-impact analysis is reported.", sBody))

    # ── Controlled browser-language observation (metadata, not a t-tested driver) ──
    lang_obs = data.get("language_observations") or []
    if isinstance(lang_obs, list) and lang_obs:
        for ob in lang_obs:
            if not isinstance(ob, dict):
                continue
            cl = _esc(ob.get("control_language_label") or ob.get("control_language") or "EN")
            vl = _esc(ob.get("variant_language_label") or ob.get("variant_language") or "variant")
            d_usd = _num(ob.get("delta_usd"))
            d_pct = _num(ob.get("delta_pct"))
            if ob.get("difference_detected") and d_usd is not None:
                body = (
                    f"Browser-language comparison is based on a controlled "
                    f"Accept-Language pair (every other vector held identical; only "
                    f"the browser language differs). For the {cl} vs {vl} pair, the "
                    f"price differed by {_money(d_usd)}"
                    + (f" ({d_pct:+.1f}%)" if d_pct is not None else "")
                    + ". This is reported as a controlled observation, not a "
                    "statistically-tested driver."
                )
            else:
                body = (
                    f"Browser-language comparison is based on a controlled "
                    f"Accept-Language pair ({cl} vs {vl}, every other vector held "
                    "identical). No price difference was observed between the two "
                    "languages. Reported as a controlled observation, not a driver."
                )
            story.append(Spacer(1, 4))
            story.append(Paragraph(body, sBody))

    # 4b. Per-agent evidence appendix (raw captured prices).
    # Only REAL probes belong in the evidence appendix. Exclude exact-uniform-gate
    # agents (inferred=True): they copy a real probe's price for display but were
    # never independently fetched, so presenting their "evidence" would imply a
    # probe that did not happen.
    ev_agents = [
        a for a in agents
        if not a.get("inferred")
        and isinstance(a.get("evidence"), dict)
        and a["evidence"].get("extraction_method") not in (None, "none", "")
    ]
    if ev_agents:
        story.append(Paragraph(
            f"Table 3 lists raw price evidence captured directly from the rendered "
            f"page for {len(ev_agents)} of {total_agents} identities. Every identity "
            f"requests the <i>same product</i>; the buyer columns describe the "
            f"simulated shopper &mdash; their location, device, and browser language "
            f"&mdash; not the item being priced.", sBody))
        e_head = [
            Paragraph("Agent", sTblHead),
            Paragraph("Buyer location", sTblHead),
            Paragraph("Buyer device", sTblHead),
            Paragraph("Buyer language", sTblHead),
            Paragraph("Native price", sTblHeadR),
            Paragraph("USD (norm.)", sTblHeadR),
            Paragraph("Raw text", sTblHead),
            Paragraph("Method", sTblHead),
        ]
        e_data = [e_head]
        for a in ev_agents[:24]:
            ev = a.get("evidence") or {}
            # Native price + currency: prefer the agent-level fields, fall back
            # to the evidence dict; render n/a when truly absent.
            a_native_val = a.get("native_price")
            if a_native_val is None:
                a_native_val = ev.get("native_price")
            a_native_ccy = a.get("native_currency") or ev.get("native_currency")
            native_cell = (f"{_esc(a_native_ccy)} {_num(a_native_val):,.2f}"
                           if (_num(a_native_val) is not None and a_native_ccy) else "n/a")
            usd_val = a.get("normalized_price_usd")
            if usd_val is None:
                usd_val = a.get("price")
            # Browser language: prefer agent-level, fall back to evidence dict.
            lang_cell = (a.get("browser_language")
                         or ev.get("browser_language") or "n/a")
            e_data.append([
                Paragraph(_esc(a.get("agent_id") or "n/a"), sCell),
                Paragraph(_esc(_titleize(a.get("location")) or "n/a"), sCellMuted),
                Paragraph(_esc(_titleize(a.get("device")) or "n/a"), sCellMuted),
                Paragraph(_esc(lang_cell), sCellMuted),
                Paragraph(native_cell, sCellR),
                Paragraph(_money(usd_val), sCellR),
                Paragraph(_esc(ev.get("price_raw_text") or "n/a"), sCellMuted),
                Paragraph(_esc(ev.get("extraction_method") or "n/a"), sCellMuted),
            ])
        w = CONTENT_W
        ecw = [w * 0.10, w * 0.13, w * 0.12, w * 0.11, w * 0.13, w * 0.12, w * 0.15, w * 0.14]
        e_table = Table(e_data, colWidths=ecw, hAlign="CENTER", repeatRows=1)
        e_table.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ("LEFTPADDING", (0, 0), (-1, -1), 3),
            ("RIGHTPADDING", (0, 0), (-1, -1), 3),
            ("LINEABOVE", (0, 0), (-1, 0), 1.1, RULE),
            ("LINEBELOW", (0, 0), (-1, 0), 0.6, RULE),
            ("LINEBELOW", (0, 1), (-1, -2), 0.25, HAIR),
            ("LINEBELOW", (0, -1), (-1, -1), 1.1, RULE),
        ]))
        story.append(Spacer(1, 4))
        story.append(e_table)
        story.append(Paragraph(
            f"Table 3. Raw on-page price evidence ({real_probes} real probes"
            + (f", {filled} identities skipped under the uniform gate" if filled > 0 else "")
            + ").", sCaption))
    else:
        story.append(Paragraph(
            "No raw price evidence was captured for this session. Evidence capture "
            "requires a live probe; demo and cached results do not retain on-page "
            "excerpts.", sBody))

    # ---- 5. Conclusion ------------------------------------------------------
    story.append(Paragraph("5.&nbsp;&nbsp;Conclusion", sSection))
    concl = (
        f"The audited target, <b>{_esc(display_name)}</b>, exhibits a "
        f"<b>{_esc(topo)}</b> pricing topology"
    )
    if score is not None:
        concl += f" with a discrimination score of {score:.0f}/100 ({_esc(sev_label.lower())} severity)"
    concl += ". "
    if topo == "uniform":
        concl += ("No actionable price discrimination was detected along the tested "
                  "attributes; the listing appears to present a single price to all "
                  "buyer contexts.")
    elif top_driver is not None and spread is not None and spread > 0:
        concl += (f"The {_esc(_titleize(top_driver.get('variable_name')))} attribute "
                  f"is the primary driver, contributing the largest price gap. The "
                  f"captured evidence in Section&nbsp;4 supports independent "
                  f"verification of every observation.")
    else:
        concl += ("Where price differences appeared, the per-attribute evidence in "
                  "Section&nbsp;4 documents the magnitude and statistical support for "
                  "each observation.")
    story.append(Paragraph(concl, sBody))

    story.append(Spacer(1, 6))
    story.append(HRFlowable(width="100%", thickness=0.4, color=HAIR,
                            spaceBefore=2, spaceAfter=4))
    story.append(Paragraph(
        "<i>Prepared by JACOBI Pricing Intelligence. Prices are normalised for "
        "comparison; raw on-page values are preserved in the evidence appendix. "
        "This report is generated automatically from probe data and contains no "
        "fabricated values &mdash; absent fields are reported as &lsquo;n/a&rsquo;.</i>",
        S("Disc", fontName="Times-Italic", fontSize=8, leading=11, textColor=GREY)))

    doc.build(story, onFirstPage=_on_page, onLaterPages=_on_page)
    buf.seek(0)

    return StreamingResponse(
        buf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="jacobi-probe-{report_id}.pdf"'},
    )


def _price_axis_figure(width, rmin, rmax, baseline, mean,
                       hair, rule, ink, grey, accent):
    """A clean horizontal price axis with min/max/baseline/mean ticks (greyscale).

    All inputs are pre-coerced floats except baseline/mean which may be None.
    Guarded against a zero-width span.
    """
    h = 58.0
    d = Drawing(width, h)
    pad = 6.0
    axis_y = 30.0
    x0 = pad
    x1 = width - pad
    track_w = x1 - x0

    span = (rmax - rmin)
    if span <= 0:
        span = 1.0  # single-price case: collapse ticks to centre

    def _x(val):
        if val is None:
            return None
        frac = (val - rmin) / span
        frac = max(0.0, min(1.0, frac))
        return x0 + frac * track_w

    # Light track + baseline axis line.
    d.add(Rect(x0, axis_y - 1.5, track_w, 3.0, fillColor=hair, strokeColor=None))
    d.add(Line(x0, axis_y, x1, axis_y, strokeColor=rule, strokeWidth=0.8))

    # End ticks (min / max).
    for val, lbl, anchor in ((rmin, f"${rmin:,.0f}", "start"),
                             (rmax, f"${rmax:,.0f}", "end")):
        xv = _x(val)
        d.add(Line(xv, axis_y - 5, xv, axis_y + 5, strokeColor=rule, strokeWidth=0.8))
        s = String(xv, axis_y - 16, lbl, fontName="Times-Roman", fontSize=7.5,
                   fillColor=grey)
        s.textAnchor = anchor
        d.add(s)

    # Mean marker (grey, below).
    if mean is not None and rmax > rmin:
        xm = _x(mean)
        d.add(Line(xm, axis_y - 7, xm, axis_y + 7, strokeColor=grey, strokeWidth=0.8))
        sm = String(xm, axis_y - 16, f"mean ${mean:,.0f}", fontName="Times-Italic",
                    fontSize=7, fillColor=grey)
        sm.textAnchor = "middle"
        d.add(sm)

    # Baseline marker (dark accent, above).
    if baseline is not None:
        xb = _x(baseline)
        d.add(Line(xb, axis_y - 9, xb, axis_y + 9, strokeColor=accent, strokeWidth=1.4))
        sb = String(xb, axis_y + 13, f"baseline ${baseline:,.0f}",
                    fontName="Times-Bold", fontSize=7.5, fillColor=accent)
        sb.textAnchor = "middle"
        d.add(sb)

    return d


def _impact_bars_figure(width, gradients, num, titleize, esc,
                        barfill, barlite, sigred, ink, grey, hair):
    """Horizontal greyscale bars of |delta| per attribute. Returns None if no data.

    Significant attributes are drawn darker; significant labels are dark red.
    Guarded against empty/zero deltas.
    """
    rows = []
    for g in gradients:
        delta = abs(num(g.get("delta")) or 0.0)
        rows.append((titleize(g.get("variable_name")) or "n/a",
                     delta, bool(g.get("significant"))))
    if not rows:
        return None
    max_delta = max((r[1] for r in rows), default=0.0)

    label_w = min(120.0, width * 0.30)
    val_w = 60.0
    bar_area = width - label_w - val_w - 8.0
    if bar_area < 20:
        bar_area = max(20.0, width * 0.4)

    row_h = 17.0
    top_pad = 4.0
    h = top_pad + row_h * len(rows) + 4.0
    d = Drawing(width, h)

    y = h - top_pad - row_h
    for name, delta, sig in rows:
        cy = y + row_h / 2.0
        # Attribute label (left, right-aligned to the bar start).
        lbl = String(label_w - 6, cy - 3, name[:22],
                     fontName="Times-Roman", fontSize=8, fillColor=ink)
        lbl.textAnchor = "end"
        d.add(lbl)
        # Bar.
        if max_delta > 0 and delta > 0:
            bw = (delta / max_delta) * bar_area
        else:
            bw = 0.0
        bw = max(bw, 1.0) if delta > 0 else 0.0
        if bw > 0:
            d.add(Rect(label_w, cy - 5, bw, 10,
                       fillColor=(barfill if sig else barlite), strokeColor=None))
        # Value label.
        vstr = f"${delta:,.0f}"
        vs = String(label_w + max(bw, 0) + 5, cy - 3, vstr,
                    fontName=("Times-Bold" if sig else "Times-Roman"),
                    fontSize=7.5, fillColor=(sigred if sig else grey))
        vs.textAnchor = "start"
        d.add(vs)
        y -= row_h

    return d

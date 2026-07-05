"""
Jacobi for Agents — agent price-provenance evidence PDF.

One page-flowing SimpleDocTemplate that renders a DecisionEnvelope (+ optional
EvidenceManifest) as a human-readable evidence receipt. Mirrors the reportlab
idioms in enterprise_reports.py (style sheet, _escape/_text helpers, Table +
TableStyle, doc.build → buffer.getvalue). No fancy design — this is a receipt.

Safe-use invariant surfaced on every page: Jacobi never executes purchases, and
local evidence does not prove real IP geography.
"""

from __future__ import annotations

import io
from typing import Optional

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from .schemas import DecisionEnvelope, EvidenceManifest


def _text(value, fallback="n/a"):
    value = "" if value is None else str(value).strip()
    return value or fallback


def _escape(value):
    return _text(value, "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _money_str(m) -> str:
    if m is None:
        return "n/a"
    label = f" ({m.label})" if getattr(m, "label", None) else ""
    return f"{m.currency} {m.amount:,.2f}{label}"


def _kv_table(rows, styles):
    table = Table(rows, colWidths=[150, 330], hAlign="LEFT")
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#f2f4f7")),
        ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#d0d5dd")),
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("FONTNAME", (1, 0), (1, -1), "Helvetica"),
        ("FONTSIZE", (0, 0), (-1, -1), 8.5),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("WORDWRAP", (0, 0), (-1, -1), "CJK"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
    ]))
    return table


def _data_table(rows, col_widths, styles):
    table = Table(rows, colWidths=col_widths, repeatRows=1, hAlign="LEFT")
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#111827")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
        ("FONTSIZE", (0, 0), (-1, -1), 7.6),
        ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#d0d5dd")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
    ]))
    return table


def build_evidence_pdf(
    envelope: DecisionEnvelope,
    manifest: Optional[EvidenceManifest] = None,
) -> bytes:
    """Render an agent price-provenance evidence receipt. Returns PDF bytes."""
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        rightMargin=46,
        leftMargin=46,
        topMargin=48,
        bottomMargin=42,
        title="Jacobi Agent Price Provenance Evidence",
    )
    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(name="JxTitle", parent=styles["Title"], fontName="Helvetica-Bold", fontSize=18, leading=22, spaceAfter=10))
    styles.add(ParagraphStyle(name="JxH2", parent=styles["Heading2"], fontName="Helvetica-Bold", fontSize=12, leading=15, spaceBefore=14, spaceAfter=8))
    styles.add(ParagraphStyle(name="JxBody", parent=styles["BodyText"], fontName="Helvetica", fontSize=9.5, leading=13))
    styles.add(ParagraphStyle(name="JxSmall", parent=styles["BodyText"], fontName="Helvetica", fontSize=8, leading=10, textColor=colors.HexColor("#555555")))
    styles.add(ParagraphStyle(name="JxWarn", parent=styles["BodyText"], fontName="Helvetica-Bold", fontSize=9, leading=12, textColor=colors.HexColor("#b42318")))

    story = [Paragraph("JACOBI — Agent Price Provenance Evidence", styles["JxTitle"])]

    if envelope.fixture_mode:
        story.append(Paragraph(
            "FIXTURE DEMO DATA — deterministic synthetic pages, not a live merchant",
            styles["JxWarn"],
        ))
        story.append(Spacer(1, 4))

    # ── Decision ──
    story.append(Paragraph("Decision", styles["JxH2"]))
    story.append(_kv_table([
        ["Request ID", _text(envelope.request_id)],
        ["Decision", _text(envelope.decision.value)],
        ["Provenance score", f"{envelope.provenance_score:.0f}/100"],
        ["Confidence", _text(envelope.confidence.value)],
    ], styles))

    reasons = ", ".join(c.value for c in envelope.reason_codes) or "none"
    story.append(Paragraph("Reason codes", styles["JxH2"]))
    story.append(Paragraph(_escape(reasons), styles["JxBody"]))

    story.append(Paragraph("Explanation", styles["JxH2"]))
    story.append(Paragraph(_escape(envelope.user_explanation or "n/a"), styles["JxBody"]))

    story.append(Paragraph("Recommended action", styles["JxH2"]))
    story.append(Paragraph(_escape(envelope.next_action or "n/a"), styles["JxBody"]))
    story.append(Paragraph(_escape("Agent instruction: " + (envelope.agent_instruction or "n/a")), styles["JxSmall"]))

    # ── Price trace ──
    ps = envelope.price_summary
    story.append(Paragraph("Price trace", styles["JxH2"]))
    trace_rows = [["Stage", "Label", "Amount", "Currency"]]
    for step in ps.price_trace:
        amount = step.get("amount")
        trace_rows.append([
            _text(step.get("stage")),
            Paragraph(_escape(step.get("label")), styles["JxSmall"]),
            f"{amount:,.2f}" if isinstance(amount, (int, float)) else _text(amount),
            _text(step.get("currency")),
        ])
    if len(trace_rows) == 1:
        trace_rows.append(["n/a", "No price trace captured.", "n/a", "n/a"])
    story.append(_data_table(trace_rows, [90, 210, 90, 70], styles))
    if ps.delta_abs is not None:
        pct = f" ({ps.delta_pct:+.1f}%)" if ps.delta_pct is not None else ""
        story.append(Spacer(1, 4))
        story.append(Paragraph(
            _escape(f"Delta vs baseline: {_money_str(ps.delta_abs)}{pct}"),
            styles["JxBody"],
        ))
    fees = ps.mandatory_fees_detected or []
    fee_line = "; ".join(_money_str(f) for f in fees) if fees else "none detected"
    story.append(Paragraph(_escape("Mandatory fees: " + fee_line), styles["JxBody"]))

    # ── Policy ──
    story.append(Paragraph("Policy", styles["JxH2"]))
    pol = envelope.policy
    if pol is not None:
        story.append(_kv_table([
            ["Domain", _text(pol.domain)],
            ["Decision", _text(pol.decision)],
            ["Action mode", _text(pol.action_mode.value)],
            ["Reason", _text(pol.reason)],
        ], styles))
    else:
        story.append(Paragraph("No policy decision recorded.", styles["JxBody"]))

    # ── Score components ──
    sc = envelope.score_components
    story.append(Paragraph("Score components", styles["JxH2"]))
    comp_rows = [["Component", "Score"]]
    for label, val in [
        ("Source legitimacy", sc.source_legitimacy),
        ("Total price integrity", sc.total_price_integrity),
        ("Price stability", sc.price_stability),
        ("Inventory freshness", sc.inventory_freshness),
        ("Policy safety", sc.policy_safety),
        ("Evidence quality", sc.evidence_quality),
        ("User control", sc.user_control),
    ]:
        comp_rows.append([label, f"{val:.0f}/100"])
    story.append(_data_table(comp_rows, [280, 90], styles))

    # ── Evidence ──
    ev = envelope.evidence
    story.append(Paragraph("Evidence", styles["JxH2"]))
    story.append(_kv_table([
        ["Manifest ID", _text(ev.manifest_id)],
        ["Manifest SHA-256", _text(ev.manifest_sha256)],
        ["Capability tier", _text(ev.capability_tier.value)],
    ], styles))

    if manifest is not None:
        cs = manifest.capability_summary
        flags = [name for name, on in [
            ("local_browser", cs.local_browser),
            ("local_http", cs.local_http),
            ("managed_request", cs.managed_request),
            ("managed_browser", cs.managed_browser),
            ("official_api", cs.official_api),
            ("real_ip_geography", cs.real_ip_geography),
            ("locale_emulation", cs.locale_emulation),
            ("timezone_emulation", cs.timezone_emulation),
            ("screenshot", cs.screenshot),
            ("trace_zip", cs.trace_zip),
            ("network_log", cs.network_log),
            ("fixture_mode", cs.fixture_mode),
        ] if on]
        story.append(Paragraph(
            _escape("Capability summary: " + (", ".join(flags) or "none")),
            styles["JxSmall"],
        ))

    limitations = list(ev.limitations)
    if manifest is not None:
        for lim in manifest.limitations:
            if lim not in limitations:
                limitations.append(lim)
    story.append(Paragraph("Limitations", styles["JxH2"]))
    if limitations:
        for lim in limitations:
            story.append(Paragraph("• " + _escape(lim), styles["JxBody"]))
    else:
        story.append(Paragraph("None recorded.", styles["JxBody"]))

    # ── Artifacts ──
    artifacts = list(manifest.artifacts) if manifest is not None else []
    story.append(Paragraph("Artifacts", styles["JxH2"]))
    art_rows = [["Kind", "SHA-256", "Bytes"]]
    for art in artifacts:
        art_rows.append([
            _text(art.kind),
            Paragraph(_escape(art.sha256), styles["JxSmall"]),
            _text(art.bytes),
        ])
    if len(art_rows) == 1:
        art_rows.append(["n/a", "No artifacts captured (claim-only / blocked route).", "n/a"])
    story.append(_data_table(art_rows, [80, 320, 60], styles))

    story.append(Spacer(1, 8))
    story.append(Paragraph(
        _escape(f"Evidence freshness (TTL): {envelope.ttl_seconds} seconds — re-verify after this window."),
        styles["JxSmall"],
    ))

    # ── Footer safe-use line ──
    story.append(Spacer(1, 10))
    story.append(Paragraph(
        "Jacobi never executes purchases. Local evidence does not prove real IP geography.",
        styles["JxSmall"],
    ))

    doc.build(story)
    return buffer.getvalue()

"""Enterprise MAP report generation and public-share redaction helpers."""

from __future__ import annotations

import copy
import hashlib
import io
import json
from urllib.parse import urlsplit

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


def _num(value):
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _money(value, currency="USD"):
    number = _num(value)
    if number is None:
        return "n/a"
    return f"{currency or 'USD'} {number:,.2f}"


def _text(value, fallback="n/a"):
    value = "" if value is None else str(value).strip()
    return value or fallback


def _escape(value):
    return _text(value, "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _redact_url(url: str | None) -> str:
    if not url:
        return ""
    try:
        parsed = urlsplit(url)
        return parsed.netloc or "redacted"
    except Exception:
        return "redacted"


# Fields safe to expose on an ANONYMOUS external share. Everything else on the
# share_tokens row (id, organization_id, finding_id, created_by, revoked_by) is
# internal workspace metadata and is dropped so a public share never leaks it.
_EXTERNAL_SHARE_TOKEN_FIELDS = (
    "scope", "redacted", "expires_at", "created_at", "revoked_at", "last_accessed_at",
)


def external_share_token_view(share_token: dict | None) -> dict:
    """Whitelist a share_token row for anonymous (public share) consumers.

    The owner-facing workspace listing keeps the full row (it's the owner's own
    org); this is only for the unauthenticated /shared-findings endpoint.
    """
    st = share_token or {}
    return {k: st[k] for k in _EXTERNAL_SHARE_TOKEN_FIELDS if k in st}


def redact_packet(packet: dict, *, redacted: bool) -> dict:
    """Return a report/share packet with external-safe fields removed."""
    data = copy.deepcopy(packet)
    if not redacted:
        return data

    org = data.get("organization") or {}
    data["organization"] = {"name": org.get("name") or "Shared workspace"}

    item = data.get("watchlist_item") or {}
    if item.get("target_url"):
        item["target_url"] = _redact_url(item["target_url"])
    data["watchlist_item"] = item

    for row in data.get("evidence_items") or []:
        if row.get("target_url"):
            row["target_url"] = _redact_url(row["target_url"])
        row["probe_session_id"] = None
        metadata = row.get("metadata") if isinstance(row.get("metadata"), dict) else {}
        metadata.pop("probe_row_id", None)
        metadata.pop("extraction_evidence", None)
        row["metadata"] = metadata

    # Strip internal workspace identifiers from a redacted (external) packet so a
    # public share / redacted export never leaks the customer's org / scan /
    # finding structure. Display fields (seller name+domain, product name, prices,
    # buyer_context, the domain-only URL) are intentionally KEPT — they are the
    # evidence the share is meant to convey.
    def _strip_internal_ids(obj: object) -> None:
        if not isinstance(obj, dict):
            return
        for key in ("id", "organization_id", "scan_job_id", "watchlist_item_id",
                    "product_id", "seller_id", "finding_id", "created_by",
                    "requested_by"):
            obj.pop(key, None)

    for key in ("finding", "product", "seller", "watchlist_item"):
        _strip_internal_ids(data.get(key))
    for row in data.get("evidence_items") or []:
        _strip_internal_ids(row)
        for nested in ("finding", "product", "seller", "watchlist_item"):
            _strip_internal_ids(row.get(nested))
    return data


def evidence_checksum(packet: dict) -> str:
    evidence = packet.get("evidence_items") or []
    payload = json.dumps(evidence, sort_keys=True, default=str, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def packet_json_bytes(packet: dict, *, redacted: bool) -> bytes:
    data = redact_packet(packet, redacted=redacted)
    data["evidence_checksum_sha256"] = evidence_checksum(data)
    return json.dumps(data, indent=2, sort_keys=True, default=str).encode("utf-8")


def generate_map_pdf(packet: dict, *, redacted: bool) -> bytes:
    data = redact_packet(packet, redacted=redacted)
    checksum = evidence_checksum(data)
    finding = data.get("finding") or {}
    product = data.get("product") or {}
    seller = data.get("seller") or {}
    item = data.get("watchlist_item") or {}
    evidence = data.get("evidence_items") or []
    currency = finding.get("currency") or product.get("currency") or "USD"
    target_label = item.get("target_url") or (evidence[0].get("target_url") if evidence else "")

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        rightMargin=46,
        leftMargin=46,
        topMargin=48,
        bottomMargin=42,
        title="Jacobi MAP Evidence Report",
    )
    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(name="JacobiTitle", parent=styles["Title"], fontName="Helvetica-Bold", fontSize=19, leading=23, spaceAfter=12))
    styles.add(ParagraphStyle(name="JacobiH2", parent=styles["Heading2"], fontName="Helvetica-Bold", fontSize=12, leading=15, spaceBefore=14, spaceAfter=8))
    styles.add(ParagraphStyle(name="JacobiBody", parent=styles["BodyText"], fontName="Helvetica", fontSize=9.5, leading=13))
    styles.add(ParagraphStyle(name="JacobiSmall", parent=styles["BodyText"], fontName="Helvetica", fontSize=8, leading=10, textColor=colors.HexColor("#555555")))

    story = [
        Paragraph("Jacobi MAP Evidence Report", styles["JacobiTitle"]),
        Paragraph(
            f"{_escape(product.get('name') or 'Unknown product')} | {_escape(seller.get('name') or seller.get('domain') or 'Unknown seller')}",
            styles["JacobiBody"],
        ),
        Spacer(1, 8),
    ]

    summary_rows = [
        ["Finding ID", _text(finding.get("id"))],
        ["Status", _text(finding.get("status"))],
        ["Severity", _text(finding.get("severity"))],
        ["Confidence", _text(finding.get("confidence"))],
        ["Observed price", _money(finding.get("observed_price"), currency)],
        ["MAP floor", _money(finding.get("map_floor"), currency)],
        ["Below floor", f"{_num(finding.get('spread_pct')) or 0:.2f}%"],
        ["Target", _text(target_label)],
        ["Redaction", "External redacted packet" if redacted else "Internal full packet"],
        ["Evidence checksum", checksum],
    ]
    table = Table(summary_rows, colWidths=[120, 360], hAlign="LEFT")
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
    story.extend([table, Spacer(1, 10)])

    story.append(Paragraph("Evidence Summary", styles["JacobiH2"]))
    story.append(Paragraph(_escape(finding.get("evidence_summary") or "No written evidence summary was captured."), styles["JacobiBody"]))

    story.append(Paragraph("Captured Observations", styles["JacobiH2"]))
    rows = [["Captured", "Buyer context", "Price", "Source", "Extraction"]]
    for row in evidence[:40]:
        rows.append([
            _text(row.get("captured_at"))[:19],
            Paragraph(_escape(row.get("buyer_context")), styles["JacobiSmall"]),
            _money(row.get("observed_price"), row.get("currency") or currency),
            _text(row.get("source")),
            _text(row.get("extraction_method")),
        ])
    if len(rows) == 1:
        rows.append(["n/a", "No evidence rows are attached to this finding.", "n/a", "n/a", "n/a"])
    evidence_table = Table(rows, colWidths=[88, 180, 80, 70, 90], repeatRows=1, hAlign="LEFT")
    evidence_table.setStyle(TableStyle([
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
    story.append(evidence_table)
    story.append(Spacer(1, 10))
    story.append(Paragraph(
        "This report records observed price-integrity evidence for professional review. It is not a legal conclusion.",
        styles["JacobiSmall"],
    ))
    doc.build(story)
    return buffer.getvalue()

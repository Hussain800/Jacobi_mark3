"""SEC-1: a redacted external share/export must not leak internal workspace
identifiers (org / scan / finding / product / seller ids), while keeping the
evidence fields that the share is meant to convey.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from enterprise_reports import redact_packet, external_share_token_view  # noqa: E402


def _sample_packet() -> dict:
    return {
        "organization": {"id": "org-1", "name": "Acme Brands"},
        "finding": {
            "id": "f1", "organization_id": "org-1", "scan_job_id": "s1",
            "product_id": "p1", "seller_id": "se1", "watchlist_item_id": "w1",
            "type": "MAP_UNDERCUT", "observed_price": 176, "map_floor": 199,
            "spread_pct": 11.56, "currency": "USD",
        },
        "product": {"id": "p1", "organization_id": "org-1", "name": "Pro Headphones", "sku": "JCB-HP-001"},
        "seller": {"id": "se1", "organization_id": "org-1", "name": "MegaDeals", "domain": "megadeals.example"},
        "watchlist_item": {"id": "w1", "organization_id": "org-1", "target_url": "https://megadeals.example/p/x"},
        "evidence_items": [
            {
                "id": "e1", "organization_id": "org-1", "finding_id": "f1", "scan_job_id": "s1",
                "buyer_context": "US - datacenter", "observed_price": 168,
                "target_url": "https://megadeals.example/p/x?ref=abc",
                "probe_session_id": "ps1", "metadata": {"probe_row_id": "r1"},
            }
        ],
    }


def test_redacted_packet_strips_internal_ids():
    out = redact_packet(_sample_packet(), redacted=True)

    internal = ("id", "organization_id", "scan_job_id", "watchlist_item_id",
                "product_id", "seller_id", "finding_id")
    for key in internal:
        assert key not in out["finding"], f"finding leaked {key}"
    for key in ("id", "organization_id"):
        assert key not in out["product"], f"product leaked {key}"
        assert key not in out["seller"], f"seller leaked {key}"
        assert key not in out["watchlist_item"], f"watchlist_item leaked {key}"
    ev = out["evidence_items"][0]
    for key in ("id", "organization_id", "finding_id", "scan_job_id"):
        assert key not in ev, f"evidence leaked {key}"

    # org reduced to name only
    assert out["organization"] == {"name": "Acme Brands"}
    # evidence-bearing display fields are KEPT
    assert out["seller"]["name"] == "MegaDeals"
    assert out["seller"]["domain"] == "megadeals.example"
    assert out["product"]["name"] == "Pro Headphones"
    assert ev["observed_price"] == 168
    assert ev["buyer_context"] == "US - datacenter"
    # existing redactions still hold
    assert ev["target_url"] == "megadeals.example"
    assert ev["probe_session_id"] is None
    assert "probe_row_id" not in ev["metadata"]


def test_unredacted_packet_keeps_internal_ids():
    out = redact_packet(_sample_packet(), redacted=False)
    assert out["finding"]["id"] == "f1"
    assert out["finding"]["organization_id"] == "org-1"
    assert out["evidence_items"][0]["organization_id"] == "org-1"


def test_external_share_token_view_drops_internal_ids():
    # SEC-1b: the share_token object returned to an anonymous viewer alongside
    # the packet must not leak internal workspace ids.
    row = {
        "id": "t1", "organization_id": "org-1", "finding_id": "f1",
        "created_by": "user-9", "revoked_by": None,
        "token_hash": "hash-should-never-appear",
        "scope": "finding", "redacted": True,
        "expires_at": "2026-01-01T00:00:00Z", "created_at": "2025-01-01T00:00:00Z",
        "revoked_at": None, "last_accessed_at": None,
    }
    out = external_share_token_view(row)
    for leaked in ("id", "organization_id", "finding_id", "created_by", "revoked_by", "token_hash"):
        assert leaked not in out, f"share_token leaked {leaked}"
    assert out["scope"] == "finding"
    assert out["redacted"] is True
    assert out["expires_at"] == "2026-01-01T00:00:00Z"


def test_external_share_token_view_handles_none():
    assert external_share_token_view(None) == {}

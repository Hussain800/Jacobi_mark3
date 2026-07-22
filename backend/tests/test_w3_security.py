"""W3 security regression tests: SSRF redirect TOCTOU, org-member role
escalation, and authorization boundaries."""
import pytest


def test_role_escalation_via_invite_is_blocked(client, monkeypatch):
    # An invite must not be creatable with the owner role - owner can
    # only be assigned through a transfer, never via the invite path.
    from auth_user import get_optional_user
    import main as M
    M.app.dependency_overrides[get_optional_user] = lambda: {"id": "owner-user", "email": "owner@example.test"}
    try:
        r = client.post(
            "/api/enterprise/invites",
            json={"email": "evil@example.com", "role": "owner"},
        )
        assert r.status_code == 400
    finally:
        M.app.dependency_overrides.pop(get_optional_user, None)


def test_cross_org_member_read_returns_404(client, monkeypatch):
    # A valid key from org-beta must not see org-alpha decisions.
    # Configure API keys (mirrors test_agentcore_auth.py fixture pattern).
    monkeypatch.setenv("JACOBI_AGENT_API_KEYS", "k-alpha:org-alpha,k-beta:org-beta")
    r = client.post(
        "/api/v1/agent/verify",
        json={"url": "fixture://lodging/listing"},
        headers={"X-Api-Key": "k-alpha"},
    )
    assert r.status_code == 200
    rid = r.json()["request_id"]
    # org-beta key must not read org-alpha decision (no existence leak)
    assert client.get(
        f"/api/v1/agent/decisions/{rid}", headers={"X-Api-Key": "k-beta"}
    ).status_code == 404


def test_local_http_provider_rejects_redirect_to_private(monkeypatch):
    # LocalHttpProvider must not follow a 302 from a public URL into a
    # private/metadata address. Stands in for the SSRF redirect TOCTOU.
    import http.server
    import threading
    from agentcore.providers import LocalHttpProvider

    class Redirector(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            if self.path == "/private":
                body = b"<html><body>internal</body></html>"
                self.send_response(200)
                self.send_header("Content-Type", "text/html")
                self.end_headers()
                self.wfile.write(body)
            else:
                self.send_response(302)
                self.send_header("Location", "/private")
                self.end_headers()

        def log_message(self, *a):
            pass

    srv = http.server.HTTPServer(("127.0.0.1", 0), Redirector)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    start_url = f"http://127.0.0.1:{srv.server_port}/page"

    from agentcore import providers as prov

    def allow_start_only(url):
        # Allow the start path; reject the redirect landing path - stands in
        # for a public URL 302ing to a private/metadata address.
        from url_guard import UnsafeUrlError
        if "/private" in url:
            raise UnsafeUrlError("non-public address blocked in test")
        return url

    monkeypatch.setattr(prov, "validate_public_url", allow_start_only)
    try:
        attempt = LocalHttpProvider().collect(start_url, "listing")
    finally:
        srv.shutdown()

    assert attempt.error is not None and "redirect" in attempt.error
    assert attempt.artifacts == []


def test_local_http_provider_blocks_unsafe_start_url(monkeypatch):
    # A non-public start URL is rejected before any fetch.
    from agentcore.providers import LocalHttpProvider
    attempt = LocalHttpProvider().collect("http://127.0.0.1/", "listing")
    assert attempt.error is not None
    assert attempt.artifacts == []


def test_evidence_export_requires_export_permission(monkeypatch):
    # A viewer (workspace.read only) must not export evidence even when
    # they belong to the same org and can resolve the finding.
    import asyncio
    import enterprise_store
    from enterprise_access import EnterprisePermissionError
    monkeypatch.setattr(enterprise_store, "get_supabase", lambda: None)
    enterprise_store._MEMORY_WORKSPACES.clear()
    try:
        _seed_viewer_finding()
        asyncio.run(enterprise_store.record_evidence_export(
            "viewer-user", _FINDING_ID,
            format="json", checksum_sha256="x", byte_size=0, redacted=True,
        ))
        assert False, "viewer should not export"
    except EnterprisePermissionError:
        pass
    finally:
        enterprise_store._MEMORY_WORKSPACES.clear()


_FINDING_ID = ""


def _seed_viewer_finding():
    global _FINDING_ID
    import asyncio
    import enterprise_store

    async def seed():
        created = await enterprise_store.create_watchlist(
            "owner-user", {"name": "W", "cadence": "daily", "workflow_type": "map"}
        )
        wid = created["created_watchlist"]["id"]
        csv_text = chr(10).join([
            "product_name,sku,map_floor,currency,seller_name,seller_domain,target_url,market,observed_price,coverage_pct",
            "Pro Wireless Headphones,JCB-HP-001,199,USD,MegaDeals,megadeals.example,https://megadeals.example/p/pro-wireless,US,176,92",
        ])
        await enterprise_store.import_watchlist_items("owner-user", wid, csv_text)
        scan = await enterprise_store.launch_scan_job(
            "owner-user", {"watchlist_id": wid, "audit_depth": "smart24", "limit": 10, "run_mode": "imported"}
        )
        finding_id = scan["findings"][0]["id"]
        # Add a viewer member to the owner workspace
        workspace = enterprise_store._MEMORY_WORKSPACES["owner-user"]
        workspace["members"].append({
            "id": "m-viewer", "organization_id": workspace["organization"]["id"],
            "user_id": "viewer-user", "email": None, "role": "viewer",
            "created_at": enterprise_store._now(),
        })
        # Mirror Supabase org membership: viewer resolves findings in the same workspace
        enterprise_store._MEMORY_WORKSPACES["viewer-user"] = workspace
        return finding_id

    _FINDING_ID = asyncio.run(seed())

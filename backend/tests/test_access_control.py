from fastapi import HTTPException

import main as M
from auth_user import get_optional_user


def _owned_session(session_id: str, *, owner: str = "owner-user", public: bool = False) -> dict:
    session = dict(M.DEMO_RESULT)
    session["session_id"] = session_id
    session["user_id"] = owner
    session["is_public"] = public
    session["is_demo"] = False
    return session


def _as_user(user_id: str):
    return {"id": user_id, "email": f"{user_id}@example.test"}


def _set_user(user):
    M.app.dependency_overrides[get_optional_user] = lambda: user


def _clear_user():
    M.app.dependency_overrides.pop(get_optional_user, None)


def test_result_requires_owner_for_owned_session(client):
    sid = "owned_result_acl"
    M.SESSION_STORE[sid] = _owned_session(sid)
    try:
        assert client.get(f"/api/result/{sid}").status_code == 404

        _set_user(_as_user("owner-user"))
        assert client.get(f"/api/result/{sid}").status_code == 200

        _set_user(_as_user("other-user"))
        assert client.get(f"/api/result/{sid}").status_code == 404
    finally:
        _clear_user()
        M.SESSION_STORE.pop(sid, None)


def test_share_only_exposes_public_owned_session(client):
    private_sid = "private_share_acl"
    public_sid = "public_share_acl"
    M.SESSION_STORE[private_sid] = _owned_session(private_sid, public=False)
    M.SESSION_STORE[public_sid] = _owned_session(public_sid, public=True)
    try:
        assert client.get(f"/api/share/{private_sid}").status_code == 404
        assert client.get(f"/api/share/{public_sid}").status_code == 200
    finally:
        M.SESSION_STORE.pop(private_sid, None)
        M.SESSION_STORE.pop(public_sid, None)


def test_pdf_export_requires_owner_for_owned_session(client):
    sid = "owned_export_acl"
    M.SESSION_STORE[sid] = _owned_session(sid)
    try:
        assert client.get(f"/api/export/{sid}/pdf").status_code == 404

        _set_user(_as_user("owner-user"))
        response = client.get(f"/api/export/{sid}/pdf")
        assert response.status_code == 200
        assert response.content[:5] == b"%PDF-"
    finally:
        _clear_user()
        M.SESSION_STORE.pop(sid, None)


def test_probe_rate_limiter_sets_retry_after(monkeypatch):
    class Client:
        host = "203.0.113.10"

    class Request:
        client = Client()

    M._PROBE_RATE_BUCKETS.clear()
    monkeypatch.setattr(M, "PROBE_RATE_LIMIT_MAX_REQUESTS", 2)
    monkeypatch.setattr(M, "PROBE_RATE_LIMIT_WINDOW_SECONDS", 60)

    user = _as_user("rate-user")
    M._enforce_probe_rate_limit(Request(), user)
    M._enforce_probe_rate_limit(Request(), user)

    try:
        M._enforce_probe_rate_limit(Request(), user)
    except HTTPException as exc:
        assert exc.status_code == 429
        assert exc.headers["Retry-After"].isdigit()
    else:
        raise AssertionError("expected rate limit HTTPException")

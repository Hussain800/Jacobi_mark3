"""
Quota charging rules for _complete_probe_in_background.

A probe that provably launched zero agents (real_probes_executed == 0, e.g.
the pre-flight needs_context rejection of a dateless Booking URL) incurred no
BrightData cost and must NOT consume a monthly probe credit. Anything that did
(or may have) run real agents still charges — including crash/timeout paths
where accounting is unknown (real_probes_executed is None).
"""
import asyncio

import main as M
import profile_store


def _run_background(monkeypatch, engine_result: dict) -> list:
    """Drive _complete_probe_in_background with a stubbed engine/persistence;
    returns the list of user_ids increment_probe_count was called with."""
    increments: list = []

    async def fake_engine(session, url, agent_configs=None):
        session.update(engine_result)
        return session

    async def fake_update(row_id, session):
        return row_id

    async def fake_increment(user_id):
        increments.append(user_id)

    monkeypatch.setattr(M, "_run_probe_engine", fake_engine)
    monkeypatch.setattr(M, "update_probe", fake_update)
    monkeypatch.setattr(M, "increment_probe_count", fake_increment)

    sid, session = M.create_session("https://www.booking.com/hotel/in/x.html", "t")
    session["_probe_row_id"] = "row-1"  # early persist landed
    asyncio.run(M._complete_probe_in_background(
        session=session, url=session["target_url"],
        user_id="user-1", publish_to_board=False))
    return increments


def test_needs_context_zero_probes_does_not_charge(monkeypatch):
    increments = _run_background(monkeypatch, {
        "status": "needs_context",
        "error": "Travel pricing requires dates and occupancy…",
        "real_probes_executed": 0,
    })
    assert increments == []


def test_completed_probe_charges(monkeypatch):
    increments = _run_background(monkeypatch, {
        "status": "completed",
        "real_probes_executed": 5,
    })
    assert increments == ["user-1"]


def test_unknown_accounting_still_charges(monkeypatch):
    # Crash/timeout mid-run: accounting never set — agents may have fetched,
    # so the conservative rule is to charge.
    increments = _run_background(monkeypatch, {
        "status": "failed",
    })
    assert increments == ["user-1"]


def test_quota_store_unavailable_fails_closed(monkeypatch):
    async def unavailable(_user_id):
        return None

    monkeypatch.setattr(profile_store, "ensure_profile", unavailable)
    try:
        asyncio.run(profile_store.can_run_probe("user-1"))
        assert False, "quota checks must not fail open when the store is unavailable"
    except profile_store.QuotaUnavailableError:
        pass

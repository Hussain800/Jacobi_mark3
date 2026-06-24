"""SESSION_STORE is bounded — no per-probe memory leak on long-lived workers."""

import main as M


def test_session_store_evicts_oldest_beyond_cap(monkeypatch):
    monkeypatch.setattr(M, "MAX_SESSION_STORE", 3)
    M.SESSION_STORE.clear()
    ids = [M.create_session(f"https://x{i}.example", f"t{i}")[0] for i in range(6)]
    assert len(M.SESSION_STORE) <= 3
    assert ids[-1] in M.SESSION_STORE     # newest retained
    assert ids[0] not in M.SESSION_STORE  # oldest evicted
    M.SESSION_STORE.clear()


def test_session_store_cap_disabled_when_zero(monkeypatch):
    monkeypatch.setattr(M, "MAX_SESSION_STORE", 0)
    M.SESSION_STORE.clear()
    for i in range(5):
        M.create_session(f"https://y{i}.example", f"t{i}")
    assert len(M.SESSION_STORE) == 5
    M.SESSION_STORE.clear()

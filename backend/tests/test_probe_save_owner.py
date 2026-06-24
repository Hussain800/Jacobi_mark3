"""P0-3: save_probe must never persist an ownerless probe.

If the `user_id` column is missing (migration not applied), the save must fail
(return None) rather than silently drop the owner and write an unowned row.
Optional board-visibility columns (is_public/is_demo) may still be dropped.
"""

import asyncio

import supabase_client


class _Result:
    def __init__(self, data):
        self.data = data


class _Builder:
    def __init__(self, parent, row):
        self.parent = parent
        self.row = row

    def execute(self):
        self.parent.attempts.append(dict(self.row))
        self.parent.raise_check(self.row)
        return _Result([{"id": "probe-123"}])


class _Table:
    def __init__(self, parent):
        self.parent = parent

    def insert(self, row):
        return _Builder(self.parent, row)


class _FakeClient:
    def __init__(self, raise_check):
        self.raise_check = raise_check
        self.attempts = []

    def table(self, _name):
        return _Table(self)


def test_save_probe_refuses_ownerless_when_user_id_column_missing(monkeypatch):
    def raise_check(row):
        if "user_id" in row:
            raise Exception('column "user_id" of relation "probes" does not exist')

    fake = _FakeClient(raise_check)
    monkeypatch.setattr(supabase_client, "get_supabase", lambda: fake)

    result = asyncio.run(supabase_client.save_probe({"target_url": "https://x.example"}, user_id="owner-1"))

    assert result is None  # not saved ownerless
    assert len(fake.attempts) == 1  # no retry-without-owner
    assert all("user_id" in attempt for attempt in fake.attempts)


def test_save_probe_still_drops_optional_board_columns(monkeypatch):
    def raise_check(row):
        if "is_public" in row:
            raise Exception('column "is_public" of relation "probes" does not exist')

    fake = _FakeClient(raise_check)
    monkeypatch.setattr(supabase_client, "get_supabase", lambda: fake)

    result = asyncio.run(supabase_client.save_probe({"target_url": "https://x.example"}, user_id="owner-1", is_public=True))

    assert result == "probe-123"
    assert len(fake.attempts) == 2  # dropped is_public and retried
    assert "is_public" not in fake.attempts[1]
    assert all("user_id" in attempt for attempt in fake.attempts)  # owner preserved


def test_save_probe_success_returns_id(monkeypatch):
    fake = _FakeClient(lambda row: None)
    monkeypatch.setattr(supabase_client, "get_supabase", lambda: fake)

    result = asyncio.run(supabase_client.save_probe({"target_url": "https://x.example"}, user_id="owner-1"))

    assert result == "probe-123"
    assert len(fake.attempts) == 1

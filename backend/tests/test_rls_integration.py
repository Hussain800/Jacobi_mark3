"""P0-2: cross-organization RLS isolation (DB integration).

EXTERNAL-GATE ARTIFACT. Skips unless pointed at a real Postgres/Supabase that
has the Jacobi enterprise migrations applied. It proves the RLS backstop: a user
authenticated as org A cannot read org B's findings even though both rows exist.

Run during the production-readiness gate (both user UUIDs must already exist in
auth.users — create two throwaway users in the Supabase dashboard):

    SUPABASE_DB_URL="postgresql://..." \\
    RLS_TEST_USER_A="<auth.users uuid>" \\
    RLS_TEST_USER_B="<auth.users uuid>" \\
    python -m pytest backend/tests/test_rls_integration.py -q

The test creates two orgs + findings, verifies isolation under each user's
authenticated RLS context, and cleans up.
"""

import os
import uuid

import pytest

DB_URL = os.getenv("SUPABASE_DB_URL")
USER_A = os.getenv("RLS_TEST_USER_A")
USER_B = os.getenv("RLS_TEST_USER_B")

pytestmark = pytest.mark.skipif(
    not (DB_URL and USER_A and USER_B),
    reason="set SUPABASE_DB_URL + RLS_TEST_USER_A + RLS_TEST_USER_B to run the RLS integration test",
)


def _connect():
    try:
        import psycopg  # type: ignore

        return psycopg.connect(DB_URL, autocommit=True)
    except ImportError:
        pass
    try:
        import psycopg2  # type: ignore

        conn = psycopg2.connect(DB_URL)
        conn.autocommit = True
        return conn
    except ImportError:
        pytest.skip("psycopg or psycopg2 required for the RLS integration test")


def _set_authenticated_user(cur, user_id):
    cur.execute("SET LOCAL ROLE authenticated;")
    cur.execute(
        "SELECT set_config('request.jwt.claims', %s, true);",
        ('{"sub": "%s", "role": "authenticated"}' % user_id,),
    )


def test_cross_org_findings_are_isolated_by_rls():
    conn = _connect()
    org_a = str(uuid.uuid4())
    org_b = str(uuid.uuid4())
    created = False
    try:
        # --- setup as the admin/service connection (RLS bypassed for owner) ---
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO public.organizations (id, name, created_by) "
                "VALUES (%s, %s, %s), (%s, %s, %s);",
                (org_a, "RLS Test Org A", USER_A, org_b, "RLS Test Org B", USER_B),
            )
            cur.execute(
                "INSERT INTO public.organization_members (organization_id, user_id, role) "
                "VALUES (%s, %s, 'owner'), (%s, %s, 'owner');",
                (org_a, USER_A, org_b, USER_B),
            )
            cur.execute(
                "INSERT INTO public.findings (organization_id, type, severity, status) "
                "VALUES (%s, 'MAP_UNDERCUT', 'high', 'new'), (%s, 'MAP_UNDERCUT', 'high', 'new');",
                (org_a, org_b),
            )
            created = True

        # --- user A: sees own org, NOT org B ---
        with conn.cursor() as cur:
            cur.execute("BEGIN;")
            _set_authenticated_user(cur, USER_A)
            cur.execute("SELECT count(*) FROM public.findings WHERE organization_id = %s;", (org_a,))
            assert cur.fetchone()[0] >= 1, "user A should see its own org findings"
            cur.execute("SELECT count(*) FROM public.findings WHERE organization_id = %s;", (org_b,))
            assert cur.fetchone()[0] == 0, "RLS FAILURE: user A could read org B findings"
            cur.execute("ROLLBACK;")

        # --- user B: sees own org, NOT org A ---
        with conn.cursor() as cur:
            cur.execute("BEGIN;")
            _set_authenticated_user(cur, USER_B)
            cur.execute("SELECT count(*) FROM public.findings WHERE organization_id = %s;", (org_b,))
            assert cur.fetchone()[0] >= 1, "user B should see its own org findings"
            cur.execute("SELECT count(*) FROM public.findings WHERE organization_id = %s;", (org_a,))
            assert cur.fetchone()[0] == 0, "RLS FAILURE: user B could read org A findings"
            cur.execute("ROLLBACK;")
    finally:
        if created:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM public.organizations WHERE id = ANY(%s);", ([org_a, org_b],))
        conn.close()

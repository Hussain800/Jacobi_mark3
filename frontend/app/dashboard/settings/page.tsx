"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Ban, RefreshCw, UserPlus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { PageHead } from "../ui";

type Member = {
  id: string;
  user_id: string;
  role: string;
  created_at?: string;
};

type Invite = {
  id: string;
  email: string;
  role: string;
  expires_at: string;
  accepted_at?: string | null;
  revoked_at?: string | null;
  created_at?: string;
};

export default function SettingsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("viewer");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const authHeaders = useCallback(async () => {
    const sessionResult = await supabase.auth.getSession();
    const token = sessionResult.data.session?.access_token;
    if (!token) throw new Error("Sign in to manage workspace settings.");
    return {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };
  }, [supabase]);

  const loadMembers = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch("/api/enterprise/members", {
        headers: await authHeaders(),
        cache: "no-store",
      });
      if (!response.ok) throw new Error(`Members request failed (${response.status})`);
      const payload = await response.json();
      setMembers(Array.isArray(payload.members) ? payload.members : []);
      setInvites(Array.isArray(payload.invites) ? payload.invites : []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Settings request failed.");
    } finally {
      setLoading(false);
    }
  }, [authHeaders]);

  useEffect(() => {
    void loadMembers();
  }, [loadMembers]);

  async function createInvite() {
    setBusy("invite");
    setMessage(null);
    try {
      const response = await fetch("/api/enterprise/invites", {
        method: "POST",
        headers: await authHeaders(),
        body: JSON.stringify({ email, role, expires_hours: 168 }),
      });
      if (!response.ok) throw new Error(`Invite failed (${response.status})`);
      const payload = await response.json();
      setInvites((current) => [payload.invite, ...current]);
      setEmail("");
      setMessage(`Invite created for ${payload.invite.email}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Invite failed.");
    } finally {
      setBusy(null);
    }
  }

  async function revokeInvite(inviteId: string) {
    setBusy(inviteId);
    setMessage(null);
    try {
      const response = await fetch(`/api/enterprise/invites/${inviteId}/revoke`, {
        method: "POST",
        headers: await authHeaders(),
      });
      if (!response.ok) throw new Error(`Revoke failed (${response.status})`);
      const payload = await response.json();
      setInvites((current) => current.map((invite) => invite.id === inviteId ? payload.invite : invite));
      setMessage("Invite revoked.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Revoke failed.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
        <PageHead
          eyebrow="Settings"
          title="Workspace access"
          lede="Manage team roles and pending invitations for the enterprise price-integrity workspace."
        />
        <button className="btn btn-ghost" onClick={loadMembers} disabled={loading} style={{ display: "inline-flex", alignItems: "center", gap: 8, marginBottom: 28 }}>
          <RefreshCw size={15} aria-hidden="true" />
          Refresh
        </button>
      </div>

      <section style={{ border: "1px solid var(--line)", borderRadius: "var(--r-sm)", background: "var(--surface)", padding: 18, marginBottom: 22 }}>
        <span className="label-mono" style={{ color: "var(--text-2)" }}>Invite member</span>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10, marginTop: 12 }}>
          <input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="teammate@company.com"
            style={{ minWidth: 0, border: "1px solid var(--line)", borderRadius: "var(--r-sm)", background: "var(--ink-2)", color: "var(--text)", padding: "10px 12px", fontFamily: "var(--mono)", fontSize: 12 }}
          />
          <select
            value={role}
            onChange={(event) => setRole(event.target.value)}
            style={{ border: "1px solid var(--line)", borderRadius: "var(--r-sm)", background: "var(--ink-2)", color: "var(--text)", padding: "10px 12px", fontFamily: "var(--mono)", fontSize: 12 }}
          >
            <option value="viewer">Viewer</option>
            <option value="analyst">Analyst</option>
            <option value="admin">Admin</option>
          </select>
          <button className="btn btn-primary" onClick={createInvite} disabled={!email || busy === "invite"} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <UserPlus size={15} aria-hidden="true" />
            {busy === "invite" ? "Creating..." : "Invite"}
          </button>
        </div>
        {message && (
          <div className="mono" style={{ color: message.includes("failed") || message.includes("Sign in") ? "var(--gold)" : "var(--good)", fontSize: 12, marginTop: 10 }}>
            {message}
          </div>
        )}
      </section>

      <GridTable
        title="Members"
        columns={["User", "Role", "Joined"]}
        rows={members.map((member) => [
          member.user_id,
          member.role,
          member.created_at ? member.created_at.slice(0, 10) : "n/a",
        ])}
        empty="No members are visible yet."
      />

      <div style={{ height: 22 }} />

      <section>
        <span className="label-mono" style={{ color: "var(--text-2)" }}>Pending invites</span>
        <div style={{ border: "1px solid var(--line)", borderRadius: "var(--r-sm)", overflowX: "auto", marginTop: 12 }}>
          <div style={{ minWidth: 720 }}>
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0,2fr) 120px 140px 110px", gap: 12, padding: "12px 16px", background: "var(--surface-2)" }}>
              {["Email", "Role", "Expires", "Action"].map((h) => (
                <span key={h} className="label-mono" style={{ color: "var(--text-2)", fontSize: 10 }}>{h}</span>
              ))}
            </div>
            {invites.map((invite) => (
              <div key={invite.id} style={{ display: "grid", gridTemplateColumns: "minmax(0,2fr) 120px 140px 110px", gap: 12, padding: "13px 16px", borderTop: "1px solid var(--line)", alignItems: "center" }}>
                <span className="mono" style={{ color: invite.revoked_at ? "var(--text-2)" : "var(--text)", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{invite.email}</span>
                <span className="mono" style={{ color: "var(--text-2)", fontSize: 11 }}>{invite.role}</span>
                <span className="mono" style={{ color: "var(--text-2)", fontSize: 11 }}>{invite.expires_at?.slice(0, 10) ?? "n/a"}</span>
                {invite.revoked_at ? (
                  <span className="mono" style={{ color: "var(--gold)", fontSize: 11 }}>Revoked</span>
                ) : (
                  <button className="btn btn-ghost" onClick={() => revokeInvite(invite.id)} disabled={busy === invite.id} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 10px" }}>
                    <Ban size={13} aria-hidden="true" />
                    Revoke
                  </button>
                )}
              </div>
            ))}
            {invites.length === 0 && (
              <div className="mono" style={{ padding: 18, borderTop: "1px solid var(--line)", color: "var(--text-2)", fontSize: 12 }}>
                No pending invites.
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function GridTable({ title, columns, rows, empty }: { title: string; columns: string[]; rows: string[][]; empty: string }) {
  return (
    <section>
      <span className="label-mono" style={{ color: "var(--text-2)" }}>{title}</span>
      <div style={{ border: "1px solid var(--line)", borderRadius: "var(--r-sm)", overflowX: "auto", marginTop: 12 }}>
        <div style={{ minWidth: 620 }}>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,2fr) 120px 140px", gap: 12, padding: "12px 16px", background: "var(--surface-2)" }}>
            {columns.map((h) => (
              <span key={h} className="label-mono" style={{ color: "var(--text-2)", fontSize: 10 }}>{h}</span>
            ))}
          </div>
          {rows.map((row) => (
            <div key={row.join("|")} style={{ display: "grid", gridTemplateColumns: "minmax(0,2fr) 120px 140px", gap: 12, padding: "13px 16px", borderTop: "1px solid var(--line)", alignItems: "center" }}>
              {row.map((cell, idx) => (
                <span key={`${cell}-${idx}`} className="mono" style={{ color: idx === 0 ? "var(--text)" : "var(--text-2)", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cell}</span>
              ))}
            </div>
          ))}
          {rows.length === 0 && (
            <div className="mono" style={{ padding: 18, borderTop: "1px solid var(--line)", color: "var(--text-2)", fontSize: 12 }}>
              {empty}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

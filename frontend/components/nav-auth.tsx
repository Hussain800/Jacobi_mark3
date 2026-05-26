"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Crown } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "../lib/supabase/client";
import { fetchPlan, type Plan } from "../lib/billing";

export default function NavAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(true);
  const [showEmailSignIn, setShowEmailSignIn] = useState(false);
  const [email, setEmail] = useState("");
  const [emailSent, setEmailSent] = useState(false);
  const [supabase] = useState(() => createClient());

  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(({ data }) => {
      if (active) {
        setUser(data.user ?? null);
        setLoading(false);
      }
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [supabase]);

  useEffect(() => {
    if (!user) {
      setPlan(null);
      return;
    }
    fetchPlan().then(setPlan).catch(() => {});
  }, [user]);

  async function signInWithGoogle() {
    const redirectTo = `${window.location.origin}/auth/callback`;
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });
  }

  async function signInWithEmail() {
    if (!email.trim()) return;
    const redirectTo = `${window.location.origin}/auth/callback`;
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: redirectTo },
    });
    if (!error) setEmailSent(true);
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    setUser(null);
  }

  if (loading) {
    return <div className="w-12 h-5" aria-hidden />;
  }

  if (user) {
    const displayName =
      (user.user_metadata?.name as string | undefined)?.split(" ")[0] ||
      user.email?.split("@")[0] ||
      "user";
    const avatarUrl = user.user_metadata?.avatar_url as string | undefined;
    const isPro = plan?.tier === "pro";
    return (
      <div className="flex items-center gap-2">
        {isPro ? (
          <Link
            href="/pricing"
            title="Pro plan — manage billing"
            className="inline-flex items-center gap-1 text-[10px] font-mono text-emerald-300 border border-emerald-400/40 rounded-full px-2 py-0.5 hover:border-emerald-400/70 transition-colors"
          >
            <Crown className="w-3 h-3" /> PRO
          </Link>
        ) : (
          <Link
            href="/pricing"
            className="text-[10px] font-mono text-white/35 border border-white/[0.12] rounded-full px-2 py-0.5 hover:text-white/70 hover:border-white/30 transition-colors"
          >
            free · upgrade →
          </Link>
        )}
        {avatarUrl && (
          <img src={avatarUrl} alt="" className="w-5 h-5 rounded-full" />
        )}
        <span className="text-[10px] font-mono text-white/40 hidden sm:inline">
          {displayName}
        </span>
        <button
          onClick={handleSignOut}
          className="text-[10px] font-mono text-white/20 hover:text-white/50 transition-colors"
        >
          exit
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {!showEmailSignIn ? (
        <>
          <button
            onClick={() => setShowEmailSignIn(true)}
            className="text-[10px] font-mono text-white/30 hover:text-white/60 border border-white/10 px-2 py-1 rounded transition-all"
          >
            email
          </button>
          <button
            onClick={signInWithGoogle}
            className="text-[10px] font-mono text-white/40 hover:text-white/70 transition-colors"
          >
            Google →
          </button>
        </>
      ) : emailSent ? (
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-mono text-emerald-400/80">
            check your email
          </span>
          <button
            onClick={() => {
              setShowEmailSignIn(false);
              setEmailSent(false);
              setEmail("");
            }}
            className="text-[10px] font-mono text-white/20 hover:text-white/40 transition-colors"
          >
            ✕
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-1.5">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            onKeyDown={(e) => {
              if (e.key === "Enter") signInWithEmail();
            }}
            className="w-36 sm:w-48 bg-white/[0.06] border border-white/[0.12] rounded px-2 py-1 text-[10px] font-mono text-white/80 placeholder:text-white/20 outline-none focus:border-white/30"
            autoFocus
          />
          <button
            onClick={signInWithEmail}
            disabled={!email.trim()}
            className="text-[10px] font-mono text-white/50 hover:text-white/80 border border-white/10 px-2 py-1 rounded disabled:opacity-20 transition-all"
          >
            send
          </button>
          <button
            onClick={() => {
              setShowEmailSignIn(false);
              setEmail("");
            }}
            className="text-[10px] font-mono text-white/20 hover:text-white/40 transition-colors"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}

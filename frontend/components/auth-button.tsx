"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "../lib/supabase/client";

export default function AuthButton() {
  const [user, setUser] = useState<User | null>(null);
  const [supabase] = useState(() => createClient());

  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(({ data }) => {
      if (active) setUser(data.user ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [supabase]);

  async function signInWithGoogle() {
    const redirectTo = `${window.location.origin}/auth/callback`;
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    setUser(null);
  }

  if (user) {
    const displayName =
      (user.user_metadata?.name as string | undefined)?.split(" ")[0] ||
      user.email?.split("@")[0] ||
      "user";
    const avatarUrl = user.user_metadata?.avatar_url as string | undefined;
    return (
      <div className="flex items-center gap-2">
        {avatarUrl && <img src={avatarUrl} alt="" className="w-5 h-5 rounded-full" />}
        <span className="text-[10px] font-mono text-white/40">{displayName}</span>
        <button onClick={handleSignOut} className="text-[10px] text-white/20 hover:text-white/50">
          exit
        </button>
      </div>
    );
  }
  return (
    <button
      onClick={signInWithGoogle}
      className="text-[10px] font-mono text-white/30 hover:text-white/60 border border-white/10 px-2 py-1 rounded"
    >
      sign in
    </button>
  );
}

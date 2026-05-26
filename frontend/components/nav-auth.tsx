"use client";

import { useSession, signIn, signOut } from "next-auth/react";
import { useState } from "react";

export default function NavAuth() {
  const { data: session } = useSession();
  const [showDevSignIn, setShowDevSignIn] = useState(false);
  const [devName, setDevName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleDevSignIn() {
    const name = devName.trim();
    if (!name) return;
    setLoading(true);
    setError("");
    try {
      const result = await signIn("credentials", {
        name,
        redirect: false,
      });
      if (result?.error) {
        setError(result.error);
      } else if (result?.ok) {
        setShowDevSignIn(false);
        setDevName("");
      }
    } catch {
      setError("Sign in failed. Try again.");
    } finally {
      setLoading(false);
    }
  }

  if (session?.user) {
    return (
      <div className="flex items-center gap-2">
        {session.user.image && (
          <img src={session.user.image} alt="" className="w-5 h-5 rounded-full" />
        )}
        <span className="text-[10px] font-mono text-white/40 hidden sm:inline">
          {session.user.name?.split(" ")[0] || "user"}
        </span>
        <button
          onClick={() => signOut()}
          className="text-[10px] font-mono text-white/20 hover:text-white/50 transition-colors"
        >
          exit
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {!showDevSignIn ? (
        <>
          <button
            onClick={() => setShowDevSignIn(true)}
            className="text-[10px] font-mono text-white/30 hover:text-white/60 border border-white/10 px-2 py-1 rounded transition-all"
          >
            dev sign in
          </button>
          <button
            onClick={() => signIn("google")}
            className="text-[10px] font-mono text-white/40 hover:text-white/70 transition-colors"
          >
            Google →
          </button>
        </>
      ) : (
        <div className="flex items-center gap-1.5">
          <input
            type="text"
            value={devName}
            onChange={(e) => { setDevName(e.target.value); setError(""); }}
            placeholder="Your name..."
            onKeyDown={(e) => {
              if (e.key === "Enter" && devName.trim() && !loading) {
                handleDevSignIn();
              }
            }}
            disabled={loading}
            className="w-28 sm:w-36 bg-white/[0.06] border border-white/[0.12] rounded px-2 py-1 text-[10px] font-mono text-white/80 placeholder:text-white/20 outline-none focus:border-white/30 disabled:opacity-40"
            autoFocus
          />
          <button
            onClick={handleDevSignIn}
            disabled={!devName.trim() || loading}
            className="text-[10px] font-mono text-white/50 hover:text-white/80 border border-white/10 px-2 py-1 rounded disabled:opacity-20 transition-all"
          >
            {loading ? "..." : "go"}
          </button>
          <button
            onClick={() => { setShowDevSignIn(false); setDevName(""); setError(""); }}
            className="text-[10px] font-mono text-white/20 hover:text-white/40 transition-colors"
          >
            ✕
          </button>
          {error && (
            <span className="absolute top-full mt-1 text-[8px] font-mono text-rose-400/70">
              {error}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

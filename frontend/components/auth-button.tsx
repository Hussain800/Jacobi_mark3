"use client"
import { useSession, signIn, signOut } from "next-auth/react"

export default function AuthButton() {
  const { data: session } = useSession()
  if (session?.user) {
    return (
      <div className="flex items-center gap-2">
        {session.user.image && <img src={session.user.image} alt="" className="w-5 h-5 rounded-full" />}
        <span className="text-[10px] font-mono text-white/40">{session.user.name?.split(" ")[0] || session.user.email?.split("@")[0] || "user"}</span>
        <button onClick={() => signOut()} className="text-[10px] font-mono text-white/20 hover:text-white/50 transition-colors">exit</button>
      </div>
    )
  }
  return (
    <button onClick={() => signIn("google")} className="text-[10px] font-mono text-white/30 hover:text-white/60 border border-white/10 px-2.5 py-1 rounded transition-all">
      sign in
    </button>
  )
}

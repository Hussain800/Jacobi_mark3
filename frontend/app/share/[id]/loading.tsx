export default function ShareLoading() {
  return (
    <main className="min-h-screen bg-[#050505] flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="#34d399" strokeWidth="1.5">
            <path d="M10 2 L16 8 L10 14 L4 8 Z" fill="none" />
            <circle cx="10" cy="8" r="2" fill="#34d399" opacity="0.4" />
          </svg>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-mono text-neon/60 font-light">
            retrieving probe data
          </span>
          <span className="inline-block w-2 h-5 bg-neon/60 animate-terminal-blink align-middle" />
        </div>
        <span className="text-[9px] font-mono text-white/10 uppercase tracking-[0.2em]">
          establishing secure channel
        </span>
      </div>
    </main>
  );
}

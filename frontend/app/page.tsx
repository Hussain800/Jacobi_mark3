"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import JacobiLogo from "../components/jacobi-logo";
import MatricesCursor from "../components/MatricesCursor";

function useTyping(text: string, speed: number, active: boolean) {
  const [d, setD] = useState("");
  useEffect(() => {
    if (!active) { setD(""); return; }
    let i = 0, id = setInterval(() => { i++; setD(text.slice(0, i)); if (i >= text.length) clearInterval(id); }, speed);
    return () => clearInterval(id);
  }, [text, speed, active]);
  return d;
}

export default function LandingPage() {
  const [ready, setReady] = useState(false);
  const typed = useTyping("24 agents. 5 axes. One URL.", 36, ready);
  useEffect(() => { setReady(true); }, []);

  return (
    <div className="min-h-screen bg-[#07080c] text-white overflow-x-hidden font-mono selection:bg-emerald-400/20 selection:text-white">
      <MatricesCursor />

      <section className="relative min-h-screen flex items-center px-6 lg:px-16">
        <div className="max-w-2xl mx-auto w-full">
          <div className="mb-12" style={{ animation: ready ? "fadeUp 0.8s cubic-bezier(0.22,1,0.36,1) both" : "none" }}>
            <JacobiLogo size="lg" full />
          </div>

          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-light tracking-tight leading-[1.0] text-white/80 mb-6"
            style={{ animation: ready ? "fadeUp 0.8s cubic-bezier(0.22,1,0.36,1) both" : "none", animationDelay: "0.15s" }}>
            The price you see<br /><span className="text-emerald-400">is not the price</span><br />everyone gets.
          </h1>

          <p className="text-sm text-white/25 leading-relaxed max-w-md mb-10 min-h-[24px]"
            style={{ animation: ready ? "fadeUp 0.8s cubic-bezier(0.22,1,0.36,1) both" : "none", animationDelay: "0.3s" }}>
            <span className="text-emerald-400/50">$ </span>{typed}<span className="text-emerald-400/70 animate-pulse ml-0.5">_</span>
          </p>

          <div className="flex flex-col sm:flex-row gap-3"
            style={{ animation: ready ? "fadeUp 0.8s cubic-bezier(0.22,1,0.36,1) both" : "none", animationDelay: "0.45s" }}>
            <Link href="/chat"
              className="group inline-flex items-center justify-center gap-2.5 px-7 py-3.5 rounded-xl bg-emerald-400/10 border border-emerald-400/25 text-emerald-400 text-sm font-light hover:bg-emerald-400/15 hover:border-emerald-400/40 transition-all duration-300 active:scale-[0.97]">
              See what JACOBI found
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </Link>
            <a href="#how"
              className="inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl border border-white/[0.06] text-white/25 text-sm font-light hover:text-white/45 hover:border-white/20 transition-all duration-300 active:scale-[0.97]">
              How it works
            </a>
          </div>

          <div className="flex flex-wrap gap-2 mt-8"
            style={{ animation: ready ? "fadeUp 0.8s cubic-bezier(0.22,1,0.36,1) both" : "none", animationDelay: "0.6s" }}>
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.02] border border-white/[0.04] text-[9px] text-white/20">BrightData</span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.02] border border-white/[0.04] text-[9px] text-white/20">24 Agents</span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.02] border border-white/[0.04] text-[9px] text-white/20">DeepSeek AI</span>
          </div>
        </div>
      </section>

      <section id="how" className="py-28 px-6 lg:px-16 border-t border-white/[0.02]">
        <div className="max-w-lg mx-auto">
          <span className="text-[9px] text-white/10 tracking-[0.2em] uppercase mb-8 block">How it works</span>
          <div className="space-y-8">
            {[
              { num: "01", title: "Paste a URL", desc: "Any product or booking page. Flights, hotels, subscriptions." },
              { num: "02", title: "24 agents deploy", desc: "Each agent adopts a unique digital fingerprint across location, device, cookies, and referrer." },
              { num: "03", title: "AI analyzes", desc: "DeepSeek and Gemini compare prices across all 24 profiles." },
              { num: "04", title: "Get the verdict", desc: "Exactly how much you are overpaying and what to do about it." },
            ].map((s, i) => (
              <div key={i} className="flex items-start gap-5 group"
                style={{ animation: ready ? "fadeUp 0.6s cubic-bezier(0.22,1,0.36,1) both" : "none", animationDelay: i * 0.1 + "s" }}>
                <span className="text-xs text-white/10 font-mono shrink-0 w-6">{s.num}</span>
                <div>
                  <div className="text-sm text-white/70 mb-1 group-hover:text-white/90 transition-colors">{s.title}</div>
                  <div className="text-xs text-white/20 leading-relaxed">{s.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-28 px-6 lg:px-16 border-t border-white/[0.02] text-center">
        <div className="max-w-md mx-auto">
          <div className="flex justify-center mb-6"><JacobiLogo size="md" full /></div>
          <h2 className="text-2xl sm:text-3xl font-light text-white/70 mb-3">Stop overpaying.</h2>
          <p className="text-xs text-white/20 mb-8 max-w-xs mx-auto">One URL is all it takes.</p>
          <Link href="/chat"
            className="group inline-flex items-center gap-2.5 px-8 py-4 rounded-xl bg-emerald-400/10 border border-emerald-400/25 text-emerald-400 text-sm font-light hover:bg-emerald-400/15 hover:border-emerald-400/40 transition-all duration-300 active:scale-[0.97]">
            Launch the probe
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </Link>
        </div>
      </section>

      <footer className="border-t border-white/[0.02] py-10 px-6 lg:px-16">
        <div className="max-w-2xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-[9px] text-white/10">
          <span>JACOBI - Pricing Topology Probe</span>
          <span>BrightData x MIT Hackathon</span>
          <div className="flex items-center gap-4">
            <Link href="/chat" className="hover:text-emerald-400/40 transition-colors">Probe</Link>
            <a href="#how" className="hover:text-emerald-400/40 transition-colors">How it works</a>
          </div>
        </div>
      </footer>

      <style>{`
        @keyframes fadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
        @media (prefers-reduced-motion:reduce){*{animation-duration:0.01ms!important;animation-iteration-count:1!important;transition-duration:0.01ms!important}}
      `}</style>
    </div>
  );
}

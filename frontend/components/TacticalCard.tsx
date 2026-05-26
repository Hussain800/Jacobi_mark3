"use client";

import React, { useRef, useState } from "react";
import { LucideIcon } from "lucide-react";

interface TacticalCardProps {
  number: string;
  title: string;
  desc: string;
  icon: LucideIcon;
  color: "emerald" | "blue" | "amber" | "rose";
  statusCode?: string;
}

const ACCENT_COLORS = {
  emerald: {
    text: "text-[#00d992]",
    bgGlow: "rgba(0, 217, 146, 0.08)",
    borderGlow: "rgba(0, 217, 146, 0.35)",
    iconBg: "bg-[#00d992]/10",
  },
  blue: {
    text: "text-blue-400",
    bgGlow: "rgba(96, 165, 250, 0.08)",
    borderGlow: "rgba(96, 165, 250, 0.35)",
    iconBg: "bg-blue-400/10",
  },
  amber: {
    text: "text-amber-400",
    bgGlow: "rgba(245, 158, 11, 0.08)",
    borderGlow: "rgba(245, 158, 11, 0.35)",
    iconBg: "bg-amber-400/10",
  },
  rose: {
    text: "text-rose-400",
    bgGlow: "rgba(251, 113, 133, 0.08)",
    borderGlow: "rgba(251, 113, 133, 0.35)",
    iconBg: "bg-rose-400/10",
  },
};

export default function TacticalCard({
  number,
  title,
  desc,
  icon: Icon,
  color,
  statusCode = "SYS_PROBE_OK",
}: TacticalCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState({ x: 0, y: 0 });
  const [isFocused, setIsFocused] = useState(false);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setCoords({ x, y });
  };

  const currentAccent = ACCENT_COLORS[color] || ACCENT_COLORS.emerald;

  // Static micro-telemetry offsets for cybernetic effect
  const lat = (Math.sin(parseInt(number)) * 90).toFixed(4);
  const lng = (Math.cos(parseInt(number)) * 180).toFixed(4);
  const ping = 15 + (parseInt(number) * 11) % 65;

  return (
    <div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsFocused(true)}
      onMouseLeave={() => setIsFocused(false)}
      className="relative group w-full rounded-sm overflow-hidden border border-white/[0.04] bg-[#0c0d12]/60 backdrop-blur-md transition-all duration-300 hover:border-white/[0.08]"
      style={{
        // Set dynamic local coordinates as CSS properties
        "--mouse-x": `${coords.x}px`,
        "--mouse-y": `${coords.y}px`,
      } as React.CSSProperties}
    >
      {/* Corner Brackets */}
      <span className={`tech-bracket tech-bracket-tl transition-colors duration-300 ${isFocused ? currentAccent.text : "text-white/20"}`} />
      <span className={`tech-bracket tech-bracket-tr transition-colors duration-300 ${isFocused ? currentAccent.text : "text-white/20"}`} />
      <span className={`tech-bracket tech-bracket-bl transition-colors duration-300 ${isFocused ? currentAccent.text : "text-white/20"}`} />
      <span className={`tech-bracket tech-bracket-br transition-colors duration-300 ${isFocused ? currentAccent.text : "text-white/20"}`} />

      {/* Cybernetic Grid Background */}
      <div className="absolute inset-0 opacity-[0.02] pointer-events-none" style={{
        backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.15) 1px, transparent 1px)",
        backgroundSize: "16px 16px"
      }} />

      {/* Hover Light Reflection Layer */}
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
        style={{
          background: `radial-gradient(280px circle at var(--mouse-x) var(--mouse-y), ${currentAccent.bgGlow}, transparent 80%)`,
        }}
      />
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
        style={{
          background: `radial-gradient(120px circle at var(--mouse-x) var(--mouse-y), ${currentAccent.borderGlow}, transparent 90%)`,
          padding: "1px",
          maskImage: "linear-gradient(#fff, #fff) content-box, linear-gradient(#fff, #fff)",
          WebkitMaskImage: "linear-gradient(#fff, #fff) content-box, linear-gradient(#fff, #fff)",
          maskComposite: "exclude",
          WebkitMaskComposite: "destination-out",
        }}
      />

      {/* Card Content Wrapper */}
      <div className="relative p-6 z-10 flex flex-col justify-between h-full min-h-[220px]">
        {/* Top telemetry bar */}
        <div className="flex items-center justify-between border-b border-white/[0.04] pb-3 mb-4">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/80 animate-pulse" />
            <span className="text-[9px] font-mono text-white/30 tracking-wider">
              {statusCode}
            </span>
          </div>
          <span className="text-[10px] font-mono text-white/20 tracking-widest">
            #{number}
          </span>
        </div>

        {/* Main Content Row */}
        <div className="flex items-start gap-4 mb-4">
          <div className={`shrink-0 w-11 h-11 rounded flex items-center justify-center border border-white/[0.06] ${currentAccent.iconBg}`}>
            <Icon className={`w-5 h-5 ${currentAccent.text}`} />
          </div>
          <div>
            <h3 className="text-base font-semibold text-white/90 mb-1.5 font-display tracking-wide">
              {title}
            </h3>
            <p className="text-xs text-white/45 leading-relaxed font-body">
              {desc}
            </p>
          </div>
        </div>

        {/* Bottom telemetry indicators */}
        <div className="flex items-center justify-between border-t border-white/[0.04] pt-3 mt-auto text-[8px] font-mono text-white/20">
          <span className="hover:text-white/40 transition-colors">
            COORD: [{lat}, {lng}]
          </span>
          <span className="hover:text-white/40 transition-colors">
            RTT: {ping}ms | LOSS: 0%
          </span>
        </div>
      </div>
    </div>
  );
}

"use client";

export default function JacobiLogo({ size = "md", minimal = false, full = false, className = "" }: { size?: "sm" | "md" | "lg"; minimal?: boolean; full?: boolean; className?: string }) {
  const sizes = { sm: { t: "text-base", b: "text-sm" }, md: { t: "text-2xl", b: "text-xl" }, lg: { t: "text-4xl", b: "text-3xl" } };
  const s = sizes[size];

  if (full) {
    const letters = "JACOBI".split("");
    return (
      <div className={`flex items-center font-sans tracking-normal select-none ${className}`} style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
        <span className={`${s.b} text-neon/15 font-light`}>[</span>
        <span className="flex mx-0.5 overflow-hidden">
          {letters.map((ch, i) => (
            <span key={i} className={`${s.t} text-neon font-light tracking-wide inline-block`}
              style={{
                animation: `jacobiType 0.15s ease-out both`,
                animationDelay: `${0.3 + i * 0.08}s`,
                textShadow: "0 0 30px rgba(200,200,200,0.06)",
              }}>
              {ch}
            </span>
          ))}
        </span>
        <span className={`${s.b} text-neon/15 font-light`}>]</span>
      </div>
    );
  }

  if (minimal) {
    return (
      <div className={`flex items-center font-sans tracking-normal select-none ${className}`} style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
        <span className={`${s.b} text-neon/15 font-light`}>[</span>
        <span className={`${s.t} text-neon font-light mx-0.5`}
          style={{ textShadow: "0 0 20px rgba(200,200,200,0.1)" }}>J</span>
        <span className={`${s.b} text-neon/15 font-light`}>]</span>
      </div>
    );
  }

  return (
    <div className={`flex items-center font-sans tracking-normal select-none ${className}`} style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
      <span className={`${s.b} text-neon/15 font-light`}>[</span>
      <span className={`${s.t} text-neon font-light mx-0.5`}>J</span>
      <span className={`${s.b} text-neon/15 font-light`}>]</span>
      <span className={`${size === "lg" ? "text-lg" : "text-sm"} text-neon/15 font-light ml-2`}>acobi</span>
    </div>
  );
}

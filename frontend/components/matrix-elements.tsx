"use client";

import { useEffect, useRef } from "react";

/* ─── Matrix Rain ────────────────────────────────────────────────────── */

export function MatrixRain({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;

    let w = window.innerWidth, h = window.innerHeight;
    c.width = w; c.height = h;

    const colCount = Math.floor(w / 22);
    const drops: { y: number; speed: number; length: number; glow: number }[] = [];

    for (let i = 0; i < colCount; i++) {
      drops.push({
        y: Math.random() * h,
        speed: 0.3 + Math.random() * 0.7,
        length: 5 + Math.floor(Math.random() * 15),
        glow: Math.random(),
      });
    }

    const chars = "01アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモ∂∑∏∫√∞[]{}<>";

    const onResize = () => { w = window.innerWidth; h = window.innerHeight; c.width = w; c.height = h; };
    window.addEventListener("resize", onResize);

    let frame = 0;
    const draw = () => {
      frame++;
      ctx.fillStyle = "rgba(5, 5, 5, 0.08)";
      ctx.fillRect(0, 0, w, h);

      for (let i = 0; i < drops.length; i++) {
        const d = drops[i];
        const x = i * 22;

        for (let j = 0; j < d.length; j++) {
          const yPos = d.y - j * 16;
          if (yPos < 0 || yPos > h) continue;

          const distFromHead = j / d.length;
          const alpha = (1 - distFromHead) * 0.25;

          const char = chars[Math.floor(Math.random() * chars.length)];

          if (j === 0) {
            ctx.fillStyle = `rgba(0, 255, 65, ${alpha * 0.7})`;
            ctx.shadowColor = "rgba(0, 255, 65, 0.3)";
            ctx.shadowBlur = 8;
          } else {
            ctx.fillStyle = `rgba(0, 200, 50, ${alpha * 0.35})`;
            ctx.shadowBlur = 0;
          }

          ctx.font = `${j === 0 ? "bold " : ""}12px "JetBrains Mono", monospace`;
          ctx.fillText(char, x, yPos);
        }
        ctx.shadowBlur = 0;

        d.y += d.speed;
        if (d.y > h + 30) {
          d.y = -30;
          d.speed = 0.3 + Math.random() * 0.7;
          d.length = 5 + Math.floor(Math.random() * 15);
        }
      }
      requestAnimationFrame(draw);
    };
    requestAnimationFrame(draw);
    return () => { window.removeEventListener("resize", onResize); };
  }, []);

  return <canvas ref={ref} className={`fixed inset-0 pointer-events-none ${className}`} />;
}

/* ─── Jacobian Matrix Visual ─────────────────────────────────────────── */

const MATRIX_DATA = [
  ["∂p/∂x", "∂p/∂y", "∂p/∂z", "∂p/∂w"],
  ["∂q/∂x", "∂q/∂y", "∂q/∂z", "∂q/∂w"],
  ["∂r/∂x", "∂r/∂y", "∂r/∂z", "∂r/∂w"],
  ["∂s/∂x", "∂s/∂y", "∂s/∂z", "∂s/∂w"],
];

export function JacobianMatrix({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2 select-none ${className}`}>
      <span className="text-[18px] font-sans font-thin text-neon/30 leading-none">[</span>
      <div className="grid grid-cols-4 gap-x-3 gap-y-0.5">
        {MATRIX_DATA.flat().map((cell, i) => (
          <span key={i} className="text-[7px] font-mono text-white/7 font-light whitespace-nowrap">{cell}</span>
        ))}
      </div>
      <span className="text-[18px] font-sans font-thin text-neon/30 leading-none">]</span>
    </div>
  );
}

/* ─── Space Stars ────────────────────────────────────────────────────── */

export function SpaceStars({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;

    let w = window.innerWidth, h = window.innerHeight;
    c.width = w; c.height = h;

    const stars = Array.from({ length: 200 }, () => ({
      x: Math.random() * w, y: Math.random() * h,
      r: Math.random() * 1.2 + 0.2,
      a: Math.random() * 0.3 + 0.05,
      speed: Math.random() * 0.005 + 0.002,
    }));

    const onResize = () => { w = window.innerWidth; h = window.innerHeight; c.width = w; c.height = h; };
    window.addEventListener("resize", onResize);

    let frame = 0;
    const draw = () => {
      frame++;
      ctx.clearRect(0, 0, w, h);
      for (const s of stars) {
        const twinkle = 0.5 + 0.5 * Math.sin(frame * s.speed + s.x);
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${s.a * twinkle})`;
        ctx.fill();
      }
      requestAnimationFrame(draw);
    };
    requestAnimationFrame(draw);
    return () => { window.removeEventListener("resize", onResize); };
  }, []);

  return <canvas ref={ref} className={`fixed inset-0 pointer-events-none ${className}`} />;
}

/* ─── Code Grid (matrix backdrop) ─────────────────────────────────────── */

export function CodeGrid({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;

    let w = window.innerWidth, h = window.innerHeight;
    c.width = w; c.height = h;

    const codes: { x: number; y: number; text: string; alpha: number; speed: number }[] = [];

    const snippets = ["const", "let", "var", "function", "return", "=>", "=> {", "]}", "[]", "{}", "/*", "*/", "//", "map", "filter", "reduce", "async", "await", "import", "export", "class", "new", "this", "null", "undefined", "true", "false"];

    for (let i = 0; i < 40; i++) {
      codes.push({
        x: Math.random() * w,
        y: Math.random() * h,
        text: snippets[Math.floor(Math.random() * snippets.length)],
        alpha: 0.02 + Math.random() * 0.04,
        speed: 0.002 + Math.random() * 0.005,
      });
    }

    const onResize = () => { w = window.innerWidth; h = window.innerHeight; c.width = w; c.height = h; };
    window.addEventListener("resize", onResize);

    let frame = 0;
    const draw = () => {
      frame++;
      ctx.clearRect(0, 0, w, h);
      for (const c of codes) {
        const pulse = 0.7 + 0.3 * Math.sin(frame * c.speed + c.x);
        ctx.fillStyle = `rgba(0, 255, 65, ${c.alpha * pulse * 0.6})`;
        ctx.font = "9px 'JetBrains Mono', monospace";
        ctx.fillText(c.text, c.x, c.y + Math.sin(frame * 0.001 + c.x) * 2);
      }
      requestAnimationFrame(draw);
    };
    requestAnimationFrame(draw);
    return () => { window.removeEventListener("resize", onResize); };
  }, []);

  return <canvas ref={ref} className={`fixed inset-0 pointer-events-none ${className}`} />;
}

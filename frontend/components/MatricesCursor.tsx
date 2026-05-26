"use client";

import { useEffect, useRef } from "react";

/* ─── Matrices Digital Rain Cursor Effect ────────────────────────────
   Inspired by The Matrix. A cascading column of katakana/hex glyphs
   trails behind the cursor. Fades as it falls.

   Bencium principles: purposeful atmosphere, not decoration.
   The rain grounds the "adversarial probe network" concept visually.
   ─────────────────────────────────────────────────────────────────── */

const GLYPHS =
  "アカサタナハマヤラワガザダバパイキシチニヒミリヰギジヂビピウクスツヌフムユルグズヅブプエケセテネヘメレゲゼデベペオコソトノホモヨロヲゴゾドボポ0123456789:;<=>?@[\\]^_`{|}~";

interface Drop {
  x: number;
  y: number;
  speed: number;
  length: number;
  chars: string[];
  opacity: number;
  born: number;
}

export default function MatricesCursor() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: -999, y: -999 });
  const dropsRef = useRef<Drop[]>([]);
  const frameRef = useRef<number>(0);
  const lastSpawnRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const onMouse = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener("mousemove", onMouse);

    const onTouch = (e: TouchEvent) => {
      const t = e.touches[0];
      if (t) mouseRef.current = { x: t.clientX, y: t.clientY };
    };
    window.addEventListener("touchmove", onTouch);

    const animate = (now: number) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Spawn new drops near cursor
      if (now - lastSpawnRef.current > 80) {
        const m = mouseRef.current;
        // Only spawn if mouse has moved recently
        if (m.x > 0 && m.y > 0) {
          const count = 2;
          for (let i = 0; i < count; i++) {
            const length = 6 + Math.floor(Math.random() * 10);
            const chars: string[] = [];
            for (let j = 0; j < length; j++) {
              chars.push(GLYPHS[Math.floor(Math.random() * GLYPHS.length)]);
            }
            dropsRef.current.push({
              x: m.x + (Math.random() - 0.5) * 40,
              y: m.y,
              speed: 120 + Math.random() * 180,
              length,
              chars,
              opacity: 0.35 + Math.random() * 0.2,
              born: now,
            });
          }
        }
        lastSpawnRef.current = now;
      }

      // Update & draw drops
      dropsRef.current = dropsRef.current.filter((d) => {
        const age = (now - d.born) / 1000;
        const fallPx = age * d.speed;
        const y = d.y + fallPx;
        const fade = Math.max(0, 1 - age / 3.5);

        if (fade <= 0 || y > canvas.height + 20) return false;

        ctx.font = "11px var(--font-mono, monospace)";
        ctx.textAlign = "center";

        for (let i = 0; i < d.chars.length; i++) {
          const charY = y - i * 14;
          if (charY < -20 || charY > canvas.height + 20) continue;
          const charFade = fade * (1 - i / d.chars.length);
          const isHead = i === 0;

          if (isHead) {
            ctx.fillStyle = `rgba(180, 255, 220, ${charFade * 0.7})`;
          } else {
            ctx.fillStyle = `rgba(0, 217, 146, ${charFade * 0.35 * d.opacity})`;
          }
          ctx.fillText(d.chars[i], d.x, charY);
        }

        return true;
      });

      // Limit max drops for performance
      if (dropsRef.current.length > 400) {
        dropsRef.current = dropsRef.current.slice(-300);
      }

      frameRef.current = requestAnimationFrame(animate);
    };

    frameRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(frameRef.current);
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", onMouse);
      window.removeEventListener("touchmove", onTouch);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-50"
      style={{ mixBlendMode: "screen" }}
    />
  );
}

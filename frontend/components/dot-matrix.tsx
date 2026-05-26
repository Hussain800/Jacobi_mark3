"use client";

import { useEffect, useRef } from "react";

export default function DotMatrix({ className = "" }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: -9999, y: -9999 });

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;

    let w = window.innerWidth, h = window.innerHeight;
    c.width = w; c.height = h;

    const spacing = 32;
    const cols = Math.ceil(w / spacing) + 1;
    const rows = Math.ceil(h / spacing) + 1;
    const dots: { x: number; y: number }[] = [];
    for (let r = 0; r < rows; r++) {
      for (let col = 0; col < cols; col++) {
        const offsetX = (r % 2) * (spacing / 2);
        dots.push({ x: col * spacing + offsetX, y: r * spacing });
      }
    }

    const onMouse = (e: MouseEvent) => { mouseRef.current.x = e.clientX; mouseRef.current.y = e.clientY; };
    const onResize = () => { w = window.innerWidth; h = window.innerHeight; c.width = w; c.height = h; };
    window.addEventListener("mousemove", onMouse);
    window.addEventListener("resize", onResize);

    let frame = 0;
    const animate = () => {
      frame++;
      ctx.clearRect(0, 0, w, h);
      const mx = mouseRef.current.x, my = mouseRef.current.y;

      for (const d of dots) {
        const dx = d.x - mx, dy = d.y - my;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const maxDist = 300;

        let alpha: number;
        if (dist < maxDist) {
          const t = 1 - dist / maxDist;
          alpha = 0.02 + t * 0.12;
        } else {
          alpha = 0.015;
        }

        const fade = Math.min(1, (d.x / w) * 1.5, ((w - d.x) / w) * 1.5, (d.y / h) * 1.5, ((h - d.y) / h) * 1.5);
        alpha *= Math.max(0.1, Math.min(1, fade));

        const pulse = 0.9 + 0.1 * Math.sin(frame * 0.02 + d.x * 0.01 + d.y * 0.01);
        const radius = (dist < maxDist ? 1.2 + (1 - dist / maxDist) * 1.2 : 0.8) * pulse;

        ctx.beginPath();
        ctx.arc(d.x, d.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(200, 200, 200, ${alpha})`;
        ctx.fill();
      }

      requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);

    return () => {
      window.removeEventListener("mousemove", onMouse);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return <canvas ref={canvasRef} className={`fixed inset-0 pointer-events-none ${className}`} />;
}

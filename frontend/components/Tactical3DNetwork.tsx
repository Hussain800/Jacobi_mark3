"use client";

import { useEffect, useRef, useState } from "react";

interface Tactical3DNetworkProps {
  isActive: boolean;
}

interface Node3D {
  id: number;
  ring: number;
  angle: number;
  radius: number;
  status: "active" | "analysing" | "cached" | "idle" | "error" | "ready";
  label: string;
  ping: number;
  coord: string;
}

const STATUS_COLORS: Record<string, string> = {
  active: "0, 217, 146",     // VoltAgent emerald
  analysing: "245, 158, 11",  // Amber
  cached: "96, 165, 250",     // Blue
  idle: "156, 163, 175",      // Gray
  error: "251, 113, 133",     // Rose
  ready: "52, 211, 153",      // Light Emerald
};

export default function Tactical3DNetwork({ isActive }: Tactical3DNetworkProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Mouse tilt variables
  const mouseRef = useRef({ x: 0, y: 0, targetX: 0, targetY: 0 });

  // Node definitions matching the 24-agent layout
  const nodesRef = useRef<Node3D[]>([]);

  useEffect(() => {
    // Initialize 24 agents across 3 concentric rings
    const rings = [
      { radius: 110, count: 6, label: "LOC_PROBE" },
      { radius: 190, count: 10, label: "DEV_PROBE" },
      { radius: 270, count: 8, label: "COOKIE_PROBE" },
    ];

    const statuses: Node3D["status"][] = [
      "active", "active", "analysing", "cached", "idle", "ready",
      "active", "analysing", "cached", "idle", "ready", "active",
      "analysing", "cached", "error", "active", "analysing", "cached",
      "active", "idle", "ready", "active", "analysing", "ready"
    ];

    let nodeIndex = 0;
    const nodes: Node3D[] = [];

    rings.forEach((ring, ringIdx) => {
      for (let i = 0; i < ring.count; i++) {
        const angle = (i * 2 * Math.PI) / ring.count;
        const status = statuses[nodeIndex % statuses.length];
        const ping = Math.floor(Math.random() * 80) + 12;
        const lat = (Math.random() * 180 - 90).toFixed(4);
        const lng = (Math.random() * 360 - 180).toFixed(4);

        nodes.push({
          id: nodeIndex++,
          ring: ringIdx,
          angle,
          radius: ring.radius,
          status,
          label: `${ring.label}_${String(i).padStart(2, "0")}`,
          ping,
          coord: `${lat}, ${lng}`,
        });
      }
    });

    nodesRef.current = nodes;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animFrameId: number;
    let autoYaw = 0;
    let autoPitch = 0;

    const resize = () => {
      const rect = containerRef.current?.getBoundingClientRect();
      canvas.width = rect?.width || window.innerWidth;
      canvas.height = rect?.height || window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left - rect.width / 2;
      const y = e.clientY - rect.top - rect.height / 2;
      
      // Normalize mouse coordinates to fraction between -1 and 1
      mouseRef.current.targetX = x / (rect.width / 2);
      mouseRef.current.targetY = y / (rect.height / 2);
    };

    const container = containerRef.current;
    if (container) {
      container.addEventListener("mousemove", handleMouseMove);
    }

    // Mathematical 3D projection parameters
    const FOCAL_LENGTH = 380;
    const CAMERA_DISTANCE = 450;
    const PLANE_HEIGHT = 0; // Flat concentric rings Y coordinate
    const GRID_HEIGHT = 70; // Grid plane coordinate below nodes

    const render = () => {
      // Lerp mouse target for smooth transition
      const mouse = mouseRef.current;
      mouse.x += (mouse.targetX - mouse.x) * 0.08;
      mouse.y += (mouse.targetY - mouse.y) * 0.08;

      // Update rotation angles
      autoYaw += isActive ? 0.007 : 0.002;
      autoPitch = Math.sin(autoYaw * 0.5) * 0.05; // Gentle pitch weave

      // Combine auto rotation and mouse parallax
      // Pitch (tilt X): look down at the rings. Base tilt: -35 deg
      const pitch = -0.65 + mouse.y * 0.25 + autoPitch;
      // Yaw (spin Y): base spin over time
      const yaw = autoYaw + mouse.x * 0.4;

      const cosP = Math.cos(pitch);
      const sinP = Math.sin(pitch);
      const cosY = Math.cos(yaw);
      const sinY = Math.sin(yaw);

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const cx = canvas.width / 2;
      const cy = canvas.height * 0.44;

      // 3D Point projection function
      const project = (x3d: number, y3d: number, z3d: number) => {
        // Rotate around Y-axis (Yaw)
        const xRotY = x3d * cosY + z3d * sinY;
        const zRotY = -x3d * sinY + z3d * cosY;

        // Rotate around X-axis (Pitch)
        const yRotX = y3d * cosP - zRotY * sinP;
        const zRotX = y3d * sinP + zRotY * cosP;

        // Perspective depth translation
        const zFinal = zRotX + CAMERA_DISTANCE;
        const scale = FOCAL_LENGTH / zFinal;

        const screenX = cx + xRotY * scale;
        const screenY = cy + yRotX * scale;

        return { x: screenX, y: screenY, z: zRotX, scale };
      };

      // Z-Buffer Drawing queue to render background to foreground
      interface DrawCommand {
        z: number;
        draw: () => void;
      }
      const drawQueue: DrawCommand[] = [];

      // 1. Grid Plane Drawing (drawn in Z segments)
      const gridSize = 400;
      const gridSegments = 10;
      const gridStep = gridSize / gridSegments;

      // Vertical grid lines (parallel to Z-axis)
      for (let i = 0; i <= gridSegments; i++) {
        const xVal = -gridSize / 2 + i * gridStep;
        
        drawQueue.push({
          z: 1000, // Background base depth for grid
          draw: () => {
            ctx.beginPath();
            let first = true;
            for (let j = 0; j <= 20; j++) {
              const zVal = -gridSize / 2 + (j * gridSize) / 20;
              const pt = project(xVal, GRID_HEIGHT, zVal);
              
              if (pt.scale < 0.1) continue;
              if (first) {
                ctx.moveTo(pt.x, pt.y);
                first = false;
              } else {
                ctx.lineTo(pt.x, pt.y);
              }
            }
            
            // Grid fade with depth
            ctx.strokeStyle = "rgba(0, 217, 146, 0.018)";
            ctx.lineWidth = 1;
            ctx.stroke();
          }
        });
      }

      // Horizontal grid lines (parallel to X-axis)
      for (let j = 0; j <= gridSegments; j++) {
        const zVal = -gridSize / 2 + j * gridStep;

        drawQueue.push({
          z: 1000 - zVal, // Z-depth mapping for grid stripes
          draw: () => {
            ctx.beginPath();
            let first = true;
            for (let i = 0; i <= 20; i++) {
              const xVal = -gridSize / 2 + (i * gridSize) / 20;
              const pt = project(xVal, GRID_HEIGHT, zVal);
              
              if (pt.scale < 0.1) continue;
              if (first) {
                ctx.moveTo(pt.x, pt.y);
                first = false;
              } else {
                ctx.lineTo(pt.x, pt.y);
              }
            }
            
            ctx.strokeStyle = "rgba(0, 217, 146, 0.015)";
            ctx.lineWidth = 1;
            ctx.stroke();
          }
        });
      }

      // 2. Concentric Orbit Circles (3D Rings)
      const ringRadii = [110, 190, 270];
      ringRadii.forEach((radius, ringIdx) => {
        drawQueue.push({
          z: 300, // Orbit background plane depth
          draw: () => {
            ctx.beginPath();
            const segments = 90;
            for (let s = 0; s <= segments; s++) {
              const ang = (s * 2 * Math.PI) / segments;
              const pt = project(radius * Math.cos(ang), PLANE_HEIGHT, radius * Math.sin(ang));
              if (s === 0) {
                ctx.moveTo(pt.x, pt.y);
              } else {
                ctx.lineTo(pt.x, pt.y);
              }
            }
            ctx.strokeStyle = isActive
              ? "rgba(34, 211, 238, 0.07)"
              : "rgba(0, 217, 146, 0.04)";
            ctx.lineWidth = 1;
            ctx.stroke();

            // Draw axis markers on rings
            ctx.save();
            ctx.font = "7px JetBrains Mono";
            ctx.fillStyle = "rgba(255, 255, 255, 0.06)";
            ctx.textAlign = "center";
            const labelPt = project(0, PLANE_HEIGHT, -radius);
            ctx.fillText(`AXIS_RING_0${ringIdx + 1}`, labelPt.x, labelPt.y - 6);
            ctx.restore();
          }
        });
      });

      // 3. Project Nodes and build spokes
      const projectedNodes = nodesRef.current.map((node) => {
        // Spin node angle over time inside its orbit
        const currentAngle = node.angle + (isActive ? autoYaw * 0.4 : autoYaw * 0.1);
        const x3d = node.radius * Math.cos(currentAngle);
        const z3d = node.radius * Math.sin(currentAngle);
        const pt = project(x3d, PLANE_HEIGHT, z3d);

        return {
          ...node,
          projX: pt.x,
          projY: pt.y,
          projZ: pt.z,
          scale: pt.scale,
        };
      });

      // Spokes between concentric rings
      projectedNodes.forEach((nodeA) => {
        projectedNodes.forEach((nodeB) => {
          // Rule: Connect rings adjacent to each other if within small angular threshold
          const isAdjacentRing = nodeB.ring === nodeA.ring + 1;
          if (isAdjacentRing) {
            // Find angles of nodes
            const angleDiff = Math.abs((nodeA.angle % (2 * Math.PI)) - (nodeB.angle % (2 * Math.PI)));
            if (angleDiff < Math.PI / 3) {
              const avgZ = (nodeA.projZ + nodeB.projZ) / 2;

              drawQueue.push({
                z: avgZ,
                draw: () => {
                  ctx.beginPath();
                  ctx.moveTo(nodeA.projX, nodeA.projY);
                  ctx.lineTo(nodeB.projX, nodeB.projY);
                  
                  // Perspective depth fade for lines
                  const fog = Math.max(0.02, Math.min(0.35, 1 - (avgZ + 150) / 450));
                  ctx.strokeStyle = isActive
                    ? `rgba(34, 211, 238, ${fog * 0.6})`
                    : `rgba(0, 217, 146, ${fog * 0.35})`;
                  ctx.lineWidth = 0.8;
                  ctx.stroke();
                }
              });
            }
          }
        });
      });

      // Nodes rendering
      projectedNodes.forEach((node) => {
        const rgb = STATUS_COLORS[node.status];
        
        drawQueue.push({
          z: node.projZ,
          draw: () => {
            // Base depth opacity (fog)
            const fog = Math.max(0.1, Math.min(1.0, 1 - (node.projZ + 150) / 450));
            const radius = Math.max(1, 4 * node.scale);
            const pulse = 0.6 + 0.4 * Math.abs(Math.sin(autoYaw * 3 + node.id));

            // Outer Glow ring
            ctx.beginPath();
            ctx.arc(node.projX, node.projY, radius * (1.6 + pulse * 1.2), 0, Math.PI * 2);
            ctx.fillStyle = `rgba(${rgb}, ${0.1 * fog * pulse})`;
            ctx.fill();

            // Core dot
            ctx.beginPath();
            ctx.arc(node.projX, node.projY, radius, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(${rgb}, ${fog * (0.6 + 0.4 * pulse)})`;
            ctx.fill();

            // Interactive micro-label details for foreground nodes
            if (fog > 0.65) {
              ctx.save();
              ctx.font = "8px JetBrains Mono";
              ctx.fillStyle = `rgba(255, 255, 255, ${fog * 0.25})`;
              ctx.textAlign = "left";
              ctx.fillText(node.label, node.projX + radius + 5, node.projY + 3);
              
              // Latency indicator
              ctx.fillStyle = `rgba(${rgb}, ${fog * 0.45})`;
              ctx.fillText(`${node.ping}ms`, node.projX + radius + 5, node.projY + 12);
              ctx.restore();
            }
          }
        });
      });

      // Central Command Hub Orb
      const hubPt = project(0, PLANE_HEIGHT, 0);
      drawQueue.push({
        z: hubPt.z,
        draw: () => {
          const fog = Math.max(0.2, Math.min(1.0, 1 - (hubPt.z + 150) / 450));
          const hubPulse = 1.1 + 0.25 * Math.abs(Math.sin(autoYaw * 2.5));
          const size = Math.max(3, 8 * hubPt.scale);

          // Hub glow halo
          ctx.beginPath();
          ctx.arc(hubPt.x, hubPt.y, size * (2 * hubPulse), 0, Math.PI * 2);
          ctx.fillStyle = isActive
            ? `rgba(34, 211, 238, ${0.08 * fog})`
            : `rgba(0, 217, 146, ${0.05 * fog})`;
          ctx.fill();

          // Hub core
          ctx.beginPath();
          ctx.arc(hubPt.x, hubPt.y, size, 0, Math.PI * 2);
          ctx.fillStyle = isActive
            ? `rgba(34, 211, 238, ${0.8 * fog})`
            : `rgba(0, 217, 146, ${0.6 * fog})`;
          ctx.strokeStyle = "#ffffff";
          ctx.lineWidth = 1;
          ctx.fill();
          ctx.stroke();

          // Reticle Ring
          ctx.beginPath();
          ctx.arc(hubPt.x, hubPt.y, size * 2.5, 0, Math.PI * 2);
          ctx.strokeStyle = isActive
            ? `rgba(34, 211, 238, ${0.2 * fog})`
            : `rgba(0, 217, 146, ${0.15 * fog})`;
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 4]);
          ctx.stroke();
          ctx.setLineDash([]); // Reset dash
        }
      });

      // 4. Sort draw queue back-to-front (depth desc, larger Z value goes first)
      drawQueue.sort((a, b) => b.z - a.z);

      // Execute all draw commands
      drawQueue.forEach((cmd) => cmd.draw());

      animFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener("resize", resize);
      if (container) {
        container.removeEventListener("mousemove", handleMouseMove);
      }
      cancelAnimationFrame(animFrameId);
    };
  }, [isActive]);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 overflow-hidden w-full h-full cursor-crosshair z-0"
    >
      {/* Dynamic ambient backdrop light */}
      <div
        className="absolute rounded-full blur-3xl opacity-[0.06] transition-all duration-1000 pointer-events-none"
        style={{
          width: "60%",
          height: "60%",
          left: "20%",
          top: "15%",
          background: isActive
            ? "radial-gradient(circle, rgba(34,211,238,0.25) 0%, transparent 80%)"
            : "radial-gradient(circle, rgba(0,217,146,0.18) 0%, transparent 80%)",
        }}
      />
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full block" />
    </div>
  );
}

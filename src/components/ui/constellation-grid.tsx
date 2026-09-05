'use client';

import React, { useEffect, useRef, useSyncExternalStore } from 'react';

export interface ConstellationGridProps {
  /** Optional custom class name for the wrapper container */
  readonly className?: string;
  /** Whether to show the default standalone Constellation text overlay (default: false when embedded as background) */
  readonly showOverlay?: boolean;
  /** Whether the canvas should have a transparent background to preserve underlying gradients (default: true) */
  readonly transparent?: boolean;
  /** Custom children to render on top of the canvas */
  readonly children?: React.ReactNode;
}

interface Node {
  x: number;
  y: number;
  vx: number;
  vy: number;
  baseX: number;
  baseY: number;
  radius: number;
  label: string;
  pulse: number;
}

function subscribeToDarkMode(callback: () => void) {
  if (typeof window === 'undefined') return () => {};
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  mediaQuery.addEventListener('change', callback);
  return () => mediaQuery.removeEventListener('change', callback);
}

function getDarkModeSnapshot(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function getDarkModeServerSnapshot(): boolean {
  return false;
}

export default function ConstellationGrid({
  className = '',
  showOverlay = false,
  transparent = true,
  children,
}: ConstellationGridProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const isDarkMode = useSyncExternalStore(
    subscribeToDarkMode,
    getDarkModeSnapshot,
    getDarkModeServerSnapshot
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { alpha: transparent });
    if (!ctx) return;

    let animationFrameId: number;
    let width = 0;
    let height = 0;

    // Mouse velocity & inertial tracking
    const mouse = {
      x: -1000,
      y: -1000,
      prevX: -1000,
      prevY: -1000,
      vx: 0,
      vy: 0,
      radius: 220,
    };

    let nodes: Node[] = [];

    const handleResize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const parent = containerRef.current || canvas.parentElement;
      width = parent ? parent.clientWidth : window.innerWidth;
      height = parent ? parent.clientHeight : window.innerHeight;

      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.scale(dpr, dpr);
      initNodes();
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      // Track mouse position relative to canvas coordinates
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
    };

    const handleMouseLeave = () => {
      mouse.x = -1000;
      mouse.y = -1000;
    };

    const initNodes = () => {
      nodes = [];
      const spacing = 55; // Tighter grid density for richer visual connections
      const cols = Math.ceil(width / spacing) + 1;
      const rows = Math.ceil(height / spacing) + 1;

      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
          const x = i * spacing;
          const y = j * spacing;
          nodes.push({
            x,
            y,
            vx: 0,
            vy: 0,
            baseX: x,
            baseY: y,
            radius: Math.random() * 1.2 + 1.2,
            label: `${(i * 7).toString(16).toUpperCase()}:${(j * 11).toString(16).toUpperCase()}`,
            pulse: Math.random() * Math.PI * 2,
          });
        }
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseleave', handleMouseLeave);

    let lastTime = performance.now();

    const render = (now: number) => {
      // Normalize dt across high-refresh displays
      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;

      // Mouse velocity calculation
      mouse.vx = (mouse.x - mouse.prevX) / (dt * 1000 || 1);
      mouse.vy = (mouse.y - mouse.prevY) / (dt * 1000 || 1);
      mouse.prevX = mouse.x;
      mouse.prevY = mouse.y;

      const speed = Math.sqrt(mouse.vx * mouse.vx + mouse.vy * mouse.vy);

      // Color paletting for dark/light seamlessness
      const bgColor = isDarkMode ? '#030407' : '#F8FAFC';
      const nodeColor = isDarkMode ? '255, 255, 255' : '16, 50, 91'; // Bhejo Brand Navy in light mode
      const accentColor = isDarkMode ? '56, 189, 248' : '37, 99, 235'; // Vibrant blue accent

      if (transparent) {
        ctx.clearRect(0, 0, width, height);
      } else {
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, width, height);
      }

      // Node Physics Engine (Hooke's Law Spring-Mass-Damping system)
      const SPRING_K = 18; // Spring stiffness
      const DAMPING = 0.82; // Velocity resistance

      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        n.pulse += dt * 3;

        // Mouse distance vectors
        const dx = mouse.x - n.x;
        const dy = mouse.y - n.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // Dynamic shockwave repulsion based on cursor speed
        if (dist < mouse.radius && dist > 0) {
          const power = 1 - dist / mouse.radius;
          const force = power * (1500 + speed * 150);
          const angle = Math.atan2(dy, dx);

          // Impulse force pushing node away from cursor
          n.vx -= Math.cos(angle) * force * dt;
          n.vy -= Math.sin(angle) * force * dt;
        }

        // Calculate restoring force back to home anchor point (baseX, baseY)
        const homeDx = n.baseX - n.x;
        const homeDy = n.baseY - n.y;

        n.vx += homeDx * SPRING_K * dt;
        n.vy += homeDy * SPRING_K * dt;

        // Apply Damping
        n.vx *= DAMPING;
        n.vy *= DAMPING;

        // Integrate position
        n.x += n.vx * dt * 60;
        n.y += n.vy * dt * 60;
      }

      // Draw Connections (Optimized Distance Culling)
      const MAX_CONN_DIST = 75;
      const MAX_CONN_DIST_SQ = MAX_CONN_DIST * MAX_CONN_DIST;

      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];

        for (let j = i + 1; j < nodes.length; j++) {
          const n2 = nodes[j];
          const ndx = n.x - n2.x;
          const ndy = n.y - n2.y;
          const distSq = ndx * ndx + ndy * ndy;

          if (distSq < MAX_CONN_DIST_SQ) {
            const nDist = Math.sqrt(distSq);
            // Ultra-subtle connection lines (almost invisible when idle, gently revealed near cursor)
            const mdx = mouse.x - n.x;
            const mdy = mouse.y - n.y;
            const isNearCursor = (mdx * mdx + mdy * mdy) < (mouse.radius * mouse.radius);
            const lineMultiplier = isNearCursor ? (isDarkMode ? 0.35 : 0.25) : (isDarkMode ? 0.04 : 0.03);
            const alpha = (1 - nDist / MAX_CONN_DIST) * lineMultiplier;

            if (alpha > 0.005) {
              ctx.strokeStyle = `rgba(${nodeColor}, ${alpha})`;
              ctx.lineWidth = isNearCursor ? 0.8 : 0.5;
              ctx.beginPath();
              ctx.moveTo(n.x, n.y);
              ctx.lineTo(n2.x, n2.y);
              ctx.stroke();
            }
          }
        }
      }

      // Render Node Points & Interactive Highlights
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        const dx = mouse.x - n.x;
        const dy = mouse.y - n.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const isNear = dist < mouse.radius;

        // Subtle, delicate star pulse when idle, vibrant when active
        const baseAlpha = isNear ? 0.95 : (isDarkMode ? 0.18 : 0.22) + Math.sin(n.pulse) * 0.06;

        ctx.fillStyle = isNear
          ? `rgba(${accentColor}, ${baseAlpha})`
          : `rgba(${nodeColor}, ${baseAlpha})`;

        const currentRadius = isNear
          ? n.radius * 1.8
          : Math.max(0.6, (n.radius * 0.75) + Math.sin(n.pulse) * 0.2);

        ctx.beginPath();
        ctx.arc(n.x, n.y, currentRadius, 0, Math.PI * 2);
        ctx.fill();

        // High-tech Spatial Radar Rings on active proximity
        if (dist < 90) {
          const pulseRing = ((n.pulse * 20) % 30) + 4;
          const ringAlpha = (1 - pulseRing / 34) * 0.4;

          ctx.strokeStyle = `rgba(${accentColor}, ${ringAlpha})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(n.x, n.y, pulseRing, 0, Math.PI * 2);
          ctx.stroke();

          // Hex Coordinate Readout
          ctx.font = '8px ui-monospace, SFMono-Regular, Consolas, monospace';
          ctx.fillStyle = `rgba(${accentColor}, 0.85)`;
          ctx.fillText(n.label, n.x + 10, n.y - 10);
        }
      }

      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [isDarkMode, transparent]);

  return (
    <div
      ref={containerRef}
      className={`relative w-full overflow-hidden select-none ${
        transparent
          ? 'bg-transparent'
          : 'bg-slate-950 dark:bg-slate-950 light:bg-slate-50'
      } ${className}`}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 block pointer-events-none"
      />

      {/* Optional demo overlay title (only shown if requested) */}
      {showOverlay && (
        <div className="relative z-10 flex h-full min-h-screen flex-col items-center justify-center text-center px-4 pointer-events-none mix-blend-difference text-white">
          <h1 className="font-mono text-6xl md:text-9xl font-black tracking-tighter uppercase leading-none">
            Constellation
          </h1>
          <p className="mt-4 font-mono text-xs md:text-sm max-w-lg opacity-70">
            High-velocity dynamic mesh. Sweep your cursor quickly across the grid
            to unleash kinetic shockwaves.
          </p>
        </div>
      )}

      {children}
    </div>
  );
}

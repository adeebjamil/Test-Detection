"use client";

import React, { useRef, useState, useEffect, useCallback } from "react";
import { Move, Loader2 } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:4000/api";

interface CameraPreviewCardProps {
  cam: any;
  small?: boolean;
}

/**
 * Embedded CCTV Live Video Feed with fallback to architectural schematic.
 * Embeds directly inside Camera Channel Cards.
 */
export function CameraCardFeed({ cam, small = false }: CameraPreviewCardProps) {
  const [imgState, setImgState] = useState<"loading" | "live" | "fallback">("loading");
  const [key, setKey] = useState(0);

  // If camera is disabled or completely offline, show schematic fallback immediately
  const isAvailable = cam?.enabled && (cam?.streaming || cam?.status === "streaming");

  useEffect(() => {
    if (!isAvailable) {
      setImgState("fallback");
      return;
    }
    setImgState("loading");
    const t = setTimeout(() => {
      setImgState((prev) => (prev === "loading" ? "fallback" : prev));
    }, 6000);
    return () => clearTimeout(t);
  }, [cam?.id, cam?.status, isAvailable, key]);

  const x1 = (+cam.line_x1 || 0.1) * 160;
  const y1 = (+cam.line_y1 || 0.5) * 90;
  const x2 = (+cam.line_x2 || 0.9) * 160;
  const y2 = (+cam.line_y2 || 0.5) * 90;
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const down = cam.in_direction === "top_to_bottom";

  return (
    <div
      className={`relative w-full ${
        small ? "h-36 sm:h-44 my-3" : "h-56 sm:h-64 my-3"
      } rounded-2xl overflow-hidden bg-slate-900 border border-slate-200 dark:border-white/10 shadow-inner group flex items-center justify-center`}
    >
      {/* CCTV Live Video Stream */}
      {isAvailable && imgState !== "fallback" && (
        <img
          key={key}
          src={`${API}/cameras/${cam.id}/live?k=${key}`}
          alt={`${cam.name} CCTV Feed`}
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 pointer-events-none ${
            imgState === "live" ? "opacity-100" : "opacity-0"
          }`}
          onLoad={() => setImgState("live")}
          onError={() => setImgState("fallback")}
        />
      )}

      {/* Grid Pattern / Fallback Schematic */}
      {(!isAvailable || imgState === "fallback") && (
        <svg viewBox="0 0 160 90" className="absolute inset-0 w-full h-full bg-[#16171a] pointer-events-none">
          <defs>
            <pattern id={`cctv-grid-${cam.id}`} width="16" height="9" patternUnits="userSpaceOnUse">
              <path d="M16 0H0V9" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="0.4" />
            </pattern>
          </defs>
          <rect width="160" height="90" fill={`url(#cctv-grid-${cam.id})`} />
        </svg>
      )}

      {/* Counting Line & Direction Overlay (Drawn on top of CCTV video) */}
      <svg
        viewBox="0 0 160 90"
        className="absolute inset-0 w-full h-full pointer-events-none drop-shadow-md"
        preserveAspectRatio="none"
      >
        <line
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke="#06b6d4"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <circle cx={x1} cy={y1} r="3" fill="#0891b2" stroke="#fff" strokeWidth="0.8" />
        <circle cx={x2} cy={y2} r="3" fill="#0891b2" stroke="#fff" strokeWidth="0.8" />
        <g fontSize="5.5" fontWeight="800" textAnchor="middle">
          <text
            x={mx}
            y={Math.max(8, my - 5)}
            fill={down ? "#10b981" : "#f97316"}
            className="select-none"
            style={{ paintOrder: "stroke", stroke: "#000", strokeWidth: "1.2px" }}
          >
            {down ? "↓ IN" : "↑ OUT"}
          </text>
          <text
            x={mx}
            y={Math.min(86, my + 9)}
            fill={down ? "#f97316" : "#10b981"}
            className="select-none"
            style={{ paintOrder: "stroke", stroke: "#000", strokeWidth: "1.2px" }}
          >
            {down ? "↑ OUT" : "↓ IN"}
          </text>
        </g>
      </svg>

      {/* Top Overlay Badges */}
      <div className="absolute top-2.5 left-2.5 flex items-center gap-2 pointer-events-none z-10">
        <span
          className={`flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider backdrop-blur-md ${
            imgState === "live"
              ? "bg-rose-500/80 text-white"
              : "bg-black/60 text-white/70 border border-white/10"
          }`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              imgState === "live" ? "bg-white animate-pulse" : "bg-white/40"
            }`}
          />
          {imgState === "live" ? "CCTV LIVE" : cam.streaming ? "SIGNAL OK" : "OFFLINE"}
        </span>
      </div>

      {/* Loading state indicator */}
      {isAvailable && imgState === "loading" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-xs text-white/80 text-xs gap-2 z-10 pointer-events-none">
          <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
          <span>Connecting CCTV stream…</span>
        </div>
      )}

      {/* Fallback state overlay notice */}
      {imgState === "fallback" && (
        <div className="absolute bottom-2 right-2.5 text-[10px] text-white/40 font-mono tracking-tight pointer-events-none">
          Schematic preview
        </div>
      )}
    </div>
  );
}

interface InteractiveLineEditorProps {
  cam: any;
  onChange: (coords: { line_x1: number; line_y1: number; line_x2: number; line_y2: number }) => void;
}

/**
 * Interactive Mouse-Draggable CCTV Line Editor
 * Robust pointer events without hover jitter / scale shake.
 */
export function InteractiveLineEditor({ cam, onChange }: InteractiveLineEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeDrag, setActiveDrag] = useState<"p1" | "p2" | "line" | null>(null);
  const [streamError, setStreamError] = useState(false);

  // Keep coords and latest drag params in ref to prevent stale closures and jitter loops
  const coordsRef = useRef({
    x1: Number(cam.line_x1 ?? 0.1),
    y1: Number(cam.line_y1 ?? 0.5),
    x2: Number(cam.line_x2 ?? 0.9),
    y2: Number(cam.line_y2 ?? 0.5),
  });

  const dragRef = useRef<{
    active: "p1" | "p2" | "line" | null;
    startMidX: number;
    startMidY: number;
    startPtrX: number;
    startPtrY: number;
    origX1: number;
    origY1: number;
    origX2: number;
    origY2: number;
  }>({
    active: null,
    startMidX: 0,
    startMidY: 0,
    startPtrX: 0,
    startPtrY: 0,
    origX1: 0,
    origY1: 0,
    origX2: 0,
    origY2: 0,
  });

  const x1 = Number(cam.line_x1 ?? 0.1);
  const y1 = Number(cam.line_y1 ?? 0.5);
  const x2 = Number(cam.line_x2 ?? 0.9);
  const y2 = Number(cam.line_y2 ?? 0.5);
  coordsRef.current = { x1, y1, x2, y2 };

  const down = cam.in_direction === "top_to_bottom";

  const getRelativeCoords = useCallback((clientX: number, clientY: number) => {
    if (!containerRef.current) return { x: 0, y: 0 };
    const rect = containerRef.current.getBoundingClientRect();
    const rawX = (clientX - rect.left) / rect.width;
    const rawY = (clientY - rect.top) / rect.height;
    return {
      x: Math.min(1, Math.max(0, Math.round(rawX * 100) / 100)),
      y: Math.min(1, Math.max(0, Math.round(rawY * 100) / 100)),
    };
  }, []);

  const handlePointerDown = (type: "p1" | "p2" | "line", e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);

    const pt = getRelativeCoords(e.clientX, e.clientY);
    const { x1: curX1, y1: curY1, x2: curX2, y2: curY2 } = coordsRef.current;

    dragRef.current = {
      active: type,
      startMidX: (curX1 + curX2) / 2,
      startMidY: (curY1 + curY2) / 2,
      startPtrX: pt.x,
      startPtrY: pt.y,
      origX1: curX1,
      origY1: curY1,
      origX2: curX2,
      origY2: curY2,
    };
    setActiveDrag(type);
  };

  useEffect(() => {
    if (!activeDrag) return;

    const onPointerMove = (e: PointerEvent) => {
      if (!dragRef.current.active) return;
      const pt = getRelativeCoords(e.clientX, e.clientY);
      const d = dragRef.current;

      if (d.active === "p1") {
        onChange({ line_x1: pt.x, line_y1: pt.y, line_x2: d.origX2, line_y2: d.origY2 });
      } else if (d.active === "p2") {
        onChange({ line_x1: d.origX1, line_y1: d.origY1, line_x2: pt.x, line_y2: pt.y });
      } else if (d.active === "line") {
        const dx = pt.x - d.startPtrX;
        const dy = pt.y - d.startPtrY;

        let newX1 = d.origX1 + dx;
        let newX2 = d.origX2 + dx;
        let newY1 = d.origY1 + dy;
        let newY2 = d.origY2 + dy;

        // Bound to [0, 1] range smoothly
        if (newX1 < 0) { newX2 -= newX1; newX1 = 0; }
        if (newX2 > 1) { newX1 -= (newX2 - 1); newX2 = 1; }
        if (newY1 < 0) { newY2 -= newY1; newY1 = 0; }
        if (newY2 > 1) { newY1 -= (newY2 - 1); newY2 = 1; }

        onChange({
          line_x1: Math.max(0, Math.min(1, Math.round(newX1 * 100) / 100)),
          line_y1: Math.max(0, Math.min(1, Math.round(newY1 * 100) / 100)),
          line_x2: Math.max(0, Math.min(1, Math.round(newX2 * 100) / 100)),
          line_y2: Math.max(0, Math.min(1, Math.round(newY2 * 100) / 100)),
        });
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      try {
        (e.target as HTMLElement)?.releasePointerCapture?.(e.pointerId);
      } catch { /* ignore */ }
      dragRef.current.active = null;
      setActiveDrag(null);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);

    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };
  }, [activeDrag, getRelativeCoords, onChange]);

  // Pixel coordinates in 100% SVG box (400 x 225)
  const svgX1 = x1 * 400;
  const svgY1 = y1 * 225;
  const svgX2 = x2 * 400;
  const svgY2 = y2 * 225;
  const midX = (svgX1 + svgX2) / 2;
  const midY = (svgY1 + svgY2) / 2;

  return (
    <div className="space-y-2 select-none">
      <div
        ref={containerRef}
        className="relative w-full aspect-video rounded-2xl overflow-hidden bg-slate-900 border-2 border-blue-500/40 shadow-xl touch-none select-none"
      >
        {/* Real CCTV Feed Background in Editor */}
        {cam?.id && !streamError ? (
          <img
            src={`${API}/cameras/${cam.id}/live`}
            alt="CCTV stream"
            className="absolute inset-0 w-full h-full object-cover pointer-events-none select-none"
            onError={() => setStreamError(true)}
          />
        ) : (
          <svg viewBox="0 0 400 225" className="absolute inset-0 w-full h-full bg-[#18191c] pointer-events-none">
            <defs>
              <pattern id="editor-grid" width="40" height="22.5" patternUnits="userSpaceOnUse">
                <path d="M40 0H0V22.5" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
              </pattern>
            </defs>
            <rect width="400" height="225" fill="url(#editor-grid)" />
          </svg>
        )}

        {/* Draggable SVG Elements */}
        <svg
          viewBox="0 0 400 225"
          className="absolute inset-0 w-full h-full select-none"
          preserveAspectRatio="none"
        >
          {/* Visible counting line */}
          <line
            x1={svgX1}
            y1={svgY1}
            x2={svgX2}
            y2={svgY2}
            stroke="#06b6d4"
            strokeWidth="3.5"
            strokeLinecap="round"
            className="pointer-events-none drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]"
          />

          {/* Wide transparent hit area for moving entire line without hover shake */}
          <line
            x1={svgX1}
            y1={svgY1}
            x2={svgX2}
            y2={svgY2}
            stroke="transparent"
            strokeWidth="28"
            className="cursor-move pointer-events-auto"
            onPointerDown={(e) => handlePointerDown("line", e)}
          />

          {/* Direction indicators */}
          <g fontSize="13" fontWeight="800" textAnchor="middle" className="pointer-events-none select-none">
            <text
              x={midX}
              y={Math.max(18, midY - 10)}
              fill={down ? "#10b981" : "#f97316"}
              style={{ paintOrder: "stroke", stroke: "#000", strokeWidth: "3px" }}
            >
              {down ? "↓ IN" : "↑ OUT"}
            </text>
            <text
              x={midX}
              y={Math.min(215, midY + 20)}
              fill={down ? "#f97316" : "#10b981"}
              style={{ paintOrder: "stroke", stroke: "#000", strokeWidth: "3px" }}
            >
              {down ? "↑ OUT" : "↓ IN"}
            </text>
          </g>

          {/* Center Line Handle */}
          <g
            className="cursor-move pointer-events-auto"
            onPointerDown={(e) => handlePointerDown("line", e)}
          >
            {/* Invisible large touch target */}
            <circle cx={midX} cy={midY} r="18" fill="transparent" />
            <circle
              cx={midX}
              cy={midY}
              r="8"
              fill={activeDrag === "line" ? "#38bdf8" : "#06b6d4"}
              stroke="#ffffff"
              strokeWidth="2.5"
              className="drop-shadow-md"
            />
          </g>

          {/* Handle Point 1 (Start) */}
          <g
            className="cursor-grab active:cursor-grabbing pointer-events-auto"
            onPointerDown={(e) => handlePointerDown("p1", e)}
          >
            {/* Invisible large touch target (prevents mouse slip) */}
            <circle cx={svgX1} cy={svgY1} r="22" fill="transparent" />
            <circle
              cx={svgX1}
              cy={svgY1}
              r="11"
              fill="#2563eb"
              stroke="#ffffff"
              strokeWidth="3"
              className="drop-shadow-lg"
            />
            <circle cx={svgX1} cy={svgY1} r="3.5" fill="#ffffff" />
          </g>

          {/* Handle Point 2 (End) */}
          <g
            className="cursor-grab active:cursor-grabbing pointer-events-auto"
            onPointerDown={(e) => handlePointerDown("p2", e)}
          >
            {/* Invisible large touch target (prevents mouse slip) */}
            <circle cx={svgX2} cy={svgY2} r="22" fill="transparent" />
            <circle
              cx={svgX2}
              cy={svgY2}
              r="11"
              fill="#2563eb"
              stroke="#ffffff"
              strokeWidth="3"
              className="drop-shadow-lg"
            />
            <circle cx={svgX2} cy={svgY2} r="3.5" fill="#ffffff" />
          </g>
        </svg>

        {/* Quick Help Overlay Tip */}
        <div className="absolute bottom-2 left-2 flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-black/75 backdrop-blur-md text-white text-[11px] font-medium border border-white/10 pointer-events-none select-none">
          <Move className="w-3.5 h-3.5 text-blue-400" />
          <span>Blue handles ya center ko mouse se drag karein</span>
        </div>
      </div>
    </div>
  );
}

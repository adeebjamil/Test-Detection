"use client";
// >>> TEMP-LIVE-PREVIEW — testing-only live view. Delete this file and the lines marked
// "TEMP-LIVE-PREVIEW" in app/page.tsx before giving the dashboard to the client.

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { MonitorPlay, X, Maximize2, Loader2, VideoOff } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:4000/api";

let enabledCache: Promise<boolean> | null = null;
const previewEnabled = () =>
  (enabledCache ??= fetch(`${API}/preview/enabled`, { credentials: "include" })
    .then((r) => (r.ok ? r.json() : { enabled: false }))
    .then((d) => !!d.enabled)
    .catch(() => false));

export function LiveViewButton({ cam, className = "" }: { cam: { id: number; name: string }; className?: string }) {
  const [enabled, setEnabled] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => { previewEnabled().then(setEnabled); }, []);
  if (!enabled) return null;
  return (
    <>
      <button type="button" onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-700 hover:to-indigo-700 shadow-sm transition ${className}`}>
        <MonitorPlay className="w-3.5 h-3.5" />Live view
      </button>
      {open && <LiveViewer cam={cam} onClose={() => setOpen(false)} />}
    </>
  );
}

function LiveViewer({ cam, onClose }: { cam: { id: number; name: string }; onClose: () => void }) {
  const [state, setState] = useState<"loading" | "live" | "error">("loading");
  const [key, setKey] = useState(0);
  const boxRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    // no frame within 12s -> show error (engine not processing this camera yet)
    const t = setTimeout(() => setState((s) => (s === "loading" ? "error" : s)), 12000);
    return () => { window.removeEventListener("keydown", onKey); clearTimeout(t); };
  }, [onClose, key]);

  return createPortal(
    <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={(e) => { e.stopPropagation(); onClose(); }}>
      <div ref={boxRef} className="relative w-full max-w-5xl bg-[#111] rounded-2xl overflow-hidden shadow-2xl border border-white/10" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10 text-white">
          <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-rose-400">
            <span className={`w-2 h-2 rounded-full ${state === "live" ? "bg-rose-500 animate-pulse" : "bg-white/30"}`} />Live
          </span>
          <p className="text-sm font-semibold truncate">{cam.name}</p>
          <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-semibold">TEST MODE</span>
          <div className="ml-auto flex items-center gap-1">
            <button onClick={() => boxRef.current?.requestFullscreen?.()} className="p-1.5 rounded-lg hover:bg-white/10" title="Fullscreen"><Maximize2 className="w-4 h-4" /></button>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10" title="Close"><X className="w-4 h-4" /></button>
          </div>
        </div>
        <div className="relative aspect-video bg-black flex items-center justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img key={key} src={`${API}/cameras/${cam.id}/live?k=${key}`} alt={`${cam.name} live view`}
            className={`w-full h-full object-contain ${state === "live" ? "" : "opacity-0"}`}
            onLoad={() => setState("live")} onError={() => setState("error")} />
          {state === "loading" && <div className="absolute inset-0 flex flex-col items-center justify-center text-white/70 text-sm gap-2"><Loader2 className="w-6 h-6 animate-spin" />Connecting to camera…</div>}
          {state === "error" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-white/70 text-sm gap-3 text-center px-6">
              <VideoOff className="w-8 h-8" />
              <p>No frames yet. Make sure the camera is enabled and the AI engine is running.</p>
              <button onClick={() => { setState("loading"); setKey((k) => k + 1); }} className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-semibold">Retry</button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
// <<< TEMP-LIVE-PREVIEW

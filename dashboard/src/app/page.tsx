"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ShieldCheck, LayoutDashboard, Activity, UsersRound, PawPrint, BarChart3, FileText, Video, Settings,
  ArrowUpRight, ArrowDownRight, Users, Dog, Cat, Download, CheckCircle2, AlertCircle, Menu, X, RefreshCw,
  Clock, Info, Wifi, WifiOff, Plus, Trash2, Zap, Lock, Pencil, Cpu, Database, Baby, ChevronRight, ChevronDown, Power, Sun, Moon, LogOut, KeyRound,
  RotateCcw, CalendarClock, Sunrise,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { LogoMark, LogoLandscape } from "../components/Logo";
import { CctvIcon } from "../components/CctvIcon";
import { LiveViewButton } from "../components/LivePreview"; // TEMP-LIVE-PREVIEW
import { CameraCardFeed, InteractiveLineEditor } from "../components/CameraPreview";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

const API = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:4000/api";

type Period = "today" | "yesterday" | "7d";
const PERIODS: { id: Period; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "7d", label: "Last 7 days" },
];

const TABS = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "entrances", label: "Entrance Analytics", icon: Activity },
  { id: "demographics", label: "Demographics", icon: UsersRound },
  { id: "animals", label: "Animal Analytics", icon: PawPrint },
  { id: "trends", label: "Footfall Trends", icon: BarChart3 },
  { id: "reports", label: "Reports", icon: FileText },
  { id: "cameras", label: "Cameras", icon: Video },
  { id: "network", label: "Network & Wi-Fi", icon: Wifi },
  { id: "settings", label: "Settings", icon: Settings },
] as const;
type Tab = (typeof TABS)[number]["id"];

const COLORS = ["var(--c-primary)", "var(--c-success)", "var(--c-orange)", "var(--c-violet)", "var(--c-info)", "var(--c-pink)", "var(--c-warning)", "var(--c-muted)"];

async function req(method: string, path: string, body?: any) {
  const r = await fetch(`${API}${path}`, {
    method,
    credentials: "include",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  const data = text ? JSON.parse(text) : null;
  if (r.status === 401 && typeof window !== "undefined" && !path.startsWith("/auth/")) {
    window.location.replace("/login");
    throw new Error("Session expired — please sign in again");
  }
  if (!r.ok) throw new Error(data?.error ? `${data.error}${data.detail ? ` — ${data.detail}` : ""}` : `HTTP ${r.status}`);
  return data;
}

const fmt = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString());
function timeAgo(iso?: string | null) {
  if (!iso) return "never";
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return new Date(iso).toLocaleDateString();
}
const localTime = (iso?: string | null) => (iso ? new Date(iso).toLocaleString() : "—");

const STATUS_STYLE: Record<string, string> = {
  streaming: "bg-emerald-50 text-emerald-700 border-emerald-200",
  reachable: "bg-blue-50 text-blue-700 border-blue-200",
  offline: "bg-rose-50 text-rose-700 border-rose-200",
  error: "bg-amber-50 text-amber-700 border-amber-200",
  disabled: "bg-slate-100 text-slate-500 border-slate-200",
  unknown: "bg-slate-50 text-slate-500 border-slate-200",
};

// ============================================================================
// Small UI primitives
// ============================================================================
function Card({ children, onClick, className = "", title }: { children: React.ReactNode; onClick?: () => void; className?: string; title?: string }) {
  return (
    <div
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      title={title}
      onClick={onClick}
      onKeyDown={(e) => { if (onClick && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onClick(); } }}
      className={`bg-card rounded-xl border border-slate-200/70 shadow-card p-5 ${onClick ? "cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_14px_24px_-10px_rgb(0_0_0/var(--shadow-a))] focus:outline-none focus:ring-2 focus:ring-blue-300" : ""} ${className}`}
    >
      {children}
    </div>
  );
}

function SectionTitle({ title, sub, right }: { title: string; sub?: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 mb-4">
      <div>
        <h2 className="text-[15px] font-bold text-slate-900">{title}</h2>
        {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

function Empty({ icon: Icon = Info, title, sub, action }: { icon?: any; title: string; sub?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-10 px-4">
      <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mb-3"><Icon className="w-6 h-6 text-slate-400" /></div>
      <p className="text-sm font-semibold text-slate-700">{title}</p>
      {sub && <p className="text-xs text-slate-500 mt-1 max-w-sm">{sub}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

function Btn({ children, onClick, variant = "primary", disabled, type = "button", className = "" }: any) {
  const v: Record<string, string> = {
    primary: "bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-700 hover:to-indigo-700 shadow-sm",
    ghost: "bg-card border border-slate-200 text-slate-700 hover:bg-slate-50",
    danger: "bg-rose-50 border border-rose-200 text-rose-700 hover:bg-rose-100",
  };
  return (
    <button type={type} disabled={disabled} onClick={(e) => { e.stopPropagation(); onClick?.(e); }}
      className={`inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed ${v[variant]} ${className}`}>
      {children}
    </button>
  );
}

function Modal({ open, onClose, title, sub, children, wide }: { open: boolean; onClose: () => void; title: string; sub?: string; children: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className={`bg-card dark:border dark:border-white/10 rounded-2xl shadow-2xl w-full ${wide ? "max-w-3xl" : "max-w-lg"} max-h-[90vh] overflow-y-auto`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between p-5 border-b border-slate-100 dark:border-white/10 sticky top-0 bg-card rounded-t-2xl">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">{title}</h3>
            {sub && <p className="text-xs text-slate-500 dark:text-white/60 mt-0.5">{sub}</p>}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 text-slate-500 dark:text-white/70 hover:text-slate-800 dark:hover:text-white transition-colors" aria-label="Close"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function Rows({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <dl className="divide-y divide-slate-100">
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-4 py-2.5 text-sm">
          <dt className="text-slate-500">{k}</dt>
          <dd className="font-semibold text-slate-800 text-right break-all">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

const STATUS_LABEL: Record<string, string> = { streaming: "Live", reachable: "Connected", offline: "Offline", error: "Needs attention", disabled: "Paused", unknown: "Connecting" };

function StatusBadge({ status }: { status: string }) {
  return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-semibold ${STATUS_STYLE[status] || STATUS_STYLE.unknown}`}>
    <span className={`w-1.5 h-1.5 rounded-full ${status === "streaming" ? "bg-emerald-500 animate-pulse" : "bg-current opacity-60"}`} />{STATUS_LABEL[status] || "Connecting"}
  </span>;
}

const signalLevel = (s?: number | null) => (!s ? 0 : s >= 80 ? 4 : s >= 60 ? 3 : s >= 40 ? 2 : 1);
const signalLabel = (s?: number | null) => ["No signal", "Weak", "Fair", "Good", "Excellent"][signalLevel(s)];

function SignalBars({ signal, size = 18, light = false }: { signal?: number | null; size?: number; light?: boolean }) {
  const lvl = signalLevel(signal);
  return (
    <span className="inline-flex items-end gap-[3px]" style={{ height: size }} aria-label={`${signalLabel(signal)} signal`}>
      {[0.35, 0.55, 0.78, 1].map((h, i) => (
        <span key={i} className={`rounded-sm transition-colors ${i < lvl ? (light ? "bg-white" : "bg-emerald-500") : light ? "bg-white/30" : "bg-slate-200"}`} style={{ width: Math.max(3, size / 5), height: size * h }} />
      ))}
    </span>
  );
}

function Growth({ value }: { value: number | null | undefined }) {
  if (value == null) return <span className="text-[11px] text-slate-400">No prior data to compare</span>;
  const up = value >= 0;
  return <span className={`inline-flex items-center gap-0.5 text-[11px] font-semibold ${up ? "text-emerald-600" : "text-rose-600"}`}>
    {up ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}{Math.abs(value)}% vs previous period
  </span>;
}

function Kpi({ icon: Icon, color, label, value, foot, onClick, footIcon: FootIcon = RefreshCw }: any) {
  const text = String(color).split(" ").filter((c: string) => c.startsWith("text-")).join(" ");
  return (
    <Card onClick={onClick} className="!p-0">
      <div className="flex items-center gap-4 px-5 pt-5 pb-4">
        <Icon className={`w-12 h-12 shrink-0 ${text}`} strokeWidth={1.4} />
        <div className="ml-auto text-right min-w-0">
          <p className="text-[13px] text-slate-400 truncate">{label}</p>
          <p className="text-[26px] leading-tight font-normal text-slate-900 tabular-nums">{value}</p>
        </div>
      </div>
      <div className="mx-5 border-t border-slate-200" />
      <div className="flex items-center gap-1.5 px-5 py-3 text-[11px] text-slate-500 min-h-[40px]"><FootIcon className="w-3 h-3 shrink-0 text-slate-400" />{foot}</div>
    </Card>
  );
}

function Bar100({ parts }: { parts: { v: number; c: string }[] }) {
  const total = parts.reduce((a, p) => a + p.v, 0);
  return (
    <div className="h-2 rounded-full bg-slate-100 overflow-hidden flex">
      {total > 0 && parts.map((p, i) => <div key={i} style={{ width: `${(p.v / total) * 100}%`, background: p.c }} />)}
    </div>
  );
}

// ============================================================================
// Page
// ============================================================================
export default function Home() {
  const router = useRouter();
  const [me, setMe] = useState<any>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [pw, setPw] = useState({ current: "", next: "", confirm: "", busy: false });
  useEffect(() => {
    req("GET", "/auth/status")
      .then((s) => (s.authenticated ? setMe(s.user) : router.replace("/login")))
      .catch((e) => setAuthError(`Backend not reachable at ${API} (${e.message})`));
  }, [router]);
  const [tab, setTab] = useState<Tab>("overview");
  const [period, setPeriod] = useState<Period>("today");
  const [cameraTreeOpen, setCameraTreeOpen] = useState(true);
  const [selectedCamSlot, setSelectedCamSlot] = useState<number | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [dark, setDark] = useState(false);
  useEffect(() => { setDark(document.documentElement.classList.contains("dark")); }, []);
  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try { localStorage.setItem("mv-theme", next ? "dark" : "light"); } catch { /* private mode */ }
  };

  const [summary, setSummary] = useState<any>(null);
  const [cameras, setCameras] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [engine, setEngine] = useState<any>(null);
  const [health, setHealth] = useState<any>(null);
  const [wifi, setWifi] = useState<any>(null);
  const [networks, setNetworks] = useState<any>(null);
  const [scanning, setScanning] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);
  const [now, setNow] = useState<Date | null>(null);
  const [reportRows, setReportRows] = useState<any[]>([]);

  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [detail, setDetail] = useState<{ title: string; sub?: string; rows: [string, React.ReactNode][]; go?: Tab } | null>(null);
  const [camModal, setCamModal] = useState<any>(null);       // camera detail
  const [camForm, setCamForm] = useState<any>(null);         // add / edit form
  const [eventModal, setEventModal] = useState<any>(null);
  const [wifiModal, setWifiModal] = useState<any>(null);
  const [disconnectModalOpen, setDisconnectModalOpen] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const notify = (msg: string, ok = true) => { setToast({ msg, ok }); setTimeout(() => setToast(null), 4000); };

  // ------------------------------------------------------------------ data
  const load = useCallback(async () => {
    try {
      const [s, c, e, en, h] = await Promise.all([
        req("GET", `/analytics/summary?period=${period}`),
        req("GET", "/cameras"),
        req("GET", "/events?limit=12"),
        req("GET", "/engine/status"),
        req("GET", "/health"),
      ]);
      setSummary(s); setCameras(c); setEvents(e); setEngine(en); setHealth(h);
      setApiError(null); setLastUpdate(new Date().toISOString());
    } catch (err: any) {
      setApiError(`Backend not reachable at ${API} (${err.message})`);
    }
  }, [period]);

  const loadWifi = useCallback(async () => {
    try { setWifi(await req("GET", "/wifi/status")); } catch { /* shown via apiError */ }
  }, []);

  const scanNetworks = useCallback(async () => {
    setScanning(true);
    try { setNetworks(await req("GET", "/wifi/networks")); } catch (e: any) { notify(e.message, false); }
    setScanning(false);
  }, []);

  // Real-time: backend pushes a tiny "change" message the moment a visitor is counted; polling is only a safety net.
  const loadRef = useRef(load);
  useEffect(() => { loadRef.current = load; }, [load]);
  useEffect(() => { if (!me) return; load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, [load, me]);
  useEffect(() => {
    if (!me || typeof EventSource === "undefined") return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const es = new EventSource(`${API}/live`, { withCredentials: true });
    es.addEventListener("change", () => {
      if (timer) return;
      timer = setTimeout(() => { timer = null; loadRef.current(); }, 120);
    });
    es.addEventListener("hello", () => loadRef.current()); // (re)connected → resync once
    return () => { es.close(); if (timer) clearTimeout(timer); };
  }, [me]);
  useEffect(() => { if (!me) return; loadWifi(); const t = setInterval(loadWifi, 10000); return () => clearInterval(t); }, [loadWifi, me]);
  useEffect(() => { setNow(new Date()); const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  useEffect(() => {
    if (!me || tab !== "network") return;
    scanNetworks(); const t = setInterval(scanNetworks, 20000); return () => clearInterval(t);
  }, [tab, scanNetworks, me]);
  useEffect(() => {
    if (!me || tab !== "reports") return;
    const f = () => req("GET", `/events?limit=500&period=${period}`).then(setReportRows).catch(() => {});
    f(); const t = setInterval(f, 6000); return () => clearInterval(t);
  }, [tab, period, me]);

  const logout = async () => {
    try { await req("POST", "/auth/logout"); } catch { /* cookie cleared server-side anyway */ }
    router.replace("/login");
  };
  const changePassword = async () => {
    if (pw.next !== pw.confirm) return notify("New passwords do not match", false);
    setPw((p) => ({ ...p, busy: true }));
    try {
      await req("POST", "/auth/change-password", { currentPassword: pw.current, newPassword: pw.next });
      setPw({ current: "", next: "", confirm: "", busy: false });
      notify("Password changed — other sessions were signed out");
    } catch (e: any) { notify(e.message, false); setPw((p) => ({ ...p, busy: false })); }
  };

  const go = (t: Tab) => {
    setTab(t);
    if (t !== "cameras") setSelectedCamSlot(null);
    setMenuOpen(false);
    setDetail(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const caps = engine?.capabilities || null;
  const periodLabel = PERIODS.find((p) => p.id === period)!.label;
  const d = summary?.demographics;
  const a = summary?.animals;
  const att = summary?.culturalAttire;
  const hasEvents = !!summary?.hasEvents;
  const hourlyActive = useMemo(() => (summary?.hourly || []).filter((h: any) => h.in || h.out), [summary]);

  // ------------------------------------------------------------------ camera actions (fixed 4-slot capacity)
  const openAddCameraForSlot = (slot: number) => {
    if (cameras.length >= 4) {
      notify("Maximum capacity of 4 cameras reached", false);
      return;
    }
    const defaultZones = ["Main Entrance", "North Entrance", "Parking Entrance", "Retail Entrance"];
    setCamForm({
      name: `Cam ${slot}`,
      zone: defaultZones[slot - 1] || `Entrance ${slot}`,
      source_url: "",
      in_direction: "top_to_bottom",
      target_fps: 8,
      line_x1: 0.1, line_y1: 0.5, line_x2: 0.9, line_y2: 0.5,
    });
  };
  const openAddCamera = () => {
    if (cameras.length >= 4) {
      notify("Maximum capacity of 4 cameras reached", false);
      return;
    }
    const nextSlot = [1, 2, 3, 4].find((s) => !cameras[s - 1]) || (cameras.length + 1);
    openAddCameraForSlot(nextSlot);
  };
  const openEditCamera = (c: any) => { setCamModal(null); setCamForm({ ...c }); };

  const saveCamera = async () => {
    if (!camForm.id && cameras.length >= 4) {
      notify("Maximum capacity of 4 cameras reached", false);
      return;
    }
    const body = {
      name: camForm.name, zone: camForm.zone, source_url: camForm.source_url, in_direction: camForm.in_direction,
      target_fps: Number(camForm.target_fps), line_x1: +camForm.line_x1, line_y1: +camForm.line_y1, line_x2: +camForm.line_x2, line_y2: +camForm.line_y2,
    };
    try {
      if (camForm.id) { await req("PATCH", `/cameras/${camForm.id}`, body); notify(`Camera "${body.name}" updated`); }
      else {
        const r = await req("POST", "/cameras", body);
        notify(r.probe?.status === "offline" ? `Camera added — it is not reachable yet, please check the connection` : `Camera "${body.name}" added`, r.probe?.status !== "offline");
      }
      setCamForm(null); load();
    } catch (e: any) { notify(e.message, false); }
  };
  const toggleCamera = async (c: any) => {
    try { await req("PATCH", `/cameras/${c.id}`, { enabled: !c.enabled }); notify(`${c.name} ${c.enabled ? "disabled" : "enabled"}`); load(); setCamModal(null); }
    catch (e: any) { notify(e.message, false); }
  };
  const deleteCamera = async (c: any) => {
    if (!confirm(`Delete camera "${c.name}" and all of its recorded events?`)) return;
    try { await req("DELETE", `/cameras/${c.id}`); notify(`${c.name} deleted`); setCamModal(null); load(); }
    catch (e: any) { notify(e.message, false); }
  };
  const testCamera = async (c: any) => {
    try {
      const r = await req("POST", `/cameras/${c.id}/test`);
      if (r.status === "n/a") notify(`${c.name} is ready`);
      else notify(r.status === "online" ? `${c.name} is reachable` : `${c.name} is not reachable — please check the camera connection`, r.status === "online");
      load();
    } catch (e: any) { notify(e.message, false); }
  };

  // ------------------------------------------------------------------ wifi actions
  const connectWifi = async (ssid: string, password: string) => {
    setWifiModal((m: any) => ({ ...m, busy: true }));
    try { await req("POST", "/wifi/connect", { ssid, password }); notify(`Connected to ${ssid}`); setWifiModal(null); loadWifi(); scanNetworks(); }
    catch (e: any) { notify(e.message, false); setWifiModal((m: any) => (m ? { ...m, busy: false } : m)); }
  };
  const confirmDisconnectAction = async () => {
    setDisconnecting(true);
    try {
      await req("POST", "/wifi/disconnect");
      notify(`Disconnected from ${wifi?.ssid || "Wi-Fi"}`);
      setDisconnectModalOpen(false);
      setTimeout(() => { loadWifi(); scanNetworks(); }, 1200);
    } catch (e: any) {
      notify(e.message || "Failed to disconnect", false);
    } finally {
      setDisconnecting(false);
    }
  };

  // ------------------------------------------------------------------ shared blocks
  const noCameras = cameras.length === 0;

  const AlertBanner = () => {
    if (apiError) return <div className="mb-5 flex items-center gap-3 p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-sm"><AlertCircle className="w-5 h-5 shrink-0" />Unable to reach the analytics server. Please make sure the system is running.</div>;
    if (!summary) return null;
    if (noCameras) return (
      <Card onClick={() => go("cameras")} className="mb-5 !bg-gradient-to-r from-blue-50 to-indigo-50 !border-blue-200">
        <div className="flex items-center gap-4">
          <CctvIcon size={52} className="shrink-0 drop-shadow-[0_8px_16px_rgb(var(--blue-500)/0.35)]" />
          <div className="flex-1"><p className="text-sm font-bold text-slate-900">No cameras added yet</p><p className="text-xs text-slate-600">Add your entrance cameras to start collecting visitor analytics.</p></div>
          <Btn onClick={() => { go("cameras"); openAddCamera(); }}><Plus className="w-3.5 h-3.5" />Add camera</Btn>
        </div>
      </Card>
    );
    if (!engine?.online) return (
      <Card onClick={() => go("settings")} className="mb-5 !bg-amber-50 dark:!bg-amber-950/40 !border-amber-200 dark:!border-amber-700/50">
        <div className="flex items-center gap-3 text-sm text-amber-900 dark:text-[#fef3c7]"><Cpu className="w-5 h-5 shrink-0 text-amber-600 dark:text-[#fbbf24]" />
          <span><b className="font-semibold text-amber-950 dark:text-white">Analytics service is offline</b> — new visits are not being counted right now.</span>
        </div>
      </Card>
    );
    return null;
  };

  const HourlyChart = ({ height = 260 }: { height?: number }) => (
    hasEvents ? (
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={summary.hourly} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="gIn" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--c-primary)" stopOpacity={0.3} /><stop offset="100%" stopColor="var(--c-primary)" stopOpacity={0} /></linearGradient>
            <linearGradient id="gOut" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--c-orange)" stopOpacity={0.25} /><stop offset="100%" stopColor="var(--c-orange)" stopOpacity={0} /></linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--c-grid)" vertical={false} />
          <XAxis dataKey="hour" tick={{ fontSize: 10, fill: "var(--c-tick)" }} interval={2} axisLine={false} tickLine={false} />
          <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "var(--c-tick)" }} axisLine={false} tickLine={false} />
          <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid var(--c-grid)", fontSize: 12 }} />
          <Area type="monotone" dataKey="in" name="IN" stroke="var(--c-primary)" strokeWidth={2} fill="url(#gIn)" />
          <Area type="monotone" dataKey="out" name="OUT" stroke="var(--c-orange)" strokeWidth={2} fill="url(#gOut)" />
        </AreaChart>
      </ResponsiveContainer>
    ) : <Empty icon={BarChart3} title={`No footfall recorded ${period === "7d" ? "in the last 7 days" : period}`} sub="The chart updates automatically as visitors arrive." />
  );

  const EventList = ({ list }: { list: any[] }) => (
    list.length === 0 ? <Empty icon={Clock} title="No activity yet" sub="Visitor entries and exits will appear here in real time." /> : (
      <ul className="divide-y divide-slate-100">
        {list.map((e) => (
          <li key={e.id} role="button" tabIndex={0} onClick={() => setEventModal(e)} onKeyDown={(k) => k.key === "Enter" && setEventModal(e)}
            className="flex items-center gap-3 py-2.5 px-2 -mx-2 rounded-xl cursor-pointer hover:bg-slate-50">
            <span className={`w-8 h-8 rounded-lg flex items-center justify-center ${e.object_type === "person" ? "bg-blue-50 text-blue-600" : e.object_type === "dog" ? "bg-amber-50 text-amber-600" : "bg-violet-50 text-violet-600"}`}>
              {e.object_type === "person" ? <Users className="w-4 h-4" /> : e.object_type === "dog" ? <Dog className="w-4 h-4" /> : <Cat className="w-4 h-4" />}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold text-slate-800 capitalize truncate">{e.object_type} · {e.camera_name}</p>
              <p className="text-[11px] text-slate-500">{timeAgo(e.occurred_at)}{e.object_type === "person" && e.gender_estimate !== "unknown" ? ` · ${e.gender_estimate}` : ""}{e.object_type === "person" && e.age_group_estimate !== "unknown" ? ` · ${e.age_group_estimate}` : ""}</p>
            </div>
            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${e.direction === "IN" ? "bg-emerald-50 text-emerald-700" : "bg-orange-50 text-orange-700"}`}>{e.direction}</span>
          </li>
        ))}
      </ul>
    )
  );

  const EntranceList = () => (
    noCameras ? <Empty icon={Video} title="No cameras" sub="Add entrance cameras to see per-entrance counts." action={<Btn onClick={() => { go("cameras"); openAddCamera(); }}><Plus className="w-3.5 h-3.5" />Add camera</Btn>} /> : (
      <div className="space-y-2.5">
        {summary.byEntrance.map((c: any, i: number) => (
          <div key={c.id} role="button" tabIndex={0} onClick={() => setCamModal(c)} onKeyDown={(k) => k.key === "Enter" && setCamModal(c)}
            className="flex items-center gap-3 p-3 rounded-xl border border-slate-100 hover:border-blue-200 hover:bg-blue-50/30 cursor-pointer transition">
            <span className="w-2 h-9 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold text-slate-800 truncate">{c.name}</p>
              <div className="mt-0.5"><StatusBadge status={c.status} /></div>
            </div>
            <div className="text-right tabular-nums">
              <p className="text-[13px] font-bold text-emerald-600">{fmt(c.in)} <span className="text-[10px] text-slate-400 font-medium">IN</span></p>
              <p className="text-[13px] font-bold text-orange-600">{fmt(c.out)} <span className="text-[10px] text-slate-400 font-medium">OUT</span></p>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-300" />
          </div>
        ))}
      </div>
    )
  );

  const AttireNotice = () => caps?.attire ? null : (
    <div className="flex gap-2 p-3 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-600">
      <Info className="w-4 h-4 shrink-0 text-slate-400" />
      <span>Attire classification is not enabled — visitors are shown as <b>unclassified</b>.</span>
    </div>
  );

  // ------------------------------------------------------------------ views
  const Overview = () => (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <Kpi icon={Users} color="bg-blue-50 text-blue-600" label={`Total visitors · ${periodLabel}`} value={fmt(summary.totalVisitors)} foot={<Growth value={summary.growth.visitors} />}
          onClick={() => setDetail({ title: "Total visitors", sub: periodLabel, go: "trends", rows: [["People IN", fmt(summary.inCount)], ["People OUT", fmt(summary.outCount)], ["Peak hour", summary.peak ? `${summary.peak.hour} (${summary.peak.count})` : "—"], ["Change vs previous", summary.growth.visitors == null ? "No prior data" : `${summary.growth.visitors}%`], ["Period", `${localTime(summary.range.start)} → ${localTime(summary.range.end)}`]] })} />
        <Kpi icon={ArrowDownRight} color="bg-orange-50 text-orange-600" label={`Exits · ${periodLabel}`} value={fmt(summary.outCount)} foot={<Growth value={summary.growth.out} />}
          onClick={() => setDetail({ title: "Exits", sub: periodLabel, go: "entrances", rows: summary.byEntrance.map((c: any) => [c.name, fmt(c.out)]) })} />
        <Kpi icon={Activity} color="bg-emerald-50 text-emerald-600" label="Currently inside" value={fmt(summary.currentlyInside)} foot={<span className="text-[11px] text-slate-400">Since midnight</span>}
          onClick={() => setDetail({ title: "Currently inside", sub: "Since midnight", go: "entrances", rows: [["People", fmt(summary.currentlyInside)], ["Dogs", fmt(summary.petsInside.dogs)], ["Cats", fmt(summary.petsInside.cats)]] })} />
        <Kpi icon={PawPrint} color="bg-amber-50 text-amber-600" label="Pets inside" value={fmt(summary.petsInside.dogs + summary.petsInside.cats)} foot={<span className="text-[11px] text-slate-500">{fmt(summary.petsInside.dogs)} dogs · {fmt(summary.petsInside.cats)} cats</span>}
          onClick={() => go("animals")} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4">
        <Card onClick={() => go("demographics")}>
          <SectionTitle title="Demographics" sub={`Visitors entering · ${periodLabel}`} />
          <div className="grid grid-cols-2 gap-3">
            {[
              { l: "Male", v: d.male, p: d.malePct, c: "text-blue-600" },
              { l: "Female", v: d.female, p: d.femalePct, c: "text-pink-600" },
              { l: "Kids", v: d.children, p: d.childrenPct, c: "text-amber-600" },
              { l: "Unknown", v: d.genderUnknown, p: d.genderUnknownPct, c: "text-slate-500" },
            ].map((x) => (
              <div key={x.l} className="p-3 rounded-xl bg-slate-50">
                <p className="text-[11px] text-slate-500 font-medium">{x.l}</p>
                <p className={`text-xl font-extrabold tabular-nums ${x.c}`}>{fmt(x.v)}</p>
                <p className="text-[10px] text-slate-400">{x.p}%</p>
              </div>
            ))}
          </div>
          {!caps?.demographics && <p className="text-[11px] text-slate-500 mt-3">Gender and age estimation is currently unavailable.</p>}
        </Card>

        <Card onClick={() => go("animals")}>
          <SectionTitle title="Animals" sub={`Pets detected · ${periodLabel}`} />
          {[{ l: "Dogs", I: Dog, c: "bg-amber-50 text-amber-600", i: a.dogIn, o: a.dogOut }, { l: "Cats", I: Cat, c: "bg-violet-50 text-violet-600", i: a.catIn, o: a.catOut }].map((x) => (
            <div key={x.l} className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 mb-2.5">
              <span className={`w-10 h-10 rounded-xl flex items-center justify-center ${x.c}`}><x.I className="w-5 h-5" /></span>
              <p className="flex-1 text-sm font-semibold text-slate-800">{x.l}</p>
              <div className="text-right text-xs tabular-nums"><p><b className="text-emerald-600">{fmt(x.i)}</b> IN</p><p><b className="text-orange-600">{fmt(x.o)}</b> OUT</p></div>
            </div>
          ))}
        </Card>

        <Card onClick={() => go("demographics")}>
          <SectionTitle title="Emirati attire estimate" sub={`Visitors entering · ${periodLabel}`} />
          <div className="grid grid-cols-3 gap-2 mb-3">
            {[{ l: "Traditional", v: att.traditional, c: "text-emerald-700" }, { l: "Casual", v: att.casual, c: "text-blue-700" }, { l: "Unclassified", v: att.unclassified, c: "text-slate-500" }].map((x) => (
              <div key={x.l} className="p-2.5 rounded-xl bg-slate-50 text-center"><p className={`text-lg font-extrabold tabular-nums ${x.c}`}>{fmt(x.v)}</p><p className="text-[10px] text-slate-500">{x.l}</p></div>
            ))}
          </div>
          {AttireNotice()}
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4">
        <Card className="lg:col-span-2" onClick={() => go("trends")}>
          <SectionTitle title="Hourly footfall" sub={`People IN / OUT by hour · ${periodLabel}`} right={summary.peak && <span className="text-[11px] font-semibold px-2 py-1 rounded-lg bg-blue-50 text-blue-700">Peak {summary.peak.hour} · {summary.peak.count}</span>} />
          {HourlyChart({})}
        </Card>
        <Card onClick={() => go("entrances")}>
          <SectionTitle title="Entrances" sub={`${cameras.length} camera${cameras.length === 1 ? "" : "s"}`} />
          {EntranceList()}
        </Card>
      </div>

      <Card className="mt-4" onClick={() => go("reports")}>
        <SectionTitle title="Live activity" sub="Latest entrance activity" right={lastUpdate && <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-400"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />Live</span>} />
        {EventList({ list: events })}
      </Card>
    </>
  );

  const Entrances = () => (
    <>
      <Card onClick={() => go("cameras")}>
        <SectionTitle title="IN vs OUT per entrance" sub={periodLabel} />
        {noCameras || !hasEvents ? <Empty icon={Activity} title={noCameras ? "No cameras added yet" : "No visitors recorded for this period"} /> : (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={summary.byEntrance} margin={{ left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--c-grid)" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: "var(--c-muted)" }} axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "var(--c-tick)" }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} /><Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="in" name="IN" fill="var(--c-success)" radius={[6, 6, 0, 0]} />
              <Bar dataKey="out" name="OUT" fill="var(--c-orange)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Card>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mt-4">
        {summary.byEntrance.map((c: any) => (
          <Card key={c.id} onClick={() => setCamModal(c)}>
            <div className="flex items-start justify-between mb-3"><div><p className="text-sm font-bold text-slate-900">{c.name}</p><p className="text-[11px] text-slate-500">{c.zone || "No zone set"}</p></div><StatusBadge status={c.status} /></div>
            <div className="grid grid-cols-3 gap-2 text-center">
              {[["IN", c.in, "text-emerald-600"], ["OUT", c.out, "text-orange-600"], ["NET", c.net, "text-slate-800"]].map(([l, v, cl]: any) => (
                <div key={l} className="p-2 rounded-xl bg-slate-50"><p className={`text-lg font-extrabold tabular-nums ${cl}`}>{fmt(v)}</p><p className="text-[10px] text-slate-500">{l}</p></div>
              ))}
            </div>
            <p className="text-[11px] text-slate-500 mt-3">{fmt(c.dogsIn)} dogs · {fmt(c.catsIn)} cats entered</p>
          </Card>
        ))}
        {noCameras && <Card onClick={() => { go("cameras"); openAddCamera(); }}><Empty icon={Plus} title="Add your first camera" /></Card>}
      </div>
    </>
  );

  const Demographics = () => {
    const gender = [{ name: "Male", value: d.male, c: "var(--c-primary)" }, { name: "Female", value: d.female, c: "var(--c-pink)" }, { name: "Unknown", value: d.genderUnknown, c: "var(--c-unknown)" }].filter((x) => x.value > 0);
    const ages = [{ name: "Kids", value: d.children }, { name: "Adults", value: d.adults }, { name: "Seniors", value: d.seniors }, { name: "Unknown", value: d.ageUnknown }];
    return (
      <>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card onClick={() => setDetail({ title: "Gender split", sub: periodLabel, rows: [["Male", `${fmt(d.male)} (${d.malePct}%)`], ["Female", `${fmt(d.female)} (${d.femalePct}%)`], ["Unknown", `${fmt(d.genderUnknown)} (${d.genderUnknownPct}%)`]] })}>
            <SectionTitle title="Gender" sub={`People entering · ${periodLabel}`} />
            {gender.length === 0 ? <Empty icon={UsersRound} title="No people recorded for this period" /> : (
              <ResponsiveContainer width="100%" height={240}>
                <PieChart><Pie data={gender} dataKey="value" nameKey="name" innerRadius={60} outerRadius={95} paddingAngle={2}>{gender.map((g) => <Cell key={g.name} fill={g.c} />)}</Pie><Tooltip /><Legend wrapperStyle={{ fontSize: 12 }} /></PieChart>
              </ResponsiveContainer>
            )}
          </Card>
          <Card onClick={() => setDetail({ title: "Age groups", sub: periodLabel, rows: ages.map((x) => [x.name, fmt(x.value)] as [string, string]) })}>
            <SectionTitle title="Age groups" sub="Kids = estimated age under 13" />
            {!hasEvents ? <Empty icon={Baby} title="No people recorded for this period" /> : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={ages} margin={{ left: -20 }}><CartesianGrid strokeDasharray="3 3" stroke="var(--c-grid)" vertical={false} /><XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} /><YAxis allowDecimals={false} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} /><Tooltip /><Bar dataKey="value" name="People" radius={[6, 6, 0, 0]}>{ages.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}</Bar></BarChart>
              </ResponsiveContainer>
            )}
          </Card>
        </div>
        <Card className="mt-4" onClick={() => setDetail({ title: "Emirati attire estimate", sub: periodLabel, rows: [["Traditional attire", `${fmt(att.traditional)} (${att.traditionalPct}%)`], ["Casual attire", `${fmt(att.casual)} (${att.casualPct}%)`], ["Unclassified", `${fmt(att.unclassified)} (${att.unclassifiedPct}%)`]] })}>
          <SectionTitle title="Emirati attire estimate" sub="Traditional (kandura / abaya) vs other attire" />
          <Bar100 parts={[{ v: att.traditional, c: "var(--c-success)" }, { v: att.casual, c: "var(--c-primary)" }, { v: att.unclassified, c: "var(--c-unknown)" }]} />
          <div className="flex flex-wrap gap-4 text-xs text-slate-600 mt-3 mb-4">
            <span>● <b className="text-emerald-700">{fmt(att.traditional)}</b> traditional</span><span>● <b className="text-blue-700">{fmt(att.casual)}</b> casual</span><span>● <b>{fmt(att.unclassified)}</b> unclassified</span>
          </div>
          {AttireNotice()}
        </Card>
      </>
    );
  };

  const Animals = () => (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <Kpi icon={Dog} color="bg-amber-50 text-amber-600" label="Dogs entered" value={fmt(a.dogIn)} foot={<span className="text-[11px] text-slate-500">{fmt(a.dogOut)} left</span>} onClick={() => setDetail({ title: "Dogs", sub: periodLabel, rows: [["Entered", fmt(a.dogIn)], ["Left", fmt(a.dogOut)], ["Inside now (today)", fmt(summary.petsInside.dogs)]] })} />
        <Kpi icon={Cat} color="bg-violet-50 text-violet-600" label="Cats entered" value={fmt(a.catIn)} foot={<span className="text-[11px] text-slate-500">{fmt(a.catOut)} left</span>} onClick={() => setDetail({ title: "Cats", sub: periodLabel, rows: [["Entered", fmt(a.catIn)], ["Left", fmt(a.catOut)], ["Inside now (today)", fmt(summary.petsInside.cats)]] })} />
        <Kpi icon={PawPrint} color="bg-emerald-50 text-emerald-600" label="Dogs inside now" value={fmt(summary.petsInside.dogs)} foot={<span className="text-[11px] text-slate-400">Since midnight</span>} onClick={() => go("entrances")} />
        <Kpi icon={PawPrint} color="bg-pink-50 text-pink-600" label="Cats inside now" value={fmt(summary.petsInside.cats)} foot={<span className="text-[11px] text-slate-400">Since midnight</span>} onClick={() => go("entrances")} />
      </div>
      <Card className="mt-4" onClick={() => go("entrances")}>
        <SectionTitle title="Pets by entrance" sub={periodLabel} />
        {noCameras || a.dogIn + a.catIn === 0 ? <Empty icon={PawPrint} title="No pets recorded for this period" /> : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={summary.byEntrance} margin={{ left: -20 }}><CartesianGrid strokeDasharray="3 3" stroke="var(--c-grid)" vertical={false} /><XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} /><YAxis allowDecimals={false} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} /><Tooltip /><Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="dogsIn" name="Dogs" fill="var(--c-warning)" radius={[6, 6, 0, 0]} /><Bar dataKey="catsIn" name="Cats" fill="var(--c-violet)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Card>
    </>
  );

  const Trends = () => (
    <>
      <Card onClick={() => setDetail({ title: "Footfall summary", sub: periodLabel, rows: [["People IN", fmt(summary.inCount)], ["People OUT", fmt(summary.outCount)], ["Peak hour", summary.peak ? `${summary.peak.hour} (${summary.peak.count})` : "—"], ["Active hours", String(hourlyActive.length)]] })}>
        <SectionTitle title="Hourly footfall" sub={periodLabel} right={summary.peak && <span className="text-[11px] font-semibold px-2 py-1 rounded-lg bg-blue-50 text-blue-700">Peak {summary.peak.hour}</span>} />
        {HourlyChart({ height: 320 })}
      </Card>
      <Card className="mt-4" onClick={() => go("reports")}>
        <SectionTitle title="Hours with activity" />
        {hourlyActive.length === 0 ? <Empty icon={Clock} title="No activity yet" /> : (
          <table className="w-full text-sm"><thead><tr className="text-left text-[11px] text-slate-500 uppercase"><th className="py-2">Hour</th><th>IN</th><th>OUT</th><th>Net</th></tr></thead>
            <tbody className="divide-y divide-slate-100">{hourlyActive.map((h: any) => <tr key={h.h}><td className="py-2 font-semibold">{h.hour}</td><td className="text-emerald-600 font-semibold">{h.in}</td><td className="text-orange-600 font-semibold">{h.out}</td><td>{h.in - h.out}</td></tr>)}</tbody></table>
        )}
      </Card>
    </>
  );

  const Reports = () => (
    <Card>
      <SectionTitle title="Activity log" sub={periodLabel}
        right={<a href={`${API}/reports/export?period=${period}`} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-gradient-to-r from-blue-600 to-indigo-600 text-white"><Download className="w-3.5 h-3.5" />Export report</a>} />
      {reportRows.length === 0 ? <Empty icon={FileText} title="No activity for this period" sub="Visitor activity will appear here and can be exported as a report." /> : (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] whitespace-nowrap">
            <thead><tr className="text-left text-[11px] text-slate-500 uppercase"><th className="py-2 pr-4">Time</th><th className="pr-4">Entrance</th><th className="pr-4">Type</th><th className="pr-4">Direction</th><th className="pr-4">Gender</th><th className="pr-4">Age</th><th>Attire</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {reportRows.map((e) => (
                <tr key={e.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setEventModal(e)}>
                  <td className="py-2 pr-4">{localTime(e.occurred_at)}</td><td className="pr-4">{e.camera_name}</td><td className="pr-4 capitalize">{e.object_type}</td>
                  <td className={`pr-4 font-bold ${e.direction === "IN" ? "text-emerald-600" : "text-orange-600"}`}>{e.direction}</td>
                  <td className="pr-4 capitalize">{e.gender_estimate ?? "—"}</td><td className="pr-4 capitalize">{e.age_group_estimate ?? "—"}</td><td className="capitalize">{e.cultural_attire_estimate?.replace(/_/g, " ") ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );

  const Cameras = () => {
    const slots = [1, 2, 3, 4];
    const visibleSlots = selectedCamSlot === null ? slots : [selectedCamSlot];

    return (
      <>
        {/* Top Channel Controller Bar with Dropdown */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 p-4 rounded-2xl bg-card border border-slate-200 shadow-card">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
              <Video className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-slate-900">4-Channel Camera System</h2>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                  {cameras.length} / 4 Active
                </span>
                <span className="text-[10px] text-slate-500">
                  · {cameras.filter((c) => c.streaming).length} live
                </span>
              </div>
              <p className="text-[11px] text-slate-500">Fixed 4-camera capacity with tree dropdown navigation</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Quick Camera Dropdown Selector */}
            <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200">
              <label htmlFor="cameras-page-dropdown" className="text-xs font-semibold text-slate-600">Camera:</label>
              <select
                id="cameras-page-dropdown"
                value={selectedCamSlot === null ? "all" : String(selectedCamSlot)}
                onChange={(e) => setSelectedCamSlot(e.target.value === "all" ? null : Number(e.target.value))}
                className="bg-transparent text-xs font-bold text-slate-800 focus:outline-none cursor-pointer"
              >
                <option value="all">⊞ All 4 Channels</option>
                <option value="1">Cam 1: {cameras[0]?.name || "Empty Slot"}</option>
                <option value="2">Cam 2: {cameras[1]?.name || "Empty Slot"}</option>
                <option value="3">Cam 3: {cameras[2]?.name || "Empty Slot"}</option>
                <option value="4">Cam 4: {cameras[3]?.name || "Empty Slot"}</option>
              </select>
            </div>

            {selectedCamSlot !== null && (
              <Btn variant="ghost" onClick={() => setSelectedCamSlot(null)}>
                Show all 4
              </Btn>
            )}

            {cameras.length < 4 ? (
              <Btn onClick={openAddCamera}><Plus className="w-3.5 h-3.5" />Add camera</Btn>
            ) : (
              <span className="text-xs text-slate-500 px-3 py-2 rounded-xl bg-slate-100 font-medium">
                Max 4/4 Reached
              </span>
            )}
          </div>
        </div>

        {/* Tree Structure Hierarchy Card */}
        <Card className="mb-5 !p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Entrance Camera Tree Hierarchy (4 Slots Fixed)
            </p>
            <span className="text-[11px] text-slate-400">Click any channel to view or configure</span>
          </div>
          <div className="font-mono text-xs text-slate-700 space-y-1 bg-slate-50 p-3 rounded-xl border border-slate-200">
            <div
              onClick={() => setSelectedCamSlot(null)}
              className={`flex items-center gap-2 font-semibold font-sans px-2 py-1 rounded cursor-pointer transition ${
                selectedCamSlot === null ? "bg-blue-100/70 text-blue-900 font-bold" : "text-slate-800 hover:bg-slate-100"
              }`}
            >
              <span className="text-blue-600">🏢</span>
              <span>Mall Vision Central Unit</span>
              <span className="text-[10px] text-slate-400 font-mono">(4 Fixed Channels)</span>
            </div>
            {slots.map((slot) => {
              const cam = cameras[slot - 1];
              const isSelected = selectedCamSlot === slot;
              return (
                <div
                  key={slot}
                  onClick={() => cam ? setSelectedCamSlot(slot) : openAddCameraForSlot(slot)}
                  className={`flex items-center gap-2 pl-4 py-1.5 rounded-lg cursor-pointer transition ${
                    isSelected ? "bg-blue-100/70 text-blue-900 font-semibold" : "hover:bg-slate-100"
                  }`}
                >
                  <span className="text-slate-400 font-mono">{slot === 4 ? "└──" : "├──"}</span>
                  <span className="font-sans font-bold">Cam {slot}:</span>
                  {cam ? (
                    <>
                      <span className="font-sans text-slate-900">{cam.name}</span>
                      <StatusBadge status={cam.status} />
                      <span className="text-[10px] font-sans text-slate-400 ml-auto">
                        {cam.streaming ? "Counting visitors" : cam.status}
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="font-sans text-slate-400 italic">Empty Slot</span>
                      <span className="text-[10px] font-sans text-blue-600 font-semibold ml-auto flex items-center gap-1 hover:underline">
                        <Plus className="w-3 h-3" /> Connect camera
                      </span>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </Card>

        {/* 4 Fixed Slot Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {visibleSlots.map((slot) => {
            const c = cameras[slot - 1];
            if (!c) {
              return (
                <div
                  key={`slot-${slot}`}
                  onClick={() => openAddCameraForSlot(slot)}
                  className="rounded-2xl border-2 border-dashed border-slate-200 hover:border-blue-400 hover:bg-blue-50/20 p-6 flex flex-col items-center justify-center text-center cursor-pointer transition min-h-[260px] group bg-card/50"
                >
                  <span className="text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full bg-slate-100 text-slate-500 mb-3 group-hover:bg-blue-100 group-hover:text-blue-700">
                    Channel 0{slot} · Available Slot
                  </span>
                  <div className="w-12 h-12 rounded-2xl bg-slate-100 group-hover:bg-blue-100 flex items-center justify-center mb-3 transition">
                    <Plus className="w-6 h-6 text-slate-400 group-hover:text-blue-600" />
                  </div>
                  <p className="text-sm font-bold text-slate-800">Cam {slot} is not configured</p>
                  <p className="text-xs text-slate-500 mt-1 max-w-xs">
                    Click here to assign an RTSP stream to Channel 0{slot}.
                  </p>
                  <div className="mt-4">
                    <Btn onClick={(e: any) => { e.stopPropagation(); openAddCameraForSlot(slot); }}>
                      <Plus className="w-3.5 h-3.5" />Connect Cam {slot}
                    </Btn>
                  </div>
                </div>
              );
            }

            return (
              <Card key={c.id} onClick={() => setCamModal(c)}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded bg-blue-100 text-blue-800">
                        Cam {slot}
                      </span>
                      <p className="text-sm font-bold text-slate-900 truncate">{c.name}</p>
                    </div>
                    <p className="text-[11px] text-slate-500 truncate mt-0.5">{c.zone || "Entrance camera"}</p>
                  </div>
                  <StatusBadge status={c.status} />
                </div>
                <CameraCardFeed cam={c} small />
                <p className="text-[11px] text-slate-500">
                  {c.streaming ? "Counting visitors" : c.status === "error" || c.status === "offline" ? "Camera connection issue" : c.enabled ? "Waiting for video" : "Paused"}
                  {c.last_frame_at ? ` · active ${timeAgo(c.last_frame_at)}` : ""}
                </p>
                <div className="flex flex-wrap gap-2 mt-3">
                  <LiveViewButton cam={c} /> {/* TEMP-LIVE-PREVIEW */}
                  <Btn variant="ghost" onClick={() => testCamera(c)}><Zap className="w-3.5 h-3.5" />Test</Btn>
                  <Btn variant="ghost" onClick={() => openEditCamera(c)}><Pencil className="w-3.5 h-3.5" />Edit</Btn>
                  <Btn variant="ghost" onClick={() => toggleCamera(c)}><Power className="w-3.5 h-3.5" />{c.enabled ? "Disable" : "Enable"}</Btn>
                </div>
              </Card>
            );
          })}
        </div>
      </>
    );
  };

  const Network = () => (
    <>
      {!wifi ? <Card><Empty icon={Wifi} title="Checking Wi-Fi…" /></Card> : !wifi.supported || wifi.error ? <Card><Empty icon={WifiOff} title="Wi-Fi is not available on this device" /></Card> : !wifi.connected ? (
        <Card>
          <div className="flex flex-col sm:flex-row items-center gap-5 py-4">
            <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center"><WifiOff className="w-8 h-8 text-slate-400" /></div>
            <div className="text-center sm:text-left"><p className="text-lg font-bold text-slate-900">Not connected</p><p className="text-sm text-slate-500">Choose a network below to connect.</p></div>
          </div>
        </Card>
      ) : (
        <div className="relative overflow-hidden rounded-2xl p-6 sm:p-8 text-white shadow-card" style={{ background: "linear-gradient(135deg, rgb(var(--blue-600)) 0%, rgb(var(--indigo-600)) 100%)" }}>
          <div className="absolute -right-16 -top-16 w-64 h-64 rounded-full bg-white/10" />
          <div className="absolute right-24 -bottom-24 w-56 h-56 rounded-full bg-white/10" />
          <div className="relative flex flex-col md:flex-row md:items-center gap-6">
            <div className="relative w-20 h-20 shrink-0">
              <span className="absolute inset-0 rounded-full bg-white/25 animate-ping" style={{ animationDuration: "2.4s" }} />
              <span className="relative w-20 h-20 rounded-full bg-white/20 backdrop-blur flex items-center justify-center ring-1 ring-white/40"><Wifi className="w-9 h-9" /></span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs uppercase tracking-[0.2em] text-white/75 font-semibold">Connected to</p>
              <p className="text-3xl font-bold truncate mt-1">{wifi.ssid}</p>
              <div className="flex flex-wrap gap-2 mt-3">
                {wifi.band && <span className="px-2.5 py-1 rounded-full bg-white/20 text-xs font-semibold">{wifi.band}</span>}
                <span className="px-2.5 py-1 rounded-full bg-white/20 text-xs font-semibold inline-flex items-center gap-1"><Lock className="w-3 h-3" />{wifi.security && wifi.security !== "Open" ? "Secured" : "Open"}</span>
                <span className="px-2.5 py-1 rounded-full bg-white/20 text-xs font-semibold inline-flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />Online</span>
              </div>
            </div>
            <div className="flex md:flex-col items-center md:items-end gap-4">
              <div className="flex items-center gap-3"><SignalBars signal={wifi.signal} size={30} light /><div><p className="text-lg font-bold leading-none">{signalLabel(wifi.signal)}</p><p className="text-[11px] text-white/75">Signal</p></div></div>
              <button onClick={() => setDisconnectModalOpen(true)} className="px-4 py-2 rounded-xl bg-white/15 hover:bg-white/25 ring-1 ring-white/40 text-xs font-semibold transition">Disconnect</button>
            </div>
          </div>
        </div>
      )}
      <Card className="mt-4">
        <SectionTitle title="Nearby networks" sub="Select a network to connect" right={<Btn variant="ghost" onClick={scanNetworks} disabled={scanning}><RefreshCw className={`w-3.5 h-3.5 ${scanning ? "animate-spin" : ""}`} />Refresh</Btn>} />
        {!networks ? <Empty icon={Wifi} title="Searching for networks…" /> : networks.networks.length === 0 ? <Empty icon={WifiOff} title="No networks found" /> : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {networks.networks.map((n: any) => (
              <div key={n.ssid} role="button" tabIndex={0}
                onClick={() => n.connected ? null : setWifiModal({ ...n, password: "" })}
                onKeyDown={(k) => k.key === "Enter" && !n.connected && setWifiModal({ ...n, password: "" })}
                className={`group flex items-center gap-4 p-4 rounded-2xl border transition ${n.connected ? "border-emerald-200 bg-emerald-50/60" : "border-slate-200/70 hover:border-blue-300 hover:shadow-card cursor-pointer"}`}>
                <span className={`w-11 h-11 rounded-xl flex items-center justify-center ${n.connected ? "bg-emerald-100 text-emerald-600" : "bg-slate-100 text-slate-500 group-hover:bg-blue-50 group-hover:text-blue-600"}`}><Wifi className="w-5 h-5" /></span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">{n.ssid}</p>
                  <p className="text-[11px] text-slate-500 flex items-center gap-1.5">
                    {n.security !== "Open" ? <><Lock className="w-3 h-3" />Secured</> : "Open"}{n.band ? ` · ${n.band}` : ""}{n.saved && !n.connected ? " · Saved" : ""}
                  </p>
                </div>
                <SignalBars signal={n.signal} />
                {n.connected ? <span className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-700 inline-flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" />Connected</span>
                  : <Btn variant="ghost" onClick={() => setWifiModal({ ...n, password: "" })}>Connect</Btn>}
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );

  const liveCams = cameras.filter((c) => c.streaming).length;
  const SettingsView = () => (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {[
        { I: Cpu, t: "Analytics service", v: engine?.online ? "Running" : "Offline", ok: !!engine?.online, on: () => go("overview") },
        { I: Video, t: "Cameras", v: noCameras ? "None added" : `${liveCams} of ${cameras.length} live`, ok: !noCameras && liveCams === cameras.length, on: () => go("cameras") },
        { I: Wifi, t: "Network", v: wifi?.connected ? wifi.ssid : "Not connected", ok: !!wifi?.connected, on: () => go("network") },
      ].map(({ I, t, v, ok, on }) => (
        <Card key={t} onClick={on}>
          <div className="flex items-center gap-4">
            <span className={`w-12 h-12 rounded-2xl flex items-center justify-center ${ok ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"}`}><I className="w-6 h-6" /></span>
            <div className="min-w-0 flex-1"><p className="text-xs text-slate-500">{t}</p><p className="text-base font-bold text-slate-900 truncate">{v}</p></div>
            <span className={`w-2.5 h-2.5 rounded-full ${ok ? "bg-emerald-500" : "bg-amber-500"}`} />
          </div>
        </Card>
      ))}

      <Card className="lg:col-span-3">
        <SectionTitle title="Appearance" sub="Choose how the dashboard looks" />
        <div className="grid grid-cols-2 gap-4 max-w-lg">
          {[{ id: false, label: "Light", I: Sun, bg: "#f4f3ef", card: "#ffffff", side: "#212120" }, { id: true, label: "Dark", I: Moon, bg: "#181817", card: "#242321", side: "#121211" }].map((m) => (
            <button key={m.label} onClick={() => dark !== m.id && toggleTheme()} className={`rounded-2xl border-2 p-2 text-left transition ${dark === m.id ? "border-blue-500 shadow-card" : "border-slate-200 hover:border-slate-300"}`}>
              <div className="h-20 rounded-xl overflow-hidden flex" style={{ background: m.bg }}>
                <div className="w-1/4" style={{ background: m.side }} />
                <div className="flex-1 p-2 space-y-1.5"><div className="h-3 rounded" style={{ background: m.card }} /><div className="flex gap-1.5"><div className="h-8 flex-1 rounded" style={{ background: m.card }} /><div className="h-8 flex-1 rounded" style={{ background: m.card }} /></div></div>
              </div>
              <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-800 mt-2 px-1"><m.I className="w-4 h-4" />{m.label}{dark === m.id && <CheckCircle2 className="w-4 h-4 text-blue-500 ml-auto" />}</p>
            </button>
          ))}
        </div>
      </Card>
      <AnalyticsResetCard notify={notify} onChanged={load} />
      <Card className="lg:col-span-3">
        <SectionTitle title="Admin account" sub={`Signed in as ${me?.username ?? "—"}`} right={<Btn variant="ghost" onClick={logout}><LogOut className="w-3.5 h-3.5" />Sign out</Btn>} />
        <form onClick={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); changePassword(); }} className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
          <Field label="Current password"><input type="password" required autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} className={inputCls} /></Field>
          <Field label="New password" hint="Min. 10 characters, letters and numbers"><input type="password" required minLength={10} autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} className={inputCls} /></Field>
          <Field label="Confirm new password"><input type="password" required autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} className={inputCls} /></Field>
          <div className="pb-5"><Btn type="submit" disabled={pw.busy || !pw.current || !pw.next || !pw.confirm} className="w-full py-2.5"><KeyRound className="w-3.5 h-3.5" />{pw.busy ? "Saving…" : "Change password"}</Btn></div>
        </form>
      </Card>
    </div>
  );

  // ------------------------------------------------------------------ render
  const view = !summary ? (apiError ? null : <Card><Empty icon={RefreshCw} title="Loading live data…" /></Card>) : ({
    overview: Overview, entrances: Entrances, demographics: Demographics, animals: Animals, trends: Trends,
    reports: Reports, cameras: Cameras, network: Network, settings: SettingsView,
  } as Record<Tab, () => React.ReactNode>)[tab]();

  if (!me) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-page">
        <LogoMark size={64} className={authError ? "" : "animate-pulse"} />
        {authError ? <p className="text-sm text-rose-600 max-w-md text-center px-4">{authError}</p> : <p className="text-sm text-slate-500">Checking session…</p>}
      </div>
    );
  }

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside style={{ backgroundColor: "rgb(var(--sidebar))", color: "#fff" }} className={`fixed lg:sticky top-0 z-40 h-screen w-64 bg-sidebar text-white flex flex-col transition-transform ${menuOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}>
        <div className="flex items-center justify-between px-5 h-20 border-b border-white/15">
          <LogoLandscape height={40} className="drop-shadow-md" light />
          <button className="lg:hidden text-white/70 hover:text-white p-2" onClick={() => setMenuOpen(false)} aria-label="Close menu"><X className="w-4 h-4" /></button>
        </div>
        <nav className="flex-1 overflow-y-auto py-4 space-y-0.5">
          {TABS.map((t) => {
            if (t.id === "cameras") {
              const isSelected = tab === "cameras";
              return (
                <div key="cameras-tree-group" className="py-0.5">
                  <button
                    id="nav-cameras"
                    onClick={() => {
                      setCameraTreeOpen((v) => !v);
                      setSelectedCamSlot(null);
                      go("cameras");
                    }}
                    className={`relative w-full flex items-center gap-3 px-7 py-3 text-[11px] font-semibold uppercase tracking-wider transition ${
                      isSelected && selectedCamSlot === null ? "text-blue-400 font-bold" : "text-white/70 hover:text-white"
                    }`}
                  >
                    <t.icon className="w-[18px] h-[18px]" strokeWidth={1.6} />
                    <span className="flex-1 text-left">Cameras</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-white/80 tabular-nums">
                      {cameras.length}/4
                    </span>
                    {cameraTreeOpen ? (
                      <ChevronDown className="w-3.5 h-3.5 text-white/50" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5 text-white/50" />
                    )}
                    {isSelected && selectedCamSlot === null && (
                      <span className="absolute right-0 top-1/2 -translate-y-1/2 w-0 h-0 border-y-[9px] border-y-transparent border-r-[9px] border-r-[rgb(var(--page))]" />
                    )}
                  </button>

                  {/* Tree Structure Dropdown Branches */}
                  {cameraTreeOpen && (
                    <div className="ml-9 mr-4 my-1 pl-3 border-l border-white/20 space-y-1 text-[11px]">
                      <button
                        onClick={() => {
                          setSelectedCamSlot(null);
                          go("cameras");
                        }}
                        className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md transition text-left ${
                          isSelected && selectedCamSlot === null
                            ? "bg-white/15 text-white font-medium"
                            : "text-white/60 hover:text-white hover:bg-white/5"
                        }`}
                      >
                        <span className="text-white/40">⊞</span>
                        <span className="truncate flex-1">All Channels (4 Max)</span>
                      </button>

                      {[1, 2, 3, 4].map((slot) => {
                        const cam = cameras[slot - 1];
                        const isLive = cam?.streaming;
                        const isSlotSelected = isSelected && selectedCamSlot === slot;
                        return (
                          <button
                            key={slot}
                            onClick={() => {
                              setSelectedCamSlot(slot);
                              go("cameras");
                              if (!cam) {
                                openAddCameraForSlot(slot);
                              }
                            }}
                            className={`relative w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md transition text-left group ${
                              isSlotSelected
                                ? "bg-white/15 text-white font-medium"
                                : "text-white/70 hover:text-white hover:bg-white/5"
                            }`}
                          >
                            <span className="text-white/30 font-mono text-[10px]">
                              {slot === 4 ? "└─" : "├─"}
                            </span>
                            <span
                              className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                !cam
                                  ? "bg-white/20"
                                  : isLive
                                  ? "bg-emerald-400 animate-pulse"
                                  : cam.status === "error" || cam.status === "offline"
                                  ? "bg-rose-400"
                                  : "bg-amber-400"
                              }`}
                            />
                            <span className="truncate flex-1">
                              <span className="font-semibold text-white/90">Cam {slot}</span>
                              {cam ? (
                                <span className="text-white/50 text-[10px] ml-1.5 truncate">
                                  · {cam.name}
                                </span>
                              ) : (
                                <span className="text-white/30 text-[10px] ml-1.5 italic">
                                  (Available)
                                </span>
                              )}
                            </span>
                            {cam ? (
                              isLive ? (
                                <span className="text-[9px] px-1 py-0.2 rounded bg-emerald-500/20 text-emerald-300">
                                  LIVE
                                </span>
                              ) : null
                            ) : (
                              <span className="text-[10px] text-white/30 group-hover:text-blue-300 font-bold">
                                +
                              </span>
                            )}
                            {isSlotSelected && (
                              <span className="absolute right-0 top-1/2 -translate-y-1/2 w-0 h-0 border-y-[6px] border-y-transparent border-r-[6px] border-r-[rgb(var(--page))]" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            }

            return (
              <button key={t.id} id={`nav-${t.id}`} onClick={() => go(t.id)}
                className={`relative w-full flex items-center gap-4 px-7 py-3 text-[11px] font-semibold uppercase tracking-wider transition ${tab === t.id ? "text-blue-500" : "text-white/70 hover:text-white"}`}>
                <t.icon className="w-[18px] h-[18px]" strokeWidth={1.6} />{t.label}
                {tab === t.id && <span className="absolute right-0 top-1/2 -translate-y-1/2 w-0 h-0 border-y-[9px] border-y-transparent border-r-[9px] border-r-[rgb(var(--page))]" />}
              </button>
            );
          })}
        </nav>
        <div className="mx-4 py-4 border-t border-white/15 space-y-1.5">
          <button onClick={() => go("settings")} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 text-[11px] text-white/70 hover:bg-white/10">
            <Cpu className="w-3.5 h-3.5" />{engine?.online ? "System online" : "System offline"}<span className={`ml-auto w-2 h-2 rounded-full ${engine?.online ? "bg-emerald-500" : "bg-rose-500"}`} />
          </button>
          <button onClick={() => go("network")} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 text-[11px] text-white/70 hover:bg-white/10">
            {wifi?.connected ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}<span className="truncate">{wifi?.connected ? wifi.ssid : "No Wi-Fi"}</span>
            {wifi?.connected && <span className="ml-auto"><SignalBars signal={wifi.signal} size={11} light /></span>}
          </button>
        </div>
      </aside>
      {menuOpen && <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setMenuOpen(false)} />}

      {/* Main */}
      <main className="flex-1 min-w-0">
        <header className="sticky top-0 z-20 bg-page/90 backdrop-blur border-b border-slate-200">
          <div className="flex items-center gap-3 px-4 sm:px-6 h-16">
            <button className="lg:hidden p-2 rounded-lg hover:bg-card" onClick={() => setMenuOpen(true)} aria-label="Open menu"><Menu className="w-5 h-5" /></button>
            <div className="min-w-0 flex items-center gap-3">
              <div>
                <h1 className="text-lg font-normal text-slate-700 truncate">{TABS.find((t) => t.id === tab)!.label}</h1>
                <p className="text-[11px] text-slate-400 hidden sm:block">{now ? now.toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : ""}</p>
              </div>
              {tab === "cameras" && (
                <div className="hidden md:flex items-center gap-2 pl-3 border-l border-slate-200">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Camera:</span>
                  <select
                    id="header-camera-select"
                    value={selectedCamSlot === null ? "all" : String(selectedCamSlot)}
                    onChange={(e) => setSelectedCamSlot(e.target.value === "all" ? null : Number(e.target.value))}
                    className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-slate-100 text-slate-800 border border-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
                  >
                    <option value="all">⊞ All 4 Channels</option>
                    <option value="1">Cam 1: {cameras[0]?.name || "Empty Slot"}</option>
                    <option value="2">Cam 2: {cameras[1]?.name || "Empty Slot"}</option>
                    <option value="3">Cam 3: {cameras[2]?.name || "Empty Slot"}</option>
                    <option value="4">Cam 4: {cameras[3]?.name || "Empty Slot"}</option>
                  </select>
                </div>
              )}
            </div>
            <div className="ml-auto flex items-center gap-2">
              <div className="flex bg-slate-100 rounded-lg p-0.5">
                {PERIODS.map((p) => (
                  <button key={p.id} id={`period-${p.id}`} onClick={() => setPeriod(p.id)}
                    className={`px-2.5 sm:px-3 py-1.5 rounded-md text-[11px] sm:text-xs font-semibold transition ${period === p.id ? "bg-card text-blue-600 shadow-card" : "text-slate-500 hover:text-slate-800"}`}>{p.label}</button>
                ))}
              </div>
              <button id="refresh" onClick={() => { load(); loadWifi(); }} className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800" title="Refresh now"><RefreshCw className="w-[18px] h-[18px]" /></button>
              <button id="theme-toggle" onClick={toggleTheme} className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800" title={dark ? "Switch to light mode" : "Switch to dark mode"} aria-label="Toggle theme">
                {dark ? <Sun className="w-[18px] h-[18px]" /> : <Moon className="w-[18px] h-[18px]" />}
              </button>
              <div className="hidden sm:flex items-center gap-2 pl-2 ml-1 border-l border-slate-200">
                <button onClick={() => go("settings")} className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-slate-100" title="Account settings">
                  <span className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-indigo-600 text-white text-xs font-bold flex items-center justify-center uppercase">{me.username.slice(0, 2)}</span>
                  <span className="text-left leading-tight"><span className="block text-xs font-semibold text-slate-800">{me.username}</span><span className="block text-[10px] text-slate-400">Administrator</span></span>
                </button>
                <button id="logout" onClick={logout} className="p-2 rounded-lg text-slate-500 hover:bg-rose-50 hover:text-rose-600" title="Sign out" aria-label="Sign out"><LogOut className="w-[18px] h-[18px]" /></button>
              </div>
            </div>
          </div>
        </header>

        <div className="p-4 sm:p-6 max-w-[1500px] mx-auto">
          {AlertBanner()}
          {view}
        </div>
      </main>

      {/* Generic detail modal */}
      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail?.title || ""} sub={detail?.sub}>
        {detail && <>
          {detail.rows.length ? <Rows rows={detail.rows} /> : <Empty title="Nothing to show yet" />}
          {detail.go && <div className="mt-4 flex justify-end"><Btn onClick={() => go(detail.go!)}>Open {TABS.find((t) => t.id === detail.go)!.label}<ChevronRight className="w-3.5 h-3.5" /></Btn></div>}
        </>}
      </Modal>

      {/* Camera detail */}
      <Modal open={!!camModal} onClose={() => setCamModal(null)} title={camModal?.name || ""} sub={camModal?.zone || "Entrance camera"}>
        {camModal && <>
          <CameraCardFeed cam={camModal} />
          <Rows rows={[
            ["Status", <StatusBadge key="s" status={camModal.status} />],
            ["Location", camModal.zone || "—"],
            ["Entry direction", camModal.in_direction === "top_to_bottom" ? "Top → bottom" : "Bottom → top"],
            ["Last activity", timeAgo(camModal.last_frame_at)],
            ...(camModal.in !== undefined ? [["In / Out (" + periodLabel + ")", `${fmt(camModal.in)} / ${fmt(camModal.out)}`] as [string, string]] : []),
          ]} />
          <div className="flex flex-wrap gap-2 mt-4">
            <LiveViewButton cam={camModal} /> {/* TEMP-LIVE-PREVIEW */}
            <Btn variant="ghost" onClick={() => testCamera(camModal)}><Zap className="w-3.5 h-3.5" />Test connection</Btn>
            <Btn variant="ghost" onClick={() => openEditCamera(cameras.find((c) => c.id === camModal.id) || camModal)}><Pencil className="w-3.5 h-3.5" />Edit</Btn>
            <Btn variant="ghost" onClick={() => toggleCamera(camModal)}><Power className="w-3.5 h-3.5" />{camModal.enabled ? "Disable" : "Enable"}</Btn>
            <Btn variant="danger" onClick={() => deleteCamera(camModal)}><Trash2 className="w-3.5 h-3.5" />Delete</Btn>
          </div>
        </>}
      </Modal>

      {/* Add / edit camera */}
      <Modal open={!!camForm} onClose={() => setCamForm(null)} title={camForm?.id ? "Edit camera" : "Add camera"} sub="Set the camera details and draw the counting line across the entrance" wide>
        {camForm && (
          <form onSubmit={(e) => { e.preventDefault(); saveCamera(); }} className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-3">
              <Field label="Name *"><input required value={camForm.name} onChange={(e) => setCamForm({ ...camForm, name: e.target.value })} className={inputCls} placeholder="e.g. Entrance 1" /></Field>
              <Field label="Location"><input value={camForm.zone || ""} onChange={(e) => setCamForm({ ...camForm, zone: e.target.value })} className={inputCls} placeholder="e.g. Ground floor, main gate" /></Field>
              <Field label="Camera stream address *" hint="Provided by your CCTV installer">
                <input required value={camForm.source_url} onChange={(e) => setCamForm({ ...camForm, source_url: e.target.value })} className={inputCls} placeholder="rtsp://…" />
              </Field>
              <Field label="Entry direction">
                <select value={camForm.in_direction} onChange={(e) => setCamForm({ ...camForm, in_direction: e.target.value })} className={inputCls}>
                  <option value="top_to_bottom">Top → bottom</option><option value="bottom_to_top">Bottom → top</option>
                </select>
              </Field>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-xs font-semibold text-slate-700 dark:text-white/80">Interactive counting line</p>
                <span className="text-[11px] text-blue-600 dark:text-blue-400 font-medium">Mouse se line drag karein</span>
              </div>
              <InteractiveLineEditor
                cam={camForm}
                onChange={(coords) => setCamForm((prev: any) => ({ ...prev, ...coords }))}
              />
              <div className="mt-3 space-y-1.5 p-3 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10">
                <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider mb-1">Fine-tune coordinates</span>
                {(["line_x1", "line_y1", "line_x2", "line_y2"] as const).map((k) => (
                  <label key={k} className="flex items-center gap-3 text-[11px] text-slate-600 dark:text-white/70">
                    <span className="w-16">{{ line_x1: "Start X", line_y1: "Start Y", line_x2: "End X", line_y2: "End Y" }[k]}</span>
                    <input type="range" min={0} max={1} step={0.01} value={camForm[k]} onChange={(e) => setCamForm({ ...camForm, [k]: +e.target.value })} className="flex-1 accent-blue-600" />
                    <span className="w-10 text-right tabular-nums font-mono">{Number(camForm[k]).toFixed(2)}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="md:col-span-2 flex justify-end gap-2 pt-2 border-t border-slate-100">
              <Btn variant="ghost" onClick={() => setCamForm(null)}>Cancel</Btn>
              <Btn type="submit">{camForm.id ? "Save changes" : <><Plus className="w-3.5 h-3.5" />Add camera</>}</Btn>
            </div>
          </form>
        )}
      </Modal>

      {/* Event detail */}
      <Modal open={!!eventModal} onClose={() => setEventModal(null)} title={eventModal ? `${eventModal.object_type} ${eventModal.direction}` : ""} sub={eventModal?.camera_name}>
        {eventModal && <Rows rows={[
          ["Time", localTime(eventModal.occurred_at)], ["Entrance", eventModal.camera_name],
          ["Type", <span key="t" className="capitalize">{eventModal.object_type}</span>], ["Direction", eventModal.direction],
          ...(eventModal.object_type === "person" ? [
            ["Gender", <span key="g" className="capitalize">{eventModal.gender_estimate ?? "—"}</span>],
            ["Age group", <span key="a" className="capitalize">{eventModal.age_group_estimate ?? "—"}</span>],
            ["Attire", <span key="c" className="capitalize">{eventModal.cultural_attire_estimate?.replace(/_/g, " ") ?? "—"}</span>],
          ] as [string, React.ReactNode][] : []),
        ]} />}
      </Modal>

      {/* Wi-Fi connect */}
      <Modal open={!!wifiModal} onClose={() => !wifiModal?.busy && setWifiModal(null)} title={`Connect to ${wifiModal?.ssid ?? ""}`} sub={wifiModal ? `${wifiModal.security !== "Open" ? "Secured" : "Open"} network · ${signalLabel(wifiModal.signal)} signal` : ""}>
        {wifiModal && (
          <form onSubmit={(e) => { e.preventDefault(); connectWifi(wifiModal.ssid, wifiModal.password); }} className="space-y-4">
            {wifiModal.saved ? <p className="text-sm text-slate-600">This network is saved — no password needed.</p>
              : wifiModal.security === "Open" ? <p className="text-sm text-slate-600">Open network — no password needed.</p>
              : <Field label="Password"><input type="password" autoFocus required minLength={8} value={wifiModal.password} onChange={(e) => setWifiModal({ ...wifiModal, password: e.target.value })} className={inputCls} /></Field>}
            <div className="flex justify-end gap-2">
              <Btn variant="ghost" disabled={wifiModal.busy} onClick={() => setWifiModal(null)}>Cancel</Btn>
              <Btn type="submit" disabled={wifiModal.busy}>{wifiModal.busy ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" />Connecting…</> : "Connect"}</Btn>
            </div>
          </form>
        )}
      </Modal>

      {/* Wi-Fi disconnect confirmation modal */}
      <Modal open={disconnectModalOpen} onClose={() => !disconnecting && setDisconnectModalOpen(false)} title={`Disconnect from ${wifi?.ssid || "Wi-Fi"}?`} sub="Disconnect active wireless connection">
        <div className="space-y-4">
          <p className="text-sm text-slate-700 dark:text-white/85">
            Are you sure you want to disconnect from <b className="font-semibold text-slate-900 dark:text-white">{wifi?.ssid}</b>?
          </p>
          <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-700/50 text-amber-900 dark:text-[#fef3c7] text-xs flex items-start gap-2.5">
            <Info className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-[#fbbf24]" />
            <span className="leading-relaxed">
              <b className="font-semibold text-amber-950 dark:text-[#fde68a]">Note:</b> If &quot;Connect automatically&quot; is enabled for this network in Windows, Windows may automatically reconnect within a few seconds.
            </span>
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-white/10">
            <Btn variant="ghost" disabled={disconnecting} onClick={() => setDisconnectModalOpen(false)}>Cancel</Btn>
            <Btn variant="danger" disabled={disconnecting} onClick={confirmDisconnectAction}>
              {disconnecting ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" />Disconnecting…</> : "Disconnect"}
            </Btn>
          </div>
        </div>
      </Modal>

      {toast && (
        <div className={`fixed bottom-5 right-5 z-[60] max-w-sm flex items-start gap-2 px-4 py-3 rounded-xl shadow-xl text-sm font-medium ${toast.ok ? "bg-[#252422] text-white ring-1 ring-white/10" : "bg-rose-600 text-white"}`}>
          {toast.ok ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" /> : <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />}{toast.msg}
        </div>
      )}
    </div>
  );
}

const inputCls = "w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400 bg-card";

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-slate-600">{label}</span>
      <div className="mt-1">{children}</div>
      {hint && <span className="text-[10px] text-slate-400 mt-1 block">{hint}</span>}
    </label>
  );
}

/** Settings card: daily automatic reset, manual reset and clearing history. Past days are kept unless cleared. */
function AnalyticsResetCard({ notify, onChanged }: { notify: (m: string, ok?: boolean) => void; onChanged: () => void }) {
  const [cfg, setCfg] = useState<any>(null);
  const [time, setTime] = useState("00:00");
  const [auto, setAuto] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [clear, setClear] = useState<{ password: string } | null>(null);

  const apply = (c: any) => { setCfg(c); setTime(c.resetTime); setAuto(c.autoReset); };
  useEffect(() => { req("GET", "/settings/reset").then(apply).catch(() => {}); }, []);

  const fmtTime = (hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); const d = new Date(); d.setHours(h, m, 0, 0); return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }); };
  const fmtWhen = (iso?: string | null) => {
    if (!iso) return "—";
    const d = new Date(iso), now = new Date();
    const day = d.toDateString() === now.toDateString() ? "Today" : d.toDateString() === new Date(now.getTime() + 864e5).toDateString() ? "Tomorrow" : d.toDateString() === new Date(now.getTime() - 864e5).toDateString() ? "Yesterday" : d.toLocaleDateString([], { day: "numeric", month: "short" });
    return `${day}, ${d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
  };
  const dirty = !!cfg && (time !== cfg.resetTime || auto !== cfg.autoReset);

  const run = async (fn: () => Promise<any>, msg: string) => {
    setBusy(true);
    try { apply(await fn()); notify(msg); onChanged(); return true; }
    catch (e: any) { notify(e.message, false); return false; }
    finally { setBusy(false); }
  };
  const save = () => run(() => req("PUT", "/settings/reset", { autoReset: auto, resetTime: time }), auto ? `Analytics will reset every day at ${fmtTime(time)}` : "Automatic reset turned off");
  const resetNow = async () => { if (await run(() => req("POST", "/analytics/reset"), "Analytics reset — a new day has started")) setConfirmReset(false); };
  const clearAll = async () => { if (await run(() => req("POST", "/analytics/clear", { password: clear?.password }), "All analytics history cleared")) setClear(null); };

  return (
    <Card className="lg:col-span-3">
      <SectionTitle title="Daily analytics reset" sub="Start every day with fresh numbers. Previous days are kept in Yesterday, Last 7 days and Reports." />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Automatic */}
        <div className="rounded-2xl border border-slate-200 p-5 bg-gradient-to-br from-blue-50/60 to-transparent">
          <div className="flex items-start gap-3">
            <span className="w-11 h-11 rounded-xl bg-blue-500 text-white flex items-center justify-center shrink-0 shadow-md shadow-blue-500/25"><CalendarClock className="w-5 h-5" /></span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-slate-900">Automatic reset</p>
              <p className="text-xs text-slate-500">Counts restart every day at the time you choose — for example after the mall closes.</p>
            </div>
            <button type="button" role="switch" aria-checked={auto} onClick={() => setAuto(!auto)}
              className={`relative w-11 h-6 rounded-full transition shrink-0 ${auto ? "bg-blue-500" : "bg-slate-300"}`}>
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${auto ? "translate-x-5" : ""}`} />
            </button>
          </div>
          <div className={`mt-5 flex flex-wrap items-end gap-3 ${auto ? "" : "opacity-50 pointer-events-none"}`}>
            <label className="block">
              <span className="text-xs font-semibold text-slate-600">Reset time</span>
              <input id="reset-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} className={`${inputCls} mt-1 w-40 text-base font-semibold`} />
            </label>
            <div className="flex gap-1.5 pb-0.5">
              {["00:00", "01:00", "06:00"].map((t) => (
                <button key={t} type="button" onClick={() => setTime(t)} className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border transition ${time === t ? "bg-blue-500 text-white border-blue-500" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>{fmtTime(t)}</button>
              ))}
            </div>
          </div>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-slate-500 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              {cfg?.autoReset ? <>Next reset: <b className="text-slate-800">{fmtWhen(cfg.nextResetAt)}</b></> : "Automatic reset is off"}
            </p>
            <Btn onClick={save} disabled={!dirty || busy}><CheckCircle2 className="w-3.5 h-3.5" />Save schedule</Btn>
          </div>
        </div>

        {/* Manual */}
        <div className="rounded-2xl border border-slate-200 p-5 flex flex-col">
          <div className="flex items-start gap-3">
            <span className="w-11 h-11 rounded-xl bg-blue-500 text-white flex items-center justify-center shrink-0 shadow-md shadow-blue-500/25"><RotateCcw className="w-5 h-5" /></span>
            <div className="flex-1">
              <p className="text-sm font-bold text-slate-900">Reset now</p>
              <p className="text-xs text-slate-500">Start a fresh count right away. Today&apos;s numbers go back to zero.</p>
            </div>
          </div>
          <div className="mt-5 flex items-center gap-3 p-3 rounded-xl bg-slate-50">
            <Sunrise className="w-4 h-4 text-blue-500 shrink-0" />
            <p className="text-xs text-slate-600">Current day started: <b className="text-slate-800">{cfg?.currentDayStart ? fmtWhen(cfg.currentDayStart) : "Not reset yet"}</b></p>
          </div>
          <div className="mt-auto pt-5 flex flex-wrap items-center justify-between gap-3">
            <button type="button" onClick={() => setClear({ password: "" })} className="text-[11px] font-semibold text-rose-600 hover:underline flex items-center gap-1"><Trash2 className="w-3.5 h-3.5" />Clear all history</button>
            <Btn onClick={() => setConfirmReset(true)} disabled={busy}><RotateCcw className="w-3.5 h-3.5" />Reset analytics now</Btn>
          </div>
        </div>
      </div>

      <Modal open={confirmReset} onClose={() => !busy && setConfirmReset(false)} title="Reset analytics now?" sub="Today's counts will start again from zero.">
        <p className="text-sm text-slate-600">Earlier numbers are not deleted — you can still see them in Reports and Last 7 days.</p>
        <div className="flex justify-end gap-2 mt-5">
          <Btn variant="ghost" onClick={() => setConfirmReset(false)} disabled={busy}>Cancel</Btn>
          <Btn onClick={resetNow} disabled={busy}><RotateCcw className="w-3.5 h-3.5" />{busy ? "Resetting…" : "Yes, reset"}</Btn>
        </div>
      </Modal>

      <Modal open={!!clear} onClose={() => !busy && setClear(null)} title="Clear all history?" sub="This permanently deletes every recorded visit.">
        <form onSubmit={(e) => { e.preventDefault(); clearAll(); }} className="space-y-4">
          <div className="flex gap-2 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs"><AlertCircle className="w-4 h-4 shrink-0" />All analytics, reports and history will be removed and cannot be recovered. Cameras and settings are kept.</div>
          <Field label="Enter your password to confirm"><input type="password" autoFocus autoComplete="current-password" value={clear?.password ?? ""} onChange={(e) => setClear({ password: e.target.value })} className={inputCls} /></Field>
          <div className="flex justify-end gap-2">
            <Btn variant="ghost" onClick={() => setClear(null)} disabled={busy}>Cancel</Btn>
            <Btn type="submit" variant="danger" disabled={busy || !clear?.password}><Trash2 className="w-3.5 h-3.5" />{busy ? "Clearing…" : "Delete everything"}</Btn>
          </div>
        </form>
      </Modal>
    </Card>
  );
}

/** Schematic of the camera frame with the virtual line — no video is shown. */
function LinePreview({ cam, small }: { cam: any; small?: boolean }) {
  const x1 = +cam.line_x1 * 160, y1 = +cam.line_y1 * 90, x2 = +cam.line_x2 * 160, y2 = +cam.line_y2 * 90;
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
  const down = cam.in_direction === "top_to_bottom";
  return (
    <svg viewBox="0 0 160 90" className={`w-full ${small ? "h-20 my-3" : "h-auto mb-3"} rounded-xl bg-gradient-to-br from-slate-100 to-slate-50 border border-slate-200`}>
      <defs><pattern id="grid" width="16" height="9" patternUnits="userSpaceOnUse"><path d="M16 0H0V9" fill="none" stroke="var(--c-grid)" strokeWidth="0.4" /></pattern></defs>
      <rect width="160" height="90" fill="url(#grid)" />
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--c-primary)" strokeWidth="2" strokeLinecap="round" />
      <circle cx={x1} cy={y1} r="2.5" fill="var(--c-primary)" /><circle cx={x2} cy={y2} r="2.5" fill="var(--c-primary)" />
      <g fontSize="6" fontWeight="700">
        <text x={mx + 4} y={Math.max(7, my - 6)} fill={down ? "var(--c-success)" : "var(--c-orange)"}>{down ? "↓ IN" : "↑ OUT"}</text>
        <text x={mx + 4} y={Math.min(87, my + 11)} fill={down ? "var(--c-orange)" : "var(--c-success)"}>{down ? "↑ OUT" : "↓ IN"}</text>
      </g>
    </svg>
  );
}

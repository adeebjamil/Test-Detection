"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Lock, User, ShieldCheck, Sun, Moon, AlertCircle, Loader2, Users, UserRound, PawPrint, BarChart3, WifiOff, RefreshCw, Sparkles, ArrowRight, Video, Cpu, CheckCircle2, Activity } from "lucide-react";
import { LogoLandscape, LogoMark } from "../../components/Logo";

const API = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:4000/api";

async function call(method: string, path: string, body?: any) {
  const r = await fetch(`${API}${path}`, {
    method,
    credentials: "include",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => null);
  if (!r.ok) throw new Error(data?.error || (r.status >= 500 ? "Something went wrong. Please try again." : "Request could not be completed."));
  return data;
}

function strength(pw: string) {
  let s = 0;
  if (pw.length >= 10) s++;
  if (pw.length >= 14) s++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^a-zA-Z0-9]/.test(pw)) s++;
  return Math.min(4, s);
}
const STRENGTH = [
  { label: "Too weak", c: "bg-rose-500" }, { label: "Weak", c: "bg-orange-500" }, { label: "Fair", c: "bg-amber-500" },
  { label: "Good", c: "bg-emerald-500" }, { label: "Strong", c: "bg-emerald-600" },
];

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"loading" | "setup" | "login" | "offline">("loading");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [remember, setRemember] = useState(false);
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
    call("GET", "/auth/status")
      .then((s) => (s.authenticated ? router.replace("/") : setMode(s.setupRequired ? "setup" : "login")))
      .catch(() => setMode("offline"));
  }, [router]);

  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try { localStorage.setItem("mv-theme", next ? "dark" : "light"); } catch { /* ignore */ }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (mode === "setup" && password !== confirm) return setError("Passwords do not match");
    setBusy(true);
    try {
      if (mode === "setup") await call("POST", "/auth/setup", { username: username.trim(), password });
      else await call("POST", "/auth/login", { username: username.trim(), password, remember });
      router.replace("/");
    } catch (err: any) {
      setError(err instanceof TypeError ? "Unable to connect. Please try again." : err.message);
      setBusy(false);
    }
  };

  const st = strength(password);
  const inputCls = "peer w-full pl-11 pr-3 py-3.5 rounded-xl border border-slate-200 dark:border-white/15 bg-page/60 dark:bg-black/30 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-white/40 focus:outline-none focus:bg-card focus:border-blue-400 focus:ring-4 focus:ring-blue-500/15 transition-all";
  const iconCls = "w-4 h-4 text-slate-400 dark:text-white/60 absolute left-4 top-1/2 -translate-y-1/2 peer-focus:text-blue-500 transition-colors pointer-events-none";


  return (
    <main className="min-h-screen grid lg:grid-cols-[1.15fr_1fr] bg-page">
      {/* Brand panel (Left Side) — Minimalist, Clean & Classy with Unified Theme Color */}
      <section
        className={`hidden lg:flex relative overflow-hidden flex-col justify-between p-12 xl:p-16 text-white transition-colors ${
          dark ? "" : "border-r border-white/10"
        }`}
        style={{ backgroundColor: dark ? "transparent" : "rgb(var(--sidebar))" }}
      >

        {/* --- Top Header: Landscape Logo + Static Badge --- */}
        <div className="relative z-10 flex items-center justify-between">
          <LogoLandscape height={40} light className="drop-shadow-sm" />
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.08] border border-white/20 text-xs text-white">
            <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" />
            <span className="font-semibold text-white/95">On-Premise LAN</span>
          </div>
        </div>

        {/* --- Middle: Clean Headline & Minimal Key Points --- */}
        <div className="relative z-10 my-auto py-6 max-w-md space-y-8">
          <div>
            <span className="inline-block text-[11px] font-bold uppercase tracking-[0.2em] text-cyan-400 mb-3">
              Enterprise CCTV Analytics
            </span>
            <h1 className="text-3xl xl:text-4xl font-extrabold tracking-tight text-white leading-[1.25]">
              Smarter insights for <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 via-sky-300 to-white">
                every entrance.
              </span>
            </h1>
            <p className="text-white/90 text-sm mt-3 leading-relaxed font-normal">
              Local computer vision intelligence for visitor traffic, demographic profiling, and shopper flow.
            </p>
          </div>

          {/* Simple, Crisp Bullet Points with High Contrast */}
          <div className="space-y-3.5 text-sm font-medium">
            <div className="flex items-center gap-3">
              <span className="w-2 h-2 rounded-full bg-cyan-400 shrink-0 shadow-[0_0_8px_#38bdf8]" />
              <span className="text-white/95">Real-time visitor footfall & demographic counting</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="w-2 h-2 rounded-full bg-sky-400 shrink-0 shadow-[0_0_8px_#38bdf8]" />
              <span className="text-white/95">Cultural attire & gender classification</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0 shadow-[0_0_8px_#34d399]" />
              <span className="text-white/95">100% offline edge processing (zero cloud dependency)</span>
            </div>
          </div>

          {/* 3 Clean Compact Micro Stats */}
          <div className="flex items-center gap-8 pt-4 border-t border-white/15">
            <div>
              <p className="text-white font-extrabold text-xl font-mono">4</p>
              <p className="text-xs text-white/85 font-medium mt-0.5">Max Cameras</p>
            </div>
            <div className="h-7 w-[1px] bg-white/15" />
            <div>
              <p className="text-white font-extrabold text-xl font-mono">4K UHD</p>
              <p className="text-xs text-white/85 font-medium mt-0.5">30 FPS Stream</p>
            </div>
            <div className="h-7 w-[1px] bg-white/15" />
            <div>
              <p className="text-emerald-400 font-extrabold text-xl font-mono">&lt; 15ms</p>
              <p className="text-xs text-white/85 font-medium mt-0.5">Edge Latency</p>
            </div>
          </div>
        </div>

        {/* --- Footer --- */}
        <div className="relative z-10 flex items-center justify-between text-xs text-white/80 font-medium border-t border-white/15 pt-4">
          <span>Private by Design</span>
          <span>© {new Date().getFullYear()} MallVision AI</span>
        </div>
      </section>

      {/* Form panel */}
      <section className="relative flex items-center justify-center p-6 sm:p-10 overflow-hidden">
        <button onClick={toggleTheme} className="absolute top-5 right-5 z-10 p-2.5 rounded-xl bg-card border border-slate-200/70 dark:border-white/15 shadow-card text-slate-500 dark:text-white/80 hover:text-slate-800 dark:hover:text-white hover:scale-105 transition" aria-label="Toggle theme" title={dark ? "Light mode" : "Dark mode"}>
          {dark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-600" />}
        </button>

        <div className="relative w-full max-w-[440px] mv-fade-up">
          <div className="lg:hidden mb-8 flex justify-center"><LogoLandscape height={42} light={dark} /></div>

          <div className="relative bg-card/90 dark:bg-card/95 backdrop-blur-xl rounded-3xl border border-slate-200/70 dark:border-white/15 shadow-[0_30px_60px_-20px_rgb(0_0_0/0.25)] p-8 sm:p-10 overflow-hidden">
            <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-blue-400 via-emerald-400 to-amber-400" />

            {mode === "loading" && <div className="flex justify-center py-20"><Loader2 className="w-7 h-7 animate-spin text-blue-500" /></div>}

            {mode === "offline" && (
              <div className="text-center py-8">
                <div className="w-16 h-16 rounded-2xl bg-rose-50 dark:bg-rose-950/30 flex items-center justify-center mx-auto mb-4"><WifiOff className="w-7 h-7 text-rose-500" /></div>
                <h1 className="text-xl font-bold text-slate-900 dark:text-white">We can't connect right now</h1>
                <p className="text-sm text-slate-500 dark:text-white/70 mt-2 leading-relaxed">Please make sure the MallVision system is switched on, then try again.</p>
                <button onClick={() => location.reload()} className="mv-shine mt-6 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-500 to-blue-600 text-white text-sm font-semibold shadow-lg shadow-blue-500/25 hover:-translate-y-0.5 transition"><RefreshCw className="w-4 h-4" />Try again</button>
              </div>
            )}

            {(mode === "login" || mode === "setup") && (
              <form onSubmit={submit} className="space-y-5" noValidate>
                <div className="text-center mb-2">
                  <div className="relative w-16 h-16 mx-auto mb-5">
                    <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-blue-400 to-blue-600 rotate-6 opacity-30" />
                    <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/30">
                      {mode === "setup" ? <Sparkles className="w-7 h-7 text-white" /> : <Lock className="w-7 h-7 text-white" />}
                    </div>
                  </div>
                  <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">{mode === "setup" ? "Let's get you set up" : "Welcome back"}</h1>
                  <p className="text-sm text-slate-500 dark:text-white/70 mt-1.5">{mode === "setup" ? "Create your admin account to get started." : "Sign in to your analytics dashboard"}</p>
                </div>

                {error && <div role="alert" className="flex items-start gap-2 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-sm"><AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />{error}</div>}

                <div>
                  <label htmlFor="username" className="text-xs font-semibold text-slate-700 dark:text-white/90">Username</label>
                  <div className="relative mt-1.5">
                    <input id="username" autoFocus required autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} className={inputCls} placeholder="Enter your username" />
                    <User className={iconCls} />
                  </div>
                </div>

                <div>
                  <label htmlFor="password" className="text-xs font-semibold text-slate-700 dark:text-white/90">Password</label>
                  <div className="relative mt-1.5">
                    <input id="password" type={show ? "text" : "password"} required autoComplete={mode === "setup" ? "new-password" : "current-password"} value={password} onChange={(e) => setPassword(e.target.value)} className={`${inputCls} pr-11`} placeholder="Enter your password" />
                    <Lock className={iconCls} />
                    <button type="button" onClick={() => setShow(!show)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:text-white/60 dark:hover:text-white transition-colors" aria-label={show ? "Hide password" : "Show password"}>
                      {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {mode === "setup" && password && (
                    <div className="mt-2">
                      <div className="flex gap-1">{[0, 1, 2, 3].map((i) => <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${i < st ? STRENGTH[st].c : "bg-slate-200 dark:bg-white/10"}`} />)}</div>
                      <p className="text-[11px] text-slate-500 dark:text-white/60 mt-1">{STRENGTH[st].label} — use letters and numbers</p>
                    </div>
                  )}
                </div>

                {mode === "setup" && (
                  <div>
                    <label htmlFor="confirm" className="text-xs font-semibold text-slate-700 dark:text-white/90">Confirm password</label>
                    <div className="relative mt-1.5">
                      <input id="confirm" type={show ? "text" : "password"} required autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={inputCls} placeholder="Repeat your password" />
                      <Lock className={iconCls} />
                    </div>
                  </div>
                )}

                {mode === "login" && (
                  <label className="flex items-center gap-2.5 text-sm text-slate-700 dark:text-white/90 select-none cursor-pointer">
                    <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="w-4 h-4 rounded accent-blue-600" />
                    Keep me signed in
                  </label>
                )}

                <button id="submit" type="submit" disabled={busy || !username || !password || (mode === "setup" && !confirm)}
                  className="mv-shine group w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-gradient-to-r from-blue-500 to-blue-600 text-white text-sm font-semibold shadow-lg shadow-blue-500/30 hover:shadow-xl hover:shadow-blue-500/40 hover:-translate-y-0.5 active:translate-y-0 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0">
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  {mode === "setup" ? "Create account" : "Sign in"}
                  {!busy && <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />}
                </button>

                <p className="flex items-center justify-center gap-1.5 text-[11px] text-slate-500 dark:text-white/60 pt-1">
                  <ShieldCheck className="w-3.5 h-3.5" />Secure, private access
                </p>
              </form>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

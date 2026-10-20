import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import { execFileSync } from "node:child_process";
import { db } from "./db.js";
import {
  hashPassword, verifyPassword, validateNewPassword, validateUsername, DUMMY_HASH,
  createSession, destroySession, sessionUser, readCookie, setSessionCookie, clearSessionCookie,
  loginLocked, recordFailure, clearFailures, isEngine,
} from "./auth.js";

dotenv.config();
const app = express();
app.disable("x-powered-by");

// Only the local dashboard may call the API from a browser (cookies are sent cross-port on localhost)
const ALLOWED_ORIGINS = new Set((process.env.DASHBOARD_ORIGINS || "http://localhost:3000,http://127.0.0.1:3000").split(",").map((s) => s.trim()).filter(Boolean));
app.use(cors({ origin: (o, cb) => cb(null, !o || ALLOWED_ORIGINS.has(o)), credentials: true }));
app.use(express.json({ limit: "256kb" }));
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "no-store");
  next();
});

const nowIso = () => new Date().toISOString();
const STREAM_STALE_MS = 30_000;
const ENGINE_STALE_MS = 15_000;

// ---------------------------------------------------------------- real-time push (Server-Sent Events)
// The dashboard keeps one /api/live connection open; we push a tiny message whenever data changes,
// so counts appear instantly instead of waiting for the next poll.
const liveClients = new Set();
let pushTimer = null, pushTopics = new Set();
function broadcast(topic) {
  pushTopics.add(topic);
  if (pushTimer) return;
  pushTimer = setTimeout(() => {           // coalesce bursts (e.g. 5 people at once) into one message
    const msg = `event: change\ndata: ${JSON.stringify({ topics: [...pushTopics], at: nowIso() })}\n\n`;
    pushTopics = new Set(); pushTimer = null;
    for (const res of liveClients) res.write(msg);
  }, 150);
}
setInterval(() => { for (const res of liveClients) res.write(": ping\n\n"); }, 20_000);

// ======================================================================
// Helpers
// ======================================================================

// ---------------------------------------------------------------- analytics reset settings
db.exec("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)");
const getSetting = (k, d = null) => db.prepare("SELECT value FROM settings WHERE key=?").get(k)?.value ?? d;
const setSetting = (k, v) => (v === null
  ? db.prepare("DELETE FROM settings WHERE key=?").run(k)
  : db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(k, String(v)));

function resetConfig() {
  const resetTime = /^([01]\d|2[0-3]):[0-5]\d$/.test(getSetting("reset_time", "")) ? getSetting("reset_time") : "00:00";
  return { autoReset: getSetting("auto_reset", "1") === "1", resetTime, manualResetAt: getSetting("manual_reset_at") };
}

/** Most recent scheduled daily reset at or before `now` (server local time). */
function lastBoundary(now, resetTime) {
  const [h, m] = resetTime.split(":").map(Number);
  const b = new Date(now); b.setHours(h, m, 0, 0);
  if (b > now) b.setDate(b.getDate() - 1);
  return b;
}

/** Start of the current analytics "day": the daily reset and/or the last manual reset, whichever is later. */
function currentDayStart(now = new Date()) {
  const cfg = resetConfig();
  const manual = cfg.manualResetAt ? new Date(cfg.manualResetAt) : null;
  if (!cfg.autoReset) return manual || new Date(0);
  const b = lastBoundary(now, cfg.resetTime);
  return manual && manual > b ? manual : b;
}

function periodRange(period) {
  const now = new Date();
  const DAY = 86_400_000;
  const { resetTime } = resetConfig();
  const boundary = lastBoundary(now, resetTime);
  if (period === "yesterday") {
    const end = boundary;
    const start = new Date(end.getTime() - DAY);
    return { start, end, prevStart: new Date(start.getTime() - DAY), prevEnd: start };
  }
  if (period === "7d") {
    const start = new Date(boundary.getTime() - 6 * DAY);
    const len = now.getTime() - start.getTime();
    return { start, end: now, prevStart: new Date(start.getTime() - len), prevEnd: start };
  }
  const start = currentDayStart(now);
  const len = now.getTime() - start.getTime();
  const prevStart = new Date(Math.max(0, boundary.getTime() - DAY));
  return { start, end: now, prevStart, prevEnd: new Date(Math.min(boundary.getTime(), prevStart.getTime() + len)) };
}

function maskSource(src) {
  try {
    const u = new URL(src);
    if (u.password) u.password = "****";
    return u.toString();
  } catch {
    return src;
  }
}

function parseHostPort(src) {
  try {
    const u = new URL(src);
    const defaults = { "rtsp:": 554, "rtsps:": 322, "http:": 80, "https:": 443 };
    if (!(u.protocol in defaults)) return null;
    return { host: u.hostname, port: u.port ? Number(u.port) : defaults[u.protocol] };
  } catch {
    return null;
  }
}

function tcpProbe(host, port, timeoutMs = 3000) {
  return new Promise((resolve) => {
    const t0 = process.hrtime.bigint();
    const socket = net.connect({ host, port });
    let settled = false;
    const done = (ok, error) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve({ ok, latencyMs: ok ? Number(process.hrtime.bigint() - t0) / 1e6 : null, error: error || null });
    };
    socket.setTimeout(timeoutMs, () => done(false, "timeout"));
    socket.once("connect", () => done(true));
    socket.once("error", (e) => done(false, e.code || e.message));
  });
}

async function probeCamera(cam) {
  const hp = parseHostPort(cam.source_url);
  const checkedAt = nowIso();
  if (!hp) {
    db.prepare("UPDATE cameras SET net_status='n/a', net_latency_ms=NULL, net_checked_at=? WHERE id=?").run(checkedAt, cam.id);
    return { status: "n/a", reason: "Local file / webcam source — no network check" };
  }
  const r = await tcpProbe(hp.host, hp.port);
  db.prepare("UPDATE cameras SET net_status=?, net_latency_ms=?, net_checked_at=? WHERE id=?")
    .run(r.ok ? "online" : "offline", r.latencyMs, checkedAt, cam.id);
  return { status: r.ok ? "online" : "offline", host: hp.host, port: hp.port, latencyMs: r.latencyMs, error: r.error, checkedAt };
}

async function probeAllCameras() {
  const cams = db.prepare("SELECT id, source_url FROM cameras WHERE enabled = 1").all();
  await Promise.all(cams.map(probeCamera));
}
setInterval(() => probeAllCameras().catch(() => {}), 20_000);
probeAllCameras().catch(() => {});

function cameraView(c) {
  const lastFrame = c.last_frame_at ? Date.parse(c.last_frame_at) : 0;
  const streaming = c.enabled && c.stream_status === "streaming" && Date.now() - lastFrame < STREAM_STALE_MS;
  let status = "unknown";
  if (!c.enabled) status = "disabled";
  else if (streaming) status = "streaming";
  else if (c.stream_status === "error") status = "error";
  else if (c.net_status === "online") status = "reachable";
  else if (c.net_status === "offline") status = "offline";
  return {
    id: c.id,
    name: c.name,
    zone: c.zone,
    source_url: maskSource(c.source_url),
    enabled: !!c.enabled,
    line_x1: c.line_x1, line_y1: c.line_y1, line_x2: c.line_x2, line_y2: c.line_y2,
    in_direction: c.in_direction,
    target_fps: c.target_fps,
    net_status: c.net_status,
    net_latency_ms: c.net_latency_ms,
    net_checked_at: c.net_checked_at,
    stream_status: c.stream_status,
    stream_error: c.stream_error,
    processing_fps: streaming ? c.processing_fps : null,
    frame_width: c.frame_width,
    frame_height: c.frame_height,
    last_frame_at: c.last_frame_at,
    streaming,
    status,
    created_at: c.created_at,
  };
}

function validateCameraBody(b, partial = false) {
  const errors = [];
  if (!partial || b.name !== undefined) if (!b.name || typeof b.name !== "string" || !b.name.trim()) errors.push("name is required");
  if (!partial || b.source_url !== undefined) if (!b.source_url || typeof b.source_url !== "string" || !b.source_url.trim()) errors.push("source_url is required (RTSP URL, video file path, or webcam index)");
  for (const k of ["line_x1", "line_y1", "line_x2", "line_y2"]) {
    if (b[k] !== undefined && (typeof b[k] !== "number" || b[k] < 0 || b[k] > 1)) errors.push(`${k} must be a number between 0 and 1`);
  }
  if (b.in_direction !== undefined && !["top_to_bottom", "bottom_to_top"].includes(b.in_direction)) errors.push("in_direction must be top_to_bottom or bottom_to_top");
  if (b.target_fps !== undefined && (!Number.isInteger(b.target_fps) || b.target_fps < 1 || b.target_fps > 30)) errors.push("target_fps must be an integer 1-30");
  return errors;
}

function isLoopback(req) {
  const a = req.socket.remoteAddress || "";
  return a === "127.0.0.1" || a === "::1" || a === "::ffff:127.0.0.1";
}

// ======================================================================
// Authentication guard
// ======================================================================

const PUBLIC_PATHS = new Set([
  "/api/health",
  "/api/auth/status",
  "/api/auth/login",
  "/api/auth/setup",
  "/api/auth/logout",
  "/api/preview/enabled",
]);
const isEngineRoute = (req) =>
  (req.method === "POST" && /^\/api\/events(\/(update|cancel))?$/.test(req.path)) ||
  (req.path.startsWith("/api/engine/") && req.path !== "/api/engine/status") ||
  /^\/api\/cameras\/\d+\/(heartbeat|counts)$/.test(req.path);

app.use((req, res, next) => {
  if (isEngineRoute(req)) {
    return isLoopback(req) && isEngine(req) ? next() : res.status(403).json({ error: "engine token required" });
  }
  // CSRF: state-changing browser requests must come from the dashboard origin
  if (req.method !== "GET" && req.headers.origin && !ALLOWED_ORIGINS.has(req.headers.origin)) {
    return res.status(403).json({ error: "origin not allowed" });
  }
  req.sessionToken = readCookie(req);
  req.user = sessionUser(req.sessionToken);
  if (req.user && req.method !== "GET") res.on("finish", () => res.statusCode < 400 && broadcast("data"));
  if (req.user || PUBLIC_PATHS.has(req.path) || /^\/api\/cameras\/\d+\/live$/.test(req.path)) return next();
  res.status(401).json({ error: "authentication required" });
});

const userCount = () => db.prepare("SELECT COUNT(*) n FROM users").get().n;
const publicUser = (u) => ({ id: u.id, username: u.username, createdAt: u.created_at, lastLoginAt: u.last_login_at });

app.get("/api/auth/status", (req, r) => {
  r.json({ setupRequired: userCount() === 0, authenticated: !!req.user, user: req.user ? publicUser(req.user) : null, sessionExpiresAt: req.user?.expires_at || null });
});

// First-run only: create the initial admin. Allowed only while no admin exists, from this machine.
app.post("/api/auth/setup", (req, r) => {
  if (!isLoopback(req)) return r.status(403).json({ error: "setup must be done on the server machine" });
  if (userCount() > 0) return r.status(409).json({ error: "An admin account already exists — please sign in" });
  const { username, password } = req.body || {};
  const err = validateUsername(username) || validateNewPassword(password, username);
  if (err) return r.status(400).json({ error: err });
  const info = db.prepare("INSERT INTO users (username, password_hash, last_login_at) VALUES (?, ?, ?)").run(username, hashPassword(password), nowIso());
  const s = createSession(info.lastInsertRowid, req, false);
  setSessionCookie(r, s.token, s.maxAge);
  r.status(201).json({ ok: true, user: publicUser(db.prepare("SELECT * FROM users WHERE id=?").get(info.lastInsertRowid)) });
});

app.post("/api/auth/login", (req, r) => {
  const { username, password, remember } = req.body || {};
  if (typeof username !== "string" || typeof password !== "string" || !username || !password) {
    return r.status(400).json({ error: "Username and password are required" });
  }
  const ip = req.socket.remoteAddress || "?";
  const keys = [`ip:${ip}`, `user:${username.toLowerCase()}`];
  const wait = Math.max(...keys.map(loginLocked));
  if (wait > 0) return r.status(429).json({ error: `Too many failed attempts. Try again in ${Math.ceil(wait / 60)} min.`, retryAfter: wait });

  const user = db.prepare("SELECT * FROM users WHERE username=?").get(username);
  const ok = verifyPassword(password, user ? user.password_hash : DUMMY_HASH) && !!user;
  if (!ok) {
    const left = Math.min(...keys.map(recordFailure));
    return r.status(401).json({ error: left > 0 ? `Invalid username or password (${left} attempt${left === 1 ? "" : "s"} left)` : "Too many failed attempts. Locked for 15 minutes." });
  }
  keys.forEach(clearFailures);
  db.prepare("UPDATE users SET last_login_at=? WHERE id=?").run(nowIso(), user.id);
  const s = createSession(user.id, req, !!remember);
  setSessionCookie(r, s.token, s.maxAge);
  r.json({ ok: true, user: publicUser(user), expiresAt: s.expires.toISOString() });
});

app.post("/api/auth/logout", (req, r) => {
  destroySession(req.sessionToken);
  clearSessionCookie(r);
  r.json({ ok: true });
});

app.post("/api/auth/change-password", (req, r) => {
  const { currentPassword, newPassword } = req.body || {};
  const user = db.prepare("SELECT * FROM users WHERE id=?").get(req.user.id);
  if (!verifyPassword(String(currentPassword || ""), user.password_hash)) return r.status(400).json({ error: "Current password is incorrect" });
  const err = validateNewPassword(newPassword, user.username);
  if (err) return r.status(400).json({ error: err });
  db.prepare("UPDATE users SET password_hash=? WHERE id=?").run(hashPassword(newPassword), user.id);
  // Sign out every other session for this account
  db.prepare("DELETE FROM sessions WHERE user_id=?").run(user.id);
  const s = createSession(user.id, req, false);
  setSessionCookie(r, s.token, s.maxAge);
  r.json({ ok: true });
});

// ======================================================================
// Health / engine
// ======================================================================

let engineState = { lastSeen: null, capabilities: null, version: null };

app.get("/api/health", (req, r) => {
  const base = { ok: true, service: "mallvision-api", timestamp: nowIso() };
  if (!req.user) return r.json(base);
  r.json({
    ...base,
    dbEvents: db.prepare("SELECT COUNT(*) n FROM events").get().n,
    cameras: db.prepare("SELECT COUNT(*) n FROM cameras").get().n,
  });
});

app.post("/api/engine/heartbeat", (q, r) => {
  engineState = { lastSeen: nowIso(), capabilities: q.body?.capabilities || null, version: q.body?.version || null };
  r.json({ ok: true });
});

app.get("/api/engine/status", (_q, r) => {
  const online = engineState.lastSeen && Date.now() - Date.parse(engineState.lastSeen) < ENGINE_STALE_MS;
  r.json({ online: !!online, ...engineState });
});

// Full (unmasked) camera config for the local AI engine only (engine token checked by the guard).
app.get("/api/engine/cameras", (q, r) => {
  r.json(db.prepare(`SELECT id, name, source_url, line_x1, line_y1, line_x2, line_y2, in_direction, target_fps
                     FROM cameras WHERE enabled = 1 ORDER BY id`).all());
});

app.post("/api/cameras/:id/heartbeat", (q, r) => {
  const id = Number(q.params.id);
  const { stream_status, error, processing_fps, frame_width, frame_height } = q.body || {};
  if (!["streaming", "connecting", "error", "ended"].includes(stream_status)) return r.status(400).json({ error: "invalid stream_status" });
  const before = db.prepare("SELECT stream_status FROM cameras WHERE id=?").get(id);
  db.prepare(`UPDATE cameras SET stream_status=?, stream_error=?, processing_fps=?, frame_width=COALESCE(?, frame_width),
              frame_height=COALESCE(?, frame_height), last_frame_at=CASE WHEN ?='streaming' THEN ? ELSE last_frame_at END WHERE id=?`)
    .run(stream_status, error || null, processing_fps ?? null, frame_width ?? null, frame_height ?? null, stream_status, nowIso(), id);
  if (before?.stream_status !== stream_status) broadcast("cameras");
  r.json({ ok: true });
});

// Today's camera breakdown counts for the AI engine preview HUD overlay
app.get("/api/cameras/:id/counts", (q, r) => {
  const id = Number(q.params.id);
  const today = periodRange("today");
  const s = today.start.toISOString(), e = today.end.toISOString();
  const row = db.prepare(`
    SELECT
      COALESCE(SUM(object_type='person' AND direction='IN'),0) AS "IN",
      COALESCE(SUM(object_type='person' AND direction='OUT'),0) AS "OUT",
      COALESCE(SUM(object_type='person' AND gender_estimate='male'),0) AS male,
      COALESCE(SUM(object_type='person' AND gender_estimate='female'),0) AS female,
      COALESCE(SUM(object_type='person' AND cultural_attire_estimate='emirati_traditional'),0) AS emirati,
      COALESCE(SUM(object_type='person' AND cultural_attire_estimate='international_casual'),0) AS non_emirati,
      COALESCE(SUM(object_type='dog'),0) AS dog,
      COALESCE(SUM(object_type='cat'),0) AS cat
    FROM events WHERE camera_id=? AND occurred_at >= ? AND occurred_at < ?
  `).get(id, s, e) || {};
  r.json(row);
});

// Real-time channel for the signed-in dashboard (auth enforced by the guard above)
app.get("/api/live", (q, r) => {
  r.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store", Connection: "keep-alive", "X-Accel-Buffering": "no" });
  r.write(`retry: 3000\nevent: hello\ndata: {}\n\n`);
  liveClients.add(r);
  q.on("close", () => liveClients.delete(r));
});

// ======================================================================
// Analytics — every number is an SQL aggregate over events written by the AI engine
// ======================================================================

const formatHour = (h) => (h === 0 ? "12 AM" : h < 12 ? `${h} AM` : h === 12 ? "12 PM" : `${h - 12} PM`);
const pct = (part, whole) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0);
const growth = (cur, prev) => (prev > 0 ? Math.round(((cur - prev) / prev) * 1000) / 10 : null);

const totalsSql = `
  SELECT
    COALESCE(SUM(object_type='person' AND direction='IN'),0) AS personIn,
    COALESCE(SUM(object_type='person' AND direction='OUT'),0) AS personOut,
    COALESCE(SUM(object_type='person' AND direction='IN' AND gender_estimate='male'),0) AS male,
    COALESCE(SUM(object_type='person' AND direction='IN' AND gender_estimate='female'),0) AS female,
    COALESCE(SUM(object_type='person' AND direction='IN' AND age_group_estimate='child'),0) AS children,
    COALESCE(SUM(object_type='person' AND direction='IN' AND age_group_estimate='adult'),0) AS adults,
    COALESCE(SUM(object_type='person' AND direction='IN' AND age_group_estimate='senior'),0) AS seniors,
    COALESCE(SUM(object_type='person' AND direction='IN' AND cultural_attire_estimate='emirati_traditional'),0) AS attireTraditional,
    COALESCE(SUM(object_type='person' AND direction='IN' AND cultural_attire_estimate='international_casual'),0) AS attireCasual,
    COALESCE(SUM(object_type='dog' AND direction='IN'),0) AS dogIn,
    COALESCE(SUM(object_type='dog' AND direction='OUT'),0) AS dogOut,
    COALESCE(SUM(object_type='cat' AND direction='IN'),0) AS catIn,
    COALESCE(SUM(object_type='cat' AND direction='OUT'),0) AS catOut
  FROM events WHERE occurred_at >= ? AND occurred_at < ?`;

app.get("/api/analytics/summary", (q, r) => {
  const period = ["today", "yesterday", "7d"].includes(q.query.period) ? q.query.period : "today";
  const range = periodRange(period);
  const s = range.start.toISOString(), e = range.end.toISOString();

  const t = db.prepare(totalsSql).get(s, e);
  const prev = db.prepare(totalsSql).get(range.prevStart.toISOString(), range.prevEnd.toISOString());

  // Occupancy is always "today since midnight" (mall resets daily)
  const todayR = periodRange("today");
  const today = db.prepare(totalsSql).get(todayR.start.toISOString(), todayR.end.toISOString());

  const cams = db.prepare("SELECT * FROM cameras ORDER BY id").all();
  const perCam = db.prepare(`
    SELECT camera_id,
      COALESCE(SUM(object_type='person' AND direction='IN'),0) AS personIn,
      COALESCE(SUM(object_type='person' AND direction='OUT'),0) AS personOut,
      COALESCE(SUM(object_type='dog' AND direction='IN'),0) AS dogIn,
      COALESCE(SUM(object_type='cat' AND direction='IN'),0) AS catIn,
      COALESCE(SUM(object_type='person' AND direction='IN' AND cultural_attire_estimate='emirati_traditional'),0) AS attireTraditional
    FROM events WHERE occurred_at >= ? AND occurred_at < ? GROUP BY camera_id`).all(s, e);
  const perCamMap = new Map(perCam.map((x) => [x.camera_id, x]));

  const byEntrance = cams.map((c) => {
    const x = perCamMap.get(c.id) || { personIn: 0, personOut: 0, dogIn: 0, catIn: 0, attireTraditional: 0 };
    return { ...cameraView(c), in: x.personIn, out: x.personOut, net: x.personIn - x.personOut, dogsIn: x.dogIn, catsIn: x.catIn, attireTraditional: x.attireTraditional };
  });

  const hourlyRows = db.prepare(`
    SELECT CAST(strftime('%H', occurred_at, 'localtime') AS INTEGER) AS hr,
      COALESCE(SUM(direction='IN'),0) AS i, COALESCE(SUM(direction='OUT'),0) AS o
    FROM events WHERE object_type='person' AND occurred_at >= ? AND occurred_at < ? GROUP BY hr`).all(s, e);
  const hourMap = new Map(hourlyRows.map((h) => [h.hr, h]));
  const hourly = Array.from({ length: 24 }, (_, h) => {
    const row = hourMap.get(h) || { i: 0, o: 0 };
    return { hour: formatHour(h), h, in: row.i, out: row.o };
  });
  const peak = hourly.reduce((best, h) => (h.in > (best?.in || 0) ? h : best), null);

  const personIn = t.personIn;
  const totalEntries = personIn + t.dogIn + t.catIn;
  const genderUnknown = Math.max(0, personIn - t.male - t.female);
  const ageUnknown = Math.max(0, personIn - t.children - t.adults - t.seniors);
  const attireUnclassified = Math.max(0, personIn - t.attireTraditional - t.attireCasual);

  r.json({
    period,
    range: { start: s, end: e },
    hasEvents: totalEntries + t.personOut > 0,
    totalVisitors: personIn,
    inCount: personIn,
    outCount: t.personOut,
    currentlyInside: Math.max(0, today.personIn - today.personOut),
    petsInside: { dogs: Math.max(0, today.dogIn - today.dogOut), cats: Math.max(0, today.catIn - today.catOut) },
    growth: {
      visitors: growth(personIn, prev.personIn),
      out: growth(t.personOut, prev.personOut),
      comparedTo: { start: range.prevStart.toISOString(), end: range.prevEnd.toISOString() },
    },
    demographics: {
      male: t.male, malePct: pct(t.male, personIn),
      female: t.female, femalePct: pct(t.female, personIn),
      genderUnknown, genderUnknownPct: pct(genderUnknown, personIn),
      children: t.children, childrenPct: pct(t.children, personIn),
      adults: t.adults, seniors: t.seniors, ageUnknown,
    },
    animals: { dogIn: t.dogIn, dogOut: t.dogOut, catIn: t.catIn, catOut: t.catOut },
    culturalAttire: {
      traditional: t.attireTraditional, traditionalPct: pct(t.attireTraditional, personIn),
      casual: t.attireCasual, casualPct: pct(t.attireCasual, personIn),
      unclassified: attireUnclassified, unclassifiedPct: pct(attireUnclassified, personIn),
    },
    categoryBreakdown: {
      people: { count: personIn, pct: pct(personIn, totalEntries) },
      dogs: { count: t.dogIn, pct: pct(t.dogIn, totalEntries) },
      cats: { count: t.catIn, pct: pct(t.catIn, totalEntries) },
    },
    byEntrance,
    hourly,
    peak: peak ? { hour: peak.hour, count: peak.in } : null,
    generatedAt: nowIso(),
  });
});

// ======================================================================
// Events
// ======================================================================

app.get("/api/events", (q, r) => {
  const limit = Math.min(500, Math.max(1, Number(q.query.limit) || 20));
  const period = ["today", "yesterday", "7d"].includes(q.query.period) ? q.query.period : null;
  const params = [];
  let where = "";
  if (period) {
    const range = periodRange(period);
    where = "WHERE e.occurred_at >= ? AND e.occurred_at < ?";
    params.push(range.start.toISOString(), range.end.toISOString());
  }
  params.push(limit);
  r.json(db.prepare(`
    SELECT e.*, c.name AS camera_name, c.zone
    FROM events e JOIN cameras c ON c.id = e.camera_id
    ${where} ORDER BY e.id DESC LIMIT ?`).all(...params));
});

// Ingest — called by the local AI engine when a tracked object crosses a virtual line
app.post("/api/events", (q, r) => {
  const b = q.body || {};
  if (!db.prepare("SELECT 1 FROM cameras WHERE id=?").get(b.camera_id)) return r.status(400).json({ error: "unknown camera_id" });
  if (!["person", "dog", "cat"].includes(b.object_type)) return r.status(400).json({ error: "invalid object_type" });
  if (!["IN", "OUT"].includes(b.direction)) return r.status(400).json({ error: "invalid direction" });
  const occurred = b.occurred_at && !Number.isNaN(Date.parse(b.occurred_at)) ? new Date(b.occurred_at).toISOString() : nowIso();
  const isPerson = b.object_type === "person";
  try {
    const res = db.prepare(`
      INSERT INTO events (camera_id, track_id, object_type, direction, gender_estimate, age_group_estimate, cultural_attire_estimate, confidence, occurred_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      b.camera_id, b.track_id ?? null, b.object_type, b.direction,
      isPerson ? (
        b.gender_estimate && b.gender_estimate !== "unknown" ? b.gender_estimate :
        ["male_emirati", "male_non_emirati"].includes(b.cultural_attire_estimate) ? "male" :
        ["female_emirati", "female_non_emirati"].includes(b.cultural_attire_estimate) ? "female" :
        "unknown"
      ) : null,
      isPerson ? b.age_group_estimate ?? "unknown" : null,
      isPerson ? (
        ["male_emirati", "female_emirati", "emirati_traditional"].includes(b.cultural_attire_estimate) ? "emirati_traditional" :
        ["male_non_emirati", "female_non_emirati", "international_casual"].includes(b.cultural_attire_estimate) ? "international_casual" :
        "unclassified"
      ) : null,
      typeof b.confidence === "number" ? b.confidence : null,
      occurred);
    r.status(201).json({ ok: true, id: res.lastInsertRowid });
    broadcast("events");
  } catch (err) {
    r.status(400).json({ error: err.message });
  }
});

db.exec("CREATE INDEX IF NOT EXISTS idx_events_track ON events(camera_id, track_id)");
const GENDERS = new Set(["male", "female", "unknown"]);
const AGES = new Set(["child", "adult", "senior", "unknown"]);

// Engine refines gender / age once it has seen the person for a few more seconds
app.post("/api/events/update", (q, r) => {
  const { camera_id, track_id, gender_estimate, age_group_estimate } = q.body || {};
  if (!track_id || !GENDERS.has(gender_estimate) || !AGES.has(age_group_estimate)) return r.status(400).json({ error: "invalid update" });
  const res = db.prepare("UPDATE events SET gender_estimate=?, age_group_estimate=? WHERE camera_id=? AND track_id=? AND object_type='person'")
    .run(gender_estimate, age_group_estimate, camera_id, track_id);
  if (res.changes) broadcast("events");
  r.json({ ok: true, updated: res.changes });
});

// Engine withdraws a crossing when the person immediately stepped back over the line
app.post("/api/events/cancel", (q, r) => {
  const { camera_id, track_id } = q.body || {};
  if (!track_id) return r.status(400).json({ error: "track_id required" });
  const res = db.prepare("DELETE FROM events WHERE camera_id=? AND track_id=?").run(camera_id, track_id);
  if (res.changes) broadcast("events");
  r.json({ ok: true, deleted: res.changes });
});

app.get("/api/reports/export", (q, r) => {
  const period = ["today", "yesterday", "7d"].includes(q.query.period) ? q.query.period : "today";
  const range = periodRange(period);
  const rows = db.prepare(`
    SELECT e.id, c.name AS entrance, c.zone, e.track_id, e.object_type, e.direction,
           e.gender_estimate, e.age_group_estimate, e.cultural_attire_estimate, e.confidence, e.occurred_at
    FROM events e JOIN cameras c ON c.id = e.camera_id
    WHERE e.occurred_at >= ? AND e.occurred_at < ? ORDER BY e.id`).all(range.start.toISOString(), range.end.toISOString());
  const esc = (v) => (v == null ? "" : `"${String(v).replace(/"/g, '""')}"`);
  const header = ["id", "entrance", "zone", "track_id", "object_type", "direction", "gender_estimate", "age_group_estimate", "cultural_attire_estimate", "confidence", "occurred_at"];
  const lines = [header.join(","), ...rows.map((x) => header.map((h) => esc(x[h])).join(","))];
  r.setHeader("Content-Type", "text/csv");
  r.setHeader("Content-Disposition", `attachment; filename="mallvision_${period}_${new Date().toISOString().slice(0, 10)}.csv"`);
  r.send(lines.join("\n"));
});

// ======================================================================
// Analytics reset (daily schedule + manual). Resets never delete history;
// they only move the start of "Today". "Clear history" is the only delete.
// ======================================================================

function resetStatus() {
  const cfg = resetConfig();
  const now = new Date();
  const start = currentDayStart(now);
  let nextResetAt = null;
  if (cfg.autoReset) { const b = lastBoundary(now, cfg.resetTime); b.setDate(b.getDate() + 1); nextResetAt = b.toISOString(); }
  return { ...cfg, currentDayStart: start.getTime() > 0 ? start.toISOString() : null, nextResetAt };
}

app.get("/api/settings/reset", (_q, r) => r.json(resetStatus()));

app.put("/api/settings/reset", (q, r) => {
  const { autoReset, resetTime } = q.body || {};
  if (resetTime !== undefined && !/^([01]\d|2[0-3]):[0-5]\d$/.test(resetTime)) return r.status(400).json({ error: "Please choose a valid time" });
  if (autoReset !== undefined) setSetting("auto_reset", autoReset ? "1" : "0");
  if (resetTime !== undefined) setSetting("reset_time", resetTime);
  r.json(resetStatus());
});

app.post("/api/analytics/reset", (_q, r) => {
  setSetting("manual_reset_at", nowIso());
  r.json(resetStatus());
});

app.post("/api/analytics/clear", (q, r) => {
  const user = db.prepare("SELECT * FROM users WHERE id=?").get(q.user.id);
  if (!verifyPassword(String(q.body?.password || ""), user.password_hash)) return r.status(400).json({ error: "Password is incorrect" });
  const n = db.prepare("DELETE FROM events").run().changes;
  setSetting("manual_reset_at", null);
  r.json({ ok: true, deleted: n, ...resetStatus() });
});

// ======================================================================
// Cameras (real-time add / edit / delete / test)
// ======================================================================

app.get("/api/cameras", (_q, r) => {
  r.json(db.prepare("SELECT * FROM cameras ORDER BY id").all().map(cameraView));
});

app.post("/api/cameras", async (q, r) => {
  const b = q.body || {};
  const errors = validateCameraBody(b);
  if (errors.length) return r.status(400).json({ error: errors.join("; ") });
  const info = db.prepare(`
    INSERT INTO cameras (name, zone, source_url, in_direction, target_fps, line_x1, line_y1, line_x2, line_y2)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    b.name.trim(), (b.zone || "").trim(), b.source_url.trim(),
    b.in_direction || "top_to_bottom", b.target_fps || 5,
    b.line_x1 ?? 0.1, b.line_y1 ?? 0.5, b.line_x2 ?? 0.9, b.line_y2 ?? 0.5);
  const cam = db.prepare("SELECT * FROM cameras WHERE id=?").get(info.lastInsertRowid);
  const probe = await probeCamera(cam);
  r.status(201).json({ ok: true, camera: cameraView(db.prepare("SELECT * FROM cameras WHERE id=?").get(cam.id)), probe });
});

app.patch("/api/cameras/:id", (q, r) => {
  const id = Number(q.params.id);
  const cam = db.prepare("SELECT * FROM cameras WHERE id=?").get(id);
  if (!cam) return r.status(404).json({ error: "camera not found" });
  const b = { ...(q.body || {}) };
  // The dashboard only ever sees a masked URL; ignore it if sent back unchanged
  if (b.source_url !== undefined && b.source_url === maskSource(cam.source_url)) delete b.source_url;
  const errors = validateCameraBody(b, true);
  if (errors.length) return r.status(400).json({ error: errors.join("; ") });
  const fields = ["name", "zone", "source_url", "enabled", "line_x1", "line_y1", "line_x2", "line_y2", "in_direction", "target_fps"];
  const sets = [], vals = [];
  for (const f of fields) {
    if (b[f] === undefined) continue;
    sets.push(`${f}=?`);
    vals.push(f === "enabled" ? (b[f] ? 1 : 0) : typeof b[f] === "string" ? b[f].trim() : b[f]);
  }
  if (b.source_url !== undefined || b.enabled === false) {
    sets.push("stream_status='idle'", "processing_fps=NULL", "stream_error=NULL", "net_status='unknown'");
  }
  if (sets.length) db.prepare(`UPDATE cameras SET ${sets.join(", ")} WHERE id=?`).run(...vals, id);
  r.json({ ok: true, camera: cameraView(db.prepare("SELECT * FROM cameras WHERE id=?").get(id)) });
});

app.delete("/api/cameras/:id", (q, r) => {
  const res = db.prepare("DELETE FROM cameras WHERE id=?").run(Number(q.params.id));
  if (!res.changes) return r.status(404).json({ error: "camera not found" });
  r.json({ ok: true });
});

app.post("/api/cameras/:id/test", async (q, r) => {
  const cam = db.prepare("SELECT * FROM cameras WHERE id=?").get(Number(q.params.id));
  if (!cam) return r.status(404).json({ error: "camera not found" });
  r.json(await probeCamera(cam));
});

// >>> TEMP-LIVE-PREVIEW (testing only — delete this block, or set LIVE_PREVIEW=0, before client hand-over)
const LIVE_PREVIEW = process.env.LIVE_PREVIEW !== "0";
const PREVIEW_DIR = path.resolve(path.dirname(path.resolve(process.env.DB_PATH || "./data/mallvision.db")), "preview");
app.get("/api/preview/enabled", (_q, r) => r.json({ enabled: LIVE_PREVIEW }));

// Coalescing in-memory stream buffer: only 1 file poll per camera every 40ms, broadcast to all clients in RAM
const frameBufferCache = new Map(); // id -> { buf, mtimeMs, listeners: Set, interval }

function getOrCreateCameraStream(camId) {
  if (frameBufferCache.has(camId)) return frameBufferCache.get(camId);
  const file = path.join(PREVIEW_DIR, `cam_${camId}.jpg`);
  const streamInfo = {
    file,
    buf: null,
    mtimeMs: 0,
    listeners: new Set(),
    interval: null,
  };

  const poll = () => {
    try {
      if (!fs.existsSync(file)) return;
      const st = fs.statSync(file);
      if (st.mtimeMs !== streamInfo.mtimeMs) {
        const buf = fs.readFileSync(file);
        if (buf.length >= 100) {
          streamInfo.mtimeMs = st.mtimeMs;
          streamInfo.buf = buf;
          for (const send of streamInfo.listeners) {
            send(buf);
          }
        }
      }
    } catch {
      // file momentarily being written or locked by Python
    }
  };

  streamInfo.interval = setInterval(poll, 40); // 40ms coalesced fast buffer
  frameBufferCache.set(camId, streamInfo);
  return streamInfo;
}

app.get("/api/cameras/:id/live", (q, r) => {
  if (!LIVE_PREVIEW) return r.status(404).end();
  const id = Number(q.params.id);
  if (!Number.isInteger(id) || id <= 0) return r.status(400).end();

  const boundary = "mvframe";
  r.writeHead(200, {
    "Content-Type": `multipart/x-mixed-replace; boundary=${boundary}`,
    "Cache-Control": "no-store, no-cache, must-revalidate, pre-check=0, post-check=0, max-age=0",
    "Pragma": "no-cache",
    "Connection": "close",
  });

  const streamInfo = getOrCreateCameraStream(id);

  const sendFrame = (buf) => {
    try {
      r.write(`--${boundary}\r\nContent-Type: image/jpeg\r\nContent-Length: ${buf.length}\r\n\r\n`);
      r.write(buf);
      r.write("\r\n");
    } catch {
      // client disconnected
    }
  };

  if (streamInfo.buf) {
    sendFrame(streamInfo.buf);
  }

  streamInfo.listeners.add(sendFrame);

  q.on("close", () => {
    streamInfo.listeners.delete(sendFrame);
    if (streamInfo.listeners.size === 0) {
      if (streamInfo.interval) clearInterval(streamInfo.interval);
      frameBufferCache.delete(id);
    }
  });
});
// <<< TEMP-LIVE-PREVIEW

// ======================================================================
// Wi-Fi (Windows netsh) — reads the real adapter, no placeholder values
// ======================================================================

const isWindows = process.platform === "win32";
const run = (cmd, args, timeout = 6000) => execFileSync(cmd, args, { encoding: "utf8", timeout, windowsHide: true });
const kv = (line) => { const m = line.match(/^\s*([^:]+?)\s*:\s(.*)$/); return m ? [m[1].trim().toLowerCase(), m[2].trim()] : null; };
const wifiGeneration = (radio) => ({ "802.11be": "Wi-Fi 7", "802.11ax": "Wi-Fi 6", "802.11ac": "Wi-Fi 5", "802.11n": "Wi-Fi 4" }[radio] || null);
const bandFromChannel = (ch) => (!ch ? null : ch <= 14 ? "2.4 GHz" : "5 GHz");

function readWifiStatus() {
  if (!isWindows) return { supported: false, connected: false, error: "Wi-Fi management is only implemented for Windows" };
  let raw;
  try { raw = run("netsh", ["wlan", "show", "interfaces"]); }
  catch (e) { return { supported: true, connected: false, error: "No wireless interface available" }; }
  const info = {};
  for (const line of raw.split(/\r?\n/)) {
    const p = kv(line);
    if (p && !(p[0] in info)) info[p[0]] = p[1];
  }
  const connected = (info.state || "").toLowerCase() === "connected";
  const channel = info.channel ? parseInt(info.channel, 10) : null;
  const signal = info.signal ? parseInt(info.signal, 10) : null;
  const iface = info.name || null;

  let ipAddress = null, netmask = null, mac = info["physical address"] || null, gateway = null;
  const addrs = iface ? os.networkInterfaces()[iface] : null;
  const v4 = addrs?.find((a) => a.family === "IPv4");
  if (v4) { ipAddress = v4.address; netmask = v4.netmask; }
  if (ipAddress) {
    try {
      for (const line of run("route", ["print", "-4"]).split(/\r?\n/)) {
        const c = line.trim().split(/\s+/);
        if (c[0] === "0.0.0.0" && c[1] === "0.0.0.0" && c[3] === ipAddress) { gateway = c[2]; break; }
      }
    } catch { /* gateway stays null */ }
  }
  return {
    supported: true,
    connected,
    state: info.state || null,
    interfaceName: iface,
    adapter: info.description || null,
    ssid: connected ? info.ssid || null : null,
    bssid: connected ? info.bssid || info["ap bssid"] || null : null,
    signal,
    radioType: info["radio type"] || null,
    generation: wifiGeneration(info["radio type"]),
    security: info.authentication || null,
    cipher: info.cipher || null,
    channel,
    band: bandFromChannel(channel),
    rxRateMbps: info["receive rate (mbps)"] ? Number(info["receive rate (mbps)"]) : null,
    txRateMbps: info["transmit rate (mbps)"] ? Number(info["transmit rate (mbps)"]) : null,
    profile: info.profile || null,
    ipAddress, netmask, gateway, mac,
    checkedAt: nowIso(),
  };
}

function scanWifiNetworks() {
  if (!isWindows) return [];
  const raw = run("netsh", ["wlan", "show", "networks", "mode=bssid"]);
  const list = [];
  let cur = null;
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*SSID \d+\s*:\s?(.*)$/);
    if (m) { cur = { ssid: m[1].trim(), signal: 0, security: null, encryption: null, radioType: null, channel: null, bssids: 0 }; list.push(cur); continue; }
    if (!cur) continue;
    const p = kv(line);
    if (!p) continue;
    const [k, v] = p;
    if (k === "authentication") cur.security = v;
    else if (k === "encryption") cur.encryption = v;
    else if (/^bssid \d+$/.test(k)) cur.bssids++;
    else if (k === "signal") cur.signal = Math.max(cur.signal, parseInt(v, 10) || 0);
    else if (k === "radio type" && !cur.radioType) cur.radioType = v;
    else if (k === "channel" && !cur.channel) cur.channel = parseInt(v, 10) || null;
  }
  return list.filter((n) => n.ssid).map((n) => ({ ...n, band: bandFromChannel(n.channel), generation: wifiGeneration(n.radioType) }))
    .sort((a, b) => b.signal - a.signal);
}

function savedProfiles() {
  if (!isWindows) return [];
  try {
    return run("netsh", ["wlan", "show", "profiles"]).split(/\r?\n/)
      .map((l) => l.match(/All User Profile\s*:\s(.*)$/)).filter(Boolean).map((m) => m[1].trim());
  } catch { return []; }
}

app.get("/api/wifi/status", (_q, r) => r.json(readWifiStatus()));

app.get("/api/wifi/networks", (_q, r) => {
  try {
    const status = readWifiStatus();
    const profiles = new Set(savedProfiles());
    r.json({
      supported: isWindows,
      networks: scanWifiNetworks().map((n) => ({ ...n, connected: status.connected && status.ssid === n.ssid, saved: profiles.has(n.ssid) })),
      scannedAt: nowIso(),
    });
  } catch (e) {
    r.status(500).json({ error: "Could not scan Wi-Fi networks", detail: e.message });
  }
});

const xmlEsc = (s) => s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c]));

function profileXml(ssid, security, encryption, password) {
  const auth = { "WPA2-Personal": "WPA2PSK", "WPA3-Personal": "WPA3SAE", "WPA-Personal": "WPAPSK", Open: "open" }[security];
  if (!auth) return null;
  const enc = auth === "open" ? "none" : /TKIP/i.test(encryption || "") ? "TKIP" : "AES";
  const key = auth === "open" ? "" :
    `<sharedKey><keyType>passPhrase</keyType><protected>false</protected><keyMaterial>${xmlEsc(password)}</keyMaterial></sharedKey>`;
  return `<?xml version="1.0"?>
<WLANProfile xmlns="http://www.microsoft.com/networking/WLAN/profile/v1">
  <name>${xmlEsc(ssid)}</name>
  <SSIDConfig><SSID><name>${xmlEsc(ssid)}</name></SSID></SSIDConfig>
  <connectionType>ESS</connectionType>
  <connectionMode>auto</connectionMode>
  <MSM><security>
    <authEncryption><authentication>${auth}</authentication><encryption>${enc}</encryption><useOneX>false</useOneX></authEncryption>
    ${key}
  </security></MSM>
</WLANProfile>`;
}

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

app.post("/api/wifi/connect", async (q, r) => {
  if (!isWindows) return r.status(501).json({ error: "Wi-Fi management is only implemented for Windows" });
  const { ssid, password } = q.body || {};
  if (!ssid || typeof ssid !== "string") return r.status(400).json({ error: "ssid is required" });

  let addedProfile = false;
  try {
    if (!savedProfiles().includes(ssid)) {
      const target = scanWifiNetworks().find((n) => n.ssid === ssid);
      if (!target) return r.status(404).json({ error: "Network is not in range" });
      const xml = profileXml(ssid, target.security, target.encryption, password || "");
      if (!xml) return r.status(400).json({ error: `${target.security} networks must be configured from Windows settings` });
      if (target.security !== "Open" && (!password || password.length < 8)) return r.status(400).json({ error: "Password must be at least 8 characters" });
      const file = path.join(os.tmpdir(), `mv-wifi-${Date.now()}.xml`);
      fs.writeFileSync(file, xml, { mode: 0o600 });
      try { run("netsh", ["wlan", "add", "profile", `filename=${file}`, "user=current"]); }
      finally { fs.rmSync(file, { force: true }); }
      addedProfile = true;
    }
    run("netsh", ["wlan", "connect", `name=${ssid}`, `ssid=${ssid}`]);

    for (let i = 0; i < 20; i++) {
      await sleep(1000);
      const st = readWifiStatus();
      if (st.connected && st.ssid === ssid) return r.json({ ok: true, status: st });
    }
    if (addedProfile) { try { run("netsh", ["wlan", "delete", "profile", `name=${ssid}`]); } catch { /* ignore */ } }
    r.status(504).json({ error: "Could not connect within 20 seconds — check the password and signal." });
  } catch (e) {
    if (addedProfile) { try { run("netsh", ["wlan", "delete", "profile", `name=${ssid}`]); } catch { /* ignore */ } }
    r.status(500).json({ error: "Connection failed", detail: (e.stdout || e.message || "").toString().trim() });
  }
});

app.post("/api/wifi/disconnect", (_q, r) => {
  if (!isWindows) return r.status(501).json({ error: "Wi-Fi management is only implemented for Windows" });
  try {
    const status = readWifiStatus();
    const args = ["wlan", "disconnect"];
    if (status.interfaceName) args.push(`interface=${status.interfaceName}`);
    run("netsh", args);
    console.log(`[wifi] Disconnected interface: ${status.interfaceName || "default"}`);
    r.json({ ok: true, interface: status.interfaceName || null });
  }
  catch (e) {
    console.error("[wifi] Disconnect error:", e.message);
    r.status(500).json({ error: "Disconnect failed", detail: e.message });
  }
});

const port = Number(process.env.PORT || 4000);
app.listen(port, "127.0.0.1", () => console.log(`MallVision API at http://127.0.0.1:${port}`));

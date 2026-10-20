// Admin authentication: scrypt password hashes, opaque session tokens in an
// httpOnly cookie, login rate limiting, and a separate secret for the local AI engine.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { db } from "./db.js";

export const COOKIE = "mv_session";
const SESSION_HOURS = 12;
const REMEMBER_DAYS = 7;
const MAX_FAILS = 5;
const LOCK_MS = 15 * 60_000;

// ----------------------------------------------------------------- passwords
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export function verifyPassword(password, stored) {
  try {
    const [algo, N, r, p, saltB64, hashB64] = stored.split("$");
    if (algo !== "scrypt") return false;
    const expected = Buffer.from(hashB64, "base64");
    const actual = crypto.scryptSync(password, Buffer.from(saltB64, "base64"), expected.length, { N: +N, r: +r, p: +p });
    return crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

// Same cost as a real verify, so unknown usernames can't be detected by timing
const DUMMY_HASH = hashPassword(crypto.randomBytes(16).toString("hex"));

export function validateNewPassword(pw, username = "") {
  if (typeof pw !== "string" || pw.length < 10) return "Password must be at least 10 characters";
  if (pw.length > 128) return "Password is too long";
  if (!/[a-z]/i.test(pw) || !/\d/.test(pw)) return "Password must contain letters and numbers";
  if (username && pw.toLowerCase().includes(username.toLowerCase())) return "Password must not contain the username";
  return null;
}

export function validateUsername(u) {
  if (typeof u !== "string" || !/^[a-zA-Z0-9._-]{3,32}$/.test(u)) return "Username must be 3–32 characters (letters, numbers, . _ -)";
  return null;
}

// ----------------------------------------------------------------- sessions
const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");

export function createSession(userId, req, remember) {
  const token = crypto.randomBytes(32).toString("base64url");
  const ttl = remember ? REMEMBER_DAYS * 86_400_000 : SESSION_HOURS * 3_600_000;
  const expires = new Date(Date.now() + ttl);
  db.prepare("INSERT INTO sessions (token_hash, user_id, expires_at, ip, user_agent) VALUES (?, ?, ?, ?, ?)")
    .run(sha256(token), userId, expires.toISOString(), req.socket.remoteAddress || null, String(req.headers["user-agent"] || "").slice(0, 200));
  return { token, expires, maxAge: ttl };
}

export function destroySession(token) {
  if (token) db.prepare("DELETE FROM sessions WHERE token_hash=?").run(sha256(token));
}

export function sessionUser(token) {
  if (!token) return null;
  const row = db.prepare(`SELECT u.id, u.username, u.created_at, u.last_login_at, s.expires_at
                          FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash=?`).get(sha256(token));
  if (!row) return null;
  if (Date.parse(row.expires_at) <= Date.now()) { destroySession(token); return null; }
  return row;
}

setInterval(() => db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(new Date().toISOString()), 3_600_000).unref();

export function readCookie(req, name = COOKIE) {
  for (const part of String(req.headers.cookie || "").split(";")) {
    const i = part.indexOf("=");
    if (i > -1 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

export function setSessionCookie(res, token, maxAge) {
  res.setHeader("Set-Cookie", `${COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${Math.floor(maxAge / 1000)}`);
}
export function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`);
}

// ----------------------------------------------------------------- login throttling
const attempts = new Map(); // key -> { fails, lockedUntil }

export function loginLocked(key) {
  const a = attempts.get(key);
  if (a?.lockedUntil && a.lockedUntil > Date.now()) return Math.ceil((a.lockedUntil - Date.now()) / 1000);
  return 0;
}
export function recordFailure(key) {
  const a = attempts.get(key) || { fails: 0, lockedUntil: 0 };
  a.fails += 1;
  if (a.fails >= MAX_FAILS) { a.lockedUntil = Date.now() + LOCK_MS; a.fails = 0; }
  attempts.set(key, a);
  return MAX_FAILS - a.fails;
}
export function clearFailures(key) { attempts.delete(key); }

// ----------------------------------------------------------------- engine secret
// The AI engine runs on the same machine and reads this file; browsers never see it.
const tokenFile = path.resolve(path.dirname(path.resolve(process.env.DB_PATH || "./data/mallvision.db")), "engine.token");
export const ENGINE_TOKEN = (() => {
  try {
    const t = fs.readFileSync(tokenFile, "utf8").trim();
    if (t.length >= 32) return t;
  } catch { /* create below */ }
  const t = crypto.randomBytes(32).toString("hex");
  fs.writeFileSync(tokenFile, t, { mode: 0o600 });
  return t;
})();
export const ENGINE_TOKEN_FILE = tokenFile;

export function isEngine(req) {
  const t = String(req.headers["x-engine-token"] || "");
  return t.length === ENGINE_TOKEN.length && crypto.timingSafeEqual(Buffer.from(t), Buffer.from(ENGINE_TOKEN));
}

export { DUMMY_HASH };

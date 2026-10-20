import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
dotenv.config();

const resolved = path.resolve(process.env.DB_PATH || "./data/mallvision.db");
fs.mkdirSync(path.dirname(resolved), { recursive: true });
export const db = new Database(resolved);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

const SCHEMA_VERSION = 2;

// Schema v1 contained synthetic demo rows only; drop it so no generated data survives.
if (db.pragma("user_version", { simple: true }) < SCHEMA_VERSION) {
  db.exec("DROP TABLE IF EXISTS events; DROP TABLE IF EXISTS cameras;");
}

db.exec(`
CREATE TABLE IF NOT EXISTS cameras (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  zone TEXT NOT NULL DEFAULT '',
  source_url TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  line_x1 REAL NOT NULL DEFAULT 0.1,
  line_y1 REAL NOT NULL DEFAULT 0.5,
  line_x2 REAL NOT NULL DEFAULT 0.9,
  line_y2 REAL NOT NULL DEFAULT 0.5,
  in_direction TEXT NOT NULL DEFAULT 'top_to_bottom' CHECK(in_direction IN ('top_to_bottom','bottom_to_top')),
  target_fps INTEGER NOT NULL DEFAULT 5,
  net_status TEXT NOT NULL DEFAULT 'unknown',
  net_latency_ms REAL,
  net_checked_at TEXT,
  stream_status TEXT NOT NULL DEFAULT 'idle',
  stream_error TEXT,
  processing_fps REAL,
  frame_width INTEGER,
  frame_height INTEGER,
  last_frame_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  camera_id INTEGER NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
  track_id TEXT,
  object_type TEXT NOT NULL CHECK(object_type IN ('person','dog','cat')),
  direction TEXT NOT NULL CHECK(direction IN ('IN','OUT')),
  gender_estimate TEXT CHECK(gender_estimate IS NULL OR gender_estimate IN ('male','female','unknown')),
  age_group_estimate TEXT CHECK(age_group_estimate IS NULL OR age_group_estimate IN ('child','adult','senior','unknown')),
  cultural_attire_estimate TEXT CHECK(cultural_attire_estimate IS NULL OR cultural_attire_estimate IN ('emirati_traditional','international_casual','unclassified')),
  confidence REAL,
  occurred_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_events_time ON events(occurred_at);
CREATE INDEX IF NOT EXISTS idx_events_camera ON events(camera_id);

-- Admin authentication (passwords: scrypt hash; sessions: SHA-256 of the random token)
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  last_login_at TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  expires_at TEXT NOT NULL,
  ip TEXT,
  user_agent TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
`);

db.pragma(`user_version = ${SCHEMA_VERSION}`);

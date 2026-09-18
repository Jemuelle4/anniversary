-- SQLite mirror of supabase/migrations/0001_plush_homes.sql (see docs/phase-2-shared-sync.md §4).
-- Purpose: local DB-architecture tests without Supabase. Differences from Postgres are
-- listed in docs/testing-strategy.md §3. Keep column names and constraints identical.

PRAGMA foreign_keys = ON;

CREATE TABLE homes (
  id           TEXT PRIMARY KEY,
  invite_code  TEXT NOT NULL UNIQUE,
  timezone     TEXT NOT NULL DEFAULT 'UTC',
  anniversary_date TEXT,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE partners (
  id         TEXT PRIMARY KEY,
  home_id    TEXT NOT NULL REFERENCES homes(id) ON DELETE CASCADE,
  name       TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 16),
  color      TEXT NOT NULL CHECK (color IN ('rose','amber','mint','sky','lilac','beige')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (home_id, name)
);

CREATE TABLE members (
  user_id    TEXT PRIMARY KEY,
  home_id    TEXT NOT NULL REFERENCES homes(id) ON DELETE CASCADE,
  partner_id TEXT NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE plush_state (
  home_id    TEXT PRIMARY KEY REFERENCES homes(id) ON DELETE CASCADE,
  version    INTEGER NOT NULL DEFAULT 0,
  state      TEXT NOT NULL,                 -- JSON (jsonb in Postgres)
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE plush_events (
  id          TEXT PRIMARY KEY,             -- client generated uuid, idempotency key
  home_id     TEXT NOT NULL REFERENCES homes(id) ON DELETE CASCADE,
  partner_id  TEXT NOT NULL REFERENCES partners(id),
  type        TEXT NOT NULL,
  version     INTEGER NOT NULL,
  client_at   TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  payload     TEXT NOT NULL DEFAULT '{}',   -- JSON
  state_after TEXT NOT NULL,                -- JSON
  UNIQUE (home_id, version)
);
CREATE INDEX plush_events_home_created ON plush_events (home_id, created_at DESC);

-- Mirrors the partners_limit trigger (max two partners per home).
CREATE TRIGGER partners_limit BEFORE INSERT ON partners
BEGIN
  SELECT CASE WHEN (SELECT count(*) FROM partners WHERE home_id = NEW.home_id) >= 2
    THEN RAISE(ABORT, 'home_full') END;
END;

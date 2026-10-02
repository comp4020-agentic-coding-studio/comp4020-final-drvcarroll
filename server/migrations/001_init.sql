CREATE TABLE users (
  id INTEGER PRIMARY KEY, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL);
CREATE TABLE seasons (
  id TEXT PRIMARY KEY, started_at INTEGER NOT NULL, ended_at INTEGER, winner_nation_id TEXT, rules_version TEXT NOT NULL);
CREATE TABLE nations (
  id TEXT NOT NULL, season_id TEXT NOT NULL, user_id INTEGER NOT NULL, name TEXT NOT NULL,
  colour_primary TEXT NOT NULL, colour_secondary TEXT NOT NULL,
  PRIMARY KEY (season_id, id), UNIQUE (season_id, name), UNIQUE (season_id, user_id));
CREATE TABLE commands (
  seq INTEGER PRIMARY KEY, season_id TEXT NOT NULL, nation_id TEXT NOT NULL, at INTEGER NOT NULL,
  type TEXT NOT NULL, payload TEXT NOT NULL, result TEXT NOT NULL, client_cmd_id TEXT);
CREATE INDEX commands_client ON commands (nation_id, client_cmd_id);
CREATE TABLE snapshots (
  season_id TEXT NOT NULL, seq INTEGER NOT NULL, at INTEGER NOT NULL, rules_version TEXT NOT NULL, state BLOB NOT NULL);

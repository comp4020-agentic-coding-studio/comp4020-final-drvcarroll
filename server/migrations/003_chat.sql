CREATE TABLE messages (
  id INTEGER PRIMARY KEY, season_id TEXT NOT NULL, channel TEXT NOT NULL, from_nation TEXT NOT NULL,
  text TEXT NOT NULL, at INTEGER NOT NULL);
CREATE INDEX messages_channel ON messages (season_id, channel, id);

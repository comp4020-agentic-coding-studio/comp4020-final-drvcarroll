// system-design.md §4, §12: SQLite on the volume, WAL, durable writes,
// numbered migrations applied in a transaction.
import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

export type Db = DatabaseSync;

const MIGRATIONS = join(import.meta.dirname, "migrations");

export function openDb(dir: string): Db {
  mkdirSync(dir, { recursive: true });
  const db = new DatabaseSync(join(dir, "game.db"));
  db.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL;");
  const { user_version: at } = db.prepare("PRAGMA user_version").get() as { user_version: number };
  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
    const n = Number.parseInt(file, 10);
    if (n <= at) continue;
    db.exec("BEGIN");
    db.exec(readFileSync(join(MIGRATIONS, file), "utf8"));
    db.exec(`PRAGMA user_version = ${n}`);
    db.exec("COMMIT");
  }
  return db;
}

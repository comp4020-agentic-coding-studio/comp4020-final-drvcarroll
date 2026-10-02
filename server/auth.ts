// system-design.md §7, §9: scrypt passwords, hashed session tokens, limits.
import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import type { Db } from "./db.ts";

const SCRYPT = { N: 2 ** 14, r: 8, p: 1 };
const KEY_LEN = 32;
const SESSION_MS = 30 * 24 * 3600 * 1000;
const MAX_HASHING = 2; // scrypt costs 16 MB each
const FAILS = { perUser: 5, perIp: 20, windowMs: 15 * 60 * 1000 };
const COMMON = new Set([
  "password", "password1", "12345678", "123456789", "1234567890", "qwertyui", "qwerty123",
  "iloveyou", "sunshine", "princess", "football", "baseball", "welcome1", "admin123", "letmein1", "abcdefgh",
]);

export interface User { id: number; username: string }
export type AuthError = { field: "username" | "password"; reason: string };

let hashing = 0;
const waiting: (() => void)[] = [];

async function derive(password: string, salt: Buffer): Promise<Buffer> {
  if (hashing >= MAX_HASHING) await new Promise<void>((r) => waiting.push(r));
  hashing++;
  try {
    return await new Promise((res, rej) =>
      scrypt(password, salt, KEY_LEN, SCRYPT, (e, k) => (e ? rej(e) : res(k))));
  } finally {
    hashing--;
    waiting.shift()?.();
  }
}

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export function checkSignup(username: string, password: string): AuthError | null {
  if (!/^[a-z0-9_]{3,20}$/i.test(username)) return { field: "username", reason: "3 to 20 letters, digits or _" };
  if (password.length < 8) return { field: "password", reason: "At least 8 characters" };
  if (COMMON.has(password.toLowerCase())) return { field: "password", reason: "That password is too common" };
  return null;
}

export async function createUser(db: Db, username: string, password: string): Promise<User | null> {
  const name = username.toLowerCase();
  if (db.prepare("SELECT 1 FROM users WHERE username = ?").get(name)) return null;
  const salt = randomBytes(16);
  const hash = `${salt.toString("hex")}:${(await derive(password, salt)).toString("hex")}`;
  const r = db.prepare("INSERT OR IGNORE INTO users (username, password_hash, created_at) VALUES (?, ?, ?)")
    .run(name, hash, Date.now());
  return r.changes ? { id: Number(r.lastInsertRowid), username: name } : null;
}

const fails = new Map<string, number[]>();
const recent = (k: string, now: number) => (fails.get(k) ?? []).filter((t) => now - t < FAILS.windowMs);

export function rateLimited(username: string, ip: string): boolean {
  const now = Date.now();
  return recent(`u:${username.toLowerCase()}`, now).length >= FAILS.perUser || recent(`i:${ip}`, now).length >= FAILS.perIp;
}

export async function verify(db: Db, username: string, password: string, ip: string): Promise<User | null> {
  const name = username.toLowerCase();
  const row = db.prepare("SELECT id, password_hash FROM users WHERE username = ?").get(name) as
    { id: number; password_hash: string } | undefined;
  if (row) {
    const [salt, hash] = row.password_hash.split(":");
    const key = await derive(password, Buffer.from(salt, "hex"));
    if (timingSafeEqual(key, Buffer.from(hash, "hex"))) return { id: row.id, username: name };
  }
  const now = Date.now();
  for (const k of [`u:${name}`, `i:${ip}`]) fails.set(k, [...recent(k, now), now]);
  return null;
}

export function createSession(db: Db, userId: number): string {
  const token = randomBytes(32).toString("base64url");
  const now = Date.now();
  db.prepare("INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
    .run(sha256(token), userId, now, now + SESSION_MS);
  return token;
}

// Sliding expiry: every use pushes it out again.
export function sessionUser(db: Db, token: string | undefined): User | null {
  if (!token) return null;
  const h = sha256(token);
  const row = db.prepare(
    "SELECT u.id, u.username, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?",
  ).get(h) as { id: number; username: string; expires_at: number } | undefined;
  if (!row || row.expires_at < Date.now()) return null;
  db.prepare("UPDATE sessions SET expires_at = ? WHERE token_hash = ?").run(Date.now() + SESSION_MS, h);
  return { id: row.id, username: row.username };
}

export function endSession(db: Db, token: string | undefined): void {
  if (token) db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(sha256(token));
}

export const SESSION_MAX_AGE_S = SESSION_MS / 1000;

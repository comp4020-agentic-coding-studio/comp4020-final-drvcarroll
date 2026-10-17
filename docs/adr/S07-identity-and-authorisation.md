# S07. Identity and authorisation

**Status:** Accepted 2026-10-02 (8745d21, built in 82870a0).
**Serves:** S6, P9, S7, P5.

## Context

The brief requires the app to distinguish people. A player's empire must
survive sessions, devices and a next-day return (P9). Logs must tell one
person's actions from another's (S7). Crit 10 asks for who may see and who
may change what, with why.

## Options

| Option | For | Against |
|---|---|---|
| **Accounts: username and password, session cookie** | Persists across sessions and devices; one name per person in logs and on the map | A sign-up step; no recovery without email |
| Anonymous visitors (a cookie per browser) | No sign-up | Lost with the cookie; can't return from another device; one person can be many |
| OAuth or email login | Recovery | Collects data the game doesn't need; an external dependency |

## Decision

**A person is an account** (system-design.md §9): a username of 3 to 20
letters, digits or `_`, unique case-insensitively, and a password of 8+ characters not
on a common list, hashed with scrypt (N = 2¹⁴, r = 8, p = 1, 16-byte salt),
at most 2 hashes at once (`server/auth.ts`). Login sets 32 random bytes in
an `HttpOnly; SameSite=Lax` cookie (`Secure` in production); only its
SHA-256 is stored, 30-day sliding expiry. An account maps to one nation per
world (`nationOf(userId)`, `server/world.ts`). No recovery; an admin CLI can
reset a password.

**Who may see what:** the four tiers in S06, computed per nation by the
server.

**Who may change what:**
- The acting nation always comes from the session, never from the message:
  the hub binds `nationOf(user.id)` at upgrade and submits every command as
  that nation (`server/hub.ts`). A message carries no nation field to forge.
- The upgrade requires the session cookie (else close 4001, or 4002 if
  expired) and an `Origin` whose host matches, blocking cross-site socket
  hijacking (`server/app.ts`).
- Every message is shape-checked (`server/schema.ts`); `setEmpire` is
  server-issued only, so a socket can't send it.
- Every command passes `check` (`rules/commands.ts`): `SEASON_OVER`, then
  `NOT_JOINED` until joined or after elimination, then the handler. Acting
  on a region you don't hold returns `NOT_OWNER` "You don't control X";
  someone else's fleet or trade offer returns `INVALID` "Unknown fleet" or
  "Unknown offer", which does not confirm it exists. Others: `PROTECTED`,
  `NOT_AT_WAR`, `ALLIED`, `SANCTIONED`, `NOT_ADJACENT`, `TAKEN`.
- `/admin`, `/api/admin/stream` and `/api/admin/reset` return 404 to anyone
  not `admin` or in `ADMIN_USERS`, so they don't reveal they exist.
- Rate limits: 5 failed logins per username and 20 per IP per 15 min (429);
  10 commands per client per tick (`RATE_LIMIT`).

## Consequences

- A forgotten password is unrecoverable by the player.
- Login rate limits are in memory and reset on restart.
- Checked by `server/server.test.ts` "rejects wrong passwords and duplicate
  usernames, and closes 4001 without a session", "applies a repeated client
  id once, and explains every rejection" (socket `setEmpire` refused), the
  admin reset 404 test, and the logging test (`/admin` 404 for bob);
  `spec/game.test.ts` "signs up, logs in, rejects a wrong password and a
  duplicate username"; `rules/economy.test.ts` (`NOT_JOINED`). No test for:
  login 429, a foreign `Origin` refused, 4002 on an expired session,
  `NOT_OWNER` on another nation's region, cookie flags, or the common
  password list.

**Checks added 2026-10-17 (Stage H):** every gap listed above now has a test:
`rules/authorisation.test.ts`, and `server/server.test.ts` "refuses a socket
from a foreign Origin…", "is 404 on every admin route for a player",
"returns 429 after 5 bad logins…", "refuses a common password; sets a Secure
HttpOnly Lax cookie; stores only hashes".

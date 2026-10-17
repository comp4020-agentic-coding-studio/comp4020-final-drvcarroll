# S10. A hardcoded admin account

**Status:** Accepted 2026-10-17 (49677d0).
**Serves:** P9, S7, S5.

## Context

The world never stops on its own; only an admin reset clears it, and
accounts survive that (goals.md P9). Someone must be able to open `/admin`
and reset the world on a fresh deploy without first setting `ADMIN_USERS`.
The user asked for a fixed `admin` / `platypus` account. This is a
coursework server.

## Options

| Option | For | Against |
|---|---|---|
| **Boot ensures `admin` / `platypus`, hardcoded in `server/auth.ts`** | Works on any fresh database; what the user asked for | The password is in a public repo |
| `ADMIN_USERS` only (a Fly secret listing usernames) | No credential in source | Each admin must sign up first; nobody is admin until the secret is set |
| Admin password from an env secret | No credential in source | Another secret to manage; not what the user asked for |

## Decision

On boot, `ensureAdmin` creates `admin` with password `platypus` if absent,
hashed with scrypt like any other account (system-design.md §9). Sign-up
refuses the name ("That username is reserved"), so nobody else can claim it
first. `admin` is always an admin, alongside `ADMIN_USERS`.

## Consequences

- Risk: anyone who reads the repo can log in as admin. Accepted because the
  account's only powers are viewing `/admin` stats and resetting the world
  (`/api/admin/reset`). Reset closes the current world with no winner, starts
  a new one, closes sockets with 4004, and logs `{action: "reset"}`;
  accounts, empire names and colours survive (§11). It can't read
  passwords, act as a nation, or delete accounts.
- The login rate limit applies to `admin` like any username.
- Reversing this means removing `ADMIN` and `ensureAdmin`, and deleting the
  row; a new ADR would supersede this one.
- Checked by `server/server.test.ts` "has admin / platypus on a fresh
  database, reserved at sign-up" and "is 404 for others; for admin it kicks
  everyone with 4004 and empties the world, accounts kept". No test checks
  that the admin's stored hash is scrypt (not plaintext), or that a
  restart does not reset a changed admin password.

# Reading the logs

How to tell who did what in the running game, live, without touching the
UI. This is the Crit 10 demo (two people play from the URL alone while you
narrate) and what you or an agent read when the deployed app misbehaves.
Why it's built this way: [ADR S09](adr/S09-logging-and-observability.md).

## What a line says

Every user action is one JSON line on stdout (`server/log.ts`). Fly collects
stdout; nothing is written to log files.

```json
{"ts":1792206168873,"user":"alice","nation":"n_2","action":"march","target":"r_canada","result":"ok","ms":0.8}
{"ts":1792206195413,"user":"bob","nation":"n_3","action":"research","target":"voidcraft.1","result":"INSUFFICIENT","reason":"Needs 8 more Research","ms":0.55}
```

| Field | Meaning |
|---|---|
| `ts` | Server time, ms since 1970 |
| `user` | The account, from the session cookie, never from the message. This is how two people are told apart |
| `nation` | Their nation id in this world (`n_2`) |
| `action` | `signup`, `login`, `logout`, `connect`, `disconnect`, `reset`, or a game command (`join`, `build`, `march`, `declareWar`, ...) |
| `target` | What it acted on: a region (`r_canada`), nation, fleet, offer or tech |
| `result` | `ok`, or the rejection code (`NOT_OWNER`, `TAKEN`, `INSUFFICIENT`, ...) |
| `reason` | The sentence the player saw, on rejections |
| `ms` | Time to apply; present only on game commands |

Server-only lines carry no `user`: `boot`, `listen`, `idle` (the last
socket closed and the tick loop stopped, S2).

Never logged: passwords, session tokens, cookies.

## 1. The live view: `/admin`

1. Open the deployed site in your own browser (not one of your pod's
   profiles) and log in as `admin` / `platypus`.
2. Go to `https://comp4020-final-drvcarroll.fly.dev/admin`. Anyone else gets
   a 404.
3. It refreshes every second over one SSE stream:
   - **Header:** players online, sockets, commands per minute, tick p50/p99
     and memory. Two people in separate Chrome profiles show as two names
     under **Online** and at least two sockets.
   - **Rejections by reason:** a running count by code. A spike of
     `NOT_OWNER` means someone is trying to act on another's region;
     `TAKEN` means two people went for the same thing.
   - **Recent actions:** the last 30 lines as a table: time, user, action,
     target, result with its reason, ms.

The admin account watches without joining the world, so it never counts as
a player. Don't press **Reset world** during the demo: it ends the world
for everyone (accounts survive).

## 2. The raw stream: `flyctl logs`

In a terminal in the repo:

```sh
mise exec -- flyctl logs -a comp4020-final-drvcarroll
```

That tails everything, with Fly's prefix on each line. To read only the JSON,
filtered:

```sh
# every user action, as "time user action target result"
mise exec -- flyctl logs -a comp4020-final-drvcarroll | grep --line-buffered -o '{.*}' \
  | jq --unbuffered -r 'select(.user) | "\(.ts/1000|strftime("%H:%M:%S")) \(.user) \(.action) \(.target // "") \(.result) \(.reason // "")"'

# one person only
... | jq --unbuffered -r 'select(.user == "alice") | ...'

# only rejections: what the world refused, and why
... | jq --unbuffered -r 'select(.result != "ok" and .user) | "\(.user) \(.action) \(.target // "") \(.result): \(.reason)"'

# recent history without tailing
mise exec -- flyctl logs -a comp4020-final-drvcarroll --no-tail | grep -o '{.*}' | jq -c 'select(.user)'
```

## 3. Narrating the demo

1. Before the crit: deploy, open `/admin` on your screen and the `flyctl
   logs` filter in a terminal beside it. Have your pod open the URL in two
   separate Chrome profiles (or one incognito window).
2. As they sign up: two `signup` lines with their usernames, then `connect`.
   "Two people, two accounts, told apart by the session cookie."
3. As they join: `join` with the region each picked. If both pick the same
   region in the same half second, one gets `ok` and the other `TAKEN`
   "US West was claimed this tick": one writer applies commands in arrival
   order ([ADR S03](adr/S03-contention-and-ordering.md)).
4. As they play: read off `build`, `train`, `march` with targets. "Alice is
   building a Mine in Canada; Bob is researching Thrust Vectoring."
5. If one tries to act on the other's region, it's a `NOT_OWNER` line with
   "You don't control Canada": the server checks every command against the
   nation the cookie belongs to ([ADR S07](adr/S07-identity-and-authorisation.md)).
6. They close their tabs: `disconnect` each, then `idle`. Come back tomorrow
   and the world has kept going (stages advance with nobody connected).

## 4. When something's wrong

Paste the lines around the failure into the agent, not a description of the
symptom: `flyctl logs --no-tail | grep -o '{.*}' | jq -c 'select(.ts > <ms>)'`.
The same history is durable in the `commands` table of the SQLite database
on the volume, so a replay reproduces any world exactly (S5).

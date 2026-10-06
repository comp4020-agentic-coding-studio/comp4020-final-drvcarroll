# Solar system empire game

A real-time multiplayer strategy game set across our solar system. You start with a foothold on Earth and grow an empire however you like, whether that's as a conqueror, a trader, a builder, a researcher or some mix of all four. Everyone plays in the same shared system at the same time, and your empire is still there when you come back.

## What good means

The core idea is growth. Growth is measured three ways: **Territory**, **Economy** and **Tech**, and each one on its own should be enough to win. Military and trade are tools for getting there, never scores in themselves, and a feature only makes it into the game if it grows one of the three.

For this to be good, it has to be good to play and built well enough to stay that way on one small server. Here's what that means for players:

- **Easy to start.** A stranger should go from sign-up to playing in under a minute, with no instructions needed. If the game rejects something you try, it tells you why.
- **Every path is a real path.** Expanding, building, trading and researching should all be viable ways to win, so no single mechanic is the game.
- **Distance and time actually matter.** Fleets travel along real orbital transfer windows, so launching at the wrong time costs more, and a fleet six minutes out is a genuine threat.
- **The frontier is real.** You only see what you hold or have paid an Envoy to watch. Everywhere else is blank, same as unclaimed space, so what you know about your rivals is earned.
- **It plays like a game, not a web app.** The full-screen solar system is the main screen, and you zoom and drag around it like Google Maps. You click a planet, region or fleet and its actions appear beside it, with a thin HUD over the top instead of pages of forms.
- **It works everywhere and never loses progress.** Desktop and phone, keyboard or touch, and reconnecting picks up exactly where you left off.

And for the system behind it:

- **Real-time.** A move shows up for everyone else well within a second.
- **Lean.** It runs on a single small Fly machine and does no work at all when nobody's connected.
- **Every move is stored, in order.** The game state can be rebuilt exactly by replaying the log, so restarts and redeploys never lose anything.
- **Fair.** No player ever receives data they haven't earned, which is what keeps the fog of war honest.

The full list, with a target and a check for each goal, lives in [docs/goals.md](docs/goals.md). Some goals are enforced by tests that run on every push, some by headless simulations of thousands of bot games, and the rest are judged by hand at each crit.

## What I looked at

- **Stellaris** for the feel: the map is the screen, and panels appear for whatever you've selected.
- **Google Maps** for navigation, since zooming from the whole solar system down to a planet's surface should feel that natural.
- **Hohmann transfer orbits** so that travel between planets follows real launch windows rather than a flat timer.
- **Lanchester's laws** for combat, so bigger fleets win disproportionately and picking your fights matters.
- **Diplomacy** for the idea that trade and alliances between players matter as much as fighting.
- The final project brief's notes on good, which pushed me towards something a handful of friends could play together in one shared world.

## How it was built

See [PROCESS.md](PROCESS.md) for how the goals, design docs and build harness came together, and `docs/` for the full game and system design.

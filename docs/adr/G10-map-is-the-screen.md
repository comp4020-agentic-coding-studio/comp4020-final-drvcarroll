# G10. The map is the main screen

**Status:** Accepted (604d19c; built in ed41d5a; icons and HUD revision in
89b4079; command console look in 8a964fa).
**Serves:** P10, P1, P2, P7.

## Context

The first client was a set of DOM panels with dropdown menus per planet
(8b7f4ae). It worked, but it read as a web app over a simulation. PROCESS.md
records the correction before Crit 8: the interactive solar system became
the main interface, written into all three design docs so later sessions
would not drift back. Crit 8 feedback then asked for a less cluttered HUD
and clearer instructions.

## Options

| Option | For | Against |
|---|---|---|
| Forms and dropdowns per body | Quick to build; easy to test | A headless sim with a UI; no spectacle; hides the theatre (G02) |
| Map plus tabbed dashboard panels | Familiar web layout | Widgets compete with the map; tabs hide contents |
| **Full-screen map, Stellaris-like, actions beside the selection** | Plays like a game; the solar system is always in view | Harder to build, test and fit to P8 and P7 |

## Decision

The full-screen 3D solar system is the screen. It zooms from the whole
system to a region and pans like Google Maps. Clicking a body, region or
fleet opens its actions beside it, with no tabs. The HUD is a thin gunmetal
command console: resource icons with per-day gains, an Empire menu of three
dropdowns (Territory, Military, Research), an Empires overlay, a news
ticker. Resources and buildings are named SVG icons, never letters. War
shows on the map: army counts, battle swords, draining bars.

The author's reasoning: it follows from G02, and it should feel like a game
and a visual spectacle rather than a headless sim, which is far more
engaging.

## Consequences

The canvas needs a DOM mirror so keyboard and screen-reader users reach
every action (P7), and spectacle must fit P8's budgets. Checks in
`e2e/client.test.ts`: the map fills the viewport; wheel, drag and keys move
the camera; the core loop completes by map clicks at 1920x1080 and 390x844;
resources are named by icon, never letter; three dropdowns; a battle drains
live. Frame rate is judged in `docs/checks.md`; a stranger finding the core
loop is judged at each crit.

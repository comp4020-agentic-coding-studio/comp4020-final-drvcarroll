// system-design.md §10: server-rendered pages. Forms work without JavaScript.
import { EMPIRE } from "../rules/data/index.ts";

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function page(title: string, body: string, head = ""): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<link rel="stylesheet" href="/static/site.css">
${head}
</head>
<body>
${body}
</body>
</html>`;
}

const error = (msg?: string) => (msg ? `<p class="error" role="alert">${esc(msg)}</p>` : "");

export function loginPage(msg?: string): string {
  const form = (action: string, label: string, auto: string) => `
<form method="post" action="${action}">
  <h2>${label}</h2>
  <label>Username <input name="username" required minlength="3" maxlength="20" autocomplete="username"></label>
  <label>Password <input name="password" type="password" required minlength="8" autocomplete="${auto}"></label>
  <button>${label}</button>
</form>`;
  return page("Grow", `
<main class="narrow">
  <h1>Grow</h1>
  <p>Build an empire across the solar system: Territory, Economy, Tech.</p>
  ${error(msg)}
  ${form("/api/login", "Sign in", "current-password")}
  ${form("/api/signup", "Create account", "new-password")}
  <p><a href="/readme/">About this game</a></p>
</main>`);
}

export function empirePage(e?: { name: string; primary: string; secondary: string }, msg?: string): string {
  const v = e ?? { name: "", primary: EMPIRE.presets[0], secondary: "#ffffff" };
  const swatches = EMPIRE.presets.map((c) => `<option value="${c}">`).join("");
  return page("Your empire", `
<main class="narrow">
  <h1>Your empire</h1>
  ${error(msg)}
  <form method="post" action="/api/empire">
    <label>Name <input name="name" required minlength="${EMPIRE.nameMin}" maxlength="${EMPIRE.nameMax}" value="${esc(v.name)}"></label>
    <label>Primary colour <input name="primary" type="color" list="presets" value="${esc(v.primary)}"></label>
    <label>Secondary colour <input name="secondary" type="color" list="presets" value="${esc(v.secondary)}"></label>
    <datalist id="presets">${swatches}</datalist>
    <button>Save</button>
  </form>
</main>`);
}

export function shellPage(username: string): string {
  return page("Grow", `
<header class="bar">
  <strong>Grow</strong>
  <span>${esc(username)}</span>
  <a href="/empire">Empire</a>
  <form method="post" action="/api/logout"><button>Sign out</button></form>
</header>
<main id="app"><p>Connecting…</p></main>`, `<script type="module" src="/static/client.js"></script>`);
}

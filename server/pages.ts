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
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 16 16%22%3E%3Ccircle cx=%228%22 cy=%228%22 r=%227%22 fill=%22%235cc8ff%22/%3E%3C/svg%3E">
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

export function shellPage(username: string, assets: { js: string; css: string[] } | null): string {
  const head = assets
    ? [...assets.css.map((h) => `<link rel="stylesheet" href="${h}">`), `<script type="module" src="${assets.js}"></script>`].join("\n")
    : "";
  const fonts = ["rajdhani-600", "share-tech-mono"].map((f) => `<link rel="preload" href="/static/fonts/${f}.woff2" as="font" type="font/woff2" crossorigin>`).join("");
  return page("Grow", `
<div id="app" data-user="${esc(username)}">
  <p class="narrow">${assets ? "Connecting…" : "The client isn't built: run <code>pnpm build</code>."}</p>
</div>`, fonts + head);
}

// system-design.md §11: the live view. Plain HTML fed by one SSE stream.
export function adminPage(): string {
  return page("Grow · admin", `
<main class="admin">
  <h1>Live</h1>
  <p id="head">Connecting…</p>
  <div class="cols">
    <section><h2>Online</h2><ul id="online"></ul></section>
    <section><h2>Rejections by reason</h2><ul id="rejections"></ul></section>
  </div>
  <h2>Recent actions</h2>
  <table><thead><tr><th>Time</th><th>User</th><th>Action</th><th>Target</th><th>Result</th><th>ms</th></tr></thead><tbody id="recent"></tbody></table>
</main>
<script>
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  new EventSource("/api/admin/stream").onmessage = (e) => {
    const s = JSON.parse(e.data);
    $("head").textContent = s.online.length + " online · " + s.sockets + " sockets · " + s.commandsPerMin + " commands/min · tick p50 "
      + s.tickMs.p50 + " ms, p99 " + s.tickMs.p99 + " ms · " + s.rssMb + " MB RSS";
    $("online").innerHTML = s.online.map((n) => "<li>" + esc(n) + "</li>").join("") || "<li>nobody</li>";
    $("rejections").innerHTML = Object.entries(s.rejections).map(([k, v]) => "<li>" + esc(k) + ": " + v + "</li>").join("") || "<li>none</li>";
    $("recent").innerHTML = s.recent.map((l) => "<tr><td>" + new Date(l.ts).toLocaleTimeString() + "</td><td>" + esc(l.user) + "</td><td>"
      + esc(l.action) + "</td><td>" + esc(l.target) + "</td><td>" + esc(l.result) + (l.reason ? " (" + esc(l.reason) + ")" : "") + "</td><td>"
      + (l.ms ?? "") + "</td></tr>").join("");
  };
</script>`);
}

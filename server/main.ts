// Entry point: node server/main.ts. Fly sends SIGTERM before stopping.
import { start } from "./app.ts";

const app = await start({
  port: Number(process.env.PORT ?? 8080),
  dataDir: process.env.DATA_DIR ?? "./data",
  build: process.env.BUILD_ID ?? "dev",
  secureCookies: process.env.NODE_ENV === "production",
});
console.log(JSON.stringify({ ts: Date.now(), action: "listen", port: app.port }));

for (const sig of ["SIGTERM", "SIGINT"] as const) {
  process.once(sig, async () => {
    await app.close();
    process.exit(0);
  });
}

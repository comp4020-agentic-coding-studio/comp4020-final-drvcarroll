import { defineConfig } from "vitest/config";

// spec/ runs against the running app, which spec/global-setup.ts finds.
// rules/, server/ (boots its own) and sim/ need no app; sim/ is slow, so only `pnpm sim:test` runs it.
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "spec",
          include: ["spec/**/*.test.ts"],
          globalSetup: ["./spec/global-setup.ts"],
        },
      },
      { test: { name: "rules", include: ["rules/**/*.test.ts"] } },
      { test: { name: "server", include: ["server/**/*.test.ts"] } },
      { test: { name: "sim", include: ["sim/**/*.test.ts"] } },
    ],
  },
});

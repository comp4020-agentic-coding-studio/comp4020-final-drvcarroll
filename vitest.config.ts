import { defineConfig } from "vitest/config";

// spec/ runs against the running app, which spec/global-setup.ts finds.
// rules/ tests are pure and need no app.
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
    ],
  },
});

// Canary config: Chromium only, baselines in tests/canary/baseline/ (no OS suffix, CI keeps them, never git).
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: "canary.spec.mjs",
  snapshotPathTemplate: "{testDir}/baseline/{arg}{ext}",
  reporter: "list",
  retries: 1,
  use: { browserName: "chromium" },
});

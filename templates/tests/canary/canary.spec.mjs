// Post-deploy canary (L112): loads the live site's main pages and fails on a non-200 response, a console
// error, or a screenshot that drifted from the last passing run (baseline kept by .github/workflows/canary.yml).
//   CANARY_URL=https://your-site npx playwright test -c tests/canary/playwright.config.mjs --update-snapshots=missing
// CANARY_PAGES (comma list) and CANARY_MAX_DIFF (share of pixels allowed to differ) override the defaults.
import { test, expect } from "@playwright/test";

const BASE = process.env.CANARY_URL;
const PAGES = (process.env.CANARY_PAGES || "{{CANARY_PAGES}}").split(",").map((p) => p.trim()).filter(Boolean);
const MAX_DIFF = Number(process.env.CANARY_MAX_DIFF || "0.02");

test.beforeAll(() => {
  if (!BASE) throw new Error("set CANARY_URL to the deployed site");
});

for (const path of PAGES) {
  test(`page ${path}`, async ({ page }) => {
    const errors = [];
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    page.on("pageerror", (e) => errors.push(e.message));
    const res = await page.goto(new URL(path, BASE).href, { waitUntil: "networkidle" });
    expect(res?.status(), `${path} status`).toBe(200);
    expect(errors, `${path} console errors`).toEqual([]);
    const name = path.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "home";
    await expect(page).toHaveScreenshot(`${name}.png`, { fullPage: true, maxDiffPixelRatio: MAX_DIFF, animations: "disabled" });
  });
}

// The one flow users must be able to finish (sign in and open the main screen, place an order, ...).
// Fill it in during stage 6; until then the canary reports it as fixme, never as a pass (L112).
test.fixme("core flow", async () => {});

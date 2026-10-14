// node --test scripts/launch.test.mjs
// The launch catalog is valid owner-steps, and render.mjs picks items by the answers into docs/LAUNCH.md.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { validateSteps, lintMarkdown } from "./owner-steps.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const example = join(here, "../templates/answers.example.json");
const catalog = JSON.parse(readFileSync(join(here, "../templates/launch/items.json"), "utf8"));
const ALWAYS = ["owner-account", "billing-caps", "domain-dns", "monitoring", "legal-minimum", "pilot-list"];
const EXTRA = ["oauth-consent", "payments-account", "ai-key-cap", "vm-ingress"];
const NOT_VERIFIED = "_Click paths not yet verified against the provider's current UI; check its docs if a menu differs._";

// Renders into a fresh dir with the example answers plus overrides; returns { dir, r, launch }.
function renderWith(overrides = {}) {
  const dir = mkdtempSync(join(tmpdir(), "launch-"));
  const answers = join(dir, "answers.json");
  writeFileSync(answers, JSON.stringify({ ...JSON.parse(readFileSync(example, "utf8")), ...overrides }));
  const r = spawnSync(process.execPath, [join(here, "render.mjs"), dir, answers], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  return { dir, r, launch: readFileSync(join(dir, "docs/LAUNCH.md"), "utf8") };
}
const has = (text, id) => text.includes(`(\`${id}\`,`);

test("every catalog item is valid: steps, unique id, known when, minutes, unverified", () => {
  const ids = new Set();
  for (const i of catalog) {
    assert.deepEqual(validateSteps(i.steps), [], i.id);
    assert.ok(i.steps.length >= 1 && i.steps.length <= 4, `${i.id}: 1-4 steps`);
    assert.ok(!ids.has(i.id), `duplicate id ${i.id}`);
    ids.add(i.id);
    assert.ok(["always", "email", "oauth", "payments", "ai", "vm"].includes(i.when), `${i.id}: when`);
    assert.ok(i.minutes > 0, `${i.id}: minutes`);
    assert.equal(i.verified, false, `${i.id}: verified`);
  }
  for (const id of [...ALWAYS, "smtp", ...EXTRA]) assert.ok(ids.has(id), `${id} missing`);
});

test("example answers: always items and smtp only, no placeholder, not-verified note", () => {
  const { dir, launch } = renderWith();
  for (const id of [...ALWAYS, "smtp"]) assert.ok(has(launch, id), `${id} missing`);
  for (const id of EXTRA) assert.ok(!has(launch, id), `${id} should not render`);
  assert.doesNotMatch(launch, /\{\{/);
  assert.ok(launch.includes(NOT_VERIFIED));
  assert.match(launch, /^## \[ \] Custom SMTP for auth mail \(`smtp`, ~30 min\)$/m);
  rmSync(dir, { recursive: true, force: true });
});

test("oauth, payments, ai and vm answers add their items", () => {
  const { dir, launch } = renderWith({ oauthProviders: ["google"], payments: true, aiProvider: "openai", deployTarget: "vm" });
  for (const id of [...ALWAYS, "smtp", ...EXTRA]) assert.ok(has(launch, id), `${id} missing`);
  rmSync(dir, { recursive: true, force: true });
});

test("missing answer keys select nothing optional", () => {
  const { dir, launch } = renderWith({ smtpProvider: undefined, oauthProviders: undefined, payments: undefined, aiProvider: undefined, deployTarget: undefined });
  for (const id of ALWAYS) assert.ok(has(launch, id), `${id} missing`);
  for (const id of ["smtp", ...EXTRA]) assert.ok(!has(launch, id), `${id} should not render`);
  rmSync(dir, { recursive: true, force: true });
});

test("rendered launch steps pass the owner-steps lint", () => {
  const { dir, launch } = renderWith({ oauthProviders: ["google"], payments: true, aiProvider: "openai", deployTarget: "vm" });
  // Item headings are demoted so the whole file is one "What you need to do" section.
  assert.deepEqual(lintMarkdown(`## What you need to do\n\n${launch.replace(/^## /gm, "### ")}`), []);
  rmSync(dir, { recursive: true, force: true });
});

test("a full render passes preflight --strict", () => {
  const { dir } = renderWith();
  const p = spawnSync(process.execPath, [join(here, "preflight.mjs"), dir, "--strict"], { encoding: "utf8" });
  assert.equal(p.status, 0, p.stdout + p.stderr);
  assert.match(p.stdout, /STAGE 0 INTAKE: READY/);
  rmSync(dir, { recursive: true, force: true });
});

// node --test scripts/env-tiers.test.mjs
// Environment tiers rendered from answers into docs/ENV_MATRIX.md, the derived tiers for old answer files,
// per-key tier overrides, and the LF guarantee for shell and CI files.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const example = JSON.parse(readFileSync(join(here, "../templates/answers.example.json"), "utf8"));

// Renders `answers` into a fresh temp dir, hands the dir to `check`, then removes it.
function withRender(answers, check, ...extra) {
  const dir = mkdtempSync(join(tmpdir(), "env-tiers-"));
  try {
    const file = join(dir, "answers.json");
    writeFileSync(file, JSON.stringify(answers));
    const r = spawnSync(process.execPath, [join(here, "render.mjs"), join(dir, "out"), file, ...extra], { encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    check(join(dir, "out"), r);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
const matrix = (out) => readFileSync(join(out, "docs/ENV_MATRIX.md"), "utf8").replace(/\r\n/g, "\n");

test("example answers render one row per tier and name the tiers in the env header", () => {
  withRender(example, (out, r) => {
    const m = matrix(out);
    assert.doesNotMatch(r.stdout, /unfilled/);
    assert.doesNotMatch(m, /\{\{/);
    assert.match(m, /^\| Tier \| Web host \| Branch \| Database \| API origin \| Auth redirects \| Real users \| Disposable \|$/m);
    assert.match(m, /^\| KEY \| Purpose \| Local \| Preview \| Test \| Prod \| Secret\? \|\r?\n\|---\|---\|---\|---\|---\|---\|---\|$/m);
    assert.match(m, /^\| Local \| http:\/\/localhost:5173 \| - \| local \| http:\/\/localhost:8000 \| http:\/\/localhost:5173\/\*\* \| no \| yes \|$/m);
    assert.match(m, /^\| Test \| - \| - \| tttttttttttttttttttt \| - \| - \| no \| yes \|$/m);
    assert.match(m, /^\| Prod \| https:\/\/crm\.example\.com \| main \| abcdefghijklmnopqrst \| .* \| yes \| no \|$/m);
    for (const t of example.environments) assert.equal(m.match(new RegExp(`^\\| ${t.name} \\|`, "gm")).length, 1, t.name);
    assert.match(m, /^\| SUPABASE_SERVICE_ROLE_KEY \| admin path only \| yes \| no \| yes \| yes \| yes \|$/m);
  }, "--stage", "4");
});

test("answers without environments derive Dev / Preview / Test / Prod", () => {
  const legacy = structuredClone(example);
  delete legacy.environments;
  withRender(legacy, (out) => {
    const m = matrix(out);
    assert.doesNotMatch(m, /\{\{/);
    assert.match(m, /^\| Dev \| http:\/\/localhost:5173 \| - \| local \| - \| http:\/\/localhost:5173\/\*\* \| no \| yes \|$/m);
    assert.match(m, /^\| Preview \| https:\/\/\*-example\.vercel\.app \| non-main \| tttttttttttttttttttt \| - \| https:\/\/\*-example\.vercel\.app\/\*\* \| no \| no \|$/m);
    assert.match(m, /^\| Test \| - \| - \| tttttttttttttttttttt \| - \| - \| no \| yes \|$/m);
    assert.match(m, /^\| Prod \| https:\/\/crm\.example\.com \| main \| abcdefghijklmnopqrst \| - \| https:\/\/crm\.example\.com\/\*\* \| yes \| no \|$/m);
    assert.match(m, /^\| KEY \| Purpose \| Dev \| Preview \| Test \| Prod \| Secret\? \|$/m);
    assert.match(m, /^\| PORT \| api port \| yes \| n\/a \| yes \| n\/a \| no \|$/m);
  }, "--stage", "4");
});

test("a per-key tiers override lands in that tier's column", () => {
  const answers = structuredClone(example);
  answers.environments = [{ name: "Local" }, { name: "Beta", realUsers: true }];
  answers.env = [{ key: "X", purpose: "p", tiers: { Beta: "no" } }];
  withRender(answers, (out) => {
    const m = matrix(out);
    assert.match(m, /^\| KEY \| Purpose \| Local \| Beta \| Secret\? \|$/m);
    assert.match(m, /^\| X \| p \| yes \| no \| no \|$/m);
    assert.match(m, /^\| Beta \| - \| - \| - \| - \| - \| yes \| no \|$/m);
  }, "--stage", "4");
});

test(".gitattributes is rendered and shell / CI files are written LF", () => {
  withRender(example, (out) => {
    assert.match(readFileSync(join(out, ".gitattributes"), "utf8"), /^\*\.sh text eol=lf$/m);
    for (const f of ["scripts/worktree-setup.sh", ".github/workflows/gates.yml", ".github/workflows/keepalive.yml"]) {
      assert.doesNotMatch(readFileSync(join(out, f), "utf8"), /\r/, `${f} has CR`);
    }
  }, "--stage", "5");
});

test("a tier named in capitals (CI) is not read as an env key by preflight", () => {
  const answers = { ...example, environments: [...example.environments, { name: "CI", db: "-", disposable: true }] };
  withRender(answers, (out) => {
    const r = spawnSync(process.execPath, [join(here, "preflight.mjs"), out], { encoding: "utf8" });
    assert.match(matrix(out), /^\| CI \|/m);
    assert.doesNotMatch(r.stdout, /CHECK env: .*key CI /);
  });
});

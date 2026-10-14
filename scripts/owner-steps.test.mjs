// node --test scripts/owner-steps.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { validateSteps, formatSteps, lintMarkdown } from "./owner-steps.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const run = (args) =>
  spawnSync(process.execPath, [join(here, "owner-steps.mjs"), ...args], { encoding: "utf8" });

const exampleSteps = [
  {
    place: "Supabase dashboard → Authentication → Emails → SMTP Settings",
    action: "Turn on custom SMTP and paste the sender address",
    value: "no-reply@example.com",
    expect: "The SMTP section shows Enabled",
    irreversible: false,
  },
];

test("formatSteps renders heading, fields, value block, and irreversible line", () => {
  const md = formatSteps(exampleSteps);
  assert.match(md, /^## What you need to do\n\n/);
  assert.match(md, /1\. \*\*Where:\*\* Supabase dashboard/);
  assert.match(md, /\*\*Do:\*\* Turn on custom SMTP/);
  assert.match(md, /```\n   no-reply@example\.com\n   ```/);
  assert.match(md, /\*\*You should see:\*\* The SMTP section shows Enabled/);
  assert.doesNotMatch(md, /Can't be undone/);

  const noValue = formatSteps([{ place: "App console", action: "Click Save", expect: "Saved toast" }]);
  assert.doesNotMatch(noValue, /```/);

  const ir = formatSteps([{ place: "Billing", action: "Delete project", expect: "Gone", irreversible: true }]);
  assert.match(ir, /\*\*Can't be undone\.\*\*/);

  assert.equal(formatSteps(exampleSteps, { heading: null }).startsWith("1."), true);
});

test("validateSteps reports structural and vague-phrase errors", () => {
  assert.deepEqual(validateSteps([]), ["steps must not be empty"]);
  assert.deepEqual(validateSteps("x"), ["steps must be an array"]);
  assert.ok(validateSteps([{ action: "x", expect: "y" }]).some((e) => e.includes("missing place")));
  assert.ok(validateSteps([{ place: "p", action: "a" }]).some((e) => e.includes("missing expect")));
  assert.ok(
    validateSteps([{ place: "p", action: "see the previous message", expect: "ok" }]).some((e) =>
      e.includes("refers to an earlier message"),
    ),
  );
});

test("formatSteps throws when validation fails", () => {
  assert.throws(() => formatSteps([]), /must not be empty/);
});

test("lintMarkdown accepts good sections and rejects common failures", () => {
  const good = `## What you need to do

1. **Where:** Console
   **Do:** Click Save
   **You should see:** A green checkmark
`;
  assert.deepEqual(lintMarkdown(good), []);

  const he = `## מה אתה צריך לעשות

1. **Where:** Console
   **Do:** לחץ על שמירה
   **You should see:** תראה success
`;
  assert.deepEqual(lintMarkdown(he), []);

  assert.ok(lintMarkdown("# Other\n\nno section").some((e) => e.includes('no "What you need to do" section')));

  const noExpect = `## What you need to do

1. **Where:** Console
   **Do:** Click Save only
`;
  assert.ok(lintMarkdown(noExpect).some((e) => e.match(/step 1: missing expected result/)));

  const vague = `## What you need to do

1. **Where:** Console
   **Do:** Same as before
   **You should see:** Done
`;
  assert.ok(lintMarkdown(vague).some((e) => e.match(/step 1: refers to an earlier message/)));
});

test("CLI: JSON to markdown, validation exit 1, lint good and bad files", () => {
  const dir = mkdtempSync(join(tmpdir(), "owner-steps-"));
  const goodJson = join(dir, "good.json");
  const badJson = join(dir, "bad.json");
  const goodMd = join(dir, "good.md");
  const badMd = join(dir, "bad.md");

  writeFileSync(goodJson, JSON.stringify({ title: "t", steps: exampleSteps }));
  writeFileSync(badJson, JSON.stringify({ steps: [{ place: "p", action: "a" }] }));
  writeFileSync(
    goodMd,
    `## What you need to do

1. **Where:** X
   **Do:** Z
   **You should see:** Y
`,
  );
  writeFileSync(badMd, `## What you need to do\n\n1. **Do:** see the previous message\n`);

  const ok = run([goodJson]);
  assert.equal(ok.status, 0);
  assert.match(ok.stdout, /\*\*You should see:\*\*/);

  const bad = run([badJson]);
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /missing expect/);

  const lintOk = run(["--lint", goodMd]);
  assert.equal(lintOk.status, 0);
  assert.equal(lintOk.stdout.trim(), "ok");

  const lintBad = run(["--lint", badMd]);
  assert.equal(lintBad.status, 1);
  assert.ok(lintBad.stderr.length > 0);

  assert.equal(run([]).status, 1);
  rmSync(dir, { recursive: true, force: true });
});

test("a multi-line value stays inside its code block, and a value holding ``` gets a longer fence", () => {
  const md = formatSteps([{ place: "Terminal", action: "Run these", value: "line one\nline two", expect: "Both run" }]);
  assert.match(md, /   ```\n   line one\n   line two\n   ```/);
  const fenced = formatSteps([{ place: "Docs", action: "Paste", value: "```js\nx\n```", expect: "Pasted" }]);
  assert.match(fenced, /   ````\n   ```js\n   x\n   ```\n   ````/);
});

test("lintMarkdown requires a filled place, action and expected result", () => {
  const sec = (body) => `## What you need to do\n\n${body}\n`;
  assert.ok(lintMarkdown(sec("1. **You should see:** Saved")).includes("step 1: missing action"));
  assert.ok(lintMarkdown(sec("1. **Where:** Console\n   **You should see:** Saved")).includes("step 1: missing action"));
  assert.ok(lintMarkdown(sec("1. **Where:** Console\n   **Do:**\n   **You should see:** Saved")).includes("step 1: empty action"));
  assert.ok(lintMarkdown(sec("1. **Where:**\n   **Do:** Save\n   **You should see:** Saved")).includes("step 1: empty place"));
  assert.ok(lintMarkdown(sec("1. **Where:** Console\n   **Do:** Save\n   **You should see:**")).includes("step 1: empty expected result"));
  assert.ok(lintMarkdown(sec("1. **Do:** Click Save\n   **You should see:** Saved")).includes("step 1: missing place"));
  const emptyDo = lintMarkdown(sec("1. **Do:**\n   **You should see:** Saved"));
  assert.ok(emptyDo.includes("step 1: missing place") && emptyDo.includes("step 1: empty action"), emptyDo.join("; "));
  const prose = lintMarkdown(sec("1. Open the console and press Save.\n   You should see: a green check."));
  assert.ok(prose.includes("step 1: missing place") && prose.includes("step 1: missing action"), "prose steps are rejected");
  assert.deepEqual(lintMarkdown(`## מה אתה צריך לעשות\n\n1. **איפה:** לוח הבקרה\n   **מה לעשות:** לחץ על שמירה\n   **מה תראה:** סימן ירוק\n`), [], "Hebrew labels pass");
});

test("references/owner-steps.md documents exactly what the script accepts and prints", () => {
  const doc = readFileSync(join(here, "../references/owner-steps.md"), "utf8").replace(/\r\n/g, "\n");
  const json = doc.match(/```json\n([\s\S]*?)\n```/)[1];
  const shown = doc.match(/````markdown\n([\s\S]*?)````/)[1];
  const steps = JSON.parse(json);
  assert.deepEqual(validateSteps(steps), []);
  assert.equal(formatSteps(steps), shown);
  assert.deepEqual(lintMarkdown(shown), []);
});

#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const VAGUE = [
  "previous message", "earlier message", "see above", "as above",
  "as before", "same as before", "last message",
];
const VAGUE_RE = new RegExp(VAGUE.join("|"), "i");
const SECTION_HEADINGS = ["## What you need to do", "## מה אתה צריך לעשות"];
const EXPECT_MARKERS = ["You should see", "Expected:", "תראה"];

const nonEmpty = (v) => typeof v === "string" && v.trim() !== "";

function vagueField(step, n, field, text, errors) {
  if (VAGUE_RE.test(text)) errors.push(`step ${n}: ${field} refers to an earlier message`);
}

export function validateSteps(steps) {
  const errors = [];
  if (!Array.isArray(steps)) return ["steps must be an array"];
  if (steps.length === 0) return ["steps must not be empty"];
  steps.forEach((step, i) => {
    const n = i + 1;
    if (!nonEmpty(step?.place)) errors.push(`step ${n}: missing place`);
    if (!nonEmpty(step?.action)) errors.push(`step ${n}: missing action`);
    if (!nonEmpty(step?.expect)) errors.push(`step ${n}: missing expect`);
    if (step?.value !== undefined && step.value !== null && typeof step.value !== "string") {
      errors.push(`step ${n}: value must be a string`);
    }
    for (const [field, text] of [
      ["place", step?.place], ["action", step?.action], ["expect", step?.expect], ["value", step?.value],
    ]) {
      if (typeof text === "string" && text.trim()) vagueField(step, n, field, text, errors);
    }
  });
  return errors;
}

export function formatSteps(steps, { heading = "## What you need to do" } = {}) {
  const errors = validateSteps(steps);
  if (errors.length) throw new Error(errors.join("\n"));
  const lines = [];
  if (heading != null) lines.push(heading, "");
  steps.forEach((step, i) => {
    lines.push(`${i + 1}. **Where:** ${step.place}`);
    lines.push(`   **Do:** ${step.action}`);
    if (nonEmpty(step.value)) {
      // Every line of the value sits inside the block; a longer fence is used if the value holds ```.
      const fence = step.value.includes("```") ? "````" : "```";
      lines.push(`   ${fence}`, ...step.value.split(/\r?\n/).map((l) => `   ${l}`), `   ${fence}`);
    }
    lines.push(`   **You should see:** ${step.expect}`);
    if (step.irreversible) lines.push("   **Can't be undone.**");
  });
  return lines.join("\n") + "\n";
}

function extractSection(text) {
  for (const h of SECTION_HEADINGS) {
    const start = text.indexOf(h);
    if (start === -1) continue;
    const bodyStart = start + h.length;
    const rest = text.slice(bodyStart);
    const next = rest.search(/\n## /);
    return rest.slice(0, next === -1 ? undefined : next);
  }
  return null;
}

function parseMarkdownSteps(section) {
  const steps = [];
  let cur = null;
  for (const line of section.split("\n")) {
    const m = line.match(/^(\d+)\.\s/);
    if (m) {
      if (cur) steps.push(cur);
      cur = { num: Number(m[1]), text: line };
    } else if (cur && (line.startsWith(" ") || line.startsWith("\t") || line.trim() === "")) {
      cur.text += `\n${line}`;
    } else if (cur && line.trim()) {
      cur.text += `\n${line}`;
    }
  }
  if (cur) steps.push(cur);
  return steps;
}

export function lintMarkdown(text) {
  const section = extractSection(text);
  if (section === null) return ['no "What you need to do" section'];
  const steps = parseMarkdownSteps(section);
  const errors = [];
  if (steps.length === 0) errors.push("no numbered steps in section");
  for (const { num, text } of steps) {
    if (!EXPECT_MARKERS.some((m) => text.includes(m))) {
      errors.push(`step ${num}: missing expected result`);
    }
    for (const line of text.split("\n")) {
      if (VAGUE_RE.test(line)) errors.push(`step ${num}: refers to an earlier message`);
    }
  }
  return errors;
}

function loadStepsJson(path) {
  const data = JSON.parse(readFileSync(path, "utf8"));
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.steps)) return data.steps;
  throw new Error("JSON must be a steps array or an object with a steps array");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args[0] === "--lint" && args[1]) {
    const errors = lintMarkdown(readFileSync(resolve(args[1]), "utf8"));
    if (errors.length) {
      for (const e of errors) console.error(e);
      process.exit(1);
    }
    console.log("ok");
    process.exit(0);
  }
  if (args.length === 1 && args[0] !== "--lint") {
    try {
      const steps = loadStepsJson(resolve(args[0]));
      const errors = validateSteps(steps);
      if (errors.length) {
        for (const e of errors) console.error(e);
        process.exit(1);
      }
      process.stdout.write(formatSteps(steps));
    } catch (e) {
      console.error(e.message);
      process.exit(1);
    }
    process.exit(0);
  }
  console.error("usage: owner-steps.mjs <steps.json> | owner-steps.mjs --lint <file.md>");
  process.exit(1);
}

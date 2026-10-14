#!/usr/bin/env node
// Detect Crew (PATH or skill install) and log per-feature build route in the kickoff ledger.
//   node build-route.mjs <project-root>
//   node build-route.mjs <project-root> --choose kickoff|crew
import { existsSync, readdirSync } from "node:fs";
import { join, delimiter, resolve } from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { logEvent } from "./log.mjs";

const CREW_NAMES = new Set(["crew", "crew.cmd", "crew.bat", "crew.exe", "crew.ps1"]);
const SKILL_RELS = [".claude/skills/crew/SKILL.md", ".codex/skills/crew/SKILL.md", ".cursor/skills/crew/SKILL.md"];
const USAGE = "usage: build-route.mjs <project-root> [--choose kickoff|crew]";

function pathDirs(env) {
  const raw = env.PATH ?? env.Path ?? "";
  return raw.split(delimiter).filter(Boolean);
}

function dirHasCrew(dir) {
  try {
    for (const name of readdirSync(dir)) {
      if (CREW_NAMES.has(name)) return true;
    }
  } catch {
    /* unreadable or missing */
  }
  return false;
}

export function crewAvailable({ env = process.env, home = os.homedir() } = {}) {
  for (const dir of pathDirs(env)) {
    if (dirHasCrew(dir)) return { available: true, via: "path" };
  }
  for (const rel of SKILL_RELS) {
    if (existsSync(join(home, rel))) return { available: true, via: "skill" };
  }
  return { available: false, via: null };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const rootArg = args.find((a) => !a.startsWith("--"));
  const chooseIdx = args.indexOf("--choose");
  const choose = chooseIdx >= 0 ? args[chooseIdx + 1] : undefined;

  if (!rootArg || (chooseIdx >= 0 && choose === undefined)) {
    console.error(USAGE);
    process.exit(1);
  }
  const root = resolve(rootArg);

  if (choose === undefined) {
    const { available, via } = crewAvailable();
    console.log(available ? `crew: available (${via})` : "crew: not installed");
    process.exit(0);
  }

  if (choose !== "kickoff" && choose !== "crew") {
    console.error(USAGE);
    process.exit(1);
  }
  if (choose === "crew" && !crewAvailable().available) {
    console.error("crew is not installed; build in kickoff's loop");
    process.exit(1);
  }
  logEvent(root, "build_route", { route: choose });
  console.log(`route: ${choose}`);
}

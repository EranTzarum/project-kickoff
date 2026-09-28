#!/usr/bin/env bash
# Creates an isolated git worktree for one writing agent or parallel session (bash/WSL twin of
# worktree-setup.ps1). Usage: scripts/worktree-setup.sh <name> [base=origin/main]
# Fetches first; never links node_modules (a removed junction once deleted the real apps/ and .env);
# copies no .env — gates must pass without one.
set -euo pipefail
name="${1:?usage: worktree-setup.sh <name> [base]}"
base="${2:-origin/main}"
root="$(git rev-parse --show-toplevel)"
dir="$(dirname "$root")/$(basename "$root")-wt-$name"

git -C "$root" fetch origin --prune
[ -e "$dir" ] && { echo "Worktree dir already exists: $dir" >&2; exit 1; }
git -C "$root" worktree add -b "$name" "$dir" "$base"
if [ -f "$dir/package-lock.json" ]; then (cd "$dir" && npm ci --no-audit --no-fund); fi
echo "Worktree ready: $dir (branch $name from $base). No .env copied by design."
echo "Remove with: git worktree remove \"$dir\" && git branch -D $name"

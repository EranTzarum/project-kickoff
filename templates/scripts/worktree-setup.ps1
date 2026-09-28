# Creates an isolated git worktree for one writing agent or parallel session.
# Usage (PowerShell): .\scripts\worktree-setup.ps1 -Name feature-x [-Base origin/main]
# Rules baked in (learned on the CRM):
#   * fetch first — local main goes stale and a worktree off a stale base re-fights merged work
#   * NEVER junction/symlink node_modules into a worktree: `git worktree remove` once followed the
#     junction and deleted the real apps/ and .env; run `npm ci` inside the worktree instead
#   * the worktree has no .env: gates must pass without one (live suites skip, not fail)
param(
  [Parameter(Mandatory = $true)][string]$Name,
  [string]$Base = "origin/main"
)
$ErrorActionPreference = "Stop"
$root = (git rev-parse --show-toplevel).Trim()
$dir = Join-Path (Split-Path $root -Parent) ("{0}-wt-{1}" -f (Split-Path $root -Leaf), $Name)

git -C $root fetch origin --prune
if (Test-Path $dir) { throw "Worktree dir already exists: $dir" }
git -C $root worktree add -b $Name $dir $Base
Push-Location $dir
try {
  if (Test-Path "package-lock.json") { npm.cmd ci --no-audit --no-fund }
} finally { Pop-Location }

Write-Host "Worktree ready: $dir (branch $Name from $Base). No .env copied by design."
Write-Host "Remove with: git worktree remove `"$dir`" ; git branch -D $Name"

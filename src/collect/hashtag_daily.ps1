# Run by the "Hashtag projections" scheduled task once a day: fetch the projections, refresh players.json, rebuild the pages, run the tests and push to main
# (user, 2026-10-29: "every time the new projections are fetched they should auto push"). Output is appended to src/hashtag_fetch.log.
# Pushes only from a checkout on main (env HASHTAG_PUSH_BRANCH overrides, for tests) and only when every changed file is one of the expected data / built files.
# -DryRun does everything except commit and push.
param([switch]$DryRun)
$repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$log = Join-Path $repo 'src\hashtag_fetch.log'
Set-Location $repo
function Log($m) { $m | Add-Content $log }
function Run($what, [scriptblock]$cmd) {
  $out = & $cmd 2>&1 | Out-String
  if ($out.Trim()) { Log $out.TrimEnd() }
  if ($LASTEXITCODE -ne 0) { Log "FAILED: $what (exit $LASTEXITCODE)"; exit 1 }
}
Log "--- $(Get-Date -Format 'yyyy-MM-dd HH:mm')$(if ($DryRun) { ' (dry run)' }) ---"
$want = if ($env:HASHTAG_PUSH_BRANCH) { $env:HASHTAG_PUSH_BRANCH } else { 'main' }
$branch = (git rev-parse --abbrev-ref HEAD).Trim()
$canPush = $branch -eq $want
if ($canPush) {
  if (git status --porcelain --untracked-files=no) { Log 'Push skipped: tracked files have uncommitted changes'; $canPush = $false }
  else { Run 'git pull' { git pull --ff-only origin $want } }
} else { Log "Push skipped: on $branch, not $want" }

Run 'fetch' { node src/collect/hashtag_fetch.mjs fetch }
if (-not $canPush) { exit 0 }

Run 'build' { node .claude/scripts/build.mjs }
Run 'tests' { node --test src/tests/ }
git add -A
$changed = @(git diff --cached --name-only)
if (-not $changed) { Log 'No change in the projections'; exit 0 }
$ok = '^(src/players\.json|src/data/hashtag_[\d-]+\.xlsx|assets/.*|(index|league|inseason|settings|rankings|team|math)\.html)$'
$odd = @($changed | Where-Object { $_ -notmatch $ok })
if ($odd) { Log ('Push aborted, unexpected files changed: ' + ($odd -join ', ')); git reset -q; exit 1 }
if ($DryRun) { Log ("Dry run: would commit " + $changed.Count + " files"); git reset -q; exit 0 }
Run 'commit' { git commit -q -m "chore: Hashtag projections $(Get-Date -Format 'yyyy-MM-dd') (auto)`n`nCo-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>" }
& git push origin $want 2>&1 | Out-String | Add-Content $log
if ($LASTEXITCODE -ne 0) {   # main moved (a collector job committed): rebase once and retry, never force
  Run 'rebase' { git pull --rebase origin $want }
  Run 'push retry' { git push origin $want }
}
Log "Pushed $($changed.Count) files to $want"

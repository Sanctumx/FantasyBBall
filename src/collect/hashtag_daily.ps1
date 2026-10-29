# Run by the "Hashtag projections" scheduled task once a day: fetch the projections, refresh players.json, rebuild the pages, run the tests and push to main
# (user, 2026-10-29: "every time the new projections are fetched they should auto push"). Output is appended to src/hashtag_fetch.log.
# Pushes only from a checkout on main (env HASHTAG_PUSH_BRANCH overrides, for tests) and only when every changed file is one of the expected data / built files.
# -DryRun does everything except commit and push.
param([switch]$DryRun)
$repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$log = Join-Path $repo 'src\hashtag_fetch.log'
Set-Location $repo
function Log($m) { $m | Add-Content $log }
# after a failed or aborted run on the push branch, drop the build's changes so tomorrow's run starts clean (this checkout is the automation's own)
function Clean { if ($script:canPush -and -not $DryRun) { git reset -q --hard; git clean -fdq -- assets 'src/data/hashtag_*.xlsx' } }
function Run($what, [scriptblock]$cmd) {
  $out = & $cmd 2>&1 | Out-String
  if ($out.Trim()) { Log $out.TrimEnd() }
  if ($LASTEXITCODE -ne 0) { Log "FAILED: $what (exit $LASTEXITCODE)"; Clean; exit 1 }
}
Log "--- $(Get-Date -Format 'yyyy-MM-dd HH:mm')$(if ($DryRun) { ' (dry run)' }) ---"
$want = if ($env:HASHTAG_PUSH_BRANCH) { $env:HASHTAG_PUSH_BRANCH } else { 'main' }
$branch = (git rev-parse --abbrev-ref HEAD).Trim()
$canPush = $branch -eq $want
if ($canPush) {
  if (git status --porcelain --untracked-files=no) { Log 'Push skipped: tracked files have uncommitted changes'; $canPush = $false }
  elseif (-not $DryRun) {
    Run 'git pull' { git pull --ff-only origin $want }
    if (git rev-list "origin/$want..HEAD") { Log "Push skipped: local $want has commits origin/$want lacks"; $canPush = $false }
  }
} else { Log "Push skipped: on $branch, not $want" }

Run 'fetch' { node src/collect/hashtag_fetch.mjs fetch }
if (-not $canPush) { exit 0 }

Run 'build' { node .claude/scripts/build.mjs }
Run 'tests' { node --test src/tests/ }
git add -A -- assets src/players.json 'src/data/hashtag_*.xlsx' src/courtside-inseason.html src/courtside-rankings.html src/courtside-team.html index.html league.html inseason.html settings.html rankings.html team.html math.html
$changed = @(git diff --cached --name-only)
if (-not $changed) { Log 'No change in the projections'; exit 0 }
$ok = '^(src/players\.json|src/data/hashtag_[\d-]+\.xlsx|assets/.*|src/courtside-[a-z]+\.html|(index|league|inseason|settings|rankings|team|math)\.html)$'
$odd = @($changed | Where-Object { $_ -notmatch $ok })
if ($odd) { Log ('Push aborted, unexpected files changed: ' + ($odd -join ', ')); git reset -q; Clean; exit 1 }
if ($DryRun) { Log ("Dry run: would commit " + $changed.Count + " files"); git reset -q; exit 0 }
Run 'commit' { git commit -q -m "chore: Hashtag projections $(Get-Date -Format 'yyyy-MM-dd') (auto)`n`nCo-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>" }
& git push origin $want 2>&1 | Out-String | Add-Content $log
if ($LASTEXITCODE -ne 0) {   # main moved or the push failed: the pages were built on an old main, so do not rebase them; drop the commit and try again at the next run
  git fetch -q origin; git reset -q --hard "origin/$want"
  Log "FAILED: push rejected, reset to origin/$want; the next run fetches again"; exit 1
}
Log "Pushed $($changed.Count) files to $want"

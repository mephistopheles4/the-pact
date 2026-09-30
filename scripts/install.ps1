#Requires -Version 7.5
param(
  [switch]$Apply,
  [string]$ClaudeHome = (Join-Path $HOME '.claude')
)
$ErrorActionPreference = 'Stop'
# Installs the pact (claude/) from this clone into -ClaudeHome (default ~/.claude).
# Dry run by default: prints the plan and changes nothing. -Apply installs, and
# only when there is no drift and the working tree is clean. Reads and writes
# only the repo and -ClaudeHome. Never pushes, commits or uses the network.
# Run from a clone on Windows or on macOS under PowerShell 7.

$repo = Split-Path $PSScriptRoot -Parent
$payload = Join-Path $repo 'claude'
$overlayFile = Join-Path $payload 'settings.overlay.json'
$manifestFile = Join-Path $ClaudeHome '.pact-install.json'
$settingsFile = Join-Path $ClaudeHome 'settings.json'
$retired = @('agents/builder.md', 'agents/spec-builder.md', 'agents/security-builder.md')
$utf8 = New-Object Text.UTF8Encoding($false)

function Get-Sha256($path) { (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant() }

# A manifest path is relative, uses '/', and never leaves -ClaudeHome.
function Resolve-Live($rel) {
  if ([IO.Path]::IsPathRooted($rel) -or $rel -match '(^|[\\/])\.\.([\\/]|$)') { throw "unsafe path in manifest: $rel" }
  Join-Path $ClaudeHome ($rel -replace '/', [IO.Path]::DirectorySeparatorChar)
}

function Invoke-Git {
  $out = & git -C $repo @args
  if ($LASTEXITCODE -ne 0) { throw "git $($args -join ' ') failed" }
  $out
}

# --- settings merge: the rules of cloud-sessions/tpl-config-tail.sh -----------
# ConvertFrom-Json wraps every value as a PSObject, so test the type name, not -is.
function Test-JsonObject($v) { $v -is [pscustomobject] -and $v.PSObject.TypeNames[0] -eq 'System.Management.Automation.PSCustomObject' }

function ConvertTo-Plain($v) {
  if (Test-JsonObject $v) {
    $o = [ordered]@{}
    foreach ($p in $v.PSObject.Properties) { $o[$p.Name] = ConvertTo-Plain $p.Value }
    return $o
  }
  if ($v -is [System.Collections.IList]) {
    $l = [Collections.Generic.List[object]]::new()
    foreach ($i in $v) { $l.Add((ConvertTo-Plain $i)) }
    return , $l
  }
  $v
}

# Recursive merge: $b wins; objects merge, everything else is replaced.
function Merge-Deep($a, $b) {
  $r = [ordered]@{}
  foreach ($k in $a.Keys) { $r[$k] = $a[$k] }
  foreach ($k in $b.Keys) {
    if ($r.Contains($k) -and $r[$k] -is [System.Collections.IDictionary] -and $b[$k] -is [System.Collections.IDictionary]) {
      $r[$k] = Merge-Deep $r[$k] $b[$k]
    } else { $r[$k] = $b[$k] }
  }
  $r
}

function Get-Union($x, $y) {
  $set = [Collections.Generic.SortedSet[string]]::new([StringComparer]::Ordinal)
  foreach ($i in @($x) + @($y)) { if ($null -ne $i) { [void]$set.Add([string]$i) } }
  $l = [Collections.Generic.List[object]]::new()
  foreach ($i in $set) { $l.Add($i) }
  , $l
}

function Get-MergedSettings($file, $b) {
  $a = [ordered]@{}
  if (Test-Path -LiteralPath $file) {
    # Strict parse (no comments, no trailing commas), as jq does in the cloud script.
    try {
      $text = [IO.File]::ReadAllText($file, $utf8)
      $doc = [Text.Json.JsonDocument]::Parse($text)
      $isObject = $doc.RootElement.ValueKind -eq 'Object'
      $doc.Dispose()
      if (-not $isObject) { return $null }
      $parsed = ConvertFrom-Json -InputObject $text -Depth 100 -DateKind String -ErrorAction Stop
    } catch { return $null }
    $a = ConvertTo-Plain $parsed
  }
  $m = Merge-Deep $a $b
  foreach ($k in 'enabledPlugins', 'extraKnownMarketplaces') {
    if ($a.Contains($k)) { $m[$k] = $a[$k] }
  }
  $pa = if ($a.Contains('permissions') -and $a.permissions -is [System.Collections.IDictionary]) { $a.permissions } else { @{} }
  $pb = if ($b.Contains('permissions')) { $b.permissions } else { @{} }
  foreach ($k in 'allow', 'deny') {
    if ($pa.Contains($k) -or $pb.Contains($k)) { $m.permissions[$k] = Get-Union $pa[$k] $pb[$k] }
  }
  $m
}

# Key-order-insensitive text, to tell a real change from a reformat.
function Get-Canonical($v) {
  if ($v -is [System.Collections.IDictionary]) {
    '{' + (($v.Keys | Sort-Object -CaseSensitive | ForEach-Object { (ConvertTo-Json $_) + ':' + (Get-Canonical $v[$_]) }) -join ',') + '}'
  } elseif ($v -is [System.Collections.IList]) { '[' + (($v | ForEach-Object { Get-Canonical $_ }) -join ',') + ']' }
  else { ConvertTo-Json $v -Compress }
}

# --- plan ---------------------------------------------------------------------
$commit = (Invoke-Git rev-parse HEAD).Trim()
$dirty = @(Invoke-Git status --porcelain)
$repoFiles = [ordered]@{}   # rel path -> sha256 of the repo copy
# The payload is what git tracks under claude/, never the folder listing: an
# ignored file (settings.json, *.private.md) must not be installed or owned.
$tracked = @(Invoke-Git -c core.quotepath=false ls-files -- claude) | Where-Object { $_ } | Sort-Object
foreach ($t in $tracked) {
  $rel = $t.Substring('claude/'.Length)
  if ($rel -eq 'settings.overlay.json' -or $rel -eq 'settings.json') { continue }
  $repoFiles[$rel] = Get-Sha256 (Join-Path $repo ($t -replace '/', [IO.Path]::DirectorySeparatorChar))
}

$manifest = $null
if (Test-Path -LiteralPath $manifestFile) {
  $manifest = ConvertFrom-Json -InputObject ([IO.File]::ReadAllText($manifestFile, $utf8)) -Depth 100
  if (-not ($manifest.commit -and $manifest.files)) { throw "$manifestFile is not a pact manifest (needs commit and files); fix or remove it" }
}

$drift = @(); $overwrite = @(); $add = @(); $delete = @(); $same = 0
if ($manifest) {
  foreach ($e in $manifest.files) {
    $p = Resolve-Live $e.path
    if (-not (Test-Path -LiteralPath $p -PathType Leaf)) { $drift += "$($e.path) (deleted since the install)" }
    elseif ((Get-Sha256 $p) -ne $e.sha256) { $drift += "$($e.path) (changed since the install)" }
  }
  $delete = @($manifest.files | Where-Object { -not $repoFiles.Contains($_.path) } |
    Where-Object { Test-Path -LiteralPath (Resolve-Live $_.path) } | ForEach-Object { $_.path })
} else {
  $delete = @($retired | Where-Object { Test-Path -LiteralPath (Resolve-Live $_) })
}
foreach ($rel in $repoFiles.Keys) {
  $p = Resolve-Live $rel
  if (-not (Test-Path -LiteralPath $p -PathType Leaf)) { $add += $rel }
  elseif ((Get-Sha256 $p) -ne $repoFiles[$rel]) { $overwrite += $rel }
  else { $same++ }
}

$overlay = ConvertTo-Plain (ConvertFrom-Json -InputObject ([IO.File]::ReadAllText($overlayFile, $utf8)) -Depth 100)
$merged = Get-MergedSettings $settingsFile $overlay
if ($null -eq $merged) { $settings = 'not a JSON object: left untouched' }
elseif (-not (Test-Path -LiteralPath $settingsFile)) { $settings = 'would be created from the overlay' }
else {
  $cur = ConvertTo-Plain (ConvertFrom-Json -InputObject ([IO.File]::ReadAllText($settingsFile, $utf8)) -Depth 100 -DateKind String)
  $settings = if ((Get-Canonical $cur) -eq (Get-Canonical $merged)) { 'unchanged' } else { 'would be merged' }
}
$manifestStale = $manifest -and $manifest.commit -ne $commit
$nothing = -not ($overwrite -or $add -or $delete -or $settings -like 'would*' -or $manifestStale -or -not $manifest)

function Show-List($title, $items) {
  Write-Host "${title}: $(@($items).Count)"
  foreach ($i in $items) { Write-Host "  $i" }
}
Write-Host "Install from commit $commit into $ClaudeHome"
if ($manifest) { Write-Host "Last install: $($manifest.commit)" }
else { Write-Host 'No manifest found: first-install mode. Live files are compared with the repo; only the retired agents (builder, spec-builder, security-builder) can be deleted.' }
Show-List 'Drift' $drift
Show-List 'Overwrite' $overwrite
Show-List 'Add' $add
Show-List 'Delete' $delete
Write-Host "Unchanged: $same"
Write-Host "settings.json: $settings"
if ($dirty.Count) { Write-Host "Working tree: DIRTY ($($dirty.Count) path(s)); -Apply will refuse." } else { Write-Host 'Working tree: clean' }
if ($nothing) { Write-Host 'Nothing to do.' }

if (-not $Apply) {
  Write-Host 'Dry run only. Pass -Apply after the owner''s go-ahead.'
  exit 0
}
if ($drift) { Write-Host 'REFUSED: live files drifted since the last install. Nothing was changed.'; exit 1 }
if ($dirty.Count) { Write-Host 'REFUSED: the working tree is not clean. Nothing was changed.'; exit 1 }

# --- apply --------------------------------------------------------------------
New-Item -ItemType Directory -Force -Path $ClaudeHome | Out-Null
foreach ($rel in $delete) { Remove-Item -LiteralPath (Resolve-Live $rel) -Force; Write-Host "deleted $rel" }
foreach ($rel in @($overwrite) + @($add)) {
  $dest = Resolve-Live $rel
  New-Item -ItemType Directory -Force -Path (Split-Path $dest -Parent) | Out-Null
  Copy-Item -LiteralPath (Join-Path $payload ($rel -replace '/', [IO.Path]::DirectorySeparatorChar)) -Destination $dest -Force
  Write-Host "installed $rel"
}
if ($null -eq $merged) { Write-Host "WARN: $settingsFile is not a JSON object; left untouched" }
elseif ($settings -like 'would*') {
  $tmp = "$settingsFile.pact-tmp"
  [IO.File]::WriteAllText($tmp, ((ConvertTo-Json $merged -Depth 100) + "`n"), $utf8)
  Move-Item -LiteralPath $tmp -Destination $settingsFile -Force
  Write-Host 'merged settings.json'
}

$doc = [ordered]@{
  commit = $commit
  files  = @($repoFiles.Keys | ForEach-Object { [ordered]@{ path = $_; sha256 = $repoFiles[$_] } })
}
$tmp = "$manifestFile.pact-tmp"
[IO.File]::WriteAllText($tmp, ((ConvertTo-Json $doc -Depth 10) + "`n"), $utf8)
Move-Item -LiteralPath $tmp -Destination $manifestFile -Force

# --- verify: live against the repo copy ---------------------------------------
$bad = 0
foreach ($rel in $repoFiles.Keys) {
  $p = Resolve-Live $rel
  if ((Test-Path -LiteralPath $p) -and (Get-Sha256 $p) -eq $repoFiles[$rel]) { Write-Host "OK       $rel" }
  else { Write-Host "MISMATCH $rel"; $bad++ }
}
foreach ($rel in $delete) {
  if (Test-Path -LiteralPath (Resolve-Live $rel)) { Write-Host "MISMATCH $rel (should be deleted)"; $bad++ }
}
if ($bad) { Write-Host "$bad mismatch(es)."; exit 1 }
Write-Host "Installed commit $commit; all files verified."
exit 0

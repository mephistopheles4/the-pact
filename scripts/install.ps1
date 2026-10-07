#Requires -Version 7.5
# A plain param block, never an advanced script: [CmdletBinding()] would let
# $PSDefaultParameterValues turn on -Apply with no "-Apply" in the command text,
# past the ask rules (ADR 0020, gate/tests/settings.test.mjs).
param(
  [switch]$Apply,
  [string]$ClaudeHome = (Join-Path $HOME '.claude'),
  # The full rendered hash the dry run showed. -Apply needs it whenever a
  # configuration applies, and a hash given is always compared. (Its name must
  # not start with A or C, so -A and -C stay unambiguous.)
  [string]$RenderedHash
)
$ErrorActionPreference = 'Stop'
# Installs the pact from this clone's committed HEAD into -ClaudeHome (default
# ~/.claude). Dry run by default: prints the plan and changes nothing. -Apply
# installs, and only when there is no drift, the working tree is clean and
# this script is the committed copy. Reads and writes only the repo, a
# temporary staging folder and -ClaudeHome. Never pushes, commits or uses the
# network. Run from a clone on Windows or on macOS under PowerShell 7.
#
# The gate: every file to install is staged from HEAD's blobs. The renderer
# (gate/render.mjs) turns the staged source rules file into the rules file to
# install, with the user configuration file (pact/config.json under
# -ClaudeHome) when there is one, and that rendered buffer replaces it in the
# stage. Then the pact's own check (gate/seam-a.mjs, seam A) runs on the staged
# copy under Node 20 or later, and the install copies exactly the staged bytes
# seam A listed. It refuses when the renderer or the check fails, or cannot run
# at all.
#
# The configuration binding: when a configuration applies, the dry run prints
# the full hash of the rules file it rendered, and -Apply must be handed that
# hash back with -RenderedHash. A hash given is always compared with this run's
# render, so a configuration that changed, appeared or was deleted after the
# dry run refuses. It proves the files did not change between the two runs; it
# does not prove the owner read the dry run.

$repo = Split-Path $PSScriptRoot -Parent
# -ClaudeHome must be a full path. A relative one could name three different
# folders: PowerShell cmdlets resolve it against PowerShell's location, .NET
# calls against the process's working folder, and the renderer runs in the
# stage. And the parameters bind by position, so a hash typed after -Apply
# without its name lands here, as a relative name; this refuses it before
# anything runs.
if (-not [IO.Path]::IsPathFullyQualified($ClaudeHome)) {
  Write-Host 'REFUSED: -ClaudeHome must be a full path, such as the default (your home folder''s .claude). A hash goes after -RenderedHash. Nothing was changed.'
  exit 1
}
$claudeHomeFull = [IO.Path]::GetFullPath($ClaudeHome)
$ClaudeHome = $claudeHomeFull
$configRel = 'pact/config.json'
$blocksRel = 'pact/blocks'
$manifestFile = Join-Path $ClaudeHome '.pact-install.json'
$settingsFile = Join-Path $ClaudeHome 'settings.json'
$retired = @('agents/builder.md', 'agents/spec-builder.md', 'agents/security-builder.md')
$utf8 = New-Object Text.UTF8Encoding($false)
$nodeMinMajor = 20
$versionTimeoutMs = 15000
$checkTimeoutMs = 120000
$checkLinesMax = 400
$checkLineChars = 300

# PowerShell's own hashtables fold case. Paths here are compared exactly, as git
# and seam A compare them, so these maps never fold one name into another.
function New-OrderedMap { , [Collections.Specialized.OrderedDictionary]::new([StringComparer]::Ordinal) }

function Get-Sha256($path) { (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant() }
function Get-BytesSha256([byte[]]$b) { [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($b)).ToLowerInvariant() }

# Git's id for a blob holding these bytes, to prove a read returned exactly the blob.
function Get-BlobId([byte[]]$b) {
  $head = [Text.Encoding]::ASCII.GetBytes("blob $($b.Length)`0")
  [Convert]::ToHexString([Security.Cryptography.SHA1]::HashData([byte[]]($head + $b))).ToLowerInvariant()
}

# A manifest path is relative, uses '/', and never leaves -ClaudeHome.
function Resolve-Live($rel) {
  if ([IO.Path]::IsPathRooted($rel) -or $rel -match '(^|[\\/])\.\.([\\/]|$)') { throw "unsafe path in manifest: $rel" }
  Join-Path $ClaudeHome ($rel -replace '/', [IO.Path]::DirectorySeparatorChar)
}

# Never deleted, overwritten or listed, whatever the install record says. The
# user configuration file and its blocks folder are the owner's, like the
# settings file and the record.
function Test-Protected($rel) {
  # Normalise as Windows does: drop empty and '.' segments, stream suffixes, trailing dots and spaces.
  $segs = @($rel.Replace('\', '/') -split '/' | ForEach-Object { ($_ -replace ':.*$', '').TrimEnd('.', ' ') } | Where-Object { $_ })
  $n = $segs -join '/'
  $leaf = if ($segs.Count) { $segs[-1] } else { '' }
  $n -ieq 'settings.json' -or $n -ieq '.pact-install.json' -or $n -ieq 'pact/config.json' -or
    $leaf -like '.credentials*' -or $n -match '^(?i)(projects|memory|skills|handover|pact/blocks)(/|$)'
}

# Only plain, canonical record paths are acted on. Judging a name by its spelling
# fails against Windows aliases (8.3 short names, trailing dots, stream suffixes),
# so anything that is not already plain is skipped, as is any path through a link.
function Test-Canonical($rel) {
  if (-not $rel -or $rel.Contains('\')) { return $false }
  foreach ($seg in $rel.Split('/')) {
    if ($seg -notmatch '^[A-Za-z0-9_-][A-Za-z0-9._-]*$' -or $seg.EndsWith('.')) { return $false }
  }
  $true
}

function Test-ThroughLink($rel) {
  $p = $ClaudeHome
  foreach ($seg in $rel.Split('/')) {
    $p = Join-Path $p $seg
    $item = Get-Item -LiteralPath $p -Force -ErrorAction SilentlyContinue
    if ($item -and ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) { return $true }
  }
  $false
}

# $null when the entry is safe to act on; otherwise the reason to skip it.
function Get-SkipReason($rel) {
  if (-not $rel -or [IO.Path]::IsPathRooted($rel) -or $rel -match '(^|[\\/])\.\.([\\/]|$)') { return 'unsafe path' }
  if (Test-Protected $rel) { return 'protected path' }
  if (-not (Test-Canonical $rel)) { return 'non-canonical path' }
  if (Test-ThroughLink $rel) { return 'path through a link' }
  $null
}

# Git, resolved once as an application and run by that exact path everywhere,
# so no lookup can reach a git in the current folder (as .NET's own lookup may
# on some systems).
$gitCmd = Get-Command git -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $gitCmd) { Write-Host 'REFUSED: no git found on PATH. Nothing was changed.'; exit 1 }
$git = $gitCmd.Source
if ($IsWindows -and [IO.Path]::GetExtension($git) -ne '.exe') { Write-Host "REFUSED: git resolved to $git, which is not an .exe. Nothing was changed."; exit 1 }

function Invoke-Git {
  $out = & $git -C $repo @args
  if ($LASTEXITCODE -ne 0) { throw "git $($args -join ' ') failed" }
  $out
}

# git's raw stdout as bytes: no PowerShell text decoding, no line splitting.
function Invoke-GitBytes([string[]]$GitArgs) {
  $psi = [Diagnostics.ProcessStartInfo]::new($git)
  foreach ($a in @('-C', $repo) + $GitArgs) { $psi.ArgumentList.Add($a) }
  $psi.UseShellExecute = $false
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $p = [Diagnostics.Process]::Start($psi)
  $err = $p.StandardError.ReadToEndAsync()
  $ms = [IO.MemoryStream]::new()
  $p.StandardOutput.BaseStream.CopyTo($ms)
  $p.WaitForExit()
  [void]$err.Result
  if ($p.ExitCode -ne 0) { throw "git $($GitArgs -join ' ') failed" }
  , $ms.ToArray()
}

# Run a program by its resolved path, with its own environment minus
# NODE_OPTIONS (the caller's environment is never changed), in the stage, with
# a time limit. Returns ExitCode, Stdout, StderrChars and TimedOut.
function Invoke-Node([string]$exe, [string[]]$NodeArgs, [int]$timeoutMs) {
  $psi = [Diagnostics.ProcessStartInfo]::new($exe)
  foreach ($a in $NodeArgs) { $psi.ArgumentList.Add($a) }
  $psi.UseShellExecute = $false
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $psi.StandardOutputEncoding = $utf8
  $psi.WorkingDirectory = $stage
  [void]$psi.Environment.Remove('NODE_OPTIONS')
  $p = [Diagnostics.Process]::Start($psi)
  $out = $p.StandardOutput.ReadToEndAsync()
  $err = $p.StandardError.ReadToEndAsync()
  $timedOut = -not $p.WaitForExit($timeoutMs)
  if ($timedOut) { try { $p.Kill($true) } catch { } }
  $p.WaitForExit()
  [pscustomobject]@{ ExitCode = $p.ExitCode; Stdout = $out.Result; StderrChars = $err.Result.Length; TimedOut = $timedOut }
}

# A line from the check or the renderer, safe to print: no control, format or
# separator character (so no terminal escape, carriage return or direction
# override), cut to length, and prefixed with the program it came from, so it
# can never pass for the install's own output or for the other program's.
function Format-CheckLine([string]$line, [string]$prefix = 'seam-a') {
  $s = $line -replace '[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]', '?'
  if ($s.Length -gt $checkLineChars) { $s = $s.Substring(0, $checkLineChars) + '...' }
  "$prefix| $s"
}

# Print a program's output lines through Format-CheckLine, at most
# $checkLinesMax of them.
function Show-ProgramLines([string[]]$lines, [string]$prefix) {
  $shown = 0
  foreach ($l in $lines) {
    if ($shown -ge $checkLinesMax) { Write-Host "$prefix| ($($lines.Count - $shown) more lines not shown)"; break }
    Write-Host (Format-CheckLine $l $prefix)
    $shown++
  }
}

# Everything under $root, as one text: each entry's relative path and kind, and
# each file's hash. Hidden and system entries are included. A link or other
# reparse point is recorded as one and never followed.
function Get-TreeState([string]$root) {
  $opt = [IO.EnumerationOptions]::new()
  $opt.AttributesToSkip = 0
  $opt.IgnoreInaccessible = $false
  $opt.RecurseSubdirectories = $false
  $entries = [Collections.Generic.List[string]]::new()
  $dirs = [Collections.Generic.Stack[string]]::new()
  $dirs.Push($root)
  while ($dirs.Count) {
    foreach ($e in [IO.DirectoryInfo]::new($dirs.Pop()).EnumerateFileSystemInfos('*', $opt)) {
      $rel = [IO.Path]::GetRelativePath($root, $e.FullName).Replace('\', '/')
      if ($e.Attributes -band [IO.FileAttributes]::ReparsePoint) { $entries.Add("link $rel") }
      elseif ($e -is [IO.DirectoryInfo]) { $entries.Add("dir $rel"); $dirs.Push($e.FullName) }
      else { $entries.Add("file $rel $(Get-BytesSha256 ([IO.File]::ReadAllBytes($e.FullName)))") }
    }
  }
  $sorted = [string[]]$entries.ToArray()
  [Array]::Sort($sorted, [StringComparer]::Ordinal)
  $sorted -join "`n"
}

# --- settings merge: the rules of cloud-sessions/tpl-config-tail.sh -----------
# Settings are read with System.Text.Json into ordinal maps: strict (no
# comments, no trailing commas) and case-sensitive, as Claude Code reads them,
# so "Permissions" is never taken for "permissions". Of two equal keys the
# last wins, as JSON.parse keeps it.
function ConvertFrom-JsonElement([Text.Json.JsonElement]$e) {
  switch ($e.ValueKind) {
    'Object' {
      $o = New-OrderedMap
      foreach ($p in $e.EnumerateObject()) { $o[$p.Name] = ConvertFrom-JsonElement $p.Value }
      return , $o
    }
    'Array' {
      $l = [Collections.Generic.List[object]]::new()
      foreach ($i in $e.EnumerateArray()) { $l.Add((ConvertFrom-JsonElement $i)) }
      return , $l
    }
    'String' { return $e.GetString() }
    'Number' {
      # The narrowest exact type, so a rewrite never rounds an owner's number.
      $n = 0L; if ($e.TryGetInt64([ref]$n)) { return $n }
      $d = [decimal]0; if ($e.TryGetDecimal([ref]$d)) { return $d }
      return $e.GetDouble()
    }
    'True' { return $true }
    'False' { return $false }
    default { return $null }
  }
}

# The text as an ordinal map, or $null when it is not one strict JSON object.
function Read-JsonObject([string]$text) {
  try {
    $doc = [Text.Json.JsonDocument]::Parse($text)
    try {
      if ($doc.RootElement.ValueKind -ne 'Object') { return $null }
      return , (ConvertFrom-JsonElement $doc.RootElement)
    } finally { $doc.Dispose() }
  } catch { return $null }
}

# Recursive merge: $b wins; objects merge, everything else is replaced. $b's
# objects are copied, so later changes to the result never reach $b.
function Merge-Deep($a, $b) {
  $r = New-OrderedMap
  foreach ($k in $a.Keys) { $r[$k] = $a[$k] }
  foreach ($k in $b.Keys) {
    if ($b[$k] -is [System.Collections.IDictionary]) {
      $base = if ($r.Contains($k) -and $r[$k] -is [System.Collections.IDictionary]) { $r[$k] } else { New-OrderedMap }
      $r[$k] = Merge-Deep $base $b[$k]
    } else { $r[$k] = $b[$k] }
  }
  , $r
}

function Get-Union($x, $y) {
  $set = [Collections.Generic.SortedSet[string]]::new([StringComparer]::Ordinal)
  foreach ($i in @($x) + @($y)) { if ($null -ne $i) { [void]$set.Add([string]$i) } }
  $l = [Collections.Generic.List[object]]::new()
  foreach ($i in $set) { $l.Add($i) }
  , $l
}

# The live settings ($a, an ordinal map) with the overlay ($b) merged in. The
# permission rule lists are joined, never replaced, so the owner's own rules
# survive.
function Get-MergedSettings($a, $b) {
  $m = Merge-Deep $a $b
  foreach ($k in 'enabledPlugins', 'extraKnownMarketplaces') {
    if ($a.Contains($k)) { $m[$k] = $a[$k] }
  }
  $pa = if ($a.Contains('permissions') -and $a['permissions'] -is [System.Collections.IDictionary]) { $a['permissions'] } else { New-OrderedMap }
  $pb = if ($b.Contains('permissions')) { $b['permissions'] } else { New-OrderedMap }
  foreach ($k in 'allow', 'deny', 'ask') {
    if ($pa.Contains($k) -or $pb.Contains($k)) { $m['permissions'][$k] = Get-Union $pa[$k] $pb[$k] }
  }
  , $m
}

# Settings that run a command, load code or reach a tool server: the same
# names seam A refuses in the overlay (BANNED_SETTINGS in gate/seam-a.mjs).
$bannedSettings = @('hooks', 'mcpServers', 'statusLine', 'fileSuggestion', 'apiKeyHelper', 'awsAuthRefresh',
  'awsCredentialExport', 'otelHeadersHelper', 'enabledPlugins', 'extraKnownMarketplaces',
  'enableAllProjectMcpServers', 'enabledMcpjsonServers')
# The plugin keys: banned in the overlay, but the owner's own in the live file,
# which the merge keeps. The live warnings name them as the owner's, not as a risk.
$liveOwnSettings = @('enabledPlugins', 'extraKnownMarketplaces')

# Every banned name used as an object key, at any depth, compared exactly.
function Get-BannedKeys($v) {
  $found = [Collections.Generic.SortedSet[string]]::new([StringComparer]::Ordinal)
  $stack = [Collections.Generic.Stack[object]]::new()
  $stack.Push($v)
  while ($stack.Count) {
    $x = $stack.Pop()
    if ($x -is [System.Collections.IDictionary]) {
      foreach ($k in $x.Keys) {
        if ($bannedSettings -ccontains $k) { [void]$found.Add($k) }
        $stack.Push($x[$k])
      }
    } elseif ($x -is [System.Collections.IList]) { foreach ($i in $x) { $stack.Push($i) } }
  }
  , @($found)
}

# @{ has; value } for the key path $segs in an ordinal map.
function Get-SettingsPath($map, [string[]]$segs) {
  $v = $map
  foreach ($s in $segs) {
    if ($v -isnot [System.Collections.IDictionary] -or -not $v.Contains($s)) { return @{ has = $false } }
    $v = $v[$s]
  }
  @{ has = $true; value = $v }
}

# What the merge changes, told from the overlay's side only: each rule a list
# gains, and each other key the overlay sets to a new value. A live value is
# never printed, so neither an env secret nor a saved rule can show here.
function Get-SettingsChanges($live, $overlay) {
  $paths = [Collections.Generic.List[object]]::new()
  foreach ($top in $overlay.Keys) {
    if (($top -ceq 'env' -or $top -ceq 'permissions') -and $overlay[$top] -is [System.Collections.IDictionary]) {
      foreach ($k in $overlay[$top].Keys) { $paths.Add([string[]]@($top, $k)) }
    } else { $paths.Add([string[]]@($top)) }
  }
  foreach ($segs in $paths) {
    $name = $segs -join '.'
    $new = (Get-SettingsPath $overlay $segs).value
    $old = Get-SettingsPath $live $segs
    if ($name -cin 'permissions.allow', 'permissions.deny', 'permissions.ask') {
      $had = if ($old.has -and $old.value -is [System.Collections.IList]) { @($old.value | ForEach-Object { "$_" }) } else { @() }
      foreach ($rule in $new) { if ($had -cnotcontains $rule) { "  + ${name}: $(Format-Rule $rule)" } }
    } elseif (-not $old.has -or (Get-Canonical $old.value) -cne (Get-Canonical $new)) {
      "  set $name = $(Format-Plain (Get-Canonical $new))"
    }
  }
}

# Warnings about the live file, which the owner and anything with a shell can
# edit: a banned key, a permission mode other than auto, missing pact "ask"
# rules. Live keys the pact does not set are named once, capped; live env
# names are only counted, since a name can say what a secret is for.
function Get-LiveSettingsLines($live, $overlay, [string[]]$pactAsk) {
  foreach ($k in (Get-BannedKeys $live)) {
    if ($liveOwnSettings -cnotcontains $k) { "WARN: settings.json holds $k, a command-running setting the pact never sets." }
  }
  $lp = $live['permissions']
  $liveAsk = if ($lp -is [System.Collections.IDictionary] -and $lp['ask'] -is [System.Collections.IList]) { @($lp['ask'] | ForEach-Object { "$_" }) } else { @() }
  $missing = @($pactAsk | Where-Object { $liveAsk -cnotcontains $_ })
  if ($missing) { "WARN: settings.json lacks $($missing.Count) of the pact's ask rules; -Apply adds them back." }
  $mode = if ($lp -is [System.Collections.IDictionary]) { $lp['defaultMode'] } else { $null }
  if ($mode -isnot [string] -or $mode -cne 'auto') { 'WARN: settings.json: permissions.defaultMode is not auto; -Apply sets it.' }
  $own = @($live.Keys | Where-Object { -not $overlay.Contains($_) -and ($bannedSettings -cnotcontains $_ -or $liveOwnSettings -ccontains $_) } | Sort-Object -CaseSensitive)
  if ($own) {
    $names = @($own | Select-Object -First 20 | ForEach-Object { $n = Format-Plain $_; if ($n.Length -gt 40) { $n.Substring(0, 40) + '...' } else { $n } })
    $line = "NOTE: live keys the pact does not set (yours, not checked): $($names -join ', ')"
    if ($own.Count -gt 20) { $line += " and $($own.Count - 20) more" }
    if ($line.Length -gt $checkLineChars) { $line = $line.Substring(0, $checkLineChars) + '...' }
    $line
  }
  $le = $live['env']; $oe = $overlay['env']
  if ($le -is [System.Collections.IDictionary]) {
    $n = @($le.Keys | Where-Object { -not ($oe -is [System.Collections.IDictionary] -and $oe.Contains($_)) }).Count
    if ($n) { "NOTE: live env names the pact does not set: $n" }
  }
}

# Key-order-insensitive text, to tell a real change from a reformat.
function Get-Canonical($v) {
  if ($v -is [System.Collections.IDictionary]) {
    '{' + (($v.Keys | Sort-Object -CaseSensitive | ForEach-Object { (ConvertTo-Json $_) + ':' + (Get-Canonical $v[$_]) }) -join ',') + '}'
  } elseif ($v -is [System.Collections.IList]) { '[' + (($v | ForEach-Object { Get-Canonical $_ }) -join ',') + ']' }
  else { ConvertTo-Json $v -Compress }
}

function Show-List($title, $items) {
  Write-Host "${title}: $(@($items).Count)"
  foreach ($i in $items) { Write-Host "  $(Format-Plain $i)" }
}

# Text from the install record, which anything that can write ~/.claude can
# edit, made safe to print as Format-CheckLine makes the check's lines.
function Format-Plain([string]$s) { $s -replace '[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]', '?' }

# A permission rule as the owner approves it: every character outside
# printable ASCII, and the backslash itself, as a \u escape of four hex digits.
# A console code page can show an en dash as a hyphen; this can't, and a rule
# holding the plain text of an escape prints apart from the character (#89).
function Format-Rule([string]$s) {
  [regex]::Replace($s, '[^\x20-\x5b\x5d-\x7e]', { param($m) '\u{0:x4}' -f [int][char]$m.Value })
}

# --- the gate's fingerprints ---------------------------------------------------
$gateNow = $null      # ordered: path -> sha256, for this run
$gateLines = @()      # the block the dry run and -Apply print

function Show-Gate {
  if ($gateLines) { foreach ($l in $gateLines) { Write-Host $l } }
}

function Stop-Refused([string]$why) {
  Show-Gate
  Write-Host "REFUSED: $why Nothing was changed."
  foreach ($d in @($stage, $renderOut)) {
    if ($d -and (Test-Path -LiteralPath $d)) { Remove-Item -LiteralPath $d -Recurse -Force -ErrorAction SilentlyContinue }
  }
  exit 1
}

# --- stage HEAD ----------------------------------------------------------------
$stage = $null
$renderOut = $null
try {
$commit = (Invoke-Git rev-parse HEAD).Trim()
$dirty = @(Invoke-Git status --porcelain)
$warnings = @()

$manifest = $null
if (Test-Path -LiteralPath $manifestFile) {
  $manifest = ConvertFrom-Json -InputObject ([IO.File]::ReadAllText($manifestFile, $utf8)) -Depth 100
  if (-not ($manifest.commit -and $manifest.files)) { throw "$manifestFile is not a pact manifest (needs commit and files); fix or remove it" }
}

# The record's configuration: kind -> sha256 of each configuration file the
# last install read. A record from before configurations holds none.
$lastConfig = New-OrderedMap
if ($manifest -and $manifest.config) {
  foreach ($c in @($manifest.config)) { if ($c.kind -is [string] -and $c.sha256 -is [string]) { $lastConfig[$c.kind] = $c.sha256 } }
}
Write-Host "Install from commit $commit into $ClaudeHome"
if ($manifest) {
  $lastDigest = if ($manifest.digest -is [string] -and $manifest.digest -cmatch '\A[0-9a-f]{12}\z') { "configuration $($manifest.digest)" } else { 'no configuration' }
  Write-Host "Last install: $(Format-Plain $manifest.commit) with $lastDigest"
}
else { Write-Host 'No manifest found: first-install mode. Live files are compared with the repo; only the retired agents (builder, spec-builder, security-builder) can be deleted.' }

# The set is HEAD's tree, never a directory listing or the working tree: an
# ignored file is never staged, and "installed commit X" is true of every byte.
# AGENTS.md is staged for the check only (it holds the install go-ahead
# clause); it is never installed. Of cross/, only the cross script is staged,
# by its exact path; it installs to pact/cross.mjs, where the pact calls it.
$treeRaw = Invoke-GitBytes @('ls-tree', '-r', '-z', '--full-tree', 'HEAD', '--', 'claude', 'familiars', 'gate', 'AGENTS.md', 'scripts/install.ps1', 'cross/cross.mjs')
$tree = New-OrderedMap   # rel path -> blob id
$treeFolded = @{}       # case-insensitive, to refuse paths that differ only in case
foreach ($rec in ([Text.Encoding]::UTF8.GetString($treeRaw) -split "`0")) {
  if (-not $rec) { continue }
  if ($rec -cnotmatch '\A(\d{6}) (\w+) ([0-9a-f]{40})\t(.+)\z') { throw 'unreadable git ls-tree output' }
  $mode, $type, $id, $rel = $Matches[1], $Matches[2], $Matches[3], $Matches[4]
  if ($rel -clike 'gate/tests/*') { continue }
  $shownRel = $rel -replace '[^A-Za-z0-9._/-]', '?'
  if ($mode -cne '100644' -or $type -cne 'blob') { Stop-Refused "the commit holds $shownRel with file mode $mode; only plain files (100644) are installed." }
  foreach ($seg in $rel.Split('/')) {
    if ($seg -cnotmatch '\A[A-Za-z0-9._-]+\z' -or $seg -eq '.' -or $seg -eq '..') { Stop-Refused "the commit holds a path with unsafe characters: $shownRel." }
  }
  if ($treeFolded.ContainsKey($rel)) { Stop-Refused "the commit holds two paths that differ only in case: $shownRel." }
  $treeFolded[$rel] = $true
  $tree[$rel] = $id
}

# The install script that is running, against its committed copy.
$selfBytes = [IO.File]::ReadAllBytes($PSCommandPath)
$selfDiffers = -not $tree.Contains('scripts/install.ps1') -or (Get-BlobId $selfBytes) -ne $tree['scripts/install.ps1']
$tree.Remove('scripts/install.ps1')

$stage = [IO.Directory]::CreateTempSubdirectory('pact-stage-').FullName
$staged = New-OrderedMap   # rel path -> sha256 of the staged bytes
foreach ($rel in $tree.Keys) {
  $bytes = Invoke-GitBytes @('cat-file', 'blob', $tree[$rel])
  if ((Get-BlobId $bytes) -ne $tree[$rel]) { Stop-Refused "the bytes read for $rel are not its blob." }
  $dest = Join-Path $stage ($rel -replace '/', [IO.Path]::DirectorySeparatorChar)
  New-Item -ItemType Directory -Force -Path (Split-Path $dest -Parent) | Out-Null
  [IO.File]::WriteAllBytes($dest, $bytes)
  $staged[$rel] = Get-BytesSha256 $bytes
}

# Gate fingerprints: every gate file but the tests, and this script as it runs.
# The self-fingerprint catches an honest or unaware edit only: a deliberately
# altered install script can print anything it likes.
$gateNow = New-OrderedMap
foreach ($rel in ($staged.Keys | Where-Object { $_ -clike 'gate/*' } | Sort-Object)) { $gateNow[$rel] = $staged[$rel] }
$gateNow['scripts/install.ps1'] = Get-BytesSha256 $selfBytes
$gateThen = New-OrderedMap
if ($manifest -and $manifest.gate) { foreach ($g in $manifest.gate) { $gateThen[[string]$g.path] = [string]$g.sha256 } }
if (-not $gateThen.Count) { $gateLines = @('Gate: no gate recorded at the last install') }
else {
  $changes = @()
  foreach ($k in $gateNow.Keys) {
    if (-not $gateThen.Contains($k)) { $changes += "  added $k" } elseif ($gateThen[$k] -ne $gateNow[$k]) { $changes += "  changed $k" }
  }
  foreach ($k in $gateThen.Keys) { if (-not $gateNow.Contains($k)) { $changes += "  removed $(Format-Plain $k)" } }
  # @() keeps a one-line block an array: PowerShell unrolls a one-element array into its element.
  $gateLines = @(if ($changes) { @('Gate: CHANGED since the last install') + $changes } else { 'Gate: unchanged since the last install' })
}
if ($selfDiffers) { $gateLines += 'WARN: this install script differs from the committed copy; -Apply will refuse.' }

# --- the check -----------------------------------------------------------------
$pinFile = Join-Path $stage 'gate/grimoire/check.mjs.pin'
$pinned = Join-Path $stage 'gate/grimoire/check.mjs'
if (-not ((Test-Path -LiteralPath $pinFile -PathType Leaf) -and (Test-Path -LiteralPath $pinned -PathType Leaf))) {
  Stop-Refused 'the pinned check script or its pin file is missing.'
}
$pinText = [IO.File]::ReadAllText($pinFile, $utf8)
if ($pinText -cnotmatch '\Acommit ([0-9a-f]{40})\nsha256 ([0-9a-f]{64})\n\z') { Stop-Refused 'the pin file is not exactly "commit <40 hex>" and "sha256 <64 hex>".' }
$pinCommit, $pinSha = $Matches[1], $Matches[2]
if ((Get-Sha256 $pinned) -ne $pinSha) { Stop-Refused 'the pinned check script does not match its pin.' }

# Node, resolved as an application (never an alias or a function), and run by
# that exact path. On Windows only an .exe: a .cmd or .bat runs through cmd.exe.
$nodeCmd = Get-Command node -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $nodeCmd) { Stop-Refused "no Node found on PATH; the check needs Node $nodeMinMajor or later." }
$node = $nodeCmd.Source
if ($IsWindows -and [IO.Path]::GetExtension($node) -ne '.exe') { Stop-Refused "Node resolved to $node, which is not an .exe." }
$ver = Invoke-Node $node @('--version') $versionTimeoutMs
if ($ver.TimedOut -or $ver.ExitCode -ne 0 -or $ver.Stdout.Trim() -cnotmatch '\Av(\d+)\.\d+\.\d+\z') { Stop-Refused "Node at $node did not report its version." }
$nodeVersion = $ver.Stdout.Trim()
if ([int]$Matches[1] -lt $nodeMinMajor) { Stop-Refused "Node $nodeVersion at $node is older than $nodeMinMajor." }
Write-Host "Git: $git"
Write-Host "Node: $node ($nodeVersion)"
Write-Host "Pinned check: grimoire $pinCommit, sha256 verified"

# --- render --------------------------------------------------------------------
# The renderer runs from the stage, before seam A, through the same Node runner.
# The whole stage is hashed before it runs and again after it exits, so any
# change it makes there while it runs refuses. (A process it left behind could
# still write after the second hash; only the committed, fingerprinted
# renderer could do that, as any gate file could.) It writes the rendered rules file into a fresh folder
# outside the stage. That file is read once, and the one buffer is hashed,
# checked against the hash the renderer reported, and written into the stage
# as the rules file. From here on the rules file's staged hash is the rendered
# bytes' hash, so seam A checks, the install copies, the record holds and the
# drift check compares the rendered bytes. Its lines are parsed here alone,
# never with seam A's, so none can feed the INSTALL or SETTINGS parse.
#
# Before it runs, the user configuration file and its blocks folder get the
# reparse-attribute test: Node's lstat sees symbolic links and junctions, but
# reads other reparse points as plain files, so this is the first layer and the
# renderer's own checks the second. Hidden and system entries are included.
if (Test-ThroughLink $configRel) { Stop-Refused 'the user configuration file, or the pact folder that holds it, is a link or other reparse point.' }
if (Test-ThroughLink $blocksRel) { Stop-Refused 'the configuration blocks folder is a link or other reparse point.' }
$blocksPath = Resolve-Live $blocksRel
if (Test-Path -LiteralPath $blocksPath -PathType Container) {
  try { $blocksState = Get-TreeState $blocksPath } catch { Stop-Refused 'the configuration blocks folder could not be read.' }
  if (@($blocksState -split "`n" | Where-Object { $_ -clike 'link *' }).Count) { Stop-Refused 'the configuration blocks folder holds a link or other reparse point.' }
}
$rulesRel = 'claude/CLAUDE.md'
$rulesStaged = Join-Path $stage ($rulesRel -replace '/', [IO.Path]::DirectorySeparatorChar)
$renderer = Join-Path $stage 'gate/render.mjs'
if (-not (Test-Path -LiteralPath $renderer -PathType Leaf)) { Stop-Refused 'the renderer (gate/render.mjs) is missing.' }
if (-not $staged.Contains($rulesRel)) { Stop-Refused "the commit holds no $rulesRel." }
try { $stageBefore = Get-TreeState $stage } catch { Stop-Refused 'the stage could not be read before the renderer ran.' }
$renderOut = [IO.Directory]::CreateTempSubdirectory('pact-render-').FullName
$render = Invoke-Node $node @($renderer, $rulesStaged, $renderOut, $claudeHomeFull) $checkTimeoutMs
$renderLines = @($render.Stdout -split "`n" | Where-Object { $_ -ne '' })
Show-ProgramLines $renderLines 'render'
if ($render.StderrChars) { Write-Host 'The renderer wrote to stderr; it is not shown.' }
if ($render.TimedOut) { Stop-Refused "the renderer did not finish within $($checkTimeoutMs / 1000) s." }
if ($render.ExitCode -ne 0) { Stop-Refused "the renderer exited with code $($render.ExitCode)." }
if (-not $renderLines -or $renderLines[-1] -cne 'RESULT: pass') { Stop-Refused 'the renderer did not end with "RESULT: pass".' }
# Every line before RESULT matches one exact pattern, in these counts: one
# RENDERED; one CONFIG, either "none" or "user <hash>"; with "user", one
# DIGEST, which must be the digest of the reported hash, and at most one VALUE
# per known setting; with "none", neither.
$renderHash = $null; $configs = @(); $configDigest = $null
$configValues = New-OrderedMap   # setting -> value, in the renderer's order
foreach ($l in @($renderLines | Select-Object -First ($renderLines.Count - 1))) {
  if ($l -cmatch '\ARENDERED ([0-9a-f]{64})\z') {
    if ($renderHash) { Stop-Refused 'the renderer reported two output hashes.' }
    $renderHash = $Matches[1]
  } elseif ($l -ceq 'CONFIG none') { $configs += , @{ kind = 'none' } }
  elseif ($l -cmatch '\ACONFIG user ([0-9a-f]{64})\z') { $configs += , @{ kind = 'user'; sha256 = $Matches[1] } }
  elseif ($l -cmatch '\ADIGEST ([0-9a-f]{12})\z') {
    if ($configDigest) { Stop-Refused 'the renderer reported two configuration digests.' }
    $configDigest = $Matches[1]
  } elseif ($l -cmatch '\AVALUE (usage-pause) (0|[1-9][0-9]?|100)\z') {
    if ($configValues.Contains($Matches[1])) { Stop-Refused 'the renderer reported one setting twice.' }
    $configValues[$Matches[1]] = $Matches[2]
  } else { Stop-Refused 'the renderer printed a line the install does not read.' }
}
if (-not $renderHash -or $configs.Count -ne 1) { Stop-Refused 'the renderer did not report exactly one output hash and one configuration line.' }
$config = $configs[0]
if ($config.kind -ceq 'none') {
  if ($configDigest -or $configValues.Count) { Stop-Refused 'the renderer reported a digest or a value with no configuration.' }
} else {
  $wantDigest = (Get-BytesSha256 ([Text.Encoding]::ASCII.GetBytes("user $($config.sha256)`n"))).Substring(0, 12)
  if ($configDigest -cne $wantDigest) { Stop-Refused "the renderer's configuration digest is missing or does not match the configuration hash it reported." }
}
try { $stageAfter = Get-TreeState $stage } catch { Stop-Refused 'the stage could not be read after the renderer ran.' }
if ($stageAfter -cne $stageBefore) { Stop-Refused 'the renderer changed the stage.' }
$outEntries = @([IO.DirectoryInfo]::new($renderOut).GetFileSystemInfos('*', [IO.EnumerationOptions]@{ AttributesToSkip = 0; IgnoreInaccessible = $false }))
if ($outEntries.Count -ne 1 -or $outEntries[0].Name -cne 'CLAUDE.md' -or $outEntries[0] -isnot [IO.FileInfo] -or
  ($outEntries[0].Attributes -band [IO.FileAttributes]::ReparsePoint) -or $outEntries[0].Length -gt 1MB) {
  Stop-Refused 'the renderer did not leave exactly one plain rules file of at most 1 MiB.'
}
$renderedBytes = [IO.File]::ReadAllBytes($outEntries[0].FullName)
# Not $renderedHash: PowerShell names ignore case, so that would be -RenderedHash.
$rulesHash = Get-BytesSha256 $renderedBytes
if ($renderedBytes.Length -gt 1MB -or $rulesHash -cne $renderHash) { Stop-Refused "the rendered rules file's hash does not match the one the renderer reported." }
[IO.File]::WriteAllBytes($rulesStaged, $renderedBytes)
$staged[$rulesRel] = $rulesHash
Remove-Item -LiteralPath $renderOut -Recurse -Force
$renderOut = $null

$seamA = Join-Path $stage 'gate/seam-a.mjs'
if (-not (Test-Path -LiteralPath $seamA -PathType Leaf)) { Stop-Refused 'the check (gate/seam-a.mjs) is missing.' }
$run = Invoke-Node $node @($seamA, $stage) $checkTimeoutMs
$rawLines = @($run.Stdout -split "`n" | Where-Object { $_ -ne '' })
Show-ProgramLines $rawLines 'seam-a'
if ($run.StderrChars) { Write-Host 'The check wrote to stderr; it is not shown.' }
if ($run.TimedOut) { Stop-Refused "the check did not finish within $($checkTimeoutMs / 1000) s." }
if ($run.ExitCode -ne 0) { Stop-Refused "the check exited with code $($run.ExitCode)." }
if (-not $rawLines -or $rawLines[-1] -cne 'RESULT: pass') { Stop-Refused 'the check did not end with "RESULT: pass".' }

# The copy set: seam A's INSTALL lines must match this script's own reading of
# the stage exactly, by staged path, live path and hash. Matching here is
# case-sensitive, as seam A's is, so the two cannot read one name two ways.
$checked = New-OrderedMap   # staged rel -> @{ dest; sha256 }
foreach ($l in $rawLines) {
  if ($l -cmatch '\AINSTALL ([0-9a-f]{64}) (\S+) (\S+)\z') {
    if ($checked.Contains($Matches[2])) { Stop-Refused 'the check listed one file twice.' }
    $checked[$Matches[2]] = @{ dest = $Matches[3]; sha256 = $Matches[1] }
  }
}
$expected = New-OrderedMap
foreach ($rel in $staged.Keys) {
  if ($rel -clike 'gate/*' -or $rel -ceq 'AGENTS.md' -or $rel -ceq 'claude/settings.overlay.json' -or $rel -ceq 'familiars/.gitkeep') { continue }
  if ($rel -cmatch '\Afamiliars/[^/]+\.(contract|practice-test)\.md\z') { continue }
  if ($rel -cmatch '\Aclaude/(.+)\z') { $expected[$rel] = $Matches[1] }
  elseif ($rel -cmatch '\Afamiliars/([^/]+\.md)\z') { $expected[$rel] = "agents/$($Matches[1])" }
  elseif ($rel -ceq 'cross/cross.mjs') { $expected[$rel] = 'pact/cross.mjs' }
  else { $expected[$rel] = $null }
}
$setOk = $checked.Count -eq $expected.Count
foreach ($rel in $expected.Keys) {
  if (-not $setOk) { break }
  $c = $checked[$rel]
  $setOk = $c -and $c.dest -ceq $expected[$rel] -and $c.sha256 -ceq $staged[$rel]
}
if (-not $setOk) { Stop-Refused "the check's copy set does not match the install's own reading of commit $commit." }

# The overlay the merge uses: read once, and only if its bytes are the ones the
# check passed and the commit holds.
$settingsLines = @($rawLines | Where-Object { $_ -clike 'SETTINGS *' })
if ($settingsLines.Count -ne 1 -or $settingsLines[0] -cnotmatch '\ASETTINGS ([0-9a-f]{64}) claude/settings\.overlay\.json\z') {
  Stop-Refused 'the check did not report exactly one settings overlay hash.'
}
$settingsHash = $Matches[1]
if (-not $staged.Contains('claude/settings.overlay.json')) { Stop-Refused 'the commit holds no settings overlay.' }
$overlayBytes = [IO.File]::ReadAllBytes((Join-Path $stage 'claude/settings.overlay.json'))
$overlayHash = Get-BytesSha256 $overlayBytes
if ($overlayHash -cne $settingsHash -or $overlayHash -cne $staged['claude/settings.overlay.json']) {
  Stop-Refused "the settings overlay's hash does not match the one the check passed."
}
$overlay = Read-JsonObject ($utf8.GetString($overlayBytes))
if ($null -eq $overlay) { Stop-Refused 'the settings overlay is not a JSON object.' }
$pactAsk = [string[]]@($overlay['permissions']['ask'])
Write-Host "Check: passed on commit $commit"
Write-Host "Partly checked: the rendered CLAUDE.md's marked clauses are checked word for word, and its open text for form, routing and the roster, not for meaning; line numbers in seam A's lines count the rendered file."

$repoFiles = New-OrderedMap   # live rel path -> sha256 of the staged copy
$sourceOf = New-OrderedMap   # live rel path -> staged rel path
$seenDest = @{}             # case-insensitive, as the live disk may fold case
foreach ($rel in $checked.Keys) {
  $dest = $checked[$rel].dest
  $why = Get-SkipReason $dest
  if ($why) { Stop-Refused "$why for an install destination: $dest." }
  if ($seenDest.ContainsKey($dest.ToLowerInvariant())) { Stop-Refused "two files install to $dest." }
  $seenDest[$dest.ToLowerInvariant()] = $true
  $repoFiles[$dest] = $checked[$rel].sha256
  $sourceOf[$dest] = $rel
}

# --- plan ----------------------------------------------------------------------
$drift = @(); $overwrite = @(); $add = @(); $delete = @(); $same = 0
$entries = @()
if ($manifest) {
  foreach ($e in $manifest.files) {
    $why = Get-SkipReason $e.path
    if ($why) { $warnings += "$why in the install record, skipped: $($e.path)" } else { $entries += $e }
  }
  foreach ($e in $entries) {
    $p = Resolve-Live $e.path
    if (-not (Test-Path -LiteralPath $p -PathType Leaf)) { $drift += "$($e.path) (deleted since the install)" }
    elseif ((Get-Sha256 $p) -ne $e.sha256) { $drift += "$($e.path) (changed since the install)" }
  }
  $delete = @($entries | Where-Object { -not $repoFiles.Contains($_.path) } |
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

$liveExists = Test-Path -LiteralPath $settingsFile
$live = if ($liveExists) { Read-JsonObject ([IO.File]::ReadAllText($settingsFile, $utf8)) } else { New-OrderedMap }
$merged = $null; $settingsChanges = @(); $settingsNotes = @()
if ($null -eq $live) {
  $settings = 'not a strict JSON object: left untouched'
  $settingsNotes = @('WARN: settings.json is not a strict JSON object (a comment, a trailing comma or another root); the merge leaves it untouched, and nothing in it was checked.')
} else {
  $merged = Get-MergedSettings $live $overlay
  if (-not $liveExists) { $settings = 'would be created from the overlay' }
  else {
    $settings = if ((Get-Canonical $live) -ceq (Get-Canonical $merged)) { 'unchanged' } else { 'would be merged' }
    $settingsNotes = @(Get-LiveSettingsLines $live $overlay $pactAsk)
  }
  $settingsChanges = @(Get-SettingsChanges $live $overlay)
}
$manifestStale = $manifest -and $manifest.commit -ne $commit
$gateStale = $gateLines[0] -cne 'Gate: unchanged since the last install'
# The configuration against the record: stale when a file was added, changed
# or removed since the last install, even if the render came out the same.
$userHash = if ($config.kind -ceq 'user') { $config.sha256 } else { $null }
$lastUser = if ($lastConfig.Contains('user')) { $lastConfig['user'] } else { $null }
$configStale = $userHash -cne $lastUser
$nothing = -not ($overwrite -or $add -or $delete -or $settings -like 'would*' -or $manifestStale -or $gateStale -or $configStale -or -not $manifest)

# The Configuration block, built from the renderer's parsed lines alone.
$configBlock = @()
if ($config.kind -ceq 'none') {
  $configBlock += '  no configuration'
  if ($lastConfig.Count) { $configBlock += '  the last install had a configuration; this install removes it from the rules file' }
} else {
  $since = if (-not $manifest) { 'no install recorded' } elseif (-not $lastUser) { 'new since the last install' }
  elseif ($lastUser -ceq $userHash) { 'unchanged since the last install' } else { 'CHANGED since the last install' }
  $configBlock += "  user file ${configRel}: sha256 $userHash, $since"
  $configBlock += "  configuration digest: $configDigest"
  $configBlock += "  rendered rules file: sha256 $rulesHash"
  foreach ($k in $configValues.Keys) { $configBlock += "  WARN: the user configuration sets $k to $($configValues[$k])." }
  $configBlock += '  Open text is checked for form, routing and the roster, not for meaning.'
}

Show-List 'Drift' $drift
Show-List 'Overwrite' $overwrite
Show-List 'Add' $add
Show-List 'Delete' $delete
foreach ($w in $warnings) { Write-Host "WARN: $(Format-Plain $w)" }
Write-Host "Unchanged: $same"
Write-Host "settings.json: $settings"
if ($settings -like 'would*') { foreach ($l in $settingsChanges) { Write-Host $l } }
foreach ($l in $settingsNotes) { Write-Host $l }
Write-Host 'Configuration:'
foreach ($l in $configBlock) { Write-Host $l }
if ($dirty.Count) { Write-Host "Working tree: DIRTY ($($dirty.Count) path(s)); the check ran on commit $commit, and uncommitted edits are not checked. -Apply will refuse." }
else { Write-Host 'Working tree: clean' }
if ($nothing) { Write-Host 'Nothing to do.' }
# The gate block comes last, after the check's own output, so nothing the
# check prints can stand in for it.
Show-Gate

# A hash given is always compared, dry run or -Apply, configuration or not: so
# a configuration changed or deleted since the dry run refuses.
$hashGiven = $PSBoundParameters.ContainsKey('RenderedHash')
if ($hashGiven -and $RenderedHash -cne $rulesHash) {
  Stop-Refused 'the hash given with -RenderedHash is not the full hash of the rules file this run rendered: the configuration or the commit changed since the dry run, or the hash was cut short or mistyped.'
}
if (-not $Apply) {
  if ($config.kind -cne 'none') { Write-Host "Dry run only. After the owner's go-ahead, pass -Apply -RenderedHash $rulesHash" }
  else { Write-Host 'Dry run only. Pass -Apply after the owner''s go-ahead.' }
  exit 0
}
if ($config.kind -cne 'none' -and -not $hashGiven) {
  Stop-Refused 'a configuration applies, so -Apply needs the full rendered hash the dry run showed, given with -RenderedHash.'
}
if ($selfDiffers) { Stop-Refused 'this install script differs from the committed copy.' }
if ($drift) { Stop-Refused 'live files drifted since the last install.' }
if ($dirty.Count) { Stop-Refused 'the working tree is not clean.' }
if ($null -eq $live) { Stop-Refused "settings.json is not a strict JSON object, so the pact's guard cannot be merged into it; fix the file first." }

# --- apply ---------------------------------------------------------------------
# Every staged byte is re-hashed before the first write.
foreach ($rel in $repoFiles.Keys) {
  $src = Join-Path $stage ($sourceOf[$rel] -replace '/', [IO.Path]::DirectorySeparatorChar)
  if ((Get-Sha256 $src) -ne $repoFiles[$rel]) { Stop-Refused "the staged copy of $rel changed after the check." }
}
Write-Host 'Applying.'
Show-Gate
New-Item -ItemType Directory -Force -Path $ClaudeHome | Out-Null
foreach ($rel in $delete) { Remove-Item -LiteralPath (Resolve-Live $rel) -Force; Write-Host "deleted $rel" }
foreach ($rel in @($overwrite) + @($add)) {
  $dest = Resolve-Live $rel
  New-Item -ItemType Directory -Force -Path (Split-Path $dest -Parent) | Out-Null
  Copy-Item -LiteralPath (Join-Path $stage ($sourceOf[$rel] -replace '/', [IO.Path]::DirectorySeparatorChar)) -Destination $dest -Force
  Write-Host "installed $rel"
}
if ($null -eq $merged) { Write-Host "WARN: $settingsFile is not a JSON object; left untouched" }
elseif ($settings -like 'would*') {
  $tmp = "$settingsFile.pact-tmp"
  [IO.File]::WriteAllText($tmp, ((ConvertTo-Json $merged -Depth 100) + "`n"), $utf8)
  Move-Item -LiteralPath $tmp -Destination $settingsFile -Force
  Write-Host 'merged settings.json'
}

# The record names the configuration beside the commit: each file the render
# read, by kind and hash, and the digest, so "installed commit X" stays true.
$doc = [ordered]@{
  commit = $commit
  digest = $configDigest
  config = @(if ($userHash) { [ordered]@{ kind = 'user'; sha256 = $userHash } })
  files  = @($repoFiles.Keys | ForEach-Object { [ordered]@{ path = $_; sha256 = $repoFiles[$_] } })
  gate   = @($gateNow.Keys | ForEach-Object { [ordered]@{ path = $_; sha256 = $gateNow[$_] } })
}
$tmp = "$manifestFile.pact-tmp"
[IO.File]::WriteAllText($tmp, ((ConvertTo-Json $doc -Depth 10) + "`n"), $utf8)
Move-Item -LiteralPath $tmp -Destination $manifestFile -Force

# --- verify: live against the checked bytes -------------------------------------
$bad = 0
foreach ($rel in $repoFiles.Keys) {
  $p = Resolve-Live $rel
  if ((Test-Path -LiteralPath $p) -and (Get-Sha256 $p) -eq $repoFiles[$rel]) { Write-Host "OK       $rel" }
  else { Write-Host "MISMATCH $rel"; $bad++ }
}
foreach ($rel in $delete) {
  if (Test-Path -LiteralPath (Resolve-Live $rel)) { Write-Host "MISMATCH $rel (should be deleted)"; $bad++ }
}
# The guard, in the file Claude Code reads, compared exactly: every pact "ask"
# rule, and auto mode.
$after = if (Test-Path -LiteralPath $settingsFile) { Read-JsonObject ([IO.File]::ReadAllText($settingsFile, $utf8)) } else { $null }
$ap = if ($after -is [System.Collections.IDictionary]) { $after['permissions'] } else { $null }
$guardOk = $ap -is [System.Collections.IDictionary] -and $ap['defaultMode'] -is [string] -and $ap['defaultMode'] -ceq 'auto' -and
  $ap['ask'] -is [System.Collections.IList] -and -not @($pactAsk | Where-Object { @($ap['ask']) -cnotcontains $_ })
if ($guardOk) { Write-Host "OK       settings.json (the pact's ask rules and auto mode)" }
else { Write-Host "MISMATCH settings.json (the pact's ask rules or auto mode are missing)"; $bad++ }
if ($bad) { Write-Host "$bad mismatch(es)."; exit 1 }
$withConfig = if ($configDigest) { "configuration $configDigest" } else { 'no configuration' }
Write-Host "Installed commit $commit with $withConfig; all files verified."
exit 0
} finally {
  foreach ($d in @($stage, $renderOut)) {
    if ($d -and (Test-Path -LiteralPath $d)) { Remove-Item -LiteralPath $d -Recurse -Force -ErrorAction SilentlyContinue }
  }
}

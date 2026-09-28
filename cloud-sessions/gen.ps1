$ErrorActionPreference = 'Stop'
# Regenerates the config section of cloud-setup.sh and cloud-setup-wrapper.sh
# in place, from the repo copies: CLAUDE.cloud.md, claude/agents/*.md and
# claude/settings.overlay.json. Never reads the live ~/.claude.
$d = $PSScriptRoot
$repo = Split-Path $d -Parent
$utf8 = New-Object Text.UTF8Encoding($false)
$DELIM = '__CLAUDE_CONFIG_EOF__'

$files = [ordered]@{ 'CLAUDE.md' = "$d\CLAUDE.cloud.md" }
Get-ChildItem "$repo\claude\agents\*.md" | Sort-Object Name | ForEach-Object { $files["agents/$($_.Name)"] = $_.FullName }

$overlay = [IO.File]::ReadAllText("$repo\claude\settings.overlay.json", $utf8).TrimEnd("`n")
if ($overlay.Contains("'")) { throw "single quote in settings.overlay.json" }
[void]($overlay | ConvertFrom-Json)

$sb = New-Object Text.StringBuilder
[void]$sb.Append([IO.File]::ReadAllText("$d\tpl-config-head.sh", $utf8))
$embedded = 0
foreach ($k in $files.Keys) {
  $body = [IO.File]::ReadAllText($files[$k], $utf8)
  if (($body -split "`n") -contains $DELIM) { throw "delimiter inside $k" }
  if (-not $body.EndsWith("`n")) { throw "$k lacks a trailing newline" }
  $embedded += $utf8.GetByteCount($body)
  [void]$sb.Append("write_config $k <<'$DELIM'`n$body$DELIM`n`n")
}
$tail = [IO.File]::ReadAllText("$d\tpl-config-tail.sh", $utf8)
if (-not $tail.Contains('__SETTINGS_OVERLAY__')) { throw 'no overlay placeholder in tail' }
[void]$sb.Append($tail.Replace('__SETTINGS_OVERLAY__', $overlay))
$config = $sb.ToString()
$expected = $files.Count + 1   # every embedded file, plus the settings merge

$resultLine = 'echo "$CONFIG_WRITTEN config files written (expected ' + $expected + ')"'
foreach ($name in 'cloud-setup.sh', 'cloud-setup-wrapper.sh') {
  $path = "$d\$name"
  $orig = [IO.File]::ReadAllText($path, $utf8)
  $s = $orig.IndexOf('echo "== Config"'); $e = $orig.IndexOf('echo "== Result"')
  if ($s -lt 0 -or $e -lt $s) { throw "no Config/Result markers in $name" }
  $new = $orig.Substring(0, $s) + $config + $orig.Substring($e)
  $new = [regex]::Replace($new, 'echo "\$CONFIG_WRITTEN config files written \(expected \d+\)"', { $resultLine })
  if (-not $new.Contains($resultLine)) { throw "no result line in $name" }
  if ($new.Contains("`r")) { throw "CR in $name" }
  [IO.File]::WriteAllText($path, $new, $utf8)
  "${name}: $($utf8.GetByteCount($new)) bytes"
}
"embedded file bytes: $embedded; files: $($files.Count); expected config writes: $expected"

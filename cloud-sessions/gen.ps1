$ErrorActionPreference = 'Stop'
$d = $PSScriptRoot
$utf8 = New-Object Text.UTF8Encoding($false)
$DELIM = '__CLAUDE_CONFIG_EOF__'

$files = [ordered]@{ 'CLAUDE.md' = "$d\CLAUDE.cloud.md" }
Get-ChildItem "$env:USERPROFILE\.claude\agents\*.md" | Sort-Object Name | ForEach-Object { $files["agents/$($_.Name)"] = $_.FullName }

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
[void]$sb.Append([IO.File]::ReadAllText("$d\tpl-config-tail.sh", $utf8))

$orig = [IO.File]::ReadAllText("$d\cloud-skills-setup.sh", $utf8)
$orig = $orig.Replace('# Reinstall global Claude Code skills and plugins in a fresh cloud container.', '# Reinstall global Claude Code skills, plugins and config in a fresh cloud container.')
$i = $orig.IndexOf('echo "== Result"')
if ($i -lt 0) { throw 'no Result marker' }
$new = $orig.Substring(0, $i) + $sb.ToString() + $orig.Substring($i)
$old = 'skills present"' + "`n" + 'exit 0'
if (-not $new.Contains($old)) { throw 'tail not found' }
$new = $new.Replace($old, 'skills present"' + "`n" + 'echo "$CONFIG_WRITTEN config files written (expected 10)"' + "`n" + 'exit 0')
if ($new.Contains("`r")) { throw 'CR in output' }
[IO.File]::WriteAllText("$d\cloud-setup.sh", $new, $utf8)
"script bytes: $($utf8.GetByteCount($new)); embedded file bytes: $embedded; files: $($files.Count)"

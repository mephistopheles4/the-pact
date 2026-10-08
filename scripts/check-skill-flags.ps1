param(
  [string]$SkillsDir = (Join-Path $HOME '.claude\skills'),
  [string]$RulesFile = (Join-Path $HOME '.claude\CLAUDE.md')
)
$ErrorActionPreference = 'Stop'
# Read-only. Reads a rendered rules file (by default the installed one) and
# checks, in its "Implementing a change" section, every skill installed under
# -SkillsDir that the text names:
#   - a command (`/name`) is a skill only the owner starts, so it must carry
#     disable-model-invocation: true;
#   - a code span (`name`) is a skill the agent uses, so it must not.
# A command is a code span whose whole text is "/" and a name: a letter or
# digit, then letters, digits, ".", "_" or "-". A bare /name in prose, a
# placeholder such as `/<skill>`, and a span holding more than the command
# (an argument) are not commands. gate/tests/no-skill-names.test.mjs uses the
# same definition. Gated blocks are skipped: they are held word for word by the
# gate. A skill written both ways is checked in both forms. Until the pact's
# new text is installed, the default file (the installed one) holds the old
# text and will warn; pass -RulesFile with a rendered copy of the repo's file.
# $openParts below must equal OPEN_MARKS in gate/tests/helpers.mjs (a test
# checks it). Prints a WARN: line per mismatch, then a summary line when there is
# none. Exits 0 either way.

$utf8 = New-Object Text.UTF8Encoding($false)
$md = [IO.File]::ReadAllText($RulesFile, $utf8)

$m = [regex]::Match($md, '(?ms)^## Implementing a change\s*$(.*?)(?=^## |\z)')
if (-not $m.Success) { throw "no 'Implementing a change' section in $RulesFile" }
$section = $m.Groups[1].Value

# Drop the gated blocks. The open parts of an unrendered file stay.
$openParts = @('config-notice', 'usage-pause', 'move-1', 'move-2', 'move-3', 'move-4-extra')
$section = [regex]::Replace($section, '(?ms)^[ \t]*<!-- pact:begin (?<n>[a-z0-9-]+) -->$.*?^[ \t]*<!-- pact:end \k<n> -->$', {
  param($g) if ($openParts -contains $g.Groups['n'].Value) { $g.Value } else { '' }
})

# 1. Code spans in the section: a command (`/name`) or a bare name (`name`).
$nameRe = '[A-Za-z0-9][A-Za-z0-9._-]*'
$commands = [System.Collections.Generic.List[string]]::new()
$agentSkills = [System.Collections.Generic.List[string]]::new()
foreach ($span in [regex]::Matches($section, '`([^`\r\n]+)`')) {
  $text = $span.Groups[1].Value
  $c = [regex]::Match($text, "^/($nameRe)$")
  if ($c.Success) { $commands.Add($c.Groups[1].Value) }
  elseif ($text -match "^$nameRe$") { $agentSkills.Add($text) }
}

# 2. Keep the names that are folders under -SkillsDir.
function Test-Installed([string]$n) { Test-Path -LiteralPath (Join-Path $SkillsDir $n) -PathType Container }
$commands = @($commands | Select-Object -Unique | Where-Object { Test-Installed $_ })
$agentSkills = @($agentSkills | Select-Object -Unique | Where-Object { Test-Installed $_ })

# 3. Compare each skill's frontmatter flag with the form the text uses.
function Test-Flagged([string]$n) {
  $skillMd = Join-Path (Join-Path $SkillsDir $n) 'SKILL.md'
  if (-not (Test-Path -LiteralPath $skillMd -PathType Leaf)) { return $false }
  $lines = [IO.File]::ReadAllText($skillMd, $utf8) -split "\r?\n"
  if ($lines.Count -eq 0 -or $lines[0].Trim() -ne '---') { return $false }
  for ($i = 1; $i -lt $lines.Count -and $lines[$i].Trim() -ne '---'; $i++) {
    if ($lines[$i] -match '^\s*disable-model-invocation\s*:\s*true\s*$') { return $true }
  }
  return $false
}
$warnings = 0
foreach ($name in $commands) {
  if (-not (Test-Flagged $name)) {
    "WARN: $name is written as a command (only the owner starts it) but lacks disable-model-invocation: true"; $warnings++
  }
}
foreach ($name in $agentSkills) {
  if (Test-Flagged $name) {
    "WARN: $name is written as a code span (the agent uses it) but has disable-model-invocation: true"; $warnings++
  }
}

# 4. Summary.
$named = @($commands + $agentSkills | Select-Object -Unique).Count
if ($warnings -eq 0) { "named skills: $named; commands: $(@($commands).Count); OK" }
exit 0

param(
  [string]$SkillsDir = (Join-Path $HOME '.claude\skills'),
  [string]$ClaudeMd = (Join-Path (Split-Path $PSScriptRoot -Parent) 'claude\CLAUDE.md')
)
$ErrorActionPreference = 'Stop'
# Read-only. Checks that the user-only skill list in the pact's "Implementing
# a change" section matches the disable-model-invocation flags of the skills
# installed under -SkillsDir. Prints a WARN: line per mismatch, then a
# summary line when there is none. Exits 0 either way.

$utf8 = New-Object Text.UTF8Encoding($false)
$md = [IO.File]::ReadAllText($ClaudeMd, $utf8)

$m = [regex]::Match($md, '(?ms)^## Implementing a change\s*$(.*?)(?=^## |\z)')
if (-not $m.Success) { throw "no 'Implementing a change' section in $ClaudeMd" }
$section = $m.Groups[1].Value

# 1. Named skills: backticked names in the section that are folders under -SkillsDir.
$named = [regex]::Matches($section, '`([A-Za-z0-9][A-Za-z0-9._-]*)`') |
  ForEach-Object { $_.Groups[1].Value } | Select-Object -Unique |
  Where-Object { Test-Path -LiteralPath (Join-Path $SkillsDir $_) -PathType Container }

# 2. User-only list: the backticked names before "carry" in wording 1's first sentence.
$flat = ($section -replace '\s+', ' ')
$w1 = [regex]::Match($flat, 'Some named skills are yours to start, not mine: (.*?) carry `disable-model-invocation`')
if (-not $w1.Success) { throw "no user-only skill sentence in $ClaudeMd" }
$userOnly = [regex]::Matches($w1.Groups[1].Value, '`([^`]+)`') | ForEach-Object { $_.Groups[1].Value }

# 3. Compare each named skill's frontmatter flag with the list.
$warnings = 0
foreach ($name in $named) {
  $skillMd = Join-Path (Join-Path $SkillsDir $name) 'SKILL.md'
  $flagged = $false
  if (Test-Path -LiteralPath $skillMd -PathType Leaf) {
    $lines = [IO.File]::ReadAllText($skillMd, $utf8) -split "\r?\n"
    if ($lines.Count -gt 0 -and $lines[0].Trim() -eq '---') {
      for ($i = 1; $i -lt $lines.Count -and $lines[$i].Trim() -ne '---'; $i++) {
        if ($lines[$i] -match '^\s*disable-model-invocation\s*:\s*true\s*$') { $flagged = $true }
      }
    }
  }
  $listed = $userOnly -contains $name
  if ($listed -and -not $flagged) {
    "WARN: $name is listed as user-only but lacks disable-model-invocation: true"; $warnings++
  } elseif ($flagged -and -not $listed) {
    "WARN: $name has disable-model-invocation: true but is not listed as user-only"; $warnings++
  }
}

# 4. Summary.
if ($warnings -eq 0) { "named skills: $(@($named).Count); user-only: $(@($userOnly).Count); OK" }
exit 0

# The apply guard catches what text matching can, and names the rest

Superseded by [ADR 0042](0042-the-apply-guard-asks-on-any-command-naming-the-install.md) (2026-10-09): the rules now ask on any command that names the install, and the twelve spelling rules are retired.

The "ask" rules that stop a session before the install's `-Apply` are a speed bump on the usual route, not a boundary. They catch every spelling whose command text holds the script's name followed by a parameter dash or a splat. Every other spelling is a named, accepted miss.

## What it covers

- **The guard, as one rule.** A command prompts the owner before `-Apply` when its text holds the script's file name followed by a parameter dash or a splat.
  - **The file name** is `install.ps1` under the PowerShell tool, matched without regard to case, and `nstall.ps1` under the Bash tool, matched exactly.
  - **A parameter dash** is a hyphen, U+2013, U+2014 or U+2015. PowerShell's parser takes only these four as a parameter's dash; nine other dash-like characters were tried and read as plain words.
  - **A splat** is one plain space and then `@`.
- **The rules:** the original four, plus a splat rule and one rule per dash for each tool, twelve in all. Seam A requires all twelve whatever the settings allow-list says. Each dash is written as a `\u` escape everywhere a rule is written, and the dry run prints any character outside printable ASCII, and the backslash, as `\u` and four hex digits.
- **The misses, accepted on #1:**
  - (a) strings built at run time;
  - (b) the script named without its literal file name;
  - (c) the file name in another letter case through the Bash tool;
  - (d) a splat after any separator other than one plain space.
  - An apply step inside a block (a `;` chain, `try`/`catch`, an `&` script block) was probed and prompts, so it is not a miss.
- **Scope:** interactive sessions whose settings came from the install script. Background sessions wait on #107. Cloud setup containers wait on #111.
- **Reopen trigger.** The owner re-decides this option (A, patch and accept) against moving the guard into the install script (B) if #107 finds that background sessions skip "ask" rules, or if a block-wrapped apply step is ever seen not to prompt.
- **Posting text that names the script.** The rules match command text, not only calls. A command that names the script next to an em dash or a hyphen prompts, prose included. Post long text that names the script through `--body-file`, never inline.

## Why

- **The docs rule out more.** Claude Code's permissions page says a rule "matches the command text Claude writes" and "isn't a security boundary around the program". No rule set catches a string built at run time, so adding rules for those would claim a strength the guard can't have.
- **The threat is a misread go-ahead,** not a session set on getting past the guard. A session that wanted to could already copy files by hand, an accepted risk since #1's S8. Eight list entries close every text-visible spelling seen so far, and leave the gated clause alone.
- **Option B costs more than it buys today.** Moving the guard into the install script changes the gated clause, so a session would hand the owner the command instead of running it. Hand copies would stay open. It becomes worth it only if a reopen trigger fires.
- **Escapes, so a reviewer can see the character.** A typed en dash looks like a hyphen in review and in a console. An escape can't be mistaken, and a test keeps the rule files ASCII.
- **Only two of the new rules are proved live.** In the control run, six of the eight new spellings already prompted before their rules existed, most likely through a check built into Claude Code. The owner chose to keep those six as a backstop. A future session should not read their presence as proof that the rule text is what stops them.

## How this was decided

- **2026-10-07** — Decided in mephistopheles4/the-pact#89. The owner signed off spec revision 2 with option A and its reopen trigger. The build is #108.

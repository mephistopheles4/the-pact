# Installing, and changing what installs

Read this before you install, roll back, change configuration, tools or a project install, or touch the builder page or the cloud copy.

## Changes here reach every project

`claude/` is a payload, not documentation. Once installed, an edit there changes
how every session in every repo behaves. So:

- **Edit the repo copy, never the live file.** A direct edit to `~/.claude/`
  drifts from the repo.
- **Install with [`gate/install.mjs`](../../gate/install.mjs)**, run from the repo
  root under Node 24 or later (Windows, macOS or Linux), with `NODE_OPTIONS`
  cleared: `$env:NODE_OPTIONS = $null; node gate/install.mjs` in PowerShell,
  or `env -u NODE_OPTIONS node gate/install.mjs` in a POSIX shell. Never copy
  files by hand. The script installs from the clone, not through a symlink,
  so a checked-out branch is never live until you install it.
- **Run it without an option first.** That is a dry run: it prints the files
  it would overwrite, add and delete, whether live files drifted since the
  last install (it compares them with `~/.claude/.pact-install.json`), the
  commit it would install, and the apply command to run next. If there is
  drift, stop and ask rather than overwrite. Its output names the home
  folder and the live settings' names, so post only its verdict and counts,
  never the raw output.
- **The install is gated.** A small bootstrap stages HEAD's files (never the
  working tree) in a temp folder and starts the runner from there, so every
  check runs committed code. The runner runs the pact's own check, seam A, on
  the staged files, and copies only the files that check listed. It refuses
  when the check fails or can't run. The dry run also shows the Node it used
  and whether the gate changed since the last install. The gate checks
  install mechanics only: what each file is and where it goes, that each
  agent file still parses, the text scanner, and the settings overlay. What
  the pact's files say is vetted like any skill, by the owner reading them
  (ADR 0069). The gate's tests run through one runner; see
  [gate tests](gate-tests.md).
- **Keep the how-to in step.** [`docs/install.md`](../../docs/install.md) quotes
  the script's output, lists what the settings merge sets, and names every
  agent the install puts in place, and the Tools block's WARN line. A change
  to any of them updates the how-to in the same change;
  `gate/tests/install-howto.test.mjs` checks the settings, the agents and the
  Tools block's WARN line.
- **Install only on the owner's go-ahead.** Show the owner the dry run, then
  pass `--apply` only after they say so in chat. `--apply` refuses on drift or
  a dirty working tree.
- **`--apply` needs `--commit`,** the full commit id the dry run printed, and
  refuses if HEAD names another commit. The dry run prints the whole apply
  command; run it as printed.
- **The script confirms the hashes.** After `--apply` it re-hashes every live
  file against the bytes it checked and installed: the rendered bytes for the
  rules file, and the repo copy for every other file. It exits non-zero on a
  mismatch. Check that it exited zero.
- **It deletes only pact files:** those the last manifest lists that the repo
  dropped. Your own agents and skills are never touched. An agent file the
  pact didn't write, or one changed since it wrote it, is yours: the dry run
  lists it under "Yours, left as is", and the install never overwrites,
  deletes or records it (#262). Delete your file to get the pact's back.
- **Configuration.** The owner's settings live in `~/.claude/pact/config.json`
  (an example is [`examples/pact-config/config.json`](../../examples/pact-config/config.json)).
  Its edits to open parts take their text from block files in
  `~/.claude/pact/blocks/` (examples are in
  [`examples/pact-config/blocks/`](../../examples/pact-config/blocks/)).
  The installer reads them, never writes, deletes or lists them, and renders
  them into the rules file. The dry run's Configuration block shows each
  file's hash and whether it changed since the last install, the configuration
  digest, the full rendered hash, and one warning per value set and per part
  edited. When a configuration applies, `--apply` needs that full rendered hash
  handed back as `--rendered-hash <hash>`, and refuses if it does not match this
  run's render. A pact from before edits (#94) refuses a file that has any, so
  to install such a commit, empty the edit list first.
- **The parts Scriptorium builds.** Seven open parts, `moves`, `tiers`,
  `sensitive`, `workflow`, `lenses`, `qualities` and `cost-limits`, can be
  edited in the home configuration only; a project configuration may edit no
  part (#262, #278). An edit to any of the six but `moves` gets
  the dry run's security-defaults line, before every other warning: it names
  the parts and says whether the configuration changed since the last
  install. A Qualities edit with no Enough column also gets a note line after
  it, since the Cost limits then reach no lens. A pact from before #262
  refuses an edit to these parts, and one from before #278 refuses an edit to
  `cost-limits`; it installs a home Qualities block with an Enough column as
  written, and its lenses then read cost names that no part defines, with no
  one rule and no security bar, so remove that column too. An older builder
  also refuses a builder file with a `costLimits` key or an Enough on a quality
  row. To roll back past either, remove those edits first. The `usage-pause-session` setting
  (#142) sets the 5-hour session limit beside the weekly `usage-pause`; unset,
  the rules file has no session line.
- **Agent settings.** The file's `agents` key may set any pact agent's
  `model` and `effort`, `scout` included (#262). The model is any model
  Claude Code takes: an alias such as `opus`, `sonnet`, `haiku`, `fable` or
  `inherit`, or a full or provider model ID: one word, with no space or line
  break, so it stays one frontmatter line (ADR 0069). A value YAML can't read
  as text is refused when seam A reads the rendered agent file. The effort is `low`, `medium`, `high`, `xhigh` or `max`. Each
  agent's own file holds its default. The installer renders and installs each
  set agent's file with those two lines changed, and warns about each setting
  in the dry run. No setting is marked, a security-set lens's included: a
  person may run any agent on any model, and the pact does not test the
  settings it doesn't ship (ADR 0067). The model is the person's
  own text: the dry run's warnings and the review folder's files carry it, so
  share them by verdict and counts only; the installed notice names a model
  other than those five aliases only as "a custom model". A pact from before
  #262 refuses any model but `opus` and `sonnet`, an effort above `high` and
  any setting for `scout`; one from before agent settings (#97) refuses a
  file that has an `agents` key, and one from before #97's unlock refuses a
  setting for any lens but `integrity-lens`. To install such a commit, remove
  what it refuses first.
- **Tools.** The pact's tools live in `claude/tools/`, one file each, on the
  gate's list of tools, which the install core keeps a copy of (#280). A tool
  is off unless the home configuration's `tools` list names it, as
  `"tools": ["poster"]`; a project configuration may not hold the list, and
  no preset or shared builder file turns one on. A tool that is on installs
  to `pact/tools/<name>.mjs`, gets a `WARN` line in the dry run, and fills its
  marked part of the rules file, which stays empty while it is off. The cloud
  copy installs none. A pact from before #280 refuses a configuration with a
  `tools` key, so to roll back past it, remove the key first (ADR 0074).
- **The builder page.** [`builder/scriptorium.html`](../../builder/scriptorium.html)
  builds a configuration without writing JSON. After a change to the pact
  text, the renderer's lists, the example blocks or a preset in
  `builder/presets/`, run `node builder/build.mjs` to refresh it; a gate test
  fails until you do. A
  person's own builder comes from the `/scriptorium` command
  ([`claude/commands/scriptorium.md`](../../claude/commands/scriptorium.md)),
  which every install puts in place with the builder kit under
  `~/.claude/pact/builder/`. It reads their skills, commands, agents and
  configuration, keeps the result in `~/.claude/pact/builder.json`, and
  renders a page that carries those lists in plain text. The kit also reads
  the person's own presets from `~/.claude/pact/presets/`, a folder the
  install never writes, lists or deletes, and the page lists them under
  "Your presets" with their agent rows unticked; a clone's run reads none
  (ADR 0085). Such a page belongs
  outside any repo: `build.mjs` refuses to write one inside this clone or
  any git work tree, the kit, the Claude home folder, any `.claude` folder,
  or over a file.
- **Review output.** To read what a configuration does before installing it,
  add `--review-folder <full path>`. Once every check for the run has passed, the
  script writes `rendered-rules.txt` and `config.diff` (the change from the
  no-configuration render) there. The folder must be new or empty, and outside
  the Claude home folder and any `.claude` folder. Without the option, a dry
  run changes nothing on disk.
- **Project install.** To make the pact stricter in one repo, add
  `--project-folder <full path>`. It reads the project's
  `.claude/pact-config.json`, which may only set values strictly tighter than
  your own, but for two things: a `qualities` list, which takes the place of
  the home list in that repo, and a `costLimits` list that goes with it (#278).
  A quality row is a quality, a measure and a list of lenses, with an optional
  `enough` level and `enoughCosts` names; a cost row is a cost with optional
  `counted`, `limit` and `atLimit`; each field is one line, at most nine rows,
  compiled into tables under fixed text, and the cost fields refuse a bar, and the cost name a middle dot.
  `costLimits` needs `qualities`, an `enoughCosts` name must find a cost row
  in the same file, and `acceptedRisks` is no key. The dry run leads with a
  security-defaults line for them (ADR 0068), and a note line when a project
  has its own qualities and no `costLimits`. A pact from before #278 refuses
  a project `costLimits` key and an `enough` or `enoughCosts` field, so
  remove them first. It writes one rules file, `.claude/rules/pact-project.md`, with a
  record beside it. It installs nothing in the Claude home folder and no
  agents into the project. It refuses a project with no configuration file, a
  project that is or holds your home folder, or is, holds or sits inside a
  Claude folder, any link on its write path, and an existing rules file it has
  no record of writing. Like a home install it is a dry run first, and
  `--apply` needs the project rules file's full rendered hash, given as
  `--rendered-hash <hash>`. On a project install that hash binds the bytes
  installed, not the configuration files: a file changed after the dry run
  still installs if it renders the same bytes, which can never be looser
  than the configuration the dry run showed.
- **The cloud copy is generated.** `cloud-sessions/` holds the setup script
  for Claude Code cloud sessions. `cloud-sessions/gen.mjs` builds it, and
  `CLAUDE.cloud.md`, from the payload, through the same render and seam A a
  home install uses. After any change to `claude/`, `familiars/`
  or the templates, regenerate it with `NODE_OPTIONS`
  cleared: `$env:NODE_OPTIONS = $null; node cloud-sessions/gen.mjs` in
  PowerShell, or `env -u NODE_OPTIONS node cloud-sessions/gen.mjs` in a POSIX
  shell. `gate/tests/cloud-sessions.test.mjs`, in the `fast` tier, fails until
  you do. When the wrapper changes, the owner pastes the merged
  `cloud-sessions/cloud-setup-wrapper.sh` into the cloud environment's setup
  field again and checks the first session's setup log for the generator's
  `pact cloud copy <marker>` line; the generator prints that reminder.
  Read every change to `cloud-sessions/` and to that test closely: the
  script is published, runs as root, and carries the pact's rules and a
  settings overlay (ADR 0038).

## Rolling back

An older pact installs with that commit's own installer.
Rollback is supported only to commits on the published `main` from the Node
install's cutover (#166, `6821d68`) on. **Before checking out a commit to
roll back to,** check it, with no checkout:
1. Resolve it to its full id: `git rev-parse --verify "<commit>^{commit}"`.
   Run every check below on that id.
2. It holds `gate/install.mjs`: `git cat-file -e <id>:gate/install.mjs`
   succeeds.
3. It descends from the cutover:
   `git merge-base --is-ancestor 6821d68f002b2e5307332ba067c049e403f950b0 <id>`
   succeeds.
4. It is on the published `main`: after
   `git fetch https://github.com/mephistopheles4/the-pact.git main`,
   `git merge-base --is-ancestor <id> FETCH_HEAD` succeeds.

If any check fails, don't check the commit out, never run an installer from
it, and stop to ask the owner. Check first, because an older commit's own
`AGENTS.md` presents a PowerShell installer as the route, and nothing but
this check stands before one (the threat model's R22). From a commit that
passes, check out exactly that id and run only `gate/install.mjs`, dry run
first.

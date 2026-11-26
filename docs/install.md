# Install the pact

This how-to installs the pact: its own files into its home folder, `~/.pact`,
and the rules file, agents and `/scriptorium` command into Claude Code's folder,
`~/.claude`, with its settings merged into yours. It takes about five minutes.

Read the README's [Who it's for](../README.md#who-its-for) first. The rules
are written for one person's setup, and installing them changes every
Claude Code session on your machine.

**Where these steps were tried:**

- **Windows:** a real install over an earlier one, dry run and `--apply`
  (Windows 11, Node 24), and the dry run in CI on every pull request
  (Windows Server 2025, Node 24, under Git Bash).
- **Linux:** the dry run in CI on every pull request (Ubuntu, Node 24), and
  the gate's tests, which install into throwaway folders, in the repo's Linux
  container (`gate/tests/fixtures/linux/`).
- **macOS:** as for Linux, in CI's `gate-macos` (macOS 15 arm64).
- **`/agents` (step 6):** checked on Windows only.

<!-- toc -->

- [Before you install](#before-you-install)
- [Where the pact installs](#where-the-pact-installs)
  - [Skill links](#skill-links)
  - [Codex's shell environment policy](#codexs-shell-environment-policy)
- [Before the first install into `~/.pact`](#before-the-first-install-into-pact)
- [1. Check the prerequisites](#1-check-the-prerequisites)
- [2. Clone the repo](#2-clone-the-repo)
- [3. Where the install keeps backups](#3-where-the-install-keeps-backups)
- [4. Run the dry run and read it](#4-run-the-dry-run-and-read-it)
- [5. Install with `--apply`](#5-install-with---apply)
- [6. Check in a fresh session](#6-check-in-a-fresh-session)
- [Install by prompt](#install-by-prompt)
- [Updating later](#updating-later)
- [The session stop switch](#the-session-stop-switch)
- [The auto-compact window and its hooks](#the-auto-compact-window-and-its-hooks)
- [The guard in Codex and Antigravity](#the-guard-in-codex-and-antigravity)
- [Roll back to an older version](#roll-back-to-an-older-version)
- [Known limits](#known-limits)
- [Undo an apply](#undo-an-apply)

<!-- /toc -->

## Before you install

The rules reach beyond your machine in two ways. Decide on each before you
install, because the install copies the rules as your clone's last commit
holds them:

- **They keep the work's record where your project keeps it,** often an issue
  tracker. A session reads tiers, approvals and decisions there. The pact carries no rule on whose
  text counts there: it leaves that to judgment. Before you use the rules on
  a tracker where others can comment, keep that tracker private, or write
  your own rule into the repo's `AGENTS.md` or a doc it points to, as this repo does.
- **Review reports, security findings included, go to the work's record** word
  for word, so choose its visibility knowing that.

[The threat model](threat-model.md) says what the pact accepts and what is
still open. Read it before you decide.

Where the dry run asks for "the owner's go-ahead", the owner is you.

## Where the pact installs

`~` is your home folder. `~/.pact` holds the pact's own files: your
configuration (`config.json`, `blocks/`), the builder file, presets, page and
kit, the review procedure, the tools, the hook, your pins, the compaction
hand-offs (`handoffs/`), the install record (`install.json`) and the backups.
`~/.claude` holds only what Claude Code reads there. No environment variable
moves `~/.pact`.

A **harness** is a program the rules install into. The pact knows three, in
[`harnesses/known.json`](../harnesses/known.json): `claude` (Claude Code),
`codex` and `antigravity`. The install writes each one's rules, and the agents
of Claude Code and Codex; Antigravity gets none yet.
[Skill links](#skill-links) give Codex and Antigravity the commands, and
[the guard](#the-guard-in-codex-and-antigravity) adds a hook to those two.

- **Detection.** A known harness is found when its `detect` folder exists
  (`~/.claude`, `~/.codex`, `~/.gemini/config`).
- **The install list.** The `harnesses` key of `~/.pact/config.json` names who
  is installed into, as `"harnesses": {"install": ["claude"]}`. With no list,
  every found known harness is in, unless its description sets
  `defaultInstall` to `false`; your own harness is in only when the list names
  it. A harness the last install recorded stays in when its folder is gone, with
  a warning.
- **Taking one out.** Leave it out of the list: the next apply removes every
  file and settings entry the record holds for it, after backing them up. An
  empty list removes everything the pact installed.
- **Your own harness** goes under `harnesses.own`, as a description with the
  fields of the known ones (spec 0007, S5). A description the pact can't take
  refuses (`harness-id`, `harness-format`, `harness-path`,
  `harness-shape`, `harness-field`).

### Skill links

Codex and Antigravity get each command that is on as a skill. The pact keeps the
skill in `~/.pact/skills/<name>`, and links `<name>` in the harness's skills
folder (`~/.agents/skills`, `~/.gemini/config/skills`) to it: a directory
junction on Windows, a symlink elsewhere. The dry run lists each link it makes
or removes. Where no link can be made, it warns, and the apply copies the
folder's files instead. A folder of yours with a skill's name is left as it is,
listed under `Yours, left as is:`. A link the pact made that you have since
replaced is drift. The install removes only the links and copied folders that
its record lists.

### Codex's shell environment policy

Codex hands the shells it starts every variable it was started with. While
Codex is in the install, the apply puts one line first in
`~/.codex/config.toml`:

```toml
shell_environment_policy.ignore_default_excludes = false # the pact: secret-named variables stay out of the shells Codex starts
```

Variables with `KEY`, `SECRET` or `TOKEN` in their name, in any case, then stay
out of those shells, a lens's included. A command that reads one there, such as
`gh` reading `GH_TOKEN`, no longer finds it; `gh` then uses its stored login,
if it has one.

- **Where a value stays readable.** The line only drops the name from the
  environment Codex hands its shells. The value is still wherever you set it: a
  shell profile, which a login shell reads again, a saved Windows user variable,
  a `.env` file or a credential store. And the poster, run from a Codex shell,
  can no longer refuse a post that holds it. This was probed on Windows only.
- **What still gets through.** Other names, such as `DB_PASSWORD`,
  `AWS_CREDENTIALS`, `CONNECTION_STRING` and `GITHUB_PAT`. Hooks see every
  variable. A trusted project's `.codex/config.toml`, or a `-c` flag, can set
  it back.
- **Your own policy** is left as it is, with a `WARN:`, when the file names
  `shell_environment_policy` outside a comment. Set
  `ignore_default_excludes = false` there for the same effect.
- **Later.** A deleted line is added again, and your own policy in its place is
  yours. The pact's line changed, moved under a table, or beside a policy of
  your own is drift. Taking Codex out of the install removes the line.

## Before the first install into `~/.pact`

This is for a machine with an install from before `~/.pact`, whose files sit
under `~/.claude`. The pact migrates nothing, and reads none of the old paths.
Do it yourself, once, in one sitting, straight before the apply, with no other
session running:

1. If `agent-identity` is on, set it to `false` in
   `~/.claude/pact/config.json` and apply with the old install, as
   [Turning it off](agent-identity.md#turning-it-off) says, so no session pushes
   through a gitconfig that has moved.
2. Move `config.json`, `blocks/`, `builder.json` and `builder.json.bak`,
   `presets/`, `github.json`, `linear.json`, the `gh-app-*.gitconfig` files and
   `handoff/` (to `handoffs/`) from `~/.claude/pact/` to `~/.pact/`. Delete the
   old page, `~/.claude/pact/scriptorium.html`: it holds your configuration.
3. In `~/.claude/settings.json`, take out the pact's entries: each rule the old
   record, `~/.claude/.pact-install.json`, lists under `cleanerDeny`,
   `cleanerAsk` and `stopDeny`, the `env` keys under `identityEnv`,
   `autoCompactWindow`, the hooks that call `pact/hooks/compact-handoff.mjs`,
   `permissions.defaultMode` and `skipAutoPermissionPrompt` (the next install
   sets the last two again, and records them). Then delete each file the record
   lists under `~/.claude`, and the record itself.
4. Copy any lines of your own in `~/.codex/AGENTS.md` and
   `~/.gemini/AGENTS.md` into a configuration block.
5. Rewrite every replaced part of your configuration that names a model in role
   terms (planning, executor, light), through Scriptorium or by hand.
6. Move your hand copies of the pact into `~/.pact/backups/hand-copies/`:
   `~/.gemini/config/plugins/the-pact/`, the whole `~/.codex/AGENTS.md`, and
   `~/.gemini/AGENTS.md` if it exists. The pact owns those files from here.
7. Run the dry run. A `WARN:` that a rules file exists and the record does not
   list it marks a copy step 3 or 6 missed.
8. After the apply, and any sessions that push with your own credentials, set
   `agent-identity` to `true` in `~/.pact/config.json`, run
   `node claude/tools/gh-app.mjs refresh --provider claude` in your clone, once
   per provider, and apply again.

While the dry run says the pact does not build Antigravity's agent format,
moving `~/.gemini/config/plugins/the-pact/` leaves Antigravity without the
pact's agents.

Backups under `~/.claude/pact/backups/` stay where they are. Never sync, share
or commit that folder either.

## 1. Check the prerequisites

You need:

- **Claude Code.**
- **Node 24 or later.** The install script is a Node script, and refuses an
  older Node.
- **git.** The install reads the clone's committed files through git.

See the README's [Depends on](../README.md#depends-on) for what the rules
themselves expect, such as the models they name and the optional skills.

## 2. Clone the repo

```sh
git clone https://github.com/mephistopheles4/the-pact.git
cd the-pact
```

Run every later step from this folder, the repo root. The install copies from
the clone's last commit, never from files you have changed but not committed.
So commit any edit you make to the rules before step 4.

## 3. Where the install keeps backups

Every `--apply` first copies what it will replace into
`~/.pact/backups/<name>/`, where `<name>` is the time in UTC and the
commit the apply installs, such as `20261018T143005123Z-addaa8a`; the backup
holds your files from before that commit. It copies each file it
overwrites or deletes, `settings.json` when it merges or writes it, and the
install record. A `manifest.json` lists each copy with its SHA-256, and each
file the apply adds as `absent`, so [Undo an apply](#undo-an-apply) can put
everything back. If the copy can't be made in full, the apply refuses and
changes nothing. An agent of yours that shares a pact agent's name is left as
it is, and so is a pact agent you edit after an install: the pact manages only
the agent files it wrote and still holds as it wrote them.

- **An install from before backups has none,** so keep your own copies of `~/.claude/CLAUDE.md`,
  `~/.claude/settings.json` and `~/.claude/agents/` until you are sure you won't
  uninstall: no backup holds the files your first install replaced.
- **Every apply takes one,** an apply with nothing to do included. The
  install keeps the ten newest, and each backup taken with no install record
  before it, such as your first install's, until you delete it. So ten applies
  push out an older backup: copy aside one you mean to keep.
- **The copies are plain and unencrypted.** Your settings file can hold API
  keys, and a key you rotate stays in the old copies until they are pruned or
  you delete them. On Linux and macOS the install gives the backups owner-only
  modes (`700` and `600`); an access-list entry inherited from `~/.pact` on
  macOS can still widen them, and `ls -le` shows one. On Windows they take the
  `~/.pact` folder's access list, and they hold your settings file's older contents
  (out of scope: they stay on your machine; see the [threat model](threat-model.md#scope)'s Scope). To see who that list lets in,
  or to narrow it, open the folder's Properties in Explorer and its Security
  tab, or run `icacls "$env:USERPROFILE\.pact"` in PowerShell. A list for you
  alone holds your account, SYSTEM and Administrators.
- **Never sync, share or commit the backups folder.** Any copy you make
  yourself, a backup copied aside or your own copies from before backups,
  belongs outside the clone and any synced or shared folder, readable only by
  you, and deleted once you are sure of the install.
- **The prune leaves some entries alone:** a backup named later than the
  newest apply's, and anything it doesn't recognise as a backup. Each may hold
  a copy of your settings until you delete it. The dry run counts the entries
  it doesn't recognise, and the apply warns of the backups named later.
- **To delete backups,** delete their folders under `~/.pact/backups/`
  yourself, or the whole folder once you are sure of the install.

## 4. Run the dry run and read it

In PowerShell:

```powershell
$env:NODE_OPTIONS = $null; node gate/install.mjs
```

In a POSIX shell:

```sh
env -u NODE_OPTIONS node gate/install.mjs
```

With no option, the script writes nothing in your home folder. It
still runs code from your clone, with your rights: the install script and the
pact's check. So run it only on a clone you trust. It refuses if
`NODE_OPTIONS` is set, because a preload could change what the checks see.
It checks the committed files and prints what an install would do. The output
names your home folder, so mask your username before you share it. Read these
parts:

- **`Install from commit …`.** The commit it would install. Compare it with
  the commit the repository page shows.
- **`Check: passed on commit …`.** If the check fails, the script refuses and
  installs nothing.
- **`Not checked: what the pact's files say.`** The check covers install
  mechanics only: what each file is, where it goes, and that it is clean
  text. Read the pact's files as you would any skill you install.
- **`Harnesses:`.** Each harness, in or out, and whether it was found. The
  parts from `Drift:` to `settings.json:` then come in blocks: `== pact home
  (.pact) ==` for the pact's own files, then one per harness. Those from
  `Backup:` on print once. A harness you described with hooks
  gets `guards unverified for <id>`.
- **`Drift:`.** On a later install, the number of installed files and
  settings entries changed since the last one. If it isn't 0, stop: `--apply` refuses, and you
  would lose those edits. On a first install it is 0.
- **`Overwrite:`, `Add:` and `Delete:`.** The files `--apply` would replace,
  create and remove. On a first install, a rules file you already have, such as
  your own `~/.claude/CLAUDE.md`, is listed with a `WARN`, and `--apply`
  refuses until you move it out of the way: the pact owns the whole file, so put
  your own text in your configuration. After an install from before `~/.pact`,
  do [the one-time removal](#before-the-first-install-into-pact) instead.
  `Delete` lists only files an earlier pact install put there, or, on a first
  install, an agent named `builder`, `spec-builder` or `security-builder`,
  which older pact versions shipped.
- **`Yours, left as is:`.** Agent files the pact leaves alone: one it didn't
  write, such as your own agent with a pact agent's name, or one it wrote
  that you have changed since. The install never overwrites, deletes or
  records them, and a changed pact agent is not drift. Delete your file to
  get the pact's back at the next install.
- **A retired agent's name.** The pact retired `good-enough-lens`, and
  three warnings name it, each with fixed words and never your text:
  - `WARN: agents/good-enough-lens.md is named for good-enough-lens, an
    agent the pact retired; ...` appears on every dry run while that file is in
    your agents folder and the install isn't deleting it. The file isn't the
    pact's, so the install leaves it as is. Delete it yourself, or keep it;
  - `WARN: the user configuration's <part> block names good-enough-lens ...`
    names the part whose edit block still holds the name, as a whole word.
    Take the name out, and where it sat in the spec pair of a workflow or
    lenses block, put `unstated-lens` in its place, as the pact's own Design
    row reads;
  - `WARN: the project configuration's qualities list names good-enough-lens
    ...` is the same for a project's own qualities list.

  The install goes ahead on all three. A configuration whose `agents` key sets
  the retired lens is different: the render refuses it, and the message says to
  remove the key.
- **`settings.json:`.** What the merge into `~/.claude/settings.json` would
  change. Your other keys stay. The merge:
  - turns on auto mode (`permissions.defaultMode` set to `auto`) and skips its
    opt-in prompt (`skipAutoPermissionPrompt`). To keep auto mode off, set
    `defaultMode` back after the install. Every later `--apply` sets it to
    `auto` again, and its dry run warns you first. Neither key counts as drift,
    and taking Claude Code out removes each one the install set, unless you have
    changed its value;
  - takes out the ask rules (`permissions.ask`) an older pact added. The
    pact sets no ask rules, bar one exception: the cleaner's two,
    added only while the cleaner is on. Claude Code guards its own folder and
    `~/.claude.json`, and in auto mode its classifier weighs the rest. The
    dry run's `- permissions.ask:` lines name each rule it removes, matched
    exactly, and a `NOTE:` line counts them (the cleaner's two ask rules print
    the same kind of line when you turn the cleaner off, and the `NOTE:` line
    does not count them). A rule of your own that only looks like one stays. Every install removes these exact strings again, so
    a rule you want back must differ from the listed text. The install's apply, a `gh` command on rulesets or branch
    protection, and a dry run that writes to a review folder never prompt
    you;
  - sets `autoCompactWindow` and merges the pact's five hook entries by key,
    while `auto-compact-window` is on. Their lines print in the
    `auto-compact-window:` block under this one, with each hook event added,
    updated or removed (see the next section).
- **`Backup: <n> file(s) to copy into .pact/backups/ before the first write`.**
  What `--apply` copies first (step 3), ending `(settings.json included)` when
  the merge writes your settings. The dry run doesn't preview the prune: it
  doesn't say which old backups the apply will remove (step 3). Three warnings
  may follow it:
  - `WARN: .pact/backups holds <n> leftover staging folder(s) ...` names what
    an apply that stopped mid-backup left. Each may hold a copy of your
    settings: check it and delete it, since `--apply` refuses while one is
    there;
  - `WARN: .pact/backups holds <n> entry(ies) the install does not recognise as
    backups; ...` counts what the prune leaves as it is;
  - `WARN: .pact/backups is not a plain folder: ...` says a link, a file or
    another reparse point sits where the backups go. `--apply` refuses until
    you move it out of the way.
- **`Configuration:`.** With no `~/.pact/config.json` of your own,
  the pact's default configuration renders: Level 3 · Full, the builder's
  shipped preset. The block names it with its digest, the rendered hash the
  apply command carries, and a `WARN` line per part it edits. If
  the last install had your own configuration and the file is gone now, a
  line says so. To keep the pact's own text instead, write a configuration of
  your own: `{"schema": 1}` alone renders the pact's text with only the
  configuration notice added. If you do have one, it is used whole, never
  mixed with the default: the block lists each setting and edit, and a
  rendered hash the apply command carries. A project install never takes the
  default. The default's workflow names skills on the stages only, and its
  sensitive list is auth, crypto and data migrations: the pact text's own
  also holds input validation. It names no skill sources, so the dry run shows
  no `skills:` block and nothing is fetched. A session uses a skill only if
  you installed it, or if a repo you work in carries one of that name.
- **`WARN: SECURITY DEFAULTS:`.** Shown before every other warning when your
  configuration, or the pact's default in its place, edits any of the six parts Scriptorium builds that set
  security defaults: `tiers`, `sensitive`, `workflow`, `lenses`, `qualities`
  or `cost-limits`. They hold the tier table, what Claude looks for as
  sensitive work and the route it recommends, the workflow table with the
  lenses offered at each stage, the lens roster, the qualities with the
  lenses that check them and what each answers to, and the cost limits.
  A `NOTE:` line follows it when you edit `qualities` and the table has no
  Enough column: the shipped cost rows then reach no quality's lenses, so
  they limit the review itself, Hardening at 0 included, so no lens builds a
  guard for a path off the sensitive-work list that the project's threat model,
  if any, doesn't place in scope.
  The line names the parts you edit and says whether your configuration
  changed since the last install. Read those parts in the rendered rules file
  (`--review-folder` writes it out) before you install. Only your home
  configuration may edit them; a project's `.claude/pact-config.json` may
  edit no part. A project may hold its own `qualities` list, which takes the
  place of yours in that repo, and with it its own `costLimits` list, which
  takes the place of your cost limits there; its dry run leads with a `WARN:
  SECURITY DEFAULTS:` line saying so, with the row count of each.
  A project with its own `qualities` and no `costLimits` gets a `NOTE:` line
  after it: none of its qualities names your cost limits, so they limit the
  review itself there. Each quality
  row may carry `enough`, its level (one line, no middle dot, since the Enough cell joins the level and each `enoughCosts` name with it)
  and `enoughCosts`, and an `enoughCosts` name must
  find a cost row in that project's own `costLimits`. A cost row holds `cost`,
  and may hold `counted`, `limit` and `atLimit`, each one line of text with no
  bar, and the cost holds no middle dot either, since that joins the Enough
  cell; names match ignoring case and surrounding space. A cost row that no
  quality's Enough cell names, by its `enough` level or an `enoughCosts` name, limits the review itself in that
  repo, and gets one `NOTE:` line under the dry run's `Project:` heading,
  naming such rows by position; the install goes ahead. A project's `costLimits`
  refuses without its `qualities`, and an `acceptedRisks` key is refused as
  any other key is: accepted threat classes live only in a threat model.
- **`Commands:`.** The pact's own slash commands, `/make-it-so`, `/finis`,
  `/scriptorium` and `/scry`, each `on` or `off`, and `(not in this commit)` for one the
  commit doesn't hold yet. `/scriptorium` reads `on, always: part of the
  pact, with the builder kit under .pact/builder/`: it builds your own
  Scriptorium page, and installs whenever the commit holds it.
  The others are off until you turn them on: list a name in the `commands`
  key of `~/.pact/config.json`, for example
  `"commands": ["make-it-so", "finis"]`, or tick it in the builder's
  Settings. Each such command gets a `WARN` line naming the file it installs,
  `commands/<name>.md`. A list that still names `scriptorium` gets a `NOTE`
  asking you to take it out, since an older pact refuses it. The install
  refuses, naming the path inside your home folder:
  - **A same-named skill.** Anything at `~/.claude/skills/<name>`, a folder, a
    file or a link, for a command that is on. Claude Code would run that
    skill in place of the command. Rename or move it, or take the name out of
    the list. The install only checks that the path exists; it never reads,
    lists or changes your skills. It doesn't check a project's own skills or
    commands, a plugin's, or a command in a subfolder of your `commands/`
    folder, any of which may also share a pact command's name.
  - **Your own file at the command's path.** A `~/.claude/commands/<name>.md`
    the last install's record doesn't list. The pact didn't put it there, so
    it never overwrites it. Move it, or take the name out of the list.
  - **A bad list.** A `commands` value that is not a list of pact command
    names, each once. A project's `.claude/pact-config.json` may not hold
    `commands` at all.
  - **A command this commit doesn't hold.** A name the block marks
    `(not in this commit)` refuses. Leave it out of the list until a commit
    ships it.
- **`Tools:`.** The pact's own tools, the poster and the cleaner, each `on` or
  `off`, and `(not in this commit)` for one the commit doesn't hold. A tool
  is off unless you turn it on: list its name in the `tools` key of
  `~/.pact/config.json`, as `"tools": ["poster"]`, or tick it under
  Pact tools in the builder's Settings. A preset or a shared builder file
  never turns one on. Each tool that is on gets a `WARN` line, word for word:

  ```text
    WARN: the user configuration turns on the pact tool poster; it installs to .pact/tools/poster.mjs and posts and edits on GitHub as your gh account. Permission rules on gh commands don't see its calls, and its scan is a backstop, not a guarantee.
    WARN: the user configuration turns on the pact tool cleaner; it installs to .pact/tools/cleaner.mjs and removes worktrees and local branches in the repository it runs in, and stops a finished background session in a worktree it removes. Its deny rules on raw removal commands are a speed bump, not a gate.
  ```

  To turn Clef on, list `"clef"` in `tools`; after the apply, run `node ~/.pact/tools/clef.mjs setup`, then the same with `--yes` ([clef.md](clef.md)).

  The cleaner on adds eighteen deny rules on raw worktree and branch
  removal commands and on `claude rm` to `settings.json`, each listed under
  `settings.json` as `+ permissions.deny`, and records the ones it added in
  `install.json`'s `entries`; turning it off removes only those, also listed. A
  rule you wrote yourself stays. [cleaner.md](cleaner.md) lists them, and
  says how to run your own `claude rm`: from a separate terminal, outside
  Claude Code, because whether Claude Code's `!` shell mode honours deny rules
  is unmeasured. `claude rm <id>` deletes the session's worktree with
  everything left in it, so run it only after the cleaner has removed the
  worktree, or after checking the worktree yourself.

  It adds two ask rules on the cleaner's forced removal, `Bash(*cleaner.mjs*remove*--override*)`
  and its `PowerShell(...)` twin, each listed as `+ permissions.ask`, and records the ones it added in
  `install.json`'s `entries`; turning the cleaner off removes only those. They make Claude Code
  ask you before a `remove --override` runs, a speed bump and not a boundary: spellings that hide the
  words from the pattern get past it. If `settings.json` is not strict JSON the install leaves it
  untouched, so it adds neither the deny rules nor these, and the dry run and the apply print a `WARN:`
  line naming the two ask rules.

  The poster on adds its rule to the rules file, so the rendered hash
  changes; `--review-folder` shows the rule. Taking the name out of the list
  deletes the poster and its rule at the next install. The rule names the
  poster under `~/.pact`, so with `--home` elsewhere, leave `tools` empty. Before it posts, the poster checks that
  your `gh` login owns the repo, by name and again by GitHub's answer for the
  repo, so a repo you have transferred can't take a post. The install
  refuses:
  - **Your own file at the tool's path.** A `~/.pact/tools/<name>.mjs`
    the last install's record doesn't list (`unlisted-live`). Move it, or take
    the name out of the list. A live poster changed since the install is drift,
    never yours: the dry run lists it, and `--apply` refuses.
  - **A bad list.** A `tools` value that is not a list of pact tool names,
    each once (`config-tools`). A project's `.claude/pact-config.json` may not
    hold `tools` at all (`project-key`).
  - **A tool this commit doesn't hold.** A name the block marks
    `(not in this commit)` refuses at the check (`tools-not-in-pact`).
- **`skills:`.** Shown only when the configuration in force has a `skills`
  list: how many skill folders it names from how many repos, and each repo
  with its pin's first 12 characters. Each entry is
  `{"repo": "owner/name", "commit": "<40 hex>", "paths": ["<folder>", ...]}`:
  one entry per repo, a full commit id, and at most 100 paths in all, whose
  last segments, the skills' names, are unique. They are for the cloud setup
  to fetch, once it reads a configuration; until then nothing
  fetches them. This install fetches and installs none, and a session here
  uses one only if you installed it yourself, or if a repo you work in carries a skill of that name, which it then uses. The block names your repos, so
  share a dry run by its verdict and counts only. A bad list refuses (`config-skills`).
- **`NOTE: … other pact-install-* folder(s) in the temp folder`.** An install
  stopped hard, by a power cut or a killed process, leaves its work folder in
  your temp folder. It may hold your configuration text. Delete those
  `pact-install-*` folders by hand; the script never deletes them, because
  one could belong to an install still running.

The dry run names your home folder and your Node's path, which hold your
user name, and the names of your own settings. Post its verdict and counts on
a tracker, never its raw output.

A dry run asks nothing first, and it runs `gate/install.mjs` as it stands
in your working folder, uncommitted edits included. So on a branch that
changes the installer, run it with `--home` pointing at a throwaway
folder that holds an empty `.claude`: a bug in the code under edit then stays
away from your real home folder, though hostile code could still ignore the option. Nothing prompts
before a dry run or an apply.

The last lines print the apply command to run next.

## 5. Install with `--apply`

When the dry run reads right, run the apply command it printed, as printed.
It looks like this in PowerShell:

```powershell
$env:NODE_OPTIONS = $null; node gate/install.mjs --apply --commit <commit> --rendered-hash <hash>
```

The `--rendered-hash` binds the apply to the rules file the dry run showed,
yours or the pact's default; every apply line the dry run prints carries it, and a project install's binds its project rules file. The `--commit`
is the commit the dry run checked: if your clone moved on since, the apply
refuses, so run the dry run again. `--apply` also refuses on drift or a
working tree with uncommitted changes. After it copies the files, it checks
each one's hash again. A good install ends with:

```text
BACKUP STARTED
backed up <n> file(s) to .pact/backups/<name>
Applying.
...
pruned <k> old backup(s)
  <name of each>
Installed commit <commit> with the pact's default configuration <digest>; all files verified.
RESULT: pass
```

The `pruned` lines show only when the apply removed old backups (step 3).
These `WARN:` lines may follow, with or without them: `WARN: .pact/backups holds
<n> backup(s) named later than this run's; ...`, `WARN: .pact/backups holds <n>
entry(ies) the install does not recognise as backups; ...` and `WARN: the prune
of old backups in .pact/backups stopped on an error; ...`. Each leaves your
files as they are, and the install still passes.

It installs these files in your home folder:

- `.claude/CLAUDE.md`, the rules;
- `.claude/agents/`, nine agents: the eight lenses and `scout`;
- `.pact/review.md`, the review procedure the rules file points to before any
  lens runs, and `.pact/review-diagrams.md` beside it, its diagram format. If
  either file, unlisted in the install record, is already there, the install refuses and changes nothing: move your file out of the way;
- `.claude/commands/scriptorium.md`, always, and `.claude/commands/<name>.md` for each other
  pact command your `commands` list turns on. Taking a name out of the list
  deletes its file at the next install;
- `.pact/tools/poster.mjs`, only while your `tools` list turns the poster on.
  It posts and edits on GitHub as your `gh` account. Taking it out of the
  list deletes it at the next install;
- `.pact/tools/cleaner.mjs`, only while your `tools` list turns the cleaner
  on, with its deny rules and two ask rules in `settings.json`. Taking it out of the list
  deletes it and the rules it added at the next install;
- `.pact/tools/gh-app.mjs` and two `env` keys in `settings.json`, only while the
  `agent-identity` setting is on ([agent-identity](agent-identity.md));
- `.pact/builder/`, the builder kit `/scriptorium` runs: the builder
  (`builder/build.mjs` and its parts module), the shipped page and presets,
  the pact's agents, the renderer it checks parts with, the brand mark, the
  example builder file, the pact's default configuration
  (`builder/default-config/`, which the install renders from its stage, and
  its generator), copies of `review.md`, the pact commands and the settings
  overlay, for the page to show, and the rules as they stand before your
  configuration, as `claude/rules.source.md`. It holds no file named
  `CLAUDE.md`. The kit's builder writes a page by default to
  `.pact/scriptorium.html`, never a link or folder; the install leaves that
  file alone. Given `--out`, it writes only to a new file outside any repo,
  `~/.pact`, the Claude home folder and any `.claude` or `.pact` folder;
- `.claude/settings.json`, merged as the dry run showed;
- `.pact/install.json`, the record the next install compares against, written
  file by file, so an apply that stops leaves it matching the disk;
- `.pact/backups/`, a backup of what each apply replaced (step 3). No install
  record lists it, and the install never writes there except to back up and
  prune.

To keep presets of your own, create `~/.pact/presets/` yourself and
put builder files in it; `/scriptorium`'s page lists them under "Your
presets". The install never writes, lists or deletes that folder.

**How it writes `settings.json`.** It writes the merged file to a new file in
the same folder, then renames it over the old one. The file stays plain JSON,
unencrypted, which is the form Claude Code reads. On Linux and macOS it keeps
the file's mode, and a new file is readable only by you (`600`). On Windows
the new file takes its folder's access list, so a stricter list set on the
file alone is lost: restrict the `~/.claude` folder, not the file.

If an apply refuses because a `.pact-tmp` file is already there, an earlier
install stopped mid-write. The file may hold a copy of your settings. Check
it, delete it, and run the dry run again.

Run the dry run again if you like. It should print `Nothing to do.`

**Removing rules an older pact added.** The install takes out, by itself, the
56 ask rules it holds as retired: the 52 an older pact set, and the four
broad rules ADR 0049 retired. Some older pacts
added rules it doesn't know: two review rules,
`PowerShell(*install.mjs*--rev*)` and `Bash(*nstall.mjs*--rev*)`, and the rules that guarded the PowerShell
installer the pact used before the Node install. Do this after the install
above. Open `~/.claude/settings.json` in an editor yourself, and delete from
`permissions.ask` the two review rules, and every line that holds the search
text in ADR 0052's bullet "The owner's live settings are cleaned by hand".
Search for that text rather than copying lines: some of these rules hold dash
characters that look like hyphens on screen. This guide doesn't spell the
text out, so that a search of the live docs for that installer's file name
stays empty.

If a deleted line was the last in the list, also delete the comma now left
before `]`.

Don't ask a session to do any of this: the file can hold API keys, and a
session that reads it holds them in its context. If you copied the file
first, delete the copy yourself once the install works: it holds the same
keys, and keeps them after you change one. Then check two things yourself, not
through a session:

1. **None left:** your editor's search for `--rev*` and for ADR 0052's
   search text finds no match.
2. **Nothing else broken:** run the dry run again. It must show no
   `NOTE: settings.json holds …` line about retired ask rules, no
   `WARN: settings.json is not a strict JSON object …` line, and
   `settings.json: unchanged`. A neighbouring rule deleted by mistake, or a
   comma left before `]`, shows here.

## 6. Check in a fresh session

Start a new Claude Code session in a folder outside the clone, so it loads
only your installed files, and run `/agents`. A pass lists these nine:
`adversarial-lens`, `behaviour-lens`, `conventions-lens`, `data-lens`,
`executability-lens`, `integrity-lens`, `reader-lens`,
`unstated-lens` and `scout`.

## Install by prompt

You can hand the first install to a Claude Code session with this prompt. It
names the one address to clone from, and leaves the apply to you, because an
install is your call and nothing prompts before it. The apply backs up what
it replaces (step 3). The prompt installs the rules as published, without step 2's
edits:

> Clone the-pact from `https://github.com/mephistopheles4/the-pact`, and no other address, into a new, empty folder. Don't reuse or pull an existing clone. From the new clone's root, with `NODE_OPTIONS` unset, run `node gate/install.mjs` and show me the whole dry run, including its "Install from commit" line. Don't change anything else. Then show me the apply command the dry run printed, and stop. I'll run it myself.

Read the dry run as step 4 says, then run the apply command yourself.

## Updating later

If you checked out a reviewed commit last time, your checkout has no branch:
switch back to it first, such as `git switch main`. Then fast-forward the
repo (`git pull --ff-only`): a checkout behind the last install's commit
would roll the pact back, and the dry run warns about it.
If the fast-forward refuses, stop and find out why before you install. Read what
changed before you run anything: the dry run
runs the new code, and a session opened in the clone loads its project files.
The `commit` field of `~/.pact/install.json` names the last
install's commit; the dry run's `Last install:` line shows it too.
`git diff <that commit> HEAD` shows everything that arrived since, merges
included. Or check out a commit you have reviewed, at or after the last
install's commit. Then repeat steps 4 and 5;
the apply takes its own backup (step 3).
The dry run compares your live files with the record of the last install, so
it shows any you have edited since.

If the dry run shows drift, installed files or settings entries changed since
the last install, and `--apply` refuses. Whether to keep or replace those edits
is your decision. A settings entry you can put back by hand. Otherwise move
`~/.pact/install.json`, and every file its `files` list names, out of the way
and keep them: the next dry run reads as a first install, with no drift.
Moving the record alone is not enough, since a rules file, tool or command left
in place is then unrecorded and `--apply` refuses. That apply's backup holds
`settings.json` as it was, and the install keeps it until you delete it, as a
backup taken with no install record. After the apply, bring your edits back by
hand from what you moved, or carry them as a configuration (see below).

To change the pact's settings, such as the usage pause lines or a lens's
model, see `examples/pact-config/` and the config builder in `builder/`. Two
usage settings exist: `usage-pause`, the weekly line (75% by default; `false`
turns it off), and `usage-pause-session`, the 5-hour session line, unset
by default. The builder's Settings dialog holds both. Two more, `session-stop-deny` and `auto-compact-window`, have a section each. `checkpoint-stops` is retired: no checkpoint waits, and a configuration or project file that still sets it gets a dry-run WARN and the key is ignored. The canvas edits the workflow, Settings
the tiers and sensitive work, and the Agents dialog the lens roster, the
qualities and the cost limits; `examples/pact-config/config-parts.json` edits `tiers`, `sensitive`, `workflow`, `lenses` and `qualities`, with the
session line set. For a builder of your own, type `/scriptorium` in any
session.

## The session stop switch

`session-stop-deny` in `~/.pact/config.json` is
`true` or `false`, `false` when unset, and the builder's Settings dialog shows
it as Session stop. A project configuration may not set it, and a project
install never adds its rules. It has no part in the rules file; only the
notice line names it, as `session-stop-deny on` or `off`.

- **What it does.** While it is `true`, the install adds eight rules to
  `permissions.deny` in `settings.json`, each listed as `+ permissions.deny`:
  `claude stop *`, `claude kill *` (Claude Code's alias of stop),
  `claude daemon stop *` (stops the supervisor and, unless `--keep-workers` is passed, the sessions it hosts) and
  `claude respawn *` (restarts a session, or all with `--all`), each as a
  `Bash(...)` and a `PowerShell(...)` rule. It records the ones it added in
  `install.json`'s `entries`. Turning it off removes only rules that
  are both recorded and one of those eight, listed as `- permissions.deny`; an
  identical rule you wrote yourself stays. The cloud copy adds none of them.
- **Who turns it on.** Turn it on if you run Brigade (the session-manager
  mod), so that stops go through Brigade's own tool, not a raw
  `claude stop` from a session.
- **Why a switch.** The pact can't tell whether Brigade is installed, and the
  rules block a raw stop, kill, supervisor stop or respawn. It is off unless you
  turn it on. The cleaner's `claude rm` rules are separate: they come with the
  cleaner. While it is on, the cleaner stops no session itself: its own stop is a child process the rules don't see, so it holds it back.
- **A speed bump, not a gate.** Each rule is a suffix only: the command, then
  anything. A flag before the subcommand, a path-qualified or
  wrapped call, and any other spelling get past them, with the classifier
  behind them.
- **Your own `claude stop <id>`** (or kill, supervisor stop or respawn). A session never respawns another one; you do, by hand. Run it from a separate terminal, outside
  Claude Code. Whether Claude Code's `!` shell mode honours deny rules is
  **unmeasured**.
- **If Brigade's stop is refused.** Brigade's `stop_background_session` runs
  `claude stop` from the mod's own process, which permission rules don't see.
  A Brigade restart that runs `claude respawn` the same way is assumed the same; a refusal on a restart has the same way out.
  If the rule does catch it, the symptom is a
  permission refusal on Brigade's stop. The way out: set `session-stop-deny`
  to `false`, then a dry run and an apply on your word.
- **Rolling back.** Set it to `false` and apply first, then take the key out
  of the configuration. An older installer refuses a configuration that names
  it, even as `false`, and ignores `stopDeny`, so the eight rules would stay in
  `settings.json` looking like your own.

## The auto-compact window and its hooks

Every install, and every cloud session, sets Claude Code's auto-compact
window and installs a small hook that carries a session through compaction.
It needs Claude Code 2.1.318 or later, Node 24 or later (the
installer's own floor) and `node` on the PATH.

- **The setting.** `auto-compact-window` in `~/.pact/config.json` is
  a number of tokens, 100000 to 1000000 in steps of 10000, or `0` for off. It
  is on at 400000 when the key is unset, and the builder's Settings dialog
  shows it beside the usage limits. A project configuration may not set it.
  The install writes it to `autoCompactWindow` in `settings.json`; Claude Code
  then compacts a little below it, near 365000 to 370000 for 400000.
- **What installs when it is on.** `~/.pact/hooks/compact-handoff.mjs`,
  and five hook entries in `settings.json` that call it with `node`: on
  `PostToolUse`, `UserPromptSubmit`, `Stop`, `PreCompact` and `SessionStart`
  (matcher `compact`). Your own hooks, and other tools' hooks, stay as they
  were: a pact entry is a hook exactly like the one the
  overlay carries (its window aside) that calls the installed script. It is
  updated in place, and only it: a command of yours in the same entry stays. A
  missing one is added after the event's other entries, and a second copy is
  taken out. The dry run warns once per event that holds a hook the pact did
  not install, one that names the script but is not the pact's entry
  included, and lists each pact event it adds, updates or removes.
- **What the hook does.** Past the window minus 80000 tokens, it tells the
  session once per turn, until compaction, as a plain statement, that its
  hand-off file, `~/.pact/handoffs/<session id>.md`, is due an update.
  It asks the compaction summary to
  name that file, and after compaction puts the file's first 8 KB back into
  context, marked as the session's own notes, data and not instructions. It
  acts only in a main session, never blocks, and on any error does nothing.
  `CLAUDE_CODE_AUTO_COMPACT_WINDOW`, when set, replaces the window the hook
  reads. The `--autocompact` flag overrides the setting and the hook can't see
  it. The nudge line assumes the window you set: a model whose own context cap
  is lower, or an override the hook can't see, can compact a session before
  the nudge comes.
- **Off.** `0` removes the pact's hook entries (and an event or `hooks` they
  leave empty), the script, and an `autoCompactWindow` the pact set; a value
  you set by hand stays, with a note.
- **The cloud.** The cloud copy takes no configuration, so it always sets
  400000 and has no Off. To turn it off there, revert the cloud part of this setting
  (`gen.mjs`'s `--compact on`, the hooks block in `tpl-config-tail.sh`), run
  `node cloud-sessions/gen.mjs`, and merge that on the owner's word. After
  that merge, paste the merged `cloud-sessions/cloud-setup-wrapper.sh` into the
  cloud environment's setup field again and check the first session's setup
  log for the generator's `pact cloud copy <marker>` line.
- **Hand-offs stay.** The pact never deletes a hand-off or `.turn` file in
  `~/.pact/handoffs/`; clear them yourself when you like. They are
  notes a session wrote, kept unencrypted in a folder the hook creates for
  your account alone on Linux and macOS (on Windows the folder takes the
  pact folder's access), and they outlive turning the window off and
  Claude Code's own transcript clean-up. On macOS an access control list the
  folder inherits can grant another account access despite the owner-only
  mode; check with `ls -le`.

## The guard in Codex and Antigravity

Claude Code keeps its permission rules. Codex and Antigravity, and a harness of
your own whose hooks file takes either one's format, get the same rules from a
hook the install adds.

- **When.** Only while a rule is on (the cleaner, or the session stop switch)
  and the install takes such a harness. [cleaner.md](cleaner.md) lists the
  commands.
- **What it writes.** `~/.pact/guard/`: the guard, a wrapper per format, and
  `rules.json`, the rules that are on. And one `pact-guard` hook, run before a
  shell command, in each harness's hooks file (`~/.codex/hooks.json`,
  `~/.gemini/config/hooks.json`). Your own hooks stay, the record lists only the
  pact's entry, and the apply backs up each hooks file it changes.
- **On Windows** the install also writes a launcher beside each wrapper,
  `~/.pact/guard/<harness>.cmd`, and the hook calls it through `cmd.exe` and
  passes its exit code on, so one command works under PowerShell, where Codex
  runs hooks, and under `cmd`. A home path holding `%`, `!`, `^`, `&`, `$`, a
  backtick or a curly double quote refuses (`hook-command-path`), and so does
  one with no space that holds `(`, `)`, `;`, `,` or `=`.
- **A Windows home from Linux or macOS,** such as a WSL install into it,
  refuses (`guard-windows-home`) while a guard would be written: a home that
  holds `AppData` is a Windows one, and Windows couldn't run that hook.
- **Trust it in Codex.** Codex runs a hook only once you trust it: open
  `/hooks` and trust `pact-guard`, the one from `~/.codex/hooks.json`: another
  hooks file can use the name. Until then `codex exec` skips it and says
  nothing. The dry run and the apply say so when the entry
  is new or changed. An update to the guard or its rules needs no new
  trust, and trust never checks them.
- **What it answers.** It refuses a command a rule denies. A rule that asks
  prompts you in Antigravity and is refused in Codex. Any other command gets no
  answer, so the harness's own permissions decide. A guard that fails refuses
  every shell command with `The pact's guard failed (<code>); run the pact's
  dry run.`
- **A speed bump, not a gate.** Another spelling gets past it, a command inside
  `bash -c "..."` included, and so does one typed into a shell that is already
  running, which Codex runs no hook for. A hook that can't start or runs past
  15 seconds lets the command through. Outside Windows, a missing `node` or a
  crash the wrapper doesn't catch lets it through too; on Windows the launcher
  denies both, so there only a missing `cmd.exe` or launcher stops the hook from
  starting.
- **Refusals.** A hooks file that is not strict JSON, holds its hooks in another
  shape, or sits behind a link refuses the dry run. A pact entry changed since
  the install is drift.
- **Off.** Turning every rule off, or taking the harness out of the install
  list, removes the entry, and the files once no harness takes them. Do that and
  apply before you roll back to a commit without the guard.

## Roll back to an older version

**To a commit that installs into `~/.claude`.** Such an installer knows
nothing of `~/.pact`. In one sitting, with no other session running:

1. If `clef` is on, stop and remove it ([clef.md](clef.md)). Turn
   `agent-identity` off and apply.
2. Set `"harnesses": {"install": []}`, run the dry run and apply, which removes
   every recorded file and settings entry.
3. Check that `~/.pact/install.json` lists no file and no entry, and that each
   file the dry run named is gone.
4. Take the `harnesses` key out of your configuration, which an older installer
   refuses. Delete `~/.pact/scriptorium.html`. Move what you moved in the
   one-time removal back from `~/.pact/` to `~/.claude/pact/` (`handoffs/` to
   `handoff/`), and your hand copies back from `~/.pact/backups/hand-copies/`.
5. Do the checks and steps below, applying nothing more at the newer commit
   (that reinstalls the pact). Then turn `agent-identity` on at the old one.

Done when the older install's dry run shows no drift. The paths in the rest of
this section are that older layout's: `pact/` and the record,
`.pact-install.json`, both under `~/.claude`.

An older pact installs with that commit's own installer. Rollback is
supported only to commits on the published `main` from the Node install's
cutover (commit `6821d68`) on. Before you check a commit out, check it,
with no checkout:

1. **Resolve it to its full id:** `git rev-parse --verify "<commit>^{commit}"`.
   Run every check below on that id.
2. **It holds the Node installer:** `git cat-file -e <id>:gate/install.mjs`
   succeeds.
3. **It descends from the cutover:**
   `git merge-base --is-ancestor 6821d68f002b2e5307332ba067c049e403f950b0 <id>`
   succeeds.
4. **It is on the published `main`:** after
   `git fetch https://github.com/mephistopheles4/the-pact.git main`,
   `git merge-base --is-ancestor <id> FETCH_HEAD` succeeds.

If any check fails, don't check the commit out, and never run, or let a
session run, an installer from it: nothing prompts before such an installer
runs (the threat model's class The pact gets loosened). A commit that passes: do the steps below at the
current commit first, then check it out.

**Rolling back to before `pact/review.md` existed.** The install at the parent
of the commit that added it deletes `pact/review.md`, which its payload lacks,
and overwrites `CLAUDE.md` with the rules it held. Run its dry run first and
check that it lists exactly those two.

**Take out what the older pact doesn't know, first.** An older pact refuses a
configuration key or value it doesn't know, and its dry run names each one:
take out what it names, then run it again. The older the commit, the more it
refuses. What an old enough pact refuses:

- an edit to `tiers`, `sensitive`, `workflow`, `lenses`, `qualities` or
  `cost-limits`. A pact from before configuration edits existed refuses a
  file that has any, `moves` included, so empty the edit list for it;
- `usage-pause-session`, `checkpoint-stops` (in a configuration, a project's
  or a builder file's `settings`), and `"usage-pause": false` (set a number,
  or take the key out);
- an agent setting: a model other than `opus` or `sonnet`, an effort above
  `high`, or any setting for `scout`; a pact from before agent settings
  existed refuses an `agents` key at all, and the first to take one refuses a
  setting for any lens but `integrity-lens`;
- the keys `skills` (in a configuration or a builder file), `tools` and
  `commands`. An older install deletes what its own payload lacks: the poster
  and the commands the record lists, and `commands/scriptorium.md` and the
  builder kit. At a commit from before the builder kit, a configuration that
  lists `scriptorium` in `commands` refuses;
- in a project's configuration, the `costLimits` key (`project-key`) and the
  `enough` and `enoughCosts` fields (`project-qualities`); in a builder file,
  the `costLimits` key and an Enough on a quality row.

One thing an older pact does not refuse: an Enough column in a Qualities
block. A pact from before the Enough column installs that text as written, and
the column then names costs no part defines, which an older lens reads with no
one rule and no security bar. If the commit you roll back to predates the
column, remove it first.

**The `clef` tool.** A pact from before `clef` refuses it on the `tools` list. If `clef` is on, run `clef stop` and `clef remove --yes` first (see [clef.md](clef.md)), take `clef` off the list and apply at the newer commit, then roll back. The clef folder, `pact-clef/`, is not the install's and stays unless you remove it.

Four settings leave rules or files that an older installer can't remove. For
each, turn it off and apply at the newer commit first, then take its key out
of the configuration:

- **The cleaner** (take `cleaner` out of `tools`): an older installer never
  removes its deny rules, which include the two `claude rm` rules, or its two
  ask rules, so they would stay in `settings.json`, where they look like your
  own. A pact from before the `claude rm` rules also drops those two from its
  record and leaves them there.
- **`session-stop-deny`** (set it to `false`): an older installer refuses the
  key, even as `false`, and ignores `stopDeny`, so its eight rules stay in
  `settings.json`.
- **`agent-identity`** (set it to `false`): an older installer ignores
  `identityEnv`, so its two `env` keys stay in `settings.json`. [Steps](agent-identity.md#rolling-back).
- **The auto-compact window** (set `auto-compact-window` to `0`): an older
  installer keeps your live hook entries but deletes the hook script it
  doesn't know, so every session would call a missing file. Stop if
  `settings.json` still holds a hook that calls `pact/hooks/compact-handoff.mjs`
  after that apply; the older installer's own warning about any `hooks` key
  is not that.

With no configuration of yours, a pact from before the default configuration
renders the pact's plain text again in place of the default. Its dry run names
the last install's configuration digest, then says no configuration, lists
`CLAUDE.md` under Overwrite and the default's kit files under Delete, and
prints no line naming the `workflow` part.

**Then check out.** Check out exactly that id and run only `gate/install.mjs`,
dry run first.

**Backups.** A rollback to a commit from before backups existed takes no
backup and prunes none, so copy what you want to keep first, and delete
`pact/backups` by hand once you are sure. An older installer never touches
`pact/backups` unless the install record was rewritten to list a path there
(the threat model's class The pact gets loosened).

Every Node install reads and writes the same install record, so an older one
can follow a newer one. An older commit's install adds back to your
`settings.json` any ask rules it held. When you return to the newer pact, its
install takes out the 56 it knows. After returning from an older commit that added them,
also repeat the removal by hand in step 5.

## Known limits

- **Two installs at once** are not guarded. Run one at a time.
- **A mapped drive or a link to a network share** passes the path checks:
  only a path typed as a network or device path (`\\server\share`, `\\?\`)
  refuses.
- **The leftover work folders** of a stopped install stay until you delete them
  (step 4).

## Undo an apply

Do this yourself, not through a session: a session that reads a copy of your
settings, or of Codex's `config.toml`, holds any key in it in its context. The
script has no undo command. Each
backup in `~/.pact/backups/` undoes one apply (step 3):

1. **Pick the backup,** one whose name an apply you ran printed. To undo more
   than one apply, go newest first, back to the one you want, and do steps 3 to
   6 for each in turn.
2. **Know what it undoes.** A copy-back puts each listed file back as it was
   before that apply, losing any edit made to it since, including what Claude
   Code writes to `settings.json`, such as permission rules, and what you or
   Codex wrote to its `config.toml`, such as a tighter approval setting.
3. **Check its `manifest.json` before you act on it,** and stop on any
   failure:
   - each path is relative to your home folder, with forward slashes and no `..`,
     and names its harness;
   - each path is under `.pact/` or a harness's own rules file, agents,
     commands or skills folder, or is `~/.codex/config.toml` or its hooks file
     (`~/.codex/hooks.json`, `~/.gemini/config/hooks.json`, or the one your own
     harness names); none is under `.pact/blocks/`, `.pact/presets/`,
     `.pact/backups/`, `.pact/handoffs/`, `.pact/config.json`,
     `.pact/builder.json` or a `.credentials` file, the paths the install
     never touches; `.claude/settings.json` and `.pact/install.json` may be
     listed;
   - each `was: file` copy's SHA-256 matches its entry, by `sha256sum` or
     `shasum -a 256`, or `Get-FileHash` in PowerShell (compare ignoring case);
   - each `was: link` entry is a skill's name in a skills folder, and its
     `target` is `.pact/skills/` and that name;
   - each `was: absent` path, other than `settings.json` and
     `install.json`, is listed in your current
     `~/.pact/install.json` (a hooks file under its `entries`; Codex's
     `config.toml` by its `shellPolicy` mark; a skill under its `links` or,
     where the folder was copied, as files below that path in its `files`), so a
     planted
     entry can't have you delete a file of your own. Whatever could plant one could also rewrite the
     record, so this narrows that path rather than closing it (threat model, The pact gets loosened).
4. **Copy back each `was: file` entry:** `<backup>/<path>` to
   `~/<path>`. Keep `settings.json` and `config.toml`
   readable only by you: copy with `cp -p`, or run `chmod 600` after, on Linux
   and macOS. If Codex's `config.toml` has changed since that apply, don't copy
   it back: change only the pact's line, to match the backup's copy.
5. **Delete each `was: absent` path** that is there. A skill link goes as a
   link, never through it: `rm "$HOME/<path>"` on Linux and macOS,
   `cmd /c rmdir "$HOME\<path>"` in PowerShell, with the path's slashes turned
   to backslashes, and no `-r` or `/s`. In a copied skill folder, delete the
   files your record lists, then the empty folders. If Codex has written to its
   `config.toml` since, delete only the pact's line.
6. **Make each `was: link` entry again:**
   `ln -s "$HOME/<target>" "$HOME/<path>"`, or
   `New-Item -ItemType Junction -Path "$HOME\<path>" -Target "$HOME\<target>"`
   in PowerShell.
7. **Run the dry run** to check, and read it before you start any session: it
   shows no drift, its `Last install:` line names the commit in the name of the
   next-older backup, the apply before the oldest one you undid (after undoing
   a first install it reads as a first install), and
   no `settings.json` warning names a command-running key you didn't set. Stop
   on one.

**Full uninstall.** Pick the oldest backup that lists `install.json` as
`absent`, the first by name: your first install's. Run step 3's checks on it
while your current record is still there; there, a `was: absent` path your
current record doesn't list passes if it isn't on disk, and one that is on disk
and unlisted is yours to leave alone. A backup taken after you moved the record
aside (Updating later) is not your first install's: if every such backup was
taken that way, or you deleted the first one, follow Installed before backups. Then delete the pact files your
current record lists: the agents, `.pact/review.md`, `.pact/review-diagrams.md`, the `.pact/builder/`
folder, each pact command in `.claude/commands/`, `/scriptorium` included,
`.pact/tools/poster.mjs` and `.pact/tools/cleaner.mjs` if listed,
`.pact/hooks/compact-handoff.mjs` if listed, and `.pact/install.json`. Then do
steps 4 to 7 with that backup. Step 5's restored `settings.json` takes the
pact's hook entries and `autoCompactWindow` out with it; had you no backup of
it, remove the entries that call the deleted script by hand. If you had no `settings.json` before, step 5
deletes it, with anything Claude Code wrote there since.

**Installed before backups.** If no backup in `.pact/backups/` lists
`install.json` as `absent`, or each one that does was taken after you
moved the record aside, your first install predates backups. Put
back your own copies of your rules file, settings and agents. With no copy of
`settings.json`, edit it instead: remove the keys the dry run listed under
`settings.json:` and the lines of the `auto-compact-window:` block, or set them
back, `permissions.defaultMode` above all, and take out the hook entries that
call `.pact/hooks/compact-handoff.mjs` and `autoCompactWindow`. Then
delete the pact files your record lists, as for a full uninstall.

Start a new session to load the change.

# Install the pact

This how-to installs the pact's rules file, review procedure, agents and
`/scriptorium` command, with the builder kit it runs and the auto-compact hook,
into your Claude Code
home folder (`~/.claude`), and merges its settings into yours. It takes about
five minutes.

Read the README's [Who it's for](../README.md#who-its-for) first. The rules
are written for one person's setup, and installing them changes every
Claude Code session on your machine.

These steps were tried on Windows and Linux, and not on macOS.

## Before you install

The rules keep the work's record where your project keeps it, often an issue
tracker, and post every review report there word for word, security findings
included. Decide before you install: keep that tracker private, or accept
that those findings are public until they are fixed, and that anyone who can
comment there writes into the record a session reads. The pact has no rule on
whose text counts there, or on secrets in posts, unless the repo's own
`AGENTS.md` adds one, as this repo's does.

[The threat model](threat-model.md) says what the pact accepts and what is
still open. Read it before you decide.

Where the dry run asks for "the owner's go-ahead", the owner is you.

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

Every `--apply`, one with nothing to do included, first copies what it will
replace into `~/.claude/pact/backups/<name>/`, named by the time in UTC and
the commit it installs: each file it overwrites or deletes, `settings.json`
when it writes it, and the install record. A `manifest.json` lists each copy
with its SHA-256, and each file the apply adds as `absent`, so
[Undo an apply](#undo-an-apply) can put everything back. If the copy can't be
made in full, the apply refuses and changes nothing. The install keeps the ten
newest backups, and each one taken with no install record before it, such as
your first install's, until you delete it: copy aside one you mean to keep.

- **The copies are plain and unencrypted.** Your settings file can hold API
  keys, and a key you rotate stays in the old copies until they are pruned or
  you delete them (out of scope: they stay on your machine; see the
  [threat model](threat-model.md#scope)'s Scope).
- **Never sync, share or commit the backups folder.** Any copy you make
  yourself, a backup copied aside or your own copies from before backups,
  belongs outside the clone and any synced or shared folder, readable only by
  you, and deleted once you are sure of the install.

## 4. Run the dry run and read it

In PowerShell:

```powershell
$env:NODE_OPTIONS = $null; node gate/install.mjs
```

In a POSIX shell:

```sh
env -u NODE_OPTIONS node gate/install.mjs
```

With no option, the script writes nothing in your Claude home folder. It
still runs code from your clone, with your rights: the install script and the
pact's check. So run it only on a clone you trust. It refuses if
`NODE_OPTIONS` is set, because a preload could change what the checks see.
It checks the committed files and prints what an install would do. Read these
parts:

- **`Install from commit …`.** The commit it would install. Compare it with
  the commit the repository page shows.
- **`Check: passed on commit …`.** If the check fails, the script refuses and
  installs nothing.
- **`Not checked: what the pact's files say.`** The check covers install
  mechanics only: what each file is, where it goes, and that it is clean
  text. Read the pact's files as you would any skill you install.
- **`Drift:`.** On a later install, the number of installed files you have
  edited since the last one. If it isn't 0, stop: `--apply` refuses, and you
  would lose those edits. On a first install it is 0.
- **`Overwrite:`, `Add:` and `Delete:`.** The files `--apply` would replace,
  create and remove. `Delete` lists only files an earlier pact install put
  there, or agents older pact versions shipped.
- **`Yours, left as is:`.** Agent files the pact didn't write, or wrote and you
  have changed since. The install never overwrites, deletes or records them.
  Delete your file to get the pact's back at the next install.
- **`settings.json:`.** What the merge into `~/.claude/settings.json` would
  change; your other keys stay. The merge turns on auto mode
  (`permissions.defaultMode` set to `auto`, its opt-in prompt skipped), and
  while `auto-compact-window` is on sets the window and the pact's hooks
  ([below](#the-auto-compact-window-and-its-hooks)). To keep auto mode off, set
  `defaultMode` back after each install; every apply sets it again, and its
  dry run warns first. The merge also takes out, line by line, ask rules an
  older pact added.
- **`Backup: <n> file(s) to copy into pact/backups/ before the first write`.**
  What `--apply` copies first (step 3).
- **`Configuration:`.** With no `~/.claude/pact/config.json` of your own,
  the pact's default configuration renders: Level 3 · Full, the builder's
  shipped preset. The block names it, with its digest and the rendered hash the
  apply command carries. To keep the pact's own text instead, write a
  configuration of your own: `{"schema": 1}` alone renders the pact's text
  with only the configuration notice added. Your own file is used whole, never
  mixed with the default, and a project install never takes the default. The
  default's workflow names six skills from `addyosmani/agent-skills`. The
  install never fetches them; a session uses one only if you installed it, or
  if a repo you work in carries a skill of that name. Two suggest registry
  audit commands such as `npm audit`, which send a project's dependency list
  to the registry.
- **`WARN: SECURITY DEFAULTS:`.** Shown first when your configuration, or the
  default, edits a part that sets security defaults (`tiers`, `sensitive`,
  `workflow`, `lenses`, `qualities` or `cost-limits`), or a project sets its
  own `qualities` or `costLimits`. Read those parts in the rendered rules file
  before you install: add `--review-folder <full path>`, a new or empty folder
  outside the Claude home and any `.claude` folder, and once every check has
  passed the dry run writes `rendered-rules.txt` and `config.diff` there.
- **`Commands:`.** The pact's slash commands, each `on` or `off`.
  `/scriptorium` is always on; turn another on by listing it in the `commands`
  key of `~/.claude/pact/config.json`, as `"commands": ["make-it-so", "finis"]`,
  or in the builder's Settings. A refusal names what is in the way, such as a
  same-named skill.
- **`Tools:`.** The poster and the cleaner, each off unless your `tools` list
  names it, as `"tools": ["poster"]`, or the builder's Settings ticks it; a
  preset or a shared builder file never turns one on. Each that is on gets a
  `WARN` line saying what it does. The poster adds its rule to the rules file
  and posts as your `gh` account; with `--claude-home` elsewhere, leave
  `tools` empty.

  The cleaner on adds eighteen deny rules to `permissions.deny`, in
  `Bash(...)` and `PowerShell(...)` forms: `git worktree remove *`,
  `git * worktree remove *`, `git branch -d *`, `git * branch -d *`,
  `git branch -D *`, `git * branch -D *`, `git branch --delete *`,
  `git * branch --delete *` and `claude rm *`. It also adds two ask rules,
  `Bash(*cleaner.mjs*remove*--override*)` and its `PowerShell(...)` twin, so
  Claude Code asks you before a forced removal. It records what it added
  under `cleanerDeny` and `cleanerAsk` in `.pact-install.json`, and turning
  the cleaner off removes only those; a rule you wrote yourself stays. They
  are a speed bump, not a gate: another spelling (a flag before the
  subcommand, a path-qualified or wrapped call) gets past them, they don't see
  git run by a child process, and without managed settings or a Team or
  Enterprise login an installed mod can approve a call they refuse. If
  `settings.json` is not strict JSON the install leaves it alone, adds none of
  them, and warns. To run `claude rm` yourself, see
  [the cleaner](cleaner.md#your-own-claude-rm).
- **`skills:`.** Shown when the configuration has a `skills` list: the repos
  and pinned commits it names for the cloud setup to fetch. This install
  fetches none.
- **`NOTE: … other pact-install-* folder(s) in the temp folder`.** An install
  stopped hard, by a power cut or a killed process, left its work folder in
  your temp folder, and it may hold your configuration text. Delete those
  `pact-install-*` folders by hand once no install is running; the script
  never deletes them.

The dry run names your home folder, your user name, your own settings' names
and your skill repos. Post its verdict and counts on a tracker, never its raw
output.

A dry run runs `gate/install.mjs` as it stands in your working folder,
uncommitted edits included, and nothing prompts before it. On a branch that
changes the installer, run it with `--claude-home` pointing at a throwaway
folder.

The last lines print the apply command to run next.

## 5. Install with `--apply`

When the dry run reads right, run the apply command it printed, as printed.
Its `--commit` and `--rendered-hash` bind it to what the dry run checked and
showed, so it refuses if your clone moved on since, on drift, or on
uncommitted changes: run the dry run again. After it copies the files, it
checks each one's hash again. A good install ends with `RESULT: pass`; a
`WARN:` line about old backups leaves your files as they are.

It installs the rules file, the agents, `pact/review.md`, the commands and
tools you turned on, the builder kit under `pact/builder/`, and the install
record `.pact-install.json`, and merges `settings.json`. On Windows the merged
`settings.json` takes its folder's access list, so restrict the `~/.claude`
folder, not the file.

To keep presets of your own, create `~/.claude/pact/presets/` yourself and
put builder files in it; `/scriptorium`'s page lists them under "Your
presets". The install never writes, lists or deletes that folder.

Run the dry run again if you like. It should print `Nothing to do.`

**Removing rules an older pact added.** The install takes out the ask rules
it knows as retired. Some older pacts added others: two review rules,
`PowerShell(*install.mjs*--rev*)` and `Bash(*nstall.mjs*--rev*)`, and those
ADR 0052's bullet "The owner's live settings are cleaned by hand" names by
search text. After the install, open `~/.claude/settings.json` in an editor
yourself and delete them from `permissions.ask`, searching for that text
rather than copying lines (some hold dashes that look like hyphens), and the
comma a last line leaves before `]`. Never ask a session to: the file can
hold API keys. Then run the dry run again: it must show
`settings.json: unchanged`, no `NOTE` about retired ask rules and no warning
that the file is not strict JSON.

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

If you checked out a reviewed commit last time, switch back to a branch
first, such as `git switch main`. Fast-forward with `git pull --ff-only`; if
it refuses, stop and find out why before you install. Read what changed
before you run anything, since the dry run runs the new code and a session
opened in the clone loads its project files: `git diff <commit> HEAD`, where
`<commit>` is the one the dry run's `Last install:` line names. Or check out a
commit you have reviewed, at or after that one. Then repeat steps 4 and 5.

If the dry run shows drift, live files changed since the last install, and
`--apply` refuses. Whether to keep or replace those edits is your decision.
To replace them, move `~/.claude/.pact-install.json` out of the folder: the
next dry run reads as a first install, with no drift, and lists the files
`--apply` will overwrite. That apply's backup holds your edited files, and
the install keeps it until you delete it. Bring your edits back by hand from
it, or carry them as a configuration.

Settings, such as the usage pause lines, `auto-compact-window` or a lens's
model, live in `~/.claude/pact/config.json`; `examples/pact-config/` holds
examples. The builder edits them: type `/scriptorium` in any session.

## The auto-compact window and its hooks

Every install, and every cloud session, sets Claude Code's auto-compact
window and installs a small hook that carries a session through compaction.
It needs Claude Code 2.1.318 or later, Node 24 or later (the
installer's own floor) and `node` on the PATH.

- **The setting.** `auto-compact-window` in `~/.claude/pact/config.json` is
  a number of tokens, 100000 to 1000000 in steps of 10000, or `0` for off. It
  is on at 400000 when the key is unset, and the builder's Settings dialog
  shows it beside the usage limits. A project configuration may not set it.
  The install writes it to `autoCompactWindow` in `settings.json`; Claude Code
  then compacts a little below it, near 365000 to 370000 for 400000.
- **What installs when it is on.** `~/.claude/pact/hooks/compact-handoff.mjs`,
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
- **What the hook does.** Past the window minus 80000 tokens, it asks the
  session once per turn, until compaction, to update its hand-off file,
  `~/.claude/pact/handoff/<session id>.md`. It asks the compaction summary to
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
  `~/.claude/pact/handoff/`; clear them yourself when you like. They are
  notes a session wrote, kept unencrypted in a folder the hook creates for
  your account alone on Linux and macOS (on Windows the folder takes the
  Claude home folder's access), and they outlive turning the window off and
  Claude Code's own transcript clean-up. On macOS an access control list the
  folder inherits can grant another account access despite the owner-only
  mode; check with `ls -le`.

## Roll back to an older version

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

**Take out what the older pact doesn't know, first.** An older pact refuses a
configuration key or value it doesn't know, and its dry run names each one:
take out each it names, then run it again. One thing it doesn't name: an
Enough column in a Qualities block, which a pact from before that column
installs as written, naming costs no part defines. Remove it first.

Three settings leave rules or files that an older installer can't remove. For
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
- **The auto-compact window** (set `auto-compact-window` to `0`): an older
  installer keeps your live hook entries but deletes the hook script it
  doesn't know, so every session would call a missing file. Stop if
  `settings.json` still holds a hook that calls `pact/hooks/compact-handoff.mjs`
  after that apply; the older installer's own warning about any `hooks` key
  is not that.

**Then check out.** Check out exactly that id and run only `gate/install.mjs`,
dry run first.

An older commit's install adds back to your `settings.json` any ask rules it
held. After returning to the newer pact, repeat step 5's removal by hand.

## Known limits

- **Two installs at once** are not guarded. Run one at a time.
- **A mapped drive or a link to a network share** passes the path checks:
  only a path typed as a network or device path (`\\server\share`, `\\?\`)
  refuses.

## Undo an apply

Do this yourself, not through a session: a session that reads a copy of your
settings holds its keys in its context. The script has no undo command. Each
backup in `~/.claude/pact/backups/` undoes one apply (step 3). An install from
before backups has none, and a rollback to a commit from before backups takes
none and prunes none: keep your own copies of `~/.claude/CLAUDE.md`,
`settings.json` and `agents/` until you are sure.

1. **Pick the backup,** one whose name an apply you ran printed. To undo more
   than one apply, go newest first, back to the one you want, and do steps 3 to
   5 for each in turn.
2. **Know what it undoes.** A copy-back puts each listed file back as it was
   before that apply, losing any edit made to it since, including what Claude
   Code writes to `settings.json`, such as permission rules.
3. **Check its `manifest.json` before you act on it,** and stop on any
   failure:
   - each path is relative to `~/.claude`, with forward slashes and no `..`;
   - no path is under `projects/`, `memory/`, `skills/`, `handover/`,
     `pact/blocks/`, `pact/presets/`, `pact/backups/`, `pact/config.json`,
     `pact/builder.json` or a `.credentials` file, the paths the install
     never touches; `settings.json` and `.pact-install.json` may be listed;
   - each `was: file` copy's SHA-256 matches its entry, by `sha256sum` or
     `shasum -a 256`, or `Get-FileHash` in PowerShell (compare ignoring case);
   - each `was: absent` path, other than `settings.json` and
     `.pact-install.json`, is listed in your current
     `~/.claude/.pact-install.json`, so a planted entry can't have you delete
     a file of your own. Whatever could plant one could also rewrite the
     record, so this narrows that path rather than closing it (threat model, The pact gets loosened).
4. **Copy back each `was: file` entry:** `<backup>/<path>` to
   `~/.claude/<path>`. Keep `settings.json`
   readable only by you: copy with `cp -p`, or run `chmod 600` after, on Linux
   and macOS.
5. **Delete each `was: absent` path** that is there.
6. **Run the dry run** to check, and read it before you start any session: it
   shows no drift, its `Last install:` line names the commit in the name of the
   next-older backup, the apply before the oldest one you undid (after undoing
   a first install it reads as a first install), and
   no `settings.json` warning names a command-running key you didn't set. Stop
   on one.

**Full uninstall.** Pick the oldest backup that lists `.pact-install.json` as
`absent`, the first by name: your first install's. Run step 3's checks on it
while your current record is still there; there, a `was: absent` path your
current record doesn't list passes if it isn't on disk, and one that is on disk
and unlisted is yours to leave alone. A backup taken after you moved the record
aside (Updating later) is not your first install's: if every such backup was
taken that way, or you deleted the first one, follow Installed before backups. Then delete the pact files your
current record lists: the agents, `pact/review.md`, the `pact/builder/`
folder, each pact command in `commands/`, `/scriptorium` included,
`pact/tools/poster.mjs` and `pact/tools/cleaner.mjs` if listed,
`pact/hooks/compact-handoff.mjs` if listed, and `.pact-install.json`. Then do
steps 4 to 6 with that backup. Step 5's restored `settings.json` takes the
pact's hook entries and `autoCompactWindow` out with it; had you no backup of
it, remove the entries that call the deleted script by hand. If you had no `settings.json` before, step 5
deletes it, with anything Claude Code wrote there since.

**Installed before backups.** With no first install's backup, put back your
own copies of your rules file, settings and agents. With no copy of
`settings.json`, remove from it the keys the pact set: `permissions.defaultMode`
above all, the hook entries that call `pact/hooks/compact-handoff.mjs`, and
`autoCompactWindow`. Then delete the pact files your record lists, as for a
full uninstall.

Start a new session to load the change.

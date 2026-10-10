# Install the pact

This how-to installs the pact's rules file, agents and cross script into your
Claude Code home folder (`~/.claude`), and merges its settings into yours. It
takes about five minutes.

Read the README's [Who it's for](../README.md#who-its-for) first. The rules
are written for one person's setup, and installing them changes how every
Claude Code session on your machine behaves.

**Where these steps were tried:**

- **Windows:** a real install over an earlier one, dry run and `--apply`
  (Windows 11, Node 24).
- **Linux:** the dry run in CI on every pull request (Ubuntu, Node 24), and
  the gate's tests, which install into throwaway folders, in the repo's Linux
  container (`gate/tests/fixtures/linux/`).
- **macOS:** not tried.
- **`/agents` (step 6):** checked on Windows only.

## Before you install

The rules reach beyond your machine in three ways. Decide on each before you
install, because the install copies the rules as your clone's last commit
holds them:

- **They treat your issue tracker as the record.** A session reads tiers,
  approvals and decisions there. The pact's `tracker-authors` rule (#160)
  makes only your own account's text count. Check that your copy of
  `claude/CLAUDE.md` holds it before you use the rules on a tracker where
  others can comment; without it, keep that tracker private.
- **They post every review report on the tracker, word for word,** security
  findings included. So choose: keep the tracker private, or accept that those
  findings are public until they are fixed.
- **At a periodic review, they collect totals into "the-pact's issue",**
  which means this repo's tracker. Edit the "Totals only" paragraph of
  `claude/CLAUDE.md` to name your own tracker (step 2).

[The threat model](threat-model.md) explains how the pact could break, the
risks it accepts, and what each tweak costs. Read it before you decide.

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
So commit any edit you make to the rules, such as the "Totals only" paragraph,
before step 4.

## 3. Back up your own files

Copy your `~/.claude/CLAUDE.md`, `~/.claude/settings.json` and
`~/.claude/agents/` folder, if you have them. A first install replaces your
rules file with no backup of its own, and does the same to an agent of yours
that shares a name with a pact agent or an old pact agent (step 4).
[Undo the install](#undo-the-install) restores from these copies. Your
settings file can hold API keys, so keep the copies outside the clone and any
synced or shared folder, readable only by you, and delete them once you are
sure of the install.

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
It checks the committed files and prints what an install would do. The output
names your home folder, so mask your username before you share it. Read these
parts:

- **`Install from commit …`.** The commit it would install. Compare it with
  the commit the repository page shows.
- **`Check: passed on commit …`.** If the check fails, the script refuses and
  installs nothing.
- **`Drift:`.** On a later install, the number of installed files you have
  edited since the last one. If it isn't 0, stop: `--apply` refuses, and you
  would lose those edits. On a first install it is 0.
- **`Overwrite:`, `Add:` and `Delete:`.** The files `--apply` would replace,
  create and remove. On a first install, `Overwrite` lists your own
  `~/.claude/CLAUDE.md` if you have one. An agent of yours with the same name
  as a pact agent is replaced the same way. Your other agents are left alone.
  `Delete` lists only files an earlier pact install put there, or, on a first
  install, an agent named `builder`, `spec-builder` or `security-builder`,
  which older pact versions shipped.
- **`settings.json:`.** What the merge into `~/.claude/settings.json` would
  change. Your other keys stay. The merge:
  - turns on auto mode (`permissions.defaultMode` set to `auto`) and skips its
    opt-in prompt (`skipAutoPermissionPrompt`). To keep auto mode off, set
    `defaultMode` back after the install. Every later `--apply` sets it to
    `auto` again, and its dry run warns you first;
  - adds ask rules (`permissions.ask`). They make Claude Code ask before its
    own edit tools change your Claude home folder's rules, agents, settings,
    skills, plugins, output styles, commands, `pact/` folder or install
    record (`.pact-install.json`), or `~/.claude.json`. In the shell, they
    ask before an apply, not before a mention: any command holding
    `--apply`; the install script (`install.mjs` or `install-run.mjs`) named
    with a word the rule can't read after it, such as a variable, a splat or
    a backtick, or with a quote right after a dash; a dry run that writes to
    a review folder; and the old
    PowerShell installer (`install.ps1`) named with its apply switch, a
    dash, a splat or a variable. A dry run, a read, a search or a diff of
    those files runs without asking (ADR 0049). They also ask before any
    command that names the install record, and before a `gh` command that
    names rulesets or branch protection. Those last rules match the letters
    `gh` anywhere before the word, so an ordinary command such as a commit
    message that says "through" and then "protection" asks too. The rules
    are not a boundary: a script or another command can still write those
    files, and in auto mode only Claude Code's own checks stand in the way;
  - keeps sessions going when a usage limit is reached
    (`autoContinueAtUsageLimit`) and skips the workflow usage warning
    (`skipWorkflowUsageWarning`);
  - sets the output style to Concise (`outputStyle`), the advisor model to
    Opus (`advisorModel`), the fallback models to Opus then Sonnet
    (`fallbackModel`), and shows thinking summaries
    (`showThinkingSummaries`);
  - turns on the experimental agent-teams flag
    (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS`).
- **`Configuration:`.** `no configuration`, unless you have a
  `~/.claude/pact/config.json`. If you do, it lists each setting and edit, and
  a rendered hash the apply command carries.
- **`NOTE: … other pact-install-* folder(s) in the temp folder`.** An install
  stopped hard, by a power cut or a killed process, leaves its work folder in
  your temp folder. It may hold your configuration text. Delete those
  `pact-install-*` folders by hand; the script never deletes them, because
  one could belong to an install still running.
- **`WARN: settings.json can be read by other accounts`.** On Linux or macOS,
  an older install may have widened your settings file, which can hold API
  keys. The install keeps a file's mode, so restrict it yourself:
  `chmod 600 ~/.claude/settings.json`.

The dry run names your home folder and your Node's path, which hold your
user name, and the names of your own settings. Post its verdict and counts on
a tracker, never its raw output.

A dry run no longer asks first, and it runs `gate/install.mjs` as it stands
in your working folder, uncommitted edits included. So on a branch that
changes the installer, run it with `--claude-home` pointing at a throwaway
folder: a bug in the code under edit then stays away from your real Claude
home, though hostile code could still ignore the option. Write the folder's
path out in full: a dry run with a variable, a bracket, a backtick or the
other characters ADR 0049 lists after the script's name asks, as an apply
does.

The last lines print the apply command to run next.

**Removing rules an older pact added.** The merge only ever adds rules, so a
rule a later pact retires stays in your `settings.json` until you remove it.
After installing the pact that narrowed the ask rules (ADR 0049), open
`~/.claude/settings.json` in an editor yourself, and delete these six lines
from `permissions.ask`, if they are there:

```text
PowerShell(*install.ps1*)
Bash(*nstall.ps1*)
PowerShell(*install.mjs*)
PowerShell(*install-run.mjs*)
Bash(*nstall.mjs*)
Bash(*nstall-run.mjs*)
```

Until you do, every mention of those files still asks. Don't ask a session to
do it: the file can hold API keys, and a session that reads it holds them in
its context. If you copied the file first, delete the copy yourself once the
install works: it holds the same keys, and keeps them after you change one.

## 5. Install with `--apply`

When the dry run reads right, run the apply command it printed, as printed.
With no configuration, it looks like this in PowerShell:

```powershell
$env:NODE_OPTIONS = $null; node gate/install.mjs --apply --commit <commit>
```

With a configuration, it ends with `--rendered-hash <hash>`. The `--commit`
is the commit the dry run checked: if your clone moved on since, the apply
refuses, so run the dry run again. `--apply` also refuses on drift or a
working tree with uncommitted changes. After it copies the files, it checks
each one's hash again. A good install ends with:

```text
Installed commit <commit> with no configuration; all files verified.
RESULT: pass
```

It installs these files under `~/.claude`:

- `CLAUDE.md`, the rules;
- `agents/`, ten agents: the nine lenses and `scout`;
- `pact/cross.mjs`, the cross script;
- `settings.json`, merged as the dry run showed;
- `.pact-install.json`, the record the next install compares against.

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

## 6. Check in a fresh session

Start a new Claude Code session in a folder outside the clone, so it loads
only your installed files, and run `/agents`. A pass lists these ten:
`adversarial-lens`, `behaviour-lens`, `conventions-lens`, `data-lens`,
`executability-lens`, `good-enough-lens`, `integrity-lens`, `reader-lens`,
`unstated-lens` and `scout`.

## Install by prompt

You can hand the first install to a Claude Code session with this prompt. It
names the one address to clone from, and leaves the apply to you, because on
a first install no pact ask rule exists yet to stop the session. Do step 3's
backup first. The prompt installs the rules as published, without step 2's
edits:

> Clone the-pact from `https://github.com/mephistopheles4/the-pact`, and no other address, into a new, empty folder. Don't reuse or pull an existing clone. From the new clone's root, with `NODE_OPTIONS` unset, run `node gate/install.mjs` and show me the whole dry run, including its "Install from commit" line. Don't change anything else. Then show me the apply command the dry run printed, and stop. I'll run it myself.

Read the dry run as step 4 says, then run the apply command yourself.

## Updating later

Pull the repo, and read what changed before you run anything: the dry run
runs the new code, and a session opened in the clone loads its project files.
The dry run's `Last install:` line names the commit you have.
`git diff <that commit> HEAD` shows everything that arrived since, merges
included. Or check out a commit you have reviewed. Then repeat steps 3 to 5.
The dry run compares your live files with the record of the last install, so
it shows any you have edited since.

If the dry run shows drift, live files changed since the last install, and
`--apply` refuses. Whether to keep or replace those edits is your decision.
Copy each file you want to keep somewhere safe. Then move
`~/.claude/.pact-install.json` out of the folder: the next dry run reads as a
first install, with no drift, and lists the files `--apply` will overwrite.
After the apply, bring your edits back by hand, or carry them as a
configuration (see below).

To change the pact's settings, such as the usage pause line or a lens's model,
see `examples/pact-config/` and the config builder in `builder/`.

## Roll back to an older version

Check out the older commit and run that commit's own installer, dry run first.
Commits from before the Node install (#166) hold `scripts/install.ps1`
instead, which needs PowerShell 7:

```powershell
pwsh ./scripts/install.ps1
```

Both installers read and write the same install record, so either can follow
the other. In a Claude Code session, a command that runs `install.ps1` with
its `-Apply` switch, a prefix of it, a dash for the hyphen, a splat or a
variable asks you first; its dry run doesn't. On Linux and macOS the old installer writes `settings.json`
readable by other accounts (#177): run `chmod 600 ~/.claude/settings.json`
after it.

## Known limits

- **Two installs at once** are not guarded. Run one at a time.
- **A mapped drive or a link to a network share** passes the path checks:
  only a path typed as a network or device path (`\\server\share`, `\\?\`)
  refuses.
- **The leftover work folders** of a hard stop stay until you delete them
  (step 4).

## Undo the install

The script has no uninstall. To back out by hand, under `~/.claude`:

1. **Put back your rules file and settings** from the copies you made in
   step 3. With no copy of `settings.json`, edit it instead: remove the keys
   the dry run listed under `settings.json:`, or set them back. Above all,
   set `permissions.defaultMode` back to what you use, so you are not left
   in auto mode.
2. **Delete the pact's files:** the ten agents listed in step 6 from
   `agents/`, `pact/cross.mjs`, and `.pact-install.json`.
3. **Put back your own agents** from your copy of the `agents/` folder.

Start a new session to load the change.

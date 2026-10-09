# Install the pact

This how-to installs the pact's rules file, agents and cross script into your
Claude Code home folder (`~/.claude`), and merges its settings into yours. It
takes about five minutes.

Read the README's [Who it's for](../README.md#who-its-for) first. The rules
are written for one person's setup, and installing them changes how every
Claude Code session on your machine behaves.

**Where these steps were tried:**

- **Linux:** a first install into an empty Claude home, dry run and `-Apply`,
  in the repo's Linux container (`gate/tests/fixtures/linux/`: Ubuntu 24.04,
  PowerShell 7.5, Node 20). The clone came from a git bundle of the commit,
  because the container runs with no network. A second run, into a home that
  already held its own rules file, settings and agent, showed what a first
  install replaces (step 4).
- **Windows:** the dry run only, on a machine where the pact was already
  installed (Windows 11, PowerShell 7.6, Node 24).
- **macOS:** not tried.
- **`/agents` (step 6):** not run in the container, which has no Claude Code.
  The agent files were counted there instead.

## Before you install

The rules reach beyond your machine in three ways. Decide on each before you
install, because the install copies the rules as your clone's last commit
holds them:

- **They treat your issue tracker as the record.** A session reads tiers,
  approvals and decisions there. On a tracker where others can comment, make
  sure your copy of `claude/CLAUDE.md` limits whose text counts to your own
  account.
- **They post every review report on the tracker, word for word,** security
  findings included. On a public tracker, those findings are public until
  they are fixed.
- **At a periodic review, they collect totals into "the-pact's issue",**
  which means this repo's tracker. Edit the "Totals only" paragraph of
  `claude/CLAUDE.md` to name your own tracker (step 2).

Where the dry run asks for "the owner's go-ahead", the owner is you.

## 1. Check the prerequisites

You need:

- **Claude Code.**
- **PowerShell 7** (`pwsh`), on Windows, macOS or Linux.
- **Node 20 or later.** The install runs the pact's check under Node.
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

Copy your `~/.claude/CLAUDE.md` and `~/.claude/settings.json`, if you have
them. A first install replaces your rules file with no backup of its own, and
[Undo the install](#undo-the-install) restores from these copies. Your
settings file can hold API keys, so keep the copies outside the clone and any
synced or shared folder, readable only by you, and delete them once you are
sure of the install.

## 4. Run the dry run and read it

```sh
pwsh ./scripts/install.ps1
```

With no switch, the script writes nothing. It still runs code from your
clone, with your rights: the install script itself and the pact's check, under
Node. So run it only on a clone you trust. It checks the committed files and
prints what an install would do. The output names your home folder, so mask
your username before you share it. Read these parts:

- **`Check: passed on commit …`.** If the check fails, the script refuses and
  installs nothing.
- **`Drift:`.** On a later install, the number of installed files you have
  edited since the last one. If it isn't 0, stop: `-Apply` refuses, and you
  would lose those edits. On a first install it is 0.
- **`Overwrite:`, `Add:` and `Delete:`.** The files `-Apply` would replace,
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
    `defaultMode` back after the install. Every later `-Apply` sets it to
    `auto` again, and its dry run warns you first;
  - adds ask rules (`permissions.ask`). They make Claude Code ask before its
    own edit tools change your Claude home folder's rules, agents, settings,
    skills, plugins, output styles, commands, `pact/` folder or install
    record (`.pact-install.json`), or `~/.claude.json`, and before it runs
    this script with `-Apply` in the spellings they list. They are not a
    boundary: a script or another command can still write those files, and in
    auto mode only Claude Code's own checks stand in the way;
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
  the last line names a hash for step 5.

The last line says which command to run next.

## 5. Install with `-Apply`

When the dry run reads right, run the command its last line names. With no
configuration, that is:

```sh
pwsh ./scripts/install.ps1 -Apply
```

With a configuration, the last line gives the hash to add:

```sh
pwsh ./scripts/install.ps1 -Apply -RenderedHash <hash>
```

`-Apply` refuses on drift or a working tree with uncommitted changes. After it
copies the files, it checks each one's hash again. A good install ends with:

```text
Installed commit <commit> with no configuration; all files verified.
```

It installs these files under `~/.claude`:

- `CLAUDE.md`, the rules;
- `agents/`, ten agents: the nine lenses and `scout`;
- `pact/cross.mjs`, the cross script;
- `settings.json`, merged as the dry run showed;
- `.pact-install.json`, the record the next install compares against.

**On Linux or macOS, check `settings.json`'s permissions.** `-Apply` writes
the merged file anew, so it gets your default permissions (`644` with the
usual umask), not the ones it had. If it holds API keys in its `env` block
and you kept it private, run `chmod 600 ~/.claude/settings.json`. (#177 tracks
a fix.)

Run the dry run again if you like. It should print `Nothing to do.`

## 6. Check in a fresh session

Start a new Claude Code session in a folder outside the clone, so it loads
only your installed files, and run `/agents`. A pass lists these ten:
`adversarial-lens`, `behaviour-lens`, `conventions-lens`, `data-lens`,
`executability-lens`, `good-enough-lens`, `integrity-lens`, `reader-lens`,
`unstated-lens` and `scout`.

## Updating later

Pull the repo, and read what changed before you run anything: the dry run
runs the new code, and a session opened in the clone loads its project files.
The dry run's `Last install:` line names the commit you have.
`git diff <that commit> HEAD` shows everything that arrived since, merges
included. Or check out a commit you have reviewed. Then repeat steps 3 to 5.
The dry run compares your live files with the record of the last install, so
it shows any you have edited since.

To change the pact's settings, such as the usage pause line or a lens's model,
see `examples/pact-config/` and the config builder in `builder/`.

## Undo the install

The script has no uninstall. To back out by hand, under `~/.claude`:

1. **Put back your rules file and settings** from the copies you made in
   step 3. With no copy of `settings.json`, edit it instead: remove the keys
   the dry run listed under `settings.json:`, or set them back. Above all,
   set `permissions.defaultMode` back to what you use, so you are not left
   in auto mode.
2. **Delete the pact's files:** the ten agents listed in step 6 from
   `agents/`, `pact/cross.mjs`, and `.pact-install.json`.

Start a new session to load the change.

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
  install replaces (step 3).
- **Windows:** the dry run only, on a machine where the pact was already
  installed (Windows 11, PowerShell 7.6, Node 24).
- **macOS:** not tried.
- **`/agents` (step 5):** not run in the container, which has no Claude Code.
  The agent files were counted there instead.

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

## 3. Run the dry run and read it

```sh
pwsh ./scripts/install.ps1
```

With no switch, the script changes nothing. It runs the pact's check on the
committed files and prints what an install would do. Read these parts:

- **`Check: passed on commit …`.** If the check fails, the script refuses and
  installs nothing.
- **`Drift:`.** On a later install, the number of installed files you have
  edited since the last one. If it isn't 0, stop: `-Apply` refuses, and you
  would lose those edits. On a first install it is 0.
- **`Overwrite:`, `Add:` and `Delete:`.** The files `-Apply` would replace,
  create and remove. **On a first install, `Overwrite` lists your own
  `~/.claude/CLAUDE.md` if you have one, and `-Apply` replaces it with no
  backup.** Copy it and your `~/.claude/settings.json` somewhere safe first;
  [Undo the install](#undo-the-install) restores from them. An agent of yours with the same name
  as a pact agent is replaced the same way. Your other agents are left alone.
  `Delete` lists only files an earlier pact install put there, or, on a first
  install, an agent named `builder`, `spec-builder` or `security-builder`,
  which older pact versions shipped.
- **`settings.json:`.** What the merge into `~/.claude/settings.json` would
  change. Your other keys stay. The merge:
  - turns on auto mode (`permissions.defaultMode` set to `auto`) and skips its
    opt-in prompt (`skipAutoPermissionPrompt`);
  - adds ask rules, so Claude Code asks before it edits your Claude home
    folder's rules, agents, settings, skills, plugins, output styles or
    commands, or `~/.claude.json`, and before it runs this script with
    `-Apply`;
  - keeps sessions going when a usage limit is reached
    (`autoContinueAtUsageLimit`) and skips the workflow usage warning
    (`skipWorkflowUsageWarning`);
  - sets the output style to Concise, the advisor model to Opus, the fallback
    models to Opus then Sonnet, and shows thinking summaries;
  - turns on the experimental agent-teams flag
    (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS`).
- **`Configuration:`.** `no configuration`, unless you have a
  `~/.claude/pact/config.json`. If you do, it lists each setting and edit, and
  the last line names a hash for step 4.

The last line says which command to run next.

## 4. Install with `-Apply`

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
- `agents/`, eight agents: the seven lenses and `scout`;
- `pact/cross.mjs`, the cross script;
- `settings.json`, merged as the dry run showed;
- `.pact-install.json`, the record the next install compares against.

Run the dry run again if you like. It should end with `Nothing to do.`

## 5. Check in a fresh session

Start a new Claude Code session and run `/agents`. A pass lists these eight:
`adversarial-lens`, `behaviour-lens`, `data-lens`, `executability-lens`,
`good-enough-lens`, `integrity-lens`, `unstated-lens` and `scout`.

## Updating later

Pull the repo, then repeat steps 3 and 4. The dry run compares your live files
with the record of the last install, so it shows any you have edited since.

To change the pact's settings, such as the usage pause line or a lens's model,
see `examples/pact-config/` and the config builder in `builder/`.

## Undo the install

The script has no uninstall. To back out by hand, under `~/.claude`:

1. **Put back your rules file and settings** from the copies you made in
   step 3. With no copy of `settings.json`, edit it instead: remove the keys
   the dry run listed under `settings.json:`, or set them back. Above all,
   set `permissions.defaultMode` back to what you use, so you are not left
   in auto mode.
2. **Delete the pact's files:** the eight agents listed in step 5 from
   `agents/`, `pact/cross.mjs`, and `.pact-install.json`.

Start a new session to load the change.

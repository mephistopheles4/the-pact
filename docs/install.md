# Install the pact

This how-to installs the pact's rules file, review procedure, agents and
`/scriptorium` command, with the builder kit it runs, into your Claude Code
home folder (`~/.claude`), and merges its settings into yours. It takes about
five minutes.

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

The rules reach beyond your machine in two ways. Decide on each before you
install, because the install copies the rules as your clone's last commit
holds them:

- **They keep the work's record where your project keeps it,** often an issue
  tracker. A session reads tiers, approvals and decisions there. Since #261 the pact carries no rule on whose
  text counts there: it leaves that to judgment. Before you use the rules on
  a tracker where others can comment, keep that tracker private, or write
  your own rule into the repo's `AGENTS.md` or a doc it points to, as this repo does.
- **They post every review report on the tracker, word for word,** security
  findings included. So choose: keep the tracker private, or accept that those
  findings are public until they are fixed. Since #261 the pact also leaves
  keeping secrets and personal details out of posts to judgment, unless the
  repo's own `AGENTS.md` or a doc it points to adds a rule, as this repo's does.

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
So commit any edit you make to the rules before step 4. If you edited the
"Totals only" paragraph in an earlier clone, drop that edit: the paragraph is
gone, and no session collects totals now (#189).

## 3. Back up your own files

Copy your `~/.claude/CLAUDE.md`, `~/.claude/settings.json` and
`~/.claude/agents/` folder, if you have them. A first install replaces your
rules file with no backup of its own. An agent of yours that shares a pact
agent's name is left as it is, and so is a pact agent you edit after an
install: the pact manages only the agent files it wrote and still holds as it
wrote them.
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
- **`Not checked: what the pact's files say.`** The check covers install
  mechanics only: what each file is, where it goes, and that it is clean
  text. Read the pact's files as you would any skill you install (ADR 0069).
- **`Drift:`.** On a later install, the number of installed files you have
  edited since the last one. If it isn't 0, stop: `--apply` refuses, and you
  would lose those edits. On a first install it is 0.
- **`Overwrite:`, `Add:` and `Delete:`.** The files `--apply` would replace,
  create and remove. On a first install, `Overwrite` lists your own
  `~/.claude/CLAUDE.md` if you have one. `Delete` lists only files an earlier pact install put there, or, on a first
  install, an agent named `builder`, `spec-builder` or `security-builder`,
  which older pact versions shipped.
- **`Yours, left as is:`.** Agent files the pact leaves alone: one it didn't
  write, such as your own agent with a pact agent's name, or one it wrote
  that you have changed since. The install never overwrites, deletes or
  records them, and a changed pact agent is not drift. Delete your file to
  get the pact's back at the next install (ADR 0071).
- **A retired agent's name (#302).** The pact retired `good-enough-lens`, and
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
    `auto` again, and its dry run warns you first;
  - takes out the ask rules (`permissions.ask`) an older pact added. Since
    #265 the pact sets no ask rules: Claude Code guards its own folder and
    `~/.claude.json`, and in auto mode its classifier weighs the rest. The
    dry run's `- permissions.ask:` lines name each rule it removes, matched
    exactly, and a `NOTE:` line counts them. A rule of your own that only
    looks like one stays. Every install removes these exact strings again, so
    a rule you want back must differ from the listed text. The install's apply, a `gh` command on rulesets or branch
    protection, and a dry run that writes to a review folder no longer prompt
    you (ADR 0063);
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
- **`WARN: SECURITY DEFAULTS:`.** Shown before every other warning when your
  configuration edits any of the six parts Scriptorium builds that set
  security defaults: `tiers`, `sensitive`, `workflow`, `lenses`, `qualities`
  or `cost-limits`. They hold the tier table, what Claude looks for as
  sensitive work and the route it recommends, the workflow table with the
  lenses offered at each stage, the lens roster, the qualities with the
  lenses that check them and what each answers to, and the cost limits.
  A `NOTE:` line follows it when you edit `qualities` and the table has no
  Enough column: the shipped cost rows reach a lens only through a quality's
  Enough, so they then hold back none.
  The line names the parts you edit and says whether your configuration
  changed since the last install. Read those parts in the rendered rules file
  (`--review-folder` writes it out) before you install. Only your home
  configuration may edit them; a project's `.claude/pact-config.json` may
  edit no part. A project may hold its own `qualities` list, which takes the
  place of yours in that repo, and with it its own `costLimits` list, which
  takes the place of your cost limits there; its dry run leads with a `WARN:
  SECURITY DEFAULTS:` line saying so, with the row count of each (ADR 0068).
  A project with its own `qualities` and no `costLimits` gets a `NOTE:` line
  after it: your cost limits reach none of its qualities there. Each quality
  row may carry `enough` (one line, no middle dot, since that joins the cell)
  and `enoughCosts`, and an `enoughCosts` name must
  find a cost row in that project's own `costLimits`. A cost row holds `cost`,
  and may hold `counted`, `limit` and `atLimit`, each one line of text with no
  bar, and the cost holds no middle dot either, since that joins the Enough
  cell; names match ignoring case and surrounding space. A cost row that no
  quality's Enough cell names, by its level or an `enoughCosts` name, gets one `WARN:` line under the dry run's
  `Project:` heading, naming such rows by position and telling you to read them
  in the project's file; the install still goes ahead. A project's `costLimits`
  refuses without its `qualities`, and an `acceptedRisks` key is refused as
  any other key is: accepted risks live only in a threat model.
- **`Commands:`.** The pact's own slash commands, `/make-it-so`, `/finis` and
  `/scriptorium`, each `on` or `off`, and `(not in this commit)` for one the
  commit doesn't hold yet. `/scriptorium` reads `on, always: part of the
  pact, with the builder kit under pact/builder/`: it builds your own
  Scriptorium page, and installs whenever the commit holds it (ADR 0070).
  The others are off until you turn them on: list a name in the `commands`
  key of `~/.claude/pact/config.json`, for example
  `"commands": ["make-it-so", "finis"]`, or tick it in the builder's
  Settings. Each such command gets a `WARN` line naming the file it installs,
  `commands/<name>.md`. A list that still names `scriptorium` gets a `NOTE`
  asking you to take it out, since an older pact refuses it. The install
  refuses, naming the path inside your Claude home folder:
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
- **`Tools:`.** The pact's own tools, today only the poster, each `on` or
  `off`, and `(not in this commit)` for one the commit doesn't hold. A tool
  is off unless you turn it on (ADR 0074): list its name in the `tools` key of
  `~/.claude/pact/config.json`, as `"tools": ["poster"]`, or tick it under
  Pact tools in the builder's Settings. A preset or a shared builder file
  never turns one on. Each tool that is on gets a `WARN` line, word for word:

  ```text
    WARN: the user configuration turns on the pact tool poster; it installs to pact/tools/poster.mjs and posts to GitHub as your gh account. Permission rules on gh commands don't see its calls, and its scan is a backstop, not a guarantee.
  ```

  The poster on also adds its rule to the rules file, so the rendered hash
  changes; `--review-folder` shows the rule. Taking the name out of the list
  deletes the poster and its rule at the next install. The rule names the
  poster under the default Claude home folder, so with `--claude-home`
  elsewhere, leave `tools` empty. Before it posts, the poster checks that
  your `gh` login owns the repo, by name and again by GitHub's answer for the
  repo, so a repo you have transferred can't take a post. The install
  refuses:
  - **Your own file at the tool's path.** A `~/.claude/pact/tools/<name>.mjs`
    the last install's record doesn't list (`unlisted-live`). Move it, or take
    the name out of the list. A live poster changed since the install is drift,
    never yours: the dry run lists it, and `--apply` refuses.
  - **A bad list.** A `tools` value that is not a list of pact tool names,
    each once (`config-tools`). A project's `.claude/pact-config.json` may not
    hold `tools` at all (`project-key`).
  - **A tool this commit doesn't hold.** A name the block marks
    `(not in this commit)` refuses at the check (`tools-not-in-pact`).
- **`NOTE: … other pact-install-* folder(s) in the temp folder`.** An install
  stopped hard, by a power cut or a killed process, leaves its work folder in
  your temp folder. It may hold your configuration text. Delete those
  `pact-install-*` folders by hand; the script never deletes them, because
  one could belong to an install still running.

The dry run names your home folder and your Node's path, which hold your
user name, and the names of your own settings. Post its verdict and counts on
a tracker, never its raw output.

A dry run no longer asks first, and it runs `gate/install.mjs` as it stands
in your working folder, uncommitted edits included. So on a branch that
changes the installer, run it with `--claude-home` pointing at a throwaway
folder: a bug in the code under edit then stays away from your real Claude
home, though hostile code could still ignore the option. Nothing prompts
before a dry run or an apply (ADR 0063).

The last lines print the apply command to run next.

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
- `agents/`, nine agents: the eight lenses and `scout`;
- `pact/review.md`, the review procedure the rules file points to before any
  lens runs. If a `pact/review.md` the install record doesn't list is already
  there, the install refuses and changes nothing: move your file out of the way;
- `commands/scriptorium.md`, always, and `commands/<name>.md` for each other
  pact command your `commands` list turns on. Taking a name out of the list
  deletes its file at the next install;
- `pact/tools/poster.mjs`, only while your `tools` list turns the poster on.
  It posts to GitHub as your `gh` account. Taking it out of the list deletes
  it at the next install;
- `pact/builder/`, the builder kit `/scriptorium` runs: the builder
  (`builder/build.mjs` and its parts module), the shipped page and presets,
  the pact's agents, the renderer it checks parts with, the brand mark, the
  example builder file, and the rules as they stand before your
  configuration, as `claude/rules.source.md`. It holds no file named
  `CLAUDE.md`. The kit's builder writes a page only outside any repo, the
  Claude home folder and any `.claude` folder;
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

**Removing rules an older pact added.** The install takes out, by itself, the
56 ask rules it holds as retired (ADR 0063): the 52 the pact set until #265,
and the four broad rules ADR 0049 retired. Some pacts from before #217 also
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
install is your call and nothing prompts before it. Do step 3's
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

To change the pact's settings, such as the usage pause lines or a lens's
model, see `examples/pact-config/` and the config builder in `builder/`. Two
usage settings exist: `usage-pause`, the weekly line (75% by default), and
`usage-pause-session`, the 5-hour session line, unset by default (#142). The
builder's Settings dialog holds both. The canvas edits the workflow, Settings
the tiers and sensitive work, and the Agents dialog the lens roster, the
qualities and the cost limits; `examples/pact-config/config-parts.json` edits `tiers`, `sensitive`, `workflow`, `lenses` and `qualities`, with the
session line set. For a builder of your own, type `/scriptorium` in any
session.

## Roll back to an older version

An older pact installs with that commit's own installer. Rollback is
supported only to commits on the published `main` from the Node install's
cutover (#166, commit `6821d68`) on. Before you check a commit out, check it,
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
runs (the threat model's R22). From a commit that passes, check out exactly
that id and run only `gate/install.mjs`, dry run first.

**Rolling back to before the thin gate (#261).** Its parent commit's install
deletes `pact/review.md`, which its payload lacks, and overwrites `CLAUDE.md`
with the rules it held. Run its dry run first and check that it lists exactly
those two.

A pact from before #262 and #142 refuses a configuration that edits `tiers`,
`sensitive`, `workflow`, `lenses` or `qualities`, sets `usage-pause-session`,
sets an agent's model to anything but `opus` or `sonnet`, its effort above
`high`, or any setting for `scout`, so take those out first. A pact from
before #278 also refuses an edit to `cost-limits`, and an older builder refuses
a builder file that holds a `costLimits` key or an Enough on a quality row.
A pact from before #278 also refuses a project configuration with a `costLimits` key (`project-key`)
or a quality row with `enough` or `enoughCosts` (`project-qualities`).
It does not refuse a Qualities block with an Enough column: it installs that
text as written, and the column then names costs no part defines, which an
older lens reads with no one rule and no security bar. Remove the column, the
edit, the project keys and those builder-file fields first. Its install
deletes `commands/scriptorium.md` and the builder kit, which its payload
lacks; a configuration that lists `scriptorium` in `commands` refuses there.

A pact from before the pact tools (#280) refuses a configuration with a
`tools` key, so take the key out first. Its install then deletes the poster
the record lists, as it does any file its own payload lacks.

A pact from before the pact commands (#203) refuses a configuration with a
`commands` key, so take the key out first. Its install then deletes the
commands the record lists, as it does any file its own payload lacks.

Every Node install reads and writes the same install record, so an older one
can follow a newer one. An older commit's install also adds back to your
`settings.json` any ask rules it held. When you return to the newer pact, its
install takes out the 56 it knows. After returning from a commit before #217,
also repeat the removal by hand in step 5.

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
2. **Delete the pact's files:** the nine agents listed in step 6 from
   `agents/`, `pact/review.md`, the `pact/builder/` folder, each pact command
   in `commands/` that the record lists, `/scriptorium` included,
   `pact/tools/poster.mjs` if the record lists it, and `.pact-install.json`.
3. **Put back your own agents** from your copy of the `agents/` folder.

Start a new session to load the change.

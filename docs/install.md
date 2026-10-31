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
  (Windows 11, Node 24), and the dry run in CI on every pull request
  (Windows Server 2025, Node 24, under Git Bash).
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
  findings are public until they are fixed. Since #441 the pact has no rule
  on secrets or personal details in posts, unless the repo's own `AGENTS.md`
  or a doc it points to adds one, as this repo's does.

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

## 3. Where the install keeps backups

Every `--apply` first copies what it will replace into
`~/.claude/pact/backups/<name>/`, where `<name>` is the time in UTC and the
commit the apply installs, such as `20261018T143005123Z-addaa8a`; the backup
holds your files from before that commit. It copies each file it
overwrites or deletes, `settings.json` when it merges or writes it, and the
install record. A `manifest.json` lists each copy with its SHA-256, and each
file the apply adds as `absent`, so [Undo an apply](#undo-an-apply) can put
everything back. If the copy can't be made in full, the apply refuses and
changes nothing. An agent of yours that shares a pact agent's name is left as
it is, and so is a pact agent you edit after an install: the pact manages only
the agent files it wrote and still holds as it wrote them.

- **Backups start with the first apply after #272.** An install made earlier
  has none, so keep your own copies of `~/.claude/CLAUDE.md`,
  `~/.claude/settings.json` and `~/.claude/agents/` until you are sure you won't
  uninstall: no backup holds the files your first install replaced.
- **Every apply takes one,** an apply with nothing to do included. The
  install keeps the ten newest, and each backup taken with no install record
  before it, such as your first install's, until you delete it. So ten applies
  push out an older backup: copy aside one you mean to keep.
- **The copies are plain and unencrypted.** Your settings file can hold API
  keys, and a key you rotate stays in the old copies until they are pruned or
  you delete them. On Linux and macOS the install gives the backups owner-only
  modes (`700` and `600`); an access-list entry inherited from `~/.claude` on
  macOS can still widen them, and `ls -le` shows one. On Windows they take the
  `~/.claude` folder's access list, as the `settings.json` beside them does, so
  they reach no reader that file doesn't, though they hold its older contents
  (R47 in the [threat model](threat-model.md)). To see who that list lets in,
  or to narrow it, open the folder's Properties in Explorer and its Security
  tab, or run `icacls "$env:USERPROFILE\.claude"` in PowerShell. A list for you
  alone holds your account, SYSTEM and Administrators.
- **Keep sessions out of the copies.** A session that opens or searches a copy
  in the backups folder holds its keys in its context. A session may read a
  backup's `manifest.json`, which holds no keys.
- **Never sync, share or commit the backups folder.** Any copy you make
  yourself, a backup copied aside or your own copies from before backups,
  belongs outside the clone and any synced or shared folder, readable only by
  you, and deleted once you are sure of the install.
- **The prune leaves some entries alone:** a backup named later than the
  newest apply's, and anything it doesn't recognise as a backup. Each may hold
  a copy of your settings until you delete it. The dry run counts the entries
  it doesn't recognise, and the apply warns of the backups named later.
- **To delete backups,** delete their folders under `~/.claude/pact/backups/`
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
- **`WARN: the last install's commit … is not in this checkout's history`.**
  On a later install, your checkout is behind the commit you last installed,
  or on another line, so installing it may roll the pact back. Fast-forward
  the checkout first (Updating later), unless you mean to go back. The
  install still goes ahead if you apply. A shallow clone may show it falsely.
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
- **`Backup: <n> file(s) to copy into pact/backups/ before the first write`.**
  What `--apply` copies first (step 3), ending `(settings.json included)` when
  the merge writes your settings. The dry run doesn't preview the prune: it
  doesn't say which old backups the apply will remove (step 3). Three warnings
  may follow it:
  - `WARN: pact/backups holds <n> leftover staging folder(s) ...` names what
    an apply that stopped mid-backup left. Each may hold a copy of your
    settings: check it and delete it, since `--apply` refuses while one is
    there;
  - `WARN: pact/backups holds <n> entry(ies) the install does not recognise as
    backups; ...` counts what the prune leaves as it is;
  - `WARN: pact/backups is not a plain folder: ...` says a link, a file or
    another reparse point sits where the backups go. `--apply` refuses until
    you move it out of the way.
- **`Configuration:`.** With no `~/.claude/pact/config.json` of your own,
  the pact's default configuration renders: Level 3 · Full, the builder's
  shipped preset. The block names it with its digest, the rendered hash the
  apply command carries, and a `WARN` line per part it edits (ADR 0094). If
  the last install had your own configuration and the file is gone now, a
  line says so. To keep the pact's own text instead, write a configuration of
  your own: `{"schema": 1}` alone renders the pact's text with only the
  configuration notice added. If you do have one, it is used whole, never
  mixed with the default: the block lists each setting and edit, and a
  rendered hash the apply command carries. A project install never takes the
  default. The default's workflow names six skills from `addyosmani/agent-skills` on
  the stages (`spec-driven-development`, `incremental-implementation`,
  `test-driven-development`, `code-review-and-quality`,
  `shipping-and-launch` and `documentation-and-adrs`), and its `skills` list names their folders at a pinned commit, so the dry run shows a `skills:` block; the cloud setup fetches them from #183 T4b on. Two of them suggest registry audit commands (`npm audit` and the like), which send a project's dependency list to the package registry when a session runs one. At home they are
  optional: the install never fetches them, and a session uses one only if
  you installed it yourself, or if a repo you work in carries a skill of that
  name, which is then the one used. Install them yourself, or write a
  configuration of your own, to keep a repo's skill out of that slot.
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
  guard for a path that is not a security finding.
  The line names the parts you edit and says whether your configuration
  changed since the last install. Read those parts in the rendered rules file
  (`--review-folder` writes it out) before you install. Only your home
  configuration may edit them; a project's `.claude/pact-config.json` may
  edit no part. A project may hold its own `qualities` list, which takes the
  place of yours in that repo, and with it its own `costLimits` list, which
  takes the place of your cost limits there; its dry run leads with a `WARN:
  SECURITY DEFAULTS:` line saying so, with the row count of each (ADR 0068).
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
- **`Tools:`.** The pact's own tools, the poster and the cleaner, each `on` or
  `off`, and `(not in this commit)` for one the commit doesn't hold. A tool
  is off unless you turn it on (ADR 0074): list its name in the `tools` key of
  `~/.claude/pact/config.json`, as `"tools": ["poster"]`, or tick it under
  Pact tools in the builder's Settings. A preset or a shared builder file
  never turns one on. Each tool that is on gets a `WARN` line, word for word:

  ```text
    WARN: the user configuration turns on the pact tool poster; it installs to pact/tools/poster.mjs and posts and edits on GitHub as your gh account. Permission rules on gh commands don't see its calls, and its scan is a backstop, not a guarantee.
    WARN: the user configuration turns on the pact tool cleaner; it installs to pact/tools/cleaner.mjs and removes worktrees and local branches in the repository it runs in. Its deny rules on raw removal commands are a speed bump, not a gate. Turn it on only after the Brigade release that drops its own raw removals, or Brigade's cleanup is denied.
  ```

  The cleaner on also adds sixteen deny rules on raw worktree and branch
  removal commands to `settings.json`, each listed under `settings.json` as
  `+ permissions.deny`, and records the ones it added in
  `.pact-install.json`; turning it off removes only those, also listed. A
  rule you wrote yourself stays. [cleaner.md](cleaner.md) lists them.

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
- **`skills:`.** Shown only when the configuration in force has a `skills`
  list: how many skill folders it names from how many repos, and each repo
  with its pin's first 12 characters. Each entry is
  `{"repo": "owner/name", "commit": "<40 hex>", "paths": ["<folder>", ...]}`:
  one entry per repo, a full commit id, and at most 100 paths in all, whose
  last segments, the skills' names, are unique. They are for the cloud setup
  to fetch, once it reads a configuration (#183 T4b); until then nothing
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

A dry run no longer asks first, and it runs `gate/install.mjs` as it stands
in your working folder, uncommitted edits included. So on a branch that
changes the installer, run it with `--claude-home` pointing at a throwaway
folder: a bug in the code under edit then stays away from your real Claude
home, though hostile code could still ignore the option. Nothing prompts
before a dry run or an apply (ADR 0063).

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
backed up <n> file(s) to pact/backups/<name>
Applying.
...
pruned <k> old backup(s)
  <name of each>
Installed commit <commit> with the pact's default configuration <digest>; all files verified.
RESULT: pass
```

The `pruned` lines show only when the apply removed old backups (step 3).
These `WARN:` lines may follow, with or without them: `WARN: pact/backups holds
<n> backup(s) named later than this run's; ...`, `WARN: pact/backups holds <n>
entry(ies) the install does not recognise as backups; ...` and `WARN: the prune
of old backups in pact/backups stopped on an error; ...`. Each leaves your
files as they are, and the install still passes.

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
  It posts and edits on GitHub as your `gh` account. Taking it out of the
  list deletes it at the next install;
- `pact/tools/cleaner.mjs`, only while your `tools` list turns the cleaner
  on, with its deny rules in `settings.json`. Taking it out of the list
  deletes it and the rules it added at the next install;
- `pact/builder/`, the builder kit `/scriptorium` runs: the builder
  (`builder/build.mjs` and its parts module), the shipped page and presets,
  the pact's agents, the renderer it checks parts with, the brand mark, the
  example builder file, the pact's default configuration
  (`builder/default-config/`, which the install renders from its stage, and
  its generator), and the rules as they stand before your
  configuration, as `claude/rules.source.md`. It holds no file named
  `CLAUDE.md`. The kit's builder writes a page only outside any repo, the
  Claude home folder and any `.claude` folder;
- `settings.json`, merged as the dry run showed;
- `.pact-install.json`, the record the next install compares against;
- `pact/backups/`, a backup of what each apply replaced (step 3). No install
  record lists it, and the install never writes there except to back up and
  prune.

To keep presets of your own, create `~/.claude/pact/presets/` yourself and
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
The `commit` field of `~/.claude/.pact-install.json` names the last
install's commit; the dry run's `Last install:` line shows it too.
`git diff <that commit> HEAD` shows everything that arrived since, merges
included. Or check out a commit you have reviewed, at or after the last
install's commit. Then repeat steps 4 and 5;
the apply takes its own backup (step 3).
The dry run compares your live files with the record of the last install, so
it shows any you have edited since.

If the dry run shows drift, live files changed since the last install, and
`--apply` refuses. Whether to keep or replace those edits is your decision.
Move `~/.claude/.pact-install.json` out of the folder: the next dry run reads
as a first install, with no drift, and lists the files `--apply` will
overwrite. That apply's backup holds your edited files, and the install keeps
it until you delete it, as a backup taken with no install record. After the
apply, bring your edits back by hand from it, or carry them as a
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

A pact from before the default configuration (#183 T4a) refuses a
configuration or builder file with a `skills` key, so take the key out first.
With no configuration of yours, it renders the pact's plain text again in
place of the default. Its dry run names the last install's configuration digest, then says no configuration, lists `CLAUDE.md` under Overwrite and the default's kit files under Delete, and prints no line naming the `workflow` part.

A pact from before the pact tools (#280) refuses a configuration with a
`tools` key, so take the key out first. Its install then deletes the poster
the record lists, as it does any file its own payload lacks.

A pact from before the cleaner (#438) refuses a configuration that names
`cleaner`, and never removes the cleaner's deny rules, so turn the cleaner off
and apply before you roll back.

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

## Undo an apply

Do this yourself, not through a session: a session that reads a copy of your
settings holds its keys in its context. The script has no undo command. Each
backup in `~/.claude/pact/backups/` undoes one apply (step 3):

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
     record, so this narrows that path rather than closing it (R14).
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
`pact/tools/poster.mjs` and `pact/tools/cleaner.mjs` if listed, and `.pact-install.json`. Then do
steps 4 to 6 with that backup. If you had no `settings.json` before, step 5
deletes it, with anything Claude Code wrote there since.

**Installed before backups.** If no backup in `pact/backups/` lists
`.pact-install.json` as `absent`, or each one that does was taken after you
moved the record aside, your first install predates backups. Put
back your own copies of your rules file, settings and agents. With no copy of
`settings.json`, edit it instead: remove the keys the dry run listed under
`settings.json:`, or set them back, `permissions.defaultMode` above all. Then
delete the pact files your record lists, as for a full uninstall.

Start a new session to load the change.

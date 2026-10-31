# The cleaner

The cleaner (`claude/tools/cleaner.mjs`, #438) removes leftover worktrees
under `.claude/worktrees/` and their local branches with its own fixed git
commands. It is a pact tool, off by default (ADR 0074); turn it on by listing
`cleaner` in the `tools` key of `~/.claude/pact/config.json`. ADR 0124 says
why it works this way.

**Turn it on only after the Brigade release that drops Brigade's own raw
removals.** While the cleaner is on, its deny rules stop those commands, so an
older Brigade's cleanup is denied.

## Use

```text
node ~/.claude/pact/tools/cleaner.mjs show   [--recoverable] [--repo <dir>] [--worktree <name>]...
node ~/.claude/pact/tools/cleaner.mjs remove [--recoverable] [--repo <dir>] [--worktree <name>]... --yes <tag>[,<tag>]...
```

In PowerShell, write the path as `"$HOME/.claude/pact/tools/cleaner.mjs"`.

- `--repo` is any folder in the repository; the default is the current
  folder.
- `--worktree` narrows the run to the folder names given: letters, digits,
  `.`, `_` and `-`, not starting with `.` or `-`.
- `show` names back each linked worktree directly under
  `<main>/.claude/worktrees/`: its branch and tip; its changed, untracked and
  ignored files (20 names each, then a count), with ignored links named apart,
  since git leaves them and the folder; a lock; a folder already gone;
  the stash entries made on its branch, by ref. Each block ends with a tag.
- `remove --yes` takes the tags `show` printed. It reads everything again and
  removes a worktree only when its fresh tag is among them, then deletes its
  branch with `git branch -d`, only when git exited 0 and the folder is gone.
- `--recoverable` keeps more, so that only what can be recovered goes (see
  [With `--recoverable`](#with---recoverable)). Give it to both commands: a
  tag from a run without it never passes a run with it.

The rules file tells a session to show you the name-back as printed, in a
fenced code block, in chat only, so no name's marks can restyle it, to give a record only the result line's counts, never the tags or the
name-back, and to run `remove` only after your own yes to it in chat.

## What it keeps

- **In use:** a worktree that is, or holds, the `cwd` of a Claude Code
  session status file (`~/.claude/sessions/*.json`, on the system the cleaner
  runs on), or the cleaner's own cwd, compared both as written and by real
  path, so a link either way still keeps it. A path written with two leading
  separators, `/net` on macOS, or one that reaches such a path through a link,
  is compared as written and never resolved on disk; a device prefix before a
  drive letter counts as the plain drive path. A Windows run doesn't see
  WSL sessions, or the other way.
- **Commits found nowhere else:** a worktree whose branch, or detached HEAD,
  has commits on no other branch and no remote.
- **A branch name outside** letters, digits and `. _ / -`: the cleaner can't
  read its commits safely, so it keeps the worktree and the branch.
- **A folder that is a link, or a folder name outside** letters, digits, `.`,
  `_` and `-`: it would be read through the link, or its name could pass for
  the cleaner's own words.
- **The default branch:** `origin/HEAD`'s target, or `main` and `master` when
  that is not known. Its worktree goes; the branch stays.

A kept worktree has no tag, so `remove` can't take it.

## With `--recoverable`

With the flag, a worktree is also kept, with no tag, when it holds any of
these. Its block gives the reason and lists the names (20, then a count):

- **Changed or untracked files**: "holds changed or untracked files". git
  refuses these too, but its own check can trust a cache in the worktree's
  index, which a session can write.
- **Ignored files or ignored links**, such as `.env`, which are not in git:
  "holds ignored files, which are not in git".
- **A program a session could have set**: a `filter.`, `lfs.` or `hook.` key
  of `local` or `worktree` scope in the worktree's config or the main
  worktree's (where `git branch -d` runs), a file that config includes
  counting as its includer's scope; a config read that fails; or a populated
  submodule, a gitlink in the worktree's index with a `.git` entry at its
  path. "a filter program could run". No `status` runs for such a
  worktree, and no git call runs inside a submodule. A key set in global,
  system or command scope doesn't keep it: a writer there already reaches
  every git call you run.
- **A submodule path that goes through a link**, read without following it:
  "a submodule path goes through a link". **A submodule folder that isn't
  populated but holds files**, which git reads nothing of: "a submodule
  folder holds files git does not see".
- **Edits git is told not to check**: an assume-unchanged or skip-worktree
  entry. "hides edits from git".
- **A work tree set in its config**, a `core.worktree` key of `local` or
  `worktree` scope, which would point the cleaner's reads at another folder:
  "its config points git at another folder". **A `.git` file that doesn't
  name its own folder** under `<main>/.git/worktrees/`, read with no git run:
  "its .git file names another git folder".
- **A read that fails** for that worktree, or a record git calls prunable
  over a folder still there: "a read failed, so it is kept". The rest of the
  run goes on.

A program or work tree the main worktree's config names keeps every
worktree, a folder already gone included, since `git branch -d` runs there.

Every git call then also carries `GIT_NO_LAZY_FETCH=1`,
`-c status.showUntrackedFiles=normal`, `-c core.checkStat=default` and
`-c core.trustctime=true`, so no setting hides an untracked or ignored file,
or an edit, from the cleaner or from git's own check. The flag needs git
2.45 or later; below it, the run is unavailable.

What "recoverable" can't see: it trusts the local remote-tracking refs, so a
stale ref, or one a session wrote, can make unpushed commits read as pushed;
a commit reachable only through a reflog or a per-worktree ref goes with
the worktree; and index stat data a session forged, or `core.ignoreCase` on
a case-sensitive file system, can still make an edit or a file read as
clean.

## Brigade

Grimoire's Brigade mod runs the cleaner itself, from 484's release on: after
the lead archives or stops the sessions the owner named in a typed
`/brigade done`, its `clean_up` tool runs `show --recoverable` and then
`remove --recoverable` with the tags `show` printed, for exactly that typed
window's folders and while it is open. The typed command is the owner's one
yes; the rules file says calling `clean_up` after it needs no other, and that
a `/brigade done` is never a session's yes to run the cleaner itself. That
release meets the order rule above.

## What it never does

It never passes `--force`, `-f`, `-D` or `--delete`, never pushes or prunes,
never touches a stash, and never removes anything its name-back didn't name
with the same facts. It asks no remote for anything, but in a partial clone
a read without `--recoverable` could make git fetch a missing object. git's
own refusals stand: a worktree with changed or untracked files, a lock or a
submodule is left. Without `--recoverable`, a worktree's ignored files, such
as `.env`, go with its folder; the name-back says so.

It runs git by an absolute path from `PATH`, from an empty folder, with an
empty hooks folder and `--no-optional-locks -c core.fsmonitor=false -c
log.showSignature=false`, and without `GIT_DIR`, `GIT_WORK_TREE`,
`GIT_INDEX_FILE` and `GIT_COMMON_DIR`. Its output is fixed words and relative
names, every name escaped and every file name in quotes; it never prints an absolute path, a session id,
file contents, a stash subject or git's own output.

## Exit codes

| Exit | Last line | Means |
| --- | --- | --- |
| 0 | `RESULT: shown <n> <tags>` or `RESULT: removed <r> left 0 changed 0` | done |
| 1 | `RESULT: removed <r> left <l> changed <c>` | something named in `--yes` was left, or changed or gone since the name-back |
| 2 | `RESULT: refused <count>` | a usage fault; nothing ran |
| 4 | `RESULT: unavailable` | git missing or older than 2.36 (2.45 with `--recoverable`), `.claude` or `.claude/worktrees` a link, the sessions check failed, or a read failed |

It needs Node 24 and git 2.36 or later (2.45 with `--recoverable`), and runs on Windows, Linux, WSL and
macOS. The cloud copy doesn't install it.

## Deny rules

While the cleaner is on, the install adds sixteen rules to
`permissions.deny` in `~/.claude/settings.json`, in `Bash(...)` and
`PowerShell(...)` forms: `git worktree remove *`, `git * worktree remove *`,
`git branch -d *`, `git * branch -d *`, `git branch -D *`,
`git * branch -D *`, `git branch --delete *` and `git * branch --delete *`.
It records the ones it added under `cleanerDeny` in `.pact-install.json`, and
turning the cleaner off removes only those; a rule you wrote yourself stays.

They are a speed bump with the classifier behind them, not a gate: other
spellings of the same commands get past them. They don't see git run by a
child process, so the cleaner itself is not denied.

## When it leaves something

- **"the folder stays: remove it by hand"**: git dropped its record but the
  folder is still there. If the report adds "it is a link" or "it holds a
  link", remove the link first, so nothing outside the worktree is deleted
  through it.
- **"the branch stays"**: git refused `branch -d`, usually because the branch
  is not merged into HEAD. This happens to a branch whose commits are on
  another branch or a remote but not merged: the name-back offers its
  worktree, the folder goes, and the branch stays with no worktree, where
  the cleaner no longer sees it. Check it yourself and delete it by hand.
- **Exit 4 from the sessions check**: a file in `~/.claude/sessions/` did not
  read as JSON with a string `cwd`, or the folder could not be listed. Look at
  the files yourself. A stale status file keeps its worktree until you remove
  the file, after checking no session runs there.

## Rolling back

Turn the cleaner off and apply first: that removes its recorded deny rules
and the tool. An older installer refuses a configuration that names
`cleaner`, and would leave the rules in place.

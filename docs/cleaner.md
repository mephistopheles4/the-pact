# The cleaner

The cleaner (`claude/tools/cleaner.mjs`, #438) removes leftover worktrees
under `.claude/worktrees/` and their local branches with its own fixed git
commands. It is a pact tool, off by default (ADR 0074); turn it on by listing
`cleaner` in the `tools` key of `~/.claude/pact/config.json`. ADR 0124 says
why it works this way.

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
  ignored files (20 names each, then a count); a lock; a folder already gone;
  the stash entries made on its branch, by ref. Each block ends with a tag.
- `remove --yes` takes the tags `show` printed. It reads everything again and
  removes a worktree only when its fresh tag is among them, then deletes its
  branch with `git branch -d`, only when git exited 0 and the folder is gone.
- `--recoverable` keeps more, so that only what can be recovered goes (see
  [With `--recoverable`](#with---recoverable)). Give it to both commands: a
  tag from a run without it never passes a run with it.

The rules file tells a session to remove worktrees only through the cleaner,
after your yes in chat. `show`'s own last lines tell it the rest: show you the
name-back as printed, in a fenced code block, in chat only, so no name's marks
can restyle it, give a record only the result line's counts, never the tags or
the name-back, and run `remove` only after your own yes to it in chat.

## What it keeps

- **In use:** a worktree that is, or holds, the `cwd` of a Claude Code
  session status file (`~/.claude/sessions/*.json`, on the system the cleaner
  runs on), or the cleaner's own cwd, compared both as written and by real
  path, so a link either way still keeps it. A path written with two leading
  separators or under `/net` (in any case on macOS, where `/Network/Servers`
  counts too; not on Windows), or one that reaches such a path through a link
  or a chain of links, through a link whose target is not a plain local path
  (on Windows, a path from a drive letter or a relative one with no drive;
  elsewhere, any path without two leading separators), or through more than 40
  links, or one the cleaner can't walk with certainty (a folder it can't list,
  a link it can't read, names that differ only in case), is compared as
  written and never resolved on disk; a device prefix before a drive letter
  counts as the plain drive path. A sessions folder, or a status file, that is
  a link or not a plain folder or file makes the run unavailable. A Windows
  run doesn't see WSL sessions, or the other way.
- **Commits found nowhere else:** a worktree whose branch, or detached HEAD,
  has commits on no other branch and no remote.
- **A branch name outside** letters, digits and `. _ / -`: the cleaner can't
  read its commits safely, so it keeps the worktree and the branch.
- **A folder that is a link, or a folder name outside** letters, digits, `.`,
  `_` and `-`: it would be read through the link, or its name could pass for
  the cleaner's own words.
- **The default branch:** `origin/HEAD`'s target, or `main` and `master` when
  that is not known. Its worktree goes; the branch stays.
- **A link anywhere inside, in every run** (#454): "holds a link: remove the
  link itself first, never with a recursive delete, then the folder by hand".
  Git lists no folder link to an empty folder, so the cleaner walks a folder
  that is still there itself and never enters a link; a symlink or junction as
  Node reports it counts, a file link and a link git tracks included, and so
  does a record git calls prunable over a folder still there, and so does a
  folder whose real path differs from where the walk found it. The walk only
  lists, and runs before any git call in the worktree (#442), because git
  reads through a junction on Windows and a session can plant one aimed at a
  share. So the block names every link, never cut at 20, and its `.git`
  entries, but not the changed, untracked or ignored files git would report:
  git is not asked, and no name from behind a link is printed. Remove the
  links themselves first, never with
  a recursive delete that could follow one; for a folder full of them, such as
  an install from a package manager, use that package manager's own removal
  command. A link made between the cleaner's read and git's removal is not
  seen.
- **A `.git` entry below its root, in every run** (#454): "holds a .git entry
  below its root, which git does not see". A file or folder named `.git` in any
  letter case that is not a populated submodule's `.git`: a gitlink in the
  index with a `.git` file naming its git folder, or a git folder holding
  `HEAD`, `objects` and `refs`, which git sees and refuses. Listed under ".git entries". Each one is a
  repository or a stray folder whose history and files go with the folder if it
  is removed by hand.
- **A walk that fails** keeps that worktree alone, in either mode: "a read
  failed, so it is kept".

A kept worktree has no tag, so `remove` can't take it.

## With `--recoverable`

With the flag, a worktree is also kept, with no tag, when it holds any of
these. Its block gives the reason and lists the names (20, then a count):

- **Changed or untracked files**: "holds changed or untracked files". git
  refuses these too, but its own check can trust a cache in the worktree's
  index, which a session can write.
- **Ignored files**, such as `.env`, which are not in git:
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
  name its own folder** under `<main>/.git/worktrees/`, or whose folder's
  `gitdir` doesn't name it back or whose `commondir` doesn't name the main
  repository's `.git`, read with no git run and only from small regular
  files: "its .git file names another git folder".
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

The walk for links and `.git` entries runs before these keeps, and before any
git call in the worktree, so a block kept for changed or ignored files also
names the `.git` entries, and a worktree that holds a link is kept for it
without git reading it. The main worktree's config keep still comes first,
since it reads nothing in the folder.

What "recoverable" can't see: a link or `.git` entry made after the cleaner's
read and before git's removal, and whether git's removal walks into a junction,
which is unconfirmed on Windows (a junction to an empty folder, which git lists
nothing for, is now kept by the cleaner's own walk in every run); it trusts the local remote-tracking refs, so a
stale ref, or one a session wrote, can make unpushed commits read as pushed;
a commit reachable only through a reflog or a per-worktree ref goes with
the worktree; and index stat data a session forged, or `core.ignoreCase` on
a case-sensitive file system, can still make an edit or a file read as
clean.

## A stopped session's lock

`claude --bg -w <name>` locks the worktree it makes, with the reason `claude
session <name> (pid <digits>)`. The cleaner calls a lock a *session lock* only
when its reason is exactly that, with the worktree's own folder name; any other
reason, or none, is an *other lock*. A session still running is kept as "in
use" before any lock is read, since its status file names the worktree as its
cwd, so a session lock here is a stopped session's.

`show` says `locked by a stopped session; remove unlocks it` for a session lock
and `locked, git will refuse` for any other. The tag covers the lock's reason,
so a lock added, dropped or changed after `show` reads as changed. `remove`
runs `git worktree unlock`, then the same unforced `git worktree remove`. If
git refuses, the cleaner locks the worktree again with the same reason, and
says `the lock was not put back` if that fails too. Neither the reason nor the
pid is ever printed.

## What it never does

It never passes `--force`, `-f`, `-D` or `--delete`, never pushes or prunes,
never touches a stash, and never removes anything its name-back didn't name
with the same facts. It asks no remote for anything, but in a partial clone
a read without `--recoverable` could make git fetch a missing object. It
unlocks a session lock and leaves any other lock. git's own refusals stand: a
worktree with changed or untracked files, another lock or a submodule is left. Without `--recoverable`, a worktree's ignored files, such
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
| 4 | `RESULT: unavailable` | git missing or older than 2.36 (2.45 with `--recoverable`), `.claude` or `.claude/worktrees` a link, the sessions check failed (including the sessions folder or a status file being a link or the wrong kind), or a read failed |

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
  link", remove the link itself first, never with a recursive delete, so
  nothing outside the worktree is deleted through it.
- **"the branch stays"**: git refused `branch -d`, usually because the branch
  is not merged into HEAD. This happens to a branch whose commits are on
  another branch or a remote but not merged: the name-back offers its
  worktree, the folder goes, and the branch stays with no worktree, where
  the cleaner no longer sees it. Check it yourself and delete it by hand.
- **Exit 4 from the sessions check**: a file in `~/.claude/sessions/` did not
  read as JSON with a string `cwd`, the folder could not be listed, or the
  folder or a status file is a link or not a plain folder or file. Never list
  or open the sessions folder itself first: if it is a link, that follows it,
  and a link to a share sends your sign-in names to that host. List its parent
  with a listing that doesn't follow links (`dir /AL "%USERPROFILE%\.claude"`,
  `ls -l ~/.claude`), and look inside only once `sessions` shows as no link.
  Remove a folder link with `rmdir <link>` (no `/S`) on Windows, or `rm <link>`
  with no trailing slash elsewhere, never `del` or a recursive delete. A stale
  status file keeps its worktree until you remove the file, after checking no
  session runs there.

## Rolling back

Turn the cleaner off and apply first: that removes its recorded deny rules
and the tool. An older installer refuses a configuration that names
`cleaner`, and would leave the rules in place.

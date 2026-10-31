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
node ~/.claude/pact/tools/cleaner.mjs show   [--repo <dir>] [--worktree <name>]...
node ~/.claude/pact/tools/cleaner.mjs remove [--repo <dir>] [--worktree <name>]... --yes <tag>[,<tag>]...
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

The rules file tells a session to show you the name-back as printed, in a
fenced code block, in chat only, so no name's marks can restyle it, to give a record only the result line's counts, never the tags or the
name-back, and to run `remove` only after your own yes to it in chat.

## What it keeps

- **In use:** a worktree that is, or holds, the `cwd` of a Claude Code
  session status file (`~/.claude/sessions/*.json`, on the system the cleaner
  runs on), or the cleaner's own cwd, compared both as written and by real
  path, so a link either way still keeps it. A network or device path (two
  leading separators) is compared as written, never resolved, so a planted
  one can't make the cleaner contact another host. A Windows run doesn't see
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

## What it never does

It never passes `--force`, `-f`, `-D` or `--delete`, never pushes, prunes or
calls a remote, never touches a stash, and never removes anything its
name-back didn't name with the same facts. git's own refusals stand: a
worktree with changed or untracked files, a lock or a submodule is left. A
worktree's ignored files, such as `.env`, go with its folder; the name-back
says so.

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
| 4 | `RESULT: unavailable` | git missing or older than 2.36, `.claude` or `.claude/worktrees` a link, the sessions check failed, or a read failed |

It needs Node 24 and git 2.36 or later, and runs on Windows, Linux, WSL and
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

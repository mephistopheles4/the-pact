# The cleaner

The cleaner (`claude/tools/cleaner.mjs`) removes leftover worktrees
under `.claude/worktrees/` and their local branches with its own fixed git
commands. It is a pact tool, off by default; turn it on by listing
`cleaner` in the `tools` key of `~/.claude/pact/config.json`. `show` names
back each worktree with a tag, and `remove` takes only tags whose facts
haven't changed since.

## Use

```text
node ~/.claude/pact/tools/cleaner.mjs show   [--recoverable] [--repo <dir>] [--worktree <name>]...
node ~/.claude/pact/tools/cleaner.mjs remove [--recoverable] [--repo <dir>] [--worktree <name>]... [--yes <tag>[,<tag>]...] [--override <folder>=<tag>[,...]]
```

`remove` needs `--yes`, `--override` or both. In PowerShell, write the path as
`"$HOME/.claude/pact/tools/cleaner.mjs"`, and give `--override` with
`--repo`: `node "$HOME/.claude/pact/tools/cleaner.mjs" remove --repo <dir> --override <folder>=<tag>`.

- `--repo` is any folder in the repository; the default is the current
  folder.
- `--worktree` narrows the run to the folder names given.
- `show` names back each linked worktree directly under
  `<main>/.claude/worktrees/`: its branch and tip, its changed, untracked and
  ignored files, a lock, a folder already gone, and the stash entries made on
  its branch. Each block ends with a tag; a block with a soft risk also prints
  an override tag, a warning and an undo line.
- `remove --yes` takes the tags `show` printed. It reads everything again,
  removes a worktree only when its fresh tag is among them, then deletes its
  branch with `git branch -d`.
- `remove --override` takes `<folder>=<tag>` pairs. It is the only way past a
  refusal (see [Overriding a keep](#overriding-a-keep)).
- `--recoverable` keeps more, so that only what can be recovered goes (see
  [With `--recoverable`](#with---recoverable)). Give it to both commands: a
  tag from a run without it never passes a run with it.

## What it keeps

A kept worktree has no tag, so `remove` can't take it.

- **In use:** a worktree that is, or holds, the `cwd` of a Claude Code
  session status file (`~/.claude/sessions/*.json`), or the cleaner's own cwd.
  A Windows run doesn't see WSL sessions, or the other way.
- **Commits found nowhere else, on a detached HEAD:** a worktree whose
  detached HEAD has commits on no branch and no remote. After the folder
  goes, nothing would name them. On a branch the same commits are a soft risk
  (see [Overriding a keep](#overriding-a-keep)).
- **The default branch:** `origin/HEAD`'s target, or `main` and `master` when
  that is not known. Its worktree goes; the branch stays.
- **A link anywhere inside, in every run:** remove the link itself first,
  never with a recursive delete, then the folder by hand.
- **A `.git` file that doesn't name its own folder, or a `.git` entry below
  the root** that is not a populated submodule's, in every run.
- **A folder or branch name it doesn't read, or a read that failed.**

## Overriding a keep

`remove --override` removes a worktree git would refuse, after `show` named
everything that goes. It is never on by default, and a yes alone is never an
override.

**The soft risks.** Each gets a warning and an override tag:

- changed or untracked files (every one, listed, no folder collapsed);
- commits found nowhere else, on a branch (the branch stays);
- a lock that is not a stopped session's (the override lifts it).

**The hard keeps.** A worktree holding one gets no override tag: in use; a
link, a `.git` entry or a pointer naming elsewhere; submodule data; edits git
is told not to check; a name it doesn't read or a failed read; commits found
nowhere else on a detached head; and every keep `--recoverable` adds.

Nothing brings back a deleted changed or untracked file: the undo line says
so, and names what `git worktree add` would not restore.

**Who may pass it.** The owner's own words in the chat of the session that
runs `remove`, after that session showed the block; never a relayed or quoted
message. Under a standing goal or at autonomy level 3 it is a checkpoint
instead: the session's own pick, logged and flagged. An override tag stays
valid across runs while every fact holds. Give `--repo <dir>` with
`--override`, so the permission prompt shows the repository.

## With `--recoverable`

With the flag, a worktree is also kept, with no tag, when it holds changed,
untracked or ignored files; a program a session could have set (a `filter.`,
`lfs.` or `hook.` key in the worktree's or the main worktree's config, or a
populated submodule); a submodule path through a link, or an unpopulated
submodule folder that holds files; edits git is told not to check; a work tree
set in its config; or a read that failed. Its block gives the reason and
lists the names. A program or work tree the main worktree's config names keeps
every worktree. The flag needs git 2.45 or later.

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

A worktree that `claude --bg -w <name>` locked, for a session that no longer
runs, is unlocked and removed by a plain yes. Any other lock is a soft risk.
If git refuses, the cleaner locks the worktree again with the same reason.

## What it never does

It forces only on a fresh override pair, and passes `--force` at most once,
in a `git worktree remove`; it never passes `-f`, `-D` or `--delete`, never
pushes or prunes, never touches a stash, and never removes anything its
name-back didn't name with the same facts. It asks no remote for anything, but
in a partial clone a read without `--recoverable` could make git fetch a
missing object. It unlocks a session lock, and lifts any other lock only for an
override. Without an override, git's own refusals stand: a worktree with
changed or untracked files, another lock or a submodule is left. Without
`--recoverable`, a worktree's ignored files, such as `.env`, go with its
folder; the name-back says so.

Its output is fixed words and relative names, every name escaped; it never
prints an absolute path, a session id, file contents, a stash subject or git's
own output.

## Exit codes

| Exit | Last line | Means |
| --- | --- | --- |
| 0 | `RESULT: shown <n> <tags>` or `RESULT: removed <r> left 0 changed 0` | done |
| 1 | `RESULT: removed <r> left <l> changed <c>` | something named in `--yes` or `--override` was left, or changed or gone since the name-back |
| 2 | `RESULT: refused <count>` | a usage fault; nothing ran |
| 4 | `RESULT: unavailable` | git missing or older than 2.36 (2.45 with `--recoverable`), `.claude` or `.claude/worktrees` a link, the sessions check failed (including the sessions folder or a status file being a link or the wrong kind), or a read failed |

It needs Node 24 and git 2.36 or later (2.45 with `--recoverable`), and runs on Windows, Linux, WSL and
macOS. The cloud copy doesn't install it. Its deny and ask rules are in
[install](install.md), step 4's `Tools:`.

## Your own `claude rm`

Run `claude rm <id>` from a separate terminal,
outside Claude Code. That works whether or not Claude Code's `!` shell mode
honours deny rules; whether it does is **unmeasured**, and Claude Code's own
docs are silent on it. `claude rm <id>` deletes the session's worktree with
everything left in it, including what the cleaner kept: run it only after the
cleaner has removed the worktree, or after you have checked the worktree
yourself.

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
  folder or a status file is a link or not a plain folder or file. List the
  Claude home first with a listing that doesn't follow links (in Command
  Prompt `dir /AL "%USERPROFILE%\.claude"`; elsewhere `ls -l ~/.claude`), since
  a link to a share sends your Windows sign-in to that host, and look inside
  `sessions` only once it shows as no link. Remove a folder link with
  `rmdir "<link>"` in Command Prompt, or `rm <link>` elsewhere; never a
  recursive delete. A stale status file keeps its worktree until you remove
  the file, after checking no session runs there.

# The cleaner forces only on an override tag the owner gives for that run

[ADR 0124](0124-the-cleaner-removes-worktrees-with-fixed-commands-and-never-forces.md) said the cleaner never forces. This reverses that (#523). When only a **soft risk** stands in the way, `remove --override <folder>=<tag>[,<folder>=<tag>]` passes `git worktree remove --force` once for that worktree, after the block named everything that would be lost. The cleaner still never passes `-f`, `-D` or `--delete`, and never touches a remote or a stash. It supersedes [ADR 0063](0063-the-pact-sets-no-ask-rules-and-defers-to-the-harness.md) in part: the cleaner's switch adds two ask rules, the only ones the pact sets.

## What it covers

- **Soft risks,** each with a warning and an override tag: changed or untracked files; commits found nowhere else, on a branch; a lock that is not a stopped session's.
- **Hard keeps,** which get no override tag, for the reason given:
  - **In use** (a session's cwd, or the cleaner's own): the folder would go from under a live process.
  - **A link, a link or `.git` entry in the walk, or a pointer that names elsewhere** (#442, #454): the warning can't say what a forced removal would delete or which host it would touch.
  - **Submodule data** (a gitlink in the index, or a `modules` folder in the admin folder): forcing deletes a submodule's repository, which no list names.
  - **Edits git is told not to check** (assume-unchanged, skip-worktree): the cleaner can't list what those files hold.
  - **A name the cleaner doesn't read, or a read that failed:** it can't safely say what it would delete.
  - **Commits found nowhere else on a detached head:** after the folder goes nothing names them.
  - **Every `--recoverable` keep:** the flag asks to keep whatever can't be recovered.
- **The override tag** is 16 hex over the worktree's full facts, listed files' sizes, change times and inode included, so a change after the name-back makes it stale. It is valid across runs while the facts hold. A last read runs before git is told to force.
- **The block** counts what is lost and lists it uncapped, with an undo line run from the repository root. `remove`'s lines go to chat only.
- **Who may pass it:** only on the owner's own words in the chat of the session that runs `remove`, after that session showed the block. `show` and `remove` both print the rule. The printed rule is a reminder, not a control.
- **Two ask rules** (`CLEANER_ASK`): `Bash(*cleaner.mjs*remove*--override*)` and its `PowerShell(...)` twin, added to `permissions.ask` while the cleaner is on, recorded under `cleanerAsk`, and removed only when recorded and fixed. They make Claude Code ask before a forced removal runs, in auto mode too. If `settings.json` is not strict JSON the install leaves it untouched and warns, naming both rules.

## Why

The refusals git gives (changed files, an untracked file, a lock) are right for a session's own work and wrong for a worktree the owner has decided to discard. Without a route, the owner gets the less careful one: `rm -rf`, a raw forced `git worktree remove`, or `claude rm` and its archive. A tool that names every file it will delete, binds the removal to the facts it named, and prompts, loses less than those.

## What was weighed

- **One flag per run, not one flag per risk.** Not taken: a pair per worktree names what goes in the command and in its permission prompt.
- **A backup before discarding.** Not taken: it would copy files the owner chose to lose, and be the new place the data lives.
- **A detached head made soft.** Not taken: nothing would hold its commits afterwards. A branch makes them soft, since the branch stays and names them.
- **Text-only authorisation, with no ask rule.** Not taken: the rule is text a session can ignore; the ask rule is the one control outside the session's own judgment.
- **A tag that expires.** Not taken: the facts bind it, and a clock would add a second way for a stale tag to look fresh.
- **Bare tags against folder pairs.** Not taken: a pair puts the folder in the prompt.
- **`disableBypassPermissionsMode`.** Weighed and not taken: it is the owner's own setting, not the pact's to set.
- **Mods approving past ask rules.** Accepted: an installed mod or a permission-prompt tool can approve past an ask rule with no prompt and no classifier, unless managed settings or a Team or Enterprise login is in place. The threat model says so.

## What the ask rule misses

As [ADR 0042](0042-the-apply-guard-asks-on-any-command-naming-the-install.md) lists its own, the ask rule is a speed bump, not a boundary. It misses:

- a path held in a variable or a splat;
- `Cleaner.mjs` under the Bash tool, where the match is case-sensitive;
- a wrapper script that holds the words;
- possibly a backslash-newline split;
- every call under `bypassPermissions`.

It will also prompt on any command whose text names those three words in that order, a commit message for example. That is accepted: in an ask rule a match it shouldn't make only prompts.

## Rolling back

An older installer ignores `cleanerAsk` and leaves the two rules in `settings.json`, where they look like the owner's. Turn the cleaner off and apply at the new commit before reverting.

## How this was decided

- Spec revision 5 on #523, thorough tier. The sensitive route was declined by the owner through the lead (decision 16). Decisions 20, 22 to 25, 36, 43 and 59 shaped the soft and hard line, the override pair and the ask rule.
- The change widens an accepted threat class (decision 314) and loosens git's refusals, so the merge waits for the owner's confirm in chat. The install apply and the first override are the owner's.

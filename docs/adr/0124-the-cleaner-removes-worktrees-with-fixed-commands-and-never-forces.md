# The cleaner removes worktrees with fixed commands and never forces

A pact tool, `claude/tools/cleaner.mjs`, off by default as every pact tool is ([ADR 0074](0074-pact-tools-are-opt-in.md)), removes leftover worktrees under `<repo>/.claude/worktrees/` and their local branches (#438):

- **Fixed commands, no parsing.** It runs its own `git worktree remove <path>` and `git branch -d <branch>`, and nothing else that removes. git runs by an absolute path, from an empty folder, with an empty hooks folder and fixed flags.
- **A name-back, then one yes.** `show` names each candidate with what it holds and ends with a tag over its full facts; `remove --yes <tags>` reads again and takes only candidates whose fresh tag is named. The rules file part binds the yes to the owner, in chat.
- **Never forces.** git's refusals stand; it never passes `--force`, `-f`, `-D` or `--delete`, never touches a remote or a stash. It keeps a worktree in use by a session or holding commits found nowhere else, and the default branch. A worktree whose folder stays after git's removal is reported, with its branch left.
- **Its deny rules come and go with it.** While it is on, the install adds sixteen deny rules on raw removal commands to `settings.json`, records those it added under `cleanerDeny`, and removes only those when it is off.

## Why

Sessions removed worktrees with raw git commands from their own shell, and a gate that reads shell text to tell those commands apart could not be made complete (grimoire PR 470). A tool that runs its own fixed commands needs no such reader; git already guards most of the data, so the tool's own work is the cases git doesn't refuse, the name-back, and binding the removal to what was named.

## What was weighed

- **Every worktree of the repository.** Not taken: only `.claude/worktrees/`, where Claude Code and Brigade make them; the owner's hand-made worktrees are never candidates.
- **The deny rules in the overlay or each project.** Not taken: the overlay would deny the commands on installs without the cleaner, and project settings leave most repositories with none.
- **A typed yes** (the owner running `remove` through `!`). Not taken: unprobed; the rule-bound yes stands, with the deny rules' gaps, as an accepted risk recorded in the threat model at hand-off.
- **A branch name outside the allowed set.** The spec held two readings; the build keeps both worktree and branch, the safer one.

## How this was decided

- **2026-10-31.** Decided on #438, spec revision 3, thorough tier on the sensitive route. The proceed was the lead's own pick under the owner's level-3 command, decision 325, not the owner's words. q1 and q2 (scope and where the deny rules live) were the lead's pick, decision 304; the accepted risk (decision 314), the name-back staying in chat (317) and revision 3's fixes (324) were the owner's words, relayed by the lead; revision 2's security fixes were the lead's pick, decision 315. The Brigade seam was agreed between the design and plan sessions by message.

# The tree check only detects

**2026-11-26.** The owner picked a simpler check (PACT-105, spec 0007 S2 item 56), relayed by the lead session. It loosens a control.

## What changed

- **One command** (`claude/review.md`, Running a lens) records the work tree and git's own files before each lens and `scout` pass, and again after it, in a harness that can't hold an agent to its tools. Any difference, or a failed run, stops the session, which reports it.
- **Gone:** the copies of git's folders, putting them back, resetting moved refs and restoring paths. Uncommitted work a lens changed can't be put back automatically.
- **Now seen:** every ignored file, which the old check could miss inside a folder too big to hash.
- A real run had found that under Codex's Windows sandbox, which runs commands as another account, the copy couldn't be kept readable only by the owner. With no copy, that ends.

## Left open

- The command reads every file, so it takes longer in a large tree.
- It doesn't see git's objects, a submodule's git folder, another worktree, or anything outside the tree.

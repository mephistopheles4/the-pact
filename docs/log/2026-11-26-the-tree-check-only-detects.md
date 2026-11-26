# The tree check only detects

**2026-11-26.** The owner picked a simpler check (PACT-105, spec 0007 S2 item 56), relayed by the lead session. It loosens a control.

## What changed

- **One command** (`claude/review.md`, Running a lens) records the work tree and git's own files before each lens and `scout` pass, and again after it, in a harness that can't hold an agent to its tools. Any difference, or a failed run, stops the session, which reports it.
- **Gone:** the copies of git's folders, putting them back, resetting moved refs and restoring paths. Uncommitted work a lens changed can't be put back automatically.
- **Now seen:** every ignored file, which the old check could miss inside a folder too big to hash.
- A real run had found that under Codex's Windows sandbox, which runs commands as another account, the copy couldn't be kept readable only by the owner. With no copy, that ends.

## Test round 2

The security lens and the check of the claims found ways past the first command, all closed: a program or version pin in the tree could pick the `node` that ran it, so it now starts from the home folder; a linked worktree's own refs, a hooks folder set elsewhere, half-done merges and rebases, and a file name that isn't text went unrecorded. The record now ends in one hash of itself.

## A further security read

The command's own git listing could fetch a missing object in a partial clone, which runs programs the repo's config names; it now fetches nothing. No fingerprint is cut short, and only the record's last line is compared. The index is recorded as its entries, so its cached trees are left out: wording narrowed here and in the threat model, for the owner to rule with the detect-only change.

## Left open

- The command reads every file, so it takes longer in a large tree.
- It doesn't see git's objects, a submodule's git folder, another worktree, or anything outside the tree.

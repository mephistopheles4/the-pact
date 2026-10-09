# Publish with the history as it is

the-pact is made public with its git history and its tracker as they are. Nothing is rewritten or force-pushed. The current tree is cleaned instead, and the README speaks to any reader, not to a set of adopters.

- **The history stays (D1).** Older commits keep the owner's Windows username in file paths, in 43 commits. Two commits name a private research folder, without any of its content. Both are accepted.
- **The author email stays (D2).** It is the owner's public address.
- **The tracker goes public with the repo (D3):** every issue, comment, PR and review, and their edit histories. Personal paths in comments are accepted, as in the history. Copied private content is not: the one draft that held it (#114) was deleted before publishing.
- **No specific audience (D4).** The README serves any reader. The payload stays written for one owner, with its Windows shell rule and personal references, and the README says so. Names of the owner's other projects stay, because each one the payload names is public.
- **The current tree is clean, and stays so.** No tracked file holds a home path with a real username. `gate/tests/home-paths.test.mjs` fails on a new one, in any of the forms #161 found.
- **Everything is scanned before the flip.** A dedicated secret scan (gitleaks), a private-term check and the path check ran over every published git object and the tracker text (#161). They run again in a final rescan after the last merge. Anything found that these decisions don't cover stops the flip. The secret scan has a known limit: its generic rule needs a keyword such as "secret" or "token" near a value, so a key in a custom format with no such keyword can pass it. Its rules for known provider key formats need no keyword.
- **The tracker is protected at the flip.** The rule that only the owner's account's text counts (#160) lands first, and is the protection that lasts. GitHub's interaction limit is set when the repo goes public; it expires after at most six months, and the owner decides then whether to renew it.

## Why

- **The cost of the other routes is out of proportion to what they would hide.** A history rewrite needs a force-push of every branch, a rebase of every worktree, and GitHub Support to purge PR refs and cached views, because GitHub keeps old commits reachable through PRs that reference them. Publishing a fresh repo would leave the tracker behind, and the tracker is where every plan, review and decision lives (ADR 0007).
- **What the history holds is already public, or harmless.** The owner already says publicly that they keep private research; the two commits name its folder and hold none of it. A username in a path is not a credential.
- **A secret or private content would change the answer.** D1 holds only while the scans find none. A live secret is rotated first, and the owner then decides again whether the history can stay.
- **One reader-neutral README is cheaper than a product.** The pact is research, not a product. Writing for outside adopters would mean generalising the payload; saying plainly whose setup it is costs one section.

## How this was decided

- **2026-10-08** in mephistopheles4/the-pact#10. The triage laid out three routes: accept the history, rewrite it, or publish a fresh repo. The owner chose (a), accept it as it is, then answered the audience, tracker and email questions. #9 folded into #10, and spec draft 2 was signed off the same day.
- **2026-10-09:** #161 cleaned the tree, added the guard test and ran the scans. The owner accepted the one tracker hit for a private term as a false positive, and gave a disposition to each unfixed security finding on the tracker.
- **Still holds:** [ADR 0007](0007-only-decisions-are-committed.md). Plans and reviews live on the issue, which is why the tracker publishes with the repo.

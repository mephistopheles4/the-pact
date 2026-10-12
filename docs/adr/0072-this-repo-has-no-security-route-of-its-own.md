# This repo has no security route of its own

Work on this repo takes the pact's tiers, and its sensitive route where the work matches the sensitive-work list, from the workflow, as work in any project does. The repo's own list of changes that always took the security pair on the spec and the diff is gone (#262, the owner's decision in chat, after the end-of-PR review).

## What changed

- **The list goes.** `AGENTS.md`'s "Which changes take the security route" (the rules file, the review file, the protected set, security-set lenses, the pact commands, the settings guard, the tracker rule, the gate's code and the cloud copy) is replaced by "What every change here needs".
- **What stays:** each check the gate's code adds or tightens needs a bad case it is seen to catch; deleting or loosening a check, or changing a built-in default that bounds anything, is a spec change; the gate's tests are never a one-line change; a reviewer reads every change at move 4; the owner may ask for a probe, a security pair read or a closer look on any change.
- **The cloud copy** is read closely, as a published script that runs as root, and its tests are never cut candidates; it no longer names a route.
- **A security-set lens** keeps its meaning for the gate's dry-run marks: either lens of the security pair, or a lens that holds a shell or network tools, or guards the sensitive route or the sensitive-work default.

## Why

- **The sensitive route already comes from the workflow.** The pact's sensitive-work default flags auth, secrets, crypto, input validation and data migrations, recommends the route, and offers the security pair once more at Test. A second, repo-only list ran the pair on changes the workflow didn't see as sensitive, at a cost the owner no longer wanted.
- **Since ADR 0069 the gate checks install mechanics only,** and the pact is vetted like a skill. A route built to defend the gate's text checks outlived them.

## What was weighed

- **Keeping the route for the gate's code and the cloud copy only.** Not taken: the owner wants no repo route; the bad-case rule and the close read of the cloud copy keep what mattered most.
- **The protected set.** Left as it is: a change that cuts or weakens one of its three items is still a spec change read by the spec pair and the security pair. It guards the pact's own text for everyone who installs it, which is a different question from how this repo's changes are reviewed.

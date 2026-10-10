# Agent and rule changes are proved by review, not by probe

A change to an agent or a rule never needs a planted probe or a security-set rerun. AGENTS.md's "Testing a change to an agent or a rule" now says:

- **The old probe floor takes the security route instead.** The security pair reads the spec and the diff of a change to the risk floor, the security route, a gated clause, the protected set, a security-set lens, a non-lens agent with a shell or network tools or that guards the route or the floor, the tool allow-list or the settings guard.
- **Three more items join that list:** the cross script, `cross/cross.mjs`, which refuses a malformed or out-of-tier lens report; `docs/agents/issue-tracker.md`, which the gated `tracker-authors` clause tells every session to read live from GitHub; and the list itself, so a change that removes an item takes the route.
- **The gate's code is unchanged.** It keeps the security route, and each check it adds or tightens still needs a bad case it is seen to catch.
- **Everything else is proved by use,** as before.
- **Depth stays the owner's dial.** The owner may ask for a planted probe by name. Such a probe posts its expected result first, runs in a fresh interactive session, and is recorded verbatim.
- **The definition of a security-set lens stays.** The install's override warning and the lens files use it. The warning now ends "the pact reviews only its default", and the mark "override, not security-tested" stays word for word: it means a lens runs off the default the pact ships and reviews.

What went with the probes:

- **The practice cases and their scorer:** `gate/tests/fixtures/probes/`, `practice/`, `sandbox/` and `tier-probe-plants/`, `practice-score.mjs`, its two tests, `tier-probe-plants.test.mjs`, and each `familiars/*.practice-test.md`.
- **The vocabulary:** practice case, security set, bad report, and the floor itself. Each lens contract's Held-by lines that cited a security-set case or a practice case now say review at move 4 holds them.
- **The checks on the lens files' own text stay.** The carried rules, the carried checklists and the restated gated lists are checked word for word in `lens-text.test.mjs`, which took them from the deleted `practice-words.test.mjs`.

The floor bullets for the test runner, the copy list, the table module, the in-process runner and its two guards went too. They are ordinary test code now; #189's second ticket records why.

## Why

- **The probes mostly tested themselves.** About 45 probe and practice runs since 2026-09-26, most in sessions the owner started by hand, caught three real defects. Each was in a lens's own practice cases or wording (B1, D1, P-QA result 5), none in the work under review. Only one probe, P-TRACKER, showed that a rule changes behaviour.
- **The reviews found the real holes.** #161's home-path guard gaps, #162's settings widening (which became #177), #110's missed tampered rule and #170's pusher-versus-opener gap were all found by lens reviews on real work.
- **The cost fell on the owner.** Each floor change took at least one owner-started session, plus the fixtures to keep in step.
- **The security route keeps a second read where a miss is expensive or silent.** It costs a review, not a session the owner runs.
- **The accepted risk is named.** A lens's behaviour is now reviewed but not tested: a lens that reads well and behaves badly shows up only in use. The threat model records it as R20, and the test runner's new status as R21.

## The one-time waiver

Under the rule this ADR replaces, #189's own changes to the risk floor, the protected set and the security-set lenses would each have needed a probe. The owner waived that once, in chat on 2026-10-10, as on #67. #189 is proved by the security route and the full suite instead.

## Supersedes

- [ADR 0014](0014-evidence-in-proportion-to-the-cost-of-being-wrong.md), in part: its floor no longer needs a probe. Its default (proof by use), its dial and its doubt rule still hold, with doubt now falling to the security route.
- [ADR 0015](0015-practice-runs-in-an-isolated-container.md): no practice runs remain to isolate.
- [ADR 0018](0018-fix-path-stands-in-for-the-plan-review.md): no security-set cases remain to fix.
- [ADR 0022](0022-a-sign-case-scores-the-sign-in-its-own-finding.md) and [ADR 0023](0023-a-payload-is-judged-by-running-it.md): the scorer rules they describe are deleted.

## How this was decided

- **2026-10-10** — Decided in mephistopheles4/the-pact#189, S3 of the spec at revision 3, signed off by the owner in chat. Built in #209.

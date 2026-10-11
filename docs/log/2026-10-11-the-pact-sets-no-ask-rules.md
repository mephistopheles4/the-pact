# The pact sets no ask rules

**2026-10-11.** The pact no longer ships permission ask rules (mephistopheles4/the-pact#265). The settings overlay sets no `permissions.ask`, seam A requires none, and the install takes the retired rules out of a live `settings.json`, so the owner's prompts stop after the next install. ADR 0063 records the decision.

## What it set out to do

The owner asked to drop the ask rules: "I don't even need the prompts anymore", and, on keeping a few edit asks, "We are trying to do what the harness already does again." The rules misfired on mentions: #239's T1 prompted the owner because a body said "ruleset". The owner had already removed every ask rule from their live settings by hand, and a dry run from `main` showed the overlay would add 52 back.

## What was built

- **The overlay and the settings guard.** `claude/settings.overlay.json` loses its ask list; everything else stays. `gate/settings-allowlist.json` loses its ask entry, and seam A loses the two lists it required and their checks. An overlay that sets an ask list now fails as `settings-unlisted`, a bad case the tests catch. `permissions.defaultMode` stays required, with its own bad case.
- **The install.** `RETIRED_ASK` holds the 56 retired rules: the 52, and the four broad ones ADR 0049 retired. The merge drops each from the live ask list after its union, matched exactly. The dry run prints one `- permissions.ask:` line per removal and a `NOTE:` with the count, in place of the old "lacks N" warning. The post-apply guard checks auto mode and that no retired rule is left; an absent ask list holds.
- **The cloud copy** was regenerated with the new overlay. Its jq merge is unchanged.
- **The docs.** `docs/install.md` says the merge takes the old rules out, and keeps a hand-removal step for the older rules it doesn't know. The threat model renames R22 to "Apply unprompted" and names what now stands before each action: Claude Code's protected paths, auto mode's classifier, and nothing for the review folder but its own checks. `AGENTS.md`'s rollback note and the scriptorium skill drop their ask-rule wording.
- **The tests.** The matcher model, its command tables and every test that the rules were present or asked are retired with the rules. The helper keeps the retired list as a frozen literal, which the install's copy must equal.

## What the build found

- **The risk floor applied.** The install now edits the owner's live settings, and seam A validates input, so the work ran as thorough: the spec pair read the spec beside the security pair and `unstated-lens`. It stayed one ticket in one session, as the owner chose for speed.
- **The spec review's gaps were all fixable in the spec.** `executability-lens` called revision 1 blocking with 14 findings: done-criteria, stop conditions, the guard's result for a missing list, the source for the frozen list. The security pair asked the threat model to say plainly what now stands before the apply, branch protection and the review folder. Revision 2 took them all; the owner declined an auto-mode block rule and a review-folder refusal for now.
- **Older pacts added rules the install doesn't know.** Move 4 asked whether every supported rollback target's rules are on the retired list. A check of history found six `main` commits from the cutover on that shipped 22 others: 20 that guarded the PowerShell installer, and two `--rev*` rules. The approved plan left the PowerShell ones to the hand step, so `docs/install.md` names all 22 for hand removal, after a rollback too, rather than widening the list.
- **A restored rule doesn't last.** The merge drops the retired strings on every install, so the guide says a rule the owner wants back must differ from them. The threat model's R14 now says the same foothold that plants a file can rewrite the install record the drift check compares with.
- **One file outside the plan.** The scriptorium skill lost a sentence saying the `pact/` folder asks before each edit. The spec didn't name the file, so it went to the owner at acceptance.

## Record

- The spec, revision 2: mephistopheles4/the-pact#265 (comment 6114662797); revision 1: 6114582898.
- Its reviews: the security pair (6114652791), the spec pair (6114652961) and `unstated-lens` (6114653127); the Lens dispositions: 6114662659.
- The owner's decisions on #265: the issue body; proceed, no block rule, no review-folder refusal (6114676415).
- The build record and claims C1 to C8: 6114838145.
- Move 4's reports: the QA pair (6114904109), `unstated-lens`, whose cross failed its block-count check (6114904276), the standards pair (6114904413) and the security pair (6114904582); the Lens dispositions: 6114943962.
- The PR: #268.

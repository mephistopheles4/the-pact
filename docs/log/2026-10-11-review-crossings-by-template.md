# Review crossings by template

**2026-10-11.** The cross script is gone (mephistopheles4/the-pact#264). A session lays out a lens review from a template in `claude/review.md` and posts it; nothing parses a report or refuses one. ADR 0064 records the decision.

## What it set out to do

The owner's view was that the script made more friction than it helped. #260's measure found cross refusals the largest single source of lens reruns: 11 each for `adversarial-lens` and `data-lens`. The direction was to let guards that check text shape give way to judgment, and keep guards on what can run.

## What was built

- **The removal.** `cross/cross.mjs` and `cross/render-check.mjs` are deleted. Seam A loses `CROSS_FILES` and the `cross-script` and `cross-imports` rules; the install's staging, copy set and bootstrap filter lose their cross case; nothing under `cross/` stages or installs.
- **The template and the posting rules** in `claude/review.md`, with the table of pairs kept and its `--point`, `--tier` and `--anchors` columns gone.
- **The nine lens files and their contracts.** The report ends in a plain list. The lens-text test's pinned words follow the rename to "Not checked".
- **The tests.** The cross-named test files and their helper are deleted. The `isStaged` case, the copy-set rows, the cloud-copy bad cases and the roster check retarget to a file that survives. One test says no installed file names the script.
- **The docs.** `AGENTS.md`, `docs/reference.md`, `docs/install.md`, the README and its third figure, `CONTEXT.md` and the threat model, which gains R29 and updates R3, R13, R17 and R23.
- **Regenerated:** the cloud copy, the builder page and the figures.

## What to look at next

- **Did it pay off?** Compare the reruns in the Lens dispositions tables of the next few reviews with #260's measure, and note any crossing the template missed that the old join would have caught.
- **After the merge,** the owner installs, re-pastes `cloud-sessions/cloud-setup-wrapper.sh` into the cloud environment's setup field and checks the first session's `pact cloud copy` line. Until the install, the live pact still tells sessions to run the installed script.

## Record

- The spec, revision 3: mephistopheles4/the-pact#264 (comment 6115307148); revision 2: 6115232203.
- The owner's decisions on #264: the issue body; proceed with one trim (the comment headed "Owner decision, from chat").
- The PR: filled in at merge.

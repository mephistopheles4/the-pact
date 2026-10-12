# Review crossings go by template and judgment, with no cross script

The cross script is gone. A session lays out each lens review from a template in the review procedure (`claude/review.md`), puts crossings first by judgment, and posts it. Nothing parses a report and nothing refuses one. Each lens ends its report with a plain list in place of the `lens-findings` JSON block. This supersedes [ADR 0053](0053-review-is-nine-lenses-in-pairs-joined-by-the-cross-script.md) in part, for how a pair is joined, and [ADR 0054](0054-the-cross-script-places-the-verdict.md) in part, for who places the verdict: its rule that a report opens without a verdict word stands (#264).

## What changed

- **The script and its place in the install.** `cross/cross.mjs` and its render check are deleted. Seam A no longer lists it, no longer holds it to a character scan and an import rule (`cross-script` and `cross-imports` are deleted checks), and nothing under `cross/` stages or installs. The next install deletes the live `pact/cross.mjs` by the existing rule for a dropped pact file.
- **The template.** One comment per review: a heading, the pair verdict (the stricter of the two lenses' own `Verdict:` lines, with "not verified" for `inconclusive`), crossings first, then one-lens-only, then not-checked, then the verbatim reports each in a fold. A crossing is the same anchor: a section or claim id, a file and symbol, or overlapping lines. The spec pair's crossings are headed "Disagreements: you settle these".
- **The report ending.** A `Verdict:` line, `Findings:` with one line each, `Not checked:` and an optional `Non-risks:`. The JSON, its key and length rules and the pictograph and crossing-mark rules go. The lens files keep the two sections, "a high finding makes the verdict blocking", the anchor kinds, and "no control, invisible or direction-changing characters".
- **Posting.** The no-secret read before posting, which was the session's job before the cross call, is now a written rule in the review procedure. Verbatim reports go in a fenced block with the info string `text`, and every string the session takes from a report goes in a code span.
- **The security pair at any tier.** The script refused the pair at a tier but thorough. The owner's direction in #264 is that the security route adds the pair and doesn't by itself make work thorough, so the refusal is dropped on purpose.
- **Lens dispositions.** The "cross result" field becomes "rerun, if any", which keeps the count the next review of this change measures.

## Why

The owner's view: the script makes more friction than it helps. In #260's measure, cross refusals were the largest single source of lens reruns, 11 each for `adversarial-lens` and `data-lens`. This follows the rewrite's direction: guards that check the shape of text give way to model judgment, while guards on what can run stay (ADR 0060, ADR 0061).

## What the script checked that is now judgment

- **Shape and character checks on posted reports,** which moved from a boundary to a rule. The threat model's R29 records the hidden-character gap and names the poster's scan (#246) as the code check that takes it over. The script never scanned for secrets; the threat model's R3, R13 and R23 now name the written no-secret read.
- **The agreement rule** (a high finding forces "blocking") is a lens-file rule only. The session doesn't re-derive a lens's verdict (the owner's trim on #264).

## Not chosen

- **Keeping the script for the join only.** It still needed a parser and a block shape, so the friction would stay.
- **A re-derivation of each lens's verdict and a mismatch mark** (`adversarial-lens`'s F4 on the spec). The owner took it as the script's friction coming back as a rule.

## How this was decided

- **2026-10-11** in mephistopheles4/the-pact#264: the owner decided to drop the script and leave the crossings to the model's judgment, with a template to show them. On spec revision 2 the owner chose proceed with one trim: drop the verdict re-derivation, which became revision 3. The security pair and `unstated-lens` read the spec.

# result-checker: playbook framing build

*Verbatim report from `result-checker`, 2026-09-27, on the uncommitted build of `2026-09-27-playbook-framing.md` draft 4 (commit `ec4e39e`), before the build commit.*

**Verdict: CONFIRMED.** Criteria 1, 2, 3 and 5 all pass, and `git status` shows only the three expected files modified. I edited nothing. My only file was a comparison script in the session scratchpad, outside the repo.

**How I checked.** I wrote a Python script that compares the working files with `git show HEAD:<path>` and with the plan's fenced blocks and quoted replacement text. For `claude/CLAUDE.md` it took the HEAD file, applied C1, C1b, C1c, C2 and C3 using the plan's wording, and compared the result with the working file after collapsing whitespace. It also split both versions into paragraphs and diffed them, byte for byte.

**Conditions checked:**

- **`git status`: pass.** It lists only `README.md`, `claude/CLAUDE.md` and `docs/adr/0008-throwaway-after-two-paper-rounds.md` as modified. Nothing is untracked.
- **Criterion 1 (`claude/CLAUDE.md` holds C1, C1b, C1c, C2 and C3, and nothing else changed): pass.**
  - Applying the five changes to HEAD gives the same text as the working file, after whitespace is normalised.
  - The paragraph diff changes only four paragraph ranges:
    - the "What no skill overrides" paragraph (C1b);
    - the "Size the work first" paragraph through the old step 3 (C1 and C1c);
    - the "Every plan's **Needs a human**" paragraph (C3);
    - the "Name the options" paragraph (C2).
  - Every other paragraph is byte-identical to HEAD. Both versions use LF line endings and end with a trailing newline.
  - The C1 and C1c blocks appear in the file byte-exact, with the plan's own line wrapping.
  - C1b and C2 are re-wrapped only, which the claim allows.
  - **Insertion points are correct:**
    - C1c sits after "4. **Stay the owner.**" and before "**Gate every builder hand-off**".
    - "The spec is the plan." sits after "It says "None" if there are none." and before "When a step trips a signal the plan doesn't handle".
  - **Rendered structure is sound:** moves 1–4 form one list with no blank lines between items. The list is preceded and followed by blank lines, so its numbering runs 1–4 unbroken. The file contains no code fences, before or after the change.
- **Criterion 2 (`README.md` holds C4 with the website URL): pass.**
  - The working file equals the HEAD file with the C4 block inserted, byte-exact, directly before "## What's here". That is right after the tagline paragraph.
  - The URL `https://aymandiab.com/work/engineering-workflow-playbook` is present.
  - The file contains no code fences.
- **Criterion 3 (ADR 0008 holds C5): pass.**
  - Three sentences are removed: the bold "**`claude/CLAUDE.md` does not offer this yet.**" sentence, the "After two rounds…" sentence and the "…follow-up F1." sentence.
  - The "Not yet in the pact's text" bullet is replaced under "How this was decided" by "**2026-09-27** — Landed in `claude/CLAUDE.md` by the playbook-framing plan, as an option under 'When to stop or escalate' (F1 closed)." The wording matches the plan. The bold date follows the file's other bullets.
  - Nothing else in the ADR changed.
- **Criterion 5 (no absolute local paths): pass.** The full `git diff` contains none of `C:\Users`, `C:/Users`, `/Users/` or `/home/`.

**Not checked:** criterion 4, the private-names grep, which the main session ran separately.

**Advisories (both non-blocking):**

1. **P4, confidence high. The ADR's "Why" section still speaks of the past.** One bullet says "With no throwaway on offer, the choices after round two were…".
   - Evidence: `docs/adr/0008-throwaway-after-two-paper-rounds.md`, second "Why" bullet.
   - Expected: C5 does not touch this bullet.
   - Actual: it is unchanged, which is correct. It describes the 2026-09-27 gate plan, so it is still accurate after this change.
   - Recheck: none needed.
2. **P4, confidence medium. In `README.md`, the "**Built on:**" line runs straight into its list with no blank line.**
   - Evidence: the C4 block in the plan and in the README.
   - Expected: the list renders as a list.
   - Actual: CommonMark and GitHub let a bullet list start directly after a paragraph, so it should render correctly. This is copied verbatim from the plan. I did not view the rendered page.
   - Recheck: view the README on GitHub once the repo is published.

**Files:** `claude/CLAUDE.md`, `README.md`, `docs/adr/0008-throwaway-after-two-paper-rounds.md`, and the spec `docs/plans/2026-09-27-playbook-framing.md`.

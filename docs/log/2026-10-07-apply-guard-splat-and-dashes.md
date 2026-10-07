# The apply guard catches the splat and the Unicode dashes

**2026-10-07** — The install's `-Apply` ask rules now also catch a splatted `-Apply` and the three dash characters PowerShell takes in place of a hyphen, through both the PowerShell and Bash tools (mephistopheles4/the-pact#89, built in #108). The decision is [ADR 0020](../adr/0020-the-apply-guard-catches-what-text-can.md).

## What it set out to do

#89 asked whether spellings of `-Apply` get past the "ask" rules that make a session stop for the owner's go-ahead. Letter case was already covered. The splat was a known miss, accepted on #1 after #34. The plan session's throwaway found a third shape: PowerShell reads an en dash (U+2013), em dash (U+2014) or horizontal bar (U+2015) as a parameter's hyphen, and no rule held those characters. The owner chose option A, patch and accept, with a reopen trigger.

## How it was built

- **Eight rules, in four places.** A splat rule and one rule per dash, for each tool, went into the overlay, the settings allow-list, seam A's required list and the tests. Each dash is written as a `\u` escape. The splat rule needs a space before the `@`, so a here-string's closing `'@` doesn't trip it.
- **Test-first.** The red commit (`9db1846`) held the data and the tests with seam A and the install unchanged: 16 tests failed, each for the expected reason. The green commit (`bf3d6d8`) extended seam A's list and the install's display.
- **The dry run prints rules escaped.** Every character outside printable ASCII, and the backslash, prints as `\u` and four hex digits. A console code page can't show a dash rule as a hyphen rule. Escaping the backslash went beyond the spec: without it, a rule holding the plain text `\u2013` would print like a real en dash.
- **Where the spec disagreed with itself.** Its Testing Decisions show the dry run printing the dash itself; its Implementation Decisions, user story 14 and the ticket say `\uXXXX`. The build followed the ticket.
- **A tool trap.** The Edit and Write tools decode a typed `\uXXXX` into the character. Every escaped file was checked byte by byte after editing.

## The probe

Expected results went on #89 before any run, with a code-point check on every dash step against the session's transcript.

- **Control run, before the install.** Six of the eight steps already prompted under the old rules: the PowerShell en and em dash, the Bash splat and all three Bash dashes. Only the PowerShell splat and horizontal bar read not prompted (classifier denials). The Bash splat has no dash and matches no rule, so the prompts most likely come from a check built into Claude Code, not from rule text. The build stopped, and the owner chose to record the deviation and go on (option 2), keeping the six rules as a backstop.
- **Install.** On the owner's go-ahead in chat, `-Apply` installed `bf3d6d8`, exit 0, and all 22 pact rules were confirmed in the live settings.
- **Probe run, after the install.** Every step expected to prompt did, and the negative control (the dry-run spelling) didn't. The two rules with a seen-to-fail control are proved live: `PowerShell(*install.ps1* @*)` and the PowerShell horizontal-bar rule. An apply step in a `;` chain, a `try`/`catch` and an `&` script block each prompted, so the reopen trigger didn't fire. Prose naming the script next to an em dash prompted, as option A priced.
- **A wrong claim, corrected.** After the install, the build session said its own background session had run `-Apply` unprompted. The owner had seen the prompt and approved it. An approved command looks unprompted from the session's side.

## Move 4

- **Tests and gates.** 664 of 664 gate tests pass; seam A passes.
- **The QA pair** found four test gaps; the cross passed. Three were fixed in `2be2051`. The non-advanced check now asks PowerShell itself, because a text pattern missed namespace-qualified attributes. A bad case drops the splat's space, and a dry-run bad case uses hand-written escapes for invisible characters. The fourth, six rules without live proof, repeats the owner's option 2.
- **`security-reviewer`** passed the code and corrected the #1 post: class (d) is any separator but one plain space; only two rules are live-proven; cloud containers are excluded. It also found that the install compares rules culture-aware, which ignores invisible characters. That predates this work and is #110. The stale cloud overlay copy is #111.
- **The owner's pick** was "none": a mismatch, walked through in chat because the C9 findings were taken, not fixed.

## Record

Issue comments on mephistopheles4/the-pact#89:

- `6027358232` — spec revision 1.
- `6027358533` — the plan session's observation (background run, later moved to #107).
- `6027428489` — verbatim: `plan-reviewer` on revision 1.
- `6027493742` — verbatim: `security-reviewer` on revision 1.
- `6027521281` — spec revision 2, the approved spec.
- `6027521550` — Auto-takes for revision 2.
- `6034751363` — the owner's sign-off: option A, the #107 split.
- `6035220685` — the probe's expected results, posted before any run.
- `6035932844` — verbatim: the control run record.
- `6036029862` — the owner's decision on the control deviation.
- `6036230134` — verbatim: the probe run record.

Issue comments on mephistopheles4/the-pact#108:

- `6035389868` — the red and green test record.
- `6036652276` — verbatim: the QA pair's cross section (`behaviour-lens`, `integrity-lens`).
- `6036652769` — verbatim: `security-reviewer` on the diff.
- `6036701331` — Lens dispositions.

Issue comments on mephistopheles4/the-pact#1:

- `6036235488` — accepted risks after #89.
- `6036648455` — the correction from the security review.

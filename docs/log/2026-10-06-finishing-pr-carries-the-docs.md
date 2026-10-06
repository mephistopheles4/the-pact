# The finishing PR carries the log entry and ADRs

**2026-10-06** — The PR that finishes a piece of work now carries its `docs/log/` entry and its ADRs. AGENTS.md says so under "Where work lives", and a new PR template asks for it with one checkbox (mephistopheles4/the-pact#84, PR #85). This entry is the first one written under the rule, in the PR that adds it.

## What it set out to do

The close-out kept slipping: the owner counted three times. #70's log was written only when the owner asked, and #47 and #73 had none until PR #83. AGENTS.md said the log and ADRs come "when the work finishes", but nothing triggered it. Session briefs ended at the merge, the install or the last check.

## How it was built

- **One paragraph in AGENTS.md.** It extends the "When the work finishes" bullet. A session doesn't report the work as finished until the log entry and the ADRs are merged. If the finishing PR can't carry them, the session opens a docs PR before it is cleaned up.
- **A one-line PR template,** `.github/pull_request_template.md`, with the checkbox the issue worded.
- **No gate test.** The gate runs offline and can't see the tracker, and gate code sits on the security floor. Nothing in `claude/` changed, so there was nothing to install.
- **No ADR.** The rule is a process rule, written in AGENTS.md itself.

## What the checks showed

- **Gate tests:** 618 pass, 0 fail.
- **QA pair, quick tier.** The cross passed. `integrity-lens` was clear. `behaviour-lens` was inconclusive, with two medium findings, both taken. First, a new PR can show the checkbox only after merge, because GitHub reads the template from `main`. That check moves to after merge. Second, the finishing PR lacked its own log entry; this entry fixes that.

## What is still open

- **After merge:** open a new PR and see the checkbox.

## Record

Issue comments on mephistopheles4/the-pact#84:

- `6020498856` — verbatim: the QA pair's reports through the cross script.

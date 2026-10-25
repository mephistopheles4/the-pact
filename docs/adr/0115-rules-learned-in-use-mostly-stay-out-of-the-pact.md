# Rules learned in use mostly stay out of the pact

Of the 21 working rules a lead session had kept in its machine-local memory (#399, #400), one ships in the pact and one in the install guide. The rest stay out: the owner's own notes and the lead skill hold the ones specific to this owner, machine or brigade, and the others are dropped (the owner's choice, relayed by the lead, from a triage of all 21).

## What changed

- **`claude/review.md`, Running a lens.** Each lens is asked to cite files by repo-relative path and to add no list of the local files it read. A report that names a path holding a user name stays local, and a lens is never rerun for a clean copy, so without this whole reviews stayed off the record.
- **`docs/install.md`, Updating later.** Fast-forward the checkout before updating, since a checkout behind the last install's commit would roll the pact back; switch back to a branch from a detached checkout; read the last install's commit from the install record before running anything. The dry-run warning for a checkout behind the last install is #407.

## Why

- **A rule in the pact must fit anyone who installs it, and earn its place.** The pact ships to every session of everyone who installs it, outside what a Scriptorium configuration can change. Most of the 21 rules were about this owner's tools and habits (PowerShell, Desktop's Auto-fix, CodeRabbit, Fable, speech-to-text, this repo's public tracker), and the #402 pilot found that Claude follows most tested rules as well without their text. A rule that fits only one person belongs in that person's notes or configuration.
- **The lens-cite rule fixes a failure that hits anyone** whose local paths hold a user name, and it is procedure, which is what `claude/review.md` holds.

## What was weighed

- **Shipping all 21, with the tool traps in their own section of the rules file.** Built and reviewed first (spec revision 2 on #399), then cut on the owner's word: it grew the fixed text every session reads by about seventy lines that no configuration can change, and the relay rule in it clashed with ADR 0055 and the threat model's R24.
- **Making them Scriptorium-controlled** with a new editable part or an on/off part. Not taken: gate code and a spec change for rules that are mostly personal; a block in the owner's own configuration does the same for the owner.
- **The installer warning in this change.** Not taken: it loosens an install control, and the spec pair marked three of its findings security?. #407 holds it.

# A reader pass on the checkpoint merges

PACT-68. Four merges that day went in without the standards pair (`reader-lens`, `conventions-lens`): PRs 631, 635, 636 and 637. This change runs both over the text those merges changed and fixes what they found, keeping every rule's meaning.

Fixed in the threat model, with no class or control changed: the controls fragment ("with no wait but the cleaner's override rule; the stop and removal rules above") is now a clause in the list; "Also accepted." opens its own paragraph in both places it was tacked on; each "Residual" line is now "Residual classes:", a label over the class names; the "flagged big" sentence says where an open security pick is logged and where a reader of a public tracker can read it; the class "A session takes checkpoints alone" no longer chains its clauses; "Text steers a session" says the text moves a session to take a step, not that the text takes it.

Fixed in the pact text: the checkpoint log said "at level 3", which `CONTEXT.md` bars as a bare level, and now says "in Turbo mode"; the status-comment rule says "edit", as the rest of the paragraph does; the posting rule for lens reports moved from Diagrams to Posting; the diagram-format pointer in `review.md` and the opening and last bullet of `review-diagrams.md` read as sentences that act; `/scry` calls its list "what waits for me", drops "that have picks", and says the owner "may" ask for detail, and names an open security pick by what the checkpoint log writes now (a checkpoint flagged big), beside the Owner's-call row. The goal-note grader follows the same wording.

Fixed in the docs: `docs/reference.md` lists `review-diagrams.md` and says how a `/scry` reply works; `CONTEXT.md` loses the withheld row and splits the Autonomy mode entry in two sentences; `AGENTS.md`, `docs/install.md` and `docs/rule-reasons.md` lose a tacked-on clause, take a bold lead, and name the mode. The PACT-46 log is dated 2026-11-22, the merge's date.

Left open for the owner, since they change a control's text and are security findings: the threat model says an install apply and mise trust wait for no one, while `AGENTS.md` says an apply waits for the owner's go-ahead, and the threat model lists mise trust as a rule-kept step and, in another paragraph, as a step no rule holds back. Also left: the probes in `AGENTS.md` that still say "where checkpoints wait" (PACT-43 and the rest of PACT-50 own them), and the Record lists of the PACT-44 and PACT-46 logs, which name the ticket because a Linear comment has no id to cite without a link.

Because this change writes a log, the 27 logs dated before 2026-10-22 are folded into `docs/log/older.md`, one level down under their own titles, in a commit of their own. No file links to them.

**Rolling back:** revert the merge, rerun the regens and reinstall from the dry run.

## Record

- The ticket: PACT-68 on Linear.

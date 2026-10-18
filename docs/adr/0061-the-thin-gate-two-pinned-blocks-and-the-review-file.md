# The thin gate, its two pinned blocks, and the review file

Amended in part by [ADR 0090](0090-lens-findings-carry-their-state-against-the-base.md) (2026-10-18): the review file also hands every lens run the base and a follow-up its own earlier rows, and its report template gives each finding a state against the base.

Superseded in part by [ADR 0064](0064-review-crossings-by-template-and-judgment.md) (2026-10-11): the review file no longer installs beside a cross script or names one; the gate no longer holds the script to a character scan or an import rule.

The install gate now checks what can run and with what power, and stops checking what the rules file says or how it is shaped (#238 spec revision 9, S4 and S5, built in #261). Two blocks stay pinned word for word. The lens procedure moved out of the rules file into its own installed file, `pact/review.md`.

## What the gate keeps

Every check not in the dropped list below stays, with its bad cases. The ones that matter most:

- **What can run, and with what power:** committed files only, with the `--commit` binding and the dirty-tree refusal; the payload classifier; the agents' strict frontmatter reader, names and tools against the per-lens tool allow-list; agent settings with the override mark; the command checks; the settings guard; the cross script's import check; the pinned grimoire commit; the install's manifest, drift check, delete rule, rendered-hash binding and re-hash after `--apply`; the refusal to overwrite a live file the record doesn't list; and the character scan on every installed text file.
- **What keeps data local:** the review-output folder's placement, the link refusals on the blocks folder, the install output's redaction, the cloud generator's refusals of private paths and of a configured render, and the builder's content policy and its refusal to write a page inside the clone.
- **The renderer's own mechanics:** mark pairing and nesting, the open-part names, the usage setting and its template, the notice, the edit operations and the project install's rules.

## What the gate dropped

Each went with its rule id and its tests:

- `structure` (no fence, no setext heading, headings only as `## title`), `moves` (the "Implementing a change" section and its numbered moves), `anchor` (each clause in its named section or move), `routing` (every installed agent named in the moves), `roster` and `roster-lens`, and `shared-block` (executability-lens's copy of the risk floor equal to the pact's).
- The skill-flag script, `scripts/check-skill-flags.mjs`.
- The builder's checks on the pact text's shape, but for the open parts' presence and the usage line.
- The cloud generator's two edits to the parallel-session text, their section and anchor checks, and their tests. The cloud copy is now the default render, plus the review file.

## What changed or was added

- **One `PINNED` list** in `gate/shared.mjs`: `stop-and-escalate` in `claude/CLAUDE.md`, the "Stop and ask me" guard, and `install-go-ahead` in `AGENTS.md`. Seam A and the renderer read it, and the builder reads it as text. `gate/clauses/` keeps the two canonical texts; six are deleted. A name on the list with no file named for it fails closed.
- **No file import in the rules file.** Seam A refuses a line of the rendered rules file holding an `@` followed by text, rule `rules-import`. Claude Code would load the imported file as rules, and that file would never meet the scan, the manifest or the re-hash. The renderer already refuses one in a block; this is the second layer for text that reaches the rules file any other way.
- **The security-set sign is a fixed list,** `SECURITY_SET` in `gate/render-core.mjs`: `adversarial-lens`, `data-lens` and `executability-lens`. The renderer read the old sign from the `security-route` clause's text; with the clause gone, the override mark would have vanished from `data-lens` with no error. The other signs stay: a tools line beyond the read tools, an allow-list entry, a `risk-floor` block in the agent's own file, and the by-doubt list.
- **executability-lens keeps its marker by a named exemption.** Its `risk-floor` marker pair, once each, is the only pact marker any agent may hold. The same pair in another lens still fails.
- **The dry run's notes** say what the thin gate checks in the rules file: its pinned block word for word, its markers, its characters, and that it imports no file, not its wording or meaning. The configuration block says edited text is checked for its form, its characters and file imports.
- **The usage template** takes the new bullet's wording, still with "above N%".
- **The builder** finds the moves by their open parts, in order, and titles each by the bold lead-in of its bullet. The page names the four steps after the moves where it said "Move 1" to "Move 4".

## The review file

`claude/review.md` installs to `~/.claude/pact/review.md`, beside the cross script. The rules file tells a session to read it before it runs a lens, and names the installed cross script itself, so a session that skips the file still runs the right script.

- **What it holds:** each lens's inputs, given as local files; dispatching each lens fresh and alone; the cross script's command, with `NODE_OPTIONS` cleared, its arguments and its exit codes; the mutation step; posting reports word for word, only as the cross script wrote them, keeping a kept-local report's path out of the tracker, and keeping line numbers, codes and paths out of a report's "For the owner" section; the Lens dispositions table with its `auto` and override marks and a "skipped, because ..." row; with no tracker and no plan file, the cross section pasted into chat (#117); and escape and gap rows. It holds no repo's review depth: this repo's security route, protected set, full suite and close-out stay in `AGENTS.md`.
- **Its checks:** the classifier takes exactly this file beyond today's kinds, and the gate requires it. It takes the character scan and a 64 KiB cap. It refuses hidden text, which the model reads with the Read tool and a rendered view hides: an HTML comment, a link reference definition line, and a raw HTML tag, autolinks included. It joins the manifest, the delete rule and the re-hash.
- **Both copy-set readings map it to `pact/review.md`:** seam A's classifier and the install's own reading, `expectedCopySet`. The general `claude/` rule would have put it at the top of the Claude folder. A live `pact/review.md` the record doesn't list refuses the install, as a command path does.

## Why

- **The owner's decision on spec revision 7:** keep the checks on what can run and with what power, drop the checks on the rules file's wording and shape, and keep at most one or two short pinned blocks as a tripwire.
- **Wording checks fought every rewrite.** Each check on the rules file's shape tied the gate to one layout, so the rewrite in ADR 0060 could not install until they went.
- **Not chosen: a gated review procedure in the rules file.** The procedure is long, read only when a lens runs, and would have pushed the rules file back toward the length #233 asked to cut. A plain file it points to costs one read when it is needed.

## What still holds

- **A rollback to before #261** deletes `pact/review.md` and overwrites `CLAUDE.md`, by the manifest rule. `AGENTS.md`'s rollback checks apply first.
- **The threat model** names what the thin gate still guards (R17) and the fixed security-set list (R12).

## How this was decided

- **2026-10-11** in mephistopheles4/the-pact#238: the owner chose the gate change first, then the normal install (q1, A); the review procedure in a plain file (q2, 1); and the thin gate. The security pair read the thin gate's ledger in revision 8; its findings added the `@` import refusal, the review file's hidden-text refusals, its destination checks and the fixed security-set list. Built in #261.

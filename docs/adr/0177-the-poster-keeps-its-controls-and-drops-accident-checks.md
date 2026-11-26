# The poster keeps its controls and drops accident checks

The poster loses the checks that are neither a threat-model control nor covered by an agent app, and the page-faithful copies behind its content scan (PACT-115). Supersedes [ADR 0076](0076-the-poster-checks-the-lens-dispositions-table.md), [ADR 0083](0083-the-poster-refuses-wrapped-prose-and-relative-links.md) and [ADR 0122](0122-the-poster-scan-reads-page-faithful-copies-beside-a-frozen-floor.md). Amends [ADR 0117](0117-a-review-comment-opens-with-a-human-layer-and-folds-its-data.md) (its fence check), and [ADR 0120](0120-the-poster-edits-signed-posts-with-a-reason-line.md), [ADR 0144](0144-the-status-comment-keeps-only-its-newest-reason-line.md) and [ADR 0152](0152-the-poster-takes-a-strict-json-post-with-quote-and-intent.md) (the reason lines).

The owner's ask, by voice to the lead's session, as PACT-115 quotes it: "I feel like we could easily start one planning session that audits what is already covered by the threat model and what is already covered by the GitHub app and deletes all of that from the poster. But we should also make sure that it would work without the GitHub app because people could install one or the other or both, right?" The picks below were approved by the owner, relayed by the lead.

## How a check was sorted

A check the threat model names as a control stays: the threat model relies on it, so it never counts as covered by it. An agent app covers little: its token reaches one repo of the pinned owner, and its text never counts as the owner's. Neither holds with no app pinned, so a check that protects the owner's record stays for that install.

## What stays

| Check | Why |
| --- | --- |
| The strict schema (`post/*`) | A threat-model control |
| `secret/env`, the app token included | The only secret check the threat model relies on; no scanner knows live values |
| `text/hidden` on the characters as written, and `text/hidden-line` | A threat-model control, and what keeps the signature in sight |
| `edit/author`, `edit/target` | A control, and no edit of the wrong item |
| `edit/unsigned` | With no app, the owner's own comments share the session's login, so this stops a session editing the owner's typed words |
| The read-back compare and every exit code | The poster's core job |
| `as/not-app`, `pin/check`, `app/token` | A control with an app |
| `owner/repo`, `owner/github`, `as/missing`, `as/differs` | An app's token covers the repo, but nothing else does without one |
| The decision mark and owned lines (`edit/decision`, `post/owned-line`), read as plain text and after NFKC | With no app, a forged "Owner decision, from chat." under the owner's login counts as the owner's decision |
| The `file/` rules and `text/body-length` | Small, and no read of the wrong file |
| The ask and read-back machinery | It carries out `review.md`'s record rules, which neither the threat model nor an app does |

## What goes

Each is an accident check, none is a control, and none relied on an app's identity, so each cut holds with no app pinned.

| Cut | Why it holds with no app |
| --- | --- |
| The Lens dispositions table check (`table/`) | A format backstop for review records; it never ran on a record kept off GitHub |
| `fence/unclosed` | It kept the table check honest; an open fence shows text as code and hides nothing from a reader of the source |
| `text/hard-wrap`, `link/relative` | Cosmetic; an edit fixes either |
| The `reason` field, the `Edited:` lines and `edit/reasons` | GitHub's edit history keeps every version and its editor; the signature line still names the session. The threat model already accepts an edit of relied-on text |
| `edit/record` | `edit/unsigned` already narrows who edits a record, and history keeps the old text |
| `edit/leak` | The new body is still scanned |

## What is slimmed

- **The content scan** goes back to the floor it had before #394, with two additions: control characters are stripped, and the named references whose value is a hidden character join its short list. It reads each text as written, as two normalised copies, and as the first copy with links and marks folded. The HTML5 name table, its legacy names, the page decoder, the three page-faithful copies and the table's digest test go.
- **The edit and owned-line readings** read a text with its format characters removed, as written and after NFKC. They fold no markup, no entities and no look-alike letters.

## No gitleaks

It can't see a live value, so it can't replace `secret/env`. Matching token shapes is what [ADR 0126](0126-the-pact-has-no-secret-or-personal-data-rules.md) took out on purpose. It is a Go binary on every machine, where the poster runs on Node built-ins only. GitHub's secret scanning already reads posted text for known shapes, with nothing to install. A pre-push hook for commits would be its own work.

## What it costs

- **Page-only forms now pass.** A live secret's value split in a form only the #394 readings read is no longer refused: a padded number past the digit cap; a tag shape the page shows as text (made by decoding, in a fence or code span, escaped, with a filtered tag name or a no-break space, or one the grammar rejects); a legacy name with no semicolon; raw HTML the page hides or ends elsewhere (processing instructions, declarations, CDATA sections); and a tag carried onto the next line of a block quote. The scan rows that show them are `394-C5-padded-no-semicolon`, `394-C7-page-decoded-tag`, `394-C8-bare-fenced-tag`, `394-C17-raw-html-grammar`, `394-C18-rejected-tag-run`, `394-C19-page-escaped-tag`, `394-C20-page-code-span`, `394-C21-legacy-no-semicolon`, `394-C22-filtered-tag-name`, `394-C23-non-ascii-tag-space`, `394-C24-pi-first-gt`, `394-C24-cdata-first-gt` and `394-C25-quoted-tag`. The owner accepted this trade-off, relayed by the lead: "I agree with dropping it."
- **An encoded hidden character passes,** as it did before this change: `&#x200B;`, `&#8203` and `&ZeroWidthSpace;` decode in a copy that strips the character before the check. The build spec's claim that they are refused was wrong, at its base too. Refusing them would be a new reading, and none was added.
- **A body that leaves a fence open** posts, and the fence swallows its own `Signed:` line, so every later edit of it is refused `edit/unsigned`.
- **A decision mark or owned line in disguise passes:** a look-alike letter, markup such as bold, or an entity.
- **`reason` is refused.** A post that carries it ends `post/unknown`, so a session holding the older `review.md` can't edit until it restarts.
- **Lines already posted stay.** An item's old `Edited:` lines are plain text now; a status comment is rebuilt without them.

## How this was decided

- **2026-11-26.** PACT-115, Standard tier. The owner picked from the audit: keep, slim the scan, cut the six accident checks, no gitleaks, no security pair. The spec had two rounds of the spec pair. The lead relayed the owner's answer on the scan's floor, and confirmed the build's pick on encoded hidden characters, flagged for the owner.

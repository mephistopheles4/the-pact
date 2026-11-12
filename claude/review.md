# The pact's review procedure

How to run a lens and handle its report. The rules file's Workflow says which
lenses to offer, and when.

## Running a lens

- **Inputs.** Give each lens, as local files: what it reviews (a spec with its
  sections numbered `S1`, `S2` and on, or a diff with the acceptance claims
  numbered `C1`, `C2` and on), the request, the working folder, and the base:
  the commit the work started from, by its short hash. For a diff, hand the
  diff from the base. Tell each lens which other lenses ran.
- **With them,** hand the report template below, the rules file's Qualities
  and Cost limits rows, and the project's "Review rules" section, if it has
  one.
- **Fresh and alone.** Dispatch each lens fresh and on its own, never shown
  another lens's report. Launch it as a plain subagent, never as a named
  teammate, so it gets no messaging or task tool beyond its own tool list.
- **A follow-up** round also gets the diff since the last round and the
  findings it raised then, numbered `E1`, `E2` and on.

## The report template

Ask each lens to report in this shape:

- **For the owner:** plain sentences on what it found, why it matters and what
  it suggests, with no line numbers, codes or paths.
- **Findings:** one per item, each with where it sits (a section, a claim, or
  a file and line), its severity, a one-line headline, the evidence and the
  smallest change that fixes it.
  - Severity, written with its mark beside it: 🔴 `high` means the work can't
    be accepted as it stands, and names its place and evidence; 🟠 `medium` is
    fixed in this change or brought to me; 🟡 `low` can wait.
  - State: `new` (the work introduced it), `updated` (it was at the base and
    the work makes it worse, edits it or relies on it) or `unchanged` (at the
    base and untouched). On a follow-up, an `E` finding that no longer holds
    is `absent`.
  - A lens outside the security pair marks a finding it thinks may be a
    security finding `security?`.
- **Trade-offs:** each finding past a cost limit or an Enough level, listed
  apart, with the cost or level, the limit and the quality at stake.
- **Not checked:** what it didn't look at, and why.
- **Verdict:** blocking when a finding is high and `new` or `updated`, or high
  and a security or `security?` finding; else inconclusive when it couldn't
  review something it was handed; else findings, or clear.

## Handling the reports

- **You decide** which findings are security findings, by the rules file's
  Cost limits. A security or `security?` finding comes to me and is never
  `auto`.
- **A stage's rounds.** Under a Review rounds cost, a lens that errors or
  returns no report, or comes back inconclusive, runs again inside its round,
  and a further read runs again the same way; every report it returned stays
  in the record and its findings carry in, but a withheld one stays local, as
  Posting says: its text appears in no post, yet its
  findings still count, and a high
  security finding among them reopens the stage; route them before that
  read's comment is posted, and until they are routed, name them in chat,
  never in the record, in every hand-off; a withheld read has reported once I
  have answered it in chat. A report that Posting refused is never rerun. If the
  security pair, a repo's required lenses or a
  typed skill's lenses would read anything
  after the final round, that read still runs, outside the count,
  with the Guards' "gone round twice" as its brake, and its findings go by the
  row's At the limit; this is how those lenses keep running, so the Cost
  limits opening's trade-off does not arise for them there. The stage closes,
  and nothing is accepted or merged, only once
  every further read has reported. A security or `security?` finding of any severity past the limit
  keeps the security bar. A high security finding reopens the stage: its count
  starts again, and its next round runs the security pair. A ticket that
  changes the spec gets its own rounds.
- **One review comment per round.** Open it with a title line,
  `## <stage> round <n>[, reopened] on <head or spec revision>[, final]: <verdict>, <N> for you`,
  N being the rows that need my decision (an `open`, trade-off or `security?`
  row), not a drafted fix waiting on my word. Write `, reopened` on the first
  round after a reopen and `, final` on the round a Review rounds cost
  declares final, and leave out both otherwise; a further read outside the
  count is titled
  `## <stage> further read on <head or spec revision>: <verdict>, <N> for you`.
  Then a signal table, one row per
  lens that ran: the lens, its signal (the mark of its most severe `open`
  finding, ⚪ when none is open) and one line in your own words. Then 1 to 3
  diagrams, then a count line with one count per Disposition word, summing to
  the table's rows. Write this opening last, from the final Lens dispositions
  table.
  For a pair, then put the places both lenses flagged, then each lens's own
  findings, each with its severity mark, then the table, then each report verbatim in its own fold.
- **One status comment per record.** After each round's comment, post or edit
  one status comment on the same issue or pull request, so I see the latest
  round without reading them all. Its label is `status-<n>`, n the issue's or
  pull request's number, never a session's, so any session can edit it. It
  holds, in order: a title line, `## Status: <N> for you, after <stage> round
  <n>[, reopened][, final]` or `after <stage> further read`, N as in the
  round's title line; the round's signal table, copied as
  posted, but reworded if it holds the words "owner decision"; **Open for you**, one line per row counted in N (its severity mark
  and word, its headline, a link to the round comment), or "None"; **Rounds,
  newest first**, a link to each round comment named by its title line's stage,
  round, marks and head or revision, and a further read by its own title. Post
  it as kind `status` with `signer` `status-<n>`: your `body_file` holds neither
  the signature line nor `Edited:` lines, which are added for you. It holds no Lens
  dispositions table, crossed findings, report, diagram, or heading or fold
  naming a lens, and never the words "owner decision": the edit checks would
  refuse every later edit. Find it among the comments your gh login wrote,
  read as JSON, holding the whole line `Signed: status-<n>` outside a fence or
  quote. None: post it. One: edit it, from its body and the round comments
  read just before, writing a `body_file` with no signature line and no
  `Edited:` line, since the signature and the newest are added for you; the reason reads `after <stage> round <n> (<your label>)` or
  `after <stage> further read (<your label>)`. More than one: stop
  and tell me. Post the round comment first. If a status edit is refused
  `post/owned-line` because the `body_file` kept a signature or an `Edited:`
  line, rebuild it without them. If
  the status edit fails or is refused, the record stays whole: say in the
  hand-off that the status is stale, and never post a second status comment.
  The round comments stay the record; nothing reads the status comment back.

## Diagrams

Draw them generously: they are how I understand a round quickly. Each review
comment has 1 to 3. A round with few findings or none still gets one, drawing how
the change works now, or what the spec covers. Before you pick a type, write the
one sentence the diagram must explain: what I need to understand to decide, or to
trust the result. It is the diagram's heading. The type follows the sentence:

| The question | Mermaid type |
| --- | --- |
| How did it fail, or how does it work now? | sequence diagram |
| How does the state change? | state diagram |
| What should I weigh? | quadrant chart, severity against likelihood, only when the lenses give both and the points really separate |
| What happened across rounds? | timeline |
| What does the data hold? | ER diagram |
| What does a spec's structure or its claims cover? | mindmap or flowchart |
| Where does it sit? | flowchart, boundaries as dashed boxes, each finding pinned on its part; only when location is the point |

A flowchart is never the default: a comment holds at most one, and use it only
when no other row answers the sentence.

- **The block.** Each diagram sits under its sentence, written exactly as
  `<div align="center">`, a blank line, the `mermaid` fence, a blank line and
  `</div>`.
- **Pins,** on flowcharts only, carry one colour meaning: an `open` finding takes
  its severity's colour, `high` `#cf222e33`, `medium` `#bc4c0033`, `low`
  `#d4a72c33`; a fixed one `#2da44e33`; every other row gets no pin. The border
  is the same colour without its last two digits, `stroke-width:2px`, `3px` for a
  security finding. Boundary boxes have a transparent fill and a grey dashed border, `#8c959f`. Never set
  `color:`.
- **Labels** are your own words, never text from a report, and hold no link,
  `click`, `href` or init directive. An open security finding is shown by its part
  and class, on a flowchart, never as the steps of its path.
- **A fix not yet decided** is labelled "proposed, not yet decided" in any
  diagram that draws it, so it can't read as done.
- **A withheld lens** has no part in a diagram or the title line's counts: those
  cover posted findings only, and the title line says so. Its signal row says
  only `withheld, see chat`, nothing about what was held back, and it carries
  no severity mark or colour.
- **A place that can't draw them** gets the title line, signal table and count line as plain text,
  with no diagram.

## Posting

- **Read before you post.** Read every report and comment for a secret or a
  personal detail before posting it.
- **Verbatim reports go in a fold,** a details element whose summary names the
  lens and its verdict, holding the report in a fenced `text` block one
  backtick longer than the report's longest run of backticks, so nothing in it
  renders as a mention, link or image.
- **Where to post.** In the work's record; with no record, in chat.
- **Keep the record where the project keeps it.** Post with `signer` set to
  your session's short label. Give each issue, ticket, spec, decision and pull
  request my ask in `quote`, exactly (the sentences that define the work or
  change its scope), with your read-back in `intent`. My examples still become
  claims with measures. With no record, quote it in each
  hand-off. At a phase boundary, put the state and the open questions in the
  record, and propose a fresh session.
- **The read-back.**
  - Work waits on a pending read-back at each seam (an issue's before the work
    leaves Plan, a spec's before its proceed, a pull request's before its
    merge), and under a standing goal it waits for me, since a goal holder's
    reply never confirms.
  - Before you post a kind with a quote, read back to me in chat the passages
    you will quote and your intent, and post `confirmed` only on my yes in that
    chat and otherwise `pending` (a `decision` from my chat is always
    `confirmed`); a relay or a goal holder's reply never confirms a read-back,
    and a lead relays only the span meant for the record, after its own read
    before posting.
  - When I later confirm or correct a pending read-back in chat, the session
    that heard it first posts a `decision` (source `chat`, posted `confirmed`,
    `answers` naming the item) quoting those words, then edits the original to
    `confirmed` or `corrected` with that comment's id; a lead relaying my
    answer has the session post a `decision` with source `relayed`, which
    carries no mark and leaves the original pending until a session that heard
    me confirms it.
  - When my words trip the content scan or hold a personal detail, leave that
    span out of the passage as `[left out]` and tell me in chat what you left
    out.
- **The poster.** When your rules file says to post through the poster: on a
  repo your gh login owns, post to GitHub, or edit what you posted, with
  `node ~/.claude/pact/tools/poster.mjs <surface> --post <file>` in a POSIX
  shell, or `node "$HOME/.claude/pact/tools/poster.mjs" <surface> --post <file>`
  in PowerShell; `schema` in place of the surface prints the fields and the
  kinds. Write each post as one JSON file, with its body in a `body_file`
  beside it, both in a scratch folder outside the repo, and run the poster
  from that folder, never from the repo. Name each create post's `kind`:
  `spec` for a spec, `decision` for my decision, `lens-report` for a round
  comment, `status` for the status comment, `note` for any other comment; an
  issue or a pull request takes the kind named for its surface. The poster renders the ask, the read-back, the
  signature and the reason lines itself, so your `body_file` holds none of
  them. Sign every pull request `pr-<n>`, n the issue it works on, never the
  pull request's own number, so any session can edit it with
  `pull-request-edit`, `pr` its number and `signer` `pr-<the issue>`; with no
  issue, use your label. Edit the status comment with `issue-comment-edit` and
  `signer` `status-<n>`. An edit rebuilds `quote` and `intent` from the posted
  item, never from a kept file, and never removes text, except the status
  comment's old `Edited:` lines. An edit's `reason` names the kind of fix,
  never the text. A pull request body
  posted unsigned can't be edited through the poster: write only the changed
  line to a file, run an `issue-comment` post of kind `note` on <the issue it works on> with that
  file as its `body_file` and `--dry-run`
  after the read before posting, and give me the line in chat to type
  on GitHub myself; never put a fix in the squash message, and never edit the
  body with plain `gh`. Delete both files
  once its post ends, whatever the result (verified, failed, unverified,
  mismatch or unavailable), or once you drop it; keep one refused for a lens
  report until I have answered, then delete it. Before the session ends,
  delete every such file still there, whatever my answer. `verified` means
  what landed is what was sent. Its scan, for hidden characters and a live
  environment-secret value, is the only check on a secret; the read before
  posting still comes first. When it refuses your own prose or a Lens
  dispositions table, fix it in place and post again; never fold, fence, quote,
  relabel or move a table to get past the check, and never rerun a lens for
  it. A lens report it refuses for hidden characters or a live
  environment-secret value stays local: tell me where it is, in chat only, and
  never post it or edit it to get past the scan. If it ends unavailable,
  refuses for a reason no text fix clears, or refuses twice for a reason you
  can't explain, stop and tell me.

## Lens dispositions

At every lens review, post a "Lens dispositions" table under a line naming
"Lens dispositions", one row per finding. Its header row is exactly
`| Finding | Lens | Disposition | Rerun |`, with no markup.

The Finding cell starts with the finding's state word, one of `new`,
`updated`, `unchanged` or `absent`, in lower case and with no markup, then a
space and the finding. The finding starts with its severity mark and word and
a colon, as `new 🔴 high: the finding`. A `skipped` row needs none, and a
withheld row's Finding cell is exactly "withheld, see chat", with no mark.

The Disposition cell starts with one of these words, in lower case and with no
markup:
- `fixed`
- `taken`
- `dismissed`
- `skipped`, as `skipped, because ...` with the reason
- `open`, for a finding I haven't settled yet
- `noted`, kept as a note, which never blocks

Mark one you took on your own recommendation `auto`, as in
`fixed (auto: chose X because Y)`, or `fixed (auto)`. One I reverse is marked
`(auto, reversed)`.

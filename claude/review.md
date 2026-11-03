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
  another lens's report.
- **A follow-up** round also gets the diff since the last round and the
  findings it raised then, numbered `E1`, `E2` and on.

## The report template

Ask each lens to report in this shape:

- **For the owner:** plain sentences on what it found, why it matters and what
  it suggests, with no line numbers, codes or paths.
- **Findings:** one per item, each with where it sits (a section, a claim, or
  a file and line), its severity, a one-line headline, the evidence and the
  smallest change that fixes it.
  - Severity: `high` means the work can't be accepted as it stands, and names
    its place and evidence; `medium` is fixed in this change or brought to me;
    `low` can wait.
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
- **One review comment per round.** For a pair, put the places both lenses
  flagged first, then each lens's own findings, then the Lens dispositions
  table, then each report verbatim in its own fold.

## Posting

- **Read before you post.** Read every report and comment for a secret, a
  personal detail or a path on this machine before posting it.
- **Verbatim reports go in a fold,** a details element whose summary names the
  lens and its verdict, holding the report in a fenced `text` block one
  backtick longer than the report's longest run of backticks, so nothing in it
  renders as a mention, link or image.
- **Where to post.** In the work's record; with no record, in chat.
- **Keep the record where the project keeps it.** Sign what you post there
  with your session's short label. Open each issue, spec or ticket with my
  ask, quoted exactly: the sentences that define the work or change its scope.
  My examples become claims with measures. With no record, quote it in each
  hand-off. At a phase boundary, put the state and the open questions in the
  record, and propose a fresh session.
- **The poster.** When your rules file says to post through the poster: on a
  repo your gh login owns, post to GitHub, or edit what you posted, with
  `node ~/.claude/pact/tools/poster.mjs` in a POSIX shell, or
  `node "$HOME/.claude/pact/tools/poster.mjs"` in PowerShell. Write each piece
  of free text to a file in a scratch folder outside the repo, and run the
  poster from that folder, never from the repo. Sign a post you may edit with
  a `Signed: <label>` line, and keep it when you edit. An edit never removes
  text. An edit's `--reason` names the kind of fix, never the text. Delete a
  file once its post ends, whatever the result (verified, failed, unverified,
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
space and the finding. A `skipped` row needs none, and a withheld row's
Finding cell is exactly "withheld, see chat".

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

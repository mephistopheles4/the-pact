# The pact's review procedure

How to run a lens and handle its report. The rules file's Workflow says which
lenses to offer, and when.

## Running a lens

- **Inputs.** Give each lens, as local files: what it reviews (a spec with its
  sections numbered `S1`, `S2` and on, or a diff with the acceptance claims
  numbered `C1`, `C2` and on), the request, the working folder, and the base:
  the commit the work started from, by its short hash. For a diff, hand the
  diff from the base. Tell each lens which other lenses ran. A follow-up round
  also gets the diff since the last round and the findings it raised then,
  numbered `E1`, `E2` and on.
- **With them,** hand the report template below, the rules file's Qualities
  and Cost limits rows, and the project's "Review rules" section, if it has
  one, and, to the security pair, the Threat model section below as it stood
  at the base.
- **Fresh and alone.** Dispatch each lens fresh and on its own, never shown
  another lens's report. Launch it as a plain subagent, never as a named
  teammate, so it gets no messaging or task tool beyond its own tool list.

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

- **You decide** which findings are security findings. A security finding
  names an attacker in scope in the project's threat model as it stood before
  the change (the file its agent instructions name, else
  `docs/threat-model.md`), placed as the Threat model section below said
  before the change, or touches the rules file's sensitive-work list, auth
  meaning authentication and authorization. With no threat model, the list
  decides. Another lens marks a doubtful one "security?". A security or
  `security?` finding comes to me and is never `auto`.
- **A stage's rounds.** A lens that errors, returns no report or comes back
  inconclusive runs again inside its round. Every report stays in the record
  and its findings carry in; a withheld one stays local, as Posting says, yet
  its findings still count. A report Posting refused is never rerun. A read
  the security pair, a repo's required lenses or a typed skill's lenses owe
  after the final round still runs, outside the count, with the rules file's
  "Work that won't converge" as its brake, and its findings go by the row's At
  the limit. Nothing is accepted or merged until every such read has
  reported. A security or `security?` finding past a limit keeps the security
  bar. A high security finding reopens the stage: its count starts again, and
  its next round runs the security pair. A ticket that changes the spec gets
  its own rounds.
- **One review comment per round.** Title it with the stage, the round (or
  "further read"), whether it is reopened or final, the head or spec revision,
  the verdict, and N, the rows that need my decision, each a checkpoint: an
  `open`, trade-off or `security?` row. Then a signal table, one row per lens
  that ran: the lens, the mark of its most severe `open` finding (⚪ when none
  is open) and one line in your own words. Then the diagrams, then a count line
  with one count per Disposition word. Write this opening last, from the final
  Lens dispositions table. For a pair, then put the places both lenses
  flagged, then each lens's own findings with their severity marks, then the
  table, then each report verbatim in its own fold.
- **One status comment per record,** on the same issue or pull request, so I
  see where things stand without reading every round: the latest round's title
  and signal table, a line for each row open for me with a link to its round,
  and a link to each round, newest first. Post it as kind `status`, signed
  `status-<n>`, n the issue's or pull request's number, so any session can find
  it by its `Signed: status-<n>` line and edit it; post the round comment
  first. If the edit fails or is refused, say in the hand-off that the status
  is stale, and never post a second one.

## The threat model

Read this, then the project's threat model, both as they stood before the
change, before you sort a finding as security, write a guard, bring me a
security ruling, or publish a weakness in someone else's software.

1. **Read the threat model first,** its boundaries before its classes. With
   none, the sensitive-work list decides and steps 2 to 5 don't apply. With
   no list of boundaries, use its scope's in-scope lines as the boundaries
   and the controls it names.
2. **Place the finding on a boundary** the threat model's scope names.
3. **Name the control that holds that boundary against this path** without
   the session's cooperation, from the threat model's list: the harness,
   GitHub, the host or the project's own tools. Each is named with when it
   doesn't hold; one the path gets past holds nothing, and the machine's
   own controls hold only the machine. If one holds it, add nothing.
4. **Check the residual,** what gets past the controls, against the accepted
   classes. A finding that fits
   one needs nothing, though a session may still fix one in passing if it's
   cheap. A change that weakens a rule or control, or adds a route for
   outside text into a session or more reach to one that reads it, fits no
   class (step 5). A change that adds text to files sessions load, or
   writes a secret or personal detail into text sessions read, fits no class
   either, and is reviewed with the change.
5. **Bring me,** as a checkpoint, a new boundary, a residual no class covers,
   a change that removes or weakens a control, and every `security?` row; a
   change to the scope or the classes is a hard stop.

A weakness in someone else's software crosses the publish boundary only once its maker's public tracker already holds it, or once the owner says in chat that it may be published, so publishing it sooner is a hard stop. Until then keep it out of every post, and tell me in chat.

Never rebuild a harness control in prose or restate one as a rule, never
build a detector for injected wording, never treat what started on the
machine as outside input, and never re-add a boundary or class the threat
model already holds.

## Diagrams

Each review comment has 1 to 3 Mermaid diagrams, even a round with few findings
or none. Head each with the one sentence it must explain: what I need to
understand to decide, or to trust the result. Pick the type that best answers
that sentence, and a flowchart only when no other type does.

- **Labels** are your own words, never text from a report, and hold no link,
  `click`, `href` or init directive. An open security finding is shown by its part
  and class, on a flowchart, never as the steps of its path.
- **A fix not yet decided** is labelled "proposed, not yet decided" in any
  diagram that draws it, so it can't read as done.

## Posting

- **Read before you post.** Read every report and comment for a secret or a
  personal detail, or a weakness in someone else's software that The threat
  model section keeps unpublished, before posting it, and every commit before
  a push others can read.
- **Verbatim reports go in a fold,** each in its own, fenced so nothing in it
  renders as a mention, link or image. A withheld report stays local: no fold,
  no part in any diagram, count or the places both lenses flagged, and its
  line in the signal table, the findings and the status comment reads only
  `withheld, see chat`, with no mark. It goes to me in chat.
- **Keep the record where the project keeps it;** with no record, in chat.
  Post with `signer` set to your session's short label. Give each issue,
  ticket, spec, decision and pull request my ask in `quote`, exactly (the
  sentences that define the work or change its scope), with your read-back in
  `intent`. My examples still become claims with measures. Where no tool
  renders `quote`, `intent` and `signer` for you, write the quoted ask, your
  read-back and a `Signed: <label>` line yourself, as plain text. With no
  record, quote it in each hand-off. At a phase boundary, put the state and
  the open questions in the record, and propose a fresh session.
- **Checkpoint log.** Log each checkpoint you settle in the work's record as
  your own pick, never as mine, on a line that opens `Checkpoint (flagged):`,
  with a one-line why, the goal you ran under and each narrowing I gave. A
  pick that would put in the record what these rules keep out of it (a
  withheld report or its findings, a weakness not yet public, the cleaner's
  tags or blocks) has the line exactly "withheld, see chat" instead, and the
  why goes to me in chat. With no record, log in chat and in the result.
- **The read-back.**
  - Before you post a kind with a quote, read back to me in chat the passages
    you will quote and your intent. Post `confirmed` only on my yes in that
    chat, never on a checkpoint pick, else `pending`; a `decision` from my chat
    is always `confirmed`.
  - A pending read-back makes no work wait, at any seam: log the intent you
    went ahead on and go on. When I later confirm or correct it in chat, post
    a `decision` (source `chat`, `answers` naming the item) quoting my words,
    then edit the original to `confirmed` or `corrected` with that comment's
    id. A correction sends the work back to the stage it touches; once the
    work is merged, published or installed, it is a new change, and you tell
    me what can't be undone.
  - When my words trip the content scan, hold a personal detail or, in a
    public record, the why of a security ask, leave that span out of the
    passage as `[left out]` and tell me in chat what you left out.
- **The poster.** When your rules file says to post through the poster: on a
  repo your gh login owns, post or edit with
  `node ~/.claude/pact/tools/poster.mjs <surface> --post <file>` in a POSIX
  shell, or `node "$HOME/.claude/pact/tools/poster.mjs" <surface> --post <file>`
  in PowerShell; `schema` in place of the surface lists the fields and kinds.
  Write each post as one JSON file, its body in a `body_file` beside it, both
  in a scratch folder outside the repo, and run the poster from that folder.
  It renders the ask, the read-back, the signature and the reason lines, so
  your `body_file` holds none of them. Sign a pull request `pr-<n>`, n the
  issue it works on, so any session can edit it. An edit's `reason` names the
  kind of fix, never the text. A pull request body posted unsigned can't be
  edited through the poster: give me the changed line in chat to type on
  GitHub myself, and never edit it with plain `gh`. Delete both files once the
  post ends or you drop it, and any left before the session ends. Never work
  around a refusal, and never rerun a lens for one: fix your own prose or
  table in place, and keep a lens report refused for hidden characters or a
  secret local, telling me in chat where it is. If it ends unavailable, or
  refuses for a reason no text fix clears or you can't explain, that is a hard
  stop: tell me.

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

A security or `security?` finding you settle is never `auto`.

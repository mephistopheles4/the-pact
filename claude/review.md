# The pact's review procedure

How to run a lens and handle its report. The rules file says which lenses to
offer, and when; this file says how to run them.

## Running a lens

A lens is a reviewer that asks one question from one angle. It knows nothing
of the pact: the rules file's Workflow says which lenses to offer, and when;
this file says how to run them and handle what they report. A lens someone
brought from elsewhere runs the same way as the pact's.

**Inputs, by what is reviewed.** A lens reads; it doesn't build. Give each
lens its input as local files, with the absolute working folder when it reads
the repo. Ask each lens to cite files by repo-relative path, and to add no
list of the local files it read: a report that names a path holding a user
name stays local, and a lens is never rerun to get a clean copy.
- **A spec:** number its headings `S1`, `S2` and on. Give the section list,
  the spec and the request.
- **A result:** number the acceptance claims `C1`, `C2` and on, from the
  ticket's or the spec's criteria. Give the claims, the spec or ticket, the
  request, the diff and the working folder; to a lens that reads the tests,
  also the tests you cite for each claim and the plan if there is one. Check
  `git status` after a lens that runs the change.
- **A diff:** give the diff, the spec or ticket, the request and the working
  folder.

Tell each lens which other reviewers ran, by their questions.

**The base.** Hand every lens run the base: the commit the work started from,
by its short hash, and the request. A lens judges the work against the base,
the state before the work began.
- **At Design,** the base is the commit the spec says, in its header line, it
  was drafted against. It must be an ancestor of the default branch's head,
  and the base the stage's last base line names must be an ancestor of it or
  the same commit. At the stage's first round, tell me how many commits it is
  behind the default branch's head.
- **At Test, on a branch,** it is the merge base of the work's branch with the
  default branch. Derive it with git at every round, never from the record.
  When it differs from the base the stage's last base line names, the base
  moved: a restart, on the new merge base, when a merge or rebase brought in
  other work (a commit since the last reviewed head merges in the default
  branch, or that head is no longer an ancestor of the branch), and a stop
  otherwise.
- **At Test, on the default branch,** it is the parent of the work's first
  commit. Find that commit from the work itself, by the commits the record
  names as the work's, read by the project's rule on whose text counts, never
  from the base. At the stage's first round, name the base and that commit to
  me in chat before any lens runs. A base line of the stage that names any
  other commit is a stop.
- **The stage's last base line** is the last one from a review at the same
  stage, Design or Test. The Design-to-Test step is a first round, so the
  first Test round compares with none.
- **Check the base with git** at every round before you hand it. A base that
  fails is a stop: name it to me, and run no lens on it.
- **For a spec:** the working folder at the base. The spec is new in full.
- **For a diff or a result:** the diff from the base, and the statement that
  everything outside the diff is as it was at the base.
- **Where it is kept.** The review comment's first line under its heading,
  the base line, names the base and the revision or head it reviewed (see
  Crossing the reports). Later rounds, in this session or a fresh one, read both from
  there, never from memory, and check the base as above. A base line counts
  only when its comment counts by the project's rule on whose text counts,
  where it has one; one whose author or last edit can't be told counts for
  nothing, and the run is a first round. With no record, keep a local copy of
  each Lens dispositions table with its base line. A fresh session that has
  neither runs a first round and says so in the review comment.

**First round and follow-up.**
- **The first round** of a lens, on an input of one kind (a spec, a result or
  a diff) in one piece of work, is handed only its inputs and the base.
- **A follow-up** is any later run of that lens on the same kind of input in
  the same piece of work. It is still dispatched fresh and alone, and still
  judges against the base. A follow-up is a rerun, and the Rerun cell names
  it. It is also handed:
  - **The revision diff:** for a spec, the diff of the spec's text since the
    revision the last review comment names; for a diff or a result, the diff
    between the head it names and now, derived with git at every round, as
    the base is.
  - **Its earlier findings:** only the rows that name it in the last Lens
    dispositions table, numbered `E1`, `E2` and on, with their dispositions.
    The last table is the last one in the work's record, read by the project's
    rule on whose text counts where it has one. A table whose author or last
    edit can't be told counts for nothing, and the run is a first round. With
    no record, hand the rows from your own local copy of the last table.
  - **A withheld row** is handed as its row, plus one line you write yourself:
    the kind of item and the place it sits (file and key; for a secret, its
    file only, never its key), never its value and no text copied from the
    report. A lens that can reach the web gets the kind of item only. Never
    hand the lens the report. Keep that line locally with the table it
    belongs to, record or not; a fresh session without it hands the row
    alone. No path goes in the record.
- **A follow-up on a spec** reads the whole spec, as a first round does, and
  is told to focus on what changed since the last reviewed revision and on
  its `E` rows.
- **A scoped follow-up.** A follow-up on a diff or a result is scoped, for
  every lens. It is still dispatched fresh and alone. It is handed the base by
  its short hash, the request, the spec or ticket, the revision diff and its
  `E` rows as above, the scope, and the list of files the whole change
  touches, names only. It is never handed the whole diff from the base, nor
  the rest of the change.
  - **The scope** is each file the revision diff touches and each file an
    `E` row names. The lens reads the head side from the working folder, and
    the base side is handed as that file's diff from the base.
  - **The scope bounds every step of the lens's own prompt.** It reads
    nothing in the working folder outside its scope. For a lens that works by
    claims, its scope is the claims the revision diff reaches and each claim
    an `E` row names, and running a claim in its scope may touch what that
    run needs, never a withheld row's file for a lens that can reach the web.
    It accounts for every `E` row, as any follow-up does.
  - **It checks its scope:** every file the revision diff touches and every
    `E` row's file must be in it. A gap makes its verdict inconclusive.
  - **A withheld row's file** enters the scope only for a lens that is handed
    its place line, and then as the file only. For a lens that can reach the
    web, the scope holds no file for that row. A file the revision diff
    touches is in the scope as any touched file, even when a withheld row
    sits in it; nothing more is written for the row.
  - **It never marks a withheld row `absent`.** It carries the row as it
    stands; only a full read or my word closes it.
  - **Files on disk.** Any file you write for the scope, a diff or a copy,
    sits with the round's inputs and is deleted when the round closes.
    Nothing is written for a withheld row's file.
  - **When the revision diff can't be derived** from the head the last base
    line names, for example after a squash, the lens runs a restart instead,
    which carries each `open` row, and the base line says why.
  - **A scoped report never releases a push.** Where a repo's push rule waits
    on the security pair's read, the pair's follow-up whose read releases the
    push is a full read: it reads the whole change as a first round does, is
    still handed its `E` rows, and carries each `open` row as a restart does.
    Before such a push, check that the report you cite is not marked scoped.
- **A restart.** A lens's next run is a first round again when the intent has
  changed (the Workflow's "back to Design"), when the base moved (a merge or
  rebase brought in other work), when the last table holds no state words, or
  on my word. The base line says which, and how many `open` rows each
  restarted lens carried. Carry each `open` row of the last table into the
  new table, still `open`, with a state word you write and "carried at
  restart" in its reason text. A withheld row is carried as it stands (see A
  withheld finding).
- **A full read on my word,** at any time, is the one I name: a restart, which
  gates by state, or a full pass. **A full pass** runs only when I ask, for
  the lenses I name. It is a first round in which every finding gates,
  whatever its state.
- **The closing read.** At Test, the last round before I accept the work, by
  merge or otherwise, is a closing read, for every lens that ran at Test, the
  security pair included. It is a first round on the whole change, gating by
  state as usual and carrying each `open` row as a restart does; after
  earlier rounds, it is still handed its `E` rows.
  - **Three states.** Hand it the base, the approved spec or ticket, and the
    head, and it compares them. The approved spec is the revision I
    approved, else the revision the last Design base line names, read by the
    project's rule on whose text counts.
    With no spec or ticket, it compares the base, the request and the head.
  - **Its head.** The base line names the head it read. The work I accept is
    that head; a later commit needs a new closing read.
  - **When.** Run it when the work is ready to come to me. A first Test round
    on the final head, run with the three states and Spec drift, is the
    closing read. If it leads to a fix, the follow-ups after it are scoped
    again, and a new closing read comes before I accept the work.
  - **A review in flight** when this rule is installed takes scoped follow-ups
    from its next round, and a closing read before its own merge.
- **The Design-to-Test step is a first round.** At Test a lens reviews a diff
  or a result; at Design it reviewed a spec, a different kind of input.
- **Kept-local reports.** When the work's last review round closes, and
  before a session that kept reports local hands off or ends, name each
  report it kept local and ask me in chat to delete them and their place
  lines. Delete them only on my word.

**The report template.** Hand every lens this template with its inputs, and
ask it to report in it. Its own artifact, such as a drafted ticket or a data
inventory, goes in the report too. The template is a shape, not a syntax: take
what a lens writes by its meaning.
- **For the owner:** plain sentences on what it found, why it matters and
  what it suggests.
- **Findings:** one per item, each with where it sits (a section or claim
  from the list it was handed, or a file and symbol), how serious it is
  (high, medium or low), a one-line headline, the evidence and the smallest
  change that fixes it.
- **Trade-offs:** each finding past a cost limit or an Enough level, or
  spending a cost whose limit is empty, listed apart from Findings, each with its severity, the cost or level, the limit
  and the quality at stake. A lens with none writes "none".
- **State:** each finding, trade-off and accepted-risk line also gives its
  state against the base: `new` (the work introduced it), `updated` (it was at
  the base and the work makes it worse, edits it, or newly reaches or relies
  on it) or `unchanged` (it was at the base, and the work neither touches nor
  relies on it). A first round reads the whole base, and a scoped follow-up
  reads the base only in its scope; the gating is scoped to the work.
  On a follow-up, each also names the earlier finding it continues, by its
  `E` number, or "none". An `E` finding that no longer holds is not a state
  against the base: it goes under Earlier findings as `absent`, and that is
  the state word its row takes.
- **Earlier findings,** on a follow-up only: one line per `E` row it was
  handed, either `absent` (it no longer holds), with the evidence that it no
  longer holds, or "holds", naming the finding under Findings that continues
  it. An `E` row the report doesn't account for is something it couldn't
  review.
- **Spec drift,** on a closing read only: by the lens's own question, where
  the head departs from the approved spec, and where the approved spec
  departs from the request and the base. This holds over a lens's own
  stay-out for this section. A drift item that is a defect is also a
  finding, with its state; any other is for my information.
- **Not checked:** what it didn't look at, and why. On a scoped follow-up, its
  first item is exactly "scoped follow-up: the rest of the change was not
  read", followed by the count of changed files outside its scope; it lists
  no files. What lies outside its scope was not handed to it, so it doesn't
  make the verdict inconclusive.
- **Verdict:** blocking when a finding is high and `new` or `updated`, or high
  and `unchanged` and either a security finding by the lens's own class (the
  security pair) or marked `security?` (any other lens); inconclusive when it
  couldn't review something it was handed, an `E` row it didn't account for
  included; findings; or clear. An `unchanged` finding that isn't a security
  finding never makes the verdict blocking, nor does an `absent` one, a
  Trade-off, or a finding marked accepted by the threat model.

**What each state means, by lens.** Hand this table with the template, so each
lens applies the words to its own question. A lens brought from elsewhere
applies the general meanings above.

| Lens | `new` | `updated` | `unchanged` |
| --- | --- | --- | --- |
| executability-lens | a stall in the spec's own text or steps | a gap in the system that the spec now relies on, deepens or edits | a gap in the system that the spec neither relies on nor touches |
| unstated-lens | a need of the request, or of the spec, with no home | a need the system already left unmet, made worse or edited by the work | a need the system already left unmet, which the work doesn't touch |
| behaviour-lens | a claim that fails, or a regression | a fault at the base that the change edits or now reaches more often | a fault at the base outside the claims, untouched |
| integrity-lens | a weak test or check the change adds | a weak test at the base that the change edits or now cites as evidence | a weak test at the base, neither edited nor cited |
| conventions-lens | a rule break in lines the diff adds | a break at the base that the diff edits, copies or extends | a break at the base in lines the diff doesn't touch |
| reader-lens | a tell in text the change adds | a tell at the base in text the change edits | a tell at the base in text the change doesn't touch |
| adversarial-lens | an attack path the change opens | a path at the base that the change makes easier or edits | a path at the base that the change leaves as it was |
| data-lens | a leak point the change adds | a leak point at the base that the change widens or edits | a leak point at the base that the change leaves as it was |

**Quality rows and cost limits.** Hand each lens, as a local file, the rows of
the rules file's Qualities table that name it, with their Enough, and the
Cost limits rows those Enough cells name, with the running count against each
counted limit (see Trade-offs and accepted risks). Take all of them from the
rules in force: the project's own rules file where it sets them, else the
home rules. Hand the two security lenses also the sensitive-work list in force and the
threat model (see Trade-offs and accepted risks). Batch the missing measures the lenses report into one
question for me: add each as a claim, or skip it. Record a skip once, in the
Lens dispositions table, as "skipped, because ...".

**Fresh and alone.** Dispatch each lens fresh and on its own, never shown
another lens's report. Never resume a lens.

**Counting a round.** Before you dispatch a round, count it against each Cost
limits row that no quality's Enough names, each by its Counted as: Lens pairs
counts the pairs the round would run, and a lens offered on its own counts as
a pair. Follow the row's "At the limit" for what goes past it, except that a
pair held back always comes to me as a trade-off, whatever the row says. The security
pair, a lens the repo's own rules require and the lenses of a skill I typed
count toward the round, but are never the ones held back: another pair waits,
and when only those are due, they all run and you say the count past the
limit. Taking a pair once doesn't carry it to a later stage:
a pair I took on a spec is offered again at Test, as "Lenses are offers" says,
never run there unasked.

**The mutation step.** Before a lens that checks whether the tests can fail,
run a mutation-testing tool if the repo's lock file pins one.
- Run it as its local binary, never through a command that can fetch a
  package (`npx`, `pnpm dlx`, `bunx`).
- Write its output to a new file in your scratch folder, and hand that file
  to the lens.
- Snapshot the working tree, untracked files included, before and after, and
  check they match. A tool config in the diff runs code, like its tests.
- With no tool, say so.

## Crossing the reports

You lay the reports out yourself, by judgment. Nothing lays them out for
you, and nothing refuses a report for its layout.

**Pairs.** Lenses offered together in one offer of the Workflow are a pair,
and their reports are crossed together. The pact offers every lens in a pair:
never run or cross one lens of a pair without its partner, and a report from
one waits for its partner's in the same round. Only a lens a rules file offers
on its own, even one the Lenses table lists with a partner, is run and
crossed alone.

**The review comment.** One comment per review round. Its heading, base line
and human layer show; the data sits folded below them, so a reader sees the
round at a glance and the data stays as it is. In this order:

1. A heading naming the lenses: `### lens-a and lens-b`, or `### lens-name`
   for a lens a rules file offers on its own.
2. **The base line,** the first line under the heading. It names the base by
   its short hash, and the spec revision or head commit reviewed, and says
   which lenses ran a first round, a follow-up, a scoped follow-up, a
   restart (and why, and how many `open` rows it carried), a closing read
   (and the head it read) or a full pass.
3. **The human layer,** for people: it may repeat what the table says, and
   nothing reads it back. Write it last, from the final Lens dispositions
   table of the round:
   - **A title line,** a level-two heading naming the stage, the round, the
     head commit or spec revision, the verdict word (item 6) and `N for you`
     or `nothing for you`.
   - **A verdict line** when the lenses' verdict and the state after your
     sort differ, for example "The lenses said blocking; after sorting,
     every finding is fixed".
   - **A signal table,** one row per lens that ran: the lens, a signal and
     one line in your own words. 🟢 fixed or clear, 🔵 taken, 🟡
     inconclusive, waiting or withheld, 🟠 open, 🔴 open and security.
   - **Diagrams,** one or more, each drawing the situation (see Diagrams
     below), each in a centred block written exactly as
     `<div align="center">`, a blank line, the `mermaid` fence, a blank line
     and `</div>`, with a short heading above each when there is more than
     one.
   - **Boxes,** GitHub alerts, each its own quote block: `[!WARNING]` for
     each decision for me, opening "Decision:" and then the finding's
     headline and its lens, with each side, the tension as the qualities
     that pull against each other, and the question; `[!IMPORTANT]` for
     what only I can do; `[!NOTE]` for items only waiting and for withheld
     rows; `[!TIP]` for the next step. No box when there is nothing to say.
   - **A count line,** one count per Disposition word in the table, such as
     `Fixed 2 · Open 7`, summing to its rows.
4. **The Lens dispositions fold:** an HTML details element whose summary line
   reads `Lens dispositions (N findings)`, N the table's rows, then a blank
   line, the table and any escape and gap table (see Lens dispositions and
   Escapes and gaps), a blank line and the closing tag. The summary line is
   the line naming "Lens dispositions". A table is never folded, fenced,
   quoted, relabelled or moved any other way to get past a check; this fold
   is the template's own, and a check reads the table in it as anywhere
   else.
5. **The crossed-findings fold:** a details element whose summary line reads
   `Crossed findings (N crossings, M lenses)`, holding items 6 to 13 in their
   order, each as it would stand unfolded.
6. **Verdict.** The stricter of the lenses' own verdicts: blocking, then
   inconclusive, then findings, then clear, raised to blocking when you sort a
   high `unchanged` finding as a security finding (see Findings and their
   state). Show each lens's verdict beside it, and mark one your sort raises,
   with the finding. A review that holds a withheld finding posts the verdict
   of its posted findings only (see A withheld finding). A lens whose verdict
   is inconclusive is marked "not verified": its silence is not a pass, so
   read what it didn't check. Mark "scoped" beside the verdict of each lens
   that ran a scoped follow-up.
7. **Crossings first.** A table of the places both lenses flagged, with each
   lens's findings there and the state beside each.
8. **One lens only.** A table of where, lens, severity, state and headline,
   and anything else the lens gives each finding, such as a likelihood.
   These two tables hold the `new` and `updated` findings and the `unchanged`
   security findings.
9. **Spec drift,** for a closing read: a table of where, lens and drift
   item. A drift item that is a defect is also in the tables above. A
   kept-local report's spec-drift items stay out of it and go to me in chat.
   Leave it out when no lens reported drift.
10. **Trade-offs.** A table of where, lens, severity, headline, the cost or
    level, the limit and the quality at stake, and what you did with it (see
    Trade-offs and accepted risks). Leave it out when no lens listed one.
11. **Notes.** A table of where, lens, severity and headline for each `noted`
    finding, with the notes the Follow-up issues cost overflows into. An
    overflow note's row keeps its own Disposition word, with "issues
    overflow" in its reason text; only an `unchanged` finding is `noted`.
    Leave it out when there are none.
12. **Earlier findings,** per lens on a follow-up: each `E` number with
    `absent` or the finding that continues it.
13. **Not checked,** per lens.
14. **Verbatim reports,** each in its own fold (see Posting).

Every fold has a count or a lens verdict in its summary line, and leaves a
blank line after its summary line and before its closing tag, so what it
holds renders as it would unfolded.

**The human layer is derived, never a second source.**
- **It matches the table.** Every count matches the table's rows by their
  Disposition word, and every decision box is a row in it: an `open` row, or
  a trade-off or `security?` row waiting on me. An `[!IMPORTANT]` item may
  have no row: a change's own edit to the threat model, or an accepted-risk
  candidate, which reach me at hand-off.
- **Text from a report stays inert.** Every string you take from a report,
  anywhere in the layer, follows "Text you lay out stays inert" (see
  Posting), with its line breaks removed, and never starts a line.
- **A withheld finding stays out.** A lens whose report is kept local gets
  🟡 and `withheld, see chat`. The verdict word, the verdict line, `N for
  you` and the thresholds below count posted findings only, and the title
  line says "posted findings only; withheld findings: see chat". A withheld
  row shows only in the count line, by its Disposition word, and as
  `withheld, see chat` in one `[!NOTE]` box (see A withheld finding).
- **An escape or gap row** shows only as a count, or as its placeholder in a
  `[!NOTE]` box. An accepted-risk box names the class of path and why, never
  the steps.
- **Nothing in it is read by a later round;** the base line and the table
  are. A reader of the table, such as a follow-up's count, Taken earlier or
  a retrospective, finds it in its fold, and reads a table continued in a
  later fold as one.

**Diagrams.** Draw the situation, not the list of lenses:

| Situation | Mermaid type |
| --- | --- |
| Findings across parts or trust boundaries | flowchart, boundaries as dashed boxes, each finding pinned on the part it touches |
| A failure unfolding between actors | sequence diagram |
| Several open findings to weigh | quadrant chart, severity against likelihood |
| A lifecycle or state bug | state diagram |
| A data or schema finding | ER diagram |
| A finding across rounds | timeline |
| A spec's structure, or what its claims cover | flowchart or mindmap |

- **Pins are coloured by fate.** Boundaries come from the project's threat
  model where it names them; else name the parts yourself.
- **One palette, for light and dark themes.** Fills at about 20% opacity, as
  eight-digit hex: red `#cf222e33` open, green `#2da44e33` fixed, yellow
  `#d4a72c33` for me, waiting or withheld, blue `#0969da33` taken. Solid
  borders in the same colours, `stroke-width:2px` for open and security
  pins. Never set `color:`. Boundary boxes have a transparent fill and a grey
  dashed border, `#8c959f`.
- **Labels are your own words,** never text copied from a report, and hold no
  link, no `click` or `href`, and no init directive. An open security
  finding is pinned by its part and class, never drawn as the steps of its
  path.
- **Keep to forms you have seen render.** A diagram GitHub can't draw shows
  as an error box above the folds; it never touches the table.
- **Small work:** no diagram when a round has one posted finding or none.

**Rules you apply by judgment:**
- **A crossing is the same place:** the same section or claim, the same file
  and symbol, or overlapping lines in one file. Two findings that read alike
  in different places are not a crossing. Each lens asks a different
  question, so a crossing means two different problems meet at one place.
- **Small work:** the title line, the count line, any "not verified" mark
  and the count of not-checked items per posted lens, then the folds; no
  signal table, diagram or box unless a row is open.
- **A record that is not GitHub,** such as the review shown in chat: the
  human layer is plain text, with no diagrams and no alert markup.
- **Size:** one comment holds at most 65,536 characters. Past that, part 1
  holds the heading, the base line, the human layer and the two folds, and
  the reports go to part 2 and on, each part opening with a heading that
  names it. Each part closes every fold it opens. A table or a
  crossed-findings fold that still does not fit continues in a fold of its
  own whose summary line starts with the same words, with any table header
  repeated. Check every part before you post any; if one is refused, post
  nothing and tell me. A report that alone is over the limit stays a local
  file; name its path to me in chat, never in the record.

## Findings and their state

**You write the state words,** from the template, as you write the verdict and
severity words, and never copy them from a report's text. A state you change
from the lens's own is said in the row's reason text. A finding with no
state, or one whose state you can't tell, is `new`. A state you lower so
that the finding stops gating is never `auto`: it comes to me with the
lens's state and yours.

**The class is said in the row.** A row for a security or `security?` finding
says so at the start of its reason text, `security:` or `security?:`, except a
withheld row (see A withheld finding). On a follow-up, treat an `E` row
whose class you can't tell as a security finding, for an `absent` finding.

**Sorting an `unchanged` finding.**
- You decide whether it is a security finding, as for any finding, by the
  rules file's definition. A security finding keeps its full weight under the
  security bar, and its row is never `auto`.
- A finding a lens marked `security?` is never noted by you. It comes to me as
  any `security?` row does.
- Any other is `noted`, marked `(auto)` since you sorted it. Fix it in this
  change only on my word.
- A finding that guards data but isn't a security finding (data loss or
  corruption, with no secret or personal data) is `noted` like any other. When
  it is high, name it to me with the other high notes.
- An `unchanged` trade-off follows its cost's "At the limit", as any trade-off
  does, with its trade-off words; it is not `noted`.
- At hand-off, name each high `noted` finding to me in chat, with the choice
  to file it, fix it in this change, or leave it as a note, and offer a full
  pass once.
- Filing a `noted` finding counts against the Follow-up issues cost.

**Sorting an `absent` earlier finding.** Record it `fixed`, naming its `E`
number. When the earlier finding was a security or `security?` finding, first
confirm it against the evidence the lens names (the fixing change or spec
text), and its row is never `auto`: it is `fixed` only when I take the fix, and
until then stays `open`, with the lens's `absent` and your confirmation in its
reason text. One you can't confirm stays `open` and comes to me as
unconfirmed. A withheld row follows A withheld finding.

**A withheld finding.** A finding from a report kept local lives in chat
until I settle it. Nothing in the record gives or implies its state, class or
severity:
- **Its row** in the Lens dispositions table holds "withheld, see chat" in
  the Finding cell, the lens in the Lens cell, one bare Disposition word
  (`open` until I settle the finding in chat, never `noted`), and at most the
  lens's name in the Rerun cell. A restart carries it as it stands.
- **Its placeholder** in the review comment sits in the One lens only table,
  whatever its state or kind, never in Crossings first, Spec drift,
  Trade-offs or Notes.
- **Its Earlier findings item** reads "withheld, see chat".
- **A follow-up's or a closing read's report that was handed it as an `E`
  row** is kept local too, as a kept-local report, until I settle the finding, whatever it says
  about it (holding or `absent`) and whatever the read before posting finds.
- **The verdict.** A review that holds a withheld finding posts the verdict
  of its posted findings only, leaves out the verdict of a lens whose report
  is withheld, and says so: "posted findings only; withheld findings: see
  chat". The full verdict, and any raise your sort makes, go to me in chat.

**Taken earlier.** Within one piece of work, a continuing finding stays "taken
earlier" only when all four hold: its `E` row is `taken` without `auto`; it
is no higher in severity than that row, nor in likelihood where the lens
gives one, read from the review comment that posted the row; it is not newly
a security or `security?` finding; and the lens didn't raise it in full as
easing an accepted risk. An `E` row whose severity or class you can't tell
never stays "taken earlier". Outside a follow-up, you match the
finding to a row of the last table, and read the same four from it and its
review comment. Otherwise, or when any of them can't be read, it comes to me
again, naming its `E` number or its row, and what changed.

## Trade-offs and accepted risks

**The running count.** For a counted limit, such as tests added in this
change, the Lens dispositions table keeps the count across review rounds, in
each trade-off row's reason text: `trade-off: Tests added, 3 of 2`. Add no
column. Read the count from the last table when you hand a lens its cost rows.

**Finding the threat model.**
- **Which file.** The one the project's agent instructions name (the line
  that names it is the pointer), else `docs/threat-model.md`, else none. It
  must be a file tracked at the base commit, and you read it from there.
- **Read at the base.** Read the pointer and the file as they stood at the base
  of the change, and hand the change's own edits to either as a separate
  input. An edit to the pointer, or a moved or deleted file, is a finding, as
  is an edit to the scope or the accepted risks.
- **A file that can't be used.** A named file that is missing, untracked at
  the base, or that lies outside the repo (a link out of it included), is
  reported, and the project is treated as having none.
- **Who gets it.** The two security lenses, and you, as the sorting session.
  Tell each lens the file's path in the repo at the base, never the
  location of your copy, or that there was none.

**Every threat-model edit goes to me.** At hand-off, check the diff yourself
for an edit to the threat model's scope, its accepted risks or the pointer, whichever lenses ran. Bring each one to me as a decision that
is always mine; it never applies in the same review.

**Recording an accepted risk.** In a project with a threat model:
1. propose the entry, naming the class of path and why it is accepted, never
   the steps;
2. I approve it, in chat or by a relay from a lead session I set up;
3. read it as you read a post (see Posting), then write it with its date, the
   finding it came from, and how my approval arrived (chat, or relayed).

With no threat model, flag the risk to me and record nothing. Never create the
file.

**Sorting a trade-off finding.**
- You decide whether the finding is security, by the rules file's definition,
  because you hold the threat model. A lens outside the security pair marks
  one it is unsure of `security?`.
- Follow the row's "At the limit", and say what you took. A cost with an empty
  limit sends the finding to me.
- A finding where a lens weighs a security fix's cost against its risk (the
  security bar), a finding that matches an accepted risk, and a `security?`
  row always go to me and are never `auto`.
- A finding that matches an accepted risk is still reported, as one line
  marked accepted by the threat model, naming the entry and keeping the
  severity and likelihood the finding would have had; it is never dropped and
  never blocks.
- Within one piece of work, a finding I already took is not brought again; its
  row says "taken earlier", under the four conditions in Findings and their
  state.

**Disposition words.** A trade-off finding's row keeps the words below:
`taken` when I take the limit's side, `fixed` when the fix is built anyway,
`dismissed` when it is dropped. Its reason text starts `trade-off:` and names
the cost. Add no word.

## Posting

This section applies to every report and comment you post, those of lenses a
skill runs included.

- **Read before you post.** Before posting any report, review comment, Lens
  dispositions table or line of your own prose, read it for a secret's value
  or a personal detail: a user name, a host name or an email address. If you
  find one, keep whatever holds it local, name where the value sits, and tell
  me in chat. A path is no personal detail in itself, only by a user or host
  name it holds. A report kept local stays out of the review comment too:
  leave its rows and strings out, write "withheld, see chat" in their place,
  and give me its path in chat, never in the record.
- **Verbatim reports go in a fold,** an HTML details element whose summary
  names the lens and its verdict, holding the report in a fenced block. The
  fence is at least three backticks, one more than the report's longest run of
  backticks, and carries the info string `text`. Leave a blank line between
  the summary line and the opening fence, and between the closing fence and
  the end of the details element, so the fence is read as a fence. In such a
  fence a lens's text can't render as a mention, an issue link, an image, a
  link or maths.
- **Text you lay out stays inert.** Put every string you take from a report in
  a code span longer than its longest run of backticks: the headline, where it
  sits, and each not-checked item. Escape pipes in a table and remove line
  breaks. Write the verdict and severity words yourself, from the template,
  and never copy them.
- **Hidden characters.** Before posting, search each report file for control,
  invisible and direction-changing characters with your search tool, for
  example with the pattern
  `[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F\xAD\x{61C}\x{180E}\x{200B}-\x{200F}\x{2028}-\x{202E}\x{2060}-\x{2069}\x{FE00}-\x{FE0F}\x{FEFF}\x{FFF0}-\x{FFFF}\x{E0000}-\x{E0FFF}]`.
  Tab, line feed and carriage return are fine. Name any you find in the
  report's fold summary and don't block on them, but a hit in the tag or
  variation-selector ranges can spell hidden text: decode it and put it
  through the read above before you post. Where a tool refuses a report for
  hidden characters, keep the report local and tell me, as for a personal
  detail; never strip them to post it.
- **A report's "For the owner" section holds no line numbers, codes or
  paths.**
- **Where to post.** In the work's record, where the project keeps it. With no
  record, show the review comment in chat.

## Lens dispositions

At every lens review, post a "Lens dispositions" table where the reports went,
under a line naming "Lens dispositions", one row per finding; in a review
comment, that line is its fold's summary line (see The review comment). Its
header row is exactly `| Finding | Lens | Disposition | Rerun |`, with no
markup. Each row gives the finding, the lens (never empty), the
disposition, and the rerun, if any, and why. A `skipped` row may leave the
Finding cell empty. A row for a report kept local keeps its four cells,
with "withheld, see chat" in the Finding cell.

The Finding cell starts with the finding's state word, one of `new`,
`updated`, `unchanged` or `absent`, in lower case and with no markup, then a
space and the finding. A `skipped` row needs none, and neither does a withheld
row, whose Finding cell is exactly "withheld, see chat": a state word there
would tell tracker readers whether the held-back item sits at the base. Its
state goes to me in chat with the rest of the finding.

The Disposition cell starts with one of these words, in lower case and with
no markup:
- `fixed`
- `taken`
- `dismissed`
- `skipped`, for a lens you left out or a measure you chose not to check,
  which gets its own row as `skipped, because ...` with the reason.
- `open`, for a finding I haven't settled yet. It needs nothing after it; a
  later table gives the finding its final word.
- `noted`, for an `unchanged` finding kept as a note, which never blocks. When
  I file one, its reason text says so, as in `noted: filed as #N`.

Mark one you took on your own recommendation `auto`, as in
`fixed (auto: chose X because Y)`, or `fixed (auto)` with no reason. One I
reverse is marked `(auto, reversed)`, keeping the row.

A cut finding on a test that guards an item on the sensitive-work list in
force is a security finding: its row is never `auto`, and it comes to me.

A tool may check this table's shape before it posts; where none does, the
table is unchecked. A retrospective that counts these tables reads each one
tolerantly and counts the rows it can't read.

**With no lens review,** list the choices you took on your own recommendation
under "Auto-takes".

## Escapes and gaps

Escape and gap rows go in a table of their own under that review's Lens
dispositions table, with no Disposition column. In a review comment, they sit
inside its fold.

- **An escape.** A defect found after a lens review passed the work, within a
  question a lens there asked, gets a proposed escape row: the lens or
  lenses, and "after auto-take: yes" or "no". It is "yes" when the escaped
  finding's row was `auto`.
- **A gap.** A defect no lens's question covers is a roster gap, logged the
  same way with its ISO 25010 quality.
- **Only rows I confirm count.**

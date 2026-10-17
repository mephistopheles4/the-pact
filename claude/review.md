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
the repo.
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
- **Not checked:** what it didn't look at, and why.
- **Verdict:** blocking when anything under Findings is high (a Trade-off or a
  finding marked accepted by the threat model never is); inconclusive when it couldn't
  review something it was handed; findings; or clear.

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
and their reports are crossed together. A lens offered alone, or run alone, is
crossed alone.

**The review comment.** One comment per review, in this order:

1. A heading naming the lenses: `### lens-a and lens-b`, or `### lens-name`.
2. **Verdict.** The stricter of the lenses' own verdicts: blocking, then
   inconclusive, then findings, then clear. Show each lens's verdict beside
   it. A lens whose verdict is inconclusive is marked "not verified": its
   silence is not a pass, so read what it didn't check.
3. **Crossings first.** A table of the places both lenses flagged, with each
   lens's findings there.
4. **One lens only.** A table of where, lens, severity and headline, and
   anything else the lens gives each finding, such as a likelihood.
5. **Trade-offs.** A table of where, lens, severity, headline, the cost or
   level, the limit and the quality at stake, and what you did with it (see
   Trade-offs and accepted risks). Leave it out when no lens listed one.
6. **Not checked,** per lens.
7. **Verbatim reports,** each in its own fold (see Posting).

**Rules you apply by judgment:**
- **A crossing is the same place:** the same section or claim, the same file
  and symbol, or overlapping lines in one file. Two findings that read alike
  in different places are not a crossing. Each lens asks a different
  question, so a crossing means two different problems meet at one place.
- **Small work:** one line with the verdict, any "not verified" mark, and the
  count of not-checked items per lens, followed by the folds.
- **Size:** one comment holds at most 65,536 characters. Split a longer
  review comment into parts, and repeat a table's header where it continues.
  A report that alone is over the limit stays a local file; name its path to
  me in chat, never in the record.

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
  row says "taken earlier".

**Disposition words.** A trade-off finding's row keeps the words below:
`taken` when I take the limit's side, `fixed` when the fix is built anyway,
`dismissed` when it is dropped. Its reason text starts `trade-off:` and names
the cost. Add no word.

## Posting

This section applies to every report and comment you post, those of lenses a
skill runs included.

- **Read before you post.** Before posting any report, review comment, Lens
  dispositions table or line of your own prose, read it for a secret's value
  or a personal detail: a user name, a host name, a home or temp folder path,
  or an email address. If you find one, keep whatever holds it local, name
  where the value sits, and tell me in chat. A report kept local stays out of
  the review comment too: leave its rows and strings out, write "withheld, see
  chat" in their place, and give me its path in chat, never in the record.
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
under a line naming "Lens dispositions", one row per finding. Its header row
is exactly `| Finding | Lens | Disposition | Rerun |`, with no markup. Each
row gives the finding, the lens (never empty), the disposition, and the
rerun, if any, and why. A `skipped` row may leave the Finding cell empty. A
row for a report kept local keeps its four cells, with "withheld, see chat"
in the Finding cell.

The Disposition cell starts with one of these words, in lower case and with
no markup:
- `fixed`
- `taken`
- `dismissed`
- `skipped`, for a lens you left out or a measure you chose not to check,
  which gets its own row as `skipped, because ...` with the reason.
- `open`, for a finding I haven't settled yet. It needs nothing after it; a
  later table gives the finding its final word.

Mark one you took on your own recommendation `auto`, as in
`fixed (auto: chose X because Y)`, or `fixed (auto)` with no reason. One I
reverse is marked `(auto, reversed)`, keeping the row.

A tool may check this table's shape before it posts; where none does, the
table is unchecked. A retrospective that counts these tables reads each one
tolerantly and counts the rows it can't read.

**With no lens review,** list the choices you took on your own recommendation
under "Auto-takes".

## Escapes and gaps

Escape and gap rows go in a table of their own under that review's Lens
dispositions table, with no Disposition column.

- **An escape.** A defect found after a lens review passed the work, within a
  question a lens there asked, gets a proposed escape row: the lens or
  lenses, and "after auto-take: yes" or "no". It is "yes" when the escaped
  finding's row was `auto`.
- **A gap.** A defect no lens's question covers is a roster gap, logged the
  same way with its ISO 25010 quality.
- **Only rows I confirm count.**

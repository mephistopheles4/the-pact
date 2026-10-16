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
- **Not checked:** what it didn't look at, and why.
- **Verdict:** blocking when anything is high; inconclusive when it couldn't
  review something it was handed; findings; or clear.

**Quality rows.** Hand each lens, as a local file, the rows of the rules
file's Qualities table that name it, from the project's own list where the
project has one. Batch the missing measures the lenses report into one
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

You lay the reports out yourself, by judgment. Nothing parses them and
nothing refuses one.

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
   lens's findings there. Where the two lenses pull opposite ways, such as
   what blocks against what could wait, head it **Disagreements: you settle
   these**.
4. **One lens only.** A table of where, lens, severity and headline, and
   anything else the lens gives each finding, such as a likelihood.
5. **Not checked,** per lens.
6. **Verbatim reports,** each in its own fold (see Posting).

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
row gives the finding, the lens, never left empty, the disposition, and the
rerun, if any, and why.

The Disposition cell starts with one of these words, in lower case and with
no markup:
- `fixed`
- `taken`
- `dismissed`
- `skipped`, for a lens you left out, which gets its own row as
  `skipped, because ...` with the reason.
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

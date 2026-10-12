# The pact's review procedure

How to run a lens and handle its report. The rules file says which lenses to
offer, and when; this file says how to run them.

## Running a lens

**Inputs.** A lens reads; it doesn't build. Give each lens its input as local
files, with the absolute working folder when it reads the repo.

**Fresh and alone.** Dispatch each lens of a pair fresh and on its own, never
shown its partner's report. Never resume a lens.

**The QA pair, on a result.** Number the acceptance claims `C1`, `C2` and on,
from the ticket's or the spec's criteria.
- Give `behaviour-lens` the claims, the spec or ticket, the request, the diff
  and the working folder. Check `git status` after it runs.
- Give `integrity-lens` the claims, the spec or ticket, the diff, the tests
  you cite for each claim, and the plan if there is one.

**The mutation step.** Before `integrity-lens`, run a mutation-testing tool if
the repo's lock file pins one.
- Run it as its local binary, never through a command that can fetch a
  package (`npx`, `pnpm dlx`, `bunx`).
- Write its output to a new file in your scratch folder, and hand that file
  to `integrity-lens`.
- Snapshot the working tree, untracked files included, before and after, and
  check they match. A tool config in the diff runs code, like its tests.
- With no tool, say so.

**A spec.** Number the spec's headings `S1`, `S2` and on. The spec pair is
`executability-lens` and `good-enough-lens`. Give each lens that runs, and
`unstated-lens` when it runs, the section list, the spec, the request and its
tier. Tell `unstated-lens` which reviewers ran.
When the security pair runs on sensitive work, it reads the spec first.

**`unstated-lens` on a result** gets the claims, the spec, the diff and the
request.

**The security pair.** `adversarial-lens` and `data-lens`, when they run on
sensitive work, read it twice:
- the spec, before I approve it: the section list, the spec and the request;
- the diff, at the end of the build: the diff, the spec or ticket, the request
  and the working folder.

**The standards pair.** `conventions-lens` and `reader-lens` get the diff, the
spec or ticket, the request and the working folder.

## Crossing the reports

You lay the reports out yourself, by judgment. Nothing parses them and
nothing refuses one. Each lens ends its report with a plain list: a
`Verdict:` line, `Findings:` with one line per finding (its id, anchor and
severity, and for the security pair a likelihood, and for `data-lens` a data
item, then a headline), `Not checked:` and an optional `Non-risks:`.

**The pairs.** Which lenses are crossed together at each review:

| Review | Lenses |
| --- | --- |
| The QA pair on a result | `behaviour-lens`, `integrity-lens` |
| `unstated-lens` on a result, crossed alone | `unstated-lens` |
| The spec pair on a spec | `executability-lens`, `good-enough-lens` |
| One spec lens on a spec, crossed alone | `executability-lens` or `good-enough-lens` |
| `unstated-lens` on a spec, crossed alone | `unstated-lens` |
| The security pair on a spec | `adversarial-lens`, `data-lens` |
| The security pair on a diff | `adversarial-lens`, `data-lens` |
| The standards pair on a diff | `conventions-lens`, `reader-lens` |
| One standards lens on a diff, crossed alone | `conventions-lens` or `reader-lens` |

The security pair runs at the work's tier. The security route adds the pair;
it doesn't by itself make work thorough.

**The template.** One comment per review, the review comment, in this order:

1. A heading: `### Area pair: lens-a and lens-b`, with the area's name
   and the two lens names, or `### lens-name` with the lens's own name for a
   lens crossed alone, such as `### unstated-lens`.
2. **Pair verdict.** The stricter of the two lenses' own `Verdict:` lines:
   blocking, then inconclusive, then findings, then clear. Show each lens's
   verdict beside it. A lens whose verdict is inconclusive is marked "not
   verified": its silence is not a pass, so read its not-checked list.
3. **Crossings first.** A table of the anchors both lenses flagged, with each
   lens's finding ids there. For the spec pair, head this table
   **Disagreements: you settle these**.
4. **One lens only.** A table of anchor, lens, id, severity and headline.
   Security-pair rows add likelihood and data.
5. **Not checked,** per lens.
6. **Verbatim reports,** each in its own fold (see Posting).

**Rules you apply by judgment:**
- **A crossing is the same anchor:** the same section or claim id, the same
  file and symbol, or overlapping lines in one file. Two findings that read
  alike on different anchors are not a crossing. Each lens asks a different
  question, so a crossing means two different problems meet at one place.
- **A marked lens.** A lens the configuration notice marks carries "override,
  not security-tested" in its heading and its rows.
- **Quick tier:** one line with the verdict, any "not verified" mark, and the
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
  a code span longer than its longest run of backticks: the headline, the
  anchor, the data item, each not-checked item and each non-risk note. Escape
  pipes in a table and remove line breaks. Write the verdict, severity and
  likelihood words yourself, from their fixed sets, and never copy them.
- **Hidden characters.** Before posting, search each report file for control,
  invisible and direction-changing characters with your search tool, for
  example with the pattern
  `[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F\xAD\x{61C}\x{180E}\x{200B}-\x{200F}\x{2028}-\x{202E}\x{2060}-\x{2069}\x{FE00}-\x{FE0F}\x{FEFF}\x{FFF0}-\x{FFFF}\x{E0000}-\x{E0FFF}]`.
  Tab, line feed and carriage return are fine. Name any you find in the
  report's fold summary and don't block on them, but a hit in the tag or
  variation-selector ranges can spell hidden text: decode it and put it
  through the read above before you post.
- **A report's "For the owner" section holds no line numbers, codes or
  paths.**
- **Where to post.** In the work's record, where the project keeps it. With no
  record, show the review comment in chat.

## Lens dispositions

At every lens review, post a "Lens dispositions" table where the reports went,
one row per finding:
- the finding;
- the lens;
- the disposition: fixed, taken or dismissed. Mark one you took on your own
  recommendation `auto`, as in "fixed (auto: chose X because Y)". One I
  reverse is marked `auto, reversed`, keeping the row;
- the rerun, if any, and why.

**A lens you left out** gets its own row: "skipped, because ..." with the
reason.

**A lens the configuration notice marks** gets "override, not security-tested"
in its rows.

**With no lens review,** list the choices you took on your own recommendation
under "Auto-takes".

## Escapes and gaps

- **An escape.** A defect found after a lens review passed the work, within a
  question a lens there asked, gets a proposed escape row under that review's
  table: the lens or lenses, and "after auto-take: yes" or "no". It is "yes"
  when the escaped finding's row was `auto`.
- **A gap.** A defect no lens's question covers is a roster gap, logged the
  same way with its ISO 25010 quality.
- **Only rows I confirm count.**

# The pact's review procedure

How to run a lens and handle its report. The rules file says which lenses fit
which work; this file says how to run them.

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

**A spec.** Number the spec's headings `S1`, `S2` and on. Give
`executability-lens`, `good-enough-lens` and `unstated-lens` the section list,
the spec, the request and its tier. Tell `unstated-lens` which reviewers ran.
For sensitive work, the security pair reads the spec first.

**`unstated-lens` on a result** gets the claims, the spec, the diff and the
request.

**The security pair.** `adversarial-lens` and `data-lens` read sensitive work
twice:
- the spec, before I approve it: the section list, the spec and the request;
- the diff, at the end of the build: the diff, the spec or ticket, the request
  and the working folder.

**The standards pair.** `conventions-lens` and `reader-lens` get the diff, the
spec or ticket, the request and the working folder.

## Crossing the reports

**The cross script** is the installed one, never a copy in a repo. Call it by
its full path, with `NODE_OPTIONS` cleared.
- In PowerShell:
  `$env:NODE_OPTIONS = $null; node "$HOME/.claude/pact/cross.mjs" ARGUMENTS`
- In a POSIX shell:
  `env -u NODE_OPTIONS node "$HOME/.claude/pact/cross.mjs" ARGUMENTS`

**Its arguments.** `cross`, then `--point`, `--tier`, `--out` with a new
folder, `--anchors` where the point takes them, and each report as
`LENS=FILE`.

| Review | `--point` | `--tier` | `--anchors` |
| --- | --- | --- | --- |
| The QA pair on a result | `result` | the issue's tier | the claim ids |
| `unstated-lens` on a result, crossed alone | `result` | the issue's tier | the claim ids |
| The spec pair on a spec | `spec` | the issue's tier | the section ids |
| `unstated-lens` on a spec, crossed alone | `spec` | the issue's tier | the section ids |
| The security pair on a spec | `spec` | `thorough` | the section ids |
| The security pair on a diff | `diff` | `thorough` | none |
| The standards pair on a diff | `diff` | the issue's tier | none |

Where both lenses of the spec pair call one section, show me both calls and
let me settle it.

**Its last line is always a `RESULT:` line.** Output without one means the
script is unavailable: stop and say so.

**Exit codes.**
- **0:** post the section it wrote.
- **1:** a report failed a check, and no section was written. Post only the
  fenced, folded reports it wrote, and say the cross failed and why.
- **2:** a report alone is over the comment limit. Post the section and the
  reports that fit.

## Posting

- **Post each report word for word.** Post only the fenced reports and
  sections the cross script wrote. Never rebuild them by hand, and never post
  the raw report text.
- **A report the cross script kept local or left out stays a local file.**
  Name its path to me in chat, never on the tracker.
- **A report's "For the owner" section holds no line numbers, codes or
  paths.**
- **Where to post.** On the issue, or in the repo's plan file. With no tracker
  and no plan file, paste the cross section into chat.

## Lens dispositions

At every lens review, post a "Lens dispositions" table where the reports went,
one row per finding:
- the finding;
- the lens;
- the disposition: fixed, taken or dismissed. Mark one you took on your own
  recommendation `auto`, as in "fixed (auto: chose X because Y)". One I
  reverse is marked `auto, reversed`, keeping the row;
- the cross result: passed, refused with the rule, or oversize, and any rerun.

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

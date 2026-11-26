# The pact's review procedure

How to run a lens and handle its report. The rules file's Workflow says which
lenses to offer, and when.

<!-- toc -->

- [Running a lens](#running-a-lens)
- [The report template](#the-report-template)
- [Handling the reports](#handling-the-reports)
- [The threat model](#the-threat-model)
- [Diagrams](#diagrams)
- [Posting](#posting)
- [Lens dispositions](#lens-dispositions)

<!-- /toc -->

## Running a lens

- **Inputs.** Give each lens, as local files: what it reviews (a spec with its
  sections numbered `S1`, `S2` and on, or a diff with the acceptance claims
  numbered `C1`, `C2` and on), the request, the working folder, and the base:
  the commit the work started from, by its short hash. For a diff, hand the
  diff from the base. Tell each lens which other lenses ran.
- **With them,** hand the report template below, the rules file's Qualities
  and Cost limits rows, and the project's "Review rules" section, if it has
  one, and, to the security pair, the Threat model section below as it stood
  at the base.
- **Fresh and alone.** Dispatch each lens fresh and on its own, never shown
  another lens's report. Launch it as a plain subagent, never as a named
  teammate, so it gets no messaging or task tool beyond its own tool list.
- **A follow-up** round also gets the diff since the last round and the
  findings it raised then, numbered `E1`, `E2` and on.
- **The tree check,** where the harness can't hold an agent to its tools (Codex
  today), around each lens and each `scout` pass. It only detects a change: it
  keeps no copy and puts nothing back. Before the pass, run this one command
  exactly as printed, putting only the work tree's top folder in its place: don't
  cut the script out, pipe it or edit it. It starts from your home folder, so no
  program or version pin in the tree picks the `node` that runs it. Keep what it
  prints in your own output, never in a file the agent can write. It covers
  every file, ignored ones too, and git's config, hooks, `info`, `HEAD`, refs,
  index entries and half-done merges and rebases.

  ```sh
  cd ~
  node -e '
  const fs = require(`fs`), path = require(`path`);
  process.chdir(process.argv.at(-1));
  const sha = data => require(`crypto`).createHash(`sha256`).update(data).digest(`hex`);
  // A name that is not text reads back as another name, so it fails the run.
  const named = name => { if (name.includes(`\uFFFD`)) throw new Error(`a name that is not text`); return name; };
  const walk = (file, name) => {
    const s = fs.lstatSync(file);
    const id = JSON.stringify(name);
    if (s.isSymbolicLink()) return `${id} link ${JSON.stringify(named(fs.readlinkSync(file)))}\n`;
    if (s.isDirectory()) return `${id} dir ${s.mode}\n` + fs.readdirSync(file).sort().map(n => walk(path.join(file, named(n)), `${name}/${n}`)).join(``);
    return `${id} ${s.mode} ${s.isFile() ? sha(fs.readFileSync(file)) : `other`}\n`;
  };
  const record = [];
  const say = (text, name) => { record.push(`${sha(text)} ${JSON.stringify(name)}`); console.log(record.at(-1)); };
  const line = (file, name) => { if (fs.lstatSync(file, { throwIfNoEntry: false })) say(walk(file, name), name); };
  let own = `.git`;
  const dot = fs.lstatSync(own);
  if (!dot.isDirectory()) line(own, `.git`);
  if (dot.isFile()) own = path.resolve(fs.readFileSync(own, `utf8`).replace(`gitdir:`, ``).trim());
  const pointer = path.join(own, `commondir`);
  const shared = fs.existsSync(pointer) ? path.resolve(own, fs.readFileSync(pointer, `utf8`).trim()) : own;
  for (const n of [`HEAD`, `commondir`, `config.worktree`, `ORIG_HEAD`, `MERGE_HEAD`, `CHERRY_PICK_HEAD`, `REVERT_HEAD`, `rebase-merge`, `rebase-apply`, `sequencer`]) line(path.join(own, n), `git:${n}`);
  if (own !== shared) for (const n of [`refs`, `reftable`]) line(path.join(own, n), `git:own ${n}`);
  for (const n of [`config`, `hooks`, `info`, `refs`, `reftable`, `packed-refs`, `logs/refs/stash`]) line(path.join(shared, n), `git:${n}`);
  for (const n of fs.readdirSync(`.`).sort()) if (n !== `.git`) line(named(n), n);
  // git runs from a folder the tree has no part in, so no program left there stands in for it,
  // and fetches nothing: a fetch runs programs the config names.
  const env = { ...process.env, GIT_NO_LAZY_FETCH: `1`, GIT_ALLOW_PROTOCOL: `none` };
  const git = (...args) => {
    const r = require(`child_process`).spawnSync(`git`, [`-C`, process.cwd(), `-c`, `core.fsmonitor=false`, ...args], { cwd: process.env.SystemRoot || `/`, env, maxBuffer: 1 << 29 });
    // Git can leave entries out, say so and still succeed.
    if (r.status !== 0 || r.stderr.length) throw new Error(`git: ${r.stderr}`);
    return r.stdout;
  };
  line(path.resolve(git(`rev-parse`, `--git-path`, `hooks`).toString().trim()), `git:hooks in use`);
  say(git(`ls-files`, `--stage`, `-v`, `--sparse`), `git:index`);
  console.log(sha(record.join(`\n`)), `whole record`);
  ' "<top folder>"
  ```

  After the pass, stop any process the agent left running, run the same command
  again, as you ran it before and never read again from a file, before any other
  git, and compare the last line, `<hash> whole record`, alone:
  the same means no change. On any difference, if a run fails, or if you no
  longer hold the first output: stop there, run no git in that tree, change
  nothing, count the pass inconclusive, and report to me which lines differ.

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

- **You decide** which findings are security findings, by the Threat model
  section below. A security or `security?` finding comes to me and is never
  `auto`.
- **A stage's rounds.** Under a Review rounds cost, a lens that errors or
  returns no report, or comes back inconclusive, runs again inside its round,
  and a further read runs again the same way; every report it returned stays
  in the record and its findings carry in. A report that Posting refused is never rerun. If the
  security pair, a repo's required lenses or a
  typed skill's lenses would read anything
  after the final round, that read still runs, outside the count,
  with the rules file's "Work that won't converge" as its brake, and its findings go by the
  row's At the limit; this is how those lenses keep running, so the Cost
  limits opening's trade-off does not arise for them there. The stage closes,
  and nothing is accepted or merged, only once
  every further read has reported. A security or `security?` finding of any severity past the limit
  keeps the security bar. A high security finding reopens the stage: its count
  starts again, and its next round runs the security pair. A ticket that
  changes the spec gets its own rounds.
- **One review comment per round.** Open it with a title line,
  `## <stage> round <n>[, reopened] on <head or spec revision>[, final]: <verdict>, <N> for you`,
  N being the rows that need my decision, each a checkpoint (an `open`,
  trade-off, `security?` or Owner's-call row, as Lens dispositions says), not a
  drafted fix waiting on my word. Write `, reopened` on the first
  round after a reopen and `, final` on the round a Review rounds cost
  declares final, and leave out both otherwise; a further read outside the
  count is titled
  `## <stage> further read on <head or spec revision>: <verdict>, <N> for you`.
  Then a signal table, one row per
  lens that ran: the lens, its signal (the mark of its most severe `open` or
  Owner's-call finding, ⚪ when none is open) and one line in your own words. Then 1 to 3
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
  the signature line nor `Edited:` lines, which are added for you; where no
  tool adds them, write the signature line yourself as the body's last line.
  It holds no Lens
  dispositions table, crossed findings, report, diagram, or heading or fold
  naming a lens, and never the words "owner decision": the edit checks would
  refuse every later edit. Find it among the comments your gh login wrote,
  read as JSON, holding the whole line `Signed: status-<n>` outside a fence or
  quote. None: post it. One: edit it, from its body and the round comments
  read just before, writing a `body_file` with no signature line and no
  `Edited:` line, since the signature and the newest are added for you; the reason reads `after <stage> round <n> (<your label>)` or
  `after <stage> further read (<your label>)`. More than one: edit the newest and name the duplicate in it. Post the round comment first. If a status edit is refused
  `post/owned-line` because the `body_file` kept a signature or an `Edited:`
  line, rebuild it without them. If
  the status edit fails or is refused, the record stays whole: say in the
  hand-off that the status is stale, and never post a second status comment.
  The round comments stay the record; nothing reads the status comment back.

## The threat model

Read this, then the project's threat model, both as they stood before the
change, before you sort a finding as security, write a guard, or bring me a
security ruling.

1. **Read the threat model first,** its boundaries before its classes. With
   none, the sensitive-work list decides and steps 2 to 5 don't apply. With
   no list of boundaries, use its scope's in-scope lines as the boundaries
   and the controls it names.
2. **Place the finding on a boundary:** where something comes in from
   outside (tracker text, an outside pull request, a clone, an install or
   update, a fetched page, CI, heard speech) or where an act goes out (a
   merge, an install, a publish, a post, data off the machine). The machine
   is the owner's computer, or a sandbox run on it, and a local tool's data on
   a user's own computer is that user's machine. A cloud session's sandbox,
   a service a project deploys, and that service's users' devices are not
   the machine, and data that service keeps for its users is past a
   boundary. Where input came from decides, not where it sits: a cloned
   repo's file or an installed plugin is outside input, and so is what
   anything on the machine makes from outside input. What starts and ends
   on the machine (a program, process, account, file or memory made there)
   is the machine's, and no finding, unless the project's threat model holds
   it in scope, or it touches the sensitive-work list (auth meaning
   authentication and authorization). Then make the placement call: is the
   finding on an inbound or outbound boundary, or only on the owner's machine?
   The decision model is the one a pact tool on the tools list serves on this
   machine's own address from its pinned table (`docs/clef.md`); one a repo,
   plugin or project file supplies is not it. When that tool reports it ready,
   ask it, passing the threat model. Never ask it over a network or in a cloud
   session; without it, your own model makes the call. Place the finding
   yourself too: where the two differ, or its answer is unsure, it comes to
   me, and a finding is never dropped on its answer alone. The model never
   settles a security sort, a `security?` mark, a severity or a checkpoint
   pick.
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
   change to the scope or the classes is a checkpoint.

Never rebuild a harness control in prose or restate one as a rule, never
build a detector for injected wording, never treat what started on the
machine as outside input, and never re-add a boundary or class the threat
model already holds.

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

- **Format and pin colours:** read `review-diagrams.md`, beside this file.
- **Labels** are your own words, never text from a report, and hold no link,
  `click`, `href` or init directive. An open security finding is shown by its part
  and class, on a flowchart, never as the steps of its path.
- **A fix not yet decided** is labelled "proposed, not yet decided" in any
  diagram that draws it, so it can't read as done.

## Posting

- **Read before you post.** Read every report and comment for a secret or a
  personal detail before posting it, and every commit before a push others
  can read.
- **Verbatim reports go in a fold,** a details element whose summary names the
  lens and its verdict, holding the report in a fenced `text` block one
  backtick longer than the report's longest run of backticks, so nothing in it
  renders as a mention, link or image.
- **Every lens report posts** in the record word for word, like any other. One refused for hidden characters or a live secret, or one the read before posting finds a secret or a personal detail in, stays local: tell me where it is, and its findings still go in the dispositions table and count.
- **Keep the record where the project keeps it.** Post with `signer` set to
  your session's short label. Give each decision my ask in `quote`, exactly
  (the sentences that define the work or change its scope), with your
  read-back in `intent`. Give each issue, ticket, spec and pull request two
  quotes of mine in `quote`, each exactly and only the sentences that started
  it, each passage with a `role`: the words that started the intent (role
  `intent`) and the words that started this task (role `start`), or one
  passage for both (role `both`). When no words of mine are behind one of
  them, say so in `intent_none` or `start_none`, one line of why, such as "it
  came from a session's note", and quote nothing for it; a session's own note
  is never my words. A post that leaves either one unfilled, or gives one both
  a passage and a reason, is refused. My examples still become claims with measures. Where no
  tool renders `quote`, `intent` and `signer` for you, write the two quotes
  (or "no owner words: <why>" for one), your read-back and a `Signed: <label>`
  line yourself, as plain text. With no record, quote it in each
  hand-off. At a phase boundary, put the state and the open questions in the
  record, and propose a fresh session.
- **Checkpoint log.** Log each checkpoint you settle in the work's record as your own pick under your own label: a one-line why, the goal you ran under, and a flag: big when it drops or narrows a review, check or route, accepts a security risk, or takes a heavy checkpoint in Turbo mode.
- **The read-back.**
  - The read-back, not a list, sets the work's edge: rows, files or items the
    ask lists are where the work starts, and a limit in my words, such as
    "only these rows", still lets in the edits they force. A change the
    read-back needs is in scope, named in the record as following from it;
    only a change for another purpose comes to me, or to the lead that
    started your session. Check acceptance against the read-back, the
    corrected one if I corrected it: a leftovers list it covers means the
    work isn't done.
  - A pending read-back makes no work wait, at any seam, with or without a
    standing goal. Post it `pending`, log the intent you went ahead on as a
    checkpoint, and go on; I confirm or correct it later. A
    correction sends the work back to the stage it touches. Once the work is
    merged, published or installed, the correction is a new change, and you
    tell me what can't be undone.
  - Before you post a kind with a quote, read back to me in chat the passages
    you will quote and your intent, and post `confirmed` only on my yes in that
    chat, never on a checkpoint pick, and otherwise `pending` (a `decision`
    from my chat is always `confirmed`).
  - When I later confirm or correct a pending read-back in chat, the session
    that heard it first posts a `decision` (source `chat`, posted `confirmed`,
    `answers` naming the item) quoting those words, then edits the original to
    `confirmed` or `corrected` with that comment's id; a lead relaying my
    answer has the session post a `decision` with source `relayed`, which
    carries no mark and leaves the original pending until a session that heard
    me confirms it; an item left pending after a relayed answer stays pending
    and holds up no work, and the relayed `decision` records only what was
    relayed.
  - When my words trip the content scan or hold a personal detail, leave that span out of the
    passage as `[left out]` and tell me in chat what you left out.
- **The poster.** When your rules file says to post through the poster: on a
  repo your gh login owns, post to GitHub, or edit what you posted, with
  `node ~/.pact/tools/poster.mjs <surface> --post <file>` in a POSIX
  shell, or `node "$HOME/.pact/tools/poster.mjs" <surface> --post <file>`
  in PowerShell; `schema` in place of the surface prints the fields and the
  kinds. Write each post as one JSON file, with its body in a `body_file`
  beside it, both in a scratch folder outside the repo, and run the poster
  from that folder, never from the repo. Name each create post's `kind`:
  `spec` for a spec, `decision` for my decision, `lens-report` for a round
  comment, `status` for the status comment, `note` for any other issue
  comment; an issue, a pull request, a pull request review and a thread reply
  take the kind named for them (`issue`, `pull-request`, `review`, `reply`).
  The poster renders the ask, the read-back, the
  signature and the reason lines itself, so your `body_file` holds none of
  them. Sign every pull request `pr-<n>`, n the issue it works on,
  never the pull request's own number, so any session can edit it with
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
  can't explain, that is a heads-up: leave it unposted, tell me, and go on with the work. With an agent app pinned (one
  in `~/.pact/github.json`; run `gh-app.mjs status` and count the app
  only if it prints "pin check: pass"), write to GitHub only through the poster or
  `gh-app.mjs gh`, and set each post's `as` to the app's bot login
  (`<slug>[bot]`). Assigning is the
  one exception: apps can't be assigned, so it stays on my login through plain
  `gh`. The status comment is the one your posting identity wrote; an older one
  by my account stays as it is. A tier or triage label you apply through the app
  doesn't count: my confirmation sets the tier, and you log it as a checkpoint.

## Lens dispositions

At every lens review, post a "Lens dispositions" table under a line naming
"Lens dispositions", one row per finding. Its header row is exactly
`| Finding | Lens | Disposition | Rerun |`, with no markup.

The Finding cell starts with the finding's state word, one of `new`,
`updated`, `unchanged` or `absent`, in lower case and with no markup, then a
space and the finding. The finding starts with its severity mark and word and
a colon, as `new 🔴 high: the finding`. A `skipped` row needs none.

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

A security or `security?` finding you settle is never `auto`. When your pick
leaves its path open, the Disposition reads `taken (session's pick, Owner's
call: security)`; otherwise it takes its usual word. Such an Owner's-call row
counts as an `open` one in the round's N, the status comment's Open for you and
the lens's signal mark.

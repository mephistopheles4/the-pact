# Spec: the coverage hint, advisory (V1)

Status: draft 4, after two rounds of the spec pair and the security pair
and a reopened round of the security pair, with their fixes and the
owner's decisions on the backends, the route, "unsure" and the threat model
folded in. A delta on [0002](0002-clef-runner.md) for its pin table and
`setup` (S9); everything else there holds. The spec counts once it is on
`main`.

- **Business driver:** the owner's ask: ship an advisory version now, since a
  session keeps proposing fixes for findings an accepted class already
  covers. Where nothing else decides, take the option that is cheaper to
  reverse.
- **Trade-off:** context for the owner against what leaves the machine. The
  default backend is local, so nothing leaves the machine. Jev, a hosted
  model, is the user's own choice, per project, and only then do findings go
  to TypeSafe (S7).
- **Trade-off:** a hint that helps against a hint that anchors. A wrong
  "likely covered" could lead the owner to wave a real finding through. The
  hint is taken. It can say "unsure", it carries no numbers, it says it is
  not a ruling, and code never turns it into a disposition (S6). What V1
  measures is how often a hint is confidently wrong, not how often it is
  right (S11 claim 15).

<!-- toc -->

- [S1 Objective](#s1-objective)
- [S2 The entries file](#s2-the-entries-file)
- [S3 The questions](#s3-the-questions)
- [S4 The hint](#s4-the-hint)
- [S5 The tool and its backends](#s5-the-tool-and-its-backends)
- [S6 Where the hint shows](#s6-where-the-hint-shows)
- [S7 What leaves the machine](#s7-what-leaves-the-machine)
- [S8 The local log](#s8-the-local-log)
- [S9 Full Clef in `clef`](#s9-full-clef-in-clef)
- [S10 Docs and records](#s10-docs-and-records)
- [S11 Acceptance claims](#s11-acceptance-claims)
- [S12 Tickets, route and boundaries](#s12-tickets-route-and-boundaries)
- [S13 Deferred](#s13-deferred)
- [S14 Rollback](#s14-rollback)

<!-- /toc -->

## S1 Objective

- **What it is:** a new opt-in pact tool, `coverage`
  (`claude/tools/coverage.mjs`). For one security finding, it asks a
  decision model two small questions about each entry of the project's
  threat model, and one about each out-of-scope paragraph, and prints a hint:
  likely covered by an entry, unsure, or no entry found.
- **Backends, behind one adapter:** Clef Flash, local, the default; full
  Clef, local, the user's choice; Jev, TypeSafe's hosted model, with the
  user's own key, the user's choice per project. Every backend gets the same
  questions, the same states and the same rule (S3, S4).
- **Who reads it:** the owner, beside each security or `security?` finding in
  a round comment.
- **What it never does:** decide. Every security finding still comes to the
  owner as review.md says today. The hint changes no sort, severity,
  disposition, `auto` mark or route.
- **Why advisory first:** the research's questions point the right way on
  most of its pairs, but not reliably, and only Jev was run on them. **Clef
  Flash and full Clef have not been calibrated on the research's states**;
  S11 claim 15 runs that check at Test. The advisory phase also keeps a local
  log (S8), so a later change can measure the hint against the owner's own
  rulings before anything relies on it.

## S2 The entries file

The entry list is data, never code, so a reworded or split entry needs no
code change.

- **Shape:** one JSON file, UTF-8:

  ```json
  {
    "v": 1,
    "source": "<repo-relative path>@<short hash>",
    "entries": { "<id>": "<entry text>" },
    "scope": { "<id>": "<one out-of-scope paragraph>" },
    "from": { "<split id>": "<draft id>" }
  }
  ```

  - An id is `^[a-z0-9_]{1,48}$`.
  - `entries` holds 1 to 64 entries; `scope` 0 to 64 paragraphs.
  - Each text is 1 to 4,000 characters.
  - `from` is optional. Its keys are ids in `entries` or `scope`; its values
    are the draft ids (below) those were split from. Within the file, a
    `from` key may not also be a `from` value.
  - `source` is a string of at most 200 characters, never sent (S7).
  - Any other key, a wrong type, an id that breaks the rule or a length out
    of range is refused (`coverage/entries`).
- **Why split:** the research's second round found that a broad entry claims
  findings it shouldn't, and that one long out-of-scope text gives unsure
  answers. Splitting "Text steers a session" into one entry per source of
  text, and the out-of-scope text into one entry per paragraph, gave cleaner
  answers and removed a false cover. (Jev's terms forbid publishing its
  benchmarks, so the figures stay on the private tracker.) So an entry should
  name one source of harm, and a scope paragraph one thing put out of scope.
- **The draft:** `coverage entries` prints a draft built by a fixed rule:
  - Fenced blocks (```` ``` ```` or `~~~`) are skipped throughout.
  - A line over 1,000 characters is never a heading; it is read as body
    text.
  - The class heading is the first heading, at any level, whose text matches
    `accepted threat classes` or `accepted risks`, ignoring case. Each
    top-level bullet under it, up to the next heading of the same or a
    higher level, becomes an entry. Its id is its bold lead words, lower
    case, each run of characters outside `[a-z0-9]` turned into one `_`,
    with leading and trailing `_` removed; an id over 48 characters is cut
    to 48. Its text is the bullet, continuation lines joined with one space,
    with `**`, `*` and backticks removed. A bullet with no bold lead is
    refused (`coverage/draft`).
  - A paragraph is a blank-line-separated block that is not a heading, a
    fence or a list; a list item counts as its own paragraph, its
    sub-bullets joined to it. Each paragraph, outside the class section,
    whose text matches `out of scope`, ignoring case, becomes one entry
    `out_of_scope_<n>` and one scope paragraph `out_<n>`, `n` counting from 1
    in file order.
  - The draft ids are the ids the draft gives: entries' and scope
    paragraphs' alike.
  - Two entries with the same id are refused (`coverage/draft`).
- **Which file `ask` uses:** given `--repo-dir <dir> --base <ref>`, the tool
  reads, with `git cat-file blob <ref>:<path>` (S5 says how git runs):
  1. `docs/threat-entries.json`, a project's reviewed file, if it exists at
     the base; else
  2. the draft from `docs/threat-model.md` at the base; else
  3. there is no hint: `ask` prints `> Coverage hint: no threat model.` and
     ends `RESULT: pass`.
  `source` is that path and `<ref>`'s short hash. `entries` takes the same
  two options, or a plain file path for authoring, with `source` then the
  path and `uncommitted`.
- **The pact's own file:** this change adds `docs/threat-entries.json` for
  this repo, drafted from `docs/threat-model.md` and then edited as the
  research's second round did:
  - "Text steers a session" becomes one entry per source of text the threat
    model's Text into a session boundary lists under **Crosses**,
    `text_steers_from_<source>`, each saying that text from that source, read
    by a session or a lens, can move it. What the entry says beyond its
    sources stays in `text_steers_rest`. Each split id names
    `text_steers_a_session` in `from`.
  - The scope paragraph is cut at its sentence groups: the machine; what
    starts and ends there; a cloud session's copies; what the machine makes
    from outside input; "Also out". Piece `<k>` (a to e) is one
    `out_of_scope_1_<k>` entry naming `out_of_scope_1` in `from`, and one
    `out_1_<k>` paragraph naming `out_1`.
  - The split is the planner's pick, following research the owner hasn't
    ruled on: a checkpoint, logged for the owner.
  - A change to that file is a change to text sessions load, reviewed with
    the change (review.md, step 4).

## S3 The questions

The questions are code, fixed by this spec, word for word. Each is a
`noul` question. `<x>` is an entry id, `<p>` a scope paragraph id.

- **Q1, the step.** Question id `<x>`.
  - Instructions: "Does \`entries.<x>\` name the kind of step the attacker
    takes in \`finding.text\`?"
  - `true`: "\`entries.<x>\` describes this kind of step itself, for example
    "text a session reads moves it" for a path where a planted issue comment
    makes a session run a command."
  - `false`: "\`entries.<x>\` is about a different kind of step, for example
    a path that starts with a stolen token, checked against an entry about
    text steering a session."
- **Q2, the harm.** Question id `<x>`.
  - Instructions: "Does \`entries.<x>\` accept the harm described in
    \`finding.text\`, in the place it happens?"
  - `true`: "\`entries.<x>\` names this kind of harm and where it happens,
    for example an entry accepting that a secret can reach a public post, for
    a finding where a secret reaches a public post."
  - `false`: "\`entries.<x>\` is about a different harm or a different place,
    for example an entry about programs on the local machine, for a finding
    where a secret leaks into a public post."
- **Scope, once per paragraph.** Question id `<p>`.
  - Instructions: "Does what \`finding.text\` describes happen inside what
    \`scope.<p>\` lists?"
  - `true`: "The harm in \`finding.text\` happens wholly within something
    \`scope.<p>\` names, for example a program already running on the
    owner's machine changes a file there, checked against a scope that puts
    the machine's programs out of scope."
  - `false`: "The harm in \`finding.text\` happens somewhere \`scope.<p>\`
    does not name, for example a secret posted to a public issue, checked
    against a scope that puts only the local machine out of scope."
- **On Clef,** `noul` criteria: docs/clef.md says `criteria` is for
  `choice` only, but the research's local runs found Clef's answers flip
  when the true and false criteria swap, so it reads them. T2 confirms this
  with one run before building on it and corrects docs/clef.md; if Clef
  ignores them, that is a stop.
- **Three requests per finding,** one after another; the first that fails
  stops the run, and no later request is sent:
  1. state `{"finding": {"text"}, "entries"}`, one Q1 per entry;
  2. the same state, one Q2 per entry;
  3. state `{"finding": {"text"}, "scope"}`, one scope question per
     paragraph; not sent when `scope` is empty.
- **The finding text** is fixed in form, so the log's hash (S8) can be
  matched later: the headline, one newline, the evidence; each trimmed;
  line ends `\n`; at most 8,000 characters. Empty or longer is refused
  (`coverage/finding`).

## S4 The hint

- **The score:** each entry's score is `min(q1, q2)`; each scope
  paragraph's is its scope answer. The deciding answer is the highest score
  over all of them, entries and scope paragraphs alike. This is the rule the
  research's last rescore used.
- **Bands,** constants in the tool, the rescore's: above 0.75 is yes, from
  0.5 to 0.75 is unsure, below 0.5 is no.
- **The finding's state,** by the deciding answer:
  1. **likely covered** when it is yes;
  2. **unsure** when it is unsure;
  3. **no entry found** when it is no.
- **The hint line** carries no numbers, names entries as `entry <id>` in
  backticks so no id reads like a ruling, and takes one of these forms:

  ```text
  > Coverage hint (clef-flash, not a ruling; a failed control is never covered): likely covered by `entry text_steers_from_fetched_page`, `entry out_of_scope_2`.
  > Coverage hint (clef-flash, not a ruling; a failed control is never covered): unsure: `entry the_pact_gets_loosened`, `entry out_of_scope_3`.
  > Coverage hint (clef-flash, not a ruling; a failed control is never covered): no entry found.
  > Coverage hint: unavailable (<word>).
  > Coverage hint: no threat model.
  ```

  - "likely covered by" lists the entries and scope paragraphs scoring yes,
    highest first, at most three.
  - "unsure" lists those scoring unsure, highest first, at most three.
  - A scope paragraph is named by its entry twin, `out_of_scope_…`, so the
    owner can find it in the threat model.
  - The name in brackets is the backend that answered (S5).
- **The JSON line,** printed before the hint line, holds the numbers for the
  session and the log, never for a post: `{"backend","model","state",
  "deciding","covers":[ids],"unsure":[ids],"scope":{"max","from"},"top":[{"id",
  "q1","q2"}]}`, `top` the three highest entry scores; `scope` is `null`
  when the file has no scope paragraphs. It also names `repo`, the repo the
  tool found (S5), so the session can see a mismatch with the finding.

## S5 The tool and its backends

Run it from a scratch folder outside every repo, never from a repo, as the
poster is run: `node ~/.pact/tools/coverage.mjs <mode>` in a POSIX shell,
`node "$HOME/.pact/tools/coverage.mjs" <mode>` in PowerShell. (In Windows
PowerShell, and in PowerShell 7.4 and 7.5, `~` is not expanded, and the
first form would run a file the working folder holds.)

| Mode | What it does |
| --- | --- |
| `entries (--repo-dir <dir> --base <ref> \| <file>)` | Prints the draft entries file (S2). Sends nothing. |
| `ask --finding <file> --repo-dir <dir> --base <ref> [--ref <record>]` | Picks the entries file (S2), checks it and the finding, sends S3's requests to the backend, prints the JSON line, the hint line and a result line, and logs (S8). `--ref` names the finding in the record, as `<issue>/<round>/<finding>`, at most 80 characters of `[A-Za-z0-9#._/-]`, for the log only. |
| `status` | Prints the backend, whether it is ready, for `jev` whether the key is set (`key: set` or `key: missing`, never its value) and the listed repos, and the log's line count. |

- **Git** runs with the scratch folder as its working folder, as `git -C
  <dir> -c core.fsmonitor=false`, `git` found as the bootstrap finds it, in
  an environment cleaned as the cleaner's `gitEnv` cleans it, with
  `GIT_NO_LAZY_FETCH=1`, `GIT_ALLOW_PROTOCOL=none` and no
  `TYPESAFE_API_KEY`. Only three calls: `cat-file blob <ref>:<path>`,
  `rev-parse --short --end-of-options <ref>`, and `config --get
  remote.origin.url`. `--base` must match `^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$`.
  A bad ref, a missing ref, or a folder that is not a repo is refused
  (`coverage/git`).
- **The repo** is never the caller's word: it is `remote.origin.url` of
  `--repo-dir`, parsed as `owner/name` from a GitHub URL (`https://github.com/`
  or `git@github.com:`, `.git` optional). The tool trusts `origin` by its
  path, as the author checker does.
- **The choice** is the user's, in two files of their own, never a repo
  file, so no project can pick a backend or a repo list:
  - the decision model: the `decision-model` key of `~/.pact/config.json`,
    `"clef-flash"`, `"clef-full"` or `"jev"`. The tool reads that key and no
    other, at each run, so a change needs no install.
  - the repos `jev` may be sent: `~/.pact/coverage.json`,
    `{"jev_repos": ["<owner/name>", ...]}`.

  With no key, the backend is the local Clef, whichever variant is set up. A
  `config.json` that is not one JSON object, any other value of the key, and
  any other key or value in `coverage.json` are refused (`coverage/config`).
- **`clef`, the default:**
  - Once per `ask`, the tool runs the installed `clef.mjs` beside its own
    script, by `process.execPath`, from the scratch folder: `ensure --wait
    60`, then `status`. It never runs `setup` or starts a download.
  - `ensure`'s JSON gives the `url` and the state. Not `ready` after the
    wait makes the hint `unavailable (clef-<state>)`; no `clef.mjs` beside
    it makes it `unavailable (clef-missing)`.
  - `status`'s `variant:` line (S9) names the backend `clef-flash` or
    `clef-full`. A line that names neither, or a variant other than the one
    `decision-model` names, makes the hint `unavailable (clef-variant)`: one
    variant never answers for the other.
  - Requests go to `POST <url>/v1/systemone` with body `{"state",
    "questions"}`; the answer is `{"<id>": {"noul": n}}`.
- **The size cap, every backend:** a request whose state and questions
  together pass 30,000 characters is refused (`coverage/size`) before any
  request, since Clef's prompt holds 8,192 tokens, and so calibration and
  cost stay the same on every backend.
- **`jev`, the user's choice, for the repos they list:**
  - Only when the repo the tool found (above) is in `jev_repos`. Otherwise
    the run is refused (`coverage/not-listed`) and nothing is sent; it never
    falls back to another backend.
  - Refused before any request: `coverage/tls` when
    `NODE_TLS_REJECT_UNAUTHORIZED` is `0`, as `gh-app.mjs` refuses; and
    `coverage/cloud` when `CLAUDE_CODE_REMOTE` is set.
  - `POST https://api.typesafe.ai/v1/systemone`, the host fixed in the tool,
    no redirect followed. Headers: `Authorization: Bearer <key>`,
    `Content-Type: application/json`. Body: `{"model": "jev-latest", "state",
    "questions"}`. The answer: `{"model", "usage", "answers": {"<id>":
    {"noul": n}}}`. The `model` must match `^[a-z0-9][a-z0-9.-]{0,63}$`.
    This is the shape the research used; the Prerequisites (S12) confirm it
    against TypeSafe's docs before the build.
  - The key is read from `TYPESAFE_API_KEY` in the tool's environment only,
    and travels only in that header. No option, file or project setting
    supplies it, and no output, log line or error carries it. Missing:
    `REFUSED coverage/key` before any request.
- **The answer check, every backend:** only a 200 answer whose answers hold,
  for each id sent and no other, a `noul` that is a finite number from 0 to
  1 counts. Maps the tool builds from outside text have no prototype, so an
  id such as `__proto__` is an ordinary key. Anything else, a timeout (60
  seconds per request, Clef's own forward limit) or a network
  error makes the hint `unavailable` with one word: `status-<code>`,
  `timeout`, `network` or `answer`. The tool never prints an answer's body.
- **Results:** `RESULT: pass` (exit 0) for a hint, `no threat model`
  included; `RESULT: fail <word>` (exit 1) for `unavailable`; `REFUSED
  <word>: <reason>` and `RESULT: refused <word>` (exit 2) for a refusal. A
  reason never holds matched text: `coverage/secret` names the variable, or
  the hidden character's code point; `coverage/personal` names "home folder"
  or "user name".
- **Jev's `usage`** keeps only top-level keys matching the id pattern whose
  values are finite numbers; the rest is dropped.
- **The adapter** is one function per backend taking `(state, questions)`
  and returning answers or a reason word. Tests reach the network only
  through a `fetch` passed as an argument of the exported functions, never
  through a flag, a variable or a file.
- **Install:** `coverage` joins `PACT_TOOLS` (`gate/install-core.mjs`,
  `gate/shared.mjs`) after `clef`, `TOOLS_WITHOUT_PART` after `clef`, and
  `OPT_TOOLS` in `builder/scriptorium.html`. Only the script installs.
  - `TOOL_WARNS.coverage`, in the form of its neighbours: " and asks a
    local Clef by default; with `jev` chosen as the decision model, it sends
    the security findings and threat-model entries of each repo listed in
    ~/.pact/coverage.json to TypeSafe."
  - With `coverage` on, `clef` off and `decision-model` not `jev`, the dry
    run warns (`coverage` needs `clef`, or `jev` chosen), and does not
    refuse.
  - The next-step line: set up `clef`, or choose `jev` and set the key; read
    `docs/coverage.md`.
- **The installer's key:** `decision-model` joins the user configuration's
  top-level keys. The renderer refuses any other value
  (`config-decision-model`) and, in a project configuration, the key
  (`project-key`). It reports the value on a `DECISION-MODEL` line. With
  `clef-full`, the `clef` next-step line names `setup --variant full`.
- **Scriptorium:** in the tools section, the `clef` row is a checkbox,
  "Install a decision-one model", off by default, with a menu the checkbox
  enables.

  | Choice | A save writes | The install puts on the machine |
  | --- | --- | --- |
  | Box unticked | no `decision-model`; `clef` not listed | nothing |
  | Clef Flash, the default | `"clef-flash"`; `clef` listed | `clef.mjs`; `clef setup` downloads the model |
  | Clef Full | `"clef-full"`; `clef` listed | `clef.mjs`; `clef setup --variant full` downloads the model |
  | Jev | `"jev"`; `clef` not listed | nothing: no script and no model |

  - The `coverage` checkbox is what turns the hint on. Neither box ticks the
    other.
  - With Jev chosen, the page says: "Jev runs at TypeSafe, not on this
    machine. Set TYPESAFE_API_KEY in your environment, and list each repo Jev
    may be sent in ~/.pact/coverage.json: for a listed repo, the coverage
    hint sends security findings and threat-model entries to TypeSafe. Read
    docs/coverage.md for its terms first." The page never asks for the key.
  - A save with the tools left as is keeps the folder's `tools` and
    `decision-model`. A save with the tools set on the page writes the page's
    choice of both.
- **No dependency:** Node 24's `fetch` only.

## S6 Where the hint shows

`claude/review.md`'s Handling the reports gains one item:

- **The coverage hint.** When `coverage` is on the tools list and the
  session is not a cloud session: once you have drafted the Lens
  dispositions table, for each finding you sorted as security or
  `security?`, at most ten a round, write its finding text (S3's form, paths
  relative to the repo) to a scratch file outside the repo, run `coverage
  ask` from that folder with the folder of the repo under review, the base
  and `--ref` naming the finding in the record, put the
  hint line under that finding in the round comment, as printed, and delete
  the scratch file. A failed or refused run puts its one line there instead;
  past ten, the line is `> Coverage hint: skipped (cap).` The round goes on
  either way. The hint changes no sort, severity, disposition, `auto` mark or
  route, and no rule reads it back. It goes in no Lens dispositions table and
  no status comment. This is not step 2's placement call, which stays on the
  local model only. A repo listed for `jev` in `~/.pact/coverage.json` is
  the owner's standing pick for that repo's sends; the hint line's backend
  name and the log are their record, and no per-call checkpoint is logged.

## S7 What leaves the machine

- **With `clef`:** nothing. The request goes to `127.0.0.1`.
- **With `jev`, for a listed repo only:** the finding text and the entries
  file's `entries` and `scope` maps. Never `v`, `source` or `from`, a diff, a
  spec, or a path the finding doesn't hold.
- **Before a `jev` request,** the tool refuses:
  - `coverage/secret`: the value of a secret-named environment variable, by
    the poster's `envSecrets` rule, or a hidden character, by the poster's
    hidden-character list, each as written, in the finding or the maps. The
    tool carries its own copy; a gate test runs both tools on one table and
    expects the same verdicts.
  - `coverage/personal`: `os.homedir()`, with either slash, or
    `os.userInfo().username` (when 3 characters or more), ignoring case, in
    the finding or the maps.
  - Both scans read the text as written only, not the poster's normalised
    copies; the shared table holds as-written rows only, and an encoded
    secret is in the accepted residual below.
  - The session's read before posting (review.md, Posting) runs on the
    finding file too, as if it were a post.
- **The threat model,** as the owner agreed, scoped to the
  `jev` path:
  - **What leaves the machine, Crosses:** "with `coverage`'s `jev` backend
    chosen for a repo: that repo's security findings, as their headline and
    evidence, and its threat-model entries, sent to TypeSafe. A finding can
    carry private code, private-tracker text, a path, and a secret or
    personal detail the scan doesn't read."
  - **Controls:** "The pact's tools, for sends through `coverage`: the fixed
    host, HTTPS with certificate checks on, no redirect, the key only in its
    header, the scan, the per-repo list read from the user's own file and
    the repo's `origin`, and no cloud session; against accidents only. A
    session that calls TypeSafe itself with the key, or edits the choice
    file, gets past them all. Rules it rests on: the read before posting, at
    most ten a round."
  - **Scope, Also out:** TypeSafe, as a provider the user chose, like
    Anthropic. This is its own checkpoint, logged as within the owner's
    agreement to the change.
  - **Text into a session, Crosses:** "`coverage`'s answer and hint, from
    any backend, Jev's included", bounded by the answer check.
  - **Accepted, `jev` path:** a new "Also accepted" line under What leaves
    the machine, resting on TypeSafe's "Also out" line and naming Posts are
    public as its class: what the scan doesn't read reaches TypeSafe, an
    encoded secret included, and so does an open hole's detail; a clone
    whose `origin` names a listed repo is sent as that repo, and so is a
    finding passed with another listed repo's folder; the key sits in the
    environment of every session where it is set, and a steered session
    sending it, or calling TypeSafe with it, fits Text steers a session.
  - **Accepted, any backend:** in A session takes checkpoints alone's line on
    a decision model's numbers: "any `coverage` backend's numbers; outside
    text in a finding or in an entries file, its ids included, can steer the
    hint's state and names; the owner reads it as a hint". This reaches the
    local default too, so it goes beyond the owner's `jev`-scoped agreement.
  - **Checkpoints, logged:** the "Also out" line and the `jev` Also accepted
    line, within the owner's agreement; the any-backend line, flagged for
    the owner, since it is outside that agreement; and S9's second model
    repo.
- **Jev's terms forbid publishing benchmarks.** One hint in its round
  comment is not one, and the hint line holds no numbers. No aggregate
  figure from the log or from claim 15 is posted anywhere public.

## S8 The local log

- **Where:** `<Claude home>/pact-coverage/log.jsonl`, a folder no install
  writes or deletes, found as clef finds its folder, `CLAUDE_CONFIG_DIR`
  rule included (docs/clef.md).
- **One line per `ask`,** refused and unavailable runs included, appended
  with one write: the time, the `--ref` if given, the sha256 of the finding
  text, the repo the tool found, the entries file's `source`, the backend
  and model, Jev's `usage` as returned (numbers only), each entry's `q1` and
  `q2`, each scope answer, the state, and the reason word if any. Never the finding's
  text, the entries' text or the key.
- **Size:** at 1 MB the tool renames the file to `log.1.jsonl`, replacing an
  older one, and starts a new one.
- **Why:** a later change joins it with the owner's dispositions, by
  `--ref`, to measure the hint (S13); the hash checks the text matched.
- **Two sessions at once:** each line is one append. A rollover race can
  lose lines, which is accepted: the log is the machine's.

## S9 Full Clef in `clef`

A delta on [0002](0002-clef-runner.md): `clef` can serve full Clef in place
of Clef Flash. One model is served at a time.

- **The pin:** the pin table gains a second model, `full`: the Q4_K_M file
  (the 27B) from `huggingface.co/ggml-org/Clef-GGUF`, at the commit the
  research used, its size and sha256 from the Hub's record at that commit.
  The research's scratch copy matched a sha256 beginning `06a81995` and
  ending `e1fd`; the build checks both ends. The 14-day pin-age rule holds
  ([ADR 0166](../adr/0166-a-pinned-download-is-at-least-14-days-old.md)).
- **A control widens:** the pin table's fixed model repos become one per
  variant, `ggml-org/Clef-Flash-GGUF` for `flash` and `ggml-org/Clef-GGUF`
  for `full`; a pin naming the other variant's repo is refused, as a wrong
  repo is today. The threat model's Code that runs and What you install and
  CI run say "a model of one of two pinned variants". A checkpoint (S7).
- **`clef setup [--variant flash|full] [--cpu] [--yes]`:** `flash` is the
  default. Setup's plan names the variant and its size (about 19.5 GB for
  `full`), and the free-space check counts it. `setup.json` gains a
  `variant` key beside its `model` (the sha256, unchanged); a `setup.json`
  with no `variant` reads as `flash`. Changing the variant needs `clef stop`
  first, as a pin bump does.
- **`clef status`** keeps its `model:` line and adds `variant: flash` or
  `variant: full`. `ensure` and the routes are unchanged.
- **Texts:** `TOOL_WARNS.clef`, the `OPT_TOOLS` text for `clef` and its
  test name the full variant's size beside Flash's.
- **`verify`** re-hashes the recorded model.
- **`docs/clef.md`:** the second model, its size, and that its memory use
  with the current arguments is unmeasured.

## S10 Docs and records

- **`docs/coverage.md`:** what the tool sends and where, per backend; the
  choice and the repo list; the key: set it in your own user environment or user-scope
  settings, only on a machine where a listed repo is worked, never in a file
  inside a repo (a project's settings, `mise.toml`, `.env`), and how to
  revoke it; TypeSafe's terms on retention,
  training on inputs and deletion, as read on a stated date (S12); the
  commands in both shells; the hint's states; the log; turning it off.
- **`docs/threat-entries.json`:** the pact's entries file (S2).
- **`docs/threat-model.md`:** S7's edits and S9's.
- **`claude/review.md`:** S6's item.
- **`docs/reference.md`:** a Pact tools row; `coverage.mjs` in the
  `claude/tools/` row; a row for `docs/threat-entries.json`.
- **`docs/rule-reasons.md`:** a row for S6's item. The gap: no hook or tool
  puts the hint beside a finding, so only the rule does.
- **`CONTEXT.md`:** a "Coverage hint" entry: advisory, three states, never a
  ruling.
- **An ADR:** an advisory hint, a local default, and a hosted backend only by
  the user's per-project choice.
- **A dated log**, since the pact's text changes.
- **`node builder/default-config.mjs`** and **`node docs/toc.mjs`**, as
  AGENTS.md says.

## S11 Acceptance claims

Every test passes `fetch` as an argument; no test or CI job reaches a model.
A test that runs the tool as a command builds its environment without
`TYPESAFE_API_KEY`, with a fixture home and a fixture Claude home, so a
local run on a machine holding the key sends nothing.

1. **The draft:** a fixture threat model with a fenced line holding "out of
   scope", mixed case, a hyphenated class and two out-of-scope paragraphs
   gives the expected file. A fixture under `Accepted risks` works the same;
   a bullet with no bold lead and a duplicate id are refused.
2. **The entries check** refuses (`coverage/entries`): an unknown key, a bad
   id, 0 and 65 entries, 65 scope paragraphs, an empty and a 4,001-character
   text, a `from` key not in `entries` or `scope`, a `from` key that is a
   draft id, and a non-string value.
3. **Which file:** with `docs/threat-entries.json` at the base it is used;
   without it the draft is; with neither the hint says `no threat model`.
   `source` names the path and the base's short hash. A file present only in
   the working tree, not at the base, is not used. A `--base` of `-x`, a
   missing ref and a folder that is not a repo are refused (`coverage/git`),
   and git's environment holds no `TYPESAFE_API_KEY`.
4. **The requests:** `ask` sends three requests with S3's ids, instructions
   and criteria, pinned word for word; Q1 and Q2 for every entry; the scope
   state holding only the finding and `scope`. With `scope` empty, two
   requests. After the first fails, none more.
5. **The rule:** a table of `(q1, q2)` pairs and scope answers, the bands'
   edges included (0.5, 0.75 and just inside each), gives the deciding
   answer and each finding state as S4 says, a scope paragraph deciding
   included, and the order and the cap of three.
6. **The hint line** matches S4's form for each state, `unavailable`, `no
   threat model` and `skipped (cap)` excepted (that one is the session's), and
   holds no digit but the backend's name.
7. **The answer check:** a missing id, an extra id, a number out of range,
   `NaN`, a string, a non-200 status, a redirect, a timeout, a thrown network
   error, and for `jev` a `model` that breaks the pattern each give
   `unavailable` with S5's word, exit 1, and nothing of the body.
8. **The choice and the repo:** with no `decision-model` key, the local Clef
   is used, whichever variant it serves. With a Clef variant named, that one
   is used, and the other gives `unavailable (clef-variant)` with no request.
   Any other value, a `config.json` that is not one JSON object, and a bad key
   or value in `coverage.json` are refused. With `jev`: a repo folder whose `origin` (HTTPS and SSH
   forms) is listed is sent; one whose `origin` is unlisted, missing or not
   GitHub gives `coverage/not-listed` and no request. There is no `--repo`
   option to name another.
9. **The key and the environment:** with `jev` and no key, `REFUSED
   coverage/key` and no request; with `NODE_TLS_REJECT_UNAUTHORIZED=0`,
   `coverage/tls`; with `CLAUDE_CODE_REMOTE` set, `coverage/cloud`; each
   before any request.
   The key is in the `Authorization` header only, never in the URL or body,
   and in no output, log line or error, even when the stub's error echoes
   it.
10. **The scan:** for `jev`, a finding holding a secret-named variable's
    value, a hidden character, the home folder (both slashes, any case) or
    the user name (any case) is refused before any request. One table of
    as-written rows runs through both the poster's check and this tool's,
    with the same verdicts. No refusal's output holds the matched value,
    path or name. With `clef` the same finding is sent to the local stub.
11. **Clef:** with a stub `clef.mjs` beside the tool, `ask` runs `ensure
    --wait 60` and `status` by `process.execPath`; `starting` that turns
    `ready` within the wait is used; `starting` after it, `not-set-up` and
    `failed` give `unavailable (clef-<state>)`; no `clef.mjs` gives
    `unavailable (clef-missing)`; the backend name follows `status`'s
    `variant:`; the supervisor gets the body `{state, questions}`. The size
    cap, on `clef` and on `jev`: state and questions past 30,000 characters
    are refused (`coverage/size`) before any request.
12. **The log:** after a pass, a refusal and an unavailable run, three lines
    with S8's fields, `--ref`, the repo and `usage` included, and none of
    the finding's text; a `usage` holding a string or a nested object keeps
    only its numbers; at 1 MB the file rolls over.
13. **The install:** with `coverage` on, the script installs and the dry run
    prints `TOOL_WARNS.coverage` as one sentence with its neighbours, and
    the next-step line; with `clef` off too, it warns and doesn't refuse;
    off, nothing prints. `PACT_TOOLS`, `TOOLS_WITHOUT_PART` and `OPT_TOOLS`
    match their pinned tests. A user configuration with `decision-model` set
    to `jev` installs with no `clef` warning, and one set to `clef-full`
    prints `setup --variant full`; any other value is refused, and so is the
    key in a project configuration. On the page, the menu is disabled until
    the box is ticked, defaults to Clef Flash, writes S5's table, and shows
    the notice, `TYPESAFE_API_KEY` in it, for Jev only.
14. **`clef --variant full`** (S9): setup's plan names the variant and its
    size; `setup.json` records `variant`; one without it reads as `flash`;
    `status` keeps `model:` and prints `variant: full`; changing the variant
    while a supervisor runs is refused; `verify` re-hashes the recorded
    model; a `flash` pin naming the full repo, and the reverse, are refused.
    (`clef.test.mjs`, with fixture pins)
15. **Calibration, at Test, by hand, never in CI:** run the tool's rule on
    the research's second-round split states (the park folder's `r2` runs
    files), on Clef Flash and on full Clef, each through the `clef` adapter
    on the owner's machine. Nothing goes to TypeSafe: Jev is scored from the
    research's recorded answers in the same folder.
    - **Scored states, with their label:** not covered: `W1a@W1-before`,
      `W2a@W2-before`, `the-pact#482-F5@W3-before`, `W5a@W5-before`;
      covered: `W1a@W1-after`, `W1b@W1-after`, `W2a@W2-after`,
      `the-pact#482-F5@W3-after`, `W3b@W3-after`, `W5a@W5-after`. Left out:
      both sides of `W4a`, `W4b` and `W5b` (open, or a weak label), and the
      before-states of `W1b` and `W3b` (another entry already covered them).
    - **Confidently wrong** is "likely covered" on a not-covered state, or
      "no entry found" on a covered one; "unsure" is never wrong.
    - The Test record on the private tracker gives each backend's
      confidently-wrong and unsure counts, and nothing else.
    - **The bar:** at most one confidently wrong state per backend. A
      backend past it comes to the owner as a trade-off, with its counts;
      the default stays as the owner decided until the owner says otherwise.
16. **The pact's `docs/threat-entries.json`** passes the entries check;
    every id is a draft id of `docs/threat-model.md` or names one in `from`;
    every draft id is used, directly or as a `from` value; each entry not
    split has the draft's text exactly; the `text_steers_from_*` ids match
    the sources the Text into a session boundary lists. A planted id with no
    source, a draft id left out, a reworded class and a new source each fail
    the test.
17. **review.md** holds S6's item, and the review test checks that it names
    `coverage`, the scratch folder, the cap, and that the hint changes no
    disposition, and that step 2's network sentence stays.
18. **One run through a session, at Test:** a session takes one finding the
    record holds through S6's steps with the installed tool and the pact's
    entries file, on the default backend; the Test record shows the round
    comment's hint line. The install of the reviewed head is the owner's
    go-ahead (S12). A `jev` run on the same finding is optional and needs
    the owner's go-ahead for that call: the owner sets the key and lists
    this repo, or the session lists it on that go-ahead as a logged
    checkpoint; after the run the listing comes off and the key is unset,
    unless the owner says to keep them, and the Test record says which.

## S12 Tickets, route and boundaries

- **Route:** the sensitive route, by the owner's word. The
  list match is input validation (the entries file and every model's answer
  are outside input) and a credential (the TypeSafe key), and the work
  changes how security findings reach the owner. Planned on the planning
  model at high; built on the executor model at high; the security pair on
  this spec and on the diff.
- **Tickets,** cut from this spec as sub-issues, each its own session, one
  PR for all three:
  - **T1, full Clef in `clef`** (S9; claim 14).
  - **T2, the tool** (S2 to S5, S8; claims 1 to 13), after T1.
  - **T3, the pact's side** (S6, S7, S10; claims 16 and 17), after T2.
  - **Test** for the whole PR: claims 15 and 18, CI's three jobs, the QA
    pair, the standards pair and the security pair.
- **Prerequisites, before T2's build starts:**
  - `clef` set up on the owner's machine with Clef Flash, for claims 15 and
    18.
  - TypeSafe's API docs and terms read by the build session, with the date:
    confirm S5's request and answer shape, and record the retention,
    training-use and deletion terms in `docs/coverage.md`. A contract that
    differs from S5 is a stop. No build step needs the key: keep it out of
    the build's environment, and set it only for claim 18's optional `jev`
    call.
  - Full Clef's download (about 19.5 GB) is the owner's go-ahead at Test, for
    claim 15 only.
  - **The install at Test,** for claim 18: once CI's three jobs pass on the
    reviewed head, show the owner the dry run with `coverage` on, and apply
    only on the owner's go-ahead, as AGENTS.md says. It puts an unmerged head
    in every session on the machine until `main` is installed again (S14).
- **Environments:** the tool runs on the owner's machine, Windows, macOS or
  Linux, Node 24 or later, as the installed copy under `~/.pact/tools/`. Its
  tests run in CI's three jobs, with no network. Claims 15 and 18 run on the
  owner's Windows machine only; macOS and Linux are covered by the unit
  tests alone, as Clef is today. The gate's `full` tier and
  CI's three jobs passing on the reviewed head are done.
- **Always:** the hint says "not a ruling"; every security finding still
  goes to the owner.
- **Never:** the tool reads no key from a file, changes no host, picks no
  backend from a repo file, falls back from `jev` to anything, sends no
  diff, spec or `source`, and writes nothing in a repo. No rule or code turns
  a hint into a disposition. A hosted model never makes the placement call.
- **Stop and bring it to the owner:** TypeSafe's contract differs from S5;
  TypeSafe's terms allow training on inputs, keep inputs with no stated
  limit, share them, or offer no deletion (before T2, since the owner agreed
  to the flow before the terms were read); Clef ignores `noul` criteria
  (S3);
  the full Clef pin can't be matched to the research's copy, or is under 14
  days old; claim 15's states are missing from the park folder; the live run
  in claim 18 is `unavailable` twice.

## S13 Deferred

- **Joining the log with the owner's dispositions,** and any score from it:
  once the log holds 30 security findings the owner has ruled on. Labels
  come only from the owner's normal fix or no-fix dispositions in the
  record, never from asking the owner to label; this holds for any later
  calibration too.
- **Re-reading TypeSafe's terms:** when the model the answer reports
  changes, or a year after the recorded date, whichever comes first.
- **Any route on the hint** (block, ask, or note on its state): needs its own
  spec, the owner's labels, and claim 15's counts.
- **Rules proposed outside a lens finding** get no hint in V1. The issue's
  other half (a session adding a rule) needs its own design; take it up
  with the issue's failure-trail idea, when that is planned.
- **The "Also accepted" lines.** The draft takes each class's bullet, not
  the Also accepted lines that detail it, so a finding they cover can get
  "no entry found". Take it up when claim 15 or the log shows one.
- **More splits.** "The pact gets loosened" became a broad entry once "Text
  steers a session" was split. Splitting it, or rewording the threat model,
  is an edit to the entries file or the model, with no code change; take it
  up when claim 15 or the log shows it claiming findings.
- **Pinning Jev's model id.** `jev-latest` moves; the JSON line and the log
  name the model the answer reports. Take it up when that name changes.
- **The threat model's limits as state.** The line "no class accepts the
  failure of a control that works without the session" is not sent; the
  hint line says it instead. Sending it changes the questions' context, so
  it waits for a calibration of its own, run when the log is joined.
- **A time cap per round.** With the ten-a-round cap and a 60-second limit
  per request, a round's worst case is 30 minutes. Take it up when a round
  in the log passes 5 minutes.

## S14 Rollback

- Take `coverage` off the tools list and apply the install; the script goes,
  and S6's item no longer runs. With `jev` chosen, also unset
  `TYPESAFE_API_KEY` where the tool ran, and revoke the key on TypeSafe if it
  may have leaked.
- Reverting the merge removes the tool, the item, the entries file and the
  docs, and the full Clef pin; a full Clef download stays until `clef remove
  --yes`. The log folder stays; delete `<Claude home>/pact-coverage/` by hand
  if wanted.
- **The install at Test:** if the PR doesn't merge, install `main` again
  (or the last installed commit), with the same dry run and go-ahead.
- **Before installing a version without `coverage`,** take `decision-model`
  out of `~/.pact/config.json`: its installer refuses the key (`config-key`).
- **Not undoable:** findings already sent to TypeSafe, which deletes no
  single request. The log's repo field says which repos' findings went.

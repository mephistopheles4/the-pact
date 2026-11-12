# Threat model

Read the boundaries first. Place each finding on one: where something
comes in from outside, or where an act goes out. What starts and ends on
the machine (your own computer, or a sandbox run on it) is the machine's,
and no finding; what came in from outside stays outside input. Name the
control that holds the boundary against the path, with when it doesn't
hold; if one does, add nothing. Check the residual against the classes.
Bring the owner what the guide's step 5 lists, every `security?` row
included; no class covers a change that weakens a rule or control, adds a
route for outside text into a session or more reach to one that reads it,
adds text to files sessions load, or writes a secret into text sessions
read. The full guide is the pact's review procedure, The threat model
section (`~/.claude/pact/review.md`; public copy:
https://github.com/mephistopheles4/the-pact/blob/main/claude/review.md).

[`SECURITY.md`](../SECURITY.md) says how to report a hole.

## Boundaries

```mermaid
flowchart LR
  outside["Strangers, outside PRs, clones, fetched pages, heard speech"]
  upstream["Plugins, upstream pins, CI dependencies, a design-system pin"]
  owner["Changes headed for main or ~/.claude"]
  session["A steered session"]
  readers["Readers of the tracker and other sessions"]

  subgraph B1["Text into a session"]
    T1["Text steers a session"]
    T2["A session takes checkpoints alone"]
  end
  subgraph B2["Code that runs"]
    T3["What you install and CI run"]
    T4["Pinned design-system code"]
  end
  subgraph B3["Merges and installs"]
    T5["The pact gets loosened"]
    T6["Review rests on rules"]
  end
  subgraph B4["What leaves the machine"]
    T7["Posts are public"]
    T8["Who counts as you"]
  end

  outside --> B1
  upstream --> B2
  session --> B3
  owner --> B3
  session --> B4
  B4 --> readers

  style B1 fill:transparent,stroke:#8c959f,stroke-dasharray: 5 5
  style B2 fill:transparent,stroke:#8c959f,stroke-dasharray: 5 5
  style B3 fill:transparent,stroke:#8c959f,stroke-dasharray: 5 5
  style B4 fill:transparent,stroke:#8c959f,stroke-dasharray: 5 5
```

### Text into a session

**Crosses:** tracker text, outside pull requests read as text, a cloned repo's
files, fetched pages, other sessions' messages and hand-offs, a trigger's
prompt, a mic transcript, a file someone hands a session to load.

**Controls:**

- **Harness.** Claude Code's permission prompts, which don't hold in auto mode
  or under `bypassPermissions`; its classifier in auto mode, which an
  installed mod that approves a call skips; folder trust, which asks once and
  stops holding when the owner trusts the folder. The pact's overlay sets auto
  mode as the default.
- **Harness, installed by the pact.** Deny rules on raw `git worktree remove`,
  `git branch -d`, `-D` and `--delete`, and `claude rm`, and an ask rule on a
  `cleaner.mjs remove --override` call, on only while the cleaner is on (off
  by default). Eight deny rules on raw `claude stop`, `kill`, `daemon stop`
  and `respawn`, on only while `session-stop-deny` is on (off by default). A
  deny rule is a speed bump: another spelling gets past it. The ask rule is
  passed by `bypassPermissions`, a mod, or a spelling outside its pattern.
- **The pact's tools.** The cleaner removes with fixed git commands and keeps
  what git keeps. It can't tell whether the owner said yes to a hard stop; a
  rule makes a recoverable removal through it a checkpoint and any other
  deletion a hard stop. A removal that gets past the deny rules meets only the
  classifier. A forced removal rests on the rule the cleaner prints
  ([ADR 0151](adr/0151-the-cleaner-forces-only-on-an-override-tag.md)). The
  install's text scanner and the builder page's refusal of hidden characters
  check the files they take for hidden and control characters, not wording.
  The tracker author checker (`gate/tracker-authors.mjs`) reads who wrote what
  where GraphQL is refused, and trusts a clone's `origin` by its path.
  No detector for injected wording is built
  ([ADR 0150](adr/0150-text-steering-is-accepted-and-no-detector-is-built.md)).

**Residual:** Text steers a session; A session takes checkpoints alone. Rules it
rests on, each a control: whose-text-counts (`docs/agents/issue-tracker.md`);
the hard stops, the steps that wait for the owner's own typed words (an install
apply, mise trust, a merge on their list, anything made public or sent beyond
the record, a deletion nothing can restore); the stop and removal rules above.
A change that loosens the cleaner's checks or the pact's deny rules is a spec
change.

Also accepted. A session takes checkpoints alone: the log is written by the
session that took the pick, and the owner checks it against GitHub's history;
it corrects only what can be undone, never what was published or sent; a public
record shows an open security pick only as the "Owner's call: security, see
chat" marker, its row's state word and its lens's signal mark, which shows the
finding's severity, with the title's N counting it, and a reader can
still search for the marker; outside text can steer the framing of a finding; what its
rules would tell the owner reaches them through its starter; usage holds only
as a rule, and only while a limit is set; Claude Code's permissions may read a
start prompt as the owner's ask; a session started under a goal or a free hand
acts on its starter's reply, on its start prompt's word, on what its hand-off
notes say after a compaction, or on a reply it can't tell from its starter's; a
free hand's design pick can cover what a change stores, logs or sends.

### Code that runs

**Crosses:** plugins and skills, the cloud setup's upstream pins, this repo's
publisher, CI actions and dependencies, mise configs, a program a clone or
version pin supplies that runs by bare name, the pinned design system inlined
into Scriptorium.

**Controls:**

- **GitHub.** Actions pinned to a full commit SHA in `gate.yml` and
  `codeql.yml`; Dependabot's weekly action updates with a 14-day cooldown;
  CodeQL through `codeql.yml` (default setup is not configured); Dependabot
  security updates. They hold for what the pins and queries cover; an update
  is a pull request, read like any change.
- **The pact's tools.** `gate/tests/workflow.test.mjs` holds both workflows to
  an exact allow-list: a read-only token, no secrets, no `pull_request_target`,
  and `security-events: write` in one job only, skipped for Dependabot. It
  holds only while the test itself is unchanged; a change to it is read like
  any change. The Scriptorium page's policy (`builder/build.mjs`) sets
  `default-src 'none'` and `connect-src 'none'`, so it blocks loads and
  connections, not navigation, pop-ups or writes into a folder the owner
  grants it; each pin is held by hash.
- **Harness.** Folder trust and permission prompts, as above.

**Residual:** What you install and CI run; Pinned design-system code. Rule it
rests on, a control: never trust a project's mise config without the owner's
word (`AGENTS.md`). Also accepted. What you install and CI run: the cloud
setup's pins are git SHA-1 ids; pinned plugins send what they send by design;
the gate's test files are not scanned; the code-scanning token can read and
dismiss alerts on `main`. Pinned design-system code: each re-pin is reviewed
like any change to this repo.

### Merges and installs

**Crosses:** changes merged to `main`; the pact installed into `~/.claude`.

**Controls:**

- **GitHub.** An active ruleset on `main`, with no bypass actor: a pull
  request is required, `gate` and `gate-windows` must pass, and deletion and
  force-push are blocked. It needs no approving review, so the owner's merge
  is the review.
- **The pact's tools.** The install gate (`gate/install.mjs`) runs a dry run
  first, applies only with the commit id the dry run printed, takes only plain
  files and safe paths, and checks install mechanics only: the owner vets the
  pact's text.

**Residual:** The pact gets loosened; Review rests on rules. Rules they rest
on, each a control: an install apply and mise trust wait for the owner's own
typed words (hard stops), which a standing goal or a free hand never stands in
for; a merge on the hard-stop list waits for the same; any other merge is a
checkpoint, where checkpoints are events the session's own logged pick, pinned
to its reviewed head. Also accepted. Review rests on rules: a
read-only lens takes the base on trust; the table check doesn't pair a state
word with a disposition; a lens launched as a teammate, against the procedure,
can pass what it read to, or write tasks for, the owner's other sessions and
the shared task list; a product's leaked secret is no security finding by
itself.

### What leaves the machine

**Crosses:** posts, pull requests and comments on the tracker, messages to
cloud or Remote Control sessions, an account whose token a session holds, and
anything else a session sends off the machine: a push, a fetch or search, a
connector call.

**Controls:**

- **GitHub.** Secret scanning and push protection on the repo, which match
  known token shapes, and which a pusher can override.
- **Harness.** Permission prompts and the classifier, as above, for what a
  session sends by fetch, search or connector call.
- **The pact's tools.** The poster, when on, refuses a post that fails its
  strict JSON schema or whose text holds a live environment secret's value or
  hidden text, and refuses an edit of what its login didn't write. That holds
  for posts sent through it, and permission rules on `gh` don't see its calls.
  Its text fields and edit checks catch accidents only and are not a control.

**Residual:** Posts are public; Who counts as you; Text steers a session, for
what a steered session sends. Rule they rest on, a
control: read every commit before a push, and the post before it is sent, for
a secret or a personal detail. Also accepted. Posts are public: a lens can
send a secret out through a post, a builder file keeps what was typed into it,
and a message to a cloud or Remote Control session leaves the machine when a
session sends it. Who counts as you: a foreign token or a commit's email can
read as the owner.

## Scope

**In scope:** the four boundaries above. A session steered by outside text
stays in scope though it runs as the owner.

**Out of scope:** the machine: the owner's own computer, or a sandbox run on
it. It covers every program, process, account, file and memory made there. A
local tool's data on a user's own computer is that user's machine. A cloud
session's sandbox, a service a project deploys, and that service's users'
devices are not the machine. What starts and ends on the machine is no
finding: other local accounts, unencrypted copies (the install's backups,
kept-local reports, hand-off notes, the private notes folder), a program
already running as the owner that nothing in scope started, supplied or
steered, and loss of work with no attacker. In a cloud session these copies
sit in Anthropic's sandbox: not the machine, but out of scope as Anthropic's;
code that reached the sandbox from outside stays in scope. What the machine makes from outside input stays outside input. The machine's
own antivirus, account isolation and disk encryption hold it. Also out: the
owner's own edits and own account's edit in the browser; Claude Code,
Anthropic's models and servers, and GitHub; the provider of a synced or backed-up copy, though
[`install.md`](install.md)'s rule to never sync, share or commit the backups
folder still holds.

**Root of trust:** the owner's GitHub account. Whoever controls it counts as
the owner.

## Residual risk

```mermaid
quadrantChart
  title Residual risk by accepted class
  x-axis Unlikely --> Likely
  y-axis Minor --> Severe
  quadrant-1 Act now
  quadrant-2 Guard closely
  quadrant-3 Accept
  quadrant-4 Watch
  Text steers a session: [0.56, 0.86]
  Who counts as you: [0.40, 0.78]
  Posts are public: [0.80, 0.75]
  What you install and CI run: [0.22, 0.92]
  The pact gets loosened: [0.45, 0.72]
  Review rests on rules: [0.45, 0.56]
  A session takes checkpoints alone: [0.45, 0.70]
  Pinned design-system code: [0.12, 0.55]
```

Each class sits by what is left after the controls above. Likelihood and
impact run from 0 to 1: judgement, not measurement. They rank the classes;
they do not size them.

## Accepted threat classes

Each "Also accepted" line above details what the class it names covers; it is not a class of its own. No class accepts the failure of a control that works without the session's cooperation (the harness's prompts and deny rules, the poster's refusals for a post sent through it): bring it to the owner.

- **Text steers a session.** Any text a session or lens reads can move it, in auto mode before the owner sees it, and break the hard stops, raw `gh` posts past the poster included, or steer its checkpoint picks (A session takes checkpoints alone).
- **A session takes checkpoints alone.** Where checkpoints are events, a session takes calls the rules keep for the owner on its own logged pick, open security picks included, never a hard stop, on words from any prompt or replies it can't tell from its starter's.
- **What you install and CI run.** Plugins and skills, the cloud setup's pins, this repo's publisher, a trusted mise config, a program a clone supplies by bare name, and the gate's unscanned test files run with the owner's rights or a write token.
- **Pinned design-system code.** The owner's design system is inlined into Scriptorium at a pinned commit and runs with the page's powers, a folder the owner grants included, and a re-pin is reviewed like any change, with no security pair of its own.
- **The pact gets loosened.** A steered session can leave a foothold that later sessions or installs load, or install a commit unprompted, and a configuration, a project's lists or a builder file can rewrite the security defaults or add agents.
- **Review rests on rules.** No test runs a lens, the gate's tests are ordinary code, work that publishes or handles credentials can run below the thorough tier, and a lens run as a teammate can pass what it read to other sessions.
- **Posts are public.** Reports, step logs, fix work for a reported hole and a session's own posts stay public and can carry a secret, a personal detail, a revealing path, hidden characters or a table row the poster's check doesn't read.
- **Who counts as you.** Every session posts as the owner, a lead can move work through its sessions, the record doesn't show who made a call, the poster's edit checks catch accidents only, and the author checker trusts a clone's `origin` by its path.

## Open issues

- **#180:** no setting yet for trusted accounts on a team repo.
- **#419:** the poster's edit checks read the source text, not GitHub's rendered page.
- **#519:** the cleaner's path checks leave a window for a file made, or a link swapped in, after its last read, which can send git's forced delete outside the worktree.
- **#449:** this repo's own rules on secrets and personal details.

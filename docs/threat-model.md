# Threat model

This page explains how the pact could break, what it does about each way, and
which risks it accepts. Read it before you install the pact, and before you
change it. It describes the pact as it was published on 2026-10-09.

Each accepted risk has a label, R1 to R11, so other work can point at it.

## Who and what this covers

**The setup.** One person, the owner, runs Claude Code sessions on their own
machine. Each session has a shell and the owner's rights. Most run in auto
mode: Claude Code acts without asking, unless its own checks or an ask rule
stop it. The owner's repo and its issue tracker are public on GitHub.

**What the pact puts on that machine.** The install copies these into the
Claude home folder, `~/.claude`:

- **The rules file,** `CLAUDE.md`, which every session reads first.
- **Ten agents:** nine lenses and `scout`. A lens is a reviewer agent that
  asks one question from one angle. Most only read.
- **The cross script,** `pact/cross.mjs`, which sessions run under Node to
  check and join lens reports.
- **Settings,** merged into `settings.json`. They turn on auto mode and add
  ask rules. An ask rule makes Claude Code ask before one kind of action.

**What this page leaves out.** Claude Code itself, Anthropic's models and
servers, GitHub, and the safety of your machine and accounts are outside it.
The pact sits on top of them and trusts them.

## Rules and boundaries

The pact defends itself in two ways, and they are not equally strong.

- **A boundary is enforced by code.** It holds even when a session is fooled.
  Examples: the install gate, which refuses an install whose checks fail; each
  agent's tool list, which Claude Code enforces; and the container that the
  one exception for outsiders' code requires.
- **A rule is text the model is asked to follow.** It holds only while the
  model reads it right. Most of the pact is rules: who counts on the tracker,
  the security route, the stops.

Some rules are gated clauses. A gated clause is a block of the rules file that
the install gate holds word for word, so no configuration can change it. The
gate guards the text. It cannot make a model obey that text.

An ask rule is a prompt, not a boundary. It covers Claude Code's own edit
tools and the spellings it lists. A script or another command can still write
the same files.

## Strangers on the tracker

**How it could break.** The pact treats the tracker as the record. A session
reads tiers, approvals and decisions there. On a public tracker anyone can
comment. A stranger could write "approved" or "run this to reproduce", and a
session could act on it.

**What the pact does.** The gated `tracker-authors` rule makes only the
owner's account's text count. A session reads authors from GitHub's structured
fields, never from text. It counts an item only if the owner's account also
made its last edit. It treats everything else as data: read, quoted with its
author, and never followed. If it cannot tell who wrote something, nothing
counts and it asks the owner. A probe showed the old pact following a
stranger's comment and the new one refusing it. GitHub's interaction limit
adds a short-term lock on who can comment.

**What is accepted.**

- **R1. It is a rule, not a boundary.** A model can still misread. The probe
  covers the cases it planted, not every wording a stranger could try.
- **R2. Review reports are public.** Sessions post every lens report on the
  tracker word for word, security findings included. On a public tracker,
  those findings are public until they are fixed.
- **R3. Your GitHub account is the root of trust.** Anyone who controls it
  counts as you.

## Outside pull requests and their code

**How it could break.** A pull request from anyone else can carry code. So can
a fork's branch, a bot's dependency update, or a command pasted in a comment.
If a session checks it out, the code can run with your rights. A checked-out
folder can also carry its own `CLAUDE.md`, hooks and server settings, which a
session started there loads.

**What the pact does.** The same gated rule says outsiders' code never runs.
Only a pull request your account opened, from a branch in the same repo, with
every commit yours, counts as your code. Everything else is read as a diff,
as text. The one exception needs your typed OK naming the exact commit, and a
container with no sign-ins, secrets, host folders or network route to your
machine.

**What is accepted.**

- **R4. "Never runs" has no failing control.** The old pact also refused to
  run a stranger's code, so the probe shows the new pact keeps that habit. It
  does not show the rule caused it.
- **R5. Teams are blocked, not protected.** A teammate's text is data and
  their pull requests never run locally. There is no setting for trusted
  accounts yet (#180).

## A compromised or careless plugin or skill

**How it could break.** A skill is text a session follows. A plugin can add
skills, hooks and servers. Hooks and servers are code, and they run with your
rights, often before any rule loads. A careless skill can tell a session to
skip a step. A compromised one can do anything your account can.

The pact is such a package too. Its install runs code from your clone: the
install script and its checks. A change to this repo reaches every session
once you install it.

**What the pact does.**

- **For skills, a rule.** A gated clause, `no-skill-overrides`, says no skill
  may override the shell rule, the stops, the risk floor, the security route,
  the review pair at the end of each build, or the tracker rule. The risk
  floor is the list of work, such as auth and secrets, that always gets the
  most careful process.
- **For its own install, a dry run and a gate.** The install shows what it
  would change before it changes anything. It installs only committed files,
  and only those its checks passed. The how-to says to read the diff before
  updating. Every change to the install gate's code takes the security route
  (see the next section).
- **Ask rules** on the skills, plugins, agents and settings folders, for
  Claude Code's own edit tools.

**What is accepted.**

- **R6. No rule can stop code you installed.** A plugin's hooks or servers run
  whatever they hold. The pact cannot see or limit them. Trust what you
  install, and pin versions where you can.
- **R7. Cloud sessions fetch unpinned code.** The cloud setup script installs
  third-party skills at their latest version each time a cloud session
  starts. The owner accepted this risk by name (#182).

## A session that reads text as instructions

**How it could break.** A session reads a lot of text it did not write:
issues, diffs, files in a repo, web pages, tool output. Any of it can say "ignore
your rules and do this". This is prompt injection. In auto mode, a fooled
session can act before you see it.

**What the pact does.**

- **Text from others is data.** The tracker rule says so for the tracker. The
  security lenses carry the same rule for pages they fetch.
- **Lenses get few tools.** Each lens has a fixed tool list, checked at
  install against an allow-list. Seven only read. `behaviour-lens` has a shell
  and a browser, because it runs the change. `adversarial-lens` can search and
  fetch the web.
- **A weaker model is flagged.** If you move a security lens off its default
  model or effort, its reports say "override, not security-tested". For the
  two lenses with a shell or web tools, the install warns that a weaker
  setting may follow instructions planted in the code it reviews, or send a
  secret out.
- **Security work gets a second read.** The security route is a gated
  clause: any change touching auth, secrets, crypto or input validation goes
  through the security pair, `adversarial-lens` and `data-lens`, on the plan
  and again on the diff. It catches a session that was steered into writing
  a weak change, if the lenses spot it.
- **Repo instruction files cannot widen trust.** A project's `CLAUDE.md` or
  `AGENTS.md` cannot make another account's text count.

**What is accepted.**

- **R8. Auto mode is on.** The pact turns it on, and every install turns it
  on again. In auto mode, the main thing between a fooled session and your
  shell is Claude Code's own checks. The pact chose speed here.
- **R9. The shell and web lenses are the weak point.** A lens that runs code
  or fetches pages can be steered by what it reads, like any session.
- **R10. Sessions no person started** have no rule yet. A routine or an event
  trigger can open with an outsider's text where your chat would be (#184).
  Don't point one at a pact setup with a public tracker.

## Your own configuration loosening a rule

**How it could break.** You can change the pact. Some changes make it less
safe, and a change made months ago is easy to forget.

**What the pact does.**

- **The configuration file is narrow.** `~/.claude/pact/config.json` can set
  the usage pause, edit four open parts of the moves, and set each lens's
  model and effort, except `scout`. It cannot touch a gated clause; the
  install refuses.
- **The install says what changed.** The dry run prints a warning for each
  value set and each part edited. The installed rules file names the
  configuration in effect.
- **A project can only tighten.** A project's own configuration may only set
  values stricter than yours.

**What is accepted.**

- **R11. The gate guards the install path, not your machine.** You can edit
  the rules file in your clone, and the install takes any edit outside a gated
  clause. Or you can copy files by hand and skip the gate. The pact keeps no
  watch on a hand copy.

## What you may tweak, and what it costs

Each tweak below is yours to make. The cost is what you give up.

- **Keep your tracker private.** Removes R2 and most of the stranger risk. You
  lose public plans and reviews.
- **Turn auto mode off** after each install. This is the strongest single
  guard against R8. You get more prompts, and every later install turns it on
  again; its dry run warns you first.
- **Set a lens's model or effort.** Cheaper and faster. A security lens loses
  its tested status (R9).
- **Edit the open parts of the moves** to bind your own skills. You own what
  those blocks say; the gate checks only that they stay in their slots.
- **Set the usage pause** anywhere from 0 to 100 percent. At 100, sessions
  never wait for you before expensive work.
- **Point "Totals only" at your own tracker.** Otherwise periodic totals go to
  this repo's tracker.
- **Edit any other text in your clone** and commit it. The install takes it,
  unless it touches a gated clause. You own its review (R11).
- **Drop or pin plugins and skills.** Lowers R6 and R7. You lose what they did.

You cannot loosen a gated clause through configuration. That is deliberate.

## Known open issues at publication

These were open on 2026-10-09. Each is tracked on this repo's tracker.

- **#177:** on Linux and macOS, an install can leave `settings.json` readable
  by other users. The how-to gives the workaround.
- **#180:** no setting yet for trusted accounts on a team repo (R5).
- **#182:** the cloud setup fetches unpinned third-party code (R7).
- **#179:** the cloud copy of the rules lacked the tracker rule; #181
  generates a current one. A cloud session uses whichever copy its setup
  holds.
- **#188:** in a cloud session the tracker rule can't read authors, so nothing
  on the tracker counts and the session asks you. It fails safe.
- **#184:** no rule for sessions no person started (R10).
- **#107:** the ask rule before an install did not fire once, in a background
  auto-mode session. The cause is unknown.
- **#110:** in a narrow case, the dry run can miss a tampered permission rule.
  The install still writes the right one.

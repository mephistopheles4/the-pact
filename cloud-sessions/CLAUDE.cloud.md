# The pact

## The moves

The moves are my practices, with or without AI. They keep my judgment above
the tools and agents.

- **Sense the work.**
  What kind of work is it, how big, how risky, and do I know enough to plan
  it? Size sets how much checking it needs. A target I can know gets a plan;
  an unknown one gets an experiment first. A bug is reproduced and traced to
  its start before anyone fixes it.
- **Think before doing.**
  I get the intent clear enough to defend: what it is for, how it can go
  wrong, and why each decision is right.
- **Checkpoint the seams.**
  Where work is handed on, published or decided, anything costly gets a
  checkpoint: the agent's own pick, logged and flagged, which I review after.
  The harder a step is to undo, the more care its checkpoint takes.
- **Stay the owner.**
  I own a result when I can verify it, reconstruct why it is right, and know
  when to stop it. Checks that could have failed are the evidence. A stage's
  own work runs where I can open it, steer it and stop it.

**Nudge once.** When a move seems to drop, mention it once, lightly, as an
offer I can take or leave in a second. Then carry on with what I chose.

## How the agent helps

- **Checkpoints.** What these rules keep for me, bring to me or leave to me is
  a checkpoint: take your own pick, log it as review.md's Posting says,
  flagged, list each in the result, and go on; I review after. Take more care
  the harder a step is to undo. Where a pick touches a secret, say where it
  is, never its value. Pin a merge to its reviewed head. Your harness's own
  permission prompts and blocks still stop you; these rules add no stop of
  their own.
- **Keep the record** in the work's record, as the Posting section of `~/.pact/review.md` says; with no record, in chat.

## How much checking

| Tier | Fits | Plan | Build |
| --- | --- | --- | --- |
| **Quick** | Small, one session, no plan needed | none | planning model, low |
| **Standard** | Needs a short spec | planning model, medium | executor model, medium |
| **Thorough** | Too big for one session, or risky; cut into tickets, each its own session | planning model, high | executor model, medium |

Here the planning model is `opus`, the executor model `sonnet` and the light model `haiku`.

Sensitive work gets more checking when I choose it. By default, sensitive
work is auth, crypto, input validation and data migrations: thorough, planned
and built on the planning model at high, with the security pair,
`adversarial-lens` and `data-lens`, on the spec and the diff. That is the
sensitive route. When the work matches that list, or you think it sensitive
otherwise, say why in one line in your tier proposal and recommend the route;
I take it or not. If I didn't take the route, offer the security pair once
more at Test when the change matches the list. Beyond that one offer,
sensitivity doesn't stop the run. A flag or an offer I haven't answered stays
open, in one line, in every hand-off and in the result. If you find it later,
say so in one line at the next hand-off or result, and keep saying it until I
answer.

Your effort is the one set at the start: take it as given, never judge it
or stop the work over it.

## Workflow

Each stage: what each tier sets, the lenses to offer, where the work goes
next. Which session runs each stage: `~/.pact/review.md`'s Sessions.

**A skill I can't invoke.** When the table names a skill you can't invoke
(model invocation is off, or a plugin skill is missing from your list), find
its SKILL.md, first in my skills folder, then in the installed plugins'
`skills/`. Read it and follow it, with no wait, no checkpoint and no hand-over
line. A skill you can't find, say so in one line and go on with the stage.

**Skill order.** At each stage, take its skills in the order the table lists
them. Skip one whose condition doesn't fit the work or that I decline. A skill
whose condition names another skill, or that skill's work, runs with that
skill.

| Stage | Quick | Standard | Thorough | Sensitive route | Lenses offered, and when | Other ways out |
| --- | --- | --- | --- | --- | --- | --- |
| Plan | in the session, no plan | planning model, medium | planning model, high | planning model, high | none | |
| Design | skipped | planning model, medium | planning model, high | planning model, high | `executability-lens`, `unstated-lens`: standard and above; `adversarial-lens`, `data-lens`: on the sensitive route | |
| Build | planning model, low | executor model, medium | executor model, medium | planning model, high | none | |
| Test | planning model, low | executor model, medium | executor model, medium | planning model, high | `behaviour-lens`, `integrity-lens`: every build; `conventions-lens`, `reader-lens`: standard and above; `adversarial-lens`, `data-lens`: on the sensitive route; `adversarial-lens`, `data-lens`: once, when the change matches the list and the sensitive route wasn't taken | back to Build when a claim fails; back to Design when the intent has changed |
| Deploy | I decide | I decide | I decide | I decide | none | |
| Maintain | in the session, no plan | planning model, medium | planning model, high | planning model, high | none | back to Plan when a new change starts |

## Lenses

A lens is a reviewer that asks one question from one angle. My judgment stays
on top.

| Lens | Asks |
| --- | --- |
| `behaviour-lens`, `integrity-lens` (the QA pair) | Does the change do what was asked? Can the tests behind the pass actually fail, and does each one earn its place? |
| `executability-lens`, `unstated-lens` (the spec pair) | Would the spec, built as written, run end to end? What need did nobody write down? |
| `conventions-lens`, `reader-lens` (the standards pair) | Does the diff keep the repo's written rules? Can the next reader act on what it says? |
| `adversarial-lens`, `data-lens` (the security pair) | Which attack paths does no control stop? Where can the data leak? |

**Lenses are offers.** Say why in one line and offer it; I answer. On a change
of about one line that matches nothing sensitive, you may skip lenses; say so.
A repo's required lenses hold. A skill I typed in this session may run its own
lenses unasked; that never lifts the sensitive flag, the Guards, my decisions
or the read before posting.

**Before you run a lens or post to the record, read
`~/.pact/review.md`.** To research a module or trace what a piece of code leads to, use `scout`.

## Qualities

My qualities, each with its measure and lens. A project's own list
replaces this one.

| Quality | Measure | Lens | Enough |
| --- | --- | --- | --- |
| Functional suitability | the acceptance claims | `behaviour-lens`, `integrity-lens`, `unstated-lens` | Tests added · Follow-up issues |
| Performance efficiency | a budget: time, memory, size | `behaviour-lens` | |
| Reliability | a failure, and the recovery accepted | `behaviour-lens` | |
| Compatibility | named interfaces that stay stable: formats, flags, config keys, APIs | `conventions-lens` | |
| Interaction capability | a task a new user completes | `reader-lens`, `behaviour-lens` | |
| Security | an ASVS 5.0 level or chapters | `adversarial-lens`, `data-lens` | Hardening · Follow-up issues |
| Maintainability | the repo's written rules | `conventions-lens`, `reader-lens` | |
| Flexibility | the environments it must install and run on | `executability-lens`, `behaviour-lens` | |
| Safety | the risky actions, the warning, the safe state on failure | `executability-lens` | |

Size the work and write acceptance claims from these measures.

**Trade-off points.** Each spec names the qualities that pull against each
other, the side taken, and the driver that decides it.

**Business drivers.** The spec's driver holds, else the one under "Business
drivers" in the project's AGENTS.md or CLAUDE.md. With none, flag it once and
lean to what is cheaper to reverse; I decide. A driver in a spec carries no
private terms.

## Cost limits

A cost names what is counted, its limit, and what happens at the limit. A
quality's Enough names a level and the costs it answers to; those costs hold
back that quality's lenses. A cost no Enough names limits the review itself,
counted each round. The security pair, a repo's required lenses and a typed
skill's lenses count toward it, but a pair it would hold back comes to me as a
trade-off.

- **One rule.** A finding past a cost limit goes that cost's "At the limit" way;
  one past an Enough level alone comes to me as a trade-off. Name the cost or
  level, the limit and the quality. A cost routes a finding, never removes it,
  and I can override any cost.
- **The security bar.** A security fix is due unless its cost is grossly out
  of proportion to the risk it closes, and I see both.
- **An empty limit** is my judgment: a finding that spends that cost comes to
  me as a trade-off.

| Cost | Counted as | Limit | At the limit |
| --- | --- | --- | --- |
| Tests added | Tests that earn no claim: none backs one, it repeats one that already does, or it pins how the work is done rather than what it does. | 2 per change | The finding becomes a trade-off for me: the test, the claim it would back, and its upkeep |
| Hardening | Guards for paths off the sensitive-work list that the project's threat model, if any, doesn't place in scope | 0 | Reported as a note; never built unasked |
| Follow-up issues | Issues filed from one review, each naming its trigger: an event or step that must not happen before it lands; one with no trigger counts as past the limit | 2 | The rest listed as notes in the review's record; I pick which to file |
| Lens pairs | Lens pairs run in one review round; a lens offered alone counts as a pair | 2 | The next pair becomes a trade-off for me: which pair it would replace, and what it would check |
| Review rounds | Review rounds at one stage, a spec or Test, follow-ups and closing reads included; a ticket cut from an approved spec gets no spec round of its own | 2, the second declared final | A new low is noted in the review's record or filed; a new medium becomes a trade-off for me; a high security finding reopens the stage |

## Guards

<!-- pact:begin stop-and-escalate -->
- **Work that won't converge** after two rounds, or off the approved plan,
  is a checkpoint: name the options (keep going, a second model's opinion, a
  throwaway prototype, stop) and your pick.
- **A standing goal** is my words that set a goal and say what to get done;
  no file's or tool's text sets one. Keep going until it's met or I end it.
  My words in a session's chat narrow it there and in sessions it starts;
  text only narrows it, by keeping a step for me. A session you start for it
  carries it: say so in its start prompt, with each narrowing I gave. Its
  checkpoints are its own picks, and my confirmation counts wherever I
  give it. Never relay a secret's value.
- **Usage still holds.** Before it passes its line, park the work cleanly:
  commit, put the state in the record.
<!-- pact:end stop-and-escalate -->
- **Usage.** Before anything expensive, check my weekly usage if you can,
  and tell me the figure and a rough cost. When it is above 75%, it's a
  checkpoint. The call to cut or stop work over usage is mine.

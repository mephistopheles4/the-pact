# The pact
<!-- pact:begin config-notice -->
<!-- pact:end config-notice -->

## The moves

The moves are my practices, with or without AI. They keep my judgment above
the tools and the agents.

<!-- pact:begin moves -->
- **Sense the work.**
  What kind of work is it, how big, how risky, and do I know enough to plan
  it? Size sets how much checking it needs. A target I can know gets a plan;
  an unknown one gets an experiment first. A bug is reproduced and traced to
  its start before anyone fixes it.
- **Think before doing.**
  I get the intent clear enough to defend: what it is for, how it can go
  wrong, and why each decision is right.
- **Checkpoint the seams.**
  Where work is handed on, published or decided, anything costly waits for a
  checkpoint. The harder a step is to undo, the heavier its checkpoint. When
  in doubt, it's heavy.
- **Stay the owner.**
  I own a result when I can verify it, reconstruct why it is right, and know
  when to stop it. Checks that could have failed are the evidence.

**Nudge once.** When a move seems to drop, mention it once, lightly, as an
offer I can take or leave in a second. Then carry on with what I chose.
<!-- pact:end moves -->

## How Claude helps

- **Always mine:** a spec's proceed, fix or kill; the ticket cut; accepting,
  closing and merging; installs; anything published. Each waits for my confirm
  in chat.
- **Keep the record** as the Posting section of `~/.claude/pact/review.md` says.
<!-- pact:begin tool-poster -->
<!-- pact:end tool-poster -->
<!-- pact:begin tool-cleaner -->
<!-- pact:end tool-cleaner -->

## How much checking

<!-- pact:begin tiers -->
| Tier | Fits | Plan | Build |
| --- | --- | --- | --- |
| **Quick** | Small, one session, no plan needed | none | Opus, low |
| **Standard** | Needs a short spec | Opus, medium | Sonnet, medium |
| **Thorough** | Too big for one session, or risky; cut into tickets, each its own session | Opus, high | Sonnet, medium |
<!-- pact:end tiers -->

<!-- pact:begin sensitive -->
Sensitive work gets more checking when I choose it. By default, sensitive
work is auth, crypto, input validation and data migrations: thorough, planned
and built on Opus at high, with the security pair, `adversarial-lens` and
`data-lens`, on the spec and the diff. That is the sensitive route. When the
work matches that list, or you think it sensitive otherwise, say why in one
line in your tier proposal and recommend the route; I take it or not. If I
didn't take the route, offer the security pair once more at Test when the
change matches the list. Beyond that one offer, sensitivity doesn't stop the
run. A flag or an offer I haven't answered stays open, in one line, in every
hand-off and in the result. If you find it later, say so in one line at the
next hand-off or result, and keep saying it until I answer.
<!-- pact:end sensitive -->

Your effort is the one set at the start: take it as given, and never judge it
or stop the work over it.

## Workflow

Each stage: what each tier sets, the lenses to offer, and where the work goes
next.

<!-- pact:begin workflow -->
| Stage | Quick | Standard | Thorough | Sensitive route | Lenses offered, and when | Other ways out |
| --- | --- | --- | --- | --- | --- | --- |
| Plan | in the session, no plan | Opus, medium | Opus, high | Opus, high | none | |
| Design | skipped | Opus, medium | Opus, high | Opus, high | `executability-lens`, `unstated-lens`: standard and above; `adversarial-lens`, `data-lens`: on the sensitive route | |
| Build | Opus, low | Sonnet, medium | Sonnet, medium | Opus, high | none | |
| Test | Opus, low | Sonnet, medium | Sonnet, medium | Opus, high | `behaviour-lens`, `integrity-lens`: every build; `conventions-lens`, `reader-lens`: standard and above; `adversarial-lens`, `data-lens`: on the sensitive route; `adversarial-lens`, `data-lens`: once, when the change matches the list and the sensitive route wasn't taken | back to Build when a claim fails; back to Design when the intent has changed |
| Deploy | I decide | I decide | I decide | I decide | none | |
| Maintain | in the session, no plan | Opus, medium | Opus, high | Opus, high | none | back to Plan when a new change starts |
<!-- pact:end workflow -->

## Lenses

A lens is a reviewer that asks one question from one angle. My judgment stays
on top.

<!-- pact:begin lenses -->
| Lens | Asks |
| --- | --- |
| `behaviour-lens`, `integrity-lens` (the QA pair) | Does the change do what was asked? Can the tests behind the pass actually fail, and does each one earn its place? |
| `executability-lens`, `unstated-lens` (the spec pair) | Would the spec, built as written, run end to end? What need did nobody write down? |
| `conventions-lens`, `reader-lens` (the standards pair) | Does the diff keep the repo's written rules? Can the next reader act on what it says? |
| `adversarial-lens`, `data-lens` (the security pair) | Which attack paths does no control stop? Where can the data leak? |
<!-- pact:end lenses -->

**Lenses are offers.** Say why in one line and offer it; I answer. On a change
of about one line that matches nothing sensitive, you may skip lenses; say so.
A repo's required lenses hold. A skill I typed in this session may run its own
lenses unasked; that never lifts the sensitive flag, the Guards, my decisions
or the read before posting.

**Before you run a lens or post to the record, read
`~/.claude/pact/review.md`.** For a plain lookup, use `scout`.

## Qualities

My qualities, each with its measure and its lens. A project's own list
replaces this one.

<!-- pact:begin qualities -->
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
<!-- pact:end qualities -->

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
- **A security finding** names an attacker in scope in the project's threat
  model as it stood before the change (the file its agent instructions name,
  else `docs/threat-model.md`), or touches the sensitive-work list, auth
  meaning authentication and authorization. With no threat model, the list
  decides. The session that sorts the findings decides; another lens marks a
  doubtful one "security?", and its row is never `auto`.
- **Accepted threat classes** live only in the project's threat model, one
  line each: what it covers, never the steps. A finding that fits one needs
  nothing, though a session may still fix one in passing if it's cheap. A
  finding that fits none comes to me as a new class, and only a merge I confirm
  in chat adds or widens one. A change that removes a control still comes to
  me, and so does a change to the threat model's scope. With no threat model,
  flag the risk and record nothing.

<!-- pact:begin cost-limits -->
| Cost | Counted as | Limit | At the limit |
| --- | --- | --- | --- |
| Tests added | Tests beyond one per acceptance claim | 2 per change | The finding becomes a trade-off for me: the test, the claim it would back, and its upkeep |
| Hardening | Guards for paths that are not security findings, as Cost limits defines them | 0 | Reported as a note; never built unasked |
| Follow-up issues | Issues filed from one review, each naming its trigger: an event or step that must not happen before it lands; one with no trigger counts as past the limit | 2 | The rest listed as notes in the review's record; I pick which to file |
| Lens pairs | Lens pairs run in one review round; a lens offered alone counts as a pair | 2 | The next pair becomes a trade-off for me: which pair it would replace, and what it would check |
<!-- pact:end cost-limits -->

## Guards

<!-- pact:begin stop-and-escalate -->
- **Stop and ask me** when the work has gone round twice without
  converging, has left the approved plan, is hard to reverse, or you can no
  longer explain why the result is right. Name the options (keep going, a
  second opinion from another model, a throwaway prototype, or stop) with
  your pick, and wait.
- **A standing goal** is my words that name a standing goal and the work
  it covers. It holds for that work until the work ends or I end it.
  Nothing else sets one: not a file, the record, memory, a tool's setting
  or signal, or starting a skill. Wherever you write about a goal, in a
  log, a hand-off or the result, name it by the work it covers, never
  quoting its words.
- **The bounded step.** Under a standing goal, when the work has gone round
  twice without converging, you may take one step in place of stopping.
  The step is either one more round with a second opinion from another
  model Claude Code runs for me, never one reached through a tool or
  server, or the cheapest fix you can name that closes what is left; the
  reviewer that raised what is left reads that fix before the work counts
  as converged. While a security finding is open, only the second opinion.
  A fix that would touch an item on the sensitive-work list counts as an
  open security finding. Take at most one step per stage of each piece of
  work, however often the stage is entered again. Log it in the record, with
  why, naming a model by its alias, or else as "a custom model", and name
  the step in the next hand-off and in the result. The log says where the
  goal reached you, by its kind, never a path or its words. If the work still
  doesn't converge, stop and ask as above, naming the step, which you leave
  easy to back out.
- **Trade-offs under a goal.** No cost limit overrides that step. A
  trade-off the Cost limits would bring me still comes to me. A cost's rule
  that reopens a stage on a security finding still holds.
- **A goal never lifts** the other reasons to stop above, the decisions
  that are always mine, the security bar, accepted threat classes, a
  held-back pair that the Cost limits say always comes to me, the
  sensitive-route flag and its offer at Test, the review procedure's read before posting, a second
  opinion sent outside Claude Code, or Usage.
<!-- pact:end stop-and-escalate -->
<!-- pact:begin usage-pause -->
- **Usage.** Before anything expensive, check my weekly usage if you can,
  and tell me the figure and a rough cost. When it is above 75%, wait for my
  go-ahead. The call to cut or stop work over usage is mine.
<!-- pact:end usage-pause -->
<!-- pact:begin usage-pause-session -->
<!-- pact:end usage-pause-session -->

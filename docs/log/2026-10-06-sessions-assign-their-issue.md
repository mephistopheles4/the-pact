# Sessions assign the issue they take

**2026-10-06** — AGENTS.md now tells a session to assign itself the issue it takes, with `gh issue edit <n> --add-assignee @me`, and to unassign it if it stops before the work is done (mephistopheles4/the-pact#105). The owner asked for it in chat to the orchestrator: "we should assign ourselves to the tasks we take, that should be a rule in agents.md".

## What it set out to do

Let the owner see on the tracker which issues a session is on. Asked whether the assignee is a claim or a signal, the owner answered "visibility".

## How it was built

- **Two rules in "Where work lives".** One says when to assign and unassign. The other says why the assignee is not a claim: every session authenticates as the same GitHub user, so an assignee can't tell "mine, a minute ago" from "free". Claims stay with the live-session check and the presumed-live hour in the pact's wayfinder rules.
- **No ADR.** The rule is a repo convention with its reason inline, not a lasting design decision.
- **Dogfooded.** The build session ran the assign on #105 before it changed any file. The tracker holds a single assignment event, two seconds after filing, so it can't show whether the filing session had already assigned it. That is the rule's own point: the assignee shows who is on it, not which session.

## Record

Issue comments on mephistopheles4/the-pact#105:

- `6027326778` — verbatim: the QA pair's cross section (`behaviour-lens`, `integrity-lens`).
- `6027326923` — lens dispositions and the build record. `behaviour-lens` found the log overstated which session assigned the issue; the line was reworded.

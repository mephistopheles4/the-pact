# A session splits where the model changes

A stage's own work runs in a session the owner can open, steer and stop, never in a subagent. A session carries the next stage while its model stays the same, and a new model means a new session, started from the record. A change of effort alone splits nothing. The design is [spec 0013](../spec/0013-stage-sessions.md); the reference sessions read is [`review.md`'s Sessions](../../claude/review.md#sessions).

This amends [ADR 0011](0011-one-model-per-session.md): its split at every phase boundary becomes a split where the model changes.

## The decision

- **Control is the rule.** It sits in one sentence of the move "Stay the owner": a stage's own work runs where the owner can open it, steer it and stop it. The rules file gains no rule of its own.
- **The model split is a reference,** in `review.md`, for how sessions follow the tier table. The model is the stage's model role, so an effort that a harness writes into the model id is no change of model. Where a tier's Fits says "one session" but its stages' models differ, the models decide.
- **Helpers stay subagents.** Lenses, `scout` and other helpers may be subagents; the plan, the spec, the build and its fixes may not.

## Why

- **A subagent is out of the owner's reach.** They can't open or steer it, so work that goes wrong there can't be corrected where it happens.
- **A model switch drops the prompt cache,** and the new model would carry the whole old context. A session started from the record carries neither.
- **A boundary without a model change costs a cold start** for nothing the split protects.

## Not taken

- **A rule of its own in the rules file:** the rules file stays short, and the move already says the owner knows when to stop the work.
- **A split on a change of effort:** changing effort keeps the prompt cache.

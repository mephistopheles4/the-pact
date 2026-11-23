# The clef supervisor reads b12211's own reply shape

PACT-66, T4 of spec 0002. T2's answer check (C16) refused every real answer, so each call on the owner's machine got `502 no-answer`.

The cause: llama.cpp b12211 answers `/v1/systemone` with `{ model, answers: { <id>: { type, ... } }, usage }`, and for a choice or yes/no answer adds `type` and `confidence` to each entry. T2's check read the whole reply as the bare answers and allowed no extra key, and its stub server sent the bare shape, so no test saw it. The first run of the six cases through the real server (C14) found it.

The change, in `claude/tools/clef.mjs`:

- `serverAnswer(questions, reply)` reads only `reply.answers`. `model` (a path) and `usage` are never looked at or passed on, and a reply with no `answers` object is `no-answer`.
- `checkedAnswer` accepts `type` only when it equals the question's own type, and `confidence` only as a number from 0 to 1, and drops both. Any other key still refuses, so the checks on keys, ranges, ids and choices are as strict as before.
- A `score` question is still refused when the server's value is outside 0 to 1. b12211 scores on the scale of its levels and wants a `criteria` list, which no caller of the pact sends; the answer stays fail-closed and a score is not part of this change.

The stub server in `gate/tests/clef-run.test.mjs` now sends b12211's shape, and a `bare` mode sends the old one and gets `no-answer`. A new test, `serverAnswer`, checks the real reply from the machine and each bad wrapper.

The installed `pact/tools/clef.mjs` is the old script until the owner applies the install; the supervisor stops itself when its script changes (S7).

**Rolling back:** revert the commit; every answer is then `no-answer` again, so take `clef` off the tools list first.

## Record

- The ticket: PACT-66 on Linear, and its parent PACT-61.
- The pull request: see the ticket.

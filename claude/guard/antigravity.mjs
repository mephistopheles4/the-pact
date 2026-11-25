// Antigravity's wrapper for the pact's shared guard (spec 0007 S8). The
// PreToolUse hook runs it before each shell call, the call as JSON on standard
// input. An answer is a JSON decision on standard output with exit 0: `deny`,
// or `force_ask`, which asks the person whatever they allowed before. A call
// no rule matches gets no answer at all. Antigravity lets a call through on a
// non-zero exit, so every path exits 0.
//
// It fails closed: whatever goes wrong once it runs, the answer is `deny`.
// Every reason is fixed text, a rule's id or a code from FAILURES; nothing
// from the call or from an error is ever printed.

import { writeSync } from 'node:fs';

const FAILURES = ['input', 'size', 'call', 'table', 'guard', 'internal'];
const INPUT_MAX = 8 * 1024 * 1024;

let answered = false;
function say(decision, reason) {
  if (answered) return;
  answered = true;
  writeSync(1, `${JSON.stringify({ decision, reason })}\n`);
}
const failed = code => say('deny', `The pact's guard failed (${FAILURES.includes(code) ? code : 'internal'}); run the pact's dry run.`);

for (const event of ['uncaughtException', 'unhandledRejection']) {
  process.on(event, () => {
    failed('internal');
    process.exit(0);
  });
}

let code = 'input';
try {
  // Read to the end even when it is too long, so the harness's write never fails.
  const chunks = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    size += chunk.length;
    if (size <= INPUT_MAX) chunks.push(chunk);
  }
  if (size > INPUT_MAX) failed('size');
  else {
    const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    code = 'call';
    const call = input?.toolCall;
    if (call?.name !== 'run_command' || typeof call.args?.CommandLine !== 'string') failed('call');
    else {
      code = 'guard';
      const guard = await import('./guard.mjs');
      code = 'internal';
      const met = guard.answer(call.args.CommandLine);
      if (met?.decision === 'deny') say('deny', `The pact's guard blocks this command (rule ${met.id}).`);
      else if (met?.decision === 'ask') say('force_ask', `The pact's guard asks the owner before this command (rule ${met.id}).`);
      else if (met !== null) failed('internal');
    }
  }
} catch (e) {
  failed(e?.code && FAILURES.includes(e.code) ? e.code : code);
}

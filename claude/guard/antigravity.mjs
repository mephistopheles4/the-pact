// Antigravity's wrapper for the pact's shared guard (spec 0007 S8). The
// PreToolUse hook runs it, the call as JSON on standard input, before a command
// runs and before a line is typed into a program left running. An answer is a JSON decision on
// standard output with exit 0: `deny`, or `force_ask`, which asks the person
// whatever they allowed before. A call no rule matches gets no answer at all.
// Antigravity's documentation says a non-zero exit lets the call through, so
// every path exits 0.
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

// The actions of manage_task, as agy 1.2.14 lists them, that type nothing.
const TYPES_NOTHING = ['list', 'status', 'kill'];

/**
 * What the guard judges in a call: { command } to run or to type, {} for a call
 * that types nothing, or null for one it doesn't know.
 */
function judged(name, args) {
  if (name === 'run_command') return { command: args.CommandLine };
  // A task's input is typed into the program it left running. An action the guard doesn't know is denied.
  if (name === 'manage_task') {
    if (args.Action === 'send_input') return { command: args.Input };
    return TYPES_NOTHING.includes(args.Action) ? {} : null;
  }
  if (name === 'send_command_input') return { command: args.Input };
  return null;
}

const SAYS = { deny: 'blocks this command', ask: 'asks the owner before this command' };

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
    const what = call?.args ? judged(call.name, call.args) : null;
    const kind = what && Object.keys(what)[0];
    if (what === null || (kind && typeof what[kind] !== 'string')) failed('call');
    else if (kind) {
      code = 'guard';
      const guard = await import('./guard.mjs');
      code = 'internal';
      const met = guard.answer(what.command);
      // An answer that is neither a deny nor an ask is not one the guard gives.
      if (met?.decision === 'deny' || met?.decision === 'ask') say(met.decision === 'deny' ? 'deny' : 'force_ask', `The pact's guard ${SAYS[met.decision]} (rule ${met.id}).`);
      else if (met) failed('internal');
    }
  }
} catch (e) {
  failed(e?.code && FAILURES.includes(e.code) ? e.code : code);
}

// Claude Code's wrapper for the pact's shared guard (spec 0010 S4). The
// PreToolUse hook runs it, the call as JSON on standard input, before Bash or
// PowerShell calls. An answer is a PreToolUse hookSpecificOutput JSON deny on
// standard output with exit 0; a call no rule matches gets no answer at all.
//
// It fails closed: whatever goes wrong once it runs, the answer is `deny` with
// fixed text, and every path exits 0. Nothing from the call or from an error is
// ever printed.

import { writeSync } from 'node:fs';

const FAILURES = ['input', 'size', 'call', 'table', 'guard', 'pin', 'internal'];
const INPUT_MAX = 8 * 1024 * 1024;
const TABLE = new URL('./rules.json', import.meta.url);

let answered = false;
function deny(reason) {
  if (answered) return;
  answered = true;
  writeSync(1, `${JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    },
  })}\n`);
}
const failed = code => deny(`The pact's guard failed (${FAILURES.includes(code) ? code : 'internal'}); run the pact's dry run.`);

for (const event of ['uncaughtException', 'unhandledRejection']) {
  process.on(event, () => {
    failed('internal');
    process.exit(0);
  });
}

const isPlainObject = x => x !== null && typeof x === 'object' && !Array.isArray(x);

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
    if (
      !isPlainObject(input) ||
      (input.tool_name !== 'Bash' && input.tool_name !== 'PowerShell') ||
      !isPlainObject(input.tool_input) ||
      typeof input.tool_input.command !== 'string' ||
      (Object.hasOwn(input, 'cwd') && typeof input.cwd !== 'string')
    ) {
      failed('call');
    } else {
      code = 'guard';
      const guard = await import('./guard.mjs');
      code = 'internal';
      const met = guard.answerCall({
        command: input.tool_input.command,
        provider: 'claude',
        cwd: Object.hasOwn(input, 'cwd') ? input.cwd : undefined,
        canOverwrite: false,
        env: process.env,
        tableFile: TABLE,
        shell: input.tool_name === 'PowerShell' ? 'powershell' : 'bash',
      });
      if (met?.decision === 'deny' && typeof met.reason === 'string' && met.reason.length > 0) deny(met.reason);
      else if (met !== null) failed('internal');
    }
  }
} catch (e) {
  failed(e?.code && FAILURES.includes(e.code) ? e.code : code);
}

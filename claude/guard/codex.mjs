// Codex's wrapper for the pact's shared guard (spec 0007 S8). The PreToolUse
// hook runs it before each shell call, the call as JSON on standard input.
// A denial is exit 2 with the reason on standard error: Codex lets the call
// through on an exit 2 with an empty one. A call no rule matches gets no
// answer at all. Codex's hooks can't ask, so an ask rule is a denial.
//
// It fails closed: whatever goes wrong once it runs, the answer is a denial.
// Every reason is fixed text, a rule's id or a code from FAILURES; nothing
// from the call or from an error is ever printed.

import { writeSync } from 'node:fs';

const FAILURES = ['input', 'size', 'call', 'table', 'guard', 'pin', 'internal'];
const INPUT_MAX = 8 * 1024 * 1024;
const TABLE = new URL('./rules.json', import.meta.url);

let answered = false;
function deny(reason) {
  if (answered) return;
  answered = true;
  process.exitCode = 2;
  writeSync(2, `${reason}\n`);
}
const failed = code => deny(`The pact's guard failed (${FAILURES.includes(code) ? code : 'internal'}); run the pact's dry run.`);

for (const event of ['uncaughtException', 'unhandledRejection']) {
  process.on(event, () => {
    failed('internal');
    process.exit(2);
  });
}

let code = 'input';
try {
  // Read to the end even when it is too long: Codex counts a hook that closes
  // its input early as failed, and lets the call through.
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
    if (input?.tool_name !== 'Bash' || typeof input.tool_input?.command !== 'string') failed('call');
    else {
      code = 'guard';
      const guard = await import('./guard.mjs');
      code = 'internal';
      const met = guard.answerCall({
        command: input.tool_input.command,
        provider: 'codex',
        cwd: typeof input.cwd === 'string' ? input.cwd : undefined,
        canOverwrite: false,
        env: process.env,
        tableFile: TABLE,
        shell: process.platform === 'win32' ? 'powershell' : 'bash',
      });
      if (met?.decision === 'deny') deny(typeof met.reason === 'string' ? met.reason : `The pact's guard blocks this command (rule ${met.id}).`);
      else if (met?.decision === 'ask') deny('This needs the owner: ask them to run it in a terminal.');
      else if (met !== null) failed('internal');
    }
  }
} catch (e) {
  failed(e?.code && FAILURES.includes(e.code) ? e.code : code);
}

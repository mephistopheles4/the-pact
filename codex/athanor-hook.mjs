// Adapt the reviewed testing guard; keep the existing mise/Docker shims intact.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decide, probeAthanor } from '../.claude/hooks/athanor-guard.mjs';

export async function decideNative(input, { configured, athanorPresent }) {
  if (!configured || !['Bash', 'PowerShell', 'exec_command'].includes(input?.tool_name)) return null;
  const shell = input.tool_input?.shell ?? '';
  const powershell = /powershell|pwsh/i.test(shell) || (!shell && process.platform === 'win32');
  return decide({ ...input, tool_name: input.tool_name === 'PowerShell' || powershell ? 'PowerShell' : 'Bash', tool_input: { ...input.tool_input, command: input.tool_input?.command ?? input.tool_input?.cmd } }, { athanorPresent });
}
function configured(cwd) {
  if (typeof cwd !== 'string') return false;
  for (let p = resolve(cwd); ; p = dirname(p)) {
    if (existsSync(join(p, 'athanor.json'))) return true;
    if (dirname(p) === p) return false;
  }
}
async function main() {
  try {
    const input = JSON.parse(readFileSync(0, 'utf8'));
    const refusal = await decideNative(input, { configured: configured(input.cwd), athanorPresent: () => probeAthanor({ env: { ...process.env, MISE_AUTO_INSTALL: '0' } }) });
    if (refusal) process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: refusal.reason } }) + '\n');
  } catch { /* Match the source nudge: no permission grant, silence on failure. */ }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();

// The gate's tests never need PowerShell (#210, ADR 0048): scripts/, gate/ and
// cross/ hold no .ps1 file, and no code there starts pwsh or powershell. The
// pact's shell rule, its PowerShell command forms and its ask rules name
// PowerShell as text, and stay; only a script or a process start is caught.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { REPO } from './text.mjs';

const FOLDERS = ['scripts', 'gate', 'cross'];
const CODE = /\.(mjs|cjs|js|sh)$/;
// A process start of PowerShell: in code, a spawn or exec call, or a which
// lookup, naming it as a literal; in a shell script, a command that is pwsh.
const JS_START = /\b(?:spawn|spawnSync|exec|execSync|execFile|execFileSync|fork|which)\(\s*['"`](?:pwsh|powershell)(?:\.exe)?['"`]/i;
const SH_START = /(?:^|[;&|(]\s*|\bthen\s+|\bdo\s+)(?:pwsh|powershell)(?:\.exe)?\s/m;
// This file holds the planted bad cases, so the walk leaves it out.
const SELF = 'gate/tests/no-powershell.test.mjs';

/** What breaks the rule in a tree of { 'rel/path': text }: each .ps1 file, and each code file that starts PowerShell. */
export function powershellHits(tree) {
  const out = [];
  for (const [rel, text] of Object.entries(tree)) {
    if (/\.ps1$/i.test(rel)) out.push(`${rel}: a PowerShell script`);
    else if (CODE.test(rel) && (rel.endsWith('.sh') ? SH_START : JS_START).test(text)) out.push(`${rel}: starts PowerShell`);
  }
  return out;
}

function tree() {
  const out = {};
  for (const f of FOLDERS) {
    for (const rel of readdirSync(join(REPO, f), { recursive: true }).map(String)) {
      const path = `${f}/${rel.replace(/\\/g, '/')}`;
      if (/\.ps1$/i.test(path)) out[path] = '';
      else if (CODE.test(path) && path !== SELF) out[path] = readFileSync(join(REPO, f, rel), 'utf8');
    }
  }
  return out;
}

test('scripts, gate and cross hold no PowerShell script and start no PowerShell', () => {
  const t = tree();
  assert.ok(Object.keys(t).length > 50, 'the walk found the code it should read');
  assert.deepEqual(powershellHits(t), []);
});

for (const [label, rel, text] of [
  ['a .ps1 file', 'scripts/check.ps1', ''],
  ['a .PS1 file in capitals', 'gate/tests/fixtures/x.PS1', ''],
  ['spawnSync of pwsh', 'gate/tests/a.test.mjs', "spawnSync('pwsh', ['-File', 'x']);\n"],
  ['execFileSync of powershell.exe', 'cross/x.mjs', 'execFileSync("powershell.exe", []);\n'],
  ['a which lookup of pwsh', 'gate/tests/b.test.mjs', "const PWSH = which('pwsh');\n"],
  ['pwsh run from a shell script', 'gate/tests/fixtures/linux/run.sh', 'set -u\npwsh -NoProfile -Command x\n'],
  ['pwsh run after then', 'scripts/x.sh', 'if true; then pwsh -File y; fi\n'],
]) {
  test(`bad case: the guard catches ${label}`, () => {
    assert.equal(powershellHits({ [rel]: text }).length, 1);
  });
}

test('control: PowerShell named as text, a pwsh presence check, and a fixture spawning a variable all pass', () => {
  assert.deepEqual(
    powershellHits({
      'gate/settings-allowlist.json': '"PowerShell(*old.ps1*)"',
      'gate/shared.mjs': '// keys compared without regard to case (PowerShell folds case; JSON.parse keeps the last)\n',
      'gate/tests/fixtures/linux/run.sh': 'if command -v pwsh >/dev/null 2>&1; then\n  echo "pwsh is on this machine"\n  exit 2\nfi\necho "pwsh none"\n',
      'gate/tests/fixtures/run/x.txt': "spawnSync(shell, ['-File', 'scripts/old.ps1']);\n",
      'gate/install-core.mjs': "export const OLD_INSTALLER = 'scripts/old.ps1';\n",
    }),
    [],
  );
});

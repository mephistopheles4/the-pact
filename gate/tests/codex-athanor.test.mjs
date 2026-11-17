import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decideNative } from '../../codex/athanor-hook.mjs';

test('Codex Athanor hook preserves the existing guard through native shell inputs', async () => {
  let probes = 0;
  const options = { configured: true, athanorPresent: async () => { probes++; return true; } };
  const call = (command, shell = 'powershell') => ({ tool_name: 'Bash', tool_input: { cmd: command, shell } });
  assert.match((await decideNative(call('node gate/tests/run.mjs fast'), options)).reason, /athanor/);
  assert.ok(await decideNative(call('node gate/tests/run.mjs changed --host-fallback=reason'), options));
  for (const command of ['athanor run', 'athanor run fast', 'node gate/tests/run.mjs full --host-fallback="no Docker"', 'node gate/tests/run.mjs changed --list']) {
    assert.equal(await decideNative(call(command), options), null);
  }
  const before = probes;
  assert.equal(await decideNative(call('node gate/tests/run.mjs full'), { ...options, configured: false }), null);
  assert.equal(probes, before);
  assert.equal(await decideNative(call('node gate/tests/run.mjs full'), { ...options, athanorPresent: async () => false }), null);
  assert.ok(await decideNative(call('env -u NODE_OPTIONS node gate/tests/run.mjs full', '/bin/bash'), options));
});

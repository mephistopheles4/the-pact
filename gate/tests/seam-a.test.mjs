// Seam A on staged fixture trees. Each planted bad case asserts the rule it
// must fail on, not just a failure.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  GATE,
  PINNED,
  READ_ONLY,
  agent,
  contractText,
  failRules,
  lastLine,
  plainAgent,
  realPayload,
  runSeamA,
  sealedFamiliar,
  stage,
  tempDir,
  writeTree,
} from './helpers.mjs';

function expectFail(t, files, rule, prep) {
  const root = stage(t, files);
  if (prep) prep(root);
  const r = runSeamA(root);
  assert.equal(lastLine(r.stdout), 'RESULT: fail', r.out);
  assert.notEqual(r.code, 0, r.out);
  assert.ok(failRules(r.stdout).includes(rule), `expected rule "${rule}" in:\n${r.out}`);
  return r;
}

function expectPass(t, files, prep) {
  const root = stage(t, files);
  if (prep) prep(root);
  const r = runSeamA(root);
  assert.equal(r.code, 0, r.out);
  assert.equal(lastLine(r.stdout), 'RESULT: pass', r.out);
  return r;
}

const A = 'claude/agents/probe.md';

// ------------------------------------------------------------ the real tree

test('seam A passes on the repo payload, and lists every file it would install', t => {
  const root = tempDir(t);
  realPayload(root);
  const r = runSeamA(root);
  assert.equal(r.code, 0, r.out);
  assert.equal(lastLine(r.stdout), 'RESULT: pass', r.out);
  const installs = r.stdout.split('\n').filter(l => l.startsWith('INSTALL '));
  const dests = installs.map(l => l.split(' ')[3]).sort();
  assert.deepEqual(dests, [
    'CLAUDE.md',
    'agents/behaviour-lens.md',
    'agents/executability-lens.md',
    'agents/good-enough-lens.md',
    'agents/integrity-lens.md',
    'agents/scout.md',
    'agents/security-reviewer.md',
    'agents/unstated-lens.md',
    // The cross script (#45), at its one fixed live path.
    'pact/cross.mjs',
  ]);
  for (const l of installs) assert.match(l, /^INSTALL [0-9a-f]{64} \S+ \S+$/);
});

test('a minimal valid unmigrated agent passes', t => {
  expectPass(t, { [A]: plainAgent('probe') });
});

test('an install line carries the staged bytes hash', t => {
  const r = expectPass(t, { [A]: plainAgent('probe') });
  const line = r.stdout.split('\n').find(l => l.endsWith(' agents/probe.md'));
  assert.ok(line, r.out);
  const [, hash, src] = line.split(' ');
  assert.equal(src, 'claude/agents/probe.md');
  assert.match(hash, /^[0-9a-f]{64}$/);
});

test('CLAUDE.md is named as the rendered file, checked for form, imports, routing and the roster, not for meaning', t => {
  const r = expectPass(t, {});
  assert.doesNotMatch(r.stdout, /^NOTE unchecked: claude\/CLAUDE\.md/m);
  assert.match(
    r.stdout,
    /^NOTE partly-checked: claude\/CLAUDE\.md is the rendered rules file: its marked clauses are checked word for word, and its open text for form, imports, routing and the roster, not for meaning; line numbers count the rendered file$/m,
  );
});

test('the settings overlay is never listed for install', t => {
  const r = expectPass(t, {});
  assert.doesNotMatch(r.stdout, /^INSTALL .*settings\.overlay\.json/m);
});

// ------------------------------------------------------------ the allow-list (C5 row)

test('bad case: a shell in tools', t => {
  expectFail(t, { [A]: plainAgent('probe', [], 'tools: [Read, Glob, Grep, Bash]') }, 'tools');
});

test('bad case: hooks (one-line form reaches the key rule)', t => {
  expectFail(t, { [A]: plainAgent('probe', ['hooks: x']) }, 'keys');
});

test('bad case: hooks as a nested map fails the reader', t => {
  expectFail(t, { [A]: plainAgent('probe', ['hooks:', '  PreToolUse: x']) }, 'block-list');
});

test('bad case: an inline mcpServers', t => {
  expectFail(t, { [A]: plainAgent('probe', ['mcpServers: x']) }, 'keys');
});

test('bad case: an inline mcpServers as a flow map fails the reader', t => {
  expectFail(t, { [A]: plainAgent('probe', ['mcpServers: {a: b}']) }, 'value');
});

test('bad case: an omitted tools', t => {
  expectFail(t, { [A]: plainAgent('probe', [], null) }, 'tools-missing');
});

test('bad case: a permissionMode key', t => {
  expectFail(t, { [A]: plainAgent('probe', ['permissionMode: default']) }, 'keys');
});

test('bad case: allowed-tools', t => {
  expectFail(t, { [A]: plainAgent('probe', ['allowed-tools: Bash']) }, 'keys');
});

test('bad case: memory', t => {
  expectFail(t, { [A]: plainAgent('probe', ['memory: user']) }, 'keys');
});

test('bad case: a comma-form tools list', t => {
  expectFail(t, { [A]: plainAgent('probe', [], 'tools: Read, Glob, Grep') }, 'flow-form');
});

test('bad case: a duplicate tools key', t => {
  expectFail(t, { [A]: plainAgent('probe', ['tools: [Read, Glob, Grep, Bash]']) }, 'duplicate-key');
});

test('bad case: a name that differs from the stem', t => {
  expectFail(t, { [A]: plainAgent('other') }, 'name-stem');
});

test('bad case: two agents with one name', t => {
  expectFail(t, { 'claude/agents/probe.md': plainAgent('probe') }, 'name-duplicate', root => sealedFamiliar(root, 'probe'));
});

test('bad case: two agents whose names differ only in case', t => {
  // In two folders, since a folding disk cannot hold both in one.
  expectFail(t, { 'claude/agents/Probe.md': plainAgent('Probe') }, 'name-duplicate', root => sealedFamiliar(root, 'probe'));
});

test('bad case: two sources for one live path', t => {
  expectFail(t, { 'claude/agents/probe.md': plainAgent('probe') }, 'destination-duplicate', root => sealedFamiliar(root, 'probe'));
});

test('tools must match exactly: case', t => {
  expectFail(t, { [A]: plainAgent('probe', [], 'tools: [read, Glob, Grep]') }, 'tools');
});

test('tools must match exactly: a missing tool', t => {
  expectFail(t, { [A]: plainAgent('probe', [], 'tools: [Read, Glob]') }, 'tools');
});

test('tools must match exactly: a repeated tool', t => {
  expectFail(t, { [A]: plainAgent('probe', [], 'tools: [Read, Glob, Grep, Grep]') }, 'tools');
});

test('a listed agent gets its exact entry', t => {
  expectPass(t, {
    'claude/agents/security-reviewer.md': plainAgent('security-reviewer', [], 'tools: [Read, Glob, Grep, WebFetch, WebSearch]'),
  });
});

test('a listed agent with the default set fails', t => {
  expectFail(t, { 'claude/agents/security-reviewer.md': plainAgent('security-reviewer') }, 'tools');
});

test('the browser wildcard passes only where listed', t => {
  expectPass(t, {
    'claude/agents/behaviour-lens.md': plainAgent(
      'behaviour-lens',
      [],
      'tools: [Read, Glob, Grep, Bash, PowerShell, ToolSearch, mcp__Claude_Browser__*]',
    ),
  });
  expectFail(t, { [A]: plainAgent('probe', [], 'tools: [Read, Glob, Grep, mcp__Claude_Browser__*]') }, 'tools');
});

// The QA swap (#47): only behaviour-lens holds the shell and the browser.
test('bad case: integrity-lens given a shell fails', t => {
  expectFail(t, { 'claude/agents/integrity-lens.md': plainAgent('integrity-lens', [], 'tools: [Read, Glob, Grep, Bash]') }, 'tools');
});

test('bad case: behaviour-lens given a tool beyond its entry fails', t => {
  expectFail(
    t,
    { 'claude/agents/behaviour-lens.md': plainAgent('behaviour-lens', [], 'tools: [Read, Glob, Grep, Bash, PowerShell, ToolSearch, mcp__Claude_Browser__*, WebFetch]') },
    'tools',
  );
});

test('any other wildcard fails the reader', t => {
  expectFail(t, { [A]: plainAgent('probe', [], 'tools: [Read, Glob, Grep, mcp__x__*]') }, 'value');
});

test('an agent named like an object property is unlisted, not inherited', t => {
  expectPass(t, { 'claude/agents/constructor.md': plainAgent('constructor') });
  expectPass(t, { 'claude/agents/toString.md': plainAgent('toString') });
});

test('model, effort and metadata are allowed keys', t => {
  expectPass(t, { [A]: plainAgent('probe', ['model: opus', 'effort: low', 'metadata:', '  owner: pact']) });
});

// ------------------------------------------------------------ the strict reader

test('reader: a byte-order mark', t => {
  expectFail(t, { [A]: `﻿${plainAgent('probe')}` }, 'bom');
});

test('reader: a comment line', t => {
  expectFail(t, { [A]: plainAgent('probe', ['# note']) }, 'comment');
});

test('reader: a trailing comment after a value', t => {
  expectFail(t, { [A]: plainAgent('probe', ['model: opus # note']) }, 'value');
});

test('reader: a block list', t => {
  expectFail(t, { [A]: plainAgent('probe', [], 'tools:\n  - Read\n  - Glob\n  - Grep') }, 'block-list');
});

test('reader: a list item at column zero', t => {
  expectFail(t, { [A]: plainAgent('probe', ['- Read']) }, 'block-list');
});

test('reader: an indented line', t => {
  expectFail(t, { [A]: plainAgent('probe', ['  model: opus']) }, 'indented');
});

test('reader: a quoted list', t => {
  expectFail(t, { [A]: plainAgent('probe', [], 'tools: "[Read, Glob, Grep]"') }, 'quoted-list');
});

test('reader: a single-quoted list', t => {
  expectFail(t, { [A]: plainAgent('probe', [], "tools: '[Read, Glob, Grep]'") }, 'quoted-list');
});

test('reader: an invisible character', t => {
  expectFail(t, { [A]: plainAgent('probe', ['model: op​us']) }, 'invisible');
});

test('reader: an invisible character in the body', t => {
  expectFail(t, { [A]: agent(['name: probe', 'description: x', READ_ONLY], 'Bo‮dy.\n') }, 'invisible');
});

test('reader: a control character', t => {
  expectFail(t, { [A]: plainAgent('probe', ['model: op\u0007us']) }, 'characters');
});

test('reader: a carriage return', t => {
  expectFail(t, { [A]: plainAgent('probe').replace('\n', '\r\n') }, 'characters');
});

test('reader: a tab in the body is allowed', t => {
  expectPass(t, { [A]: agent(['name: probe', 'description: x', READ_ONLY], '```\n\tcode\n```\n') });
});

test('reader: a tab in the frontmatter fails', t => {
  expectFail(t, { [A]: plainAgent('probe', ['model:\topus']) }, 'value');
});

test('reader: a blank line in the frontmatter fails', t => {
  expectFail(t, { [A]: plainAgent('probe', ['']) }, 'blank');
});

test('reader: a block scalar fails', t => {
  expectFail(t, { [A]: plainAgent('probe', ['model: >', '  opus']) }, 'value');
});

test('reader: three dashes inside a frontmatter line fail', t => {
  expectFail(t, { [A]: agent(['name: probe', 'description: a --- b', READ_ONLY]) }, 'delimiter');
});

test('reader: a value YAML reads as a boolean or a number fails', t => {
  expectFail(t, { [A]: plainAgent('probe', ['model: yes']) }, 'value');
  expectFail(t, { [A]: plainAgent('probe', ['effort: 0x10']) }, 'value');
});

test('reader: a colon-space inside a plain value fails', t => {
  expectFail(t, { [A]: agent(['name: probe', 'description: a: b', READ_ONLY]) }, 'value');
});

test('reader: a quoted value is read', t => {
  expectPass(t, { [A]: agent(['name: probe', 'description: "a: b"', READ_ONLY]) });
});

test('reader: a duplicate metadata key', t => {
  expectFail(t, { [A]: plainAgent('probe', ['metadata:', '  a: x', '  a: y']) }, 'duplicate-key');
});

test('reader: a comment after a tab in a metadata value', t => {
  expectFail(t, { [A]: plainAgent('probe', ['metadata:', '  a: x\t#c']) }, 'value');
});

test('reader: a tab in a metadata value', t => {
  expectFail(t, { [A]: plainAgent('probe', ['metadata:', '  a: x\ty']) }, 'value');
});

test('reader: metadata nested deeper than two spaces', t => {
  expectFail(t, { [A]: plainAgent('probe', ['metadata:', '    a: x']) }, 'indented');
});

test('reader: no frontmatter', t => {
  expectFail(t, { [A]: 'name: probe\n' }, 'frontmatter');
});

test('reader: an unclosed frontmatter', t => {
  expectFail(t, { [A]: '---\nname: probe\ndescription: x\ntools: [Read, Glob, Grep]\n' }, 'frontmatter');
});

test('reader: invalid UTF-8', t => {
  const root = stage(t, {});
  mkdirSync(join(root, 'claude', 'agents'), { recursive: true });
  writeFileSync(join(root, 'claude', 'agents', 'probe.md'), Buffer.concat([Buffer.from(plainAgent('probe')), Buffer.from([0xff, 0xfe])]));
  const r = runSeamA(root);
  assert.ok(failRules(r.stdout).includes('encoding'), r.out);
});

// ------------------------------------------------------------ classification

test('classification: a file of no known kind in the payload', t => {
  expectFail(t, { 'claude/notes.txt': 'x\n' }, 'unclassified');
});

test('classification: an agent in a subfolder', t => {
  expectFail(t, { 'claude/agents/sub/probe.md': plainAgent('probe') }, 'unclassified');
});

test('classification: a non-.md file among the agents', t => {
  expectFail(t, { 'claude/agents/probe.txt': 'x\n' }, 'unclassified');
});

test('classification: a file of no known kind in familiars', t => {
  expectFail(t, { 'familiars/notes.txt': 'x\n' }, 'unclassified');
});

test('classification: a subfolder in familiars', t => {
  expectFail(t, { 'familiars/sub/probe.md': plainAgent('probe') }, 'unclassified');
});

test('classification: a contract suffix in another case is an agent, and fails as one', t => {
  // Alone in its folder: a folding disk cannot hold it beside probe.contract.md.
  const r = expectFail(t, { 'familiars/probe.CONTRACT.md': plainAgent('probe') }, 'familiar-name');
  assert.doesNotMatch(r.stdout, /^INSTALL .*probe\.CONTRACT\.md/m);
});

test('classification: a path with unsafe characters', t => {
  expectFail(t, { 'claude/agents/pro be.md': plainAgent('pro be') }, 'path');
});

test('classification: a symlink in the stage', t => {
  const root = stage(t, {});
  mkdirSync(join(root, 'claude', 'agents'), { recursive: true });
  const target = join(root, 'elsewhere.md');
  writeFileSync(target, plainAgent('probe'));
  try {
    symlinkSync(target, join(root, 'claude', 'agents', 'probe.md'), 'file');
  } catch {
    t.skip('symlinks need privileges here');
    return;
  }
  const r = runSeamA(root);
  assert.ok(failRules(r.stdout).includes('path'), r.out);
});

// ------------------------------------------------------------ familiars

test('a sealed familiar with its contract passes and installs to agents/<stem>.md', t => {
  const r = expectPass(t, {}, root => sealedFamiliar(root, 'probe'));
  assert.match(r.stdout, /^INSTALL [0-9a-f]{64} familiars\/probe\.md agents\/probe\.md$/m);
  assert.doesNotMatch(r.stdout, /^INSTALL .*contract/m);
});

test('a practice test is never installed', t => {
  const r = expectPass(t, { 'familiars/probe.practice-test.md': '# practice\n' }, root => sealedFamiliar(root, 'probe'));
  assert.doesNotMatch(r.stdout, /^INSTALL .*practice-test/m);
});

test('bad case: a familiar with its contract deleted (mark kept)', t => {
  expectFail(t, {}, 'contract', root => {
    sealedFamiliar(root, 'probe');
    rmSync(join(root, 'familiars', 'probe.contract.md'));
  });
});

test('bad case: a familiar with its contract and its mark both removed', t => {
  // The pinned check alone passes this file ("not built from a contract").
  const root = stage(t, { 'familiars/probe.md': plainAgent('probe') });
  const pinned = spawnSync(process.execPath, [PINNED, join(root, 'familiars', 'probe.md')], { encoding: 'utf8' });
  assert.equal(pinned.status, 1, 'the pinned check refuses tools without a contract; the case below still needs seam A');
  const r = runSeamA(root);
  assert.ok(failRules(r.stdout).includes('contract'), r.out);
  assert.ok(failRules(r.stdout).includes('mark'), r.out);
});

test('bad case: a familiar with no tools, no contract and no mark: the pinned check passes, seam A fails', t => {
  const root = stage(t, { 'familiars/probe.md': agent(['name: probe', 'description: x']) });
  const pinned = spawnSync(process.execPath, [PINNED, join(root, 'familiars', 'probe.md')], { encoding: 'utf8' });
  assert.equal(pinned.status, 0, pinned.stdout);
  const r = runSeamA(root);
  const rules = failRules(r.stdout);
  assert.ok(rules.includes('contract') && rules.includes('mark') && rules.includes('tools-missing'), r.out);
});

test('bad case: a contract whose Extra keys list hooks and permissionMode', t => {
  const r = expectFail(t, {}, 'keys', root =>
    sealedFamiliar(root, 'probe', {
      lines: ['name: probe', 'description: x', READ_ONLY, 'hooks: x', 'permissionMode: default'],
      contract: contractText('tools, model, effort, hooks, permissionMode'),
    }),
  );
  assert.ok(!failRules(r.stdout).some(x => x.startsWith('grimoire')), 'the pinned check passes this file; seam A must catch it');
});

test('bad case: a familiar edited after sealing fails through the pinned check', t => {
  expectFail(t, {}, 'grimoire/familiar-digest', root => {
    sealedFamiliar(root, 'probe');
    const p = join(root, 'familiars', 'probe.md');
    writeFileSync(p, readFileSync(p, 'utf8').replace('Body.', 'Changed.'));
  });
});

test('bad case: a familiar whose stem fails the name rule', t => {
  expectFail(t, { 'familiars/Probe.md': plainAgent('Probe'), 'familiars/Probe.contract.md': contractText() }, 'familiar-name');
});

test('a contract with no agent beside it is not installed and passes', t => {
  const r = expectPass(t, { 'familiars/orphan.contract.md': contractText() });
  assert.doesNotMatch(r.stdout, /orphan/);
});

// ------------------------------------------------------------ the gate's own files

function gateCopy(t, edit) {
  const g = tempDir(t);
  cpSync(join(GATE, 'clauses'), join(g, 'clauses'), { recursive: true });
  writeTree(g, {
    'seam-a.mjs': readFileSync(join(GATE, 'seam-a.mjs'), 'utf8'),
    'pact-text.mjs': readFileSync(join(GATE, 'pact-text.mjs'), 'utf8'),
    'shared.mjs': readFileSync(join(GATE, 'shared.mjs'), 'utf8'),
    'tool-allowlist.json': readFileSync(join(GATE, 'tool-allowlist.json'), 'utf8'),
    'grimoire/check.mjs': readFileSync(join(GATE, 'grimoire', 'check.mjs'), 'utf8'),
    'grimoire/check.mjs.pin': readFileSync(join(GATE, 'grimoire', 'check.mjs.pin'), 'utf8'),
  });
  edit(g);
  return join(g, 'seam-a.mjs');
}

test('gate: a pinned script that does not match its pin fails', t => {
  const script = gateCopy(t, g => writeFileSync(join(g, 'grimoire', 'check.mjs'), '// edited\n', { flag: 'a' }));
  const r = runSeamA(stage(t, {}), script);
  assert.ok(failRules(r.stdout).includes('pin'), r.out);
});

test('gate: a malformed pin file fails', t => {
  const script = gateCopy(t, g => writeFileSync(join(g, 'grimoire', 'check.mjs.pin'), 'sha256 abc\n'));
  const r = runSeamA(stage(t, {}), script);
  assert.ok(failRules(r.stdout).includes('pin'), r.out);
});

test('gate: a missing pinned script fails', t => {
  const script = gateCopy(t, g => rmSync(join(g, 'grimoire', 'check.mjs')));
  const r = runSeamA(stage(t, {}), script);
  assert.ok(failRules(r.stdout).includes('pin'), r.out);
});

test('gate: an allow-list with a duplicate key fails', t => {
  const script = gateCopy(t, g =>
    writeFileSync(join(g, 'tool-allowlist.json'), '{"probe": ["Read", "Glob", "Grep"], "probe": ["Read", "Glob", "Grep", "Bash"]}\n'),
  );
  const r = runSeamA(stage(t, {}), script);
  assert.ok(failRules(r.stdout).includes('allowlist'), r.out);
});

test('gate: an allow-list with a duplicate key spelled with an escape fails', t => {
  const script = gateCopy(t, g =>
    writeFileSync(join(g, 'tool-allowlist.json'), '{"probe": ["Read", "Glob", "Grep"], "pro\\u0062e": ["Read", "Glob", "Grep", "Bash"]}\n'),
  );
  const r = runSeamA(stage(t, {}), script);
  assert.ok(failRules(r.stdout).includes('allowlist'), r.out);
});
test('gate: an allow-list entry that is not a list of tool names fails', t => {
  const script = gateCopy(t, g => writeFileSync(join(g, 'tool-allowlist.json'), '{"probe": "Bash"}\n'));
  const r = runSeamA(stage(t, {}), script);
  assert.ok(failRules(r.stdout).includes('allowlist'), r.out);
});

test('gate: no stage root is a usage failure', t => {
  const r = spawnSync(process.execPath, [join(GATE, 'seam-a.mjs')], { encoding: 'utf8' });
  assert.notEqual(r.status, 0);
  assert.equal(lastLine(r.stdout), 'RESULT: fail');
});

test('gate: an internal error prints one fixed line and no detail', t => {
  const script = gateCopy(t, g => {
    const p = join(g, 'seam-a.mjs');
    writeFileSync(p, readFileSync(p, 'utf8').replace('// @@TEST-CRASH-HOOK@@', "throw new Error('CANARY-crash-detail');"));
  });
  const r = runSeamA(stage(t, {}), script);
  assert.equal(lastLine(r.stdout), 'RESULT: fail', r.out);
  assert.ok(failRules(r.stdout).includes('internal'), r.out);
  assert.doesNotMatch(r.out, /CANARY/);
});

// ------------------------------------------------------------ never echoes content

test('canary: no value, key, metadata key or duplicate key is echoed', t => {
  const C = 'CANARYzq';
  const files = {
    'claude/agents/a1.md': plainAgent('a1', [`model: ${C}: x`]),
    'claude/agents/a2.md': plainAgent('a2', [`${C}key: x`]),
    'claude/agents/a3.md': plainAgent('a3', ['metadata:', `  ${C.toLowerCase()}meta: x`, `  ${C.toLowerCase()}meta: y`]),
    'claude/agents/a4.md': plainAgent('a4', [`model: ${C}`, `model: ${C}`]),
    'claude/agents/a5.md': plainAgent('a5', [], `tools: [Read, Glob, Grep, ${C}]`),
    'claude/agents/a6.md': plainAgent('a6', [`# ${C}`]),
    'claude/agents/a7.md': agent([`name: ${C}`, 'description: x', READ_ONLY]),
    'claude/agents/a8.md': plainAgent('a8', [`description: "${C}"`]),
    'claude/agents/a9.md': plainAgent('a9', [`hooks: ${C}`]),
    'claude/agents/a10.md': plainAgent('a10', [`  ${C}: x`]),
    'familiars/b1.md': plainAgent('b1', [`${C}x: y`]),
    'familiars/b1.contract.md': contractText(`tools, ${C}x`),
  };
  const root = stage(t, files);
  // Sealed, so the pinned check runs on it and prints its own WARN line naming the key.
  sealedFamiliar(root, 'b2', {
    lines: ['name: b2', 'description: x', READ_ONLY, `${C.toLowerCase()}k: yy`],
    contract: contractText(`tools, ${C.toLowerCase()}k`),
  });
  const r = runSeamA(root);
  assert.equal(lastLine(r.stdout), 'RESULT: fail', r.out);
  assert.ok(!r.out.includes(C) && !r.out.includes(C.toLowerCase()), r.out);
});

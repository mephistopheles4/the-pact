// No installed file names the pact's old folder (spec 0007 S4, C1): the payload,
// its tools, hooks, commands and agents, and the pact's default configuration
// name ~/.pact. Reads files only; nothing here installs.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { REPO } from './text.mjs';

// The old folder as a path or as joined path parts. `.claude/pact-clef` (the clef tool's own folder) and a
// project's `.claude/pact-config.json` are other things and stay.
const OLD = [/\.claude(?:[\\/]+)pact(?![-\w])/, /['"]\.claude['"],\s*['"]pact['"]/, /\w*claude\w*, ['"]pact['"]/i, /claude\w*\}?\/pact(?![-\w])/i];
const names = text => OLD.some(re => re.test(text));

const filesUnder = dir => readdirSync(join(REPO, dir), { recursive: true }).map(f => `${dir}/${String(f).replaceAll('\\', '/')}`).filter(f => statSync(join(REPO, f)).isFile());

test('C1: no payload file, tool, hook, command or agent names ~/.claude/pact', () => {
  for (const bad of ['~/.claude/pact/review.md', 'C:\\Users\\x\\.claude\\pact', "join(home, '.claude', 'pact')", "join(claudeHome, 'pact', 'github.json')", '`${claudeDir}/pact/x`', "join(CLAUDE_HOME, 'pact')"]) assert.ok(names(bad), bad);
  for (const fine of ['~/.claude/pact-clef/', '.claude/pact-config.json', '~/.pact/review.md']) assert.ok(!names(fine), fine);
  const files = [...filesUnder('claude'), ...filesUnder('builder/default-config')];
  assert.ok(files.includes('claude/CLAUDE.md') && files.some(f => f.startsWith('claude/tools/')) && files.some(f => f.startsWith('claude/hooks/')), files.join('\n'));
  assert.deepEqual(files.filter(f => names(readFileSync(join(REPO, f), 'utf8'))), []);
});

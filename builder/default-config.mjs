#!/usr/bin/env node
// The pact's default configuration (#183 T4a): generated from one preset, the
// one editable source, into builder/default-config/, which the install renders
// on a home install with no pact/config.json of the person's own.
//
//   node builder/default-config.mjs           write builder/default-config/ from the preset
//   node builder/default-config.mjs --check   exit 1 when the committed copy is not what the preset gives
//
// It writes what the Scriptorium page saves for the preset taken whole:
// config.json, with one replace edit per part whose compiled text differs
// from the pact's, and blocks/<mark>.md for each, the part's text and a line
// break; then the preset's skills list, when it has one. The page and this
// script compile with the same code (builder/parts.mjs), and a gate test holds
// their files equal. A preset that sets agent files can't be the default: the
// default writes no agent file.
//
// A change to the preset, this script, builder/default-config/ or the
// installer's choice of the default takes the sensitive route (AGENTS.md),
// since it changes the security defaults of every install with no
// configuration.
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { changedParts, checkBuilder, isKit } from './build.mjs';

export const DEFAULT_PRESET_REL = 'builder/presets/level-3-full.json';
export const DEFAULT_DIR_REL = 'builder/default-config';

/** The default's files from the preset under `root`: [{ path, text }], config.json first, paths relative to the default folder. */
export function defaultFiles(root, preset = join(root, DEFAULT_PRESET_REL)) {
  const r = checkBuilder(root, preset);
  if (!r.builder) throw new Error(`default-config: the preset is refused: ${r.refusals.join('; ')}`);
  if (r.builder.ownAgentFiles) throw new Error('default-config: the preset sets agent files, and the default writes none');
  const config = { schema: 1 };
  const blocks = [];
  const edits = [];
  for (const [mark, text] of changedParts(root, r.builder.ownParts)) {
    edits.push({ mark, op: 'replace', file: `${mark}.md` });
    blocks.push({ path: `blocks/${mark}.md`, text: `${text}\n` });
  }
  if (edits.length) config.edits = edits;
  if (r.builder.ownSkills && r.builder.ownSkills.length) config.skills = r.builder.ownSkills;
  return [{ path: 'config.json', text: `${JSON.stringify(config, null, 2)}\n` }, ...blocks];
}

/** The files in the default folder now, as { path: text }, or null when it does not exist. */
function filesNow(dir) {
  if (!existsSync(dir)) return null;
  const out = {};
  const walk = rel => {
    for (const e of readdirSync(join(dir, rel), { withFileTypes: true })) {
      const p = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(p);
      else out[p] = readFileSync(join(dir, p), 'utf8');
    }
  };
  walk('');
  return out;
}

/** Whether the default folder under `root` holds exactly `files`. */
export function defaultUpToDate(root, files = defaultFiles(root)) {
  const now = filesNow(join(root, DEFAULT_DIR_REL));
  if (!now) return false;
  return Object.keys(now).length === files.length && files.every(f => now[f.path] === f.text);
}

function main(argv) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  if (argv.length > 1 || (argv.length === 1 && argv[0] !== '--check')) {
    process.stdout.write('usage: node builder/default-config.mjs [--check]\n');
    process.exitCode = 2;
    return;
  }
  // The builder kit carries the default as it was installed; only a clone regenerates it.
  if (isKit(root)) {
    process.stdout.write('REFUSE the builder kit never rebuilds the default configuration: run this in a clone of the pact\n');
    process.exitCode = 1;
    return;
  }
  const files = defaultFiles(root);
  if (defaultUpToDate(root, files)) {
    process.stdout.write(`${DEFAULT_DIR_REL} is up to date\n`);
    return;
  }
  if (argv[0] === '--check') {
    process.stdout.write(`${DEFAULT_DIR_REL} is out of date: run node builder/default-config.mjs\n`);
    process.exitCode = 1;
    return;
  }
  const dir = join(root, DEFAULT_DIR_REL);
  rmSync(dir, { recursive: true, force: true });
  for (const f of files) {
    const p = join(dir, ...f.path.split('/'));
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, f.text);
  }
  process.stdout.write(`${DEFAULT_DIR_REL} rebuilt\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2));

// PROTOTYPE for #143, throwaway: never merge to main.
// Renders builder/prototype-143/workflow-prototype.html, a file:// page under
// the same strict content policy as the builder: scripts and styles by hash.
// Run: node builder/prototype-143/make.mjs
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pactData } from '../build.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const pact = pactData(root);
const builder = JSON.parse(readFileSync(join(root, 'examples', 'pact-config', 'builder.json'), 'utf8'));
const presets = builder.presets.map(p => ({
  ...p,
  text: readFileSync(join(root, 'examples', 'pact-config', p.file), 'utf8'),
}));
// Sample lists standing in for a person's own skills, commands and agents.
const yours = {
  skills: [
    { name: 'tdd', about: 'Test-driven development, red-green-refactor.' },
    { name: 'diagnosing-bugs', about: 'Diagnosis loop for hard bugs.' },
    { name: 'codebase-design', about: 'Deep-module vocabulary for seams.' },
  ],
  commands: [
    { name: 'to-spec', about: 'Turn the conversation into a spec on the issue.' },
    { name: 'to-tickets', about: 'Cut an approved spec into tickets.' },
    { name: 'grill-me', about: 'Grill me until the idea is clear.' },
  ],
  agents: [{ name: 'my-reviewer', about: 'Your own reviewer agent.' }],
};
const data = {
  moves: pact.moves,
  always: pact.always,
  editable: pact.editable,
  setting: { name: pact.setting.name, def: pact.setting.def, min: pact.setting.min, max: pact.setting.max },
  agents: pact.agents,
  agentChoices: pact.agentChoices,
  presets,
  workflows: builder.workflows,
  yours,
};
const json = JSON.stringify(data).replace(/</g, '\\u003c');
const css = readFileSync(join(here, 'page.css'), 'utf8');
const js = `const DATA = ${json};\n${readFileSync(join(here, 'page.js'), 'utf8')}`;
const hash = s => `'sha256-${createHash('sha256').update(s, 'utf8').digest('base64')}'`;
const csp = `default-src 'none'; script-src ${hash(js)}; style-src ${hash(css)}; connect-src 'none'; img-src 'none'; base-uri 'none'; form-action 'none'`;
const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>PROTOTYPE: pact workflow builder</title>
<style>${css}</style>
</head>
<body>
<div class="proto-banner" role="note">PROTOTYPE for #143, throwaway. Nothing here is saved or installed.</div>
<header class="top">
  <h1>Workflow builder</h1>
  <label class="wf">Workflow <select id="workflow" aria-label="Load a saved workflow"></select></label>
  <label class="usage">Usage pause <input id="usage" type="number" aria-label="Usage pause line, percent"> %</label>
</header>
<main id="app"></main>
<div id="live" class="sr" aria-live="polite"></div>
<nav class="switcher" aria-label="Prototype variants">
  <button type="button" id="prev" aria-label="Previous variant">&larr;</button>
  <span id="vlabel"></span>
  <button type="button" id="next" aria-label="Next variant">&rarr;</button>
</nav>
<script>${js}</script>
</body>
</html>
`;
writeFileSync(join(here, 'workflow-prototype.html'), html);
console.log(`wrote ${join(here, 'workflow-prototype.html')} (${html.length} bytes)`);

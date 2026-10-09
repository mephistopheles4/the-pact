// PROTOTYPE v2 for #143, throwaway: never merge to main.
// Renders builder/prototype-143/workflow-prototype-v2.html under the builder's
// strict content policy (scripts and styles by hash, no network).
// Run: node builder/prototype-143/make-v2.mjs
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const read = f => readFileSync(join(here, f), 'utf8');
const css = `${read('page.css')}\n${read('v2.css')}`;
const js = `${read('v2-data.js')}\n${read('v2-page.js')}`;
const hash = s => `'sha256-${createHash('sha256').update(s, 'utf8').digest('base64')}'`;
const csp = `default-src 'none'; script-src ${hash(js)}; style-src ${hash(css)}; connect-src 'none'; img-src 'none'; base-uri 'none'; form-action 'none'`;
const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>PROTOTYPE v2: pact workflow builder</title>
<style>${css}</style>
</head>
<body>
<div class="proto-banner" role="note">PROTOTYPE v2 for #143, throwaway. Nothing here is saved or installed.</div>
<header class="top">
  <h1>Workflow builder</h1>
  <label class="wf">Preset <select id="preset" aria-label="Load a preset"></select></label>
</header>
<main id="app"></main>
<div id="live" class="sr" aria-live="polite"></div>
<script>${js}</script>
</body>
</html>
`;
writeFileSync(join(here, 'workflow-prototype-v2.html'), html);
console.log(`wrote workflow-prototype-v2.html (${html.length} bytes)`);

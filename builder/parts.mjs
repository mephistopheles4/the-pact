// The four parts Scriptorium builds (#262): tiers, sensitive, workflow and
// lenses. This module is their one source: the default data, the compiler
// that turns data into each part's text, and the builder's checks on it.
//
// build.mjs imports it to check a builder file and to run the compiled parts
// through the installer's renderer, and copies its source into the builder
// page, between the parts-code marks, with each "export " taken off. So the
// page and the check compile with the same code. It imports nothing and
// touches nothing: plain functions over plain data, safe in the page.
//
// The data, in a builder file (and in the page's state):
//   tiers:         [{ name, fits, plan, build }]            three, in TIER_KEYS order; plan may be 'none'
//   sensitive:     { items: [..], tier, plan, build }       the list Claude looks for, and the route it recommends
//   workflowGraph: { stages: [{ id, name, text, model: 'plan' | 'build' | 'owner', skipAt: [tier keys] }],
//                    offers: [{ id, stage, when, words, agents: [names], on }],
//                    links:  [{ from, to, when, on }],        an empty when is the stage's default way on
//                    skills: [{ id, stage, skill, mode: 'offered' | 'used', when, words, on }],   optional
//                                                             a skill or command at a stage: offered to me, or used
//                    layout: { <node id>: { x, y } } }        the canvas's positions; compiles to nothing
//   lenses:        [{ agents: [names], label, asks }]       the roster, one row each
//
// An offer with two agents is a pair; nothing else marks one. An offer on
// 'sensitive' runs on the sensitive route, once I take it.
//
// The compiled default of each part is the text between its marks in
// claude/CLAUDE.md, byte for byte; a builder test holds them together.

export const PART_MARKS = Object.freeze(['tiers', 'sensitive', 'workflow', 'lenses']);
export const TIER_KEYS = Object.freeze(['quick', 'standard', 'thorough']);
export const TIER_NAMES = Object.freeze(['Quick', 'Standard', 'Thorough']);
export const MODEL_CHOICES = Object.freeze(['Opus, low', 'Opus, medium', 'Opus, high', 'Sonnet, low', 'Sonnet, medium', 'Sonnet, high']);
export const STAGE_MODELS = Object.freeze(['plan', 'build', 'owner']);
// Each offer condition and the words it compiles to. 'words' compiles to the offer's own words.
export const OFFER_WHENS = Object.freeze({
  'every-build': 'every build',
  'standard-up': 'standard and above',
  thorough: 'thorough only',
  sensitive: 'on the sensitive route',
  'sensitive-declined': "once, when the change matches the list and the sensitive route wasn't taken",
  words: '',
});
// Caps on the data, so no builder file can make a part too long to read.
export const PARTS_CAPS = Object.freeze({ stages: 12, offers: 40, links: 40, skills: 40, agents: 4, items: 20, lenses: 20, line: 300, short: 60, layout: 400 });
// A skill node's two modes: offered (Claude offers it, I answer) or used (Claude runs it).
export const SKILL_MODES = Object.freeze(['offered', 'used']);

const SECURITY_PAIR = ['adversarial-lens', 'data-lens'];

export const DEFAULT_PARTS = Object.freeze({
  tiers: [
    { name: 'Quick', fits: 'Small, one session, no plan needed', plan: 'none', build: 'Opus, low' },
    { name: 'Standard', fits: 'Needs a short spec', plan: 'Opus, medium', build: 'Sonnet, medium' },
    { name: 'Thorough', fits: 'Too big for one session, or risky; cut into tickets, each its own session', plan: 'Opus, high', build: 'Sonnet, medium' },
  ],
  sensitive: { items: ['auth', 'secrets', 'crypto', 'input validation', 'data migrations'], tier: 'thorough', plan: 'Opus, high', build: 'Opus, high' },
  workflowGraph: {
    stages: [
      { id: 'plan', name: 'Plan', text: 'Kind, size and risk; a tier proposed.', model: 'plan', skipAt: [] },
      { id: 'design', name: 'Design', text: 'The spec: intent, unhappy paths, decisions.', model: 'plan', skipAt: ['quick'] },
      { id: 'build', name: 'Build', text: 'Test-first; tests and gates decide.', model: 'build', skipAt: [] },
      { id: 'test', name: 'Test', text: 'Each claim checked against the ask.', model: 'build', skipAt: [] },
      { id: 'deploy', name: 'Deploy', text: 'I accept and ship; nothing promotes itself.', model: 'owner', skipAt: [] },
      { id: 'maintain', name: 'Maintain', text: 'What escaped, and what to change.', model: 'plan', skipAt: [] },
    ],
    offers: [
      { id: 'design-spec-pair', stage: 'design', when: 'standard-up', words: '', agents: ['executability-lens', 'good-enough-lens'], on: true },
      { id: 'design-unstated', stage: 'design', when: 'standard-up', words: '', agents: ['unstated-lens'], on: true },
      { id: 'design-security-pair', stage: 'design', when: 'sensitive', words: '', agents: ['adversarial-lens', 'data-lens'], on: true },
      { id: 'test-qa-pair', stage: 'test', when: 'every-build', words: '', agents: ['behaviour-lens', 'integrity-lens'], on: true },
      { id: 'test-standards-pair', stage: 'test', when: 'standard-up', words: '', agents: ['conventions-lens', 'reader-lens'], on: true },
      { id: 'test-unstated', stage: 'test', when: 'standard-up', words: '', agents: ['unstated-lens'], on: true },
      { id: 'test-security-pair', stage: 'test', when: 'sensitive', words: '', agents: ['adversarial-lens', 'data-lens'], on: true },
      { id: 'test-security-backstop', stage: 'test', when: 'sensitive-declined', words: '', agents: ['adversarial-lens', 'data-lens'], on: true },
    ],
    links: [
      { from: 'plan', to: 'design', when: '', on: true },
      { from: 'design', to: 'build', when: '', on: true },
      { from: 'build', to: 'test', when: '', on: true },
      { from: 'test', to: 'deploy', when: '', on: true },
      { from: 'deploy', to: 'maintain', when: '', on: true },
      { from: 'test', to: 'build', when: 'a claim fails', on: true },
      { from: 'test', to: 'design', when: 'the intent has changed', on: true },
      { from: 'maintain', to: 'plan', when: 'a new change starts', on: true },
    ],
    layout: {},
  },
  lenses: [
    { agents: ['behaviour-lens', 'integrity-lens'], label: 'the QA pair', asks: 'Does the change do what was asked? Can the tests behind the pass actually fail?' },
    { agents: ['executability-lens', 'good-enough-lens'], label: 'the spec pair', asks: 'Would the spec, built as written, run end to end? What could be cut or deferred, and what would it save?' },
    { agents: ['unstated-lens'], label: '', asks: 'What need did nobody write down?' },
    { agents: ['conventions-lens', 'reader-lens'], label: 'the standards pair', asks: "Does the diff keep the repo's written rules? Can the next reader act on what it says?" },
    { agents: ['adversarial-lens', 'data-lens'], label: 'the security pair', asks: 'Which attack paths does no control stop? Where can the data leak?' },
  ],
});

/** A deep copy of plain data. */
export function copyParts(p) {
  return JSON.parse(JSON.stringify(p));
}

const tick = n => `\`${n}\``;
/** "a", "a and b", "a, b and c". */
export function listJoin(xs) {
  return xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;
}
/** "Opus, high" read as "Opus at high". */
const modelWords = m => m.replace(', ', ' at ');

/** Prose wrapped at 77 columns, as the rules file is: words kept whole, single spaces. */
export function wrap(text, width = 77) {
  const out = [];
  let line = '';
  for (const w of text.split(' ')) {
    if (line && line.length + 1 + w.length > width) {
      out.push(line);
      line = w;
    } else line = line ? `${line} ${w}` : w;
  }
  if (line) out.push(line);
  return out.join('\n');
}

/** A table row from its cells: an empty cell is one space between its bars. */
const row = cells => `|${cells.map(c => (c ? ` ${c} ` : ' ')).join('|')}|`;
const rule = n => row(Array.from({ length: n }, () => '---'));

export function compileTiers(p) {
  return [row(['Tier', 'Fits', 'Plan', 'Build']), rule(4), ...p.tiers.map(t => row([`**${t.name}**`, t.fits, t.plan, t.build]))].join('\n');
}

export function compileSensitive(p) {
  const s = p.sensitive;
  const models = s.plan === s.build ? `planned and built on ${modelWords(s.plan)}` : `planned on ${modelWords(s.plan)} and built on ${modelWords(s.build)}`;
  return wrap([
    `Sensitive work gets more checking when I choose it. By default, sensitive work is ${listJoin(s.items)}: ${s.tier}, ${models}, with the security pair, ${tick(SECURITY_PAIR[0])} and ${tick(SECURITY_PAIR[1])}, on the spec and the diff. That is the sensitive route.`,
    'When the work matches that list, or you think it sensitive otherwise, say why in one line in your tier proposal and recommend the route; I take it or not.',
    "If I didn't take the route, offer the security pair once more at Test when the change matches the list. Beyond that one offer, sensitivity doesn't stop the run.",
    "A flag or an offer I haven't answered stays open, in one line, in every hand-off and in the result.",
    'If you find it later, say so in one line at the next hand-off or result, and keep saying it until I answer.',
  ].join(' '));
}

/** The stages in the order the work takes them: along the default ways on from the first, then any not reached, in list order. */
export function stagesInOrder(g) {
  const byId = new Map(g.stages.map(s => [s.id, s]));
  const defaults = g.links.filter(l => !l.when && l.on !== false && byId.has(l.from) && byId.has(l.to));
  const out = [];
  const seen = new Set();
  let cur = g.stages.find(s => !defaults.some(l => l.to === s.id)) || g.stages[0];
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    out.push(cur);
    const next = defaults.find(l => l.from === cur.id);
    cur = next && byId.get(next.to);
  }
  return out.concat(g.stages.filter(s => !seen.has(s.id)));
}

/** What a tier, or the sensitive route, sets at a stage. */
export function stageCell(p, st, tierIndex) {
  if (st.model === 'owner') return 'I decide';
  if (tierIndex === null) return p.sensitive[st.model];
  if (st.skipAt.includes(TIER_KEYS[tierIndex])) return 'skipped';
  const v = p.tiers[tierIndex][st.model];
  return v === 'none' ? 'in the session, no plan' : v;
}

/** An offer's words: its lenses and when. */
export function offerText(o) {
  return `${o.agents.map(tick).join(', ')}: ${o.when === 'words' ? o.words : OFFER_WHENS[o.when]}`;
}

/** A skill's words: its name, offered or used, and when. */
export function skillText(k) {
  return `${tick(k.skill)}: ${k.mode}, ${k.when === 'words' ? k.words : OFFER_WHENS[k.when]}`;
}

/** A link's words: back, on or ahead, by the order the work takes the stages. */
export function linkText(g, l, order = stagesInOrder(g)) {
  const i = order.findIndex(s => s.id === l.from);
  const j = order.findIndex(s => s.id === l.to);
  const to = order[j];
  return `${j <= i ? 'back to' : j === i + 1 ? 'on to' : 'ahead to'} ${to ? to.name : '?'} when ${l.when}`;
}

export function compileWorkflow(p) {
  const g = p.workflowGraph;
  const order = stagesInOrder(g);
  // A Skills column only when a skill is on the graph, so the pact's default table stays as it is.
  const skills = (g.skills || []).filter(k => k.on !== false && g.stages.some(st => st.id === k.stage));
  const head = row(['Stage', ...p.tiers.map(t => t.name), 'Sensitive route', 'Lenses offered, and when', ...(skills.length ? ['Skills, and when'] : []), 'Other ways out']);
  const rows = order.map(st => row([
    st.name,
    ...p.tiers.map((_, i) => stageCell(p, st, i)),
    stageCell(p, st, null),
    g.offers.filter(o => o.stage === st.id && o.on !== false).map(offerText).join('; ') || 'none',
    ...(skills.length ? [skills.filter(k => k.stage === st.id).map(skillText).join('; ') || 'none'] : []),
    g.links.filter(l => l.from === st.id && l.when && l.on !== false).map(l => linkText(g, l, order)).join('; '),
  ]));
  return [head, rule(p.tiers.length + 4 + (skills.length ? 1 : 0)), ...rows].join('\n');
}

export function compileLenses(p) {
  return [row(['Lens', 'Asks']), rule(2), ...p.lenses.map(r => row([`${r.agents.map(tick).join(', ')}${r.label ? ` (${r.label})` : ''}`, r.asks]))].join('\n');
}

/** Each part's text: { tiers, sensitive, workflow, lenses }. */
export function compileParts(p) {
  return { tiers: compileTiers(p), sensitive: compileSensitive(p), workflow: compileWorkflow(p), lenses: compileLenses(p) };
}

// ------------------------------------------------------------ the builder's checks

const ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const AGENT_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
// A skill or a command, as the builder file's own lists name them: a command may lead with a /.
const SKILL_RE = /^\/?[A-Za-z0-9][A-Za-z0-9:._-]{0,79}$/;
const isObj = v => typeof v === 'object' && v !== null && !Array.isArray(v);
const keysIn = (o, ks) => Object.keys(o).every(k => ks.includes(k));
// One line of text that keeps a table cell whole: no line break and no bar.
const lineOk = (v, max) => typeof v === 'string' && v.length <= max && !/[\n\r|]/.test(v);

/** The pairs the roster names: rows of two lenses. */
export function rosterPairs(p) {
  return (Array.isArray(p.lenses) ? p.lenses : []).filter(r => Array.isArray(r.agents) && r.agents.length === 2).map(r => ({ agents: r.agents, label: r.label || r.agents.join(' and ') }));
}

/**
 * What is wrong with the four parts' data: [{ part, level: 'error' | 'warn', text }].
 * An error is a builder refusal (the page won't save; build.mjs refuses the
 * file). A warn is a finding. Messages are fixed text, ids and lens names
 * that passed their patterns, never a field's own words.
 */
export function partsProblems(p) {
  const out = [];
  const err = (part, text) => out.push({ part, level: 'error', text });
  const C = PARTS_CAPS;

  if (!Array.isArray(p.tiers) || p.tiers.length !== TIER_KEYS.length) err('tiers', `tiers must list ${TIER_NAMES.join(', ')}, in that order`);
  else
    p.tiers.forEach((t, i) => {
      if (!isObj(t) || !keysIn(t, ['name', 'fits', 'plan', 'build']) || t.name !== TIER_NAMES[i]) return err('tiers', `tier ${i + 1} must be ${TIER_NAMES[i]}, with only name, fits, plan and build`);
      if (!lineOk(t.fits, C.line) || !t.fits.trim()) err('tiers', `${TIER_NAMES[i]}: fits must be one line of 1 to ${C.line} characters, with no bar`);
      if (!(t.plan === 'none' || MODEL_CHOICES.includes(t.plan))) err('tiers', `${TIER_NAMES[i]}: plan must be none or one of the model choices`);
      if (!MODEL_CHOICES.includes(t.build)) err('tiers', `${TIER_NAMES[i]}: build must be one of the model choices`);
    });

  const s = p.sensitive;
  if (!isObj(s) || !keysIn(s, ['items', 'tier', 'plan', 'build'])) err('sensitive', 'sensitive must hold only items, tier, plan and build');
  else {
    if (!Array.isArray(s.items) || !s.items.length || s.items.length > C.items || s.items.some(x => !lineOk(x, C.short) || !x.trim() || /[,:]/.test(x))) err('sensitive', `the list must hold 1 to ${C.items} items, each one line of at most ${C.short} characters, with no comma, colon or bar`);
    if (!TIER_KEYS.includes(s.tier)) err('sensitive', `the route's tier must be one of ${TIER_KEYS.join(', ')}`);
    if (!MODEL_CHOICES.includes(s.plan) || !MODEL_CHOICES.includes(s.build)) err('sensitive', "the route's plan and build must be model choices");
  }

  const g = p.workflowGraph;
  if (!isObj(g) || !keysIn(g, ['stages', 'offers', 'links', 'skills', 'layout']) || (Object.hasOwn(g, 'skills') && !Array.isArray(g.skills)) || !Array.isArray(g.stages) || !Array.isArray(g.offers) || !Array.isArray(g.links)) {
    err('workflow', 'workflowGraph must hold stages, offers and links lists, and a layout');
  } else {
    const ids = new Set();
    if (!g.stages.length || g.stages.length > C.stages) err('workflow', `1 to ${C.stages} stages`);
    g.stages.forEach((st, i) => {
      if (!isObj(st) || !keysIn(st, ['id', 'name', 'text', 'model', 'skipAt']) || typeof st.id !== 'string' || !ID_RE.test(st.id)) return err('workflow', `stage ${i + 1}: needs an id of lowercase letters, digits and hyphens, and only name, text, model and skipAt beside it`);
      if (ids.has(st.id)) err('workflow', `stage ${st.id}: the id is used twice`);
      ids.add(st.id);
      if (!lineOk(st.name, C.short) || !st.name.trim()) err('workflow', `stage ${st.id}: name must be one line of 1 to ${C.short} characters, with no bar`);
      if (!lineOk(st.text, C.line)) err('workflow', `stage ${st.id}: text must be one line of at most ${C.line} characters`);
      if (!STAGE_MODELS.includes(st.model)) err('workflow', `stage ${st.id}: model must be plan, build or owner`);
      if (!Array.isArray(st.skipAt) || st.skipAt.some(k => !TIER_KEYS.includes(k))) err('workflow', `stage ${st.id}: skipAt must list tier keys`);
    });
    const oids = new Set();
    if (g.offers.length > C.offers) err('workflow', `at most ${C.offers} offers`);
    g.offers.forEach((o, i) => {
      if (!isObj(o) || !keysIn(o, ['id', 'stage', 'when', 'words', 'agents', 'on']) || typeof o.id !== 'string' || !ID_RE.test(o.id)) return err('workflow', `offer ${i + 1}: needs an id of lowercase letters, digits and hyphens, and only stage, when, words, agents and on beside it`);
      if (oids.has(o.id) || ids.has(o.id)) err('workflow', `offer ${o.id}: the id is used twice`);
      oids.add(o.id);
      if (!ids.has(o.stage)) err('workflow', `offer ${o.id}: its stage is not in the graph`);
      if (!Object.hasOwn(OFFER_WHENS, o.when)) err('workflow', `offer ${o.id}: when must be one of ${Object.keys(OFFER_WHENS).join(', ')}`);
      if (o.when === 'words' ? !lineOk(o.words, C.line) || !String(o.words).trim() : Object.hasOwn(o, 'words') && o.words !== '') err('workflow', `offer ${o.id}: words, one line of at most ${C.line} characters, only and always with when "words"`);
      if (!Array.isArray(o.agents) || !o.agents.length || o.agents.length > C.agents || o.agents.some(a => typeof a !== 'string' || !AGENT_RE.test(a)) || new Set(o.agents).size !== o.agents.length) err('workflow', `offer ${o.id}: 1 to ${C.agents} different agents, each a name of lowercase letters, digits and hyphens`);
      if (typeof o.on !== 'boolean') err('workflow', `offer ${o.id}: on must be true or false`);
    });
    const kids = new Set();
    const skills = g.skills || [];
    if (skills.length > C.skills) err('workflow', `at most ${C.skills} skills`);
    skills.forEach((k, i) => {
      if (!isObj(k) || !keysIn(k, ['id', 'stage', 'skill', 'mode', 'when', 'words', 'on']) || typeof k.id !== 'string' || !ID_RE.test(k.id)) return err('workflow', `skill ${i + 1}: needs an id of lowercase letters, digits and hyphens, and only stage, skill, mode, when, words and on beside it`);
      if (kids.has(k.id) || oids.has(k.id) || ids.has(k.id)) err('workflow', `skill ${k.id}: the id is used twice`);
      kids.add(k.id);
      if (!ids.has(k.stage)) err('workflow', `skill ${k.id}: its stage is not in the graph`);
      if (typeof k.skill !== 'string' || !SKILL_RE.test(k.skill)) err('workflow', `skill ${k.id}: the skill's name must be letters, digits, '.', '_', '-' or ':', with an optional leading /`);
      if (!SKILL_MODES.includes(k.mode)) err('workflow', `skill ${k.id}: mode must be offered or used`);
      if (!Object.hasOwn(OFFER_WHENS, k.when)) err('workflow', `skill ${k.id}: when must be one of ${Object.keys(OFFER_WHENS).join(', ')}`);
      if (k.when === 'words' ? !lineOk(k.words, C.line) || !String(k.words).trim() : Object.hasOwn(k, 'words') && k.words !== '') err('workflow', `skill ${k.id}: words, one line of at most ${C.line} characters, only and always with when "words"`);
      if (typeof k.on !== 'boolean') err('workflow', `skill ${k.id}: on must be true or false`);
    });
    if (g.links.length > C.links) err('workflow', `at most ${C.links} links`);
    g.links.forEach((l, i) => {
      if (!isObj(l) || !keysIn(l, ['from', 'to', 'when', 'on']) || !ids.has(l.from) || !ids.has(l.to) || l.from === l.to) return err('workflow', `link ${i + 1}: must join two different stages of the graph, with only from, to, when and on`);
      if (!lineOk(l.when, C.line)) err('workflow', `link ${i + 1}: when must be one line of at most ${C.line} characters`);
      if (typeof l.on !== 'boolean') err('workflow', `link ${i + 1}: on must be true or false`);
    });
    if (!isObj(g.layout) || Object.keys(g.layout).length > C.layout || Object.values(g.layout).some(v => !isObj(v) || !keysIn(v, ['x', 'y']) || ![v.x, v.y].every(n => Number.isFinite(n) && Math.abs(n) <= 100000))) err('workflow', `layout must map at most ${C.layout} node ids to { x, y } numbers`);
    // S2: the builder refuses a stage with two default ways on, and default ways on in a circle.
    if (!out.some(f => f.part === 'workflow')) {
      const defaults = g.links.filter(l => !l.when && l.on !== false);
      for (const st of g.stages) if (defaults.filter(l => l.from === st.id).length > 1) err('workflow', `stage ${st.id} has two default ways on: give all but one a condition`);
      const next = new Map(defaults.map(l => [l.from, l.to]));
      for (const st of g.stages) {
        const seen = new Set();
        let cur = st.id;
        while (cur && !seen.has(cur)) {
          seen.add(cur);
          cur = next.get(cur);
        }
        if (cur === st.id) {
          err('workflow', 'the default ways on go round in a circle: one of them needs a condition, or the work never ends');
          break;
        }
      }
    }
  }

  if (!Array.isArray(p.lenses) || !p.lenses.length || p.lenses.length > C.lenses) err('lenses', `the roster must hold 1 to ${C.lenses} rows`);
  else
    p.lenses.forEach((r, i) => {
      if (!isObj(r) || !keysIn(r, ['agents', 'label', 'asks'])) return err('lenses', `row ${i + 1}: only agents, label and asks`);
      if (!Array.isArray(r.agents) || !r.agents.length || r.agents.length > C.agents || r.agents.some(a => typeof a !== 'string' || !AGENT_RE.test(a))) err('lenses', `row ${i + 1}: 1 to ${C.agents} agents, each a name of lowercase letters, digits and hyphens`);
      if (!lineOk(r.label, C.short)) err('lenses', `row ${i + 1}: label must be one line of at most ${C.short} characters`);
      if (!lineOk(r.asks, C.line) || !r.asks.trim()) err('lenses', `row ${i + 1}: asks must be one line of 1 to ${C.line} characters, with no bar`);
    });

  // A finding, never a refusal: one lens of a pair alone on an offer.
  if (!out.some(f => f.level === 'error'))
    for (const o of g.offers)
      for (const pair of rosterPairs(p)) {
        const has = pair.agents.filter(a => o.agents.includes(a)).length;
        if (has === 1) out.push({ part: 'workflow', level: 'warn', text: `offer ${o.id}: half of ${pair.label} on its own; a pair's reports are crossed, so run both or neither` });
      }
  return out;
}

/** Every text field of the parts, for the content-policy scan: [where, text]. */
export function partsTexts(p) {
  const out = [];
  const add = (where, v) => {
    if (typeof v === 'string') out.push([where, v]);
  };
  (Array.isArray(p.tiers) ? p.tiers : []).forEach((t, i) => isObj(t) && ['name', 'fits', 'plan', 'build'].forEach(k => add(`tiers ${i + 1}`, t[k])));
  if (isObj(p.sensitive)) {
    (Array.isArray(p.sensitive.items) ? p.sensitive.items : []).forEach((x, i) => add(`sensitive item ${i + 1}`, x));
    ['tier', 'plan', 'build'].forEach(k => add('sensitive', p.sensitive[k]));
  }
  const g = isObj(p.workflowGraph) ? p.workflowGraph : {};
  (Array.isArray(g.stages) ? g.stages : []).forEach((s, i) => isObj(s) && ['id', 'name', 'text'].forEach(k => add(`stage ${i + 1}`, s[k])));
  (Array.isArray(g.offers) ? g.offers : []).forEach((o, i) => isObj(o) && ['id', 'words'].forEach(k => add(`offer ${i + 1}`, o[k])));
  (Array.isArray(g.skills) ? g.skills : []).forEach((s, i) => isObj(s) && ['id', 'skill', 'words'].forEach(k => add(`skill ${i + 1}`, s[k])));
  (Array.isArray(g.links) ? g.links : []).forEach((l, i) => isObj(l) && add(`link ${i + 1}`, l.when));
  (Array.isArray(p.lenses) ? p.lenses : []).forEach((r, i) => isObj(r) && ['label', 'asks'].forEach(k => add(`lenses row ${i + 1}`, r[k])));
  return out;
}

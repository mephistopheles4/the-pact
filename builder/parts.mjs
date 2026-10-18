// The parts Scriptorium builds (#262): tiers, sensitive, workflow, lenses,
// qualities (#273) and cost limits (#278). This module is their one source: the default data, the compiler
// that turns data into each part's text, and the builder's checks on it.
//
// build.mjs imports it to check a builder file and to run the compiled parts
// through the installer's renderer, and copies its source into the builder
// page, between the parts-code marks, with each "export " taken off. So the
// page and the check compile with the same code. It imports nothing and
// touches nothing: plain functions over plain data, safe in the page.
//
// The data, in a builder file (and in the page's state):
//   tiers:         [{ id, name, fits, plan, build }]        1 to 6, lightest first; plan may be 'none'
//   sensitive:     { items: [..], tier, plan, build }       the list Claude looks for, and the route it recommends; tier is a tier id
//   workflowGraph: { stages: [{ id, name, text, model: 'plan' | 'build' | 'owner', skipAt: [tier ids] }],
//                    offers: [{ id, stage, when, words, agents: [names], on, tiers? }],   tiers: [tier ids], only with when 'tiers'
//                    links:  [{ from, to, when, on }],        an empty when is the stage's default way on
//                    skills: [{ id, stage, skill, mode: 'offered' | 'used', when, words, on, tiers? }],   optional
//                                                             a skill or command at a stage: offered to me, or used
//                    layout: { <node id>: { x, y } } }        the canvas's positions; compiles to nothing
//   lenses:        [{ agents: [names], label, asks }]       the roster, one row each
//   qualities:     [{ quality, measure, lenses: [names], enough?, enoughCosts?: [cost names] }]  a measure may be empty;
//                                                           enough is a level, enoughCosts the cost limits it answers to
//   costLimits:    [{ cost, counted, limit, atLimit }]      1 to 9 rows; an empty limit is the owner's judgment (#278)
//
// An offer with two agents is a pair; nothing else marks one. An offer on
// 'sensitive' runs on the sensitive route, once I take it.
//
// The compiled default of each part is the text between its marks in
// claude/CLAUDE.md, byte for byte; a builder test holds them together.

export const PART_MARKS = Object.freeze(['moves', 'tiers', 'sensitive', 'workflow', 'lenses', 'qualities', 'cost-limits']);
// The tiers (#262): any number from 1 to TIERS_MAX, lightest first, each with
// an id the stages, offers and the route point at. A builder file from before
// carries three tiers with no ids; upgradeParts gives them these.
export const TIER_KEYS = Object.freeze(['quick', 'standard', 'thorough']);
export const TIERS_MAX = 6;
// A model and its effort, as the tables write them: "Opus, medium". The
// builder offers them as two dropdowns, the models from the person's Models
// list, which starts as MODEL_NAMES (#262 S19).
export const MODEL_NAMES = Object.freeze(['Opus', 'Sonnet', 'Haiku', 'Fable']);
export const EFFORTS = Object.freeze(['low', 'medium', 'high', 'xhigh', 'max']);
// A model the person adds takes the renderer's agent model shape (#262): one
// word, with no space or line break. The renderer keeps its own copy, and a
// builder test holds them equal.
export const MODEL_RE = /^\S{1,128}$/;
export const MODELS_CAP = 32;

/** Whether `m` is a model the gate takes: one word of the shape. */
export function modelOk(m) {
  return typeof m === 'string' && MODEL_RE.test(m);
}

/** Whether `v` is "<model>, <effort>", as a tier or the route takes it. */
export function modelChoiceOk(v) {
  const m = typeof v === 'string' ? /^([^,]+), ([a-z]+)$/.exec(v) : null;
  return !!m && modelOk(m[1]) && EFFORTS.includes(m[2]);
}

/** An agent's model line for a Models-list entry: a built-in name in lower case, anything else as typed. */
export function agentModelOf(name) {
  return MODEL_NAMES.includes(name) ? name.toLowerCase() : name;
}

/** The Models list's problems, as text: a list of 1 to MODELS_CAP models of the shape, none twice. */
export function modelsProblems(list) {
  if (!Array.isArray(list) || !list.length || list.length > MODELS_CAP) return [`the models list must hold 1 to ${MODELS_CAP} models`];
  const out = [];
  list.forEach((m, i) => {
    if (!modelOk(m)) out.push(`model ${i + 1} must be one word, with no space or line break, up to 128 characters`);
  });
  const lower = list.filter(m => typeof m === 'string').map(m => m.toLowerCase());
  if (new Set(lower).size !== lower.length) out.push('the models list names one model twice');
  return out;
}
export const STAGE_MODELS = Object.freeze(['plan', 'build', 'owner']);
// Each offer condition and the words it compiles to. 'words' compiles to the
// offer's own words, and 'tiers' to its tiers' names (tiersWords).
export const OFFER_WHENS = Object.freeze({
  'every-build': 'every build',
  tiers: '',
  sensitive: 'on the sensitive route',
  'sensitive-declined': "once, when the change matches the list and the sensitive route wasn't taken",
  words: '',
});
// Caps on the data, so no builder file can make a part too long to read.
export const PARTS_CAPS = Object.freeze({ moves: 12, stages: 12, offers: 40, links: 40, skills: 40, agents: 4, items: 20, lenses: 20, qualities: 16, costLimits: 9, measure: 160, line: 300, short: 60, layout: 400 });
// The ISO/IEC 25010:2023 qualities (#273): the names a project's own list takes, and the builder offers.
export const QUALITY_NAMES = Object.freeze(['Functional suitability', 'Performance efficiency', 'Compatibility', 'Interaction capability', 'Reliability', 'Security', 'Maintainability', 'Flexibility', 'Safety']);
// A skill node's two modes: offered (Claude offers it, I answer) or used (Claude runs it).
export const SKILL_MODES = Object.freeze(['offered', 'used']);

const SECURITY_PAIR = ['adversarial-lens', 'data-lens'];

export const DEFAULT_PARTS = Object.freeze({
  // The moves (#262): how I work, upheld at all times. Each is a lead-in and its text, one paragraph.
  moves: [
    { lead: 'Sense the work', text: 'What kind of work is it, how big, how risky, and do I know enough to plan it? Size sets how much checking it needs. A target I can know gets a plan; an unknown one gets an experiment first. A bug is reproduced and traced to its start before anyone fixes it.' },
    { lead: 'Think before doing', text: 'I get the intent clear enough to defend: what it is for, how it can go wrong, and why each decision is right. When the intent is still forming, a prototype finds it.' },
    { lead: 'Checkpoint the seams', text: "Where work is handed on, published or decided, anything costly waits for a checkpoint. A light checkpoint is a check of mine that runs without me, such as a test. A heavy one is my decision before the work moves. The harder a step is to undo, the heavier its checkpoint. When in doubt, it's heavy." },
    { lead: 'Stay the owner', text: 'I own a result when I can verify it, reconstruct why it is right, and know when to stop it. Checks that could have failed are the evidence.' },
  ],
  tiers: [
    { id: 'quick', name: 'Quick', fits: 'Small, one session, no plan needed', plan: 'none', build: 'Opus, low' },
    { id: 'standard', name: 'Standard', fits: 'Needs a short spec', plan: 'Opus, medium', build: 'Sonnet, medium' },
    { id: 'thorough', name: 'Thorough', fits: 'Too big for one session, or risky; cut into tickets, each its own session', plan: 'Opus, high', build: 'Sonnet, medium' },
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
      { id: 'design-spec-pair', stage: 'design', when: 'tiers', tiers: ['standard', 'thorough'], words: '', agents: ['executability-lens', 'unstated-lens'], on: true },
      { id: 'design-security-pair', stage: 'design', when: 'sensitive', words: '', agents: ['adversarial-lens', 'data-lens'], on: true },
      { id: 'test-qa-pair', stage: 'test', when: 'every-build', words: '', agents: ['behaviour-lens', 'integrity-lens'], on: true },
      { id: 'test-standards-pair', stage: 'test', when: 'tiers', tiers: ['standard', 'thorough'], words: '', agents: ['conventions-lens', 'reader-lens'], on: true },
      { id: 'test-unstated', stage: 'test', when: 'tiers', tiers: ['standard', 'thorough'], words: '', agents: ['unstated-lens'], on: true },
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
    { agents: ['behaviour-lens', 'integrity-lens'], label: 'the QA pair', asks: 'Does the change do what was asked? Can the tests behind the pass actually fail, and does each one earn its place?' },
    { agents: ['executability-lens', 'unstated-lens'], label: 'the spec pair', asks: 'Would the spec, built as written, run end to end? What need did nobody write down?' },
    { agents: ['unstated-lens'], label: 'the gatekeeper', asks: 'What need did nobody write down?' },
    { agents: ['conventions-lens', 'reader-lens'], label: 'the standards pair', asks: "Does the diff keep the repo's written rules? Can the next reader act on what it says?" },
    { agents: ['adversarial-lens', 'data-lens'], label: 'the security pair', asks: 'Which attack paths does no control stop? Where can the data leak?' },
  ],
  qualities: [
    { quality: 'Functional suitability', measure: 'the acceptance claims', lenses: ['behaviour-lens', 'integrity-lens', 'unstated-lens'], enoughCosts: ['Tests added', 'Follow-up issues'] },
    { quality: 'Performance efficiency', measure: 'a budget: time, memory, size', lenses: ['behaviour-lens'] },
    { quality: 'Reliability', measure: 'a failure, and the recovery accepted', lenses: ['behaviour-lens'] },
    { quality: 'Compatibility', measure: 'named interfaces that stay stable: formats, flags, config keys, APIs', lenses: ['conventions-lens'] },
    { quality: 'Interaction capability', measure: 'a task a new user completes', lenses: ['reader-lens', 'behaviour-lens'] },
    { quality: 'Security', measure: 'an ASVS 5.0 level or chapters', lenses: ['adversarial-lens', 'data-lens'], enoughCosts: ['Hardening', 'Follow-up issues'] },
    { quality: 'Maintainability', measure: "the repo's written rules", lenses: ['conventions-lens', 'reader-lens'] },
    { quality: 'Flexibility', measure: 'the environments it must install and run on', lenses: ['executability-lens', 'behaviour-lens'] },
    { quality: 'Safety', measure: 'the risky actions, the warning, the safe state on failure', lenses: ['executability-lens'] },
  ],
  // The cost limits (#278): what the work may spend to reach the qualities, and what happens at each limit.
  costLimits: [
    { cost: 'Tests added', counted: 'Tests beyond one per acceptance claim', limit: '2 per change', atLimit: 'The finding becomes a trade-off for me: the test, the claim it would back, and its upkeep' },
    { cost: 'Hardening', counted: 'Guards for paths that are not security findings, as Cost limits defines them', limit: '0', atLimit: 'Reported as an accepted-risk candidate; never built unasked' },
    { cost: 'Follow-up issues', counted: 'Issues filed from one review', limit: '2', atLimit: "The rest listed as notes in the review's record; I pick which to file" },
  ],
});

/** A deep copy of plain data. */
export function copyParts(p) {
  return JSON.parse(JSON.stringify(p));
}

/**
 * A builder file from before tiers took ids (#262), brought up to date in
 * place: three tiers with no ids take TIER_KEYS, and the retired conditions
 * "standard and above" and "thorough only" become their tiers. Anything else
 * is left for partsProblems to judge.
 */
export function upgradeParts(p) {
  if (Array.isArray(p.tiers) && p.tiers.length === TIER_KEYS.length && p.tiers.every(t => isObj(t) && !Object.hasOwn(t, 'id'))) p.tiers = p.tiers.map((t, i) => ({ id: TIER_KEYS[i], ...t }));
  const old = { 'standard-up': ['standard', 'thorough'], thorough: ['thorough'] };
  const g = isObj(p.workflowGraph) ? p.workflowGraph : {};
  for (const o of [...(Array.isArray(g.offers) ? g.offers : []), ...(Array.isArray(g.skills) ? g.skills : [])])
    if (isObj(o) && Object.hasOwn(old, o.when)) {
      o.tiers = [...old[o.when]];
      o.when = 'tiers';
    }
  // A builder file from before the cost limits (#278) has none: it takes the default.
  if (!Object.hasOwn(p, 'costLimits')) p.costLimits = copyParts(DEFAULT_PARTS.costLimits);
  return p;
}

// Agents the pact retired (#302): a saved builder file that still names one loses the name when it loads. The renderer (gate/render-core.mjs) and the install (gate/install-core.mjs) keep their own copies, which a test holds equal to each other; no test holds this one equal to them.
export const RETIRED_AGENTS = Object.freeze(['good-enough-lens']);

/**
 * Takes every retired agent's name out of `p`, in place: the lens offers, the
 * lens rows and the qualities' lens lists. An offer or row left with no agent
 * goes. When the name leaves a spec pair that holds executability-lens, that
 * pair takes unstated-lens in its place, and a separate offer of unstated-lens
 * alone at the same stage goes, as the pact's own Design row reads (#302).
 * Returns true when anything was taken out.
 */
export function dropRetired(p) {
  let dropped = false;
  const SPEC = 'executability-lens';
  const SECOND = 'unstated-lens';
  // Drops the retired names from `xs`; a list that held one and also holds SPEC takes SECOND in its place.
  const clean = xs => {
    if (!Array.isArray(xs)) return xs;
    const keep = xs.filter(a => !RETIRED_AGENTS.includes(a));
    if (keep.length === xs.length) return xs;
    dropped = true;
    if (keep.includes(SPEC) && !keep.includes(SECOND)) keep.push(SECOND);
    return keep;
  };
  const g = isObj(p.workflowGraph) ? p.workflowGraph : null;
  if (g && Array.isArray(g.offers)) {
    const pairStages = new Set();
    for (const o of g.offers) {
      if (!isObj(o)) continue;
      const before = Array.isArray(o.agents) ? o.agents.length : 0;
      o.agents = clean(o.agents);
      if (Array.isArray(o.agents) && o.agents.length > 0 && before && o.agents.includes(SPEC) && o.agents.includes(SECOND)) pairStages.add(o.stage);
    }
    // A separate offer of the second lens alone goes only when the pair at its stage now covers it: the same condition and tiers.
    const same = (a, b) => a.when === b.when && JSON.stringify(a.tiers ?? null) === JSON.stringify(b.tiers ?? null);
    const covered = o => g.offers.some(q => isObj(q) && q !== o && q.stage === o.stage && Array.isArray(q.agents) && q.agents.includes(SPEC) && q.agents.includes(SECOND) && same(q, o));
    g.offers = g.offers.filter(o => !isObj(o) || !Array.isArray(o.agents) || (o.agents.length && !(o.agents.length === 1 && o.agents[0] === SECOND && dropped && pairStages.has(o.stage) && covered(o))));
  }
  if (Array.isArray(p.lenses)) {
    for (const r of p.lenses) if (isObj(r)) r.agents = clean(r.agents);
    p.lenses = p.lenses.filter(r => !isObj(r) || !Array.isArray(r.agents) || r.agents.length);
  }
  if (Array.isArray(p.qualities)) for (const q of p.qualities) if (isObj(q)) q.lenses = clean(q.lenses);
  return dropped;
}

/**
 * The parts made to agree with their tiers, in place: a stage skips only
 * tiers that exist, an offer or a skill at tiers keeps those that exist, or
 * else takes the heaviest, and the route's tier, when gone, is the heaviest.
 * Run after a tier is removed, or after tiers and a workflow from different
 * sources meet, such as a preset's tiers taken without its workflow.
 */
export function reconcileTiers(p) {
  if (!Array.isArray(p.tiers) || !p.tiers.length || !isObj(p.workflowGraph)) return p;
  const ids = p.tiers.map(t => (isObj(t) ? t.id : undefined));
  const heaviest = ids[ids.length - 1];
  const g = p.workflowGraph;
  for (const st of Array.isArray(g.stages) ? g.stages : []) if (isObj(st) && Array.isArray(st.skipAt)) st.skipAt = st.skipAt.filter(k => ids.includes(k));
  for (const o of [...(Array.isArray(g.offers) ? g.offers : []), ...(Array.isArray(g.skills) ? g.skills : [])])
    if (isObj(o) && o.when === 'tiers' && Array.isArray(o.tiers)) {
      o.tiers = o.tiers.filter(k => ids.includes(k));
      if (!o.tiers.length) o.tiers = [heaviest];
    }
  if (isObj(p.sensitive) && !ids.includes(p.sensitive.tier)) p.sensitive.tier = heaviest;
  return p;
}

/**
 * An offer's tiers in words, lightest first: "standard and above" when they
 * run from one tier to the heaviest, "thorough only" for the heaviest alone,
 * "at every tier" for all of them, and otherwise "at quick and thorough".
 */
export function tiersWords(p, ids) {
  const names = p.tiers.map(t => t.name.toLowerCase());
  const at = p.tiers.map((t, i) => (ids.includes(t.id) ? i : -1)).filter(i => i >= 0);
  const last = p.tiers.length - 1;
  if (at.length === p.tiers.length) return 'at every tier';
  if (at.length === 1 && at[0] === last && last > 0) return `${names[last]} only`;
  if (at.length > 1 && at[at.length - 1] === last && at.length === last - at[0] + 1 && at[0] > 0) return `${names[at[0]]} and above`;
  return `at ${listJoin(at.map(i => names[i]))}`;
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

export /** The moves: each a bullet with its lead-in in bold, its text wrapped under it. */
function compileMoves(p) {
  return p.moves.map(m => [`- **${m.lead}.**`, ...wrap(m.text, 75).split('\n').map(l => `  ${l}`)].join('\n')).join('\n');
}

const tierName = (p, id) => (p.tiers.find(t => t.id === id) || { name: id }).name.toLowerCase();

function compileTiers(p) {
  return [row(['Tier', 'Fits', 'Plan', 'Build']), rule(4), ...p.tiers.map(t => row([`**${t.name}**`, t.fits, t.plan, t.build]))].join('\n');
}

/** The stage that holds the offer made when the sensitive route wasn't taken, by name; Test when none does. */
function backstopStage(p) {
  const g = p.workflowGraph;
  const o = g && Array.isArray(g.offers) ? g.offers.find(x => x && x.when === 'sensitive-declined') : null;
  const st = o && Array.isArray(g.stages) ? g.stages.find(x => x && x.id === o.stage) : null;
  return st && typeof st.name === 'string' && st.name.trim() ? st.name : 'Test';
}

export function compileSensitive(p) {
  const s = p.sensitive;
  const models = s.plan === s.build ? `planned and built on ${modelWords(s.plan)}` : `planned on ${modelWords(s.plan)} and built on ${modelWords(s.build)}`;
  return wrap([
    `Sensitive work gets more checking when I choose it. By default, sensitive work is ${listJoin(s.items)}: ${tierName(p, s.tier)}, ${models}, with the security pair, ${tick(SECURITY_PAIR[0])} and ${tick(SECURITY_PAIR[1])}, on the spec and the diff. That is the sensitive route.`,
    'When the work matches that list, or you think it sensitive otherwise, say why in one line in your tier proposal and recommend the route; I take it or not.',
    `If I didn't take the route, offer the security pair once more at ${backstopStage(p)} when the change matches the list. Beyond that one offer, sensitivity doesn't stop the run.`,
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
  if (st.skipAt.includes(p.tiers[tierIndex].id)) return 'skipped';
  const v = p.tiers[tierIndex][st.model];
  return v === 'none' ? 'in the session, no plan' : v;
}

/** When an offer or a skill comes, in words. */
export function whenWords(p, o) {
  return o.when === 'words' ? o.words : o.when === 'tiers' ? tiersWords(p, o.tiers) : OFFER_WHENS[o.when];
}

/** An offer's words: its lenses and when. */
export function offerText(p, o) {
  return `${o.agents.map(tick).join(', ')}: ${whenWords(p, o)}`;
}

/** A skill's words: its name, offered or used, and when. */
export function skillText(p, k) {
  return `${tick(k.skill)}: ${k.mode}, ${whenWords(p, k)}`;
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
    g.offers.filter(o => o.stage === st.id && o.on !== false).map(o => offerText(p, o)).join('; ') || 'none',
    ...(skills.length ? [skills.filter(k => k.stage === st.id).map(k => skillText(p, k)).join('; ') || 'none'] : []),
    g.links.filter(l => l.from === st.id && l.when && l.on !== false).map(l => linkText(g, l, order)).join('; '),
  ]));
  return [head, rule(p.tiers.length + 4 + (skills.length ? 1 : 0)), ...rows].join('\n');
}

export function compileLenses(p) {
  return [row(['Lens', 'Asks']), rule(2), ...p.lenses.map(r => row([`${r.agents.map(tick).join(', ')}${r.label ? ` (${r.label})` : ''}`, r.asks]))].join('\n');
}

/** A quality's Enough cell (#278): its level, then each cost it answers to by name only, joined by a middle dot. */
export function enoughCell(q) {
  return [q.enough, ...(Array.isArray(q.enoughCosts) ? q.enoughCosts : [])].filter(x => typeof x === 'string' && x).join(' \u00b7 ');
}

/** The qualities part (#273): the list, each quality with its measure and the lenses that check it. An Enough column joins only when a row sets one (#278). */
export function compileQualities(p) {
  const enough = p.qualities.some(q => enoughCell(q));
  return [row(['Quality', 'Measure', 'Lens', ...(enough ? ['Enough'] : [])]), rule(enough ? 4 : 3), ...p.qualities.map(q => row([q.quality, q.measure, q.lenses.map(tick).join(', '), ...(enough ? [enoughCell(q)] : [])]))].join('\n');
}

/** The cost limits part (#278): the table, four columns. */
export function compileCostLimits(p) {
  return [row(['Cost', 'Counted as', 'Limit', 'At the limit']), rule(4), ...p.costLimits.map(c => row([c.cost, c.counted, c.limit, c.atLimit]))].join('\n');
}

/** Each part's text: { moves, tiers, sensitive, workflow, lenses, qualities, 'cost-limits' }. */
export function compileParts(p) {
  return { moves: compileMoves(p), tiers: compileTiers(p), sensitive: compileSensitive(p), workflow: compileWorkflow(p), lenses: compileLenses(p), qualities: compileQualities(p), 'cost-limits': compileCostLimits(p) };
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

  if (!Array.isArray(p.moves) || !p.moves.length || p.moves.length > C.moves) err('moves', `the moves must hold 1 to ${C.moves} moves`);
  else
    p.moves.forEach((m, i) => {
      if (!isObj(m) || !keysIn(m, ['lead', 'text'])) return err('moves', `move ${i + 1}: only lead and text`);
      if (!lineOk(m.lead, C.short) || !m.lead.trim() || /\*/.test(m.lead)) err('moves', `move ${i + 1}: the lead-in must be one line of 1 to ${C.short} characters, with no asterisk`);
      if (typeof m.text !== 'string' || !m.text.trim() || /[\r\n]/.test(m.text)) err('moves', `move ${i + 1}: the text must be one paragraph, on one line`);
    });

  const tierIds = new Set();
  if (!Array.isArray(p.tiers) || !p.tiers.length || p.tiers.length > TIERS_MAX) err('tiers', `tiers must list 1 to ${TIERS_MAX} tiers`);
  else
    p.tiers.forEach((t, i) => {
      if (!isObj(t) || !keysIn(t, ['id', 'name', 'fits', 'plan', 'build']) || typeof t.id !== 'string' || !ID_RE.test(t.id)) return err('tiers', `tier ${i + 1}: needs an id of lowercase letters, digits and hyphens, and only name, fits, plan and build beside it`);
      if (tierIds.has(t.id)) err('tiers', `tier ${t.id}: the id is used twice`);
      tierIds.add(t.id);
      if (!lineOk(t.name, C.short) || !t.name.trim() || /\*/.test(t.name)) err('tiers', `tier ${t.id}: name must be one line of 1 to ${C.short} characters, with no bar or asterisk`);
      if (!lineOk(t.fits, C.line) || !t.fits.trim()) err('tiers', `tier ${t.id}: fits must be one line of 1 to ${C.line} characters, with no bar`);
      if (!(t.plan === 'none' || modelChoiceOk(t.plan))) err('tiers', `tier ${t.id}: plan must be none or a model and an effort`);
      if (!modelChoiceOk(t.build)) err('tiers', `tier ${t.id}: build must be a model and an effort`);
    });
  const names = (Array.isArray(p.tiers) ? p.tiers : []).filter(t => isObj(t) && typeof t.name === 'string').map(t => t.name.trim().toLowerCase());
  if (new Set(names).size !== names.length) err('tiers', 'two tiers have one name');
  // A list of tier ids: at least one, each a tier, none twice.
  const tiersOk = v => Array.isArray(v) && v.length > 0 && v.every(k => tierIds.has(k)) && new Set(v).size === v.length;

  const s = p.sensitive;
  if (!isObj(s) || !keysIn(s, ['items', 'tier', 'plan', 'build'])) err('sensitive', 'sensitive must hold only items, tier, plan and build');
  else {
    if (!Array.isArray(s.items) || !s.items.length || s.items.length > C.items || s.items.some(x => !lineOk(x, C.short) || !x.trim() || /[,:]/.test(x))) err('sensitive', `the list must hold 1 to ${C.items} items, each one line of at most ${C.short} characters, with no comma, colon or bar`);
    if (!tierIds.has(s.tier)) err('sensitive', "the route's tier must be one of the tiers");
    if (!modelChoiceOk(s.plan) || !modelChoiceOk(s.build)) err('sensitive', "the route's plan and build must each be a model and an effort");
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
      if (!Array.isArray(st.skipAt) || st.skipAt.some(k => !tierIds.has(k)) || new Set(st.skipAt).size !== st.skipAt.length) err('workflow', `stage ${st.id}: skipAt must list tiers, each once`);
    });
    const oids = new Set();
    if (g.offers.length > C.offers) err('workflow', `at most ${C.offers} offers`);
    g.offers.forEach((o, i) => {
      if (!isObj(o) || !keysIn(o, ['id', 'stage', 'when', 'words', 'agents', 'on', 'tiers']) || typeof o.id !== 'string' || !ID_RE.test(o.id)) return err('workflow', `offer ${i + 1}: needs an id of lowercase letters, digits and hyphens, and only stage, when, words, agents, on and tiers beside it`);
      if (oids.has(o.id) || ids.has(o.id)) err('workflow', `offer ${o.id}: the id is used twice`);
      oids.add(o.id);
      if (!ids.has(o.stage)) err('workflow', `offer ${o.id}: its stage is not in the graph`);
      if (!Object.hasOwn(OFFER_WHENS, o.when)) err('workflow', `offer ${o.id}: when must be one of ${Object.keys(OFFER_WHENS).join(', ')}`);
      if (o.when === 'words' ? !lineOk(o.words, C.line) || !String(o.words).trim() : Object.hasOwn(o, 'words') && o.words !== '') err('workflow', `offer ${o.id}: words, one line of at most ${C.line} characters, only and always with when "words"`);
      if (o.when === 'tiers' ? !tiersOk(o.tiers) : Object.hasOwn(o, 'tiers')) err('workflow', `offer ${o.id}: tiers, a list of the tiers, only and always with when "tiers"`);
      if (!Array.isArray(o.agents) || !o.agents.length || o.agents.length > C.agents || o.agents.some(a => typeof a !== 'string' || !AGENT_RE.test(a)) || new Set(o.agents).size !== o.agents.length) err('workflow', `offer ${o.id}: 1 to ${C.agents} different agents, each a name of lowercase letters, digits and hyphens`);
      if (typeof o.on !== 'boolean') err('workflow', `offer ${o.id}: on must be true or false`);
    });
    const kids = new Set();
    const skills = g.skills || [];
    if (skills.length > C.skills) err('workflow', `at most ${C.skills} skills`);
    skills.forEach((k, i) => {
      if (!isObj(k) || !keysIn(k, ['id', 'stage', 'skill', 'mode', 'when', 'words', 'on', 'tiers']) || typeof k.id !== 'string' || !ID_RE.test(k.id)) return err('workflow', `skill ${i + 1}: needs an id of lowercase letters, digits and hyphens, and only stage, skill, mode, when, words, on and tiers beside it`);
      if (kids.has(k.id) || oids.has(k.id) || ids.has(k.id)) err('workflow', `skill ${k.id}: the id is used twice`);
      kids.add(k.id);
      if (!ids.has(k.stage)) err('workflow', `skill ${k.id}: its stage is not in the graph`);
      if (typeof k.skill !== 'string' || !SKILL_RE.test(k.skill)) err('workflow', `skill ${k.id}: the skill's name must be letters, digits, '.', '_', '-' or ':', with an optional leading /`);
      if (!SKILL_MODES.includes(k.mode)) err('workflow', `skill ${k.id}: mode must be offered or used`);
      if (!Object.hasOwn(OFFER_WHENS, k.when)) err('workflow', `skill ${k.id}: when must be one of ${Object.keys(OFFER_WHENS).join(', ')}`);
      if (k.when === 'words' ? !lineOk(k.words, C.line) || !String(k.words).trim() : Object.hasOwn(k, 'words') && k.words !== '') err('workflow', `skill ${k.id}: words, one line of at most ${C.line} characters, only and always with when "words"`);
      if (k.when === 'tiers' ? !tiersOk(k.tiers) : Object.hasOwn(k, 'tiers')) err('workflow', `skill ${k.id}: tiers, a list of the tiers, only and always with when "tiers"`);
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

  // The qualities (#273): rows, each a quality, its measure (empty when none is known yet) and 1 to 4 lenses.
  if (!Array.isArray(p.qualities) || !p.qualities.length || p.qualities.length > C.qualities) err('qualities', `the list must hold 1 to ${C.qualities} qualities`);
  else {
    p.qualities.forEach((q, i) => {
      if (!isObj(q) || !keysIn(q, ['quality', 'measure', 'lenses', 'enough', 'enoughCosts'])) return err('qualities', `row ${i + 1}: only quality, measure, lenses, enough and enoughCosts (the Enough level and the costs it answers to)`);
      if (Object.hasOwn(q, 'enough') && !lineOk(q.enough, C.short)) err('qualities', `row ${i + 1}: the Enough level must be one line of at most ${C.short} characters, with no bar`);
      if (Object.hasOwn(q, 'enoughCosts') && (!Array.isArray(q.enoughCosts) || q.enoughCosts.length > C.costLimits || q.enoughCosts.some(c => !lineOk(c, C.short) || !c.trim())))
        err('qualities', `row ${i + 1}: the costs it answers to must list at most ${C.costLimits} cost names, each one line of 1 to ${C.short} characters, with no bar`);
      if (!lineOk(q.quality, C.short) || !q.quality.trim()) err('qualities', `row ${i + 1}: the quality must be one line of 1 to ${C.short} characters, with no bar`);
      if (!lineOk(q.measure, C.measure)) err('qualities', `row ${i + 1}: the measure must be one line of at most ${C.measure} characters, with no bar`);
      if (!Array.isArray(q.lenses) || !q.lenses.length || q.lenses.length > C.agents || q.lenses.some(a => typeof a !== 'string' || !AGENT_RE.test(a))) err('qualities', `row ${i + 1}: 1 to ${C.agents} lenses, each a name of lowercase letters, digits and hyphens`);
    });
    const names = p.qualities.filter(isObj).map(q => String(q.quality).toLowerCase());
    if (new Set(names).size !== names.length) err('qualities', 'the list names one quality twice');
    // A finding: an agent with no roster row.
    if (Array.isArray(p.lenses)) {
      const roster = new Set(p.lenses.flatMap(r => (isObj(r) && Array.isArray(r.agents) ? r.agents : [])));
      p.qualities.forEach((q, i) => isObj(q) && Array.isArray(q.lenses) && q.lenses.filter(a => !roster.has(a)).forEach(a => out.push({ part: 'qualities', level: 'warn', text: `row ${i + 1}: ${a} has no roster row` })));
    }
  }

  // The cost limits (#278): 1 to 9 rows of four one-line fields. Names match ignoring case and surrounding space; the limit may be empty.
  const costNames = [];
  if (!Array.isArray(p.costLimits) || !p.costLimits.length || p.costLimits.length > C.costLimits) err('cost-limits', `the list must hold 1 to ${C.costLimits} cost rows`);
  else {
    p.costLimits.forEach((c, i) => {
      if (!isObj(c) || !keysIn(c, ['cost', 'counted', 'limit', 'atLimit'])) return err('cost-limits', `row ${i + 1}: only cost, counted, limit and atLimit`);
      if (!lineOk(c.cost, C.short) || !c.cost.trim()) err('cost-limits', `row ${i + 1}: the cost must be one line of 1 to ${C.short} characters, with no bar`);
      else costNames.push(c.cost.trim().toLowerCase());
      if (!lineOk(c.counted, C.measure)) err('cost-limits', `row ${i + 1}: Counted as must be one line of at most ${C.measure} characters, with no bar`);
      if (!lineOk(c.limit, C.short)) err('cost-limits', `row ${i + 1}: the limit must be one line of at most ${C.short} characters, with no bar`);
      if (!lineOk(c.atLimit, C.line)) err('cost-limits', `row ${i + 1}: At the limit must be one line of at most ${C.line} characters, with no bar`);
    });
    if (new Set(costNames).size !== costNames.length) err('cost-limits', 'the list names one cost twice');
    // An Enough that names no cost row is an error; a cost no quality names binds no lens, a finding.
    const named = new Set();
    for (const [i, q] of (Array.isArray(p.qualities) ? p.qualities : []).entries())
      if (isObj(q) && Array.isArray(q.enoughCosts))
        for (const n of q.enoughCosts) {
          if (typeof n !== 'string') continue;
          if (costNames.includes(n.trim().toLowerCase())) named.add(n.trim().toLowerCase());
          else err('qualities', `row ${i + 1}: a cost it answers to has no row in the cost limits`);
        }
    p.costLimits.forEach((c, i) => isObj(c) && typeof c.cost === 'string' && c.cost.trim() && !named.has(c.cost.trim().toLowerCase()) && out.push({ part: 'cost-limits', level: 'warn', text: `row ${i + 1}: no quality names this cost, so it holds back no lens` }));
  }

  // A finding, never a refusal: one lens of a pair alone on an offer. A lens the roster also lists on its own row (the gatekeeper, #302) may be offered alone at Test, but only a lens the pact's own roster lists on its own row, so a row added to a file never switches the warning off.
  const ownAlone = DEFAULT_PARTS.lenses.filter(r => r.agents.length === 1).map(r => r.agents[0]);
  const aloneRows = (Array.isArray(p.lenses) ? p.lenses : []).filter(r => Array.isArray(r.agents) && r.agents.length === 1).map(r => r.agents[0]).filter(a => ownAlone.includes(a));
  if (!out.some(f => f.level === 'error'))
    for (const o of g.offers)
      for (const pair of rosterPairs(p)) {
        const has = pair.agents.filter(a => o.agents.includes(a)).length;
        if (has === 1 && !(o.stage === 'test' && o.agents.length === 1 && aloneRows.includes(o.agents[0]))) out.push({ part: 'workflow', level: 'warn', text: `offer ${o.id}: half of ${pair.agents.join(' and ')} on its own; a pair's reports are crossed, so run both or neither` });
      }
  return out;
}

/** Every text field of the parts, for the content-policy scan: [where, text]. */
export function partsTexts(p) {
  const out = [];
  const add = (where, v) => {
    if (typeof v === 'string') out.push([where, v]);
  };
  (Array.isArray(p.moves) ? p.moves : []).forEach((m, i) => isObj(m) && ['lead', 'text'].forEach(k => add(`move ${i + 1}`, m[k])));
  (Array.isArray(p.tiers) ? p.tiers : []).forEach((t, i) => isObj(t) && ['id', 'name', 'fits', 'plan', 'build'].forEach(k => add(`tiers ${i + 1}`, t[k])));
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
  (Array.isArray(p.qualities) ? p.qualities : []).forEach((q, i) => {
    if (!isObj(q)) return;
    ['quality', 'measure', 'enough'].forEach(k => add(`qualities row ${i + 1}`, q[k]));
    (Array.isArray(q.enoughCosts) ? q.enoughCosts : []).forEach(c => add(`qualities row ${i + 1}`, c));
  });
  (Array.isArray(p.costLimits) ? p.costLimits : []).forEach((c, i) => isObj(c) && ['cost', 'counted', 'limit', 'atLimit'].forEach(k => add(`cost limits row ${i + 1}`, c[k])));
  return out;
}

// What each harness receives (spec 0007 S6, S7): from the configured rules, the
// agent and command files, and each taken harness's description, the files the
// install writes. Pure: text in, text out, no I/O. Each refusal is an
// install-core Refusal with one rule id, and no text prints a file's content.
//
// The files are keyed by their path in the stage: rendered/<harness>/rules.md,
// rendered/<harness>/agents/<file>, rendered/<harness>/commands/<name>.md, and
// rendered/skills/<name>/, one folder every harness with skills reads.
//
// Nothing here runs on import. Imports install-core.mjs and harnesses.mjs only.

import { CAPABILITIES, EFFORT_SLOT } from './harnesses.mjs';
import { AGENT_EFFORTS, RENDERED_REL, Refusal, TOOL_TABLES, builtParts } from './install-core.mjs';

export const ROLES = Object.freeze(['planning', 'executor', 'light']);
// Claude's model names, an alias or a full ID: a rules text that holds one names a model outright (C8).
const MODEL_NAME_RE = /\b(?:Opus|Sonnet|Haiku|Fable|claude-(?:opus|sonnet|haiku|fable)[A-Za-z0-9.-]*[A-Za-z0-9])\b/g;
const OPEN_RE = /^ *<!-- pact:(if|unless) ([a-z][a-z0-9-]*) -->\r?$/;
const END_RE = /^ *<!-- pact:end -->\r?$/;
const MODELS_RE = /^<!-- pact:models -->\r?$/;
const FRONT_RE = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;
// A Codex agent keeps its shell (S12); these switches are what its file can turn off.
const CODEX_AGENT_OFF = Object.freeze(['apps', 'plugins', 'memories', 'request_permissions_tool']);
const READ_TOOLS = Object.freeze(['Read', 'Glob', 'Grep']);
// A codex-toml agent reads through its shell alone, whatever tools its source names (S7).
const SHELL_READS = 'You have no Read, Glob or Grep tool here. Where these instructions name one, search and read with shell commands that only read files (`rg`, `ls`, `cat`, `Get-Content`), not `git`: reading that way is not a command to stop at.';
const SKILL_POLICY = 'policy:\n  allow_implicit_invocation: false\n';
// A table's second line, and the line between two cells of a row.
const DELIMITER_RE = /^\|(?:\s*:?-+:?\s*\|)+\s*$/;
const CELL_RE = /(?<!\\)\|/;
// A cell holding `<model>, <effort>`: what stands before the effort, the model, the effort and what follows.
const CHOICE_RE = new RegExp(`^(\\s*([^,]*[^,\\s]), )(${AGENT_EFFORTS.join('|')})(\\s*)$`);
const STAGES = Object.freeze({ plan: 'Plan', build: 'Build' });
// The sensitive route's column, which no tier key rewrites.
const ROUTE = 'Sensitive route';

const refuse = (rule, why) => {
  throw new Refusal(rule, why);
};

/** `text` with each conditional block kept or dropped by `keep(kind, capability)`, its marker lines gone. */
function blocks(text, keep, what) {
  const out = [];
  let open = null;
  for (const line of text.split('\n')) {
    const m = OPEN_RE.exec(line);
    if (m) {
      if (open !== null || !CAPABILITIES.includes(m[2])) refuse('render-block', `${what} holds a conditional block inside another, or one naming a capability the pact does not know.`);
      open = keep(m[1], m[2]);
    } else if (END_RE.test(line)) {
      if (open === null) refuse('render-block', `${what} ends a conditional block that never began.`);
      open = null;
    } else if (open !== false) out.push(line);
  }
  if (open !== null) refuse('render-block', `${what} holds a conditional block that never ends.`);
  return out.join('\n');
}

const blocksFor = (text, h, what) => blocks(text, (kind, c) => h.capabilities.includes(c) === (kind === 'if'), what);

/** The harness's model for a role, null when it names no models; any other value as written. */
function modelFor(value, models) {
  if (!ROLES.includes(value)) return value;
  if (!models) return null;
  return value === 'light' ? (models.light ?? models.executor) : models[value];
}

/** The Markdown tables in `lines`: each as its rows, the header first and the delimiter left out, a row its line number and its cells as split. */
function tablesIn(lines) {
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].startsWith('|') || !DELIMITER_RE.test(lines[i + 1] ?? '')) continue;
    const rows = [];
    let j = i;
    for (; j < lines.length && lines[j].startsWith('|'); j++) if (j !== i + 1) rows.push({ at: j, cells: lines[j].split(CELL_RE) });
    out.push(rows);
    i = j - 1;
  }
  return out;
}

// A split row's first part is what stands before its first |, so its first cell is cells[1].
const cellText = (row, i) => (row.cells[i] ?? '').trim();
const column = (header, name, from) => header.cells.findIndex((c, i) => i >= from && c.trim() === name);
/** A tier row's name, its bold text, or the cell as it stands. */
const tierName = row => /^\*\*(.+)\*\*$/.exec(cellText(row, 1))?.[1] ?? cellText(row, 1);
// A key as harnesses.mjs's TIER_KEY_RE accepts it.
const tierKey = name => name.toLowerCase().replace(/ +/g, '-');

/** The tiers table and the workflow table (spec 0008 D5), each undefined when the rules hold none. */
function tierTables(lines) {
  const all = tablesIn(lines);
  return {
    tiers: all.find(([head]) => cellText(head, 1) === 'Tier' && column(head, 'Plan', 2) > 0 && column(head, 'Build', 2) > 0),
    workflow: all.find(([head]) => cellText(head, 1) === 'Stage'),
  };
}

/** The cells one tier key rewrites, as [row, column, effort], or why the key finds nothing. */
function tierEdits({ tiers, workflow }, key, stages) {
  if (!tiers) return { why: 'no tiers table' };
  const [head, ...rows] = tiers;
  const row = rows.find(r => /^\*\*.+\*\*$/.test(cellText(r, 1)) && tierKey(tierName(r)) === key);
  if (!row) return { why: 'no row of that tier in a tiers table' };
  const name = tierName(row);
  const edits = [];
  for (const [stage, effort] of Object.entries(stages)) {
    const title = STAGES[stage];
    const at = column(head, title, 2);
    if (!CHOICE_RE.test(row.cells[at] ?? '')) return { why: `no model and effort in that tier's ${title} cell` };
    edits.push([row, at, effort]);
    const flow = workflow && name !== ROUTE ? column(workflow[0], name, 2) : -1;
    const step = flow > 0 && workflow.slice(1).find(r => cellText(r, 1) === title);
    if (!step || step.cells[flow] === undefined) continue;
    if (!CHOICE_RE.test(step.cells[flow])) return { why: `no model and effort in the workflow's ${title} cell for that tier` };
    edits.push([step, flow, effort]);
  }
  return { edits };
}

/**
 * The rules' lines with each of the harness's tier efforts in its cells. A key
 * the person's entry set refuses when it finds nothing; a known one warns, and
 * rewrites none of its cells.
 */
function tierEffortsFor(lines, h, warn) {
  const found = tierTables(lines);
  const touched = new Set();
  for (const [key, stages] of Object.entries(h.tierEfforts ?? {})) {
    const { edits, why } = tierEdits(found, key, stages);
    if (why) {
      if (h.ownTiers?.includes(key)) refuse('tier-effort', `the harness ${h.id}'s tierEfforts key ${key} finds ${why}.`);
      warn(`its known tierEfforts key ${key} finds ${why}, so the rules are rendered without it`);
      continue;
    }
    for (const [row, at, effort] of edits) {
      row.cells[at] = row.cells[at].replace(CHOICE_RE, (_, before, model, was, after) => `${before}${effort}${after}`);
      touched.add(row);
    }
  }
  const out = [...lines];
  for (const row of touched) out[row.at] = row.cells.join('|');
  return out;
}

/** A warning for each table cell whose role's model takes its effort in its name, at an effort the harness does not take. Never the model. */
function effortWarnings(lines, h, warn) {
  if (!h.models) return;
  const { tiers, workflow } = tierTables(lines);
  const said = new Set();
  const check = (cell, tier, stage) => {
    const [, , model, effort] = CHOICE_RE.exec(cell ?? '') ?? [];
    const role = ROLES.find(r => model === `${r} model`);
    if (!role || (h.efforts ?? AGENT_EFFORTS).includes(effort) || !modelFor(role, h.models).includes(EFFORT_SLOT)) return;
    said.add(`its tables give ${tier} ${stage} the effort ${effort}, which it does not take`);
  };
  if (tiers) {
    const [head, ...rows] = tiers;
    for (const row of rows) for (const stage of Object.values(STAGES)) check(row.cells[column(head, stage, 2)], tierName(row), stage);
  }
  if (workflow) {
    const [head, ...rows] = workflow;
    for (const row of rows) for (let i = 2; i < head.cells.length; i++) check(row.cells[i], cellText(head, i), cellText(row, 1));
  }
  for (const why of said) warn(why);
}

function rulesFor(rules, h, warn) {
  const m = h.models;
  const line = m && `Here the planning model is \`${m.planning}\`, the executor model \`${m.executor}\` and the light model \`${m.light ?? m.executor}\`.${Object.values(m).some(v => v?.includes(EFFORT_SLOT)) ? ` For \`${EFFORT_SLOT}\`, take the effort the tier table gives.` : ''}`;
  const lines = tierEffortsFor(blocksFor(rules, h, 'the rules file').split('\n'), h, warn);
  effortWarnings(lines, h, warn);
  return lines.flatMap(l => (MODELS_RE.test(l) ? (line ? ['', line] : []) : [l])).join('\n');
}

/** A Markdown file's frontmatter lines, their values by key, and the text after the closing ---. */
function frontmatter(text, what) {
  const m = FRONT_RE.exec(text.replaceAll('\r\n', '\n'));
  if (!m) refuse('render-frontmatter', `${what} has no frontmatter.`);
  const lines = m[1].split('\n');
  const values = new Map(lines.flatMap(l => (/^[A-Za-z][A-Za-z0-9_-]*: /.test(l) ? [[l.slice(0, l.indexOf(':')), l.slice(l.indexOf(':') + 2)]] : [])));
  return { values, rest: m[2] };
}

const unquoted = v => (/^".*"$/.test(v) ? v.slice(1, -1).replace(/\\(["\\])/g, '$1') : /^'.*'$/.test(v) ? v.slice(1, -1).replaceAll("''", "'") : v);

/** The tool names of a `tools:` value, `[A, B]` or `A, B`. */
const toolList = v => (v ?? '').replace(/^\[|\]$/g, '').split(',').map(s => s.trim()).filter(Boolean);

function claudeAgent(text, model) {
  return text.replace(/^(---\r?\n[\s\S]*?)^model: [^\r\n]*(\r?\n)/m, (_, head, eol) => (model === null ? head : `${head}model: ${model}${eol}`));
}

function codexAgent(name, text, model) {
  const { values, rest } = frontmatter(text, `the agent ${name}`);
  const body = rest.replace(/^\n/, '');
  if (body.includes("'''")) refuse('agent-toml', `the agent ${name} holds ''', which a Codex agent file cannot carry.`);
  const out = [`name = ${JSON.stringify(name)}`, `description = ${JSON.stringify(unquoted(values.get('description') ?? ''))}`];
  if (model !== null) out.push(`model = ${JSON.stringify(model)}`);
  if (values.has('effort')) out.push(`model_reasoning_effort = ${JSON.stringify(values.get('effort'))}`);
  out.push(`developer_instructions = '''\n${SHELL_READS}\n\n${body}'''`);
  out.push('', '[features]', ...CODEX_AGENT_OFF.map(k => `${k} = false`));
  return `${out.join('\n')}\n`;
}

function antigravityAgent(name, text, model, table, warn) {
  const { values, rest } = frontmatter(text, `the agent ${name}`);
  const asked = toolList(values.get('tools'));
  const known = asked.filter(t => Object.hasOwn(table, t));
  // An empty list, or none at all, may mean every tool.
  if (!known.length || READ_TOOLS.some(t => asked.includes(t) && !known.includes(t))) refuse('agent-tools', `the agent ${name} would reach Antigravity with no tools, or without one of ${READ_TOOLS.join(', ')}.`);
  for (const t of asked) if (!known.includes(t)) warn(`${name} loses the tool ${t}, which the pact has no name for there`);
  const head = [`name: ${name}`, `description: ${values.get('description') ?? ''}`, ...(model === null ? [] : [`model: ${model}`]), `tools: [${[...new Set(known.map(t => table[t]))].join(', ')}]`];
  return `---\n${head.join('\n')}\n---\n${rest}`;
}

/** One agent in a harness's format, as [file name, text, the model it names]. */
function agentFor(name, text, h, tables, warn) {
  const { values } = frontmatter(text, `the agent ${name}`);
  const asked = values.get('model');
  // The harness's own model for this agent, over the one its role names; a model the source names stays.
  const own = ROLES.includes(asked) && h.agentModels ? (Object.hasOwn(h.agentModels, name) ? h.agentModels[name] : h.agentModels['*']) : undefined;
  let model = own ?? (asked === undefined ? null : modelFor(asked, h.models));
  // A role's model that takes its effort in its name takes the agent file's.
  if (own === undefined && ROLES.includes(asked) && model?.includes(EFFORT_SLOT)) {
    const effort = unquoted((values.get('effort') ?? '').trim());
    if (!(h.efforts ?? AGENT_EFFORTS).includes(effort)) refuse('agent-effort', `the agent ${name} sets no effort that the model of its role in ${h.id} takes.`);
    model = model.replace(EFFORT_SLOT, effort);
  }
  const { format } = h.agents;
  if (format === 'codex-toml') return [`${name}.toml`, codexAgent(name, text, model), model];
  if (format === 'antigravity-md') return [`${name}.md`, antigravityAgent(name, text, model, tables[format], warn), model];
  return [`${name}.md`, claudeAgent(text, model), model];
}

/** Every command as a skill, once: the folder has a capability only when every harness that reads it has it. */
function skills(commands, readers, files) {
  const keep = (kind, c) => readers.every(h => h.capabilities.includes(c)) === (kind === 'if');
  const explicit = readers.some(h => h.capabilities.includes('explicit-skills'));
  for (const [name, text] of commands) {
    const { values, rest } = frontmatter(blocks(text.replaceAll('\r\n', '\n'), keep, `the command ${name}`), `the command ${name}`);
    const dir = `${RENDERED_REL}skills/${name}`;
    // The command's own switch, which keeps a skill from Antigravity's model; it is added to no command that lacks it.
    const held = explicit && values.get('disable-model-invocation') === 'true' ? '\ndisable-model-invocation: true' : '';
    files.set(`${dir}/SKILL.md`, `---\nname: ${name}\ndescription: ${values.get('description') ?? ''}${held}\n---\n${rest}`);
    if (explicit) files.set(`${dir}/agents/openai.yaml`, SKILL_POLICY);
  }
}

/**
 * Every file the harnesses in `harnesses` receive, and the dry run's warnings.
 * `rules`, `agents` and `commands` are the configured texts, the latter two by
 * name; `tables` the tool names per agent format.
 */
export function renderHarnesses({ rules, agents, commands, harnesses, tables = TOOL_TABLES }) {
  const files = new Map();
  const warnings = [];
  for (const h of harnesses) {
    const parts = builtParts(h, tables);
    const root = `${RENDERED_REL}${h.id}`;
    const warn = why => warnings.push(`${h.id}: ${why}`);
    const claude = h.id === 'claude';
    const named = (path, found) => {
      if (claude) return;
      const own = Object.values(h.models ?? {}).map(m => m?.toLowerCase());
      for (const m of new Set(found)) if (!own.includes(m.toLowerCase())) warnings.push(`\`${path}\` names model \`${m}\`, which ${h.name} may not have`);
    };
    if (!h.models) warn(`it names no models, so its rules hold no models line${h.agentModels ? '.' : ' and its agents no model'}`);
    // A configured name can hold a provider account or project, so it is never printed here.
    else if (h.own || h.overrides.includes('models')) warn('its rules hold your configuration’s model names as written; sessions read that file and may quote it.');
    if (h.agentModels && (h.own || h.overrides.includes('agentModels'))) warn('its agent files hold your configuration’s model names as written; sessions read those files and may quote them.');

    for (const k of Object.keys(h.agentModels ?? {})) if (k !== '*' && !agents.has(k)) warn(`agentModels names ${k}, which is no agent of the pact`);

    const text = rulesFor(rules, h, warn);
    const size = Buffer.byteLength(text);
    const { cap, sharedCap } = h.rules;
    const limit = Math.min(cap ?? Infinity, sharedCap ?? Infinity);
    if (size > limit) refuse('rules-cap', `the rules for ${h.id} take ${size} bytes, over its cap of ${limit}.`);
    if (sharedCap !== null && size > sharedCap / 2) warn(`the rules take ${size} of ${sharedCap} shared bytes; project files share the rest.`);
    files.set(`${root}/rules.md`, text);
    named(h.rules.path, text.match(MODEL_NAME_RE) ?? []);

    if (parts.agents) {
      for (const [name, source] of agents) {
        const [file, out, model] = agentFor(name, source, h, tables, warn);
        files.set(`${root}/agents/${file}`, out);
        const asked = frontmatter(source, `the agent ${name}`).values.get('model');
        if (model !== null && !ROLES.includes(asked)) named(`${h.agents.dir}/${file}`, [model]);
      }
    }
    if (parts.commands) for (const [name, source] of commands) files.set(`${root}/commands/${name}.md`, blocksFor(source, h, `the command ${name}`));
  }
  const readers = harnesses.filter(h => builtParts(h, tables).skills);
  if (readers.length) skills(commands, readers, files);
  return { files, warnings };
}

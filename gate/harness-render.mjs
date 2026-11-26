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

import { CAPABILITIES } from './harnesses.mjs';
import { RENDERED_REL, Refusal, TOOL_TABLES, builtParts } from './install-core.mjs';

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
const SKILL_POLICY = 'policy:\n  allow_implicit_invocation: false\n';

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

function rulesFor(rules, h) {
  const m = h.models;
  const line = m ? `Here the planning model is \`${m.planning}\`, the executor model \`${m.executor}\` and the light model \`${m.light ?? m.executor}\`.` : null;
  return blocksFor(rules, h, 'the rules file')
    .split('\n')
    .flatMap(l => (MODELS_RE.test(l) ? (line ? ['', line] : []) : [l]))
    .join('\n');
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
  out.push(`developer_instructions = '''\n${body}'''`);
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
  const model = asked === undefined ? null : modelFor(asked, h.models);
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
    if (!h.models) warn('it names no models, so its rules hold no models line and its agents no model');
    // A configured name can hold a provider account or project, so it is never printed here.
    else if (h.own || h.overrides.includes('models')) warn('its rules hold your configuration’s model names as written; sessions read that file and may quote it.');

    const text = rulesFor(rules, h);
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

// PROTOTYPE for #143, throwaway. Three views of one model, switchable with the
// bottom bar or ?variant=A|B|C: A canvas (moves left to right), B lanes (moves
// top to bottom), C outline (keyboard-first tree with a map). Read-only: it
// shows what a configuration would say, and saves nothing.
'use strict';

const $ = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'text') e.textContent = v;
    else if (k === 'cls') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat(Infinity)) if (c !== null && c !== undefined && c !== false) e.append(c);
  return e;
};
const NS = 'http://www.w3.org/2000/svg';
const svg = (tag, attrs = {}, text) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text) e.textContent = text;
  return e;
};

// ------------------------------------------------------------------ the model
const MOVES = DATA.moves;
const markMove = Object.fromEntries(MOVES.flatMap(m => m.parts.map(p => [p.mark, m.n])));
const zoneOf = n => MOVES.find(m => m.n === n).parts.find(p => p.kind === 'open').mark;
const partText = mark => MOVES.flatMap(m => m.parts).find(p => p.mark === mark)?.text ?? DATA.always.find(a => a.mark === mark)?.text ?? '';
const AGENTS = Object.fromEntries(DATA.agents.map(a => [a.name, a]));
const VARIANTS = { A: 'Canvas', B: 'Lanes', C: 'Outline' };
const READS = ['the diff', 'the spec', 'the ticket'];

const S = {
  variant: 'A',
  steps: [],
  kept: Object.fromEntries(DATA.editable.map(m => [m, true])),
  lens: {},
  usage: DATA.setting.def,
  sel: null,
  focus: null,
};
try {
  const v = new URLSearchParams(location.search).get('variant');
  if (v && VARIANTS[v]) S.variant = v;
} catch { /* file:// may refuse; the default stands */ }

let seq = 0;
const newStep = (kind, fields, mark) => ({ id: `s${++seq}`, kind, mark, ...fields });
const stepsIn = mark => S.steps.filter(s => s.mark === mark);
const presetById = id => DATA.presets.find(p => p.id === id);
const lensSetting = name => ({ model: AGENTS[name].model, effort: AGENTS[name].effort, ...(S.lens[name] || {}) });
const overridden = name => {
  const a = AGENTS[name];
  const s = lensSetting(name);
  return s.model !== a.model || s.effort !== a.effort;
};

const normalize = t => String(t).replace(/\r\n?/g, '\n').replace(/\n+$/, '');
const stepLabel = s =>
  s.kind === 'preset' ? presetById(s.presetId).title
    : s.kind === 'text' ? (s.text.trim() ? s.text.trim().split('\n')[0].slice(0, 40) : 'Your own text')
    : s.kind === 'command' ? `/${s.name}` : s.name;
const stepKind = s => ({ preset: 'preset', skill: 'skill: the agent uses it', command: 'command: you start it', agent: 'your agent', text: 'your text' })[s.kind];
const stepText = s =>
  s.kind === 'preset' ? presetById(s.presetId).text
    : s.kind === 'agent' ? `Then run \`${s.name}\`, an agent from your own agents folder, on ${s.reads}, and post its report on the issue.`
    : s.kind === 'skill' ? `Use the \`${s.name}\` skill${s.when ? ` when ${s.when}` : ''}.`
    : s.kind === 'command' ? `At this step, hand me the trigger: type \`/${s.name}\`.`
    : s.text;
const hasDefault = mark => partText(mark).trim() !== '';
const slotOp = mark => {
  const n = stepsIn(mark).length;
  if (hasDefault(mark) && !S.kept[mark]) return n ? 'replace' : 'remove';
  return n ? 'add-after' : 'keep';
};
const blockText = mark => `${stepsIn(mark).map(s => normalize(stepText(s))).join('\n')}\n`;
const lostLenses = mark => {
  const op = slotOp(mark);
  if (op !== 'replace' && op !== 'remove') return [];
  const named = op === 'remove' ? '' : blockText(mark);
  return MOVES.flatMap(m => m.parts).find(p => p.mark === mark).agents.filter(a => !named.includes(`\`${a}\``));
};
// Lenses per move, from where the pact's text names them.
const lensesAt = n => DATA.agents.filter(a => a.runs.some(r => r.move === n)).map(a => a.name);
const usesYou = s => s.kind === 'command';

function compiled() {
  const edits = [];
  for (const mark of DATA.editable) {
    const op = slotOp(mark);
    if (op === 'keep') continue;
    edits.push(op === 'remove' ? { mark, op } : { mark, op, file: `${mark}.md` });
  }
  const agents = {};
  for (const a of DATA.agents) if (a.configurable && overridden(a.name)) agents[a.name] = lensSetting(a.name);
  const cfg = { schema: 1 };
  if (S.usage !== DATA.setting.def) cfg.settings = { [DATA.setting.name]: S.usage };
  if (edits.length) cfg.edits = edits;
  if (Object.keys(agents).length) cfg.agents = agents;
  return cfg;
}

// ------------------------------------------------------------------ actions
const say = t => { document.getElementById('live').textContent = t; };
function select(sel, focus = true) {
  S.sel = sel;
  if (focus) S.focus = sel.key;
  render();
}
function addStep(item, n) {
  const mark = zoneOf(n);
  const s = item.kind === 'preset' ? newStep('preset', { presetId: item.id }, mark)
    : item.kind === 'agent' ? newStep('agent', { name: item.name, reads: 'the diff' }, mark)
    : item.kind === 'text' ? newStep('text', { text: '' }, mark)
    : newStep(item.kind, { name: item.name, when: '' }, mark);
  S.steps.push(s);
  say(`Added ${stepLabel(s)} to move ${n}.`);
  select({ type: 'step', id: s.id, key: `step:${s.id}` });
}
function moveStep(id, delta) {
  const s = S.steps.find(x => x.id === id);
  const peers = stepsIn(s.mark);
  const i = peers.indexOf(s);
  const j = i + delta;
  if (j < 0 || j >= peers.length) return say('Already at that end of the move.');
  const a = S.steps.indexOf(peers[i]);
  const b = S.steps.indexOf(peers[j]);
  [S.steps[a], S.steps[b]] = [S.steps[b], S.steps[a]];
  say(`${stepLabel(s)} is now step ${j + 1} of move ${markMove[s.mark]}.`);
  render();
}
function shiftStep(id, delta) {
  const s = S.steps.find(x => x.id === id);
  const n = markMove[s.mark] + delta;
  if (n < 1 || n > 4) return say('No move on that side.');
  s.mark = zoneOf(n);
  S.steps.splice(S.steps.indexOf(s), 1);
  S.steps.push(s);
  say(`${stepLabel(s)} moved to move ${n}, last step.`);
  render();
}
function removeStep(id) {
  const s = S.steps.find(x => x.id === id);
  S.steps = S.steps.filter(x => x.id !== id);
  S.sel = null;
  S.focus = null;
  say(`Removed ${stepLabel(s)}.`);
  render();
}
function stepKeys(e, s) {
  if (e.altKey && e.key === 'ArrowUp') { e.preventDefault(); moveStep(s.id, -1); }
  else if (e.altKey && e.key === 'ArrowDown') { e.preventDefault(); moveStep(s.id, 1); }
  else if (e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); shiftStep(s.id, -1); }
  else if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); shiftStep(s.id, 1); }
  else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removeStep(s.id); }
}

// ------------------------------------------------------------------ drag and drop
let dragging = null;
const dropZone = (el, n) => {
  el.addEventListener('dragover', e => { if (dragging) { e.preventDefault(); el.classList.add('over'); } });
  el.addEventListener('dragleave', () => el.classList.remove('over'));
  el.addEventListener('drop', e => {
    e.preventDefault();
    el.classList.remove('over');
    if (!dragging) return;
    if (dragging.step) {
      const s = S.steps.find(x => x.id === dragging.step);
      s.mark = zoneOf(n);
      S.steps.splice(S.steps.indexOf(s), 1);
      S.steps.push(s);
      say(`${stepLabel(s)} moved to move ${n}.`);
      render();
    } else addStep(dragging.item, n);
    dragging = null;
  });
};

// ------------------------------------------------------------------ shared pieces
const isSel = key => S.sel && S.sel.key === key;
function stepNode(s, i) {
  const key = `step:${s.id}`;
  return $('button', {
    type: 'button', cls: `node${isSel(key) ? ' sel' : ''}${usesYou(s) ? ' you' : ''}`, 'data-key': key, 'data-step': s.id,
    draggable: 'true', 'aria-label': `Step ${i + 1}: ${stepLabel(s)}, ${stepKind(s)}. Alt and arrow keys move it; Delete removes it.`,
    ondragstart: () => { dragging = { step: s.id }; }, ondragend: () => { dragging = null; },
    onclick: () => select({ type: 'step', id: s.id, key }), onkeydown: e => stepKeys(e, s),
  }, $('span', { cls: 'ord', text: String(i + 1) }), $('span', { cls: 't', text: stepLabel(s) }), $('span', { cls: 's', text: stepKind(s) }));
}
function defaultNode(mark) {
  const key = `default:${mark}`;
  const lost = lostLenses(mark);
  return $('button', {
    type: 'button', cls: `node default${S.kept[mark] ? '' : ' dropped'}${isSel(key) ? ' sel' : ''}`, 'data-key': key,
    'aria-label': `The pact's default text for move ${markMove[mark]}, ${S.kept[mark] ? 'kept' : 'dropped'}.`,
    onclick: () => select({ type: 'default', mark, key }),
  }, $('span', { cls: 't', text: 'The pact\'s default text' }),
  $('span', { cls: 's', text: S.kept[mark] ? 'kept: your steps come after it' : 'dropped: your steps replace it' }),
  lost.length ? $('span', { cls: 's warn', text: `drops ${lost.join(', ')}: the install refuses` }) : null);
}
function gatedNode(mark) {
  const key = `gated:${mark}`;
  return $('button', {
    type: 'button', cls: `node locked${isSel(key) ? ' sel' : ''}`, 'data-key': key,
    'aria-label': `${mark}, a gated clause. Locked: you can read it, not move or remove it.`,
    onclick: () => select({ type: 'gated', mark, key }),
  }, $('span', { cls: 't', text: mark }), $('span', { cls: 's', text: 'gated clause' }));
}
function lensNode(name, n) {
  const key = `lens:${name}:${n}`;
  const a = AGENTS[name];
  const s = lensSetting(name);
  const over = overridden(name);
  return $('button', {
    type: 'button', cls: `node lens${a.configurable ? '' : ' locked'}${isSel(key) ? ' sel' : ''}`, 'data-key': key,
    'aria-label': `${name}, a pact lens on ${s.model} at ${s.effort}.${a.configurable ? ' Model and effort can be set.' : ' Sealed.'}${over && a.security ? ' Override, not security-tested.' : ''}`,
    onclick: () => select({ type: 'lens', name, key }),
  }, $('span', { cls: 't', text: name }),
  $('span', { cls: 's' }, a.security ? $('span', { cls: 'badge', text: 'security set' }) : null, `${s.model} · ${s.effort}`),
  over && a.security ? $('span', { cls: 's warn', text: 'override, not security-tested' }) : null);
}
function zoneEl(mark, extraCls = '') {
  const n = markMove[mark];
  const steps = stepsIn(mark);
  const z = $('div', { cls: `zone ${extraCls}`, 'data-zone': mark, role: 'group', 'aria-label': `Your steps in move ${n}` },
    $('div', { cls: 'zl', text: `Your steps · ${mark}` }),
    hasDefault(mark) ? defaultNode(mark) : null,
    steps.map(stepNode),
    steps.length ? null : $('p', { cls: 'empty', text: 'Drop a step here, or use "Add to" in the menu.' }));
  dropZone(z, n);
  return z;
}
function menu() {
  const items = [
    ['Presets', DATA.presets.map(p => ({ kind: 'preset', id: p.id, label: p.title, about: p.why, home: markMove[p.slot] }))],
    ['Your skills', DATA.yours.skills.map(s => ({ kind: 'skill', name: s.name, label: s.name, about: s.about }))],
    ['Your commands', DATA.yours.commands.map(s => ({ kind: 'command', name: s.name, label: `/${s.name}`, about: s.about }))],
    ['Your agents', DATA.yours.agents.map(s => ({ kind: 'agent', name: s.name, label: s.name, about: s.about }))],
    ['Your text', [{ kind: 'text', label: 'A line of your own', about: 'Plain lines added to a move.' }]],
  ];
  return $('aside', { cls: 'menu', 'aria-label': 'What you can add' },
    items.map(([h, list]) => [
      $('h2', { text: h }),
      list.map(it => [
        $('div', { cls: 'pal', draggable: 'true', title: it.about, ondragstart: () => { dragging = { item: it }; }, ondragend: () => { dragging = null; } },
          $('span', { text: it.label }), $('span', { cls: 'k', text: it.home ? `move ${it.home}` : it.kind })),
        $('div', { cls: 'addto', role: 'group', 'aria-label': `Add ${it.label} to a move` },
          $('span', { cls: 'sr', text: 'Add to' }),
          [1, 2, 3, 4].map(n => $('button', { type: 'button', text: `+${n}`, 'aria-label': `Add ${it.label} to move ${n}`, onclick: () => addStep(it, n) }))),
      ]),
    ]));
}
function inspector() {
  const box = $('aside', { cls: 'inspector', 'aria-label': 'Selected item' });
  const sel = S.sel;
  if (!sel) {
    box.append($('h2', { text: 'Nothing selected' }), $('p', { cls: 'note', text: 'Pick a box to see what it adds to the rules, or a locked box to see why it is locked.' }));
    return box;
  }
  if (sel.type === 'move') {
    const m = MOVES.find(x => x.n === sel.n);
    box.append($('h2', { text: `Move ${m.n} · locked` }), $('p', { text: m.lead }),
      $('p', { cls: 'note', text: 'The four moves and their order come from the pact. You add steps inside a move; you cannot move, remove or reorder the moves.' }));
  } else if (sel.type === 'gated') {
    box.append($('h2', { text: `${sel.mark} · locked` }),
      $('p', { cls: 'note', text: 'A gated clause: the install gate holds it word for word and refuses any edit to it. It is shown so you can see what governs this move.' }),
      $('pre', { text: partText(sel.mark) }));
  } else if (sel.type === 'default') {
    const lost = lostLenses(sel.mark);
    box.append($('h2', { text: `Default text · ${sel.mark}` }),
      $('label', {}, $('input', { type: 'checkbox', checked: S.kept[sel.mark], onchange: e => { S.kept[sel.mark] = e.target.checked; render(); } }), ' Keep the pact\'s default text'),
      $('p', { cls: 'note', text: S.kept[sel.mark] ? 'Your steps are added after this text (add-after).' : 'Your steps replace this text (replace), or leave the part empty (remove).' }),
      lost.length ? $('p', { cls: 'warn', text: `Dropping it leaves ${lost.join(', ')} unnamed. The install refuses that.` }) : null,
      $('pre', { text: partText(sel.mark) }));
  } else if (sel.type === 'lens') {
    const a = AGENTS[sel.name];
    const s = lensSetting(sel.name);
    box.append($('h2', { text: `${sel.name} · lens` }),
      $('p', { cls: 'note', text: `Runs in: ${a.runs.map(r => r.mark).join(', ')}. Locked in place: a lens cannot be moved or removed.` }));
    if (!a.configurable) box.append($('p', { cls: 'note', text: a.locked || 'Sealed: its model and effort cannot be set.' }));
    else {
      const pick = (k, list) => $('select', { 'aria-label': `${sel.name} ${k}`, onchange: e => { S.lens[sel.name] = { ...s, [k]: e.target.value }; render(); } },
        list.map(v => $('option', { value: v, text: `${v}${v === a[k] ? ' (default)' : ''}`, selected: v === s[k] })));
      box.append($('label', { text: 'Model' }), pick('model', DATA.agentChoices.models), $('label', { text: 'Effort' }), pick('effort', DATA.agentChoices.efforts));
      if (a.security && overridden(sel.name)) box.append($('p', { cls: 'warn', text: 'Security set, off its default: every report carries "override, not security-tested".' }));
    }
  } else if (sel.type === 'step') {
    const s = S.steps.find(x => x.id === sel.id);
    if (!s) { S.sel = null; return inspector(); }
    const n = markMove[s.mark];
    box.append($('h2', { text: `${stepLabel(s)} · move ${n}` }));
    if (s.kind === 'skill' || s.kind === 'command') {
      box.append($('label', { text: 'Who starts it' }),
        $('select', { 'aria-label': 'Who starts it', onchange: e => { s.kind = e.target.value; render(); } },
          $('option', { value: 'skill', text: 'The agent uses it', selected: s.kind === 'skill' }),
          $('option', { value: 'command', text: 'You start it (hands to you)', selected: s.kind === 'command' })));
      if (s.kind === 'skill') box.append($('label', { text: 'When (optional)' }), $('input', { type: 'text', value: s.when, placeholder: 'the work touches the database', onchange: e => { s.when = e.target.value; render(); } }));
    }
    if (s.kind === 'agent') box.append($('label', { text: 'It reads' }), $('select', { 'aria-label': 'It reads', onchange: e => { s.reads = e.target.value; render(); } }, READS.map(r => $('option', { value: r, text: r, selected: r === s.reads }))));
    if (s.kind === 'text') box.append($('label', { text: 'Your text' }), $('textarea', { 'aria-label': 'Your text', onchange: e => { s.text = e.target.value; render(); } }, s.text));
    if (s.kind === 'preset') box.append($('p', { cls: 'note', text: presetById(s.presetId).why }));
    box.append($('label', { text: 'Rules text this step adds' }), $('pre', { text: stepText(s) || '(empty)' }),
      $('div', { cls: 'acts' },
        $('button', { type: 'button', text: '↑ earlier', onclick: () => moveStep(s.id, -1) }),
        $('button', { type: 'button', text: '↓ later', onclick: () => moveStep(s.id, 1) }),
        $('button', { type: 'button', text: '← move', onclick: () => shiftStep(s.id, -1) }),
        $('button', { type: 'button', text: 'move →', onclick: () => shiftStep(s.id, 1) }),
        $('button', { type: 'button', cls: 'danger', text: 'Remove', onclick: () => removeStep(s.id) })),
      $('p', { cls: 'note', text: 'Keys on a step: Alt+↑/↓ order, Alt+←/→ move, Delete removes.' }));
  }
  return box;
}
function compiledPanel() {
  const cfg = compiled();
  return $('section', { cls: 'compiled', 'aria-label': 'What this compiles to' },
    $('h2', { text: 'What this compiles to (preview only, nothing is saved)' }),
    $('div', { cls: 'grid' },
      $('div', {}, $('div', { cls: 'op', text: 'config.json' }), $('pre', { text: JSON.stringify(cfg, null, 2) })),
      DATA.editable.filter(m => slotOp(m) !== 'keep').map(m => $('div', {},
        $('div', { cls: 'op', text: `${m}: ${slotOp(m)}` }),
        slotOp(m) === 'remove' ? $('pre', { text: '(part emptied)' }) : $('pre', { text: blockText(m) }),
        lostLenses(m).length ? $('p', { cls: 'warn', text: `Refused at install: ${lostLenses(m).join(', ')} left unnamed.` }) : null))));
}
const alwaysBand = () => $('section', { cls: 'always', 'aria-label': 'Always on, locked' },
  $('div', { cls: 'sub', text: 'Always on · locked · applies to every move' }),
  $('div', { cls: 'row' }, DATA.always.map(a => gatedNode(a.mark))));
const moveHeader = m => $('header', {}, $('span', { cls: 'n', text: `MOVE ${m.n}` }),
  $('button', { type: 'button', cls: 'node locked', 'data-key': `move:${m.n}`, 'aria-label': `Move ${m.n}: ${m.lead} Locked.`, onclick: () => select({ type: 'move', n: m.n, key: `move:${m.n}` }) },
    $('span', { cls: 't', text: m.lead })));
const moveBody = m => m.parts.map(p => p.kind === 'open' ? zoneEl(p.mark) : gatedNode(p.mark));
const lensList = n => {
  const names = lensesAt(n);
  return names.length ? [$('div', { cls: 'sub', text: 'Reviewers here' }), names.map(name => lensNode(name, n))] : [];
};
const legend = () => $('div', { cls: 'legend' },
  $('span', {}, $('i'), 'runs after (locked spine)'), $('span', {}, $('i', { cls: 'o' }), 'runs after (your order)'),
  $('span', {}, $('i', { cls: 'l' }), 'loops back (pact, locked)'), $('span', {}, $('i', { cls: 'y' }), 'hands to you'));

// ------------------------------------------------------------------ arrows
function rel(el, box) {
  const r = el.getBoundingClientRect();
  const b = box.getBoundingClientRect();
  return { x: r.left - b.left + box.scrollLeft, y: r.top - b.top + box.scrollTop, w: r.width, h: r.height };
}
function arrowDefs(s) {
  const defs = svg('defs');
  for (const [id, color] of [['ah', 'var(--ink)'], ['ahl', 'var(--lock)'], ['ahy', 'var(--you)'], ['aho', 'var(--ink-55)']]) {
    const m = svg('marker', { id, viewBox: '0 0 10 10', refX: '9', refY: '5', markerWidth: '7', markerHeight: '7', orient: 'auto-start-reverse' });
    m.append(svg('path', { d: 'M0,0 L10,5 L0,10 z', fill: color, stroke: 'none' }));
    defs.append(m);
  }
  s.append(defs);
}
function path(s, d, cls, marker, label, lx, ly, tcls) {
  s.append(svg('path', { d, class: cls, 'marker-end': `url(#${marker})` }));
  if (label) s.append(svg('text', { x: lx, y: ly, class: tcls || '' }, label));
}
function drawArrows(box, horizontal) {
  const old = box.querySelector('svg.arrows');
  if (old) old.remove();
  const s = svg('svg', { class: 'arrows', 'aria-hidden': 'true', width: box.scrollWidth, height: box.scrollHeight });
  arrowDefs(s);
  const mv = n => rel(box.querySelector(`[data-move="${n}"]`), box);
  const you = rel(box.querySelector('.youbar'), box);
  for (let n = 1; n < 4; n++) {
    const a = mv(n);
    const b = mv(n + 1);
    if (horizontal) path(s, `M${a.x + a.w},${a.y + 40} L${b.x - 2},${b.y + 40}`, 'spine-a', 'ah');
    else path(s, `M${a.x + 60},${a.y + a.h} L${b.x + 60},${b.y - 2}`, 'spine-a', 'ah');
  }
  // Your order inside a move.
  for (const mark of DATA.editable) {
    const els = stepsIn(mark).map(st => box.querySelector(`[data-step="${st.id}"]`)).filter(Boolean).map(e => rel(e, box));
    for (let i = 0; i + 1 < els.length; i++) {
      const a = els[i];
      const b = els[i + 1];
      if (horizontal) path(s, `M${a.x + 20},${a.y + a.h} L${b.x + 20},${b.y - 1}`, 'order-a', 'aho');
      else if (b.y > a.y + a.h / 2) path(s, `M${a.x + 20},${a.y + a.h} L${b.x + 20},${b.y - 1}`, 'order-a', 'aho');
      else path(s, `M${a.x + a.w},${a.y + a.h / 2} L${b.x - 1},${b.y + b.h / 2}`, 'order-a', 'aho');
    }
  }
  // Hands to you: each command step, and the owner's decisions in moves 2 and 4.
  const toYou = (r, label) => {
    const x = r.x + r.w - 16;
    path(s, `M${x},${r.y} L${x},${you.y + you.h + 1}`, 'you-a', 'ahy', label, x + 4, you.y + you.h + 14, 'you-t');
  };
  for (const st of S.steps.filter(usesYou)) {
    const e = box.querySelector(`[data-step="${st.id}"]`);
    if (e) toYou(rel(e, box));
  }
  if (horizontal) {
    toYou(mv(2), 'proceed, fix or kill');
    toYou(mv(4), 'done?');
    // Pact loops, drawn below the boxes.
    const m2 = mv(2);
    const m3 = mv(3);
    const m4 = mv(4);
    const yb = Math.max(m2.y + m2.h, m3.y + m3.h, m4.y + m4.h);
    path(s, `M${m2.x + m2.w - 30},${m2.y + m2.h} C${m2.x + m2.w - 30},${yb + 50} ${m2.x + 30},${yb + 50} ${m2.x + 30},${m2.y + m2.h + 2}`, 'loop-a', 'ahl', 'fix: revise the spec', m2.x + 40, yb + 34);
    path(s, `M${m4.x + m4.w / 2},${m4.y + m4.h} C${m4.x + m4.w / 2},${yb + 80} ${m3.x + m3.w / 2},${yb + 80} ${m3.x + m3.w / 2},${m3.y + m3.h + 2}`, 'loop-a', 'ahl', 'not done: back to the build', m3.x + m3.w / 2 + 10, yb + 70);
  } else {
    const gx = box.scrollWidth - 100;
    const m2 = mv(2);
    const m3 = mv(3);
    const m4 = mv(4);
    toYou({ x: m2.x, y: m2.y, w: 160, h: m2.h }, 'proceed, fix or kill');
    path(s, `M${m2.x + m2.w},${m2.y + 20} C${gx + 40},${m2.y + 20} ${gx + 40},${m2.y + m2.h - 20} ${m2.x + m2.w + 2},${m2.y + m2.h - 20}`, 'loop-a', 'ahl', 'fix', gx + 46, m2.y + m2.h / 2);
    path(s, `M${m4.x + m4.w},${m4.y + m4.h / 2} C${gx + 80},${m4.y + m4.h / 2} ${gx + 80},${m3.y + m3.h / 2} ${m3.x + m3.w + 2},${m3.y + m3.h / 2}`, 'loop-a', 'ahl', 'not done', gx + 30, (m3.y + m4.y + m4.h) / 2);
  }
  box.append(s);
}

// ------------------------------------------------------------------ variants
function variantA() {
  const canvas = $('div', { cls: 'canvas', role: 'region', 'aria-label': 'Workflow canvas: moves 1 to 4, left to right' },
    $('div', { cls: 'youbar', text: 'You · the owner' }),
    $('div', { cls: 'spine' }, MOVES.map(m => $('section', { cls: 'move', 'data-move': m.n, 'aria-label': `Move ${m.n}` }, moveHeader(m), moveBody(m), lensList(m.n)))),
    alwaysBand(), legend());
  requestAnimationFrame(() => drawArrows(canvas, true));
  return canvas;
}
function variantB() {
  const lanes = $('div', { cls: 'lanes', role: 'region', 'aria-label': 'Workflow lanes: moves 1 to 4, top to bottom' },
    $('div', { cls: 'youbar', text: 'You · the owner' }),
    MOVES.map(m => $('section', { cls: 'lane', 'data-move': m.n, 'aria-label': `Move ${m.n}` },
      $('header', {}, $('span', { cls: 'n', text: `MOVE ${m.n}` }), moveHeader(m).lastChild),
      $('div', {}, m.parts.map(p => p.kind === 'open' ? zoneEl(p.mark) : $('div', { cls: 'zone' }, gatedNode(p.mark)))),
      $('div', { cls: 'rev' }, lensList(m.n).length ? lensList(m.n) : $('div', { cls: 'sub', text: 'No reviewers here' })))),
    alwaysBand(), legend());
  requestAnimationFrame(() => drawArrows(lanes, false));
  return lanes;
}
function variantC() {
  const items = [];
  const item = (key, depth, row, opts = {}) => {
    const li = $('li', { role: 'treeitem', 'aria-level': String(depth), tabindex: '-1', 'data-key': key, 'aria-selected': isSel(key) ? 'true' : 'false', ...opts.attrs }, $('div', { cls: 'row' }, row));
    items.push(li);
    li.addEventListener('click', e => { e.stopPropagation(); if (opts.sel) select(opts.sel); });
    li.addEventListener('keydown', e => {
      if (e.target !== li) return;
      const i = items.indexOf(li);
      if (!e.altKey && e.key === 'ArrowDown') { e.preventDefault(); items[Math.min(i + 1, items.length - 1)].focus(); }
      else if (!e.altKey && e.key === 'ArrowUp') { e.preventDefault(); items[Math.max(i - 1, 0)].focus(); }
      else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (opts.sel) select(opts.sel); }
      else if (opts.step) stepKeys(e, opts.step);
    });
    return li;
  };
  const kind = (t, cls = '') => $('span', { cls: `kind ${cls}`, text: t });
  const tree = $('ul', { cls: 'tree', role: 'tree', 'aria-label': 'The workflow as an outline' },
    item('you', 1, [kind('owner', 'yo'), $('span', { text: 'You: start each command step, decide proceed, fix or kill at move 2, and done at move 4' })]),
    MOVES.map(m => {
      const kids = [];
      for (const p of m.parts) {
        if (p.kind === 'gated') kids.push(item(`gated:${p.mark}`, 2, [kind('🔒 gated', 'lk'), $('span', { text: p.mark })], { sel: { type: 'gated', mark: p.mark, key: `gated:${p.mark}` } }));
        else {
          if (hasDefault(p.mark)) kids.push(item(`default:${p.mark}`, 2, [kind('default'), $('span', { cls: S.kept[p.mark] ? '' : 'gone', text: `The pact's default text (${S.kept[p.mark] ? 'kept' : 'dropped'})` }), lostLenses(p.mark).length ? $('span', { cls: 'yo', text: 'install refuses' }) : null], { sel: { type: 'default', mark: p.mark, key: `default:${p.mark}` } }));
          stepsIn(p.mark).forEach((s, i) => kids.push(item(`step:${s.id}`, 2, [kind(`step ${i + 1}`), $('span', { text: stepLabel(s) }), $('span', { cls: usesYou(s) ? 'kind yo' : 'kind', text: usesYou(s) ? '→ you' : stepKind(s) })], { sel: { type: 'step', id: s.id, key: `step:${s.id}` }, step: s })));
        }
      }
      for (const name of lensesAt(m.n)) kids.push(item(`lens:${name}:${m.n}`, 2, [kind('🔒 lens', 'lk'), $('span', { text: `${name} · ${lensSetting(name).model} · ${lensSetting(name).effort}` }), overridden(name) && AGENTS[name].security ? $('span', { cls: 'yo', text: 'override, not security-tested' }) : null], { sel: { type: 'lens', name, key: `lens:${name}:${m.n}` } }));
      if (m.n === 2) kids.push(item('loop:2', 2, [kind('🔒 loop', 'lk'), $('span', { text: 'fix: back to the spec' })]));
      if (m.n === 4) kids.push(item('loop:4', 2, [kind('🔒 loop', 'lk'), $('span', { text: 'not done: back to the build (move 3)' })]));
      const li = item(`move:${m.n}`, 1, [kind(`🔒 move ${m.n}`, 'lk'), $('strong', { text: m.lead })], { sel: { type: 'move', n: m.n, key: `move:${m.n}` }, attrs: { 'aria-expanded': 'true' } });
      li.append($('ul', { role: 'group' }, kids));
      return li;
    }),
    (() => {
      const li = item('always', 1, [kind('🔒 always', 'lk'), $('span', { text: 'Always on, every move' })], { attrs: { 'aria-expanded': 'true' } });
      li.append($('ul', { role: 'group' }, DATA.always.map(a => item(`gated:${a.mark}`, 2, [kind('🔒 gated', 'lk'), $('span', { text: a.mark })], { sel: { type: 'gated', mark: a.mark, key: `gated:${a.mark}` } }))));
      return li;
    })());
  const roving = items.find(i => i.dataset.key === S.focus) || items[0];
  roving.tabIndex = 0;
  // Schematic map of the same graph.
  const W = 640;
  const map = svg('svg', { class: 'map', viewBox: `0 0 ${W} 190`, role: 'img', 'aria-label': 'Map: moves 1 to 4 in order, with the pact\'s loops' });
  arrowDefs(map);
  MOVES.forEach((m, i) => {
    const x = 20 + i * 155;
    map.append(svg('rect', { x, y: 60, width: 120, height: 56 }), svg('text', { x: x + 8, y: 80 }, `move ${m.n} 🔒`),
      svg('text', { x: x + 8, y: 97 }, `${stepsIn(zoneOf(m.n)).length} steps`), svg('text', { x: x + 8, y: 111 }, `${lensesAt(m.n).length} lenses`));
    if (i < 3) map.append(svg('path', { d: `M${x + 120},88 L${x + 153},88`, 'marker-end': 'url(#ah)' }));
    if (stepsIn(zoneOf(m.n)).some(usesYou) || m.n === 2 || m.n === 4) map.append(svg('path', { class: 'y', d: `M${x + 100},60 L${x + 100},26`, 'marker-end': 'url(#ahy)' }));
  });
  map.append(svg('text', { x: 20, y: 18 }, 'You'), svg('path', { class: 'l', d: 'M295,116 C295,160 195,160 195,118', 'marker-end': 'url(#ahl)' }),
    svg('path', { class: 'l', d: 'M560,116 C560,175 405,175 405,118', 'marker-end': 'url(#ahl)' }));
  return $('div', { cls: 'outline' },
    $('p', { cls: 'keys', text: 'Keyboard: ↑/↓ walk the outline · Enter selects · on a step, Alt+↑/↓ reorders, Alt+←/→ moves it to the next move, Delete removes. Locked rows can be read, not changed.' }),
    tree, map);
}

// ------------------------------------------------------------------ render
function render() {
  const app = document.getElementById('app');
  const view = { A: variantA, B: variantB, C: variantC }[S.variant]();
  app.replaceChildren($('div', { cls: `frame ${S.variant.toLowerCase()}` }, menu(), view, inspector()), compiledPanel());
  document.getElementById('vlabel').textContent = `${S.variant} (${VARIANTS[S.variant]})`;
  if (S.focus) {
    const f = app.querySelector(`[data-key="${CSS.escape(S.focus)}"]`);
    if (f) f.focus();
  }
}
function cycle(d) {
  const keys = Object.keys(VARIANTS);
  S.variant = keys[(keys.indexOf(S.variant) + d + keys.length) % keys.length];
  try { history.replaceState(null, '', `?variant=${S.variant}`); } catch { /* file:// may refuse */ }
  render();
}
document.getElementById('prev').addEventListener('click', () => cycle(-1));
document.getElementById('next').addEventListener('click', () => cycle(1));
document.addEventListener('keydown', e => {
  const t = document.activeElement;
  if (e.altKey || !(t === document.body || t?.closest('.switcher'))) return;
  if (e.key === 'ArrowLeft') cycle(-1);
  if (e.key === 'ArrowRight') cycle(1);
});
const wf = document.getElementById('workflow');
wf.append($('option', { value: '', text: '(load a saved workflow)' }), DATA.workflows.map(w => $('option', { value: w.id, text: w.title })));
wf.addEventListener('change', () => {
  const w = DATA.workflows.find(x => x.id === wf.value);
  if (!w) return;
  S.steps = w.presets.map(id => newStep('preset', { presetId: id }, presetById(id).slot));
  for (const m of DATA.editable) S.kept[m] = true;
  S.sel = null;
  say(`Loaded the ${w.title} workflow: ${S.steps.length} steps.`);
  render();
});
const usage = document.getElementById('usage');
usage.min = DATA.setting.min;
usage.max = DATA.setting.max;
usage.value = S.usage;
usage.addEventListener('change', () => { S.usage = Number(usage.value); render(); });
window.addEventListener('resize', () => render());
// A start state to look at: the close-the-loop workflow plus a command step.
S.steps = [
  newStep('command', { name: 'to-spec' }, 'move-2'),
  newStep('preset', { presetId: 'move-3-done-criteria' }, 'move-3'),
  newStep('skill', { name: 'tdd', when: '' }, 'move-3'),
  newStep('preset', { presetId: 'move-4-docs-check' }, 'move-4-extra'),
];
render();

// PROTOTYPE v2 for #143, throwaway. Stages are the nodes; the four moves are a
// fixed band that runs at every seam; three item states. Read-only: nothing
// is saved.
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
const clone = o => JSON.parse(JSON.stringify(o));

let seq = 0;
const S = { preset: 'software', wf: null, sel: null, focus: null };
function load(key) {
  S.preset = key;
  const p = clone(PRESETS[key]);
  p.stages.forEach(st => { st.id = `st${++seq}`; st.items.forEach(it => { it.id = `it${++seq}`; it.on = true; }); });
  p.loops = p.loops.map(l => ({ id: `lp${++seq}`, from: p.stages[l.from].id, to: p.stages[l.to].id, when: l.when }));
  S.wf = p;
  S.sel = null;
}
const stage = id => S.wf.stages.find(s => s.id === id);
const stageIx = id => S.wf.stages.findIndex(s => s.id === id);
const say = t => { document.getElementById('live').textContent = t; };
function select(sel) { S.sel = sel; S.focus = sel.key; render(); }

// ------------------------------------------------------------------ actions
function addStage() {
  const st = { id: `st${++seq}`, name: `Stage ${S.wf.stages.length + 1}`, artifact: '', items: [], moves: { sense: '', think: '', checkpoint: '', own: '' } };
  S.wf.stages.push(st);
  say(`Added ${st.name}.`);
  select({ type: 'stage', id: st.id, key: `stage:${st.id}` });
}
function moveStage(id, d) {
  const i = stageIx(id);
  const j = i + d;
  if (j < 0 || j >= S.wf.stages.length) return say('Already at that end.');
  const a = S.wf.stages;
  [a[i], a[j]] = [a[j], a[i]];
  say(`${a[j].name} is now stage ${j + 1}.`);
  render();
}
function removeStage(id) {
  const st = stage(id);
  if (st.items.some(it => it.state !== 'toggle')) return say(`${st.name} holds a fixed or required item. Move it to another stage first.`);
  S.wf.stages = S.wf.stages.filter(s => s.id !== id);
  S.wf.loops = S.wf.loops.filter(l => l.from !== id && l.to !== id);
  S.sel = null;
  say(`Removed ${st.name}.`);
  render();
}
function addItem(y) {
  const st = S.sel && S.sel.type === 'stage' ? stage(S.sel.id) : S.sel && S.sel.stage ? stage(S.sel.stage) : S.wf.stages[0];
  if (!st) return say('Add a stage first.');
  const text = y.kind === 'skill' ? `Use the \`${y.name}\` skill.` : y.kind === 'command' ? `At this step, hand me the trigger: type \`/${y.name}\`.` : y.kind === 'agent' ? `Run \`${y.name}\`, your own agent, and post its report.` : '';
  const it = { id: `it${++seq}`, label: y.kind === 'command' ? `/${y.name}` : y.kind === 'text' ? 'Your own line' : y.name, state: 'toggle', on: true, yours: true, kind: y.kind, text };
  st.items.push(it);
  say(`Added ${it.label} to ${st.name}.`);
  select({ type: 'item', id: it.id, stage: st.id, key: `item:${it.id}` });
}
function removeItem(stId, itId) {
  const st = stage(stId);
  st.items = st.items.filter(i => i.id !== itId);
  S.sel = { type: 'stage', id: stId, key: `stage:${stId}` };
  say('Removed.');
  render();
}

// ------------------------------------------------------------------ pieces
const isSel = k => S.sel && S.sel.key === k;
const stateWord = { fixed: 'fixed', required: 'required, swappable', toggle: 'toggle' };
function itemNode(st, it) {
  const key = `item:${it.id}`;
  const label = it.state === 'required' ? `${it.label}: ${it.fillers[it.choice]}` : it.label;
  const kids = [$('span', { cls: 't', text: it.state === 'required' ? it.label : it.label }),
    it.state === 'required' ? $('span', { cls: 's', text: `↻ ${it.fillers[it.choice]}` }) : null,
    $('span', { cls: 's', text: stateWord[it.state] + (it.yours ? ' · yours' : '') })];
  const box = $('div', { cls: `item ${it.state}${it.on ? '' : ' off'}${isSel(key) ? ' sel' : ''}` });
  if (it.state === 'toggle') {
    box.append($('input', { type: 'checkbox', cls: 'sw', checked: it.on, 'aria-label': `${it.label}: ${it.on ? 'on' : 'off'}`, onchange: e => { it.on = e.target.checked; say(`${it.label} ${it.on ? 'on' : 'off'}.`); render(); } }));
  }
  box.append($('button', { type: 'button', cls: 'ib', 'data-key': key, 'aria-label': `${label}, ${stateWord[it.state]}${it.on ? '' : ', off'}`, onclick: () => select({ type: 'item', id: it.id, stage: st.id, key }) }, kids));
  return box;
}
function stageNode(st, i) {
  const key = `stage:${st.id}`;
  return $('section', { cls: `stage${isSel(key) ? ' sel' : ''}`, 'data-stage': st.id, 'aria-label': `Stage ${i + 1}: ${st.name}` },
    $('button', { type: 'button', cls: 'sh', 'data-key': key, 'aria-label': `Stage ${i + 1}, ${st.name}. Alt and left or right arrow moves it; Delete removes it.`,
      onclick: () => select({ type: 'stage', id: st.id, key }),
      onkeydown: e => {
        if (e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); moveStage(st.id, -1); }
        else if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); moveStage(st.id, 1); }
        else if (e.key === 'Delete') { e.preventDefault(); removeStage(st.id); }
      } },
    $('span', { cls: 'n', text: `STAGE ${i + 1} · toggle` }), $('span', { cls: 't', text: st.name }), st.artifact ? $('span', { cls: 's', text: `→ ${st.artifact}` }) : null),
    st.items.map(it => itemNode(st, it)),
    st.items.length ? null : $('p', { cls: 'empty', text: 'Empty. Select this stage, then add from the menu.' }));
}
function seamNode(st, i) {
  const key = `seam:${st.id}`;
  return $('button', { type: 'button', cls: `seam${isSel(key) ? ' sel' : ''}`, 'data-key': key, 'aria-label': `The four moves at the seam after ${st.name}`,
    onclick: () => select({ type: 'seam', id: st.id, key }) },
  MOVES.map(m => $('span', { cls: `dot ${m.key}`, text: m.short })));
}
function movesBand() {
  return $('section', { cls: 'band moves', 'aria-label': 'The four moves, fixed, at every seam' },
    $('div', { cls: 'bl', text: '🔒 Fixed · the four moves · they run at every seam, in this order · any move can send work back' }),
    $('div', { cls: 'mrow' }, MOVES.map(m => $('button', { type: 'button', cls: `mv ${m.key}${isSel(`move:${m.key}`) ? ' sel' : ''}`, 'data-key': `move:${m.key}`, 'data-move': m.key,
      onclick: () => select({ type: 'move', key: `move:${m.key}`, move: m.key }) }, $('span', { cls: 'dot', text: m.short }), $('span', { text: m.name })))));
}
function floorBand() {
  return $('section', { cls: 'band floor', 'aria-label': 'The floor, fixed' },
    $('div', { cls: 'bl', text: '🔒 Fixed · the floor · holds in every workflow' }),
    $('div', { cls: 'mrow' }, FLOOR.map((f, i) => $('button', { type: 'button', cls: `fl${isSel(`floor:${i}`) ? ' sel' : ''}`, 'data-key': `floor:${i}`, onclick: () => select({ type: 'floor', i, key: `floor:${i}` }) }, f.label))));
}
function menu() {
  return $('aside', { cls: 'menu', 'aria-label': 'What you can add' },
    $('h2', { text: 'Workflow' }),
    $('button', { type: 'button', cls: 'pal', text: '+ Add a stage', onclick: addStage }),
    $('h2', { text: 'Add to the selected stage' }),
    YOURS.map(y => $('button', { type: 'button', cls: 'pal', onclick: () => addItem(y) }, $('span', { text: y.kind === 'command' ? `/${y.name}` : y.name }), $('span', { cls: 'k', text: y.kind }))),
    $('h2', { text: 'States' }),
    $('div', { cls: 'key' },
      $('div', { cls: 'item fixed' }, $('span', { cls: 't', text: 'Fixed' }), $('span', { cls: 's', text: 'cannot be removed' })),
      $('div', { cls: 'item required' }, $('span', { cls: 't', text: 'Required' }), $('span', { cls: 's', text: 'must be filled; you choose by what' })),
      $('div', { cls: 'item toggle' }, $('span', { cls: 't', text: 'Toggle' }), $('span', { cls: 's', text: 'on, off, or removed' }))));
}
function field(label, value, set, multi) {
  return [$('label', { text: label }), multi
    ? $('textarea', { 'aria-label': label, onchange: e => { set(e.target.value); render(); } }, value)
    : $('input', { type: 'text', value, 'aria-label': label, onchange: e => { set(e.target.value); render(); } })];
}
function inspector() {
  const box = $('aside', { cls: 'inspector', 'aria-label': 'Selected item' });
  const sel = S.sel;
  if (!sel) {
    box.append($('h2', { text: S.wf.title }), $('p', { cls: 'note', text: S.wf.note }),
      $('p', { cls: 'note', text: 'Pick a stage, an item, a seam (the S T C O pill between stages), a move or a floor rule.' }));
    return box;
  }
  if (sel.type === 'move') {
    const m = MOVES.find(x => x.key === sel.move);
    box.append($('h2', { text: `${m.name} · fixed` }), $('p', { text: m.about }),
      $('p', { cls: 'note', text: 'A move is not a stage. It runs at every seam of whatever workflow you build, and a session can start at any move.' }),
      MOVE_LOOPS.filter(l => l.from === m.key).map(l => $('p', { cls: 'note', text: `↺ can send work back to "${MOVES.find(x => x.key === l.to).name}" when ${l.when}.` })));
  } else if (sel.type === 'floor') {
    const f = FLOOR[sel.i];
    box.append($('h2', { text: `${f.label} · fixed` }), $('p', { text: f.about }), $('p', { cls: 'note', text: 'The floor protects you from things that are not you: a shared preset, a stray config, a skill or outsiders\' text cannot turn it off.' }));
  } else if (sel.type === 'seam') {
    const st = stage(sel.id);
    box.append($('h2', { text: `The moves after ${st.name}` }), $('p', { cls: 'note', text: 'What each move means at this hand-off. The moves are fixed; these lines are yours.' }),
      MOVES.map(m => field(`${m.short} · ${m.name}`, st.moves[m.key] || '', v => { st.moves[m.key] = v; })));
  } else if (sel.type === 'stage') {
    const st = stage(sel.id);
    const i = stageIx(sel.id);
    box.append($('h2', { text: `Stage ${i + 1} · toggle` }),
      field('Name', st.name, v => { st.name = v; }), field('Artifact it produces', st.artifact, v => { st.artifact = v; }),
      $('label', { text: 'Add a loop back to an earlier stage' }),
      $('div', { cls: 'acts' }, S.wf.stages.slice(0, i + 1).map(t => $('button', { type: 'button', text: `↺ ${t.name}`, onclick: () => {
        S.wf.loops.push({ id: `lp${++seq}`, from: st.id, to: t.id, when: 'something fails' });
        say(`Loop from ${st.name} back to ${t.name}.`);
        render();
      } }))),
      S.wf.loops.filter(l => l.from === st.id).map(l => $('div', { cls: 'loopf' }, field(`↺ back to ${stage(l.to).name} when`, l.when, v => { l.when = v; }),
        $('button', { type: 'button', cls: 'danger', text: 'Remove loop', onclick: () => { S.wf.loops = S.wf.loops.filter(x => x.id !== l.id); render(); } }))),
      $('div', { cls: 'acts' },
        $('button', { type: 'button', text: '← earlier', onclick: () => moveStage(st.id, -1) }),
        $('button', { type: 'button', text: 'later →', onclick: () => moveStage(st.id, 1) }),
        $('button', { type: 'button', cls: 'danger', text: 'Remove stage', onclick: () => removeStage(st.id) })));
  } else if (sel.type === 'item') {
    const st = stage(sel.stage);
    const it = st && st.items.find(x => x.id === sel.id);
    if (!it) { S.sel = null; return inspector(); }
    box.append($('h2', { text: `${it.label} · ${stateWord[it.state]}` }));
    if (it.state === 'fixed') box.append($('p', { cls: 'note', text: 'Fixed: it comes from the moves or the floor, and no workflow can remove it.' }));
    if (it.state === 'required') {
      box.append($('p', { cls: 'note', text: 'Required: this slot must be filled. Choose what fills it; you cannot leave it empty.' }),
        $('label', { text: 'Filled by' }),
        $('select', { 'aria-label': 'Filled by', onchange: e => { it.choice = Number(e.target.value); render(); } }, it.fillers.map((f, k) => $('option', { value: String(k), text: f, selected: k === it.choice }))));
    }
    if (it.state === 'toggle') {
      box.append($('label', {}, $('input', { type: 'checkbox', checked: it.on, onchange: e => { it.on = e.target.checked; render(); } }), ' On'));
    }
    box.append(field('Rules text', it.text, v => { it.text = v; }, true));
    if (it.state === 'toggle') box.append($('div', { cls: 'acts' }, $('button', { type: 'button', cls: 'danger', text: 'Remove', onclick: () => removeItem(st.id, it.id) })));
  }
  return box;
}
function compiledText() {
  const w = S.wf;
  const out = [`# Workflow: ${w.title}`, '', 'The four moves run at every seam below, in order: sense the work, think before doing, checkpoint the seam, stay the owner. Any move may send the work back. The floor holds throughout.', ''];
  w.stages.forEach((st, i) => {
    out.push(`${i + 1}. **${st.name}**${st.artifact ? ` (produces ${st.artifact})` : ''}`);
    for (const it of st.items) {
      if (it.state === 'toggle' && !it.on) continue;
      const tag = it.state === 'fixed' ? ' [fixed]' : it.state === 'required' ? ` [required: ${it.fillers[it.choice]}]` : '';
      out.push(`   - ${it.text}${tag}`);
    }
    const mv = MOVES.filter(m => st.moves[m.key]).map(m => `${m.name}: ${st.moves[m.key]}`);
    if (mv.length) out.push(`   - At the seam after ${st.name}: ${mv.join(' ')}`);
    for (const l of w.loops.filter(x => x.from === st.id)) out.push(`   - If ${l.when}, go back to ${stage(l.to).name}.`);
  });
  if (!w.stages.length) out.push('(No stages: the moves and the floor apply to whatever the session does.)');
  return out.join('\n');
}

// ------------------------------------------------------------------ arrows
function rel(el, box) {
  const r = el.getBoundingClientRect();
  const b = box.getBoundingClientRect();
  return { x: r.left - b.left + box.scrollLeft, y: r.top - b.top + box.scrollTop, w: r.width, h: r.height };
}
function marker(s, id, color) {
  const m = svg('marker', { id, viewBox: '0 0 10 10', refX: '9', refY: '5', markerWidth: '7', markerHeight: '7', orient: 'auto-start-reverse' });
  m.append(svg('path', { d: 'M0,0 L10,5 L0,10 z', fill: color }));
  s.append(m);
}
function drawArrows(box) {
  box.querySelector('svg.arrows')?.remove();
  const s = svg('svg', { class: 'arrows', 'aria-hidden': 'true', width: box.scrollWidth, height: box.scrollHeight });
  const defs = svg('defs');
  s.append(defs);
  marker(defs, 'a2', 'var(--ink)');
  marker(defs, 'a2l', 'var(--lock)');
  marker(defs, 'a2y', 'var(--you)');
  // Move grammar: forward arrows and back-arrows.
  const mv = k => rel(box.querySelector(`[data-move="${k}"]`), box);
  MOVES.slice(0, -1).forEach((m, i) => {
    const a = mv(m.key);
    const b = mv(MOVES[i + 1].key);
    s.append(svg('path', { d: `M${a.x + a.w},${a.y + a.h / 2} L${b.x - 2},${b.y + b.h / 2}`, class: 'fw', 'marker-end': 'url(#a2)' }));
  });
  MOVE_LOOPS.forEach((l, k) => {
    const a = mv(l.from);
    const b = mv(l.to);
    const y = a.y + a.h + 14 + k * 20;
    s.append(svg('path', { d: `M${a.x + a.w / 2},${a.y + a.h} L${a.x + a.w / 2},${y} L${b.x + b.w / 2 + 8},${y} L${b.x + b.w / 2 + 8},${b.y + b.h + 2}`, class: 'bk', 'marker-end': 'url(#a2y)' }));
    s.append(svg('text', { x: a.x + a.w / 2 + 6, y: y + 13, class: 'yt' }, `↺ ${l.when}`));
  });
  // Stage loops, below the row.
  const row = box.querySelector('.srow');
  if (row) {
    const rr = rel(row, box);
    S.wf.loops.forEach((l, k) => {
      const fa = box.querySelector(`[data-stage="${l.from}"]`);
      const ta = box.querySelector(`[data-stage="${l.to}"]`);
      if (!fa || !ta) return;
      const a = rel(fa, box);
      const b = rel(ta, box);
      const y = rr.y + rr.h + 18 + k * 22;
      const ax = a.x + a.w / 2;
      const bx = b.x + b.w / 2 + (l.from === l.to ? 30 : 0);
      s.append(svg('path', { d: `M${ax},${a.y + a.h} L${ax},${y} L${bx},${y} L${bx},${b.y + b.h + 2}`, class: 'lp', 'marker-end': 'url(#a2l)' }));
      s.append(svg('text', { x: Math.min(ax, bx) + 6, y: y - 4, class: 'lt' }, `↺ ${l.when}`));
    });
  }
  box.append(s);
}

// ------------------------------------------------------------------ render
function render() {
  const app = document.getElementById('app');
  const canvas = $('div', { cls: 'canvas2', role: 'region', 'aria-label': 'Workflow canvas' },
    movesBand(),
    $('div', { cls: 'srow' }, S.wf.stages.map((st, i) => [stageNode(st, i), seamNode(st, i)]),
      $('button', { type: 'button', cls: 'addst', text: '+ stage', onclick: addStage })),
    $('div', { cls: 'loopspace', 'data-n': String(S.wf.loops.length) }),
    floorBand());
  app.replaceChildren($('div', { cls: 'frame' }, menu(), canvas, inspector()),
    $('section', { cls: 'compiled', 'aria-label': 'What this compiles to' }, $('h2', { text: 'What this compiles to (preview only, nothing is saved)' }), $('pre', { text: compiledText() })));
  canvas.querySelector('.loopspace').style.height = `${30 + S.wf.loops.length * 22}px`;
  requestAnimationFrame(() => drawArrows(canvas));
  if (S.focus) app.querySelector(`[data-key="${CSS.escape(S.focus)}"]`)?.focus();
}
const pick = document.getElementById('preset');
for (const [k, p] of Object.entries(PRESETS)) pick.append($('option', { value: k, text: `${p.title} (${p.badge})` }));
pick.addEventListener('change', () => { load(pick.value); say(`Loaded ${S.wf.title}.`); render(); });
window.addEventListener('resize', () => render());
load('software');
render();

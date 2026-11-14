'use strict';

// Her coding workshop: Claude's task as it goes (each step, the files it changes), its questions with
// the same buttons as her bubble (answered here, her bubble goes away), the history of her tasks, a
// box to give her a new one in a folder you pick, and how much of your Claude plan is used.

const T = {
  pt: {
    title: 'Oficina do Claude', refresh: 'Atualizar', idle: 'Nenhuma tarefa agora.',
    idleHint: 'Peça no chat dela (“Capri, na pasta site no windows, faça…”) ou escreva aqui embaixo.',
    cancel: 'Cancelar', steps: 'Passos', newTask: 'Nova tarefa', askPh: 'O que o Claude deve fazer?', pick: 'Escolher pasta…',
    shop: 'Na oficina dela', go: 'Mandar pra Capri', history: 'Histórico', noHistory: 'Nada ainda.', noSteps: 'Os passos do Claude aparecem aqui.',
    session: 'Sessão (5 h)', week: 'Semana', weekOf: 'Semana · {m}', resets: 'renova {when}', usageNone: 'Limite do Claude: indisponível',
    asks: 'O Claude quer:', allow: 'Permitir', deny: 'Negar', allowAll: 'Permitir tudo nesta tarefa',
    write: 'Criar {f}', edit: 'Editar {f}', bash: 'Rodar um comando', web: 'Abrir {f}', other: 'Usar {f}',
    steps_n: '{n} passos', busy: 'O Claude já está trabalhando.', model: 'modelo: {m}', secs: '{m} min', running: 'trabalhando…',
    shownText: 'Claude disse', changes: 'ver mudança', taskTag: 'TAREFA', stepsTag: 'PASSOS', newTag: 'NOVA.TAREFA', historyTag: 'HISTÓRICO',
    working: 'TRABALHANDO', waiting: 'PERMISSÃO', okMark: 'OK', badMark: 'FALHOU', queueTag: 'FILA', goQueue: 'Pôr na fila', remove: 'Tirar',
    whenNames: { limit: 'quando o limite renovar', night: 'de madrugada', next: 'depois da atual' }, modes: { auto: 'permissões: auto', acceptEdits: 'permissões: edita sozinho', default: 'permissões: pergunta tudo' },
    verbs: { Write: 'CRIA', Edit: 'EDITA', MultiEdit: 'EDITA', NotebookEdit: 'EDITA', Bash: 'RODA', Read: 'LÊ', Glob: 'PROCURA', Grep: 'PROCURA', LS: 'OLHA', WebFetch: 'NAVEGA', WebSearch: 'PESQUISA', TodoWrite: 'PLANEJA', Task: 'DELEGA', Agent: 'DELEGA' },
  },
  en: {
    title: 'Claude’s workshop', refresh: 'Refresh', idle: 'No task right now.',
    idleHint: 'Ask in her chat (“Capri, in the site folder on Windows, make…”) or write one below.',
    cancel: 'Cancel', steps: 'Steps', newTask: 'New task', askPh: 'What should Claude do?', pick: 'Pick a folder…',
    shop: 'In her workshop', go: 'Hand it to Capri', history: 'History', noHistory: 'Nothing yet.', noSteps: 'Claude’s steps show up here.',
    session: 'Session (5 h)', week: 'Week', weekOf: 'Week · {m}', resets: 'resets {when}', usageNone: 'Claude limit: unavailable',
    asks: 'Claude wants to:', allow: 'Allow', deny: 'Deny', allowAll: 'Allow all in this task',
    write: 'Create {f}', edit: 'Edit {f}', bash: 'Run a command', web: 'Open {f}', other: 'Use {f}',
    steps_n: '{n} steps', busy: 'Claude is already working.', model: 'model: {m}', secs: '{m} min', running: 'working…',
    shownText: 'Claude said', changes: 'see change', taskTag: 'TASK', stepsTag: 'STEPS', newTag: 'NEW.TASK', historyTag: 'HISTORY',
    working: 'WORKING', waiting: 'PERMISSION', okMark: 'OK', badMark: 'FAILED', queueTag: 'QUEUE', goQueue: 'Queue it', remove: 'Remove',
    whenNames: { limit: 'when the limit resets', night: 'overnight', next: 'after the current one' }, modes: { auto: 'permissions: auto', acceptEdits: 'permissions: edits alone', default: 'permissions: ask all' },
    verbs: { Write: 'WRITE', Edit: 'EDIT', MultiEdit: 'EDIT', NotebookEdit: 'EDIT', Bash: 'RUN', Read: 'READ', Glob: 'FIND', Grep: 'FIND', LS: 'LOOK', WebFetch: 'BROWSE', WebSearch: 'SEARCH', TodoWrite: 'PLAN', Task: 'DELEGATE', Agent: 'DELEGATE' },
  },
};

let t = T.pt;
let state = null;
let folder = null; // the folder picked for a new task (as WSL sees it)
const $ = (id) => document.getElementById(id);
const fmt = (s, v) => String(s).replace(/\{(\w+)\}/g, (_m, k) => (v[k] ?? ''));
const base = (p = '') => String(p).split(/[\\/]/).filter(Boolean).pop() || String(p);
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};

function language(lang) {
  const next = T[String(lang || '').slice(0, 2)] || (navigator.language.startsWith('pt') ? T.pt : T.en);
  if (next === t && document.body.dataset.ready) return;
  t = next;
  document.body.dataset.ready = '1';
  document.documentElement.lang = t === T.pt ? 'pt-BR' : 'en';
  document.title = t.title;
  document.querySelectorAll('[data-t]').forEach((n) => { if (!(n.id === 'picked' && folder)) n.textContent = t[n.dataset.t]; });
  document.querySelectorAll('[data-ph]').forEach((n) => { n.placeholder = t[n.dataset.ph]; });
}

// ---- the plan's use ----
const MONTHS = { Jan: 'jan', Feb: 'fev', Mar: 'mar', Apr: 'abr', May: 'mai', Jun: 'jun', Jul: 'jul', Aug: 'ago', Sep: 'set', Oct: 'out', Nov: 'nov', Dec: 'dez' };
function when(row) {
  if (row.resetsAt) {
    const d = new Date(row.resetsAt);
    const sameDay = d.toDateString() === new Date().toDateString();
    return d.toLocaleString(t === T.pt ? 'pt-BR' : 'en', sameDay ? { hour: '2-digit', minute: '2-digit' } : { weekday: 'short', hour: '2-digit', minute: '2-digit' });
  }
  if (!row.resets) return '';
  return t === T.pt ? row.resets.replace(/\b([A-Z][a-z]{2})\b/, (m) => MONTHS[m] || m) : row.resets;
}

function meters(usage) {
  const box = $('meters');
  box.replaceChildren();
  const rows = (usage?.rows || []).filter((r) => r.key === 'session' || r.key === 'week' || r.pct > 0);
  if (!rows.length) {
    box.append(el('span', 'muted small-text', t.usageNone));
    return;
  }
  for (const r of rows.slice(0, 3)) {
    const m = el('div', 'meter');
    const label = el('div', 'm-top');
    label.append(el('span', null, r.key === 'session' ? t.session : r.key === 'week' ? t.week : fmt(t.weekOf, { m: r.label || '' })), el('b', null, `${Math.round(r.pct)}%`));
    const bar = el('div', 'bar');
    const fill = el('i', r.pct >= 90 ? 'high' : r.pct >= 70 ? 'warn' : '');
    fill.style.width = `${Math.max(0, Math.min(100, r.pct))}%`;
    bar.append(fill);
    bar.setAttribute('role', 'meter');
    bar.setAttribute('aria-valuenow', String(Math.round(r.pct)));
    bar.setAttribute('aria-valuemin', '0');
    bar.setAttribute('aria-valuemax', '100');
    const w = when(r);
    m.append(label, bar, el('div', 'reset', w ? fmt(t.resets, { when: w }) : ''));
    box.append(m);
  }
}

// ---- Claude's questions ----
function describe({ tool, input = {} }) {
  if (tool === 'Write') return { what: fmt(t.write, { f: base(input.file_path) }), body: [['add', String(input.content || '').slice(0, 3000)]], path: input.file_path };
  if (['Edit', 'MultiEdit', 'NotebookEdit'].includes(tool)) {
    const edits = Array.isArray(input.edits) ? input.edits : [input];
    return { what: fmt(t.edit, { f: base(input.file_path || input.notebook_path) }), path: input.file_path || input.notebook_path, body: edits.slice(0, 4).flatMap((e) => [['del', String(e.old_string ?? '').slice(0, 1200)], ['add', String(e.new_string ?? e.new_source ?? '').slice(0, 1200)]]) };
  }
  if (tool === 'Bash') return { what: t.bash, body: [['', `$ ${String(input.command || '')}${input.description ? `\n# ${input.description}` : ''}`]] };
  if (tool === 'WebFetch') return { what: fmt(t.web, { f: String(input.url || '') }), body: [] };
  return { what: fmt(t.other, { f: tool }), body: [['', JSON.stringify(input, null, 2).slice(0, 1500)]] };
}

function asks(list) {
  const box = $('asks');
  box.replaceChildren();
  for (const g of list) {
    const d = describe(g);
    const card = el('div', 'card ask');
    const frame = el('div', 'frame');
    const plate = el('div', 'plate');
    frame.append(plate);
    card.append(frame);
    const label = el('p', 'label');
    label.append(el('span', 'who', 'CLAUDE'), el('span', 'tag', g.tool.toUpperCase()), el('span', 'state', t.waiting));
    plate.append(label, el('h3', null, `${t.asks} ${d.what}`));
    if (d.path) plate.append(el('div', 'muted small-text', d.path));
    if (d.body.length) {
      const pre = el('pre');
      for (const [cls, text] of d.body) pre.append(el('span', cls, `${text}\n`));
      plate.append(pre);
    }
    const row = el('div', 'row');
    const yes = el('button', 'btn primary', t.allow);
    const no = el('button', 'btn danger', t.deny);
    const all = el('button', 'btn', t.allowAll);
    const done = () => [yes, no, all].forEach((b) => { b.disabled = true; });
    yes.onclick = () => { done(); window.work.answer(g.id, true); };
    no.onclick = () => { done(); window.work.answer(g.id, false); };
    all.onclick = () => { done(); window.work.allowAll(); window.work.answer(g.id, true); };
    row.append(yes, no, all);
    plate.append(row);
    box.append(card);
  }
}

// ---- the task and its steps ----
function step(s) {
  const li = el('li');
  if (s.kind === 'text') {
    li.append(el('span', 'verb', '💬'), el('div', 'what say', s.text));
    return li;
  }
  const what = el('div', 'what', s.name === 'Bash' ? `$ ${s.target}` : s.target || s.name);
  if (s.detail) {
    const det = el('details');
    det.append(el('summary', null, t.changes));
    const pre = el('pre');
    if (s.detail.old != null) pre.append(el('span', 'del', `${s.detail.old}\n`));
    pre.append(el('span', 'add', `${s.detail.new}\n`));
    det.append(pre);
    what.append(det);
  }
  li.append(el('span', 'verb', t.verbs[s.name] || String(s.name).toUpperCase().slice(0, 8)), what);
  return li;
}

let shownSteps = -1;
function task(tk) {
  $('idle').hidden = Boolean(tk);
  $('task').hidden = !tk;
  $('live').classList.toggle('on', Boolean(tk));
  $('go').textContent = tk ? t.goQueue : t.go;
  const log = $('log');
  if (!tk) {
    if (shownSteps !== -1 || !log.children.length) { log.replaceChildren(el('li', 'muted', t.noSteps)); shownSteps = -1; }
    return;
  }
  $('prompt').textContent = tk.prompt;
  $('dir').textContent = `📁 ${tk.dir}`;
  $('dir').title = tk.dir;
  $('dir').onclick = () => window.work.reveal(tk.dir);
  $('model').textContent = fmt(t.model, { m: tk.model });
  $('mode').textContent = t.modes[tk.permission] || '';
  $('mode').hidden = !tk.permission;
  const tools = tk.steps.filter((s) => s.kind === 'tool').length;
  $('count').textContent = fmt(t.steps_n, { n: tools });
  // only the new steps: the log keeps its scroll
  if (shownSteps === -1 || shownSteps > tk.steps.length) { log.replaceChildren(); shownSteps = 0; }
  const stick = log.scrollTop + log.clientHeight >= log.scrollHeight - 30;
  for (const s of tk.steps.slice(shownSteps)) log.append(step(s));
  shownSteps = tk.steps.length;
  if (stick) log.scrollTop = log.scrollHeight;
}

function tick() {
  const tk = state?.task;
  if (!tk) return;
  const s = Math.floor((Date.now() - tk.startedAt) / 1000);
  $('clock').textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function history(list) {
  const box = $('history');
  box.replaceChildren();
  if (!list.length) return box.append(el('li', 'muted', t.noHistory));
  for (const h of list) {
    const li = el('li');
    const top = el('div', 'h-top');
    top.append(el('span', `mark ${h.ok ? 'ok' : 'bad'}`, h.ok ? t.okMark : t.badMark), el('span', 'h-prompt', h.prompt));
    top.title = h.prompt;
    const d = new Date(h.at);
    const meta = el('div', 'h-meta', `${d.toLocaleString(t === T.pt ? 'pt-BR' : 'en', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })} · ${fmt(t.secs, { m: Math.max(1, Math.round(h.secs / 60)) })} · ${fmt(t.steps_n, { n: h.steps })} · ${base(h.dir)}`);
    li.append(top, meta);
    if (h.text) li.append(el('div', 'h-text', h.text));
    li.ondblclick = () => window.work.reveal(h.dir);
    box.append(li);
  }
  return undefined;
}

function queue(list) {
  $('queue-card').hidden = !list.length;
  const box = $('queue');
  box.replaceChildren();
  for (const q of list) {
    const li = el('li');
    const top = el('div', 'h-top');
    const rm = el('button', 'btn small', t.remove);
    rm.onclick = () => window.work.unqueue(q.id);
    top.append(el('span', 'mark ok', '⏳'), el('span', 'h-prompt', q.prompt), rm);
    top.title = q.prompt;
    li.append(top, el('div', 'h-meta', `${t.whenNames[q.when] || q.when}${q.folder ? ` · ${base(q.folder)}` : ''}`));
    box.append(li);
  }
}

function render(s) {
  state = s;
  language(s.lang);
  document.documentElement.dataset.theme = s.theme === 'classic' ? 'classic' : 'nightcity';
  $('state').textContent = s.task ? ((s.asks || []).length ? t.waiting : t.working) : '';
  meters(s.usage);
  asks(s.asks || []);
  task(s.task);
  history(s.history || []);
  queue(s.queue || []);
  tick();
}

// ---- a new task ----
$('pick').onclick = async () => {
  const f = await window.work.pick();
  if (!f) return;
  folder = f.dir;
  $('picked').textContent = `📁 ${f.win || f.dir}`;
  $('picked').title = f.dir;
};
$('new').onsubmit = (e) => {
  e.preventDefault();
  const prompt = $('ask').value.trim();
  if (!prompt) return;
  window.work.start(prompt, folder);
  $('ask').value = '';
};
$('ask').onkeydown = (e) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) $('new').requestSubmit();
};
$('refresh').onclick = async () => {
  $('refresh').disabled = true;
  await window.work.usage().catch(() => null);
  $('refresh').disabled = false;
};

window.work.onState(render);
window.work.state().then(render);
setInterval(tick, 1000);

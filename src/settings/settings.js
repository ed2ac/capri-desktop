'use strict';

// Her settings: her menu (main.js sends it as a tree), drawn as sections. The top level's submenus are
// the sections (Senses, Behavior, AI, Looks…); loose items go in a first section. Switches for
// checkboxes, a row of buttons for a choice (radio), buttons for actions. Search filters everything.

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
let tree = null;

function row(item) {
  if (item.type === 'separator') return null;
  const li = el('li', item.enabled ? '' : 'disabled');
  li.dataset.find = item.label.toLowerCase();
  if (item.type === 'checkbox') {
    const sw = el('button', 'switch');
    sw.setAttribute('role', 'switch');
    sw.setAttribute('aria-checked', String(item.checked));
    sw.setAttribute('aria-label', item.label);
    sw.disabled = !item.enabled;
    sw.onclick = () => window.settings.click(item.id);
    li.append(el('span', 'name', item.label), sw);
  } else if (item.type === 'action') {
    const b = el('button', 'btn', item.label);
    b.disabled = !item.enabled;
    b.onclick = () => window.settings.click(item.id);
    li.append(el('span', 'name', ''), b);
    li.firstChild.remove();
  } else if (item.type === 'submenu') {
    return sub(item);
  } else {
    li.append(el('span', 'info', item.label));
  }
  return li;
}

// a submenu: a choice (all radios) as one row of buttons; otherwise its own little list
function sub(item) {
  const kids = (item.children || []).filter((c) => c.type !== 'separator');
  const li = el('li');
  li.dataset.find = [item.label, ...kids.map((k) => k.label)].join(' ').toLowerCase();
  if (kids.length && kids.every((k) => k.type === 'radio')) {
    const r = el('div', 'radio');
    for (const k of kids) {
      const b = el('button', `btn${k.checked ? ' primary' : ''}`, k.label);
      b.setAttribute('aria-pressed', String(k.checked));
      b.disabled = !k.enabled;
      b.onclick = () => window.settings.click(k.id);
      r.append(b);
    }
    li.append(el('span', 'name', item.label), r);
    li.style.flexWrap = 'wrap';
    return li;
  }
  const box = el('div');
  box.style.flex = '1';
  box.append(el('div', 'sub-title', item.label));
  const ul = el('ul', 'rows sub');
  for (const k of item.children || []) { const r2 = row(k); if (r2) ul.append(r2); }
  box.append(ul);
  li.append(box);
  return li;
}

function render(t) {
  tree = t;
  document.documentElement.dataset.theme = t.theme === 'classic' ? 'classic' : 'nightcity';
  document.title = t.title.replace(/…$/, '');
  $('title').textContent = document.title;
  $('find').placeholder = String(t.lang).startsWith('pt') ? 'Buscar…' : 'Search…';
  const loose = t.items.filter((i) => i.type !== 'submenu');
  const groups = [{ label: String(t.lang).startsWith('pt') ? 'Geral' : 'General', items: loose }, ...t.items.filter((i) => i.type === 'submenu').map((g) => ({ label: g.label, items: g.children || [] }))];
  const nav = $('nav');
  const secs = $('sections');
  const scroll = secs.scrollTop;
  nav.replaceChildren();
  secs.replaceChildren();
  groups.forEach((g, i) => {
    const card = el('div', 'card group');
    card.id = `g${i}`;
    const frame = el('div', 'frame');
    const plate = el('div', 'plate');
    plate.append(el('h2', null, g.label));
    const ul = el('ul', 'rows');
    // her actions (buttons) side by side, the rest a row each
    let actions = null;
    for (const item of g.items) {
      if (item.type === 'action') {
        if (!actions) { actions = el('li', 'actions'); ul.append(actions); }
        const btn = el('button', 'btn', item.label);
        btn.disabled = !item.enabled;
        btn.onclick = () => window.settings.click(item.id);
        actions.dataset.find = `${actions.dataset.find || ''} ${item.label.toLowerCase()}`;
        actions.append(btn);
        continue;
      }
      if (item.type !== 'separator') actions = null;
      const r = row(item);
      if (r) ul.append(r);
    }
    plate.append(ul);
    frame.append(plate);
    card.append(frame);
    secs.append(card);
    const b = el('button', 'btn', g.label);
    b.onclick = () => card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    nav.append(b);
  });
  secs.scrollTop = scroll;
  filter();
}

function filter() {
  const q = $('find').value.trim().toLowerCase();
  for (const li of document.querySelectorAll('.rows > li')) li.classList.toggle('hidden', Boolean(q) && !(li.dataset.find || '').includes(q));
  for (const card of document.querySelectorAll('.group')) card.classList.toggle('hidden', Boolean(q) && !card.querySelector('.rows > li:not(.hidden)'));
}

$('find').oninput = filter;
window.settings.onTree(render);

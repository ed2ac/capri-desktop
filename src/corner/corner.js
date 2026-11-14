'use strict';

// Her corner: her drawings (newest first; a click shows the file), her diary, her achievements.

const T = {
  pt: { title: 'Cantinho da Capri', art: 'Desenhos', diary: 'Diário', wins: 'Conquistas', diaryTag: 'DIÁRIO', winsTag: 'CONQUISTAS',
    noArt: 'Nenhum desenho ainda. Ela desenha quando fica sozinha, ou quando você pede “me desenha”.', noDiary: 'Nada no diário ainda: ela escreve sobre seus dias com “Comentar o que eu faço” ligado.', noWins: 'Nenhuma conquista ainda.' },
  en: { title: 'Capri’s corner', art: 'Drawings', diary: 'Diary', wins: 'Achievements', diaryTag: 'DIARY', winsTag: 'ACHIEVEMENTS',
    noArt: 'No drawings yet. She draws when she’s alone, or when you ask “draw me”.', noDiary: 'Nothing in her diary yet: she writes about your days with “Comment on what I do” on.', noWins: 'No achievements yet.' },
};
const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

function render(d) {
  const t = T[String(d.lang || '').slice(0, 2)] || (navigator.language.startsWith('pt') ? T.pt : T.en);
  document.documentElement.dataset.theme = d.theme === 'classic' ? 'classic' : 'nightcity';
  document.title = t.title;
  document.querySelectorAll('[data-t]').forEach((n) => { n.textContent = t[n.dataset.t]; });
  const art = $('art');
  art.replaceChildren();
  if (!d.drawings.length) art.append(el('p', 'empty-note', t.noArt));
  for (const a of d.drawings) {
    const card = el('div', 'card');
    const frame = el('div', 'frame');
    const plate = el('div', 'plate');
    const img = el('img');
    img.src = a.url;
    img.alt = '';
    plate.append(img, el('div', 'when', a.when));
    plate.onclick = () => window.corner.reveal(a.name);
    frame.append(plate);
    card.append(frame);
    art.append(card);
  }
  const entries = $('entries');
  entries.replaceChildren();
  if (!d.diary.length) entries.append(el('li', 'empty-note', t.noDiary));
  for (const e of d.diary) {
    const li = el('li');
    li.append(el('div', 'date', new Date(`${e.date}T12:00`).toLocaleDateString(t === T.pt ? 'pt-BR' : 'en', { weekday: 'long', day: 'numeric', month: 'long' })), el('div', 'text', e.text));
    entries.append(li);
  }
  const wins = $('achievements');
  wins.replaceChildren();
  if (!d.achievements.length) wins.append(el('li', 'empty-note', t.noWins));
  for (const a of d.achievements) wins.append(el('li', 'text', `★ ${a.name}`));
}

document.querySelectorAll('[data-tab]').forEach((b) => {
  b.onclick = () => {
    document.querySelectorAll('[data-tab]').forEach((x) => x.classList.toggle('primary', x === b));
    for (const id of ['art', 'diary', 'wins']) $(id).hidden = id !== b.dataset.tab;
  };
});
window.corner.data().then(render);

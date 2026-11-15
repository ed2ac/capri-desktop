// The news her cloud keeps (main cloud.js; cloud/ fetches the feeds every 15 minutes): asked for in
// her chat ("quais as notícias?", "o que rolou nos games?"), or a headline about something of yours
// (a game you play, a thing you like) brought up in a conversation she starts.

const CATS = [
  ['games', /\b(?:games?|jogos?|videogames?|ps5|playstation|xbox|nintendo|gaming)\b/i],
  ['tech', /\b(?:tecnologia|tech|technology|celular(?:es)?|computador(?:es)?|ia|ai)\b/i],
  ['brasil', /\b(?:brasil|brazil|pa[íi]s)\b/i],
  ['mundo', /\b(?:mundo|world|internacional|international|exterior|fora)\b/i],
];

// "quais as notícias", "tem notícia de games?", "o que rolou no mundo hoje?", "any news?"
export const NEWS_ASK = /\bnot[íi]cias?\b|\bnews\b|o\s+que\s+(?:rolou|aconteceu|t[áa]\s+rolando|anda\s+rolando)\s+(?:de\s+novo\s+)?(?:n[oa]s?|em|de)\s+(?:games?|jogos?|tecnologia|tech|brasil|mundo)|what(?:'s|\s+is)\s+happening\s+in\s+(?:games|tech|the\s+world)/i;

export function newsCat(text) {
  return CATS.find(([, re]) => re.test(String(text || '')))?.[0] || null;
}

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// a liked thing in a headline: whole words (a name of 4+ letters, or two words or more)
export function mentions(title, label) {
  const l = norm(label).trim();
  if (l.length < 4) return false;
  const esc = l.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|[^\\p{L}\\p{N}])${esc}(?:$|[^\\p{L}\\p{N}])`, 'u').test(norm(title));
}

// the headlines to tell: of a kind (or a mix of all), what you like first, the newest after
export function pickNews(items, { cat = null, likes = [], max = 5, now = Date.now() } = {}) {
  const fresh = (items || []).filter((i) => now - i.at < 36 * 3600000 && (!cat || i.cat === cat));
  const scored = fresh.map((i) => ({ i, liked: likes.some((l) => mentions(i.title, l)) }))
    .sort((a, b) => Number(b.liked) - Number(a.liked) || b.i.at - a.i.at);
  if (cat) return scored.slice(0, max).map((x) => x.i);
  // a mix: the liked ones, then the newest of each kind in turn
  const out = scored.filter((x) => x.liked).slice(0, 2).map((x) => x.i);
  const kinds = ['games', 'tech', 'brasil', 'mundo'];
  for (let round = 0; out.length < max && round < max; round++) {
    for (const k of kinds) {
      const next = scored.find((x) => x.i.cat === k && !out.includes(x.i));
      if (next && out.length < max) out.push(next.i);
    }
  }
  return out;
}

// a headline about something of yours, not brought up yet: for a conversation
export function newsTopic(items, likes, told = new Set(), now = Date.now()) {
  for (const i of (items || []).filter((x) => now - x.at < 24 * 3600000 && !told.has(x.link))) {
    const label = likes.find((l) => mentions(i.title, l));
    if (label) return { item: i, label };
  }
  return null;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const rand = (a, b) => a + Math.random() * (b - a);
export const pick = (list) => list[Math.floor(Math.random() * list.length)];
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;

export const ease = {
  linear: (t) => t,
  out: (t) => 1 - Math.pow(1 - t, 4),               // power4.out
  in: (t) => t * t * t,
  inOut: (t) => (t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2),
};

// Calmer animations: when Windows has its animation effects off (prefers-reduced-motion), unless
// her menu says otherwise (Animations: like Windows, full, reduced). Read live: `.matches`.
const systemReduced = matchMedia('(prefers-reduced-motion: reduce)');
export const reducedMotion = {
  setting: 'auto', // 'auto' (like Windows), 'full' or 'reduced'
  get matches() {
    return this.setting === 'reduced' || (this.setting === 'auto' && systemReduced.matches);
  },
  get system() {
    return systemReduced.matches;
  },
  onSystemChange(fn) {
    systemReduced.addEventListener('change', fn);
  },
};

// "{project} a fini" + {project: 'x'} -> "x a fini"
export const fmt = (str, vars = {}) => str.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ''));

export function duration(ms, lang = 'fr') {
  const ru = lang === 'ru';
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return ru ? `${s} с` : `${s} s`;
  const m = Math.floor(s / 60);
  const ss = String(s % 60).padStart(2, '0');
  if (m < 60) return lang === 'en' ? `${m}m ${ss}s` : ru ? `${m} мин ${ss} с` : `${m} min ${ss}`;
  return `${Math.floor(m / 60)} ${ru ? 'ч' : 'h'} ${String(m % 60).padStart(2, '0')}`;
}

export const basename = (p = '') => String(p).replace(/[\\/]+$/, '').split(/[\\/]/).pop() || '';

// the local date, YYYY-MM-DD
export const today = (d = new Date()) => {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Tweens a set of numeric props on `target`. Values are read by the stepped render loop,
// so the result lands on whole drawing frames like cel animation.
export function tween(target, to, ms, easing = ease.out) {
  const from = {};
  for (const k of Object.keys(to)) from[k] = target[k];
  const start = performance.now();
  return new Promise((resolve) => {
    if (ms <= 0) {
      Object.assign(target, to);
      resolve();
      return;
    }
    const tick = () => {
      const t = Math.min(1, (performance.now() - start) / ms);
      const e = easing(t);
      for (const k of Object.keys(to)) target[k] = lerp(from[k], to[k], e);
      if (t < 1) requestAnimationFrame(tick);
      else resolve();
    };
    requestAnimationFrame(tick);
  });
}

// Does a line look like it's in her language? Small models slip into English now and then: a line
// with more English words than words of her language (and a few of them) is taken as English.
const WORDS = {
  en: /\b(the|you|your|you're|is|are|and|what|it's|i'm|i|am|my|this|with|that|don't|can't|just|so|of|to|be|was|have|now|right|really|very|we|they|will|can|get|got|like|how|why|when|here|there|for|on|at|in|if|all|out|about|let's|gonna|back|welcome|look|yeah|done|good|great|again|still|never|ever|too|off|over|time)\b/gi,
  pt: /\b(você|vc|não|que|tá|pra|isso|meu|minha|com|uma|um|de|do|da|é|eu|seu|sua|tô|aqui|mais|como|nós|a gente|muito|bom|boa|seus|suas|olha|esse|essa|esses|essas|ele|ela|tudo|nada|hoje|agora)\b|[ãõçêáéíóúâ]/gi,
  es: /\b(tú|usted|que|qué|con|una|un|de|del|el|la|es|yo|tu|aquí|más|cómo|estás|pero)\b|[ñ¿¡]/gi,
  fr: /\b(tu|vous|que|qui|avec|une|un|de|du|le|la|les|est|je|ton|ta|ici|plus|comme|mais|pas)\b|[àèùç]/gi,
};
// words a small model lets slip into her Portuguese (Spanish, mostly) or makes up: a line with one
// of these is redone, like a line in English
const SLIPS = {
  pt: /(?<![\p{L}])(pelea|peleando|también|tambien|muy|tengo|quiero|hola|gracias|cariño|pero sí|vale la pena|ahora mismo|estás|qué tal|mientras tanto sí|claro que sí|amigo mío|chica|chico|nuestra|nuestro)(?![\p{L}])/iu,
  es: /(?<![\p{L}])(você|não|obrigad[oa]|também|muito)(?![\p{L}])/iu,
};

// A line of hers as it should be said: no tone label the model wrote ("(Sleepy)", "[sarcastic]"), no
// stray quotes, no "Capri:" in front, no stage directions in asterisks.
const TONES = 'teasing|proud|sleepy|chaotic|sweet|deadpan|dramatic|smug|sarcastic|playful|warm|curious|happy|sad|angry|excited|bored|tired|flirty|shy|mischievous|serious|soft|whisper(?:ing)?|laughs?|giggles?|sighs?|yawns?|provocante|sonolenta|caótica|doce|irônica|dramática|orgulhosa|brincalhona|fofa|curiosa|animada|cansada|sarcástica';
const TONE_TAG = new RegExp(`\\s*[([](?:${TONES})(?:\\s*[,/&e]\\s*(?:${TONES}))*[)\\]]\\s*`, 'giu');
export function tidy(text) {
  let s = slang(text);
  if (!s) return s;
  s = s.replace(TONE_TAG, ' ')
    .replace(/\*[^*\n]{1,40}\*/g, ' ') // *giggles*
    .replace(/^\s*(?:capri|ela|she)\s*:\s*/i, '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
  // quotes round the whole line, or one left hanging at an end
  for (let i = 0; i < 2; i++) {
    const m = /^["“”«'](.*)["“”»']$/s.exec(s);
    if (m) s = m[1].trim();
  }
  const count = (re) => (s.match(re) || []).length;
  if (count(/["“”]/g) % 2) s = s.replace(/^["“”]\s*|\s*["“”]$/g, '').trim();
  return s.replace(/\s+([,.!?…])/g, '$1');
}

// her slang as a small model mangles it: "choom" (Night City for friend) comes out "chloe"
export function slang(text) {
  return String(text ?? '').replace(/(?<![\p{L}])chlo[eé](?![\p{L}])/giu, (m) => (m[0] === 'C' ? 'Choom' : 'choom'));
}
// what she kept (her diary, her chat), with that fixed
export function scrub(text) {
  return slang(text);
}

export function inLang(text, lang) {
  if (SLIPS[lang]?.test(String(text))) return false;
  if (!WORDS[lang] || lang === 'en') return true;
  if (lang === 'ru') return /[а-яё]/i.test(text) || !WORDS.en.test(text);
  const en = (String(text).match(WORDS.en) || []).length;
  const own = (String(text).match(WORDS[lang]) || []).length;
  // more English than her language, or English and nothing of hers at all
  return !((en >= 2 && en > own) || (en >= 1 && own === 0));
}

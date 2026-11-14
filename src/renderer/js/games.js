// Games in her chat: hangman ("forca"), guess my number, and a quiz her local AI writes. While one is
// on, what you type goes to it (a letter, a word, a number, A/B/C/D); say something else and the
// game ends quietly. Hangman and the number are hers alone (no AI): instant, and they work offline.

import { fmt, pick, inLang } from './util.js';

const WORDS = {
  pt: ['neon', 'cromo', 'implante', 'satelite', 'netrunner', 'biochip', 'mercenario', 'cidade', 'chuva', 'holograma', 'teclado', 'pixel',
    'estrela', 'galaxia', 'abacaxi', 'brigadeiro', 'cachoeira', 'violao', 'girassol', 'tempestade', 'pipoca', 'travesseiro', 'janela', 'codigo'],
  en: ['neon', 'chrome', 'implant', 'satellite', 'netrunner', 'biochip', 'mercenary', 'city', 'rain', 'hologram', 'keyboard', 'pixel',
    'star', 'galaxy', 'pineapple', 'waterfall', 'guitar', 'sunflower', 'storm', 'popcorn', 'pillow', 'window', 'code'],
};
const MISSES = 6;
const plain = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').trim();

export const GAME_ASK = [
  ['hangman', /\bforca\b|hangman/i],
  ['number', /adivinh[ae]\w*\s+(?:o\s+|um\s+)?n[úu]mero|pens[ae]\s+(?:em\s+|num\s+)?(?:um\s+)?n[úu]mero|guess\s+(?:the\s+|a\s+|my\s+)?number/i],
  ['quiz', /\bquiz\b|trivia|me\s+faz\s+uma\s+pergunta\s+de\s+conhecimento|pergunta\s+de\s+conhecimentos?\s+gerais/i],
];

export class Games {
  constructor({ brain, host, chat }) {
    Object.assign(this, { brain, host, chat });
    this.game = null;
  }

  get t() {
    return this.brain.t.games;
  }

  get on() {
    return Boolean(this.game);
  }

  // a new game: her first line
  async start(kind) {
    const t = this.t;
    if (kind === 'hangman') {
      const word = pick(WORDS[this.brain.lang] || WORDS.en);
      this.game = { kind, word, guessed: new Set(), misses: 0 };
      return fmt(t.hangmanStart, { board: this.board(), n: word.length });
    }
    if (kind === 'number') {
      this.game = { kind, n: 1 + Math.floor(Math.random() * 100), tries: 0 };
      return t.numberStart;
    }
    if (kind === 'quiz') {
      const q = await this.question();
      if (!q) return t.quizFailed;
      this.game = { kind, ...q, score: this.game?.kind === 'quiz' ? this.game.score : 0, asked: (this.game?.asked || 0) + 1 };
      return `${q.question}\n${q.options.map((o, i) => `${'ABCD'[i]}) ${o}`).join('\n')}`;
    }
    return null;
  }

  // your message while a game is on: her line, or null (not a move: the game ends, the chat goes on)
  async turn(text) {
    const g = this.game;
    const t = this.t;
    const said = plain(text);
    if (!g) return null;
    if (/^(para|parar|chega|sair|desisto|stop|quit|i give up)$/.test(said)) {
      this.game = null;
      return g.kind === 'hangman' ? fmt(t.hangmanGiveUp, { word: g.word }) : g.kind === 'number' ? fmt(t.numberGiveUp, { n: g.n }) : t.quizBye;
    }
    if (g.kind === 'hangman') {
      if (!/^[a-zçãõáéíóúâêô]+$/i.test(said)) return this.drop();
      const guess = plain(said);
      if (guess.length > 1) {
        if (guess === g.word) { this.game = null; return fmt(t.hangmanWin, { word: g.word }); }
        g.misses++;
      } else if (g.guessed.has(guess)) return fmt(t.hangmanAgain, { letter: guess, board: this.board() });
      else {
        g.guessed.add(guess);
        if (!g.word.includes(guess)) g.misses++;
      }
      if (g.misses >= MISSES) { this.game = null; return fmt(t.hangmanLose, { word: g.word }); }
      if ([...g.word].every((c) => g.guessed.has(c))) { this.game = null; return fmt(t.hangmanWin, { word: g.word }); }
      return fmt(g.word.includes(guess) || guess === g.word ? t.hangmanHit : t.hangmanMiss, { board: this.board(), left: MISSES - g.misses });
    }
    if (g.kind === 'number') {
      const n = Number(said.replace(/[^\d]/g, ''));
      if (!said.match(/^\D{0,12}\d{1,3}\D{0,12}$/) || !n) return this.drop();
      g.tries++;
      if (n === g.n) { this.game = null; return fmt(g.tries <= 7 ? t.numberWin : t.numberWinSlow, { n, tries: g.tries }); }
      const far = Math.abs(n - g.n) > 25;
      return fmt(n < g.n ? (far ? t.numberHigherFar : t.numberHigher) : (far ? t.numberLowerFar : t.numberLower), { n });
    }
    if (g.kind === 'quiz') {
      const m = /^(?:letra\s+|a\s+)?([abcd])\)?$/i.exec(said) || /^([abcd])\b/i.exec(said);
      const idx = m ? 'abcd'.indexOf(m[1].toLowerCase()) : g.options.findIndex((o) => plain(o) === said);
      if (idx < 0) return this.drop();
      const right = idx === g.answer;
      if (right) g.score++;
      const line = fmt(right ? t.quizRight : t.quizWrong, { answer: `${'ABCD'[g.answer]}) ${g.options[g.answer]}`, score: g.score, asked: g.asked });
      if (g.asked >= 5) { this.game = null; return `${line}\n${fmt(t.quizEnd, { score: g.score })}`; }
      const next = await this.start('quiz');
      return `${line}\n\n${next}`;
    }
    return null;
  }

  drop() {
    this.game = null;
    return null;
  }

  board() {
    const g = this.game;
    return [...g.word].map((c) => (g.guessed.has(c) ? c.toUpperCase() : '_')).join(' ');
  }

  // a question from her local AI: { question, options[4], answer (0-3) }
  async question() {
    const topic = pick(['geography', 'science', 'movies and series', 'video games', 'music', 'history', 'animals', 'food', 'technology', 'space', 'Cyberpunk and sci-fi', 'sports']);
    const prompt = [
      `Write one multiple-choice trivia question about ${topic}, easy to medium, with exactly four options and one right answer.`,
      'Answer ONLY with JSON, nothing else: {"question": "...", "options": ["...", "...", "...", "..."], "answer": <index 0-3 of the right option>}',
      this.chat.languageNote().split('\n')[0],
    ].join('\n');
    for (let i = 0; i < 2; i++) {
      const res = await this.host.localSay({ persona: 'You write trivia questions. You answer with JSON only.', prompt, maxTokens: 220, temperature: 0.9 }).catch(() => null);
      const m = res?.ok && /\{[\s\S]*\}/.exec(res.text);
      if (!m) continue;
      try {
        const q = JSON.parse(m[0]);
        if (typeof q.question === 'string' && Array.isArray(q.options) && q.options.length === 4 && Number.isInteger(q.answer) && q.answer >= 0 && q.answer < 4
          && inLang(q.question, this.brain.lang)) {
          return { question: q.question.trim(), options: q.options.map((o) => String(o).trim()), answer: q.answer };
        }
      } catch { /* once more */ }
    }
    return null;
  }
}

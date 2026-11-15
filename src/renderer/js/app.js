import { Capri } from './capri.js';
import { FxLayer, GRAB_FRAMES } from './fx.js';
import { Chip, Mask } from './chip.js';
import { Panel } from './panel.js';
import { Voice } from './voice.js';
import { Brain } from './brain.js';
import { Guide } from './guide.js';
import { Mission } from './mission.js';
import { Chat } from './chat.js';
import { Setup } from './setup.js';
import { Custom } from './custom.js';
import { Bond, Jealousy } from './bond.js';
import { Reminders, clock } from './reminders.js';
import { Look } from './look.js';
import { Activity } from './activity.js';
import { Speech } from './speech.js';
import { Play } from './play.js';
import { Hands } from './hands.js';
import { Guard } from './guard.js';
import { Daily } from './daily.js';
import { Heart } from './heart.js';
import { Emotions } from './emotions.js';
import { Progress } from './progress.js';
import { Mic } from './mic.js';
import { Senses } from './senses.js';
import { Life } from './life.js';
import { Camera } from './camera.js';
import { Hearing } from './hearing.js';
import { FaceId } from './faceid.js';
import { Presence } from './presence.js';
import { Art } from './art.js';
import { LockWatch } from './lockwatch.js';
import { Converse } from './converse.js';
import { Gestures } from './gestures.js';
import { Watch } from './watch.js';
import { Games } from './games.js';
import { Memory } from './memory.js';
import { Light } from './light.js';
import { Shell } from './shell.js';
import { Pc } from './pc.js';
import { Care } from './care.js';
import { Breaks } from './breaks.js';
import { linesFor } from './lines.js';
import { pick, fmt, reducedMotion } from './util.js';

const host = window.host;

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// close-ups of her for the cut-ins, frames of the show (tools/build-cutins.py)
const CUTINS = ['grin', 'laugh', 'eyes', 'many', 'look'];
const WATCH_MS = 2000; // how often she checks the pointer still reaches her
const FOLLOW_AFTER = 2; // checks in a row with the pointer on another screen before she follows it there
const AWAY_MS = 15 * 60 * 1000; // the pointer still this long: you were away from your PC
const SNOOZE_MS = 10 * 60 * 1000;

// what you made her, from the config (custom.js)
const mine = (cfg) => ({ userName: cfg.userName || '', persona: cfg.persona || '', myLines: cfg.myLines || [], memories: cfg.memories || [] });

async function boot() {
  const [config, image, intro, ...cutins] = await Promise.all([
    host.getConfig(),
    loadImage('../../assets/capri/capri-full.png'),
    // her intro: her close-up grabbing the screen, and its drawings with her mouth and arm moving
    Promise.all(GRAB_FRAMES.map((name) => loadImage(`../../assets/capri/intro-${name}.webp`).catch(() => null)))
      // decoded now, not the first time each one shows up (a hitch right on "hi", on the wave)
      .then((cels) => Promise.all(cels.map((cel) => cel && createImageBitmap(cel))))
      .then((cels) => (cels[0] ? Object.fromEntries(GRAB_FRAMES.map((name, i) => [name, cels[i]])) : null)),
    ...CUTINS.map((name) => loadImage(`../../assets/capri/cutin-${name}.png`)),
    document.fonts.load('600 16px "Chakra Petch"'),
    document.fonts.load('400 11px "JetBrains Mono"'),
  ]);
  document.documentElement.lang = config.lang;
  // her animations: like Windows, full or reduced (her menu)
  const applyMotion = (setting) => {
    reducedMotion.setting = setting || 'auto';
    document.documentElement.dataset.motion = reducedMotion.matches ? 'reduced' : 'full';
  };
  applyMotion(config.motion);
  reducedMotion.onSystemChange(() => applyMotion(reducedMotion.setting));
  // her windows: Night City, or her first ones (her menu, classic.css)
  const applyTheme = (theme) => {
    document.documentElement.dataset.theme = theme || 'nightcity';
  };
  applyTheme(config.theme);
  // her panels' size (her menu › Looks › Panel size): small, medium, large
  const applyPanelSize = (size) => {
    document.documentElement.dataset.panel = ['small', 'large'].includes(size) ? size : 'medium';
  };
  applyPanelSize(config.panelSize);

  const fx = new FxLayer(document.getElementById('fx'), {
    cutins: Object.fromEntries(CUTINS.map((name, i) => [name, cutins[i]])),
    intro,
  });
  fx.resize(innerWidth, innerHeight);
  // how far the top of the taskbar is from the bottom of her window: she covers it too while she
  // rests on it (the floor she stands on stays its top)
  let floorGap = config.floorGap ?? 0;
  const chip = new Chip(document.getElementById('chip'));
  chip.place(innerWidth, innerHeight - floorGap);
  const mask = new Mask(document.getElementById('mask'));

  const voice = new Voice();
  voice.configure(config);
  host.listSounds().then((list) => list.length && voice.loadCustom(list));

  const panel = new Panel({
    panel: document.getElementById('panel'),
    ticker: document.getElementById('ticker'),
    labels: linesFor(config.lang, config.assistant),
  });

  const capri = new Capri({
    root: document.getElementById('capri'),
    canvas: document.getElementById('sprite'),
    image,
    fx,
    voice,
  });
  capri.wander = config.wander;
  capri.possessWindows = config.possess;
  capri.restOn = config.rest || 'corner';
  capri.setView(innerWidth, innerHeight, innerHeight - floorGap);
  capri.setScale(config.scale);

  const mission = new Mission();
  const brain = new Brain({ capri, panel, voice, host, mission, lang: config.lang, assistant: config.assistant });
  brain.host = host;

  // Click-through everywhere except on her body, the panel and her biochip.
  let interactive = false;
  let mouse = null;
  const setInteractive = (on) => {
    if (on === interactive) return;
    interactive = on;
    host.setInteractive(on);
  };
  const onChip = () => Boolean(chip.visible && mouse && chip.contains(mouse.x, mouse.y, 0));
  const refreshHit = () => {
    if (capri.dragging) return setInteractive(true);
    if (!mouse) return setInteractive(false);
    const r = panel.rect();
    const onPanel = r && mouse.x >= r.left && mouse.x <= r.right && mouse.y >= r.top && mouse.y <= r.bottom;
    document.body.style.cursor = onChip() ? 'pointer' : '';
    return setInteractive(Boolean(onPanel || capri.hit(mouse.x, mouse.y) || onChip()));
  };
  // Her biochip: her eyes on it follow the pointer over it, and she comes out when you click it
  // (only then, so the pointer passing through that corner doesn't call her back).
  // Her mask, asleep: the pointer coming over it stirs her, and a moment of that wakes her up.
  let wakeTimer = 0;
  const comeOut = () => {
    if (capri.stowed) host.setConfig({ visible: true }); // the tray and Ctrl+Alt+C follow
    capri.unstow();
  };
  const hoverChip = () => {
    chip.pointer = chip.visible && mouse && chip.contains(mouse.x, mouse.y) ? mouse : null;
    const near = mask.visible && mouse && mask.contains(mouse.x, mouse.y, 30);
    mask.pointer = near ? mouse : null;
    if (!near) {
      clearTimeout(wakeTimer);
      wakeTimer = 0;
    } else if (!wakeTimer) {
      wakeTimer = setTimeout(() => {
        wakeTimer = 0;
        if (capri.dormant) capri.wake();
      }, 400);
    }
  };
  let lastMove = performance.now();
  let onBack = null; // (away ms) => you're back at your PC after a while (the bond, below)
  window.addEventListener('mousemove', (e) => {
    const now = performance.now();
    if (now - lastMove > AWAY_MS) onBack?.(now - lastMove);
    lastMove = now;
    mouse = { x: e.clientX, y: e.clientY };
    refreshHit();
    hoverChip();
  });
  document.addEventListener('mouseleave', () => {
    mouse = null;
    refreshHit();
    hoverChip();
  });
  // Where the pointer really is, every couple of seconds: if it moved over her window and no
  // mousemove came, the hook that brings it to her is gone (Windows drops it without a word, after
  // sleep say), and main.js puts in a new one.
  let seen = null;
  let rearmedAt = -Infinity;
  let follow = null; // (pointer) => she may follow it to another screen (below)
  setInterval(async () => {
    const at = await host.cursor().catch(() => null);
    const before = seen;
    seen = at;
    follow?.(at);
    if (!at?.inside) return;
    const now = performance.now();
    // the pointer is on her and she isn't clickable (its moves stopped reaching her): she is now
    if (!interactive && now - lastMove > WATCH_MS) {
      mouse = { x: at.x, y: at.y };
      refreshHit();
    }
    if (!before?.inside || (at.x === before.x && at.y === before.y)) return;
    if (now - lastMove < WATCH_MS * 1.5 || now - rearmedAt < 20000) return;
    rearmedAt = now;
    host.rearm();
  }, WATCH_MS);
  window.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (chip.visible && chip.contains(e.clientX, e.clientY, 0)) host.openMenu();
  });
  window.addEventListener('click', (e) => {
    if (chip.visible && chip.contains(e.clientX, e.clientY, 0)) comeOut();
  });

  // wiring
  capri.onMove = (head) => {
    // pointing at something: the panel goes on her other side, so it doesn't cover it
    panel.setAnchor({ ...head, lean: capri.pointing ? -capri.pointing.dir : 0 }, capri.view);
    // she may have moved out from under a still pointer: never leave a dead click zone behind
    refreshHit();
  };
  capri.onTeleport = (phase) => (phase === 'start' ? panel.suspend() : panel.resume());
  // her watchdog freed her (capri.js): written down, to find what left her stuck
  capri.onStuck = (by) => host.debugLog?.(`stuck busy, freed: ${by} | stance ${capri.stance} mode ${capri.mode}`);
  capri.chipAt = () => chip.center();
  capri.onStow = () => {
    chip.setMode(capri.mode);
    chip.show();
  };
  capri.onUnstow = () => chip.hide();
  capri.onDoze = (phase, face) => {
    if (phase === 'start') {
      mask.place(face.x, face.y, capri.scale * 1.1);
      mask.show();
    } else if (phase === 'waking') {
      mask.wake();
    } else {
      mask.hide();
    }
  };
  capri.onMode = (mode, prev) => chip.setMode(mode, prev);
  // now and then she says something about the satellite: while she looks at it, or once
  // the red light has gone up (never during, nothing should cover that)
  capri.onGaze = (when) => {
    const lines = when === 'end' ? brain.t.uplink : brain.t.gaze;
    if (!panel.visible && Math.random() < (when === 'end' ? 0.6 : 0.4)) panel.say({ kind: 'info', line: pick(lines), hold: 3800 });
  };
  panel.onChar = (kind, how) => voice.play('blip', { mood: kind, ...how });
  panel.onTalk = (talking) => talking && capri.perform('talk');
  capri.onMenu = () => host.openMenu();

  // Her guide (guide.js): her welcome on first launch, and "How does it work?" in her menu,
  // where she takes you to things and points at them.
  const guide = new Guide({ capri, panel, voice, host, brain });
  // Talking to her (chat.js): "Talk to her" in her menu, or the button when you click her idle.
  const chat = new Chat({ capri, panel, voice, host, brain });
  brain.chat = chat; // her persona and her language, for what she says about Claude's work
  brain.onTalk = () => chat.start();
  // Getting her chat going with buttons (setup.js): Ollama and a model, a key, or an address
  const setup = new Setup({ guide, panel, host, brain, capri, voice });
  guide.setup = setup;
  guide.onTalk = () => chat.start();
  chat.onSetup = (status) => setup.chat(status);
  chat.onBetterModel = () => setup.better();
  // taking care of your PC from her chat (care.js): what slows it, room, startup, updates, sound,
  // devices, windows, setups, game mode, the internet
  chat.care = new Care({ chat, host, panel, brain, capri });
  // her hands: Claude Code doing tasks, every step by your leave (hands.js)
  chat.hands = new Hands({ capri, panel, brain, host, chat, guide, voice });
  setup.onReady = () => chat.start();
  // What she calls you, how she is, your lines, what she remembers (custom.js)
  const custom = new Custom({ guide, host, brain, capri, voice });
  guide.custom = custom;
  brain.custom = mine(config);

  // How close she is to you (bond.js), her jealousy of your other AIs, the reminders she keeps.
  const bond = new Bond({ host, data: config.bond });
  brain.bond = bond;
  chat.bond = bond;
  capri.fondness = bond.stage;
  const jealousy = new Jealousy({ capri, panel, brain, bond, chat, guide, host });
  jealousy.enabled = config.jealous !== false;
  jealousy.closePages = config.closePages === true;
  chat.jealousy = jealousy;
  brain.onRival = (key) => jealousy.onRivalEvent(key);
  const reminders = new Reminders({ host, list: config.reminders || [] });
  chat.reminders = reminders;
  chat.onMessage = (text) => {
    bond.add('chat', 2);
    play?.attention();
    heart?.nudge('chat');
    if (text) emotions?.heard(text);
  };
  // her voice, by her local AI (speech.js): a stock of fresh lines for every moment
  const speech = new Speech({ brain, host, chat });
  speech.enabled = config.aiLines !== false;
  brain.speech = speech;
  setTimeout(() => speech.prime(), 45000); // once she's settled in
  // looking at your screen (look.js): when you ask, or now and then if you turned it on
  const look = new Look({ capri, panel, brain, chat, guide, host, fx, voice, active: () => performance.now() - lastMove });
  look.configure(config);
  chat.look = look; // "regarde mon écran" in her chat
  // (her heart, below, makes her look more when she's bored)
  // commenting on what you do (activity.js): the app in front and its title, if you turned it on
  const activity = new Activity({ capri, panel, brain, chat, guide, host, look, active: () => performance.now() - lastMove });
  activity.configure(config);
  // your terminal (shell.js): failed commands, long ones, git push, tests
  const shell = new Shell({ capri, panel, brain, voice, chat, guide });
  shell.hands = chat.hands;
  // your PC as she feels it (pc.js): the processor, the battery, the network, a USB stick, a game
  const pc = new Pc({ capri, panel, brain, host, voice, chat, guide });
  pc.enabled = config.pcReact !== false;
  // a game: her AI lets go of the graphics card (the game wants all of it), she says nothing new
  pc.onGame = (name, on, ms) => {
    speech.paused = on;
    host.localPause(on);
    activity.onGame(name, on, ms);
    if (!on) progress?.gameOver(name, ms);
  };
  let wantsOut = config.visible !== false; // not put away in your settings (Ctrl+Alt+C, her menu)
  pc.wantsOut = () => wantsOut;

  // Clicking her: what's going on, or she offers to talk. Sulking, she turns her back on you.
  // About to close one of your other AIs' pages, she leaves it.
  capri.onClick = () => {
    if (play.onClick()) return; // one poke too many: she answers that instead
    if (jealousy.spare()) return;
    if (panel.visible) panel.hide();
    else if (!jealousy.onClick()) {
      brain.status();
      bond.add('click', 1);
    }
  };

  // Thrown around (capri.js throwHer): she says how it was. The first time she's shaken (or she
  // loves it, once she's attached to you); twice in a row she's dizzy and fed up; three times in
  // two minutes she zaps your pointer and won't let you pick her up for a bit.
  const throws = [];
  capri.onThrown = ({ how, hard = 0 }) => {
    const t = brain.t.thrown;
    if (how === 'leap') {
      if (Math.random() < 0.4) panel.say({ kind: 'info', face: 'smug', line: brain.line('screens.hello'), hold: 3000 });
      return;
    }
    const now = performance.now();
    throws.push(now);
    while (throws.length && now - throws[0] > 120000) throws.shift();
    // how she says it, and how she feels about it after (her chat knows: bond.js)
    let line, face = 'smug', feel = null;
    if (throws.length >= 3) {
      throws.length = 0;
      line = brain.line('thrown.angry');
      face = 'many';
      feel = 'angry';
      capri.refuseUntil = now + 25000;
      bond.lose(1);
      if (mouse) capri.zap(mouse.x, mouse.y);
    } else if (how === 'ledge') line = brain.line('thrown.ledge');
    else if (how === 'feet') line = brain.line('thrown.feet');
    else if (throws.length === 2) {
      line = brain.line('thrown.again');
      face = 'aside';
      feel = 'dizzy';
    } else if (hard > 0.75 && Math.random() < 0.5) {
      line = brain.line('thrown.screen');
      face = 'laugh';
      feel = 'thrown';
    } else if (bond.stage >= 3) {
      line = brain.line('thrown.fun');
      face = 'laugh';
      feel = 'fun';
    } else {
      line = brain.line('thrown.ow');
      face = 'wide';
      feel = 'thrown';
    }
    if (feel && bond.feeling !== 'angry') bond.feel(feel);
    panel.say({ kind: 'info', face, line, hold: 3800 });
  };
  // you said sorry in her chat: she lets it go (and lets you pick her up again)
  bond.onCalm = () => {
    jealousy.forgive();
    capri.refuseUntil = 0;
  };
  capri.onDodge = () => panel.say({ kind: 'info', face: 'smug', line: brain.line('thrown.dodge'), hold: 2500 });

  // Petted (your pointer back and forth over her mane): she purrs, says something now and then
  // (shy before she's attached to you), and it brings you a little closer. Too long and she's had
  // enough: a zap at your pointer.
  let petTalk = 0;
  capri.onPet = (phase) => {
    const t = brain.t.pet;
    const quiet = !chat.open && (!panel.visible || ['idle', 'info'].includes(panel.current?.kind));
    if (phase === 'start') {
      bond.add('pet', 1);
      if (!['angry', 'sulk'].includes(bond.feeling)) bond.feel('petted');
      const now = performance.now();
      if (quiet && now - petTalk > 90000) {
        petTalk = now;
        const attached = bond.stage >= 2;
        panel.say({ kind: 'info', face: attached ? 'smug' : 'wide', line: brain.line(attached ? 'pet.high' : 'pet.low'), hold: 3000 });
      }
    } else if (phase === 'enough') {
      if (quiet) panel.say({ kind: 'info', face: 'many', line: brain.line('pet.enough'), hold: 3000 });
      if (!mouse || !capri.zap(mouse.x, mouse.y)) capri.perform('huff', capri.towardCenter());
    }
  };

  // A new stage with you: her minds come out to look at you, and she says so, the sync bar under it.
  // At a quiet moment, so it isn't missed.
  let newStage = 0;
  bond.onStage = (stage) => {
    newStage = stage;
    capri.fondness = stage;
  };
  const quiet = () => !capri.busy && !capri.act && !capri.dragging && !capri.stowed && !capri.dormant && !capri.hidden
    && capri.mode !== 'alert' && !chat.open && !guide.running && !panel.visible && ['stand', 'sit'].includes(capri.stance);
  // two hours at your PC without a real break: she tells you to get up (breaks.js)
  const breaks = new Breaks({ host, panel, brain, capri, pc, quiet });
  breaks.enabled = config.breaks !== false;
  setInterval(async () => {
    if (!newStage || !quiet()) return;
    const stage = newStage;
    newStage = 0;
    const up = brain.t.bond.up[stage];
    if (!['angry', 'sulk'].includes(bond.feeling)) bond.feel('happy', { percent: bond.percent });
    voice.play('star');
    await capri.perform('split');
    capri.perform('hop');
    panel.say({
      kind: 'done', badge: `${brain.t.state.info} ${bond.percent}%`, face: stage >= 3 ? 'laugh' : 'look',
      line: fmt(up.line, { percent: bond.percent }), quote: up.quote, progress: bond.percent / 100, hold: 9000,
    });
  }, 3000);
  // time spent together: a little sync for every ten minutes you're at your PC with her out
  setInterval(() => {
    if (performance.now() - lastMove < 10 * 60 * 1000 && !capri.stowed) bond.add('time', 1);
  }, 10 * 60 * 1000);
  // back at your PC after a while: once she's attached to you, she's glad to see you
  onBack = () => {
    if (bond.stage < 2 || capri.stowed) return;
    capri.wake();
    setTimeout(() => {
      if (!quiet()) return;
      capri.perform('hop');
      panel.say({ kind: 'idle', face: 'look', line: brain.line('bond.back'), hold: 3500 });
    }, 700);
  };

  // A reminder due: she comes and finds you (on whichever screen you're on), and holds it up until
  // you say it's done or ask for ten more minutes. One that came due while she was off, she brings
  // up when she's back. Talking with her, it comes in the chat.
  const startedAt = Date.now();
  const remind = async (r) => {
    const t = brain.t.remind;
    const time = clock(r.at, brain.lang);
    const missed = r.at < startedAt - 60000;
    const line = missed
      ? fmt(r.text ? t.missed : t.missedBare, { text: r.text, time })
      : fmt(pick(r.text ? t.now : t.nowBare), { text: r.text });
    let answered = false;
    const onAction = (id) => {
      answered = true;
      if (id === 'snooze') {
        reminders.snooze(r.id, SNOOZE_MS);
        panel.setActions([]);
        if (chat.open) chat.interject(t.snoozed, [], null);
        else panel.say({ kind: 'info', face: 'smug', line: t.snoozed, hold: 2500 });
        return;
      }
      reminders.remove(r.id);
      bond.add('remind', 2);
      panel.setActions([]);
      if (chat.open) chat.interject(brain.line('remind.doneLine'), [], null);
      else panel.say({ kind: 'info', face: 'smug', line: brain.line('remind.doneLine'), hold: 2500 });
    };
    const actions = [{ id: 'done', label: t.done, primary: true }, { id: 'snooze', label: t.snooze }];
    voice.play('remind');
    for (let i = 0; chat.open && chat.turn && i < 60; i++) await wait(500); // her answer first
    if (chat.open && chat.interject(line, actions, onAction)) {
      // read in the chat: closed (or talked over) without a button, it counts as seen
      while (!answered && chat.open) await wait(1000);
      if (!answered) reminders.remove(r.id);
      return;
    }
    if (capri.stowed) {
      host.setConfig({ visible: true });
      await capri.unstow();
    }
    capri.wake();
    await until(() => !capri.busy && !capri.dragging, 8000);
    await capri.toPointer(await host.cursor().catch(() => null));
    capri.perform('hop');
    const shownAt = performance.now();
    const shown = panel.say({
      kind: 'remind', face: 'look', line, quote: missed ? '' : fmt(t.asked, { time }), actions, onAction, hold: null,
      // closed without an answer: seen, if it was up long enough to read; else back in a couple of minutes
      onLeave: () => {
        if (answered) return;
        if (performance.now() - shownAt > 2500) reminders.remove(r.id);
        else reminders.snooze(r.id, 2 * 60 * 1000);
      },
    });
    if (!shown) reminders.snooze(r.id, 60 * 1000); // something more important on: in a minute
  };
  reminders.onDue = (r) => remind(r).catch((err) => {
    console.error('[capri] reminder', err);
    reminders.snooze(r.id, 60 * 1000);
  });
  // the first Claude Code event that ever reaches her: so you know it worked
  brain.linked = config.linked;
  brain.watching = config.claude !== false;
  brain.onLinked = () => {
    host.setConfig({ linked: true, welcomed: true });
    voice.play('hello');
    capri.perform('hop');
    panel.say({ kind: 'done', badge: 'LINK', line: brain.t.welcome.linked, hold: 6000 });
  };

  // The demo's second half, after its fake Claude session: everything she does on her own, one
  // after the other, a line before each.
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (done, max = 15000) => {
    for (const t0 = Date.now(); !done() && Date.now() - t0 < max;) await wait(100);
  };
  const free = () => !capri.busy && !capri.act && capri.stance !== 'fall';
  brain.onShowcase = async () => {
    const t = brain.t.showcase;
    const caption = (line) => panel.say({ kind: 'info', line, hold: 2200 });
    capri.nextMove = capri.nextGaze = performance.now() + 120000; // nothing of her own in between
    if (capri.stowed) await capri.unstow();
    if (capri.dormant) capri.wake();
    await until(free);
    panel.hide();

    caption(t.minds);
    await wait(1000);
    await capri.perform('split');
    await wait(900);

    caption(t.zap);
    await wait(1000);
    const h = capri.head();
    capri.zap(h.x + capri.towardCenter() * 280, h.y - 170);
    await wait(1800);

    panel.hide();
    if (capri.gaze({ big: true })) await until(() => !capri.sky);
    await wait(2500);

    // a little terminal opens for her to take over, and closes under her once she's done with it
    if (capri.possessWindows && (await host.demoWindow(true))) {
      const top = () => capri.windows.wins.find((w) => capri.canSit(w)); // it opens on top of everything
      await until(top, 4000);
      const win = top();
      const seat = win && { win, dx: win.w * 0.4 };
      if (seat) {
        panel.hide();
        await capri.sitOn(seat);
        await until(free);
        caption(t.possess);
        await wait(1400);
        panel.hide();
        await capri.possess();
        await wait(1800);
      }
      host.demoWindow(false);
      await wait(400);
      await until(free); // she may have fallen off it
      await wait(900);
    }

    caption(t.sleep);
    await wait(1400);
    panel.hide();
    capri.setMode('sleep');
    await wait(2500); // dozing off
    await capri.doze();
    await wait(4500);
    capri.wake();
    await until(free);
    await wait(1200);

    caption(t.chip);
    await wait(1600);
    panel.hide();
    await capri.stow();
    await wait(3500);
    await capri.unstow();
    await wait(600);
    panel.say({ kind: 'info', line: t.end, hold: 5000 });
  };


  // A call (the microphone or the camera in use: Teams, Meet, Zoom, WhatsApp, Discord…): she goes
  // into her biochip and makes no sound, and comes back out once it's over (if she's the one who left).
  let callQuiet = config.callQuiet !== false;
  let inCall = null;
  function onCall(call) {
    if (call && !inCall && callQuiet) {
      inCall = { put: false, at: Date.now(), app: call.cam || call.mic };
      voice.muted = true;
      if (!capri.stowed) {
        inCall.put = true;
        panel.hide();
        chat.open && chat.close?.();
        capri.stow();
      }
      activity.onCall(inCall.app, true);
      camera?.pause(true);
      hearing?.pause(true);
      host.wakePause?.(true);
    } else if (!call && inCall) {
      const was = inCall;
      inCall = null;
      host.getConfig().then((cfg) => voice.configure(cfg)); // her sound as you set it
      activity.onCall(was.app, false, Date.now() - was.at);
      camera?.pause(false);
      hearing?.pause(false);
      host.wakePause?.(false);
      if (was.put && capri.stowed && wantsOut) capri.unstow();
    }
  }

  // what she does with your pointer, her moods in her body, her mischief (play.js)
  const play = new Play({ capri, panel, brain, voice, host, bond, chat, guide, busyLife: () => Boolean(pc.game) || Boolean(inCall) });
  play.level = config.pranks || 'light';
  play.lastMove = () => lastMove;
  capri.onPointer = (x, y) => play.onPointer(x, y);
  // her eye on your PC's safety (guard.js)
  const guard = new Guard({ capri, panel, brain, host, guide, look, care: chat.care });
  guard.configure(config);
  chat.care.guard = guard;
  // her day with you: good morning, focus, the weather, songs, screenshots, the dates that count (daily.js)
  const daily = new Daily({ capri, panel, brain, host, chat, activity, look, bond, reminders, voice });
  daily.configure(config);
  chat.care.daily = daily;

  // ---- her heart, her emotions, what you build together, her ears: everything feeds them ----
  const heart = new Heart({ bond });
  chat.heart = heart;
  voice.heart = heart;
  play.heart = heart;
  activity.heart = heart;
  look.heart = heart;
  heart.ignored = () => Date.now() - play.attentionAt > 20 * 60000 && performance.now() - lastMove < 90000;
  let heartSent = '';
  const sendHeart = () => {
    const label = heart.label(brain.t);
    if (label !== heartSent) host.heartLabel?.((heartSent = label));
  };
  heart.onChange(sendHeart);
  sendHeart();
  const emotions = new Emotions({ capri, panel, brain, voice, bond, heart, look });
  activity.emotions = emotions;
  const progress = new Progress({ capri, panel, brain, host, chat, guide, look, bond, heart, emotions, activity });
  progress.configure(config);
  chat.care.progress = progress;
  const mic = new Mic({ capri, panel, brain, host, chat, guide, voice });
  mic.configure(config);
  daily.heart = heart;
  chat.care.play = play;
  // her minigame's record, and its achievement
  play.best = () => progress.cfg.reflexBest || null;
  play.onScore = (ms, record) => {
    if (!record) return;
    progress.cfg.reflexBest = Math.round(ms);
    host.setConfig({ reflexBest: Math.round(ms) });
    progress.check();
  };
  // her senses (your keyboard and mouse, the screen) and her life of her own (senses.js, life.js)
  const senses = new Senses({ capri, panel, brain, voice, heart, bond, play, guide, host });
  senses.configure(config);
  const life = new Life({ capri, panel, brain, voice, fx, heart, play, activity });
  life.guide = guide;
  // her eyes on you, through your camera (camera.js)
  const camera = new Camera({ capri, panel, brain, host, chat, guide, voice, heart, bond, look });
  camera.configure(config);
  chat.care.camera = camera;
  // who's at your PC (faceid.js): you, someone you introduced, or a stranger
  const face = new FaceId({ capri, panel, brain, host, chat, guide, camera, voice, activity, look });
  face.configure(config);
  chat.care.face = face;
  // whether you're there (presence.js): away, she leaves your screen alone and lives her own life
  // (art.js: her drawings), asleep the camera rests too
  const art = new Art({ host });
  life.art = art;
  const presence = new Presence({ capri, panel, brain, host, camera, look, play, shell, life, heart, voice, chat, guide, art, face, hands: chat.hands });
  heart.away = () => presence.away; // her longing grows while you're away (heart.js)
  // her energy, a battery: sleeping refills it, being awake and moving drains it (heart.js)
  heart.sleeping = () => (capri.dormant ? 2 : capri.mode === 'sleep' ? 1 : 0);
  capri.sleepAfter = () => heart.sleepAfter();
  capri.onExert = (cost) => heart.exert(cost);
  capri.onAsleep = () => heart.asleep();
  // tired: Claude's process isn't hers to follow, only its answers (brain.js)
  brain.tiredQuiet = () => ['tired', 'exhausted', 'drained'].includes(heart.energyLevel);
  capri.onWoke = () => {
    // what Claude finished while she slept
    const later = (brain.later || []).splice(0);
    if (later.length) {
      setTimeout(() => {
        const e = brain.t.energy?.whileAsleep || 'Claude finished:';
        const said = later.map((l) => `${l.project ? `${l.project}: ` : ''}“${String(l.text || '…').replace(/\s+/g, ' ').slice(0, 160)}”`).join('\n');
        panel.say({ kind: 'done', face: 'look', line: `${e}\n${said}`, hold: 12000 });
      }, 2500);
    }
    const { cranky } = heart.woken();
    if (!cranky) return;
    const lines = brain.t.energy?.woken?.[cranky];
    setTimeout(() => {
      if (!lines || chat.open) return;
      capri.perform(cranky >= 2 ? 'huff' : 'stretch', capri.towardCenter());
      panel.say({ kind: 'info', face: cranky >= 2 ? 'aside' : 'look', line: pick(lines), hold: 4500 });
    }, 1200);
  };
  if (!chat.heart) chat.heart = heart;
  if (!daily.heart) daily.heart = heart;
  brain.presence = presence;
  chat.hands.presence = presence;
  // the PC locked: who comes to it, a sound and a notification, and what she saw once it's unlocked
  const lockWatch = new LockWatch({ capri, panel, brain, host, camera, face, presence, voice });
  lockWatch.configure(config);
  // talking with her (converse.js): her questions listened for, and conversations she starts
  const converse = new Converse({ capri, panel, brain, host, chat, guide, voice, life, presence, mic });
  Object.assign(converse, { daily, camera, heart });
  converse.configure(config);
  // watching something in full screen together (watch.js)
  const watch = new Watch({ capri, panel, brain, look, play, life, voice });
  watch.host = host;
  converse.watch = watch;
  const sayShown = panel.say.bind(panel);
  panel.say = (msg) => {
    if (msg && !watch.allows(msg)) return false; // nothing over the film but what matters
    const shown = sayShown(msg);
    if (shown !== false) converse.saw(msg);
    return shown;
  };
  chat.onAnswered = (answer) => converse.onAnswer(answer);
  // your GitHub (main github.js): a CI run failed (Claude can look into it), a review, a mention
  // something of hers on screen you may be answering (a question, buttons, her chat): what can wait, waits
  const whenFree = (fn, tries = 20) => {
    if (guide.running || panel.current?.actions?.length || panel.current?.guide || chat.open) {
      if (tries > 0) setTimeout(() => whenFree(fn, tries - 1), 30000);
      return;
    }
    fn();
  };
  host.onGithub?.((news) => whenFree(() => github(news)));
  const github = (news) => {
    let list = news;
    const g = brain.t.github;
    const hands = chat.hands;
    // several CI runs failed at once: one word about them, the first one offered to Claude
    const ciFailed = list.filter((n) => n.reason === 'ci_activity' && /fail|falh|cancel/i.test(n.title));
    if (ciFailed.length > 1) {
      const repos = [...new Set(ciFailed.map((n) => n.repo.split('/').pop()))].join(', ');
      list = [{ ...ciFailed[0], title: fmt(g.ciMany, { count: ciFailed.length, repos }) }, ...list.filter((n) => !ciFailed.includes(n))];
    }
    list.forEach((n, i) => setTimeout(() => {
      const failed = n.reason === 'ci_activity' && /fail|falh|cancel/i.test(n.title);
      if (n.reason === 'ci_activity' && !failed) return; // a run that went fine: nothing to say
      const key = failed ? 'ciFailed' : { review_requested: 'review', mention: 'mention', team_mention: 'mention', assign: 'assign', security_alert: 'security' }[n.reason] || 'mention';
      const line = fmt(g[key], { repo: n.repo, title: n.title });
      if (presence.note(line)) return; // away: when you're back
      const project = hands.projects.find((p) => p.name.toLowerCase() === String(n.repo).split('/').pop().toLowerCase());
      capri.wake();
      capri.perform(failed ? 'alarm' : 'curious', capri.towardCenter());
      if (failed && project && !hands.running) {
        panel.say({
          kind: 'alert', face: 'wide', line, hold: 20000, tag: 'GITHUB',
          actions: [{ id: 'fix', label: g.fix, primary: true }, { id: 'no', label: g.later }],
          onAction: (id) => {
            panel.hide();
            if (id === 'fix') hands.start(`The GitHub CI run for ${n.repo} failed ("${n.title}"). Use gh (gh run list, gh run view --log-failed) to find out why, fix it in this project, and run the relevant tests locally to check. Don't push.`, '', { project: project.dir });
          },
        });
      } else panel.say({ kind: 'info', face: 'look', line, hold: 8000, tag: 'GITHUB' });
    }, i * 9000));
  };
  // Claude Code talking to you through her (main onMcp, hooks/capri-mcp.js)
  host.onMcpSay?.(({ text, mood, project }) => {
    const line = text;
    if (presence.note(fmt(brain.t.mcp.away, { text: line, project: project || 'Claude' }))) return; // away: when you're back
    capri.wake();
    capri.perform(mood === 'done' ? 'hop' : mood === 'alert' ? 'alarm' : 'curious', capri.towardCenter());
    if (mood === 'alert') voice.play('alert');
    panel.say({ kind: mood === 'done' ? 'done' : mood === 'alert' ? 'alert' : 'info', face: mood === 'alert' ? 'wide' : 'look', tag: project ? `CLAUDE.${project.toUpperCase()}` : 'CLAUDE', line, hold: Math.min(16000, 5000 + line.length * 60) });
  });
  let mcpTickerTimer = null;
  host.onMcpProgress?.(({ text, project }) => {
    clearTimeout(mcpTickerTimer);
    if (!text) return panel.setTicker(null);
    panel.setTicker({ verb: project ? project.toUpperCase().slice(0, 10) : 'CLAUDE', target: text });
    mcpTickerTimer = setTimeout(() => panel.setTicker(null), 10 * 60000);
    return undefined;
  });
  const mcpPending = new Map(); // id -> close it (answered elsewhere, or timed out)
  host.onMcpAsk?.(({ id, question, options, project }) => {
    const m = brain.t.mcp;
    capri.wake();
    voice.play('alert');
    let done = false;
    const answer = (a) => { if (done) return; done = true; mcpPending.delete(id); host.mcpAnswer(id, a); };
    guide.scene(async () => {
      capri.perform('alarm', capri.towardCenter());
      const tag = project ? `CLAUDE.${project.toUpperCase()}` : 'CLAUDE';
      mcpPending.set(id, () => { done = true; guide.answer(null); });
      if (options.length) {
        const picked = await guide.ask({ face: 'wide', badge: m.badge, line: fmt(m.asks, { project: project || 'Claude' }), quote: question, actions: options.map((o, i) => ({ id: String(i), label: o, primary: i === 0 })) });
        if (picked != null && picked !== 'gone') answer(options[Number(picked)]);
      } else {
        const r = await guide.askText({ face: 'wide', line: fmt(m.asks, { project: project || 'Claude' }), quote: question, placeholder: m.placeholder, send: m.send, tag });
        if (r?.text) answer(r.text);
      }
    });
  });
  host.onMcpGone?.(({ id }) => mcpPending.get(id)?.());
  // your Windows notifications (main notices.js, her menu): held during focus, kept while you're away,
  // the urgent ones called out; "o que chegou?" in her chat
  const notices = { held: [], recent: [] };
  chat.notices = notices;
  host.onNotices?.((list) => {
    const n = brain.t.notices;
    const me = (brain.custom?.userName || '').toLowerCase();
    notices.recent = [...notices.recent, ...list].filter((x) => Date.now() - x.at < 6 * 3600000).slice(-80);
    if (daily.focus) { notices.held.push(...list); return; }
    if (presence.away) {
      for (const x of list) presence.note(fmt(n.away, { app: x.app, title: x.title }));
      return;
    }
    const urgent = list.find((x) => /urgent|urgência|emergên|socorro|liga pra mim|me liga|atende/i.test(`${x.title} ${x.body}`) || (me && `${x.title} ${x.body}`.toLowerCase().includes(me)));
    if (!urgent) return; // Windows already shows them: she only speaks up for what looks urgent
    capri.wake();
    capri.perform('alarm', capri.towardCenter());
    panel.say({ kind: 'alert', face: 'wide', line: fmt(n.urgent, { app: urgent.app, title: urgent.title }), quote: urgent.body.slice(0, 140), hold: 9000 });
  });
  // focus over: what came meanwhile, in a word
  setInterval(() => {
    if (daily.focus || !notices.held.length) return;
    const n = brain.t.notices;
    const by = {};
    for (const x of notices.held) (by[x.app] ||= new Set()).add(x.title);
    const parts = Object.entries(by).map(([app, who]) => fmt(n.part, { count: [...who].length, app, who: [...who].slice(0, 3).join(', ') }));
    panel.say({ kind: 'info', face: 'look', line: fmt(n.duringFocus, { count: notices.held.length, list: parts.join('; ') }), hold: 12000 });
    notices.held = [];
  }, 20000);
  // a streamer you follow went live (main lives.js)
  host.onLive?.(({ name, site, url, title }) => whenFree(() => {
    const l = brain.t.lives;
    const line = fmt(l.live, { name, site: site === 'youtube' ? 'YouTube' : 'Twitch' });
    if (presence.note(line)) return;
    capri.wake();
    capri.perform('hop', capri.towardCenter());
    panel.say({ kind: 'info', face: 'laugh', line, quote: title ? title.slice(0, 120) : '', hold: 15000, actions: [{ id: 'watch', label: l.watch, primary: true }, { id: 'no', label: l.later }],
      onAction: (id) => { panel.hide(); if (id === 'watch') host.openSite(url); } });
  }));
  // a new version of her (main updatesStart): she asks, then updates herself
  host.onUpdate?.(({ version }) => whenFree(() => guide.scene(async () => {
    const u = brain.t.update;
    capri.perform('curious', capri.towardCenter());
    const yes = (await guide.ask({ face: 'look', line: fmt(u.ask, { version }), actions: [{ id: 'yes', label: u.yes, primary: true }, { id: 'no', label: u.later }] })) === 'yes';
    if (!yes) return;
    panel.say({ kind: 'work', face: 'smug', line: u.downloading, hold: 8000 });
    host.updateNow();
  })));
  host.onUpdateProgress?.(({ percent }) => panel.setTicker({ verb: 'UPDATE', target: `${percent}%` }));
  host.onUpdateError?.(({ error }) => { panel.setTicker(null); panel.say({ kind: 'info', face: 'aside', line: fmt(brain.t.update.failed, { error }), hold: 6000 }); });
  // her offline voice: download progress, and ready
  host.onVoiceProgress?.(({ done, size }) => panel.setTicker({ verb: 'WHISPER', target: `${Math.round((done / size) * 100)}% · ${Math.round(done / 1e6)} MB` }));
  host.onVoiceReady?.((info) => panel.say({ kind: info.ok ? 'done' : 'error', face: info.ok ? 'laugh' : 'aside', line: info.ok ? brain.t.voice.ready : fmt(brain.t.voice.failed, { error: info.error || '…' }), hold: 6000 }));
  // your Spotify (main spotify.js): what's playing and your top artists, into her memory
  host.onSpotifyNow?.((n) => memory.song(n));
  host.onSpotifyTop?.((list) => list.forEach((a, i) => memory.observe('music', a.name, a.name, { weight: Math.max(1, 20 - i), source: 'spotify' })));
  host.onSpotifyConnected?.(() => { capri.wake(); capri.perform('hop', capri.towardCenter()); panel.say({ kind: 'done', face: 'laugh', line: brain.t.spotify.connected, hold: 6000 }); });
  host.onSpotifyDisconnectAsk?.(() => guide.scene(async () => {
    const s = brain.t.spotify;
    if ((await guide.ask({ face: 'look', line: s.disconnectAsk, actions: [{ id: 'yes', label: s.disconnect, primary: true }, { id: 'no', label: s.keep }] })) === 'yes') host.spotifyDisconnect();
  }));
  // your PS5 (main psn.js): a game started or ended, your games' play time, the connection expired
  host.onPsn?.(({ type, game, minutes, list }) => {
    const p = brain.t.psn;
    if (type === 'expired') return panel.say({ kind: 'info', face: 'aside', line: p.expired, hold: 8000 });
    if (type === 'trophies') {
      // a platinum is a party; others, a word (the best one)
      const best = list[0];
      const plat = best.kind === 'platinum';
      heart.nudge(plat ? 'platinum' : 'trophy');
      memory.observe('games', best.name, best.name, { weight: plat ? 120 : 10, source: 'ps5' });
      const line = fmt(pick(plat ? p.platinum : p.trophy), { game: best.name, kind: p.kinds[best.kind], progress: best.progress });
      if (presence.note(line)) return undefined;
      if (plat) capri.celebrate?.({ onSpeak: () => panel.say({ kind: 'done', badge: '🏆', face: 'laugh', line, hold: 9000 }) });
      else { capri.wake(); capri.perform('hop', capri.towardCenter()); panel.say({ kind: 'info', face: 'smug', line, hold: 6000 }); }
      return undefined;
    }
    if (type === 'start') {
      memory.observe('games', game, game, { weight: 1, source: 'ps5' });
      if (presence.note(fmt(p.startedAway, { game }))) return undefined;
      capri.wake();
      capri.perform('curious', capri.towardCenter());
      return panel.say({ kind: 'info', face: 'smug', line: fmt(pick(p.started), { game }), hold: 5000 });
    }
    if (type === 'stop' && minutes >= 10) {
      const line = fmt(pick(p.stopped), { game, minutes: minutes >= 90 ? `${Math.round(minutes / 6) / 10} h` : `${minutes} min` });
      if (!presence.note(line)) panel.say({ kind: 'idle', face: 'look', line, hold: 7000 });
    }
    return undefined;
  });
  host.onPsnGames?.((list) => { for (const g of list) memory.game(g.name, g.minutes); });
  host.onPsnDisconnectAsk?.(() => guide.scene(async () => {
    const p = brain.t.psn;
    if ((await guide.ask({ face: 'look', line: p.disconnectAsk, actions: [{ id: 'yes', label: p.disconnect, primary: true }, { id: 'no', label: p.keep }] })) === 'yes') host.psnDisconnect();
  }));
  // her browser extension: a site you tried in focus mode (she teases), or opened anyway
  host.onTabsEvent?.(({ type, site }) => {
    const b = brain.t.tabs;
    capri.wake();
    capri.perform(type === 'blocked' ? 'glare' : 'huff', capri.towardCenter());
    panel.say({ kind: 'info', face: type === 'blocked' ? 'smug' : 'aside', line: fmt(pick(type === 'blocked' ? b.blocked : b.letThrough), { site: site.replace(/^https?:\/\/(www\.)?/, '').split('/')[0] }), hold: 4000 });
  });
  // your sites of yesterday (her extension), into her memory: once a day
  const sitesDay = async () => {
    const day = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    if (config.sitesDay === day) return;
    const r = await host.tabsDo?.({ action: 'sites', query: day }).catch(() => null);
    if (!r?.ok) return;
    config.sitesDay = day;
    host.setConfig({ sitesDay: day });
    const work = /github|gitlab|stackoverflow|localhost|127\.0\.0\.1|docs\.|developer\.|learn\.microsoft|npmjs|claude\.ai|anthropic|openai|chatgpt|google\.com$|mail\.|outlook|teams|notion|figma|atlassian|jira|vercel|cloudflare/i;
    for (const [site, secs] of Object.entries(r.sites || {})) if (secs >= 15 * 60 && !work.test(site)) memory.observe('freeTime', site, site, { weight: Math.round(secs / 60) });
  };
  setTimeout(() => sitesDay().catch(() => {}), 3 * 60000);
  setInterval(() => sitesDay().catch(() => {}), 60 * 60000);
  // her games and plays, right now: from her menu (Play) or her chat ("faz uma travessura")
  const playNow = async (what) => {
    if (chat.open) { panel.hide(); chat.close(); await new Promise((r) => setTimeout(r, 600)); }
    capri.wake();
    if (capri.stance === 'peek') await capri.unpeek?.();
    const words = { hangman: 'vamos jogar forca', number: 'adivinha o número', quiz: 'quiz' };
    if (words[what]) { // in her chat
      await chat.start();
      setTimeout(() => chat.open && chat.send(words[what]), 500);
      return;
    }
    if (what === 'rps' || what === 'portrait') {
      const r = await chat.bodyGame(what);
      if (r?.line) panel.say({ kind: 'info', face: r.face || 'smug', line: r.line, hold: 4000 });
      return;
    }
    if (what === 'draw') { life.drewAt = 0; return life.draw(); }
    if (what === 'dance') { daily.danceAt = 0; return daily.dance(); }
    if (what === 'prank') {
      play.prankAt = 0;
      const did = await play.prank({ provoked: false });
      if (!did) play.graffiti(); // something always happens when you ask
      return undefined;
    }
    if (what === 'graffiti') return play.graffiti();
    if (what === 'hide') return play.hideAndSeek();
    if (what === 'tag') return play.tag();
    if (what === 'reflex') return play.reflex();
    if (what === 'sneak') { play.mouse = play.mouse || capri.mouse; return life.sneak(); }
    if (what === 'juggle') return life.juggle();
    if (what === 'workout') return life.workout();
    return undefined;
  };
  chat.onPlayNow = playNow;
  // a reminder tied to an app you just brought up (main.js)
  host.onCtxRemind?.(({ app, text }) => {
    capri.wake();
    capri.perform('alarm', capri.towardCenter());
    voice.play('remind');
    panel.say({ kind: 'remind', face: 'wide', line: fmt(brain.t.arrange.ctxFire, { app, text }), hold: 12000 });
  });
  // your hands and your head (gestures.js), through the camera
  const gestures = new Gestures({ capri, panel, brain, host, heart, voice, life, daily, chat, presence });
  gestures.configure(config);
  camera.gestures = gestures;
  if (camera.Vision) gestures.load(camera.files, camera.Vision);
  Object.assign(chat, { gestures, art, camera, activity, presence, converse, mic, games: new Games({ brain, host, chat }) });
  // what she knows about you (memory.js): from what she sees, and from your chats when they end
  const memory = new Memory({ brain, host, chat });
  memory.configure(config);
  Object.assign(chat, { memory });
  Object.assign(converse, { memory });
  activity.memory = memory;
  daily.memory = memory;
  chat.onClosed = () => {
    converse.onClose();
    const session = chat.history.slice(chat.sessionFrom ?? chat.history.length);
    if (!chat.visitor) setTimeout(() => memory.fromChat(session).catch(() => {}), 2000);
  };
  // her ears on the room (hearing.js)
  const hearing = new Hearing({ capri, panel, brain, voice, heart, emotions, daily, guide, host });
  hearing.configure(config);
  hearing.watch = watch; // a film on: its sounds aren't the room's (watch.js)
  // once a day at most: something she learned about you lately, checked with you ("did I get it right?")
  setInterval(() => {
    const day = new Date().toDateString();
    if (config.checkDay === day || presence.state !== 'here' || light.on || daily.focus || !look.free() || chat.open || guide.running) return;
    const item = memory.toCheck();
    if (!item) return;
    config.checkDay = day;
    host.setConfig({ checkDay: day });
    const m = brain.t.memoryCheck;
    const what = { games: fmt(m.games, { x: item.label }), music: fmt(m.music, { x: item.label }), freeTime: fmt(m.freeTime, { x: item.label }) }[item.kind] || item.label;
    guide.scene(async () => {
      capri.perform('curious', capri.towardCenter());
      const v = await guide.ask({ face: 'look', line: fmt(pick(m.ask), { what }), actions: [{ id: 'right', label: m.right, primary: true }, { id: 'wrong', label: m.wrong }, { id: 'soso', label: m.soso }] });
      if (!v) return;
      memory.checked(item.id, v);
      panel.say({ kind: 'info', face: v === 'wrong' ? 'aside' : 'laugh', line: m[`after_${v}`], hold: 3500 });
    });
  }, 10 * 60000);
  // light mode (light.js): in games by default, and whatever else you picked in her menu
  const light = new Light({ capri, panel, brain, host, camera, gestures, hearing, speech, look, converse, life, face, hands: chat.hands });
  light.configure(config);
  // while she looks at your screen (her local model busy on the graphics card): her camera, hands
  // and ears pause, as in light mode, then back to how they were
  look.onLooking = (on) => {
    for (const m of [camera, gestures, face, hearing]) m.looking = on;
    camera.setRate?.(on ? 2500 : (light.on ? 2000 : camera.presenceRate ?? null));
  };
  // her name: she perks up and listens to what you say next (mic.js)
  hearing.onWake = () => {
    if (mic.rec || mic.asking || chat.turn || guide.running) return;
    capri.wake();
    capri.perform('curious', capri.towardCenter());
    voice.play('tick');
    mic.toggle({ asked: true }); // "Hear the room" + "Answer when I call her" on: that was your yes
  };
  // two claps: she comes and listens, like when she hears her name
  hearing.onClap = () => hearing.onWake?.();
  capri.onPointer = (x, y) => {
    play.onPointer(x, y);
    senses.onPointer(x, y);
    life.onPointer(x, y);
  };
  capri.onDouble = () => play.onDouble();
  capri.onHug = () => play.onHug();
  // OBS open: she behaves (no pranks, nothing said about what's on your screen) or puts on a show
  const obsMode = (cfg) => {
    play.obsMode = cfg.obsMode || 'behave';
    activity.obsBehave = play.obsMode !== 'show';
  };
  obsMode(config);
  host.onObs?.((on) => {
    daily.obs = on && play.obsMode !== 'show';
    play.obs = on;
    activity.obs = on;
  });
  // what's in here, for --dev scripts (debug route `eval`)
  window.dev = { capri, brain, panel, chat, guide, fx, voice, bond, jealousy, reminders, look, activity, shell, play, speech, guard, daily, heart, emotions, progress, mic, senses, life, camera, hearing, face, presence, art, lockWatch, converse, gestures, watch, memory, light, hands: chat.hands, pc, setup, breaks, screens: () => screens };
  // what she feels (bond.js), into her heart too
  const feelHeart = { thrown: 'thrown', fun: 'thrownFun', dizzy: 'thrown', angry: 'thrown', jealous: 'jealous', sulk: 'jealous', petted: 'pet', forgiven: 'sorry', shooed: 'shoo', poked: 'poke', pranked: 'prank' };
  const feel = bond.feel.bind(bond);
  bond.feel = (kind, vars) => {
    feel(kind, vars);
    if (feelHeart[kind]) heart.nudge(feelHeart[kind]);
  };
  // your wins: her mood, her pride, your achievements
  const won = (kind, nudge) => {
    heart.nudge(nudge);
    emotions.win(kind);
    progress.check();
  };
  daily.onWin = (kind) => won(kind, kind === 'focus' ? 'focusDone' : 'todoDone');
  daily.onStorm = () => emotions.fear('storm');
  chat.shellWin = null;
  chat.hands.onDone = (ok) => {
    if (ok) {
      progress.count('tasks');
      won('task', 'taskDone');
    } else heart.nudge('taskFail');
  };
  guard.onThreat = () => emotions.fear('threat');
  activity.onDiary = (day) => {
    memory.day(day?.apps);
    progress.learn(day);
  };
  progress.memory = memory;
  pc.onFeel = (kind) => {
    if (kind === 'critical') emotions.fear('battery');
    else heart.nudge(kind);
  };
  const petCount = capri.onPet;
  capri.onPet = (phase) => {
    if (phase === 'start') progress.count('pets');
    return petCount?.(phase);
  };
  capri.keepAwayUntil = () => play.keepAway;

  // a file dropped on her (open) chat: hers to look at
  document.addEventListener('dragover', (e) => e.preventDefault());
  document.addEventListener('drop', async (e) => {
    e.preventDefault();
    const file = e.dataTransfer?.files?.[0];
    const where = file && host.pathOf(file);
    const info = where ? await host.handFile(where).catch(() => null) : null;
    if (info) chat.attach(info);
  });

  host.onClaudeEvent((evt) => {
    brain.handle(evt);
    if (evt.demo) return;
    if (evt.hook_event_name === 'Stop') heart.nudge('claudeDone');
    else if (evt.hook_event_name === 'PostToolUseFailure') heart.nudge('claudeError');
  });
  host.onShellEvent((evt) => shell.handle(evt));
  shell.onFail = () => heart.nudge('fail');
  shell.onWin = (kind) => {
    if (kind === 'tests') won('tests', 'testsPass');
    else if (kind === 'push') heart.nudge('push');
  };
  host.onWindows((data) => {
    capri.setWindows(data);
    brain.onWindows(data);
    jealousy.onWindows(data);
    pc.onWindows(data);
    activity.onWindows(data);
    onCall(data.call);
    senses?.onWindows(data);
    watch?.onWindows(data);
  });
  // the windows as they are now: the watcher only speaks again when something changes
  host.windowsNow().then((data) => data && capri.setWindows(data));

  // her window resized, or moved to another screen (whose pixels may be another size)
  let dpr = window.devicePixelRatio;
  const applySize = ({ width, height, gap = 0 }) => {
    floorGap = gap;
    fx.resize(width, height);
    chip.place(width, height - gap);
    capri.setView(width, height, height - gap);
    if (window.devicePixelRatio !== dpr) {
      dpr = window.devicePixelRatio;
      capri.setScale(capri.scale); // her drawing redone at the new screen's pixels
    }
  };
  host.onResize(applySize);

  // Your screens. She goes from one to the other through their shared edge (thrown, or jumping
  // over to follow you), else in her column of light. `screens`: { current, origin (her window's
  // corner), list: [{ id, x, y, w, h }] }, all in the desktop's coordinates.
  let screens = await host.screens().catch(() => null);
  const refreshScreens = async () => {
    screens = await host.screens().catch(() => screens);
  };
  // the screen right past one side of hers (-1 left, 1 right), at height y of her window, if any
  const beyond = (side, y) => {
    const here = screens?.list.find((d) => d.id === screens.current);
    if (!here) return null;
    const gy = screens.origin.y + y;
    return screens.list.find((d) => d.id !== here.id && gy >= d.y && gy < d.y + d.h
      && (side > 0 ? Math.abs(d.x - (here.x + here.w)) <= 2 : Math.abs(d.x + d.w - here.x) <= 2)) || null;
  };
  const moveTo = async (id) => {
    const res = await host.moveScreen(id);
    if (!res) return null;
    screens = { ...screens, current: id, origin: res.origin };
    applySize(res);
    return res;
  };
  capri.canCross = (side, y) => Boolean(beyond(side, y));
  capri.onCross = async (side, at) => {
    const there = beyond(side, at.y);
    if (!there) return null;
    const gy = screens.origin.y + at.y;
    const res = await moveTo(there.id);
    return res && { y: gy - res.origin.y };
  };
  capri.onScreenOf = (cursor) => capri.jumpScreen(async () => {
    await moveTo(cursor.display);
    return host.cursor();
  }, { toPointer: true });
  // to screen `id`: jumping over the shared edge if there's one at her height, else teleporting
  const goToScreen = async (id) => {
    if (!screens || id === screens.current) return;
    const mid = capri.screenPoint(118, 232);
    const side = [-1, 1].find((s) => beyond(s, Math.max(120, mid.y - 140))?.id === id);
    if (side && (await capri.leapTo(side))) return;
    await capri.jumpScreen(async () => {
      await moveTo(id);
      return host.cursor();
    });
  };
  // The pointer on another of your screens for a few seconds: she follows you there, when she's
  // free to (not in the middle of something, not asleep, not put away).
  let followOn = config.follow !== false;
  let awayChecks = 0;
  follow = (at) => {
    const elsewhere = followOn && screens && screens.list.length > 1 && at && !at.inside && at.display != null && at.display !== screens.current;
    awayChecks = elsewhere ? awayChecks + 1 : 0;
    if (awayChecks < FOLLOW_AFTER) return;
    if (capri.busy || capri.dragging || capri.stowed || capri.dormant || capri.hidden || capri.act || capri.pointing) return;
    if (!['stand', 'sit'].includes(capri.stance) || capri.mode === 'sleep' || capri.mode === 'alert' || chat.open || guide.running) return;
    awayChecks = 0;
    goToScreen(at.display);
  };
  window.addEventListener('resize', () => {
    fx.resize(innerWidth, innerHeight);
    chip.place(innerWidth, innerHeight - floorGap);
    capri.setView(innerWidth, innerHeight, innerHeight - floorGap);
  });

  host.onConfig((cfg) => {
    voice.configure(cfg);
    jealousy.enabled = cfg.jealous !== false;
    jealousy.closePages = cfg.closePages === true;
    followOn = cfg.follow !== false;
    look.configure(cfg);
    activity.configure(cfg);
    speech.enabled = cfg.aiLines !== false;
    callQuiet = cfg.callQuiet !== false;
    play.level = cfg.pranks || 'light';
    guard.configure(cfg);
    daily.configure(cfg);
    progress.configure(cfg);
    mic.configure(cfg);
    obsMode(cfg);
    senses.configure(cfg);
    camera.configure(cfg);
    hearing.configure(cfg);
    face.configure(cfg);
    lockWatch.configure(cfg);
    converse.configure(cfg);
    gestures.configure(cfg);
    memory.configure(cfg);
    light.configure(cfg);
    if (inCall) voice.muted = true; // her sound stays off until the call is over
    pc.enabled = cfg.pcReact !== false;
    breaks.enabled = cfg.breaks !== false;
    wantsOut = cfg.visible !== false;
    reminders.sync(cfg.reminders); // one may have been cancelled from her menu
    capri.wander = cfg.wander;
    capri.possessWindows = cfg.possess;
    capri.restOn = cfg.rest || 'corner';
    applyMotion(cfg.motion);
    applyTheme(cfg.theme);
    applyPanelSize(cfg.panelSize);
    if ((cfg.claude === false && brain.watching) || cfg.assistant !== brain.assistant) {
      guide.answer(null);
      panel.hide();
      capri.stopPointing();
      brain.replyFor = null;
      brain.linked = cfg.linked;
      // no longer watching Claude Code: whatever it was in the middle of is no business of hers
      brain.sessions.clear();
      panel.setTicker(null);
      if (capri.mode === 'work' || capri.mode === 'alert') capri.setMode('idle');
    }
    brain.watching = cfg.claude !== false;
    brain.custom = mine(cfg);
    brain.assistant = cfg.assistant;
    panel.labels = linesFor(cfg.lang, cfg.assistant);
    if (cfg.scale !== capri.scale) capri.setScale(cfg.scale);
    if (cfg.lang !== brain.lang) {
      brain.lang = cfg.lang;
      panel.labels = linesFor(cfg.lang, cfg.assistant);
      document.documentElement.lang = cfg.lang;
    }
  });

  host.onCommand(async (cmd) => {
    // a Gemini key, for her camera only (guided)
    if (cmd.name === 'geminiKey') {
      const g = brain.t.gemini;
      guide.scene(async () => {
        capri.perform('curious', capri.towardCenter());
        const r = await guide.askText({
          face: 'look', line: g.ask, quote: g.how, secret: true, placeholder: g.placeholder, send: g.save,
          actions: [{ id: 'page', label: g.page }], onAction: () => { host.openSite('https://aistudio.google.com/apikey'); return true; },
        });
        if (!r?.text) return;
        const done = await host.visionKey(r.text).catch(() => ({ ok: false }));
        panel.say({ kind: done.ok ? 'done' : 'info', face: done.ok ? 'laugh' : 'aside', line: done.ok ? fmt(g.ok, { model: done.model || 'Gemini' }) : done.error === 'format' ? g.badFormat : g.rejected, hold: 7000 });
      });
      return;
    }
    // her offline voice: download the model (with progress in her ticker), or turn it off
    if (cmd.name === 'voiceLocal') {
      const v = brain.t.voice;
      if (!cmd.on) { await host.voiceLocal(false); panel.say({ kind: 'info', face: 'look', line: v.off, hold: 4000 }); return; }
      panel.say({ kind: 'work', face: 'look', line: v.downloading, hold: 6000 });
      const r = await host.voiceLocal(true).catch((err) => ({ ok: false, error: err.message }));
      panel.setTicker(null);
      panel.say({ kind: r.ok ? 'info' : 'error', face: r.ok ? 'look' : 'aside', line: r.ok ? v.loading : fmt(v.failed, { error: r.error || '…' }), hold: 7000 });
      return;
    }
    // your Spotify: your app's Client ID, then your login in the browser
    if (cmd.name === 'spotifySetup') {
      const s = brain.t.spotify;
      guide.scene(async () => {
        capri.perform('curious', capri.towardCenter());
        const r = await guide.askText({
          face: 'look', line: s.ask, quote: s.how, placeholder: s.placeholder, send: s.connect,
          actions: [{ id: 'dash', label: s.dashboard }],
          onAction: () => { host.openSite('https://developer.spotify.com/dashboard'); return true; },
        });
        if (!r?.text) return;
        const done = await host.spotifyLogin(r.text).catch(() => ({ ok: false }));
        panel.say({ kind: 'info', face: done.ok ? 'look' : 'aside', line: done.ok ? s.browser : s.badFormat, hold: 7000 });
      });
      return;
    }
    // your PS5: the NPSSO, pasted in her panel (guided)
    if (cmd.name === 'psnSetup') {
      const p = brain.t.psn;
      guide.scene(async () => {
        capri.perform('curious', capri.towardCenter());
        for (let tries = 0; tries < 3; tries++) {
          const r = await guide.askText({
            face: 'look', line: p.ask, quote: p.how, secret: true, placeholder: p.placeholder, send: p.connect,
            actions: [{ id: 'login', label: p.login }, { id: 'code', label: p.code }],
            onAction: (id) => { host.openSite(id === 'login' ? 'https://www.playstation.com/' : 'https://ca.account.sony.com/api/v1/ssocookie'); return true; },
          });
          if (!r?.text) return;
          const done = await host.psnConnect(r.text).catch(() => ({ ok: false }));
          if (done.ok) {
            panel.say({ kind: 'done', face: 'laugh', line: p.connected, hold: 6000 });
            return;
          }
          panel.say({ kind: 'info', face: 'aside', line: done.error === 'format' ? p.badFormat : p.failed, hold: 4000 });
          await new Promise((res) => setTimeout(res, 2500));
        }
      });
      return;
    }
    // her games and plays, on demand (her menu › Play, or asked in her chat)
    if (cmd.name === 'playNow') {
      playNow(cmd.what);
      return;
    }
    // her browser extension got new files: one click in the browser to load them
    if (cmd.name === 'tabsUpdated') {
      panel.say({ kind: 'info', face: 'look', line: brain.t.tabs.updated, hold: 9000 });
      return;
    }
    // her browser extension, copied out for you to load: how
    if (cmd.name === 'tabsGuide') {
      const b = brain.t.tabs;
      guide.scene(async () => {
        capri.perform('point', capri.towardCenter());
        await guide.ask({ face: 'look', line: b.guide, quote: fmt(b.guideSteps, { dir: cmd.dir || cmd.payload?.dir || '' }), actions: [{ id: 'ok', label: b.ok, primary: true }] });
      });
      return;
    }
    const t = brain.t;
    switch (cmd.name) {
      case 'teleport':
        capri.teleport(capri.spot('random'));
        break;
      case 'status':
        brain.status();
        break;
      case 'customize': // "Make her yours" in her menu
        custom.open();
        break;
      case 'setupChat': // "Set it up with her" in her menu's AI model
        setup.chat();
        break;
      case 'setupKey': // "API key or address" in her menu's AI model, or a service picked there that needs one
        setup.key();
        break;
      case 'setupFree': // --dev: Claude Code (or Codex) through Ollama
        setup.free();
        break;
      case 'setupStep': // --dev: one step of her setup on its own (pickModel, pull, pickKeyed, address…)
        guide.scene(() => setup[cmd.step]?.(...(cmd.args || [])));
        break;
      case 'look': // "Look at my screen" in her menu: once, now
        look.once();
        break;
      case 'watchScreen': // "Look at my screen now and then" in her menu
        look.setAuto(cmd.on);
        break;
      case 'shellHook': // her menu: plugged into (or out of) your PowerShell
        capri.wake();
        if (cmd.on) capri.perform('hop', capri.towardCenter());
        panel.say({ kind: 'info', face: cmd.on ? 'grin' : 'aside', line: cmd.on ? t.shell.hooked : t.shell.unhooked, hold: 5000 });
        break;
      case 'file': { // Send to › Capri: a file for her
        const info = await host.handFile(cmd.path).catch(() => null);
        if (info) chat.attach(info);
        break;
      }
      case 'listen': // Ctrl+Alt+V: she listens
        mic.toggle();
        break;
      case 'wake': // her name, heard (src/wake)
        hearing.heardWord('capri');
        break;
      case 'faceEnroll': // her menu: Learn my face
        face.enroll();
        break;
      case 'faceForget': // her menu: Forget the faces
        face.forget();
        break;
      case 'earOn': // her menu: Camera and sounds › Hear the room
        hearing.setOn(cmd.on);
        break;
      case 'cameraOn': // her menu: Camera › Use my camera
        camera.setOn(cmd.on);
        break;
      case 'senseInput': // her menu: Feel my keyboard and mouse
        senses.setOn(cmd.on);
        break;
      case 'translate': // Ctrl+Alt+T: what you copied, translated
        daily.translate();
        break;
      case 'watchActivity': // "Comment on what I do" in her menu
        activity.setAuto(cmd.on);
        break;
      case 'goScreen': // a screen picked in her menu: she goes there
        goToScreen(cmd.id);
        break;
      case 'screens': // a screen plugged in, unplugged or moved
        refreshScreens();
        break;
      case 'remindIn': // --dev: a reminder `ms` from now
        reminders.add(Date.now() + (cmd.ms ?? 3000), cmd.text ?? '');
        break;
      case 'bond': // --dev: sync points from a source (as if earned)
        bond.add(cmd.source || 'chat', cmd.n || 1);
        break;
      case 'rearmed': // a new mouse hook (main.js): click-through until the pointer comes over her again
        mouse = null;
        refreshHit();
        break;
      case 'rearm': // --dev: as if she'd noticed the pointer no longer reaches her
        host.rearm();
        break;
      case 'loseGl': { // --dev: as if the GPU had been reset (waking from sleep): she goes, then comes back
        const lose = capri.sprite.gl.getExtension('WEBGL_lose_context');
        lose?.loseContext();
        setTimeout(() => lose?.restoreContext(), cmd.ms ?? 1500);
        break;
      }
      case 'answer': { // --dev: as if that button of her panel had been clicked (her chat's too)
        const button = document.querySelector(`.panel__action[data-id="${CSS.escape(cmd.id)}"]`);
        if (button) button.click();
        else guide.answer(cmd.id);
        break;
      }
      case 'assistantChanged': // Claude Code, Codex or Antigravity, picked in her menu
        guide.welcome();
        break;
      case 'welcome': // "How does it work?" in her menu
        guide.menu();
        break;
      case 'forget': // "Forget our conversations" in her menu, maybe with her chat open
        chat.history = [];
        break;
      case 'chat': // "Talk to her" in her menu
        chat.start();
        break;
      case 'report': // "Mission report" in her menu
        if (capri.stowed) {
          host.setConfig({ visible: true });
          await capri.unstow();
        }
        capri.wake();
        if (brain.report()) capri.perform('curious', capri.towardCenter());
        break;
      case 'fakeClaude': { // --dev: the topmost window (the test window) is where a prompt was typed, and you're elsewhere
        const win = capri.windows.wins[0];
        if (win) {
          brain.sessions.set('dev', { id: 'dev', project: 'dev', taskStart: Date.now(), count: 0, files: new Set(), log: [], working: true, waiting: false, window: win.id, seen: Date.now() });
          capri.windows = { ...capri.windows, fg: -1 };
        }
        break;
      }
      case 'guide': // --dev: one topic of her guide (welcome, menu, connect, icon, claude, folder)
        if (cmd.topic === 'welcome') guide.welcome();
        else if (cmd.topic === 'menu') guide.menu();
        else if (typeof guide[cmd.topic] === 'function') guide.scene(() => guide[cmd.topic]());
        break;
      case 'stow': // Ctrl+Alt+C: into her biochip, or back out
        if (cmd.on) capri.stow();
        else capri.unstow();
        break;
      case 'satellite': // the whole sequence, on demand (tray)
        if (capri.stowed) {
          host.setConfig({ visible: true });
          await capri.unstow();
        }
        capri.wake();
        if (capri.stance === 'peek') await capri.unpeek();
        if (!capri.gaze({ big: true })) setTimeout(() => capri.gaze({ big: true }), 1500);
        break;
      case 'hooks':
        if (cmd.ok) panel.say({ kind: 'info', line: cmd.action === 'install' ? t.hooksOk : t.hooksRemoved, hold: 6000 });
        else panel.say({ kind: 'error', line: fmt(t.hooksFail, { error: cmd.error }), hold: 9000 });
        break;
      // --dev helpers
      case 'intro': // her intro again, as when she starts (still: as with Windows' animations off)
        panel.hide();
        await capri.intro(capri.spot('post'), cmd.still ? { still: true } : {});
        break;
      case 'pose':
        capri.debug = cmd.params || null;
        if (cmd.still) capri.nextMove = capri.nextGaze = Infinity; // no wandering off mid-test
        if (cmd.hush) {
          panel.setTicker(null);
          panel.hide();
        }
        if (cmd.scale) capri.setScale(cmd.scale);
        if (cmd.stance) capri.setStance(cmd.stance, cmd);
        if (cmd.at) capri.pos = cmd.at;
        if (cmd.facing) capri.facing = cmd.facing;
        capri.drawFrame();
        break;
      case 'config': // a setting, as if changed from her menu
        host.setConfig(cmd.patch || {});
        break;
      case 'focus': // as if window `fg` had come to the front
        capri.windows = { ...capri.windows, fg: cmd.fg };
        brain.onWindows(capri.windows);
        break;
      case 'freeze':
        capri.hidden = Boolean(cmd.on);
        break;
      case 'act':
        // behaviours by method name (gaze, celebrate, hurt, shed, peek, fall, wanderStep...) or acts by name
        if (cmd.act === 'sit') {
          // pile: n-th window she could sit on from the top of the pile (0: the --dev test window
          // opened last), instead of the usual choice
          const top = cmd.pile !== undefined && capri.windows.wins.filter((w) => capri.canSit(w))[cmd.pile];
          const seat = top ? { win: top, dx: top.w * 0.4 } : capri.pickSeat();
          if (seat) capri.sitOn(seat);
        } else if (typeof capri[cmd.act] === 'function') capri[cmd.act](...(cmd.args || []));
        else capri.perform(cmd.act, cmd.dir || 0);
        break;
      default:
        break;
    }
  });

  // entrance: her face big in the corner says hi, then she dives down to her spot
  // (put away last time: she starts in her biochip)
  if (config.visible === false) capri.stowNow();
  else if (intro) await capri.intro(capri.spot('post'));
  else await capri.materialize(capri.spot('post'));
  // Windows has its animations off and she's following it: she barely moves. The first time, she
  // says so and asks whether to move anyway (her menu › Animations changes it later).
  if (reducedMotion.setting === 'auto' && reducedMotion.system && !config.motionAsked) {
    const m = brain.t.motion;
    await new Promise((done) => {
      const asked = panel.say({
        kind: 'info',
        face: 'aside',
        guide: true,
        line: m.line,
        quote: m.quote,
        actions: [{ id: 'full', label: m.full, primary: true }, { id: 'reduced', label: m.still }],
        onAction: (id) => {
          host.setConfig({ motion: id, motionAsked: true });
          panel.hide();
          if (id === 'full') capri.perform('hop');
        },
        onLeave: done,
        hold: null,
      });
      if (!asked) done();
    });
  }
  const hooks = await host.hooksStatus();
  // her welcome: the first time, or while she's meant to watch Claude Code and isn't plugged into it
  if (!config.welcomed || (config.claude && !hooks.installed)) guide.welcome();
  else panel.say({ kind: 'info', line: brain.onlineLine(), hold: 4000 });

  // In the evening, after a real day's work, she brings you her report card once, on her own,
  // at a quiet moment.
  setInterval(() => {
    const day = mission.day;
    const quiet = !brain.busySessions.length && !panel.visible && !guide.running && !capri.busy && !capri.act;
    if (new Date().getHours() < 18 || day.reported || day.missions < 3 || !quiet) return;
    if (capri.stowed || capri.dormant || capri.mode === 'sleep') return;
    if (brain.report()) {
      mission.markReported();
      capri.perform('curious', capri.towardCenter());
    }
  }, 60000);
}

boot().catch((err) => {
  console.error('[capri] boot failed', err);
});

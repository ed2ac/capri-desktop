'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');

const DEFAULTS = {
  scale: 0.6,        // sprite scale, 0.6 ≈ 250px tall
  muted: false,
  volume: 0.7,
  lang: 'auto',      // 'auto' follows the system language, or 'fr' / 'en'
  displayId: null,   // null = primary display
  wander: true,      // random teleports when idle
  possess: true,     // now and then she dives into the window she sits on and takes it over
  visible: true,
  welcomed: false,   // she has introduced herself (her welcome panel)
  assistant: 'auto', // the coding assistant she watches: 'claude' or 'codex' ('auto': whichever has her hooks)
  linked: false,     // a Claude Code event has reached her at least once
  chatModel: null,   // the model she talks with (null: the provider's first one)
  provider: 'ollama', // who answers her chat: a key of llm.js PROVIDERS
  apiKeys: {},       // { openai: 'sk-...' }, else the provider's env variable
  customUrl: '',     // the 'custom' provider: any OpenAI-compatible base URL (http://host:port/v1)
  claudeCwd: null,   // the folder Claude Code works in (null: your home folder)
  userName: '',      // what she calls you
  persona: '',       // how you want her, in your words (her chat)
  myLines: [],       // lines of yours she says now and then, with hers
  memories: [],      // things you asked her to remember (her chat)
  claudeMode: 'default', // Claude Code's permission mode in her chat: 'default' only reads, 'acceptEdits' edits without asking
  claude: true,      // she watches Claude Code (off: she just keeps you company, no word of it)
  rest: 'corner',    // where she rests when nothing's going on: 'corner', or 'taskbar' (sitting on it)
  theme: 'nightcity', // her windows: 'nightcity' (the cyberpunk.net HUD) or 'classic' (her first ones, violet)
  motion: 'auto',    // her animations: 'auto' (like Windows' animation effects), 'full' or 'reduced'
  motionAsked: false, // she asked once, Windows' animations being off, whether to move anyway
  render: 'auto',   // how her window is drawn: 'auto', 'gl' (OpenGL) or 'software' (no graphics card), for PCs that show it black
  follow: true,      // with several screens, she follows the pointer to the one you're on
  jealous: true,     // she gets jealous when she sees you on another AI (bond.js)
  closePages: false, // off by default: jealous, she closes their pages in your browser, and pages to download them
  reminders: [],     // the reminders she keeps: [{ id, at, text, made }] (reminders.js)
  bond: null,        // how close she is to you: { xp, first, last, days, streak, caps } (bond.js)
  pcReact: true,     // she reacts to your PC: the processor at full tilt, the battery, the network, a USB stick, a game (pc.js)
  watchScreen: false, // she looks at your screen now and then and says something about it (look.js)
  lookAsked: false,  // she told you what looking means (where the picture goes) and you said yes
  watchActivity: false, // she comments on what you do: the app in front and its title, to her chat's AI (activity.js)
  activityAsked: false, // she told you what that means (where the titles go) and you said yes
  aiLines: true,     // what she says on her own, written by her local AI (speech.js); off: her written lines
  callQuiet: true,   // in a call (microphone or camera in use) she goes into her biochip and makes no sound
  chatty: 'normal',
  pranks: 'light',   // her mischief (play.js): 'off', 'light' (zaps, shaking a window, the keyboard's lights) or 'bold' (your pointer too)  // how often she talks about what you do: 'low', 'normal' or 'high' (activity.js)
  localModel: '',    // the model on this PC for all she says on her own (empty: gemma3 if there, else the first)
  githubWatch: true, // your GitHub notifications (CI failed, reviews, mentions) through gh in WSL (github.js)
  ghSeen: [],
  ctxReminders: [], // "when I open VS Code, remind me to…": [{ id, app, text, made }] (main.js)
  gestures: true, // your hands and head through the camera: waves, thumbs up, "shh", eye contact (gestures.js)
  panelSize: 'medium', // her panels and their text: 'small', 'medium' or 'large' (capri.css)
  converse: true, // she listens a few seconds for your answer when she asks you something (converse.js)
  lockSnap: false, // a photo of a stranger at the locked PC, in ~/Capri/visitas (lockwatch.js)
  workshopAuto: true, // her coding workshop window opens (in the background) when Claude starts a task
  projectsRoot: '~/dev', // where your code projects are in WSL, for her hands (tasks.js)
  taskPermission: 'auto', // how much Claude asks during her tasks: 'auto' (it judges what's safe), 'acceptEdits' or 'default' (every step)
  taskModel: 'sonnet', // Claude's model for her tasks: 'sonnet', 'opus', 'auto' (Opus in code projects) or 'default'
  calendarUrl: '',   // your calendar's private ICS address (daily.js): only fetched, never sent anywhere else
  eyeBreaks: false,  // every 20 minutes at the screen, 20 seconds looking far away (breaks.js / daily.js)
  obsMode: 'behave', // OBS on: 'behave' (no pranks, nothing about what you do on screen) or 'show' (she performs)
  senseInput: false, // she feels your keyboard and mouse: counts of keys and clicks, never which keys (senses.js)
  senseAsked: false,
  cameraOn: false,   // her camera (camera.js): whether you're there, your smile, a yawn… (local), off by default
  cameraAsked: false,
  cameraLook: false, // now and then she looks at you through it and says something (a vision model: online if free)
  lockAway: false,   // her camera sees you gone 2 minutes, the PC idle: Windows locked (camera.js)
  faceData: null,    // the faces she knows (faceid.js): encrypted numbers, never a picture
  lockStrangers: false, // someone she doesn't know at your PC (and no one let them): Windows locked
  faceAllow: [],     // who may use your PC when ("tomorrow my mom will use the PC"): [{ who, from, to }]
  earOn: false,      // she hears the room: sounds classified on this PC, never recorded (hearing.js)
  earAsked: false,
  wakeWord: true,    // with "Hear the room" on: say "Capri" and she listens (Vosk, offline)
  city: '',          // for the weather (daily.js): only the city's name goes to Open-Meteo
  knownStartup: null, // what started with Windows when she last looked (guard.js)
  shellReact: true,  // she reacts to your terminal's commands (hooks/capri-shell.sh): failed, long, git push (shell.js)
  breaks: true,      // after two hours at your PC without a real break, she tells you to take one (breaks.js)
  setups: {},        // your setups, by name: the apps you had open and where (setups.js)
  gameClose: [],     // the apps game mode closes, as you named them
  gameMode: null,    // game mode on: { plan, closed, since }, to put everything back after
};

let cache = null;

function file() {
  return path.join(app.getPath('userData'), 'config.json');
}

function load(fresh = false) {
  if (cache && !fresh) return cache;
  try {
    cache = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(file(), 'utf8')) };
  } catch {
    cache = { ...DEFAULTS };
  }
  return cache;
}

function save(patch) {
  cache = { ...load(), ...patch };
  try {
    fs.mkdirSync(path.dirname(file()), { recursive: true });
    fs.writeFileSync(file(), JSON.stringify(cache, null, 2));
  } catch (err) {
    console.error('[capri] could not save config:', err.message);
  }
  return cache;
}

module.exports = { load, save, file, DEFAULTS };

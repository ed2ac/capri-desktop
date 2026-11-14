'use strict';

// Your Windows notifications (her menu › Read my notifications, off until you turn it on): new ones,
// from Windows' own notification list on this PC (read-only; apps outside the Store can't use the
// official listener). Which app, the title and the text of each: for her to hold them during focus,
// tell you what came while you were away, and catch what looks urgent. Nothing leaves the PC.

const path = require('node:path');
const fs = require('node:fs');

const FILE = path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'Windows', 'Notifications', 'wpndatabase.db');
const NAMES = [
  [/whatsapp/i, 'WhatsApp'], [/discord/i, 'Discord'], [/telegram/i, 'Telegram'], [/outlook|olk|hxoutlook/i, 'Outlook'], [/teams/i, 'Teams'],
  [/slack/i, 'Slack'], [/opera/i, 'Opera'], [/chrome/i, 'Chrome'], [/msedge|edge/i, 'Edge'], [/firefox/i, 'Firefox'], [/spotify/i, 'Spotify'],
  [/instagram/i, 'Instagram'], [/steam/i, 'Steam'], [/epic/i, 'Epic Games'], [/xbox/i, 'Xbox'], [/phone|yourphone|phonelink/i, 'Link com o Celular'],
];

let db = null;
let last = null; // the highest Order seen

const unxml = (s) => String(s).replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_m, n) => String.fromCodePoint(Number(n))).replace(/&amp;/g, '&').trim();

function appName(id) {
  const hit = NAMES.find(([re]) => re.test(id));
  if (hit) return hit[1];
  const tail = String(id).split(/[!\\.]/).filter(Boolean);
  return tail.length ? tail[tail.length - 1].replace(/^App$/, tail[tail.length - 2] || 'App') : 'App';
}

// what a toast says: { title, body }
function parse(payload) {
  const xml = Buffer.isBuffer(payload) ? payload.toString('utf8') : String(payload || '');
  const texts = [...xml.matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/g)].map((m) => unxml(m[1])).filter(Boolean);
  return { title: (texts[0] || '').slice(0, 120), body: texts.slice(1).join(' · ').slice(0, 300) };
}

function open() {
  if (db || process.platform !== 'win32' || !fs.existsSync(FILE)) return db;
  const { DatabaseSync } = require('node:sqlite');
  db = new DatabaseSync(FILE, { readOnly: true });
  return db;
}

// the notifications that arrived since the last call: [{ app, title, body, at }] (the first call
// only learns where the list is)
function fresh() {
  if (!open()) return [];
  const q = db.prepare("SELECT n.\"Order\" AS ord, n.Payload AS payload, n.ArrivalTime AS arrival, h.PrimaryId AS app FROM Notification n LEFT JOIN NotificationHandler h ON h.RecordId = n.HandlerId WHERE n.Type = 'toast' AND n.\"Order\" > ? ORDER BY n.\"Order\" ASC LIMIT 50");
  q.setReadBigInts(true);
  const rows = q.all(last ?? 0n);
  if (!rows.length) return [];
  const first = last == null;
  last = rows[rows.length - 1].ord;
  if (first) return [];
  return rows.filter((r) => !/capri/i.test(String(r.app))).map((r) => ({ app: appName(String(r.app || '')), ...parse(r.payload), at: Date.now() }))
    .filter((n) => n.title || n.body);
}

function close() {
  try { db?.close(); } catch { /* already */ }
  db = null;
  last = null;
}

module.exports = { fresh, close, parse, appName };

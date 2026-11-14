'use strict';

// Your calendar, for her (renderer daily.js): the private ICS address of a Google or Outlook calendar
// you gave her ("my calendar is https://…"), fetched now and then. Read only, nothing sent but the
// request for that address. The events of the next day and a half, repeating ones included (daily,
// weekly on given days, monthly, yearly), as [{ title, start, end, allDay, where }].

const MAX = 2 * 1024 * 1024;
let cache = { url: '', at: 0, text: '' };

// "folded" lines (continued with a leading space) unfolded, then KEY;PARAMS:VALUE
function lines(text) {
  return text.replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
}

// 20261114T093000Z, 20261114T093000 (local, or TZID), 20261114 (all day)
function parseDate(value, params = '') {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(value.trim());
  if (!m) return null;
  const [, y, mo, d, h = '00', mi = '00', s = '00', z] = m;
  const allDay = !m[4] || /VALUE=DATE(?!-)/.test(params);
  if (z) return { date: new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s)), allDay };
  // floating or with a TZID: taken as this PC's local time (right for your own calendar's zone)
  return { date: new Date(+y, +mo - 1, +d, +h, +mi, +s), allDay };
}

const unescape = (s) => String(s || '').replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1').trim();
const DAYS = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

function parse(text) {
  const events = [];
  let cur = null;
  for (const line of lines(text)) {
    if (line === 'BEGIN:VEVENT') cur = { exdates: [] };
    else if (line === 'END:VEVENT') {
      if (cur?.start) events.push(cur);
      cur = null;
    } else if (cur) {
      const i = line.indexOf(':');
      if (i < 0) continue;
      const [key, ...params] = line.slice(0, i).split(';');
      const value = line.slice(i + 1);
      const p = params.join(';');
      if (key === 'SUMMARY') cur.title = unescape(value).slice(0, 120);
      else if (key === 'LOCATION') cur.where = unescape(value).slice(0, 120);
      else if (key === 'DTSTART') Object.assign(cur, { start: parseDate(value, p) });
      else if (key === 'DTEND') cur.end = parseDate(value, p);
      else if (key === 'RRULE') cur.rrule = Object.fromEntries(value.split(';').map((kv) => kv.split('=')));
      else if (key === 'EXDATE') value.split(',').forEach((v) => { const d = parseDate(v, p); if (d) cur.exdates.push(d.date.getTime()); });
      else if (key === 'STATUS' && /CANCELLED/i.test(value)) cur.cancelled = true;
    }
  }
  return events.filter((e) => !e.cancelled);
}

// the times an event happens between from and to
function occurrences(e, from, to) {
  const start = e.start.date;
  const len = e.end ? e.end.date - start : (e.start.allDay ? 86400000 : 3600000);
  const out = [];
  const add = (d) => {
    if (d.getTime() + len > from && d < to && !e.exdates.includes(d.getTime())) out.push(new Date(d));
  };
  const r = e.rrule;
  if (!r) {
    add(start);
    return { list: out, len };
  }
  const until = r.UNTIL ? parseDate(r.UNTIL)?.date : null;
  const interval = Math.max(1, Number(r.INTERVAL) || 1);
  const byday = r.BYDAY ? r.BYDAY.split(',').map((d) => DAYS[d.slice(-2)]).filter((d) => d != null) : null;
  let count = 0;
  const max = Number(r.COUNT) || Infinity;
  // walk day by day from the start (capped): enough for "every weekday", "every other Monday"…
  const day = new Date(start);
  for (let i = 0; i < 4000 && day < to; i++, day.setDate(day.getDate() + 1)) {
    if (until && day > until) break;
    const diffDays = Math.round((day - start) / 86400000);
    let hit = false;
    if (r.FREQ === 'DAILY') hit = diffDays % interval === 0;
    else if (r.FREQ === 'WEEKLY') hit = Math.floor(diffDays / 7) % interval === 0 && (byday ? byday.includes(day.getDay()) : day.getDay() === start.getDay());
    else if (r.FREQ === 'MONTHLY') hit = day.getDate() === start.getDate() && ((day.getFullYear() - start.getFullYear()) * 12 + day.getMonth() - start.getMonth()) % interval === 0;
    else if (r.FREQ === 'YEARLY') hit = day.getDate() === start.getDate() && day.getMonth() === start.getMonth();
    if (!hit) continue;
    if (++count > max) break;
    add(day);
  }
  return { list: out, len };
}

async function upcoming(url, hours = 36) {
  if (!/^https:\/\/\S+$/i.test(url || '')) return { error: 'nourl' };
  if (cache.url !== url || Date.now() - cache.at > 15 * 60000) {
    const res = await fetch(url.replace(/^webcal:/i, 'https:'), { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return { error: `HTTP ${res.status}` };
    const text = (await res.text()).slice(0, MAX);
    if (!/BEGIN:VCALENDAR/.test(text)) return { error: 'notics' };
    cache = { url, at: Date.now(), text };
  }
  const from = Date.now() - 3600000;
  const to = new Date(Date.now() + hours * 3600000);
  const events = [];
  for (const e of parse(cache.text)) {
    const { list, len } = occurrences(e, from, to);
    for (const d of list) events.push({ title: e.title || '(sem título)', start: d.getTime(), end: d.getTime() + len, allDay: e.start.allDay, where: e.where || '' });
  }
  return { events: events.sort((a, b) => a.start - b.start).slice(0, 40) };
}

module.exports = { upcoming, parse, occurrences };

'use strict';

// Streamers you follow going live ("me avisa quando o X entrar ao vivo"): on Twitch or YouTube, from
// their public channel page (no key, no account), every few minutes. { name, site, url, title }.

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

const clean = (s) => String(s || '').trim().replace(/^@/, '').replace(/[^\w.-]/g, '').slice(0, 60);

async function page(url) {
  const res = await fetch(url, { headers: { 'user-agent': UA, 'accept-language': 'en', cookie: 'CONSENT=YES+1; SOCS=CAI' }, signal: AbortSignal.timeout(10000) });
  return res.ok ? res.text() : '';
}

// { live, title, url } for one channel
async function check({ site, name }) {
  const who = clean(name);
  if (!who) return { live: false };
  if (site === 'youtube') {
    const url = `https://www.youtube.com/@${who}/live`;
    const html = await page(url);
    const live = /"isLiveNow":true|"isLive":true/.test(html) && /<link rel="canonical" href="https:\/\/www\.youtube\.com\/watch\?v=/.test(html);
    const title = (/<meta name="title" content="([^"]*)"/.exec(html) || [])[1] || '';
    return { live, title, url };
  }
  const url = `https://www.twitch.tv/${who.toLowerCase()}`;
  const html = await page(url);
  const live = /"isLiveBroadcast":true/.test(html);
  const title = (/<meta property="og:description" content="([^"]*)"/.exec(html) || [])[1] || '';
  return { live, title, url };
}

module.exports = { check, clean };

const q = new URLSearchParams(location.search);
const site = q.get('site') || '';
const back = q.get('back') || '';
const en = !navigator.language.startsWith('pt');
if (en) {
  document.documentElement.lang = 'en';
  document.getElementById('title').textContent = 'Focus mode, choom.';
  document.getElementById('text').textContent = `${site} can wait. Finish what you were doing and I'll let you go.`;
  document.getElementById('back').textContent = 'Open it anyway';
} else if (site) document.getElementById('text').textContent = `O ${site} fica pra depois. Termina o que você tava fazendo que eu te libero.`;
// "open it anyway": once, for this page (she'll know)
document.getElementById('back').onclick = (e) => {
  e.preventDefault();
  if (/^https?:/.test(back)) chrome.runtime.sendMessage({ type: 'letThrough', url: back }, () => location.replace(back));
};

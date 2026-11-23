(() => {
'use strict';

// ---------- helpers ----------
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ART = { m: 'der', f: 'die', n: 'das', p: 'die' };
const DAY = 86400000;
const view = $('#view');
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const today = () => new Date().toISOString().slice(0, 10);
const plainEx = t => t.replace(/[⟦⟧]/g, '');
const markEx = t => esc(t).replace(/⟦(.*?)⟧/g, '<em>$1</em>');
const ICON = {
  speak: '<svg viewBox="0 0 24 24"><path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/></svg>',
  save: '<svg viewBox="0 0 24 24"><path d="M6 3.5h12v17l-6-4-6 4z"/></svg>',
  more: '<svg viewBox="0 0 24 24"><circle cx="5.5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="18.5" cy="12" r="1.2"/></svg>',
  search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/></svg>',
};

// ---------- storage ----------
const store = {
  get(k, d) { try { const v = localStorage.getItem('ws.' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('ws.' + k, JSON.stringify(v)); } catch (e) { toast('Speicher ist voll'); } },
};
let words = store.get('words', {});
let history = store.get('history', []);
let cache = store.get('cache', {});
let prefs = store.get('prefs', { dir: 'mix' });
let stats = store.get('stats', { days: {}, gender: {} });
const saveWords = () => store.set('words', words);
const saveStats = () => store.set('stats', stats);

function cachePut(q, r) {
  cache[q.toLowerCase()] = { t: Date.now(), r };
  const keys = Object.keys(cache);
  if (keys.length > 160) keys.sort((a, b) => cache[a].t - cache[b].t).slice(0, keys.length - 160).forEach(k => delete cache[k]);
  store.set('cache', cache);
}
function cacheGet(q) {
  const c = cache[q.toLowerCase()];
  return c && Date.now() - c.t < 30 * DAY ? c.r : null;
}

// ---------- themes ----------
const THEMES = (window.THEMES || []).map(t => ({
  ...t,
  items: t.words.map(item => {
    const raw = typeof item === 'string' ? item : item.w;
    const m = raw.match(/^(der|die|das) (.+)$/);
    const g = m ? { der: 'm', die: 'f', das: 'n' }[m[1]] : null;
    const lemma = m ? m[2] : raw.replace(/^sich /, '');
    return { raw, lemma, g, hint: typeof item === 'string' ? '' : item.hint };
  }),
}));
const PLURAL_ONLY = new Set(window.PLURAL_ONLY || []);
const HINTS = {};
THEMES.forEach(t => t.items.forEach(i => { if (i.hint) HINTS[i.lemma] = i.hint; }));
const ALL_THEME = THEMES.flatMap(t => t.items);

// ---------- entry helpers ----------
function gclass(e) {
  if (e.pluralOnly) return 'p';
  if (e.genus && e.genus.length === 1) return e.genus[0];
  return e.genus && e.genus.length ? 'multi' : '';
}
function artOf(e) {
  if (e.pluralOnly) return 'die';
  return (e.genus || []).map(g => ART[g]).join('/');
}
function wordKey(title, e) { return title + '|' + e.pos + '|' + (e.plural || ''); }
function isNoun(e) { return /Substantiv/.test(e.pos); }
function examplesFor(e, n) {
  return e.examples.filter(x => x.n === n).sort((a, b) => ((a.old || 0) - (b.old || 0)) || (a.quote - b.quote) || (a.text.length - b.text.length));
}
function snapshot(title, e) {
  const senses = e.senses.slice(0, 6);
  const examples = [];
  senses.forEach(s => examplesFor(e, s.n).slice(0, 3).forEach(x => examples.push(x)));
  return {
    title, pos: e.pos, genus: e.genus, plural: e.plural, pluralOnly: e.pluralOnly, genitive: e.genitive,
    verb: e.verb, adj: e.adj, hyph: e.hyph, ipa: e.ipa, senses, examples,
    syn: e.syn.slice(0, 10), ant: e.ant.slice(0, 6), combos: e.combos.slice(0, 6), idioms: e.idioms.slice(0, 3),
    en: e.en.slice(0, 8), notes: e.notes.slice(0, 2),
  };
}
function level(w) {
  const s = w.srs;
  if (!s || !s.reps) return 0;
  if (s.ivl < 1) return 1;
  if (s.ivl < 7) return 2;
  if (s.ivl < 21) return 3;
  return 4;
}
function lvlBars(n) { return '<span class="lvl" aria-label="Stufe ' + n + ' von 4">' + [1, 2, 3, 4].map(i => `<i class="${i <= n ? 'f' : ''}"></i>`).join('') + '</span>'; }
function displayWord(w) {
  const e = w.snap || { genus: w.g ? [w.g] : [], pos: w.g ? 'Substantiv' : '' };
  const art = isNoun(e) || w.g ? artOf(e) : '';
  const cls = gclass(e);
  return (art ? `<span class="art ${cls}">${esc(art)}</span>` : '') + esc(w.display || w.title);
}

// ---------- speech ----------
let deVoice = null;
function pickVoice() {
  const vs = speechSynthesis.getVoices().filter(v => /^de(-|_|$)/i.test(v.lang));
  deVoice = vs.find(v => /premium|enhanced|erweitert/i.test(v.name)) || vs.find(v => /Anna|Helena|Petra|Markus/i.test(v.name)) || vs[0] || null;
}
if ('speechSynthesis' in window) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }
function speak(text) {
  if (!('speechSynthesis' in window)) return toast('Vorlesen geht hier nicht');
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'de-DE'; u.rate = 0.92;
  if (deVoice) u.voice = deVoice;
  speechSynthesis.speak(u);
}

// ---------- toast & sheet ----------
let toastT;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 1900);
}
function sheet(html, bind) {
  const bg = document.createElement('div');
  bg.className = 'sheet-bg';
  bg.innerHTML = `<div class="sheet" role="dialog" aria-modal="true"><div class="grab"></div>${html}</div>`;
  const close = () => bg.remove();
  bg.addEventListener('click', e => { if (e.target === bg) close(); });
  document.body.appendChild(bg);
  bind && bind(bg, close);
  return close;
}

// ---------- router ----------
function route() {
  const h = decodeURIComponent(location.hash.slice(2) || 'suchen');
  const [tab, ...rest] = h.split('/');
  const arg = rest.join('/');
  $$('.tabbar a').forEach(a => a.classList.toggle('on', a.dataset.tab === tab));
  document.body.classList.toggle('in-session', tab === 'ueben' && !!arg);
  window.scrollTo(0, 0);
  if (tab === 'woerter') return renderWords(arg);
  if (tab === 'ueben') return arg ? startSession(arg) : renderPractice();
  if (tab === 'themen') return arg ? renderTheme(arg) : renderThemes();
  return renderSearch(arg);
}
window.addEventListener('hashchange', route);
const go = h => { if (location.hash === h) route(); else location.hash = h; };

// ---------- search ----------
function searchBar(value) {
  return `<div class="search-wrap">
    <form class="search" role="search" autocomplete="off">
      ${ICON.search}
      <input id="q" type="text" inputmode="search" enterkeyhint="search" placeholder="Wort suchen, z. B. Entscheidung" value="${esc(value)}"
        autocapitalize="off" autocorrect="off" spellcheck="false" aria-label="Wort suchen">
      <button type="button" class="clear" aria-label="Löschen" ${value ? '' : 'hidden'}>✕</button>
    </form>
    <ul class="suggest" hidden></ul>
  </div>`;
}

function bindSearch() {
  const form = $('.search'), input = $('#q'), list = $('.suggest'), clear = $('.clear');
  let t, last = '';
  input.addEventListener('input', () => {
    clear.hidden = !input.value;
    clearTimeout(t);
    const v = input.value.trim();
    if (v.length < 2) { list.hidden = true; return; }
    t = setTimeout(async () => {
      last = v;
      const s = await Wiki.suggest(v);
      if (last !== v || input.value.trim() !== v) return;
      list.innerHTML = s.map(x => `<li><button type="button" data-w="${esc(x)}">${esc(x)}</button></li>`).join('');
      list.hidden = !s.length;
    }, 220);
  });
  list.addEventListener('click', e => { const b = e.target.closest('button'); if (b) { input.blur(); go('#/suchen/' + encodeURIComponent(b.dataset.w)); } });
  form.addEventListener('submit', e => { e.preventDefault(); const v = input.value.trim(); if (v) { input.blur(); list.hidden = true; go('#/suchen/' + encodeURIComponent(v)); } });
  clear.addEventListener('click', () => { input.value = ''; clear.hidden = true; list.hidden = true; input.focus(); });
}

function wordOfDay() {
  const pool = ALL_THEME;
  const d = Math.floor(Date.now() / DAY);
  return pool[(d * 7919) % pool.length];
}

function renderSearch(q) {
  view.innerHTML = searchBar(q || '') + '<div id="result"></div>';
  bindSearch();
  if (q) return doLookup(q);
  const w = wordOfDay();
  const standalone = window.navigator.standalone || matchMedia('(display-mode: standalone)').matches;
  const showInstall = !standalone && !store.get('installSeen', false);
  $('#result').innerHTML = `
    ${showInstall ? `<div class="card" id="install">
      <div class="wotd"><div class="kicker">Als App speichern</div></div>
      <p style="margin:8px 0 0;font-size:15px">In Safari unten auf <b>Teilen</b> tippen, dann <b>Zum Home-Bildschirm</b>. Danach öffnet sich Wortschatz wie eine App, auch ohne Internet für gespeicherte Wörter.</p>
      <button class="link" id="install-ok" style="margin-top:10px">Verstanden</button></div>` : ''}
    <button class="card wotd" id="wotd" style="text-align:left;${showInstall ? 'margin-top:12px' : ''}">
      <div class="kicker">Wort des Tages</div>
      <div class="w">${w.g ? `<span class="art ${w.g}" style="font-size:20px;margin-right:6px">${ART[w.g]}</span>` : ''}${esc(w.raw.replace(/^(der|die|das) /, ''))}</div>
      <div class="hint">${esc(w.hint || THEMES.find(t => t.items.includes(w)).name)}</div>
    </button>
    ${history.length ? `<div class="section-label">Zuletzt gesucht</div>
      <div class="chips">${history.slice(0, 12).map(h => `<a class="chip" href="#/suchen/${encodeURIComponent(h)}">${esc(h)}</a>`).join('')}</div>` : ''}
    <div class="section-label">Farben</div>
    <div class="legend"><span><i class="dot m"></i>der</span><span><i class="dot f"></i>die</span><span><i class="dot n"></i>das</span><span><i class="dot" style="background:var(--pl)"></i>nur Plural</span></div>
    <p class="note" style="margin-top:14px">Tipp: Du kannst auch gebeugte Formen suchen, zum Beispiel <i>ging</i>, <i>Häuser</i> oder <i>sich bewirbt</i>.</p>`;
  $('#wotd').onclick = () => go('#/suchen/' + encodeURIComponent(w.lemma));
  const ok = $('#install-ok');
  if (ok) ok.onclick = () => { store.set('installSeen', true); $('#install').remove(); $('#wotd').style.marginTop = ''; };
}

let lookupToken = 0;
async function doLookup(q) {
  const token = ++lookupToken;
  const out = $('#result');
  out.innerHTML = `<div class="loading"><div class="spinner"></div>Suche „${esc(q)}“ …</div>`;
  let r = cacheGet(q);
  if (!r) {
    try {
      r = await Wiki.lookup(q);
      if (r) cachePut(q, r);
    } catch (e) {
      const saved = Object.values(words).filter(w => w.snap && w.title.toLowerCase() === q.toLowerCase());
      if (saved.length) r = { title: saved[0].title, entries: saved.map(w => w.snap), offline: true };
      else { out.innerHTML = `<div class="empty"><h2>Keine Verbindung</h2><p>Ohne Internet funktionieren nur gespeicherte Wörter.</p></div>`; return; }
    }
  }
  if (token !== lookupToken || !document.body.contains(out)) return;
  if (!r || !r.entries.length) return notFound(q);
  history = [r.title, ...history.filter(h => h !== r.title)].slice(0, 20);
  store.set('history', history);
  out.innerHTML = renderResult(r);
  bindResult(r);
}

async function notFound(q) {
  const out = $('#result');
  out.innerHTML = `<div class="empty"><h2>Nicht gefunden</h2><p>„${esc(q)}“ steht nicht im Wörterbuch.</p><p id="alts-l" hidden style="margin-top:6px">Meintest du vielleicht:</p><div class="chips" id="alts" style="justify-content:center;margin-top:14px"></div>
    <p style="margin-top:20px"><a href="https://www.duden.de/suchen/dudenonline/${encodeURIComponent(q)}" target="_blank" rel="noopener">Im Duden suchen ↗</a></p></div>`;
  const s = await Wiki.suggest(q.slice(0, Math.max(3, q.length - 2)));
  if (!$('#alts')) return;
  $('#alts').innerHTML = s.slice(0, 6).map(x => `<a class="chip" href="#/suchen/${encodeURIComponent(x)}">${esc(x)}</a>`).join('');
  $('#alts-l').hidden = !s.length;
}

function senseHTML(e, s, i, title) {
  let text = s.text, label = '';
  const lm = text.match(/^([^:]{2,60}):\s+(.+)$/);
  if (lm && lm[1].split(' ').length <= 5) { label = lm[1]; text = lm[2]; }
  label = label.replace(/\brefl\./g, 'reflexiv').replace(/\bintrans\./g, 'intransitiv').replace(/\btrans\./g, 'transitiv').replace(/\bugs\./g, 'umgangssprachlich').replace(/\bübertr\./g, 'übertragen');
  const exs = examplesFor(e, s.n);
  const exHTML = (x, hidden) => `<p class="ex"${hidden ? ' hidden' : ''}>${markEx(x.text)}<button class="say" data-say="${esc(plainEx(x.text))}" aria-label="Vorlesen">▶︎</button><a class="tr" href="https://www.deepl.com/translator#de/en/${encodeURIComponent(plainEx(x.text))}" target="_blank" rel="noopener">EN ↗</a></p>`;
  return `<li class="sense"><span class="n">${esc(s.n)}</span>
    <div class="def">${label ? `<span class="label">${esc(label)}:</span> ` : ''}${esc(text)}</div>
    ${exs.slice(0, 2).map(x => exHTML(x)).join('')}
    ${exs.length > 2 ? exs.slice(2, 8).map(x => exHTML(x, true)).join('') + `<button class="more" data-more>Mehr Beispiele (${Math.min(exs.length, 8) - 2})</button>` : ''}
  </li>`;
}

function formsHTML(e) {
  const f = [];
  if (isNoun(e)) {
    if (e.pluralOnly) f.push(['Nur Plural', 'die ' + (e.plural || '')]);
    else {
      if (e.plural) f.push(['Plural', `<span class="art p">die</span> ${esc(e.plural)}`]);
      else f.push(['Plural', '<span style="color:var(--muted);font-weight:400">kein Plural</span>']);
      if (e.genitive) f.push(['Genitiv', `${esc(e.genus[0] === 'f' ? 'der' : 'des')} ${esc(e.genitive)}`]);
    }
  }
  if (e.verb) {
    if (e.verb.er) f.push(['Präsens', 'er/sie ' + esc(e.verb.er)]);
    if (e.verb.praet) f.push(['Präteritum', 'er/sie ' + esc(e.verb.praet)]);
    if (e.verb.part) f.push(['Perfekt', esc((e.verb.aux === 'sein' ? 'ist ' : 'hat ') + e.verb.part) + (e.verb.aux2 ? ' / ' + esc((e.verb.aux2 === 'sein' ? 'ist ' : 'hat ') + e.verb.part) : '')]);
  }
  if (e.adj) {
    if (e.adj.komp && e.adj.komp !== '—') f.push(['Komparativ', esc(e.adj.komp)]);
    if (e.adj.sup && e.adj.sup !== '—') f.push(['Superlativ', 'am ' + esc(e.adj.sup)]);
  }
  if (!f.length) return '';
  return `<dl class="forms">${f.map(([k, v]) => `<div><dt>${k}</dt><dd>${typeof v === 'string' && v.includes('<') ? v : esc(v)}</dd></div>`).join('')}</dl>`;
}

function entryHTML(r, e, i) {
  const title = r.title;
  const key = wordKey(title, e);
  const saved = !!words[key];
  const g = gclass(e);
  const art = isNoun(e) ? artOf(e) : '';
  const hint = HINTS[title];
  const syn = e.syn.filter(s => s.close).concat(e.syn.filter(s => !s.close)).slice(0, 12);
  const idioms = e.idioms.slice(0, 5);
  return `<article class="card entry g-${g}" data-i="${i}">
    <h1 class="headword" lang="de">${art ? `<span class="art ${g === 'multi' ? '' : g}">${esc(art)}</span>` : ''}${esc(title)}</h1>
    <div class="entry-head">
      <div class="meta"><span class="pos">${esc(e.pos)}</span>${e.hyph && e.hyph !== title ? `<span class="sep">·</span>${esc(e.hyph)}` : ''}${e.ipa ? `<span class="sep">·</span><span class="ipa">[${esc(e.ipa)}]</span>` : ''}</div>
      <button class="icon-btn" data-speak="${esc((art ? art.split('/')[0] + ' ' : '') + title)}" aria-label="Vorlesen">${ICON.speak}</button>
      <button class="icon-btn save ${saved ? 'on' : ''}" data-save="${i}" aria-label="${saved ? 'Gespeichert' : 'Speichern'}" aria-pressed="${saved}">${ICON.save}</button>
    </div>
    ${formsHTML(e)}
    ${hint && i === 0 ? `<div class="hint-box">${esc(hint)}</div>` : ''}
    ${e.notes.filter(n => !/Person|Indikativ|Konjunktiv/.test(n)).slice(0, 1).map(n => `<p class="note">${esc(n)}</p>`).join('')}
    <ol class="senses">${e.senses.map((s, j) => senseHTML(e, s, j, title)).join('')}</ol>
    ${syn.length ? `<div class="block"><h3>Synonyme</h3><div class="chips">${syn.map(s => `<a class="chip" href="#/suchen/${encodeURIComponent(s.w)}">${esc(s.w)}</a>`).join('')}</div></div>` : ''}
    ${e.ant.length ? `<div class="block"><h3>Gegenteil</h3><div class="chips">${e.ant.slice(0, 8).map(s => `<a class="chip" href="#/suchen/${encodeURIComponent(s.w)}">${esc(s.w)}</a>`).join('')}</div></div>` : ''}
    ${e.combos.length ? `<div class="block"><h3>Typische Verbindungen</h3><ul class="combo-list">${e.combos.slice(0, 8).map(c => `<li>${esc(c.text)}</li>`).join('')}</ul></div>` : ''}
    ${idioms.length ? `<div class="block"><h3>Redewendungen</h3><ul class="combo-list">${idioms.map(c => `<li>${esc(c.text)}</li>`).join('')}</ul></div>` : ''}
    ${i === 0 ? '<div class="block" id="ot" hidden></div>' : ''}
    <div class="block"><button class="en-btn" data-en="${i}" aria-expanded="false">Notfall: Englisch</button><div class="en-slot"></div></div>
    <div class="entry-foot">
      <a href="https://www.duden.de/suchen/dudenonline/${encodeURIComponent(title)}" target="_blank" rel="noopener">Duden ↗</a>
      <a href="https://www.dwds.de/wb/${encodeURIComponent(title)}" target="_blank" rel="noopener">DWDS ↗</a>
      <a href="https://de.wiktionary.org/wiki/${encodeURIComponent(title)}" target="_blank" rel="noopener">Wiktionary ↗</a>
      <span class="src">Inhalt: Wiktionary (CC BY-SA 4.0)${i === 0 ? ', Synonyme auch von OpenThesaurus' : ''}${r.offline ? ' · offline gespeichert' : ''}</span>
    </div>
  </article>`;
}

function renderResult(r) {
  return (r.formOf ? `<p class="formof"><b>${esc(r.formOf.form)}</b> ist eine Form von <b>${esc(r.title)}</b>${r.formOf.info ? ` <span>(${esc(r.formOf.info.replace(/ des (Verbs|Substantivs|Adjektivs) .*$/, ''))})</span>` : ''}</p>` : '')
    + (r.also ? `<p class="formof">Gesucht war vielleicht: <a href="#/suchen/${encodeURIComponent(r.also)}">${esc(r.also)}</a></p>` : '')
    + r.entries.map((e, i) => entryHTML(r, e, i)).join('');
}

function bindResult(r) {
  const out = $('#result');
  out.addEventListener('click', async ev => {
    const t = ev.target.closest('button');
    if (!t) return;
    if (t.dataset.speak !== undefined) return speak(t.dataset.speak);
    if (t.dataset.say !== undefined) return speak(t.dataset.say);
    if (t.hasAttribute('data-more')) {
      $$('.ex[hidden]', t.closest('.sense')).forEach(x => x.hidden = false); t.remove(); return;
    }
    if (t.dataset.save !== undefined) {
      const e = r.entries[+t.dataset.save];
      const key = wordKey(r.title, e);
      if (words[key]) { delete words[key]; toast('Entfernt'); }
      else { words[key] = { key, title: r.title, snap: snapshot(r.title, e), added: Date.now(), srs: null, hint: HINTS[r.title] || '' }; toast('In Meine Wörter gespeichert'); }
      saveWords();
      t.classList.toggle('on', !!words[key]);
      t.setAttribute('aria-pressed', !!words[key]);
      return;
    }
    if (t.dataset.en !== undefined) return toggleEnglish(r, +t.dataset.en, t);
  });
  // more synonyms from OpenThesaurus
  if (!r.offline) Wiki.thesaurus(r.title).then(list => {
    const have = new Set(r.entries.flatMap(e => e.syn.map(s => s.w)));
    const extra = list.filter(x => !have.has(x.w)).slice(0, 12);
    const box = $('#ot');
    if (!box || !extra.length) return;
    box.innerHTML = `<h3>Weitere Synonyme</h3><div class="chips">${extra.map(x => `<a class="chip soft" href="#/suchen/${encodeURIComponent(x.w)}">${esc(x.w)}${x.level ? ` <small>${esc(x.level)}</small>` : ''}</a>`).join('')}</div>`;
    box.hidden = false;
  });
}

const enCache = {};
async function toggleEnglish(r, i, btn) {
  const slot = btn.nextElementSibling;
  const card = btn.closest('.entry');
  if (btn.classList.contains('on')) { btn.classList.remove('on'); btn.setAttribute('aria-expanded', 'false'); slot.innerHTML = ''; card.classList.remove('en-mode'); return; }
  btn.classList.add('on'); btn.setAttribute('aria-expanded', 'true'); card.classList.add('en-mode');
  const e = r.entries[i];
  slot.innerHTML = '<div class="en-panel"><div class="loading" style="padding:8px 0"><div class="spinner"></div></div></div>';
  if (!enCache[r.title]) enCache[r.title] = await Wiki.english(r.title);
  const gl = enCache[r.title];
  const posMatch = gl.filter(x => x.pos === e.pos || (e.pos === 'Substantiv' && x.pos === 'Substantiv'));
  const show = posMatch.length ? posMatch : gl;
  const perSense = e.senses.map(s => ({ n: s.n, w: e.en.filter(x => x.n === s.n || x.n.split(/[,\s]+/).includes(s.n)).map(x => x.w) })).filter(x => x.w.length);
  slot.innerHTML = `<div class="en-panel">
    <h3>English</h3>
    ${perSense.length ? perSense.map(p => `<p><b>${esc(p.n)}</b> ${esc(p.w.join(', '))}</p>`).join('') : ''}
    ${show.length ? show.map(x => `<p class="pos">${esc(x.pos)}</p><ol>${x.glosses.slice(0, 6).map(g => `<li>${esc(g)}</li>`).join('')}</ol>`).join('') : (perSense.length ? '' : '<p>Keine englische Übersetzung gefunden.</p>')}
    <p style="font-size:13px;color:var(--muted)">Beispielsätze haben jetzt einen Link „EN ↗“ zu DeepL.</p>
  </div>`;
}

// ---------- my words ----------
function renderWords(filter) {
  filter = filter || 'alle';
  const all = Object.values(words).sort((a, b) => b.added - a.added);
  const now = Date.now();
  const due = w => !w.srs || w.srs.due <= now;
  const kind = w => { const p = (w.snap && w.snap.pos) || ''; return /Substantiv/.test(p) ? 'nomen' : /Verb/.test(p) ? 'verben' : /Adjektiv/.test(p) ? 'adjektive' : 'andere'; };
  const groups = { alle: all, faellig: all.filter(due), nomen: all.filter(w => kind(w) === 'nomen'), verben: all.filter(w => kind(w) === 'verben'), adjektive: all.filter(w => kind(w) === 'adjektive'), andere: all.filter(w => kind(w) === 'andere') };
  const names = { alle: 'Alle', faellig: 'Fällig', nomen: 'Nomen', verben: 'Verben', adjektive: 'Adjektive', andere: 'Andere' };
  const list = groups[filter] || all;
  view.innerHTML = `
    <div class="toolbar"><h1 class="page-title">Meine Wörter</h1><button class="icon-btn" id="menu" aria-label="Sicherung und Infos">${ICON.more}</button></div>
    ${all.length ? `<div class="seg" role="tablist">${Object.keys(names).filter(k => k === 'alle' || groups[k].length).map(k => `<button role="tab" class="${k === filter ? 'on' : ''}" data-f="${k}">${names[k]} ${groups[k].length}</button>`).join('')}</div>` : ''}
    ${!all.length ? `<div class="empty"><h2>Noch keine Wörter</h2><p>Suche ein Wort und tippe auf das Lesezeichen. Oder speichere ein ganzes Thema auf einmal.</p><p style="margin-top:18px"><a class="btn primary" href="#/themen">Themen ansehen</a></p></div>`
      : list.length ? `<div class="list">${list.map(w => `<a class="row" href="#/suchen/${encodeURIComponent(w.title)}">
          <div class="main"><div class="w">${displayWord(w)}</div><div class="sub">${esc(w.hint || (w.snap ? (w.snap.senses[0] || {}).text : 'wird geladen …') || '')}</div></div>
          ${lvlBars(level(w))}</a>`).join('')}</div>`
      : `<div class="empty"><p>Hier ist gerade nichts.</p></div>`}`;
  $$('.seg button').forEach(b => b.onclick = () => go('#/woerter/' + b.dataset.f));
  $('#menu').onclick = openMenu;
}

function openMenu() {
  const n = Object.keys(words).length;
  sheet(`<h2>Sicherung</h2>
    <p>Deine Wörter und dein Lernstand sind nur auf diesem iPhone gespeichert. Lade ab und zu eine Sicherung herunter, zum Beispiel in die Dateien-App.</p>
    <button class="btn primary block-btn" id="exp">Sicherung speichern (${n} Wörter)</button>
    <label class="btn block-btn" style="margin-top:10px">Sicherung laden<input type="file" id="imp" accept="application/json,.json" hidden></label>
    <h2 style="margin-top:26px">Über Wortschatz</h2>
    <p>Die Einträge kommen live aus dem freien Wörterbuch Wiktionary (CC BY-SA 4.0), weitere Synonyme aus OpenThesaurus. Zu jedem Wort führen Links zu Duden und DWDS. Englisch nur im Notfall: aus dem englischen Wiktionary, Sätze über DeepL.</p>`, (bg, close) => {
    $('#exp', bg).onclick = exportData;
    $('#imp', bg).onchange = ev => importData(ev.target.files[0], close);
  });
}

async function exportData() {
  const data = JSON.stringify({ app: 'wortschatz', v: 1, at: new Date().toISOString(), words, prefs, stats }, null, 1);
  const name = `wortschatz-${today()}.json`;
  const file = new File([data], name, { type: 'application/json' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'Wortschatz Sicherung' }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

function importData(file, close) {
  if (!file) return;
  const rd = new FileReader();
  rd.onload = () => {
    try {
      const d = JSON.parse(rd.result);
      if (d.app !== 'wortschatz' || !d.words) throw new Error('bad');
      let added = 0;
      Object.values(d.words).forEach(w => { if (!words[w.key]) { words[w.key] = w; added++; } else if ((w.srs?.reps || 0) > (words[w.key].srs?.reps || 0)) words[w.key] = w; });
      if (d.stats) stats = { ...d.stats, ...stats, days: { ...d.stats.days, ...stats.days }, gender: { ...d.stats.gender, ...stats.gender } };
      saveWords(); saveStats(); close(); toast(added + ' Wörter geladen'); route();
    } catch (e) { toast('Diese Datei passt nicht'); }
  };
  rd.readAsText(file);
}

// ---------- themes ----------
function renderThemes() {
  const savedTitles = new Set(Object.values(words).map(w => w.title));
  view.innerHTML = `<h1 class="page-title">Themen</h1><p class="page-sub">Typische Wörter aus B2-Kursen, nach Thema.</p>
    <div class="list">${THEMES.map(t => {
      const s = t.items.filter(i => savedTitles.has(i.lemma)).length;
      return `<a class="row" href="#/themen/${t.id}"><div class="main"><div class="w">${esc(t.name)}</div><div class="sub">${t.items.length} Wörter${s ? ` · ${s} gespeichert` : ''}</div></div><span class="chev">›</span></a>`;
    }).join('')}</div>`;
}

function renderTheme(id) {
  const t = THEMES.find(x => x.id === id);
  if (!t) return go('#/themen');
  const savedTitles = new Set(Object.values(words).map(w => w.title));
  const left = t.items.filter(i => !savedTitles.has(i.lemma)).length;
  view.innerHTML = `<p style="margin:0 0 4px"><a href="#/themen" style="text-decoration:none;font-size:15px">‹ Themen</a></p>
    <div class="toolbar"><h1 class="page-title">${esc(t.name)}</h1></div>
    <button class="btn ${left ? 'primary' : ''} block-btn" id="saveall" ${left ? '' : 'disabled'}>${left ? `Alle ${left} Wörter speichern` : 'Alle gespeichert'}</button>
    <div class="list theme-words" style="margin-top:14px">${t.items.map(i => `<a class="row" href="#/suchen/${encodeURIComponent(i.lemma)}">
      <div class="main"><div class="w">${i.g ? `<span class="art ${PLURAL_ONLY.has(i.raw) ? 'p' : i.g}">${ART[i.g]}</span>` : ''}${esc(i.raw.replace(/^(der|die|das) /, ''))}</div>${i.hint ? `<div class="theme-hint">${esc(i.hint)}</div>` : ''}</div>
      ${savedTitles.has(i.lemma) ? '<span class="chev" style="color:var(--ink)" aria-label="gespeichert">✓</span>' : '<span class="chev">›</span>'}</a>`).join('')}</div>`;
  $('#saveall').onclick = () => {
    t.items.forEach(i => {
      if (savedTitles.has(i.lemma)) return;
      const key = 'stub|' + i.lemma;
      words[key] = { key, title: i.lemma, display: i.raw.replace(/^(der|die|das) /, ''), g: i.g, hint: i.hint, snap: null, added: Date.now(), srs: null };
    });
    saveWords(); toast(left + ' Wörter gespeichert'); renderTheme(id); hydrate();
  };
}

// Theme words are saved as stubs and filled from Wiktionary in the background.
let hydrating = false;
async function hydrate() {
  if (hydrating || !navigator.onLine) return;
  hydrating = true;
  try {
    for (const w of Object.values(words).filter(w => !w.snap)) {
      try {
        const r = cacheGet(w.title) || await Wiki.lookup(w.title);
        if (!r) { w.missing = true; continue; }
        cachePut(w.title, r);
        let e = r.entries[0];
        if (w.g) e = r.entries.find(x => isNoun(x) && x.genus.includes(w.g)) || r.entries.find(isNoun) || e;
        const key = wordKey(r.title, e);
        delete words[w.key];
        if (!words[key]) words[key] = { ...w, key, title: r.title, snap: snapshot(r.title, e) };
        saveWords();
      } catch (err) { break; }
      await new Promise(res => setTimeout(res, 350));
    }
  } finally { hydrating = false; }
}

// ---------- practice ----------
function practiceCounts() {
  const all = Object.values(words);
  const now = Date.now();
  const due = all.filter(w => w.snap && (!w.srs || w.srs.due <= now)).length;
  const nouns = genderPool().length;
  const cloze = clozePool().length;
  return { total: all.length, due, nouns, cloze };
}

function streak() {
  let n = 0; const d = new Date();
  if (!stats.days[today()]) d.setDate(d.getDate() - 1);
  while (stats.days[d.toISOString().slice(0, 10)]) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

function renderPractice() {
  const c = practiceCounts();
  const st = streak(), td = stats.days[today()] || 0;
  view.innerHTML = `<h1 class="page-title">Üben</h1>
    <p class="page-sub">${td ? `Heute ${td} geübt` : 'Heute noch nicht geübt'}${st > 1 ? ` · ${st} Tage in Folge` : ''}</p>
    <button class="card mode" data-go="karten" ${c.total ? '' : 'disabled'}>
      <span class="ico a">Aa</span><div><h2>Karteikarten</h2><p>${c.total ? `${c.due} fällig · ${c.total} Wörter` : 'Erst Wörter speichern'}</p></div><span class="go">›</span></button>
    <div class="seg" style="margin:10px -16px 4px" aria-label="Richtung">
      ${[['mix', 'Gemischt'], ['wb', 'Wort zuerst'], ['bw', 'Bedeutung zuerst']].map(([k, n]) => `<button class="${prefs.dir === k ? 'on' : ''}" data-dir="${k}">${n}</button>`).join('')}
    </div>
    <button class="card mode" data-go="artikel" style="margin-top:12px">
      <span class="ico b">der</span><div><h2>der, die oder das?</h2><p>${c.nouns} Nomen · mit Regeln zum Merken</p></div><span class="go">›</span></button>
    <button class="card mode" data-go="luecken" ${c.cloze ? '' : 'disabled'}>
      <span class="ico c">_ _</span><div><h2>Lückentext</h2><p>${c.cloze ? `Das Wort im Satz ergänzen · ${c.cloze} Sätze` : 'Braucht gespeicherte Wörter mit Beispielen'}</p></div><span class="go">›</span></button>`;
  $$('[data-go]').forEach(b => b.onclick = () => go('#/ueben/' + b.dataset.go));
  $$('[data-dir]').forEach(b => b.onclick = () => { prefs.dir = b.dataset.dir; store.set('prefs', prefs); renderPractice(); });
  hydrate();
}

function countPractice() { stats.days[today()] = (stats.days[today()] || 0) + 1; saveStats(); }

function sessionTop(i, n) {
  return `<div class="session-top"><button class="x" id="quit" aria-label="Beenden">✕</button><div class="progress"><i style="width:${Math.round(i / n * 100)}%"></i></div><span class="num">${Math.min(i + 1, n)}/${n}</span></div>`;
}
function bindQuit() { $('#quit').onclick = () => go('#/ueben'); }

function doneScreen(title, statsHTML, again) {
  view.innerHTML = `<div class="done"><div class="big">${title}</div>${statsHTML}
    <div class="btn-row"><a class="btn" href="#/ueben">Fertig</a><button class="btn primary" id="again">Nochmal</button></div></div>`;
  $('#again').onclick = again;
}

function startSession(kind) {
  if (kind === 'karten') return flashSession();
  if (kind === 'artikel') return genderSession();
  if (kind === 'luecken') return clozeSession();
  go('#/ueben');
}

// --- flashcards (spaced repetition) ---
function schedule(w, grade) {
  const s = w.srs || { ivl: 0, ease: 2.5, reps: 0, lapses: 0, due: 0 };
  const now = Date.now();
  if (grade === 0) { s.ivl = 0; s.ease = Math.max(1.3, s.ease - 0.2); s.lapses++; s.due = now + 60000; }
  else {
    if (grade === 1) { s.ivl = Math.max(1, (s.ivl || 1) * 1.2); s.ease = Math.max(1.3, s.ease - 0.15); }
    if (grade === 2) { s.ivl = s.reps === 0 || s.ivl < 1 ? 1 : s.ivl < 3 ? 3 : s.ivl * s.ease; }
    if (grade === 3) { s.ivl = Math.max(4, (s.ivl || 1) * s.ease * 1.3); s.ease += 0.15; }
    s.due = now + s.ivl * DAY;
  }
  s.reps++;
  w.srs = s;
}
function nextLabel(w, grade) {
  const c = JSON.parse(JSON.stringify(w)); schedule(c, grade);
  const d = c.srs.ivl;
  if (grade === 0) return '1 Min';
  if (d < 1.5) return '1 Tag';
  if (d < 30) return Math.round(d) + ' Tage';
  return Math.round(d / 30) + ' Mon.';
}

function flashSession(extra) {
  const now = Date.now();
  let pool = Object.values(words).filter(w => w.snap);
  let queue = pool.filter(w => !w.srs || w.srs.due <= now).sort((a, b) => (a.srs ? a.srs.due : 0) - (b.srs ? b.srs.due : 0)).slice(0, 20);
  if (!queue.length && extra) queue = shuffle(pool.slice()).slice(0, 10);
  if (!queue.length) {
    const next = pool.filter(w => w.srs).sort((a, b) => a.srs.due - b.srs.due)[0];
    const when = next ? Math.ceil((next.srs.due - now) / DAY) : 0;
    view.innerHTML = `<div class="done"><div class="big">Alles wiederholt</div><p>Für heute ist nichts mehr fällig.${next ? ` Die nächste Karte kommt ${when <= 1 ? 'morgen' : `in ${when} Tagen`}.` : ''}</p>
      <div class="btn-row" style="margin-top:24px"><a class="btn" href="#/ueben">Zurück</a><button class="btn primary" id="extra">Trotzdem üben</button></div></div>`;
    $('#extra').onclick = () => flashSession(true);
    return;
  }
  let done = 0, right = 0;
  const show = () => {
    const w = queue[0];
    if (!w) return doneScreen('Geschafft', `<div class="stat-row"><div><b>${done}</b><span>Karten</span></div><div><b>${right}</b><span>gewusst</span></div></div>`, () => flashSession(true));
    const e = w.snap;
    const dir = prefs.dir === 'mix' ? (Math.random() < 0.5 ? 'wb' : 'bw') : prefs.dir;
    const s0 = e.senses[0] || { text: '' , n: '1' };
    const ex = e.examples.find(x => x.n === s0.n && !x.quote) || e.examples.find(x => !x.quote) || e.examples[0];
    const noun = isNoun(e);
    const front = dir === 'wb'
      ? `<div class="prompt">${noun ? 'Artikel und Bedeutung?' : 'Was bedeutet das?'}</div><div class="big">${esc(e.title)}</div>`
      : `<div class="prompt">Welches Wort ist das? · ${esc(e.pos)}, beginnt mit „${esc(e.title[0])}“</div><div class="defq">${esc(s0.text)}</div>${ex ? `<p class="ex" style="text-align:left;margin-top:14px">${esc(ex.text).replace(/⟦(.*?)⟧/g, '<span style="letter-spacing:2px">_____</span>')}</p>` : ''}`;
    view.innerHTML = sessionTop(done, done + queue.length) + `
      <div class="card flash"><div class="face">${front}</div><div class="answer" hidden>
        <div class="big">${noun ? `<span class="art ${gclass(e)}" style="font-size:22px;margin-right:6px">${esc(artOf(e))}</span>` : ''}${esc(e.title)}
          <button class="icon-btn" style="display:inline-grid;vertical-align:middle;margin-left:6px" data-speak="${esc((noun ? artOf(e).split('/')[0] + ' ' : '') + e.title)}" aria-label="Vorlesen">${ICON.speak}</button></div>
        ${formsHTML(e)}
        <ol class="senses" style="margin-top:12px">${e.senses.slice(0, 2).map(s => `<li class="sense"><span class="n">${esc(s.n)}</span><div class="def">${esc(s.text)}</div></li>`).join('')}</ol>
        ${ex ? `<p class="ex">${markEx(ex.text)}</p>` : ''}
      </div></div>
      <div class="dock"><button class="btn primary block-btn" id="flip">Antwort zeigen</button>
      <div class="rate" hidden>
        <button class="again" data-g="0">Nochmal<small>${nextLabel(w, 0)}</small></button>
        <button data-g="1">Schwer<small>${nextLabel(w, 1)}</small></button>
        <button class="good" data-g="2">Gut<small>${nextLabel(w, 2)}</small></button>
        <button data-g="3">Leicht<small>${nextLabel(w, 3)}</small></button>
      </div></div>`;
    bindQuit();
    $('#flip').onclick = () => { $('.answer').hidden = false; $('#flip').hidden = true; $('.rate').hidden = false; };
    $('[data-speak]') && ($('[data-speak]').onclick = ev => speak(ev.currentTarget.dataset.speak));
    $$('.rate button').forEach(b => b.onclick = () => {
      const g = +b.dataset.g;
      schedule(w, g); saveWords(); countPractice();
      queue.shift(); done++;
      if (g === 0) queue.push(w); else right++;
      show();
    });
  };
  show();
}

// --- der / die / das ---
const RULES = [
  [/ung$/, 'f', 'Wörter auf <b>-ung</b> sind immer feminin: <b>die</b>.'],
  [/(heit|keit)$/, 'f', 'Wörter auf <b>-heit</b> und <b>-keit</b> sind immer feminin: <b>die</b>.'],
  [/schaft$/, 'f', 'Wörter auf <b>-schaft</b> sind immer feminin: <b>die</b>.'],
  [/(tion|sion)$/, 'f', 'Wörter auf <b>-tion</b> und <b>-sion</b> sind feminin: <b>die</b>.'],
  [/tät$/, 'f', 'Wörter auf <b>-tät</b> sind feminin: <b>die</b>.'],
  [/(enz|anz)$/, 'f', 'Wörter auf <b>-enz</b> und <b>-anz</b> sind feminin: <b>die</b>.'],
  [/ie$/, 'f', 'Wörter auf <b>-ie</b> sind meist feminin: <b>die</b>.'],
  [/ik$/, 'f', 'Wörter auf <b>-ik</b> sind meist feminin: <b>die</b>.'],
  [/(chen|lein)$/, 'n', 'Verkleinerungen auf <b>-chen</b> und <b>-lein</b> sind immer neutral: <b>das</b>.'],
  [/ment$/, 'n', 'Wörter auf <b>-ment</b> sind meist neutral: <b>das</b>.'],
  [/um$/, 'n', 'Wörter auf <b>-um</b> (aus dem Lateinischen) sind meist neutral: <b>das</b>.'],
  [/nis$/, 'n', 'Wörter auf <b>-nis</b> sind meist neutral (<b>das</b>), manche feminin (<b>die</b> Kenntnis).'],
  [/ling$/, 'm', 'Wörter auf <b>-ling</b> sind maskulin: <b>der</b>.'],
  [/ismus$/, 'm', 'Wörter auf <b>-ismus</b> sind maskulin: <b>der</b>.'],
  [/(or|ist)$/, 'm', 'Wörter auf <b>-or</b> und <b>-ist</b> sind meist maskulin: <b>der</b>.'],
  [/e$/, 'f', 'Viele Wörter auf <b>-e</b> sind feminin (<b>die</b>), aber nicht alle.'],
];
function ruleFor(word) {
  const w = word.toLowerCase().split(/[\s-]/).pop();
  const r = RULES.find(([re]) => re.test(w));
  return r ? r[2] : '';
}

function genderPool() {
  const map = new Map();
  ALL_THEME.forEach(i => { if (i.g && !PLURAL_ONLY.has(i.raw) && !/\s/.test(i.lemma)) map.set(i.lemma, { word: i.lemma, g: i.g, plural: '' }); });
  Object.values(words).forEach(w => {
    const e = w.snap;
    if (e && isNoun(e) && e.genus.length === 1 && !e.pluralOnly && !/\s/.test(e.title)) map.set(e.title, { word: e.title, g: e.genus[0], plural: e.plural || '', saved: true });
  });
  return [...map.values()];
}

function genderSession() {
  const pool = genderPool();
  const weight = x => 1 + (stats.gender[x.word] || 0) * 3 + (x.saved ? 1 : 0);
  const picked = [];
  const bag = pool.slice();
  while (picked.length < Math.min(20, pool.length)) {
    const sum = bag.reduce((a, x) => a + weight(x), 0);
    let r = Math.random() * sum, i = 0;
    while (r > weight(bag[i])) { r -= weight(bag[i]); i++; }
    picked.push(bag.splice(i, 1)[0]);
  }
  let idx = 0, right = 0;
  const wrong = [];
  const show = () => {
    const x = picked[idx];
    if (!x) return doneScreen(right === picked.length ? 'Alles richtig' : 'Runde fertig',
      `<div class="stat-row"><div><b>${right}/${picked.length}</b><span>richtig</span></div></div>
       ${wrong.length ? `<p style="margin-bottom:22px">Noch einmal ansehen: ${wrong.map(w => `<span class="art ${w.g}">${ART[w.g]}</span> ${esc(w.word)}`).join(', ')}</p>` : ''}`, genderSession);
    view.innerHTML = sessionTop(idx, picked.length) + `
      <div class="gender-word"><div class="big">${esc(x.word)}</div><div class="res" aria-live="polite"></div></div>
      <div class="gender-btns">${['m', 'f', 'n'].map(g => `<button class="${g}" data-g="${g}">${ART[g]}</button>`).join('')}</div>
      <div id="after"></div>`;
    bindQuit();
    let answered = false;
    $$('.gender-btns button').forEach(b => b.onclick = () => {
      if (answered) return; answered = true;
      const ok = b.dataset.g === x.g;
      countPractice();
      $$('.gender-btns button').forEach(o => o.classList.add(o.dataset.g === x.g ? 'right' : 'wrong'));
      const rule = ruleFor(x.word);
      $('.res').innerHTML = `<span class="${ok ? 'ok' : 'bad'}">${ok ? 'Richtig' : 'Leider nicht'}:</span> <span class="art ${x.g}">${ART[x.g]}</span> ${esc(x.word)}${x.plural ? `<br><span style="color:var(--muted);font-size:14px">Plural: die ${esc(x.plural)}</span>` : ''}`;
      speak(ART[x.g] + ' ' + x.word);
      if (ok) { right++; stats.gender[x.word] = Math.max(0, (stats.gender[x.word] || 0) - 1); saveStats(); setTimeout(() => { idx++; show(); }, 900); }
      else {
        wrong.push(x); stats.gender[x.word] = (stats.gender[x.word] || 0) + 1; saveStats();
        $('#after').innerHTML = `${rule ? `<div class="rule">Tipp: ${rule}</div>` : ''}<button class="btn primary block-btn" id="next" style="margin-top:14px">Weiter</button>`;
        $('#next').onclick = () => { idx++; show(); };
      }
    });
  };
  show();
}

// --- cloze ---
function clozePool() {
  const out = [];
  Object.values(words).forEach(w => {
    const e = w.snap; if (!e) return;
    e.examples.forEach(x => {
      if (!/⟦/.test(x.text) || x.text.length > 170) return;
      const marks = [...x.text.matchAll(/⟦(.*?)⟧/g)].map(m => m[1]);
      const stem = e.title.toLowerCase().slice(0, 3);
      const target = marks.find(m => m.toLowerCase().includes(stem)) || marks.sort((a, b) => b.length - a.length)[0];
      if (!target || target.split(' ').length > 2 || /…/.test(target)) return;
      out.push({ w, e, x, target, quote: x.quote });
    });
  });
  return out;
}

function clozeSession() {
  const pool = clozePool();
  const byWord = new Map();
  shuffle(pool.slice()).sort((a, b) => a.quote - b.quote).forEach(c => { if (!byWord.has(c.e.title)) byWord.set(c.e.title, c); });
  const picked = shuffle([...byWord.values()]).slice(0, 10);
  let idx = 0, right = 0;
  const norm = s => s.toLowerCase().replace(/[.,;:!?„“"']/g, '').replace(/\s+/g, ' ').trim();
  const show = () => {
    const c = picked[idx];
    if (!c) return doneScreen('Runde fertig', `<div class="stat-row"><div><b>${right}/${picked.length}</b><span>richtig</span></div></div>`, clozeSession);
    const sense = c.e.senses.find(s => s.n === c.x.n) || c.e.senses[0] || { text: '' };
    let used = false;
    const sentence = esc(c.x.text).replace(/⟦(.*?)⟧/g, (m, inner) => {
      if (!used && inner === esc(c.target)) { used = true; return `<span class="gap">${inner}</span>`; }
      return inner;
    });
    view.innerHTML = sessionTop(idx, picked.length) + `
      <div class="cloze card">
        <div class="clue">Bedeutung: <b>${esc(sense.text)}</b><br>${esc(c.e.pos)} · ${c.target.length} Buchstaben · beginnt mit „${esc(c.target[0])}“</div>
        <p class="sentence">${sentence}</p>
        <form id="cf"><input id="ans" autocapitalize="off" autocorrect="off" autocomplete="off" spellcheck="false" enterkeyhint="done" placeholder="Wort eintippen" aria-label="Antwort"></form>
        <div class="verdict" aria-live="polite"></div>
        <div class="btn-row"><button class="btn" id="reveal" type="button">Zeigen</button><button class="btn primary" id="check" type="button">Prüfen</button></div>
      </div>`;
    bindQuit();
    const input = $('#ans');
    setTimeout(() => input.focus(), 50);
    let finished = false;
    const finish = (ok, msg) => {
      finished = true; countPractice();
      const gap = $('.gap'); gap.classList.add('shown'); if (!ok) gap.classList.add('bad');
      $('.verdict').innerHTML = msg;
      if (ok) right++;
      $('.btn-row').innerHTML = `<button class="btn primary block-btn" id="next" type="button">Weiter</button>`;
      $('#next').onclick = () => { idx++; show(); };
      $('#next').focus();
    };
    const check = () => {
      if (finished) return;
      const a = norm(input.value);
      if (!a) return input.focus();
      if (a === norm(c.target)) finish(true, `<span class="ok">Richtig!</span>`);
      else if (a === norm(c.e.title)) finish(false, `<span class="bad">Fast.</span> Das Wort stimmt, aber im Satz heißt es <b>${esc(c.target)}</b>.`);
      else finish(false, `<span class="bad">Richtig wäre:</span> <b>${esc(c.target)}</b>`);
      speak(plainEx(c.x.text));
    };
    $('#cf').onsubmit = ev => { ev.preventDefault(); finished ? (idx++, show()) : check(); };
    $('#check').onclick = check;
    $('#reveal').onclick = () => { if (!finished) finish(false, `Lösung: <b>${esc(c.target)}</b>`); };
  };
  show();
}

// ---------- boot ----------
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
window.addEventListener('online', hydrate);
route();
setTimeout(hydrate, 1500);
})();

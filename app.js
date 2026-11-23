(() => {
'use strict';

// ---------- helpers ----------
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ART = { m: 'der', f: 'die', n: 'das', p: 'die' };
const GENUS_WORD = { m: 'maskulin', f: 'feminin', n: 'neutral' };
const DAY = 86400000;
const view = $('#view');
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const today = () => new Date().toISOString().slice(0, 10);
const plainEx = t => t.replace(/[⟦⟧]/g, '');
const markEx = t => esc(t).replace(/⟦(.*?)⟧/g, '<mark>$1</mark>');
const svg = (d, cls = 'i') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
const ICON = {
  search: svg('<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>'),
  speak: svg('<path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>'),
  play: svg('<path d="M8 5.5v13l10-6.5z"/>'),
  chev: svg('<path d="m9.5 6 6 6-6 6"/>'),
  back: svg('<path d="m14.5 6-6 6 6 6"/>'),
  more: svg('<circle cx="5.5" cy="12" r="1.1"/><circle cx="12" cy="12" r="1.1"/><circle cx="18.5" cy="12" r="1.1"/>'),
  cards: svg('<rect x="3.5" y="7" width="13" height="13" rx="2"/><path d="M8 3.5h10.5a2 2 0 0 1 2 2V16"/>'),
  share: svg('<path d="M12 3.5v11M8 7.5l4-4 4 4"/><path d="M6 11v8.5h12V11"/>'),
  globe: svg('<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.6 3.5 5.4 3.5 8.5s-1 5.9-3.5 8.5c-2.5-2.6-3.5-5.4-3.5-8.5s1-5.9 3.5-8.5z"/>'),
  check: svg('<path d="m5.5 12.5 4 4 9-9"/>'),
  x: svg('<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>'),
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
    return { raw, lemma, g, hint: typeof item === 'string' ? '' : item.hint, bare: raw.replace(/^(der|die|das) /, '') };
  }),
}));
const PLURAL_ONLY = new Set(window.PLURAL_ONLY || []);
const HINTS = {};
THEMES.forEach(t => t.items.forEach(i => { if (i.hint) HINTS[i.lemma] = i.hint; }));
const ALL_THEME = THEMES.flatMap(t => t.items);

// ---------- entry helpers ----------
const isNoun = e => /Substantiv/.test(e.pos || '');
function gclass(e) {
  if (e.pluralOnly) return 'p';
  if (e.genus && e.genus.length === 1) return e.genus[0];
  return '';
}
function artOf(e) {
  if (e.pluralOnly) return 'die';
  return (e.genus || []).map(g => ART[g]).join('/');
}
function wordKey(title, e) { return title + '|' + e.pos + '|' + (e.plural || ''); }
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
const lvlDots = n => `<span class="dots" aria-label="Lernstand ${n} von 4">${[1, 2, 3, 4].map(i => `<i class="${i <= n ? 'f' : ''}"></i>`).join('')}</span>`;
function artSpan(e, extra = '') {
  if (!isNoun(e)) return '';
  const a = artOf(e);
  return a ? `<span class="art ${gclass(e)}"${extra}>${esc(a)}</span>` : '';
}
function displayWord(w) {
  const e = w.snap || { genus: w.g ? [w.g] : [], pos: w.g ? 'Substantiv' : '' };
  return artSpan(e) + esc(w.display || w.title);
}
// Ent·schei·dung, the way a printed dictionary shows syllables
function syllables(e, title) {
  if (e.hyph && e.hyph.replace(/·/g, '') === title && e.hyph.includes('·'))
    return e.hyph.split('·').map(esc).join('<span class="syl">·</span><wbr>');
  return esc(title);
}
const verbAux = (aux, part) => (aux === 'sein' ? 'ist ' : 'hat ') + part;
function gramHTML(e, short) {
  const p = [];
  if (isNoun(e)) {
    if (e.pluralOnly) p.push('<i>Substantiv, nur Plural</i>');
    else {
      const g = (e.genus || []).map(x => GENUS_WORD[x]).join(' oder ');
      p.push(`<i>Substantiv${g ? ', ' + g : ''}</i>`);
      if (e.plural) p.push(`Plural <b>die ${esc(e.plural)}</b>`);
      else p.push('kein Plural');
      if (e.genitive && !short) p.push(`Genitiv <b>${e.genus[0] === 'f' ? 'der' : 'des'} ${esc(e.genitive)}</b>`);
    }
  } else if (e.verb) {
    p.push('<i>Verb</i>');
    if (e.verb.er) p.push(`er <b>${esc(e.verb.er)}</b>`);
    if (e.verb.praet) p.push(`<b>${esc(e.verb.praet)}</b>`);
    if (e.verb.part) p.push(`<b>${esc(verbAux(e.verb.aux, e.verb.part))}</b>${e.verb.aux2 ? ` / <b>${esc(verbAux(e.verb.aux2, e.verb.part))}</b>` : ''}`);
  } else if (e.adj) {
    p.push('<i>Adjektiv</i>');
    if (e.adj.komp && e.adj.komp !== '—') p.push(`<b>${esc(e.adj.komp)}</b>`);
    if (e.adj.sup && e.adj.sup !== '—') p.push(`am <b>${esc(e.adj.sup)}</b>`);
  } else p.push(`<i>${esc(e.pos || '')}</i>`);
  return p.map(x => `<span class="g">${x}</span>`).join(' ');
}
function splitLabel(text) {
  const lm = text.match(/^([^:]{2,60}):\s+(.+)$/);
  let label = '';
  if (lm && lm[1].split(' ').length <= 5) { label = lm[1]; text = lm[2]; }
  label = label.replace(/\brefl\./g, 'reflexiv').replace(/\bintrans\./g, 'intransitiv').replace(/\btrans\./g, 'transitiv')
    .replace(/\bugs\./g, 'umgangssprachlich').replace(/\bübertr\./g, 'übertragen');
  return { label, text };
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
  $$('.tabbar a').forEach(a => { const on = a.dataset.tab === tab; a.classList.toggle('on', on); on ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current'); });
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
      <input id="q" type="text" inputmode="search" enterkeyhint="search" placeholder="Wort nachschlagen" value="${esc(value)}"
        autocapitalize="off" autocorrect="off" spellcheck="false" aria-label="Wort nachschlagen">
      <button type="button" class="clear" aria-label="Eingabe löschen" ${value ? '' : 'hidden'}>${ICON.x.replace('class="i"', 'class="i" style="width:14px;height:14px;stroke-width:2.4"')}</button>
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
    }, 200);
  });
  list.addEventListener('click', e => { const b = e.target.closest('button'); if (b) { input.blur(); go('#/suchen/' + encodeURIComponent(b.dataset.w)); } });
  form.addEventListener('submit', e => { e.preventDefault(); const v = input.value.trim(); if (v) { input.blur(); list.hidden = true; go('#/suchen/' + encodeURIComponent(v)); } });
  clear.addEventListener('click', () => { input.value = ''; clear.hidden = true; list.hidden = true; input.focus(); });
}

function wordOfDay() {
  const d = Math.floor(Date.now() / DAY);
  return ALL_THEME[(d * 7919) % ALL_THEME.length];
}

const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
const standalone = window.navigator.standalone || matchMedia('(display-mode: standalone)').matches;

function renderSearch(q) {
  view.className = q ? '' : 'home';
  if (q) {
    view.innerHTML = searchBar(q) + '<div id="result"></div>';
    bindSearch();
    return doLookup(q);
  }
  const w = wordOfDay();
  const date = new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
  const due = Object.values(words).filter(x => x.snap && (!x.srs || x.srs.due <= Date.now())).length;
  const total = Object.keys(words).length;
  const showInstall = isIOS && !standalone && !store.get('installSeen', false);
  view.innerHTML = `
    ${showInstall ? `<div class="banner" id="install">${ICON.share}<div>Als App speichern: unten auf <b>Teilen</b> tippen, dann <b>Zum Home-Bildschirm</b>.</div><button id="install-ok">OK</button></div>` : ''}
    <header class="masthead"><div class="date">${esc(date)}</div><h1>Wortschatz</h1><p>Wörterbuch Deutsch-Deutsch</p></header>
    ${searchBar('')}
    <div class="lbl">Wort des Tages</div>
    <a class="card wotd" href="#/suchen/${encodeURIComponent(w.lemma)}">
      <div class="hw">${w.g ? `<span class="art ${PLURAL_ONLY.has(w.raw) ? 'p' : w.g}">${ART[w.g]}</span>` : ''}${esc(w.bare)}</div>
      <div class="gram" id="wotd-gram">${esc(THEMES.find(t => t.items.includes(w)).name)}</div>
      <div id="wotd-body"><div class="skel w80"></div><div class="skel w60"></div></div>
      <span class="open">Eintrag öffnen ${ICON.chev.replace('class="i"', 'class="i" style="width:16px;height:16px"')}</span>
    </a>
    ${total ? `<a class="card due" href="${due ? '#/ueben/karten' : '#/ueben'}" style="margin-top:14px">
      <span class="stack">${ICON.cards}</span>
      <div><h2>${due ? `${due} ${due === 1 ? 'Wort wartet' : 'Wörter warten'} auf dich` : 'Für heute alles wiederholt'}</h2><p>${due ? 'Karteikarten jetzt üben' : `${total} Wörter in deiner Sammlung`}</p></div>
      <span class="chev">${ICON.chev}</span></a>` : ''}
    ${history.length ? `<div class="lbl">Zuletzt nachgeschlagen</div>
      <div class="index">${history.slice(0, 6).map(h => `<a class="row" href="#/suchen/${encodeURIComponent(h)}"><div class="main"><div class="w">${esc(h)}</div></div><span class="chev">${ICON.chev}</span></a>`).join('')}</div>` : ''}`;
  bindSearch();
  const ok = $('#install-ok');
  if (ok) ok.onclick = () => { store.set('installSeen', true); $('#install').remove(); };
  fillWotd(w);
}

async function fillWotd(w) {
  let r = cacheGet(w.lemma);
  if (!r) { try { r = await Wiki.lookup(w.lemma); if (r) cachePut(w.lemma, r); } catch (e) { r = null; } }
  const body = $('#wotd-body');
  if (!body) return;
  if (!r) { body.innerHTML = w.hint ? `<p class="def">${esc(w.hint)}</p>` : ''; return; }
  let e = r.entries[0];
  if (w.g) e = r.entries.find(x => isNoun(x) && x.genus.includes(w.g)) || e;
  $('#wotd-gram').innerHTML = gramHTML(e, true);
  const s = e.senses[0];
  const ex = s && examplesFor(e, s.n)[0];
  body.innerHTML = (s ? `<p class="def">${esc(splitLabel(s.text).text)}</p>` : '') + (ex && !ex.quote ? `<p class="ex">${markEx(ex.text)}</p>` : '');
}

let lookupToken = 0;
async function doLookup(q) {
  const token = ++lookupToken;
  const out = $('#result');
  out.innerHTML = `<div class="loading"><div class="spinner"></div>Schlage „${esc(q)}“ nach …</div>`;
  let r = cacheGet(q);
  if (!r) {
    try {
      r = await Wiki.lookup(q);
      if (r) cachePut(q, r);
    } catch (e) {
      const saved = Object.values(words).filter(w => w.snap && w.title.toLowerCase() === q.toLowerCase());
      if (saved.length) r = { title: saved[0].title, entries: saved.map(w => w.snap), offline: true };
      else { if (token === lookupToken) out.innerHTML = `<div class="empty"><h2>Keine Verbindung</h2><p>Ohne Internet funktionieren nur gespeicherte Wörter.</p></div>`; return; }
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
  out.innerHTML = `<div class="empty"><h2>Nicht gefunden</h2><p>„${esc(q)}“ steht nicht im Wörterbuch.</p>
    <p id="alts-l" hidden style="margin-top:18px">Meintest du vielleicht:</p><div class="chips" id="alts" style="justify-content:center;margin-top:12px"></div>
    <a class="btn" style="margin-top:24px" href="https://www.duden.de/suchen/dudenonline/${encodeURIComponent(q)}" target="_blank" rel="noopener">Im Duden suchen</a></div>`;
  const s = await Wiki.suggest(q.slice(0, Math.max(3, q.length - 2)));
  if (!$('#alts')) return;
  $('#alts').innerHTML = s.slice(0, 6).map(x => `<a class="chip" href="#/suchen/${encodeURIComponent(x)}">${esc(x)}</a>`).join('');
  $('#alts-l').hidden = !s.length;
}

function exHTML(x, hidden) {
  return `<p class="ex"${hidden ? ' hidden' : ''}>${markEx(x.text)}<button class="say" data-say="${esc(plainEx(x.text))}" aria-label="Satz vorlesen">${ICON.play}</button><a class="tr" href="https://www.deepl.com/translator#de/en/${encodeURIComponent(plainEx(x.text))}" target="_blank" rel="noopener">EN ↗</a></p>`;
}

function senseHTML(e, s) {
  const { label, text } = splitLabel(s.text);
  const exs = examplesFor(e, s.n);
  const extra = exs.slice(2, 8);
  return `<li class="sense"><span class="num">${esc(s.n)}</span>
    <div class="def">${label ? `<span class="label">${esc(label)}</span> ` : ''}${esc(text)}</div>
    <div class="exs">${exs.slice(0, 2).map(x => exHTML(x)).join('')}${extra.map(x => exHTML(x, true)).join('')}
    ${extra.length ? `<button class="more" data-more>Weitere Beispiele (${extra.length})</button>` : ''}</div>
  </li>`;
}

function entryHTML(r, e, i) {
  const title = r.title;
  const key = wordKey(title, e);
  const saved = !!words[key];
  const art = isNoun(e) ? artOf(e) : '';
  const hint = HINTS[title];
  const syn = e.syn.filter(s => s.close).concat(e.syn.filter(s => !s.close)).slice(0, 12);
  const idioms = e.idioms.slice(0, 5);
  const notes = e.notes.filter(n => !/Person|Indikativ|Konjunktiv/.test(n)).slice(0, 1);
  return `<article class="entry" data-i="${i}">
    <button class="ribbon ${saved ? 'on' : ''}" data-save="${i}" aria-label="${saved ? 'Aus Meine Wörter entfernen' : 'In Meine Wörter speichern'}" aria-pressed="${saved}"><span></span></button>
    <h1 class="headword" lang="de">${artSpan(e)}${syllables(e, title)}</h1>
    <p class="gram">${gramHTML(e)}</p>
    <div class="pron"><button class="say-btn" data-speak="${esc((art ? art.split('/')[0] + ' ' : '') + title)}">${ICON.speak} Anhören</button>${e.ipa ? `<span class="ipa">[${esc(e.ipa)}]</span>` : ''}</div>
    ${hint && i === 0 ? `<div class="usage"><small>So benutzt man es</small>${esc(hint)}</div>` : ''}
    ${notes.map(n => `<p class="note">${esc(n)}</p>`).join('')}
    <ol class="senses">${e.senses.map(s => senseHTML(e, s)).join('')}</ol>
    ${syn.length ? `<div class="lbl">Synonyme</div><div class="chips">${syn.map(s => `<a class="chip" href="#/suchen/${encodeURIComponent(s.w)}">${esc(s.w)}</a>`).join('')}</div>` : ''}
    ${i === 0 ? '<div id="ot" hidden></div>' : ''}
    ${e.ant.length ? `<div class="lbl">Gegenteil</div><div class="chips">${e.ant.slice(0, 8).map(s => `<a class="chip" href="#/suchen/${encodeURIComponent(s.w)}">${esc(s.w)}</a>`).join('')}</div>` : ''}
    ${e.combos.length ? `<div class="lbl">Typische Verbindungen</div><ul class="combo-list">${e.combos.slice(0, 8).map(c => `<li>${esc(c.text)}</li>`).join('')}</ul>` : ''}
    ${idioms.length ? `<div class="lbl">Redewendungen</div><ul class="combo-list">${idioms.map(c => `<li>${esc(c.text)}</li>`).join('')}</ul>` : ''}
    <div class="entry-foot">
      <button class="en-btn" data-en="${i}" aria-expanded="false">${ICON.globe} Notfall: Englisch</button><div class="en-slot"></div>
      <div class="links">
        <a href="https://www.duden.de/suchen/dudenonline/${encodeURIComponent(title)}" target="_blank" rel="noopener">Duden ↗</a>
        <a href="https://www.dwds.de/wb/${encodeURIComponent(title)}" target="_blank" rel="noopener">DWDS ↗</a>
        <a href="https://de.wiktionary.org/wiki/${encodeURIComponent(title)}" target="_blank" rel="noopener">Wiktionary ↗</a>
        <span class="src">Quelle: Wiktionary (CC BY-SA 4.0)${i === 0 ? ', weitere Synonyme: OpenThesaurus' : ''}${r.offline ? ' · offline gespeichert' : ''}</span>
      </div>
    </div>
  </article>`;
}

function renderResult(r) {
  return (r.formOf ? `<p class="formof"><b>${esc(r.formOf.form)}</b> ist eine Form von <b>${esc(r.title)}</b>${r.formOf.info ? ` (${esc(r.formOf.info.replace(/ des (Verbs|Substantivs|Adjektivs) .*$/, ''))})` : ''}</p>` : '')
    + (r.also ? `<p class="formof">Gemeint war vielleicht: <a href="#/suchen/${encodeURIComponent(r.also)}">${esc(r.also)}</a></p>` : '')
    + r.entries.map((e, i) => entryHTML(r, e, i)).join('');
}

function bindResult(r) {
  const out = $('#result');
  out.addEventListener('click', async ev => {
    const t = ev.target.closest('button');
    if (!t) return;
    if (t.dataset.speak !== undefined) return speak(t.dataset.speak);
    if (t.dataset.say !== undefined) return speak(t.dataset.say);
    if (t.hasAttribute('data-more')) { $$('.ex[hidden]', t.parentElement).forEach(x => x.hidden = false); t.remove(); return; }
    if (t.dataset.save !== undefined) {
      const e = r.entries[+t.dataset.save];
      const key = wordKey(r.title, e);
      if (words[key]) { delete words[key]; toast('Aus Meine Wörter entfernt'); }
      else { words[key] = { key, title: r.title, snap: snapshot(r.title, e), added: Date.now(), srs: null, hint: HINTS[r.title] || '' }; toast('In Meine Wörter gespeichert'); }
      saveWords();
      const on = !!words[key];
      t.classList.toggle('on', on);
      t.setAttribute('aria-pressed', on);
      t.setAttribute('aria-label', on ? 'Aus Meine Wörter entfernen' : 'In Meine Wörter speichern');
      return;
    }
    if (t.dataset.en !== undefined) return toggleEnglish(r, +t.dataset.en, t);
  });
  if (!r.offline) Wiki.thesaurus(r.title).then(list => {
    const have = new Set(r.entries.flatMap(e => e.syn.map(s => s.w)));
    const extra = list.filter(x => !have.has(x.w)).slice(0, 12);
    const box = $('#ot');
    if (!box || !extra.length) return;
    box.innerHTML = `<div class="lbl">Ähnliche Wörter</div><div class="chips">${extra.map(x => `<a class="chip" href="#/suchen/${encodeURIComponent(x.w)}">${esc(x.w)}${x.level ? ` <small>${esc(x.level)}</small>` : ''}</a>`).join('')}</div>`;
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
  slot.innerHTML = '<div class="en-panel"><div class="loading" style="padding:6px 0"><div class="spinner"></div></div></div>';
  if (!enCache[r.title]) enCache[r.title] = await Wiki.english(r.title);
  const gl = enCache[r.title];
  const posMatch = gl.filter(x => x.pos === e.pos);
  const show = posMatch.length ? posMatch : gl;
  const perSense = e.senses.map(s => ({ n: s.n, w: e.en.filter(x => x.n === s.n || x.n.split(/[,\s]+/).includes(s.n)).map(x => x.w) })).filter(x => x.w.length);
  slot.innerHTML = `<div class="en-panel">
    ${perSense.map(p => `<p><b>${esc(p.n)}</b> &nbsp;${esc(p.w.join(', '))}</p>`).join('')}
    ${show.length ? show.map(x => `<p class="pos">${esc(x.pos)}</p><ol>${x.glosses.slice(0, 6).map(g => `<li>${esc(g)}</li>`).join('')}</ol>`).join('') : (perSense.length ? '' : '<p>Keine englische Übersetzung gefunden.</p>')}
    <p class="fine">Die Beispielsätze haben jetzt einen Link „EN“ zu DeepL.</p>
  </div>`;
}

// ---------- my words ----------
function renderWords(filter) {
  view.className = '';
  filter = filter || 'alle';
  const all = Object.values(words);
  const now = Date.now();
  const due = w => !w.srs || w.srs.due <= now;
  const kind = w => { const p = (w.snap && w.snap.pos) || (w.g ? 'Substantiv' : ''); return /Substantiv/.test(p) ? 'nomen' : /Verb/.test(p) ? 'verben' : /Adjektiv/.test(p) ? 'adjektive' : 'andere'; };
  const groups = { alle: all, faellig: all.filter(due), nomen: all.filter(w => kind(w) === 'nomen'), verben: all.filter(w => kind(w) === 'verben'), adjektive: all.filter(w => kind(w) === 'adjektive'), andere: all.filter(w => kind(w) === 'andere') };
  const names = { alle: 'Alle', faellig: 'Fällig', nomen: 'Nomen', verben: 'Verben', adjektive: 'Adjektive', andere: 'Andere' };
  const list = (groups[filter] || all).slice().sort((a, b) => (a.display || a.title).localeCompare(b.display || b.title, 'de'));
  let lastL = '';
  const rows = [];
  let block = [];
  const flush = () => { if (block.length) rows.push(`<div class="index">${block.join('')}</div>`); block = []; };
  list.forEach(w => {
    const L = (w.display || w.title)[0].toUpperCase().replace(/[ÄÖÜ]/, c => ({ Ä: 'A', Ö: 'O', Ü: 'U' }[c]));
    if (L !== lastL) { flush(); rows.push(`<div class="letter">${esc(L)}</div>`); lastL = L; }
    const sub = w.hint || (w.snap ? splitLabel((w.snap.senses[0] || { text: '' }).text).text : 'wird geladen …');
    block.push(`<a class="row" href="#/suchen/${encodeURIComponent(w.title)}"><div class="main"><div class="w">${displayWord(w)}</div><div class="sub">${esc(sub)}</div></div>${lvlDots(level(w))}</a>`);
  });
  flush();
  view.innerHTML = `
    <div class="toolbar"><div><h1 class="page-title">Meine Wörter</h1>${all.length ? `<p class="page-sub">${all.length} ${all.length === 1 ? 'Wort' : 'Wörter'} gesammelt</p>` : ''}</div>
      <button class="round" id="menu" aria-label="Sicherung und Infos">${ICON.more}</button></div>
    ${all.length ? `<div class="seg" role="tablist">${Object.keys(names).filter(k => k === 'alle' || groups[k].length).map(k => `<button role="tab" aria-selected="${k === filter}" class="${k === filter ? 'on' : ''}" data-f="${k}">${names[k]}<span>${groups[k].length}</span></button>`).join('')}</div>` : ''}
    ${!all.length ? `<div class="empty"><h2>Noch leer</h2><p>Tippe bei einem Eintrag auf das Lesezeichen oben rechts. Oder nimm ein ganzes Thema auf einmal.</p><a class="btn primary" href="#/themen">Themen ansehen</a></div>`
      : list.length ? rows.join('') : `<div class="empty"><p>In dieser Auswahl ist gerade nichts.</p></div>`}`;
  $$('.seg button').forEach(b => b.onclick = () => go('#/woerter/' + b.dataset.f));
  $('#menu').onclick = openMenu;
}

function openMenu() {
  const n = Object.keys(words).length;
  sheet(`<h2>Sicherung</h2>
    <p>Deine Wörter und dein Lernstand liegen nur auf diesem Gerät. Speichere ab und zu eine Sicherung, zum Beispiel in der Dateien-App.</p>
    <button class="btn primary wide" id="exp">Sicherung speichern (${n} ${n === 1 ? 'Wort' : 'Wörter'})</button>
    <label class="btn wide">Sicherung laden<input type="file" id="imp" accept="application/json,.json" hidden></label>
    <h2 style="margin-top:28px">Über Wortschatz</h2>
    <p>Die Einträge kommen aus dem freien Wörterbuch Wiktionary (CC BY-SA 4.0), weitere Synonyme aus OpenThesaurus. Jeder Eintrag verlinkt zu Duden und DWDS. Englisch gibt es nur im Notfall: aus dem englischen Wiktionary, Sätze über DeepL.</p>`, (bg, close) => {
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
  view.className = '';
  const savedTitles = new Set(Object.values(words).map(w => w.title));
  view.innerHTML = `<div class="head"><h1 class="page-title">Themen</h1><p class="page-sub">Wörter, die in B2-Kursen immer wieder vorkommen.</p></div>
    <div class="tiles">${THEMES.map((t, i) => {
      const s = t.items.filter(x => savedTitles.has(x.lemma)).length;
      const sample = t.items.slice(0, 3).map(x => x.bare).join(', ');
      return `<a class="tile" href="#/themen/${t.id}"><h2>${esc(t.name)}</h2><p class="sample">${esc(sample)} …</p>
        <div class="meta">${t.items.length} Wörter${s ? ` · <b>${s} gespeichert</b>` : ''}</div></a>`;
    }).join('')}</div>`;
}

function renderTheme(id) {
  view.className = '';
  const t = THEMES.find(x => x.id === id);
  if (!t) return go('#/themen');
  const savedTitles = new Set(Object.values(words).map(w => w.title));
  const left = t.items.filter(i => !savedTitles.has(i.lemma)).length;
  view.innerHTML = `<a class="back" href="#/themen">${ICON.back.replace('class="i"', 'class="i" style="width:20px;height:20px"')}Themen</a>
    <div class="head"><h1 class="page-title">${esc(t.name)}</h1><p class="page-sub">${t.items.length} Wörter${left < t.items.length ? ` · ${t.items.length - left} gespeichert` : ''}</p></div>
    <button class="btn ${left ? 'primary' : ''} wide" id="saveall" ${left ? '' : 'disabled'}>${left ? `Alle ${left} Wörter speichern` : 'Alle gespeichert'}</button>
    <div class="index" style="margin-top:16px">${t.items.map(i => `<a class="row" href="#/suchen/${encodeURIComponent(i.lemma)}">
      <div class="main"><div class="w">${i.g ? `<span class="art ${PLURAL_ONLY.has(i.raw) ? 'p' : i.g}">${ART[i.g]}</span>` : ''}${esc(i.bare)}</div>${i.hint ? `<div class="hint">${esc(i.hint)}</div>` : ''}</div>
      ${savedTitles.has(i.lemma) ? `<span class="tick" aria-label="gespeichert">${ICON.check}</span>` : `<span class="chev">${ICON.chev}</span>`}</a>`).join('')}</div>`;
  $('#saveall').onclick = () => {
    t.items.forEach(i => {
      if (savedTitles.has(i.lemma)) return;
      const key = 'stub|' + i.lemma;
      words[key] = { key, title: i.lemma, display: i.bare, g: i.g, hint: i.hint, snap: null, added: Date.now(), srs: null };
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
    for (const w of Object.values(words).filter(w => !w.snap && !w.missing)) {
      try {
        const r = cacheGet(w.title) || await Wiki.lookup(w.title);
        if (!r) { w.missing = true; saveWords(); continue; }
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
  return {
    total: all.length,
    due: all.filter(w => w.snap && (!w.srs || w.srs.due <= now)).length,
    nouns: genderPool().length,
    cloze: clozePool().length,
  };
}

function streak() {
  let n = 0; const d = new Date();
  if (!stats.days[today()]) d.setDate(d.getDate() - 1);
  while (stats.days[d.toISOString().slice(0, 10)]) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

function renderPractice() {
  view.className = '';
  const c = practiceCounts();
  const st = streak(), td = stats.days[today()] || 0;
  view.innerHTML = `<div class="head"><h1 class="page-title">Üben</h1>
    <p class="page-sub">${td ? `Heute ${td} ${td === 1 ? 'Aufgabe' : 'Aufgaben'} geübt` : 'Heute noch nicht geübt'}${st > 1 ? ` · ${st} Tage in Folge` : ''}</p></div>
    <button class="card mode" data-go="karten" ${c.total ? '' : 'disabled'}>
      <span class="ico cards">${ICON.cards}</span><div><h2>Karteikarten</h2><p>${c.total ? `${c.due} fällig · ${c.total} Wörter` : 'Erst Wörter speichern'}</p></div><span class="chev">${ICON.chev}</span></button>
    ${c.total ? `<div class="dir">Zuerst zeigen:<div class="seg">${[['mix', 'Gemischt'], ['wb', 'Wort'], ['bw', 'Bedeutung']].map(([k, n]) => `<button class="${prefs.dir === k ? 'on' : ''}" data-dir="${k}">${n}</button>`).join('')}</div></div>` : ''}
    <button class="card mode" data-go="artikel" style="margin-top:14px">
      <span class="ico art3"><i style="background:var(--der)"></i><i style="background:var(--die)"></i><i style="background:var(--das)"></i></span>
      <div><h2>der, die oder das?</h2><p>${c.nouns} Nomen · mit Merkregeln</p></div><span class="chev">${ICON.chev}</span></button>
    <button class="card mode" data-go="luecken" ${c.cloze ? '' : 'disabled'}>
      <span class="ico gap">a_c</span><div><h2>Lückentext</h2><p>${c.cloze ? `Das passende Wort im Satz ergänzen` : 'Braucht gespeicherte Wörter'}</p></div><span class="chev">${ICON.chev}</span></button>`;
  $$('[data-go]').forEach(b => b.onclick = () => go('#/ueben/' + b.dataset.go));
  $$('[data-dir]').forEach(b => b.onclick = () => { prefs.dir = b.dataset.dir; store.set('prefs', prefs); renderPractice(); });
  hydrate();
}

function countPractice() { stats.days[today()] = (stats.days[today()] || 0) + 1; saveStats(); }

function sessionTop(i, n) {
  return `<div class="session-top"><button class="round" id="quit" aria-label="Üben beenden">${ICON.x}</button><div class="progress" role="progressbar" aria-valuenow="${i}" aria-valuemax="${n}"><i style="width:${Math.round(i / n * 100)}%"></i></div><span class="num">${Math.min(i + 1, n)} / ${n}</span></div>`;
}
function bindQuit() { $('#quit').onclick = () => go('#/ueben'); }

function doneScreen(title, statsHTML, again) {
  view.innerHTML = `<div class="done"><div class="glyph">${ICON.check.replace('class="i"', 'class="i" style="width:56px;height:56px;stroke-width:1.6"')}</div><div class="big">${title}</div>${statsHTML}
    <div class="btn-row"><a class="btn" href="#/ueben">Fertig</a><button class="btn primary" id="again">Noch eine Runde</button></div></div>`;
  $('#again').onclick = again;
}

function startSession(kind) {
  view.className = '';
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
  if (grade === 0) return 'gleich';
  if (d < 1.5) return 'morgen';
  if (d < 30) return Math.round(d) + ' Tage';
  return Math.round(d / 30) + ' Mon.';
}

function flashSession(extra) {
  const now = Date.now();
  const pool = Object.values(words).filter(w => w.snap);
  let queue = pool.filter(w => !w.srs || w.srs.due <= now).sort((a, b) => (a.srs ? a.srs.due : 0) - (b.srs ? b.srs.due : 0)).slice(0, 20);
  if (!queue.length && extra) queue = shuffle(pool.slice()).slice(0, 10);
  if (!queue.length) {
    const next = pool.filter(w => w.srs).sort((a, b) => a.srs.due - b.srs.due)[0];
    const when = next ? Math.ceil((next.srs.due - now) / DAY) : 0;
    view.innerHTML = `<div class="done"><div class="glyph">${ICON.check.replace('class="i"', 'class="i" style="width:56px;height:56px;stroke-width:1.6"')}</div><div class="big">Alles wiederholt</div><p>Für heute ist nichts mehr fällig.${next ? ` Die nächste Karte kommt ${when <= 1 ? 'morgen' : `in ${when} Tagen`}.` : ''}</p>
      <div class="btn-row" style="margin-top:26px"><a class="btn" href="#/ueben">Zurück</a><button class="btn primary" id="extra">Trotzdem üben</button></div></div>`;
    $('#extra').onclick = () => flashSession(true);
    return;
  }
  let done = 0, right = 0;
  const show = () => {
    const w = queue[0];
    if (!w) return doneScreen('Geschafft', `<div class="stat-row"><div><b>${done}</b><span>Karten</span></div><div><b>${right}</b><span>gewusst</span></div></div>`, () => flashSession(true));
    const e = w.snap;
    const dir = prefs.dir === 'mix' ? (Math.random() < 0.5 ? 'wb' : 'bw') : prefs.dir;
    const s0 = e.senses[0] || { text: '', n: '1' };
    const def0 = splitLabel(s0.text).text;
    const ex = e.examples.find(x => x.n === s0.n && !x.quote) || e.examples.find(x => !x.quote) || e.examples[0];
    const noun = isNoun(e);
    const front = dir === 'wb'
      ? `<div class="prompt">${noun ? 'Welcher Artikel? Was bedeutet es?' : 'Was bedeutet das?'}</div><div class="big">${esc(e.title)}</div>`
      : `<div class="prompt">Welches Wort ist gemeint? ${esc(e.pos)}, mit „${esc(e.title[0])}“</div><div class="defq">${esc(def0)}</div>${ex ? `<p class="ex" style="text-align:left;margin-top:16px">${esc(ex.text).replace(/⟦(.*?)⟧/g, '<span style="letter-spacing:1px;font-style:normal">______</span>')}</p>` : ''}`;
    view.innerHTML = sessionTop(done, done + queue.length) + `
      <div class="indexcard"><div class="face">${front}</div><div class="answer" hidden>
        <div class="big">${artSpan(e)}<span>${esc(e.title)}</span><button class="say-btn" data-speak="${esc((noun ? artOf(e).split('/')[0] + ' ' : '') + e.title)}" aria-label="Vorlesen">${ICON.speak}</button></div>
        <p class="gram">${gramHTML(e, true)}</p>
        <ol class="senses" style="border:0;margin-top:6px">${e.senses.slice(0, 2).map(s => `<li class="sense"><span class="num">${esc(s.n)}</span><div class="def">${esc(splitLabel(s.text).text)}</div></li>`).join('')}</ol>
        ${ex ? `<p class="ex" style="margin-top:12px">${markEx(ex.text)}</p>` : ''}
      </div></div>
      <div class="dock"><button class="btn primary wide" id="flip">Antwort zeigen</button>
      <div class="rate" hidden>
        <button class="again" data-g="0">Nochmal<small>${nextLabel(w, 0)}</small></button>
        <button data-g="1">Schwer<small>${nextLabel(w, 1)}</small></button>
        <button class="good" data-g="2">Gut<small>${nextLabel(w, 2)}</small></button>
        <button data-g="3">Leicht<small>${nextLabel(w, 3)}</small></button>
      </div></div>`;
    bindQuit();
    $('#flip').onclick = () => { $('.answer').hidden = false; $('#flip').hidden = true; $('.rate').hidden = false; };
    $('[data-speak]').onclick = ev => speak(ev.currentTarget.dataset.speak);
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
  [/ung$/, 'Wörter auf <b>-ung</b> sind immer feminin: <b>die</b>.'],
  [/(heit|keit)$/, 'Wörter auf <b>-heit</b> und <b>-keit</b> sind immer feminin: <b>die</b>.'],
  [/schaft$/, 'Wörter auf <b>-schaft</b> sind immer feminin: <b>die</b>.'],
  [/(tion|sion)$/, 'Wörter auf <b>-tion</b> und <b>-sion</b> sind feminin: <b>die</b>.'],
  [/tät$/, 'Wörter auf <b>-tät</b> sind feminin: <b>die</b>.'],
  [/(enz|anz)$/, 'Wörter auf <b>-enz</b> und <b>-anz</b> sind feminin: <b>die</b>.'],
  [/ie$/, 'Wörter auf <b>-ie</b> sind meist feminin: <b>die</b>.'],
  [/ik$/, 'Wörter auf <b>-ik</b> sind meist feminin: <b>die</b>.'],
  [/(chen|lein)$/, 'Verkleinerungen auf <b>-chen</b> und <b>-lein</b> sind immer neutral: <b>das</b>.'],
  [/ment$/, 'Wörter auf <b>-ment</b> sind meist neutral: <b>das</b>.'],
  [/um$/, 'Wörter auf <b>-um</b> (aus dem Lateinischen) sind meist neutral: <b>das</b>.'],
  [/nis$/, 'Wörter auf <b>-nis</b> sind meist neutral (<b>das</b>), manche feminin (<b>die</b> Kenntnis).'],
  [/ling$/, 'Wörter auf <b>-ling</b> sind maskulin: <b>der</b>.'],
  [/ismus$/, 'Wörter auf <b>-ismus</b> sind maskulin: <b>der</b>.'],
  [/(or|ist)$/, 'Wörter auf <b>-or</b> und <b>-ist</b> sind meist maskulin: <b>der</b>.'],
  [/e$/, 'Viele Wörter auf <b>-e</b> sind feminin (<b>die</b>), aber nicht alle.'],
];
function ruleFor(word) {
  const w = word.toLowerCase().split(/[\s-]/).pop();
  const r = RULES.find(([re]) => re.test(w));
  return r ? r[1] : '';
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
    if (location.hash !== '#/ueben/artikel') return;
    const x = picked[idx];
    if (!x) return doneScreen(right === picked.length ? 'Alles richtig' : 'Runde geschafft',
      `<div class="stat-row"><div><b>${right} / ${picked.length}</b><span>richtig</span></div></div>
       ${wrong.length ? `<p style="margin-bottom:24px">Noch einmal ansehen: ${wrong.map(w => `<span class="art ${w.g}">${ART[w.g]}</span> ${esc(w.word)}`).join(', ')}</p>` : ''}`, genderSession);
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
      $('.res').innerHTML = `<span class="${ok ? 'ok' : 'bad'}">${ok ? 'Richtig' : 'Leider nicht'}:</span> <span class="art ${x.g}">${ART[x.g]}</span> ${esc(x.word)}${x.plural ? `<br><span class="pl">Plural: die ${esc(x.plural)}</span>` : ''}`;
      speak(ART[x.g] + ' ' + x.word);
      if (ok) { right++; stats.gender[x.word] = Math.max(0, (stats.gender[x.word] || 0) - 1); saveStats(); setTimeout(() => { idx++; show(); }, 900); }
      else {
        wrong.push(x); stats.gender[x.word] = (stats.gender[x.word] || 0) + 1; saveStats();
        $('#after').innerHTML = `${rule ? `<div class="rule">Merkregel: ${rule}</div>` : ''}<button class="btn primary wide" id="next" style="margin-top:16px">Weiter</button>`;
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
      out.push({ w, e, x, target, quote: x.quote || x.old });
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
    if (location.hash !== '#/ueben/luecken') return;
    const c = picked[idx];
    if (!c) return doneScreen('Runde geschafft', `<div class="stat-row"><div><b>${right} / ${picked.length}</b><span>richtig</span></div></div>`, clozeSession);
    const sense = c.e.senses.find(s => s.n === c.x.n) || c.e.senses[0] || { text: '' };
    let used = false;
    const sentence = esc(c.x.text).replace(/⟦(.*?)⟧/g, (m, inner) => {
      if (!used && inner === esc(c.target)) { used = true; return `<span class="gap">${inner}</span>`; }
      return inner;
    });
    view.innerHTML = sessionTop(idx, picked.length) + `
      <div class="cloze card">
        <div class="clue">Gesucht: <b>${esc(splitLabel(sense.text).text)}</b><span class="hintline">${esc(c.e.pos)} · ${c.target.length} Buchstaben · beginnt mit „${esc(c.target[0])}“</span></div>
        <p class="sentence">${sentence}</p>
        <form id="cf"><input id="ans" autocapitalize="off" autocorrect="off" autocomplete="off" spellcheck="false" enterkeyhint="done" placeholder="Wort eintippen" aria-label="Antwort"></form>
        <div class="verdict" aria-live="polite"></div>
        <div class="btn-row"><button class="btn" id="reveal" type="button">Lösung</button><button class="btn primary" id="check" type="button">Prüfen</button></div>
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
      $('.btn-row').innerHTML = `<button class="btn primary wide" id="next" type="button">Weiter</button>`;
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

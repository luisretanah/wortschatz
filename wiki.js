// Wiktionary reader: fetches German Wiktionary wikitext and turns it into
// learner entries (gender, plural, forms, meanings with their examples,
// synonyms, opposites, word combinations, English equivalents).
// Runs in the browser and in Node (tools/test_wiki.mjs).
(function (root) {
  const DE_API = 'https://de.wiktionary.org/w/api.php';
  const EN_API = 'https://en.wiktionary.org/w/api.php';
  const OT_API = 'https://www.openthesaurus.de/synonyme/search';

  async function getJSON(url) {
    // Wikimedia asks for an identifying header; OpenThesaurus rejects the preflight a custom header causes.
    const h = /wiktionary\.org/.test(url) ? { 'Api-User-Agent': 'Wortschatz/1.0 (personal B2 learning app)' } : {};
    if (typeof window === 'undefined') h['User-Agent'] = 'Wortschatz/1.0 (personal B2 learning app)';
    const r = await fetch(url, { headers: h });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }

  async function wikitext(api, title) {
    const u = api + '?action=parse&prop=wikitext&format=json&formatversion=2&redirects=1&origin=*&page=' + encodeURIComponent(title);
    const d = await getJSON(u);
    if (d.error) return null;
    return { title: d.parse.title, text: d.parse.wikitext };
  }

  // ---------- text cleaning ----------
  const LABELS = {
    'ugs.': 'umgangssprachlich', 'geh.': 'gehoben', 'übertr.': 'übertragen', 'fachspr.': 'fachsprachlich',
    'scherzh.': 'scherzhaft', 'abw.': 'abwertend', 'österr.': 'österreichisch', 'schweiz.': 'schweizerisch',
    'südd.': 'süddeutsch', 'norddt.': 'norddeutsch', 'reg.': 'regional', 'va.': 'veraltet', 'veraltend': 'veraltend',
    'Pl.': 'Plural', 'Sg.': 'Singular', 'kPl.': 'kein Plural', 'trans.': 'transitiv', 'intrans.': 'intransitiv',
    'refl.': 'reflexiv', 'Akk.': 'Akkusativ', 'Dat.': 'Dativ', 'Gen.': 'Genitiv', 'Nom.': 'Nominativ',
    'Part.': 'Partizip II', 'Prät.': 'Präteritum', 'Komp.': 'Komparativ', 'Sup.': 'Superlativ',
    'bildungsspr.': 'bildungssprachlich', 'salopp': 'salopp', 'derb': 'derb', 'vulg.': 'vulgär',
    'Amtsspr.': 'Amtssprache', 'jugendspr.': 'Jugendsprache', 'ironisch': 'ironisch', 'selten': 'selten',
    'meist': 'meist', 'oft': 'oft', 'speziell': 'speziell', 'allg.': 'allgemein', 'besonders': 'besonders',
    'Pl.1': 'Plural 1', 'Pl.2': 'Plural 2', 'Pl.3': 'Plural 3', 'Lit.': 'Literatur', 'kurz für': 'kurz für',
    'm': 'männlich', 'f': 'weiblich', 'n': 'sächlich', 'mf': 'männlich/weiblich',
  };

  function expandTemplate(inner) {
    const parts = inner.split('|');
    const name = parts[0].trim();
    const pos = parts.slice(1).filter(p => !/^\s*[\wäöüÄÖÜ ]+\s*=/.test(p)).map(p => p.trim()).filter(Boolean);
    switch (name) {
      case 'K': return pos.length ? pos.join(', ') + ':' : '';
      case 'WP': case 'L': case 'w': return pos[1] || pos[0] || '';
      case 'Ü': case 'Üt': return pos[1] || '';
      case 'Lautschrift': return pos[0] || '';
      case 'IPA': case 'Hörbeispiele': case 'Audio': case 'Reime': case 'Reim': return '';
      case 'Gen.': case 'Dat.': case 'Akk.': case 'Nom.': return LABELS[name];
    }
    if (pos.length === 0) {
      if (name in LABELS) return LABELS[name];
      if (/^(Ref-|Lit-|Per-|Literatur|Internetquelle|Wikipedia|Beispiele fehlen|Bedeutungen fehlen|QS|Ähnlichkeiten|Sprache|Wortart|Siehe)/.test(name)) return '';
      if (/\.$/.test(name) && name.length < 20) return name;
      return '';
    }
    return '';
  }

  // mark: 'keep' turns ''x'' into ⟦x⟧ (the form in an example), otherwise drops quotes
  function clean(s, mark) {
    if (!s) return '';
    s = s.replace(/<ref[^>]*\/>/g, '').replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, '');
    s = s.replace(/<!--[\s\S]*?-->/g, '');
    let prev;
    do { prev = s; s = s.replace(/\{\{([^{}]*)\}\}/g, (_, inner) => expandTemplate(inner)); } while (s !== prev);
    s = s.replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1');
    s = s.replace(/\[https?:\/\/\S+\s+([^\]]+)\]/g, '$1').replace(/\[https?:\/\/\S+\]/g, '');
    s = s.replace(/'''/g, '');
    s = mark === 'keep' ? s.replace(/''(.+?)''/g, '⟦$1⟧') : s.replace(/''/g, '');
    s = s.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
    s = s.replace(/⟦([^⟧]*?)([.,;:!?]+)⟧/g, '⟦$1⟧$2');      // keep punctuation out of the gap
    return s.replace(/\s+/g, ' ').replace(/\s+([,.;:!?])/g, '$1').trim();
  }

  function linksOf(line) {
    const out = [];
    line.replace(/\[\[(?:([^\]|]*)\|)?([^\]]*)\]\]/g, (_, a, b) => { out.push((b || a).trim()); });
    return out.filter(w => w && !/^(Datei|Bild|File):/.test(w));
  }

  // ---------- German page ----------
  const BLOCKS = new Set(['Bedeutungen', 'Beispiele', 'Synonyme', 'Sinnverwandte Wörter', 'Gegenwörter',
    'Typische Wortkombinationen', 'Redewendungen', 'Worttrennung', 'Aussprache', 'Grammatische Merkmale',
    'Anmerkung', 'Herkunft', 'Übersetzungen', 'Oberbegriffe', 'Unterbegriffe', 'Wortbildungen', 'Abkürzungen',
    'Charakteristische Wortkombinationen', 'Sprichwörter', 'Verkleinerungsformen', 'Weibliche Wortformen',
    'Männliche Wortformen', 'Referenzen', 'Quellen', 'Nicht mehr gültige Schreibweisen', 'Alternative Schreibweisen',
    'Nebenformen', 'Varianten', 'Entlehnungen', 'Gegenwörter', 'Kurzformen', 'Bekannte Namensträger',
    'Namensvarianten', 'Wortfamilie', 'Koseformen']);

  function germanSections(text) {
    const out = [];
    const re = /^== *([^=\n]+?) *\(\{\{Sprache\|Deutsch\}\}\) *==\s*$/gm;
    let m;
    while ((m = re.exec(text))) {
      const start = m.index + m[0].length;
      const rest = text.slice(start);
      const end = rest.search(/^== [^=]/m);
      out.push(end === -1 ? rest : rest.slice(0, end));
    }
    return out;
  }

  function parseOverview(block) {
    const p = {};
    block.split('\n|').slice(1).forEach(line => {
      const i = line.indexOf('=');
      if (i > 0) p[line.slice(0, i).trim()] = line.slice(i + 1).replace(/\}\}\s*$/, '').trim();
    });
    return p;
  }

  function senseNums(tag) {
    // "1", "1, 2", "1–3", "1a", "2b" → ['1','2',...]
    const out = [];
    tag.split(/[,;]/).forEach(t => {
      t = t.trim();
      const r = t.match(/^(\d+)\s*[–-]\s*(\d+)$/);
      if (r) for (let i = +r[1]; i <= +r[2]; i++) out.push(String(i));
      else if (t) out.push(t);
    });
    return out;
  }

  const GENUS = { m: 'm', f: 'f', n: 'n' };

  function parseEntry(chunk) {
    const head = chunk.match(/^=== *(.+?) *===\s*$/m);
    if (!head) return null;
    const h = head[1];
    const posM = h.match(/\{\{Wortart\|([^|}]+)\|Deutsch\}\}/);
    if (!posM) return null;
    const e = { pos: posM[1], genus: [], senses: [], examples: [], syn: [], ant: [], combos: [], idioms: [], en: [], notes: [] };
    (h.match(/\{\{(m|f|n)\}\}/g) || []).forEach(g => { const k = g.slice(2, -2); if (!e.genus.includes(k)) e.genus.push(k); });

    const ov = chunk.match(/\{\{Deutsch (Substantiv|Verb|Adjektiv|Adverb|Pronomen|Toponym|Nachname|Vorname)[^\n]*Übersicht[\s\S]*?\n\}\}/);
    if (ov) {
      const p = parseOverview(ov[0]);
      ['Genus', 'Genus 1', 'Genus 2', 'Genus 3'].forEach(k => { const g = (p[k] || '').trim(); if (GENUS[g] && !e.genus.includes(g)) e.genus.push(g); });
      const pl = p['Nominativ Plural'] || p['Nominativ Plural 1'] || '';
      if (pl && pl !== '—' && pl !== '-') e.plural = clean(pl);
      if (p['Nominativ Singular'] === '—' || p['Nominativ Singular'] === '-' || /Pluraletantum|Pl\.tant/.test(h)) e.pluralOnly = true;
      if (p['Genitiv Singular'] && p['Genitiv Singular'] !== '—') e.genitive = clean(p['Genitiv Singular'].split('<br')[0]);
      if (p['Präsens_er, sie, es']) {
        e.verb = {
          er: clean(p['Präsens_er, sie, es']),
          praet: clean(p['Präteritum_ich'] || ''),
          part: clean(p['Partizip II'] || ''),
          aux: clean(p['Hilfsverb'] || ''),
          aux2: clean(p['Hilfsverb2'] || ''),
        };
      }
      if (p['Komparativ'] || p['Superlativ']) {
        e.adj = { komp: clean(p['Komparativ'] || ''), sup: clean(p['Superlativ'] || '') };
      }
    }

    // blocks
    let cur = null;
    const lines = chunk.split('\n');
    let inUeTab = false;
    let groupLabel = '';
    let ueNum = null;
    for (const raw of lines) {
      const line = raw.trimEnd();
      const bm = line.match(/^(?:=+ *)?\{\{([^|{}]+)\}\}(?: *=+)?\s*$/);
      if (bm && BLOCKS.has(bm[1].trim())) { cur = bm[1].trim(); continue; }
      if (/^==== *Übersetzungen *====/.test(line)) { cur = 'Übersetzungen'; continue; }
      if (cur === 'Übersetzungen') {
        const t = line.match(/\{\{Ü-Tabelle\|([^|]*)\|/);
        if (t) { ueNum = t[1].trim(); inUeTab = true; }
        const enl = line.match(/^\*\{\{en\}\}:\s*(.*)$/);
        if (enl) parseEn(enl[1], ueNum, e.en);
        continue;
      }
      if (!line.startsWith(':') && !line.startsWith('*')) continue;
      const lm = line.match(/^[:*]+\s*(?:\[([^\]]+)\])?\s*(.*)$/);
      if (!lm) continue;
      const tag = lm[1] || '', body = lm[2] || '';
      switch (cur) {
        case 'Worttrennung': if (!e.hyph) e.hyph = clean(body).split(',').map(x => x.trim()).find(x => x && !/\.$/.test(x) && !/^(Plural|Singular|kein)/.test(x)) || ''; break;
        case 'Aussprache': {
          const ipa = body.match(/\{\{Lautschrift\|([^}|]+)\}\}/);
          if (ipa && !e.ipa) e.ipa = ipa[1];
          break;
        }
        case 'Bedeutungen': {
          const txt = clean(body);
          if (!txt) break;
          if (!tag && /:$/.test(txt) && txt.length < 60) { groupLabel = txt.replace(/:$/, ''); break; }
          if (!tag && e.senses.length) { e.senses[e.senses.length - 1].text += ' ' + txt; break; }
          const prefixed = groupLabel && !txt.startsWith(groupLabel) ? groupLabel + ': ' + txt : txt;
          e.senses.push({ n: tag || String(e.senses.length + 1), text: prefixed });
          break;
        }
        case 'Beispiele': {
          const txt = clean(body, 'keep');
          if (txt && txt.length > 2 && !/^Beispiele fehlen/.test(txt)) {
            const quote = /^„/.test(txt) || /“\s*(\(\d{4}\))?$/.test(txt);
            let t = quote ? txt.replace(/^„/, '').replace(/“\s*(\(\d{4}\))?$/, '').replace(/“$/, '') : txt;
            // old spelling or old sources go last: a B2 learner needs today's German first
            const yr = (txt.match(/\((1[5-9]\d\d)\)/) || [])[1];
            const old = /\b(daß|muß|mußte|wußte|läßt|Thür|seyn)\b/.test(t) || (yr && +yr < 1990);
            e.examples.push({ n: senseNums(tag)[0] || '', text: t, quote: quote || !!old, old: !!old });
          }
          break;
        }
        case 'Synonyme': case 'Sinnverwandte Wörter':
          linksOf(body).forEach(w => { if (!e.syn.some(s => s.w === w)) e.syn.push({ w, n: tag, close: cur === 'Synonyme' }); });
          break;
        case 'Gegenwörter':
          linksOf(body).forEach(w => { if (!e.ant.some(s => s.w === w)) e.ant.push({ w, n: tag }); });
          break;
        case 'Typische Wortkombinationen': case 'Charakteristische Wortkombinationen': {
          const txt = clean(body);
          txt.split(/[,;]\s+/).map(x => x.trim()).filter(x => x && x.length < 60 && /\s/.test(x)).forEach(x => e.combos.push({ text: x, n: tag }));
          break;
        }
        case 'Redewendungen': case 'Sprichwörter': {
          const txt = clean(body);
          if (txt) e.idioms.push({ text: txt, n: tag });
          break;
        }
        case 'Grammatische Merkmale': {
          const txt = clean(body);
          if (txt) e.notes.push(txt);
          break;
        }
        case 'Anmerkung': {
          const txt = clean(body);
          if (txt && txt.length < 240 && e.notes.length < 2) e.notes.push(txt);
          break;
        }
      }
    }
    const gf = chunk.match(/\{\{Grundformverweis[^|}]*\|([^|}]+)/);
    if (gf) e.baseForm = gf[1].trim();
    return e;
  }

  function parseEn(text, tableNum, out) {
    // "[1] {{Ü|en|decision}}; [2] {{Ü|en|ruling}}" or "{{Ü|en|decision}}"
    const parts = text.split(/(?=\[[^\]]+\])/);
    parts.forEach(p => {
      const nm = p.match(/^\[([^\]]+)\]/);
      const n = nm ? nm[1] : (tableNum || '');
      const words = [];
      p.replace(/\{\{Üt?\|en\|([^}|]+)/g, (_, w) => { words.push(w.trim()); });
      words.forEach(w => { if (!out.some(o => o.w === w)) out.push({ w, n }); });
    });
  }

  function parseGerman(text) {
    const entries = [];
    germanSections(text).forEach(sec => {
      const chunks = sec.split(/\n(?==== )/);
      chunks.forEach(c => { const e = parseEntry(c.trim()); if (e) entries.push(e); });
    });
    return entries;
  }

  const FORM_POS = /Konjugierte Form|Deklinierte Form|Komparativ|Superlativ|Partizip|Erweiterter Infinitiv/;

  function variants(q) {
    const out = [q];
    const cap = q.charAt(0).toUpperCase() + q.slice(1);
    const low = q.charAt(0).toLowerCase() + q.slice(1);
    [cap, low].forEach(v => { if (!out.includes(v)) out.push(v); });
    return out;
  }

  async function lookup(query) {
    let q = (query || '').trim().replace(/\s+/g, ' ');
    if (!q) return null;
    // "sich entscheiden" → "entscheiden", "der Tisch" → "Tisch"
    q = q.replace(/^(sich|der|die|das)\s+(?=\S)/i, '');
    for (const v of variants(q)) {
      const page = await wikitext(DE_API, v);
      if (!page) continue;
      const entries = parseGerman(page.text);
      if (!entries.length) continue;
      const real = entries.filter(e => !FORM_POS.test(e.pos));
      if (!real.length) {
        const base = entries.find(e => e.baseForm);
        if (base && base.baseForm !== page.title) {
          const res = await lookup(base.baseForm);
          if (res) {
            res.formOf = { form: page.title, info: entries.find(e => e.notes.length)?.notes[0] || '' };
            const other = variants(page.title).find(x => x !== page.title);
            if (other && await exists(other)) res.also = other;
            return res;
          }
        }
      }
      const list = real.length ? real : entries;
      list.forEach(e => { e.syn = e.syn.filter(x => x.w !== page.title); e.ant = e.ant.filter(x => x.w !== page.title); });
      return { title: page.title, entries: list };
    }
    return null;
  }

  async function exists(title) {
    try {
      const d = await getJSON(DE_API + '?action=query&format=json&formatversion=2&origin=*&titles=' + encodeURIComponent(title));
      return !!(d.query && d.query.pages && d.query.pages[0] && !d.query.pages[0].missing);
    } catch (e) { return false; }
  }

  async function suggest(prefix) {
    if (!prefix || prefix.length < 2) return [];
    const u = DE_API + '?action=opensearch&namespace=0&limit=8&format=json&origin=*&search=' + encodeURIComponent(prefix);
    try { const d = await getJSON(u); return (d[1] || []).filter(t => !/[:/]/.test(t)); } catch (e) { return []; }
  }

  async function thesaurus(word) {
    try {
      const d = await getJSON(OT_API + '?format=application/json&q=' + encodeURIComponent(word));
      const out = [];
      (d.synsets || []).forEach(s => s.terms.forEach(t => {
        if (t.term !== word && !out.some(o => o.w === t.term) && t.term.split(' ').length <= 3)
          out.push({ w: t.term.replace(/\s*\(.*?\)\s*/g, ' ').trim(), level: t.level || '' });
      }));
      return out.filter(o => o.w && o.w !== word);
    } catch (e) { return []; }
  }

  // ---------- English Wiktionary (the emergency button) ----------
  const EN_POS = { Noun: 'Substantiv', Verb: 'Verb', Adjective: 'Adjektiv', Adverb: 'Adverb', Preposition: 'Präposition',
    Conjunction: 'Konjunktion', Pronoun: 'Pronomen', Interjection: 'Interjektion', 'Proper noun': 'Eigenname', Particle: 'Partikel' };

  function cleanEn(s) {
    s = s.replace(/<ref[^>]*\/>/g, '').replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, '');
    let prev;
    do {
      prev = s;
      s = s.replace(/\{\{([^{}]*)\}\}/g, (_, inner) => {
        const parts = inner.split('|');
        const name = parts[0].trim();
        const pos = parts.slice(1).filter(p => !/^\s*\w+\s*=/.test(p)).map(p => p.trim());
        switch (name) {
          case 'lb': case 'lbl': case 'label': { const l = pos.slice(1).filter(x => x && x !== '_').join(', '); return l ? '(' + l + ')' : ''; }
          case 'l': case 'll': case 'm': case 'link': return pos[1] || '';
          case 'gloss': case 'gl': case 'q': case 'qual': case 'qualifier': case 'i': return pos[0] ? '(' + pos[0] + ')' : '';
          case 'w': return pos[1] || pos[0] || '';
          case 'non-gloss definition': case 'non-gloss': case 'n-g': case 'ngd': return pos[0] || '';
          case 'taxlink': return pos[0] || '';
          case 'vern': return pos[0] || '';
          case 'inflection of': case 'infl of': return 'form of ' + (pos[1] || '');
          case 'past participle of': return 'past participle of ' + (pos[1] || '');
          case 'plural of': return 'plural of ' + (pos[1] || '');
          case 'alternative form of': case 'alt form': return 'alternative form of ' + (pos[1] || '');
          case 'abbreviation of': return 'abbreviation of ' + (pos[1] || '');
          default: return '';
        }
      });
    } while (s !== prev);
    s = s.replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1').replace(/'''?/g, '').replace(/<[^>]+>/g, '');
    return s.replace(/\(\s*\)/g, '').replace(/\s+/g, ' ').replace(/\s+([,.;:])/g, '$1').trim();
  }

  async function english(title) {
    try {
      const page = await wikitext(EN_API, title);
      if (!page) return [];
      const m = page.text.match(/^==German==\s*$([\s\S]*?)(?=^==[^=]|\s*$(?![\s\S]))/m);
      if (!m) return [];
      const out = [];
      let pos = null;
      m[1].split('\n').forEach(line => {
        const h = line.match(/^={3,5}\s*([^=]+?)\s*={3,5}\s*$/);
        if (h) { pos = EN_POS[h[1]] || null; if (pos) out.push({ pos, glosses: [] }); return; }
        if (pos && /^#(?![:*#])\s*/.test(line)) {
          const g = cleanEn(line.replace(/^#\s*/, ''));
          if (g) out[out.length - 1].glosses.push(g);
        }
      });
      return out.filter(o => o.glosses.length);
    } catch (e) { return []; }
  }

  const api = { lookup, suggest, thesaurus, english, parseGerman, clean };
  if (typeof module !== 'undefined') module.exports = api; else root.Wiki = api;
})(typeof window !== 'undefined' ? window : globalThis);

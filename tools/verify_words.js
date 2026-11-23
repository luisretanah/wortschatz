// Checks every word in words.js against German Wiktionary: the page exists and
// the article we print matches Wiktionary's gender. Exit 1 on any problem.
global.window = {}; require('../words.js'); const THEMES = window.THEMES; const PLURAL_ONLY = window.PLURAL_ONLY || []; delete global.window;
const W = require('../wiki.js');
const ART = { der: 'm', die: 'f', das: 'n' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
// ONLY="a,b,c" rechecks just those entries (as written in words.js)
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null;
const DELAY = +(process.env.DELAY || 900);
(async () => {
  const seen = new Set(), problems = [], plurals = [];
  for (const t of THEMES) for (const item of t.words) {
    const raw = typeof item === 'string' ? item : item.w;
    if (seen.has(raw) || (ONLY && !ONLY.has(raw))) continue; seen.add(raw);
    const m = raw.match(/^(der|die|das) (.+)$/);
    const lemma = m ? m[2] : raw.replace(/^sich /, '');
    let r = null;
    for (let i = 0; i < 4 && !r; i++) { try { r = await W.lookup(lemma) || 'missing'; } catch (e) { await sleep(8000 * (i + 1)); } }
    if (!r) { problems.push(`${t.id}: ${raw} -> network error (rate limit?), not checked`); continue; }
    if (r === 'missing') { problems.push(`${t.id}: ${raw} -> not in Wiktionary`); continue; }
    if (r.formOf) problems.push(`${t.id}: ${raw} -> only a form of ${r.title}`);
    if (m) {
      const nouns = r.entries.filter(e => /Substantiv/.test(e.pos));
      const genders = new Set(nouns.flatMap(e => e.genus));
      if (!genders.has(ART[m[1]]) && !PLURAL_ONLY.includes(raw)) problems.push(`${t.id}: ${raw} -> Wiktionary says ${[...genders].join('/') || 'no noun'}`);
      if (nouns.length && nouns.every(e => e.pluralOnly)) plurals.push(raw);
    }
    await sleep(DELAY);
  }
  console.log('checked', seen.size, 'words');
  console.log('plural-only:', JSON.stringify(plurals));
  console.log(problems.length ? 'PROBLEMS:\n' + problems.join('\n') : 'all genders match');
  process.exit(problems.length ? 1 : 0);
})();

// Checks every word in words.js against German Wiktionary: the page exists and
// the article we print matches Wiktionary's gender. Exit 1 on any problem.
global.window = {}; require('../words.js'); const THEMES = window.THEMES; delete global.window;
const W = require('../wiki.js');
const ART = { der: 'm', die: 'f', das: 'n' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const seen = new Set(), problems = [], plurals = [];
  for (const t of THEMES) for (const item of t.words) {
    const raw = typeof item === 'string' ? item : item.w;
    if (seen.has(raw)) continue; seen.add(raw);
    const m = raw.match(/^(der|die|das) (.+)$/);
    const lemma = m ? m[2] : raw.replace(/^sich /, '');
    let r = null;
    for (let i = 0; i < 3 && !r; i++) { try { r = await W.lookup(lemma) || 'missing'; } catch (e) { await sleep(5000); } }
    if (r === 'missing' || !r) { problems.push(`${t.id}: ${raw} -> not found`); continue; }
    if (r.formOf) problems.push(`${t.id}: ${raw} -> only a form of ${r.title}`);
    if (m) {
      const nouns = r.entries.filter(e => /Substantiv/.test(e.pos));
      const genders = new Set(nouns.flatMap(e => e.genus));
      if (!genders.has(ART[m[1]])) problems.push(`${t.id}: ${raw} -> Wiktionary says ${[...genders].join('/') || 'no noun'}`);
      if (nouns.length && nouns.every(e => e.pluralOnly)) plurals.push(raw);
    }
    await sleep(900);
  }
  console.log('checked', seen.size, 'words');
  console.log('plural-only:', JSON.stringify(plurals));
  console.log(problems.length ? 'PROBLEMS:\n' + problems.join('\n') : 'all genders match');
  process.exit(problems.length ? 1 : 0);
})();

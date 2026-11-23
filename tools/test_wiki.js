const W = require('../wiki.js');
(async () => {
  for (const q of process.argv.slice(2)) {
    const r = await W.lookup(q);
    if (!r) { console.log(q, '=> NOT FOUND'); continue; }
    console.log('\n#####', q, '=>', r.title, r.formOf ? JSON.stringify(r.formOf) : '');
    r.entries.forEach(e => {
      console.log('--', e.pos, e.genus.join('/'), 'Pl:', e.plural, e.pluralOnly ? '(Pl.tant)' : '', 'Gen:', e.genitive, 'hyph:', e.hyph, 'ipa:', e.ipa);
      if (e.verb) console.log('   verb', JSON.stringify(e.verb));
      if (e.adj) console.log('   adj', JSON.stringify(e.adj));
      e.senses.slice(0, 4).forEach(s => console.log('   [' + s.n + ']', s.text));
      e.examples.slice(0, 4).forEach(x => console.log('   ex[' + x.n + ']', x.quote ? 'Q' : '', x.text.slice(0, 120)));
      console.log('   syn', e.syn.slice(0, 8).map(s => s.w).join(', '), '| ant', e.ant.map(s => s.w).join(', '));
      console.log('   combos', e.combos.slice(0, 6).map(c => c.text).join(' / '));
      console.log('   en', e.en.slice(0, 6).map(x => x.n + ':' + x.w).join(', '), '| notes', e.notes.join(' // '));
    });
  }
  const en = await W.english('entscheiden'); console.log('\nEN entscheiden', JSON.stringify(en).slice(0, 400));
  const ot = await W.thesaurus('Entscheidung'); console.log('OT', ot.slice(0, 10).map(o => o.w + (o.level ? '(' + o.level + ')' : '')).join(', '));
})();

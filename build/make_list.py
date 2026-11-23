"""Top-N learner word list: subtitle frequencies (FrequencyWords, CC BY-SA 4.0)
mapped onto German Wiktionary base words (Kaikki/Wiktextract extract, CC BY-SA 4.0).

Usage: python3 -I make_list.py 5000  ->  top_words.json
Each item: word, pos, art, freq rank, Wiktionary senses (to ground the simple explanation).
"""
import json, sys, collections, os, re
HERE = os.path.dirname(os.path.abspath(__file__))
N = int(sys.argv[1]) if len(sys.argv) > 1 else 5000

# Word classes a learner looks up. Names, articles, pronouns, numbers, abbreviations are skipped.
KEEP = {'noun', 'verb', 'adj', 'adv', 'prep', 'conj', 'intj', 'particle', 'postp', 'phrase', 'prep_phrase'}

raw = json.load(open(os.path.join(HERE, 'gpt_wiktionary.json')))
pos_count = collections.Counter(w['pos'] for w in raw)
print('word classes in source:', pos_count.most_common(25))

# Only real inflected forms count (the inflection table plus the headword). Wiktionary's
# alternative forms include abbreviations and language codes ("so" -> Südosten, "war" -> Waray).
STRIP = ('der ', 'die ', 'das ', 'den ', 'dem ', 'des ', 'ein ', 'eine ', 'ich ', 'du ', 'er ', 'sie ', 'es ', 'wir ', 'ihr ',
         'hat ', 'ist ', 'habe ', 'bin ', 'am ', 'zu ', 'er/sie/es ')
def forms_of(w):
    out = {w['word'].lower()}
    for f in w.get('core', []):
        t = f['f'].lower().strip()
        for p in STRIP:
            if t.startswith(p):
                t = t[len(p):]
        if t and ' ' not in t:
            out.add(t)
    return out

OLD = re.compile(r'veralt|archaic|obsolete|outdated|literary|dialect|landschaftlich|historisch', re.I)
skip_heads = {w['word'].lower() for w in raw if w['pos'] in ('pron', 'det', 'num', 'article') or w['word'].lower() in ('ja', 'nein', 'okay', 'ok', 'ein', 'eine', 'einen', 'einem', 'einer', 'eines', 'kein', 'keine', 'keinen', 'keinem', 'keiner', 'small', 'oh', 'hey', 'okay')}
by_form = collections.defaultdict(list)
for i, w in enumerate(raw):
    if w['pos'] not in KEEP or not w['senses'] or w['word'].isupper() or len(w['word']) < 2 or ' ' in w['word']:
        continue
    # old words ("dingen" = hire) would steal frequent modern forms ("Dingen")
    if OLD.search(' '.join(w['senses'][0].get('tags') or [])):
        continue
    for f in forms_of(w):
        by_form[f].append(i)

score = collections.Counter()
for line in open(os.path.join(HERE, 'de_50k.txt'), encoding='utf-8'):
    form, n = line.rsplit(' ', 1)
    f = form.lower()
    if f in skip_heads:
        continue
    ids = by_form.get(f, [])
    if not ids:
        continue
    exact = [i for i in ids if raw[i]['word'] == f]                 # lower-case headword: verbs, adjectives, ...
    infl = [i for i in ids if raw[i]['pos'] != 'noun' and raw[i]['word'].lower() != f]   # "habe" -> haben, not die Habe
    cap = [i for i in ids if raw[i]['word'].lower() == f]           # capitalised headword: nouns
    # a participle that is also listed as an adjective ("passiert") counts for its verb (passieren)
    part_of = [i for i in infl if raw[i]['pos'] == 'verb' and any(c['f'].lower() == f and 'participle-2' in c['t'] for c in raw[i]['core'])]
    if exact and all(raw[i]['pos'] == 'adj' for i in exact) and part_of:
        exact, infl = [], part_of
    pick = exact or infl or cap or ids
    for i in pick:
        score[i] += int(n) / len(pick)

def article(w):
    core = ' '.join(f['f'] for f in w.get('core', [])[:3])
    tags = w.get('tags', [])
    g = [t for t in ('masculine', 'feminine', 'neuter') if t in tags]
    return {'masculine': 'der', 'feminine': 'die', 'neuter': 'das'}.get(g[0]) if len(g) == 1 else ''

seen, out = set(), []
for i, n in score.most_common():
    w = raw[i]
    key = w['word']
    if key in seen or key.lower() in skip_heads:
        continue
    seen.add(key)
    out.append({
        'rank': len(out) + 1,
        'word': w['word'],
        'pos': w['pos'],
        'art': article(w) if w['pos'] == 'noun' else '',
        'senses': [s['d'] for s in w['senses'][:3]],
    })
    if len(out) >= N:
        break

json.dump(out, open(os.path.join(HERE, 'top_words.json'), 'w'), ensure_ascii=False, indent=0)
print(len(out), 'words. First 40:', ', '.join(o['word'] for o in out[:40]))
print('Around 1000:', ', '.join(o['word'] for o in out[995:1010]))
print('Around 4990:', ', '.join(o['word'] for o in out[4985:5000]))
print('Classes:', collections.Counter(o['pos'] for o in out).most_common())

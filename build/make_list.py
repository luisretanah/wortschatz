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

# Word families (2026-11-24, "Vertrautheit"): subtitles underrate the written, abstract words of
# course texts. A rarer word built from a word already on the list (vertraut -> Vertrautheit,
# zuverlässig -> Zuverlässigkeit, bewerben -> Bewerbung) is added after the top N, most frequent first.
FAM = int(sys.argv[2]) if len(sys.argv) > 2 else 0
SUFFIX = ('lichkeit', 'igkeit', 'heit', 'keit', 'ung', 'schaft', 'ität', 'ismus', 'lich', 'ig', 'bar', 'los', 'sam', 'isch')
def bases(word):
    w = word.lower()
    for suf in SUFFIX:
        if w.endswith(suf) and len(w) - len(suf) >= 3:
            st = w[:-len(suf)]
            yield from (st, st + 'en', st + 'n', st + 'e', st + 'lich' if suf == 'keit' else st, st + 'ig' if suf == 'keit' else st)
            yield from ((st + 'ig', st + 'lich') if suf in ('igkeit', 'lichkeit') else ())
            yield from ((st + 'isch',) if suf == 'ität' else ())
listed = {o['word'].lower() for o in out}
fam = []
if FAM:
    for i, n in score.most_common():
        w = raw[i]
        if len(fam) >= FAM:
            break
        if w['word'] in seen or w['pos'] not in ('noun', 'adj', 'adv', 'verb') or n < 3:
            continue
        b = next((x for x in bases(w['word']) if x in listed and x != w['word'].lower()), None)
        if not b:
            continue
        seen.add(w['word'])
        fam.append({'rank': len(out) + len(fam) + 1, 'word': w['word'], 'pos': w['pos'],
                    'art': article(w) if w['pos'] == 'noun' else '', 'senses': [s['d'] for s in w['senses'][:3]], 'family': b})
    print(len(fam), 'family words, e.g.', ', '.join(f"{f['word']} ({f['family']})" for f in fam[:12]), '...', ', '.join(f['word'] for f in fam[-8:]))
    out += fam

json.dump(out, open(os.path.join(HERE, 'top_words.json'), 'w'), ensure_ascii=False, indent=0)
print(len(out), 'words. First 40:', ', '.join(o['word'] for o in out[:40]))
print('Around 1000:', ', '.join(o['word'] for o in out[995:1010]))
print('Around 4990:', ', '.join(o['word'] for o in out[4985:5000]))
if N > 5000:
    print('Around 7500:', ', '.join(o['word'] for o in out[7495:7510]))
    print(f'Around {N}:', ', '.join(o['word'] for o in out[N - 15:N]))
print('Classes:', collections.Counter(o['pos'] for o in out).most_common())

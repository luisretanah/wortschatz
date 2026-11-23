"""Merge out/*.json into ../simple.json: {word: [[meaning, ...], example]} (skips left out)."""
import json, glob, os
HERE = os.path.dirname(os.path.abspath(__file__))
keep = {w['word'] for w in json.load(open(os.path.join(HERE, 'top_words.json')))}
keep |= {w['word'] for w in json.load(open(os.path.join(HERE, 'batches', 'b22.json')))}
# hand-written fixes for everyday words the frequency mapping sent elsewhere ("pausen" -> pausen, not Pause)
keep |= {w['w'] for w in json.load(open(os.path.join(HERE, 'out', 'b23_manual.json')))}
data = {}
for p in sorted(glob.glob(os.path.join(HERE, 'out', '*.json'))):
    for it in json.load(open(p)):
        if it.get('skip') or not it.get('m') or it['w'] not in keep:
            continue
        data[it['w']] = [it['m'], it.get('x', '')]
# pool.json: [word, article, class, level] in frequency order, for the word of the day and practice
# with all words. Level 1 = top 3,000, 2 = up to 8,000 (and theme words), 3 = rarer. Rude words left out.
import re
RUDE = re.compile(r'grob|vulgär|Schimpfwort|beleidig|abwertend', re.I)
info = {w['word']: (w['rank'], w['art'], w['pos']) for w in json.load(open(os.path.join(HERE, 'top_words.json')))}
for w in json.load(open(os.path.join(HERE, 'batches', 'b22.json'))):
    info.setdefault(w['word'], (6000, w['art'], w['pos']))
POS = {'noun': 'n', 'verb': 'v', 'adj': 'a', 'adv': 'd'}
pool = []
for w, (m, x) in data.items():
    if any(RUDE.search(mm) for mm in m):
        continue
    r, art, pos = info.get(w, (6000, '', 'noun' if w[:1].isupper() else ''))
    if pos not in POS:
        continue
    pool.append((r, [w, art, POS[pos], 1 if r <= 3000 else 2 if r <= 8000 else 3]))
pool.sort(key=lambda t: t[0])
json.dump([p for _, p in pool], open(os.path.join(HERE, '..', 'pool.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
print(len(pool), 'pool words ->', os.path.join(HERE, '..', 'pool.json'))
out = os.path.join(HERE, '..', 'simple.json')
json.dump(data, open(out, 'w'), ensure_ascii=False, separators=(',', ':'))
print(len(data), 'words ->', out, f'{os.path.getsize(out) / 1024:.0f} KB')

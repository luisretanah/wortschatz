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
out = os.path.join(HERE, '..', 'simple.json')
json.dump(data, open(out, 'w'), ensure_ascii=False, separators=(',', ':'))
print(len(data), 'words ->', out, f'{os.path.getsize(out) / 1024:.0f} KB')

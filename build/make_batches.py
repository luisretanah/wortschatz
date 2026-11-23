"""Split the not-yet-written words of top_words.json into 250-word batches.

python3 -I make_batches.py            -> batches/bNN.json, numbered after the highest existing out/ or batches/ file
Words already present in any out/*.json (written or skipped) are left out, so re-running after
make_list.py with a bigger N (e.g. 10000) only batches the new words.
"""
import json, glob, os, re
HERE = os.path.dirname(os.path.abspath(__file__))
top = json.load(open(os.path.join(HERE, 'top_words.json')))
done = {x['w'] for p in glob.glob(os.path.join(HERE, 'out', '*.json')) for x in json.load(open(p))}
todo = [w for w in top if w['word'] not in done]
nums = [int(m.group(1)) for p in glob.glob(os.path.join(HERE, '*', 'b*.json')) for m in [re.search(r'b(\d+)', os.path.basename(p))] if m]
start = max(nums, default=0) + 1
for k, b in enumerate(range(0, len(todo), 250)):
    chunk = [{'word': x['word'], 'pos': x['pos'], 'art': x['art'], 'wiktionary': x['senses'][:2]} for x in todo[b:b + 250]]
    json.dump(chunk, open(os.path.join(HERE, 'batches', f'b{start + k:02d}.json'), 'w'), ensure_ascii=False, indent=0)
print(f'{len(top) - len(todo)} words already done, {len(todo)} to write in {-(-len(todo) // 250)} batches starting at b{start:02d}')

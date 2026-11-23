"""Difficulty and format check for simple explanations.

python3 -I check.py out/b01.json [more files]   -> report, exit 1 if anything is flagged

A meaning may only use words from the 8,000 most common word forms in everyday German
(FrequencyWords subtitles list), plus the headword's own family. Flags: hard words, too long,
missing example marker, example too long or short.
"""
import json, sys, re, os
HERE = os.path.dirname(os.path.abspath(__file__))
TOP = 8000
allowed = set()
for i, line in enumerate(open(os.path.join(HERE, 'de_50k.txt'), encoding='utf-8')):
    if i >= TOP:
        break
    allowed.add(line.rsplit(' ', 1)[0].lower())
allowed |= {'jemand', 'jemandem', 'jemanden', 'etwas', 'z', 'b', 'usw'}

flags, total = [], 0
for path in sys.argv[1:]:
    for it in json.load(open(path)):
        if it.get('skip'):
            continue
        total += 1
        w = it['w']
        wl = w.lower()
        fam = lambda t: t.lower() == wl or (t.lower().startswith(wl[:max(3, len(wl) - 2)]) and abs(len(t) - len(wl)) <= 3)
        for m in it.get('m', []):
            toks = re.findall(r"[A-Za-zÄÖÜäöüß]+", m)
            if len(toks) > 14:
                flags.append((path, w, 'meaning too long', m))
            hard = [t for t in toks if t.lower() not in allowed and not fam(t)]
            if hard:
                flags.append((path, w, 'hard: ' + ', '.join(hard), m))
            if any(fam(t) for t in toks) and len(w) > 3:
                flags.append((path, w, 'uses the word itself', m))
        x = it.get('x', '')
        n = len(re.findall(r"[A-Za-zÄÖÜäöüß]+", x))
        if '⟦' not in x:
            flags.append((path, w, 'example has no ⟦ ⟧ marker', x))
        if n < 4 or n > 14:
            flags.append((path, w, f'example length {n}', x))

for f in flags:
    print(f'{os.path.basename(f[0])}  {f[1]:<22} {f[2]:<40} | {f[3]}')
words_flagged = len({(f[0], f[1]) for f in flags})
print(f'\n{total} explanations, {words_flagged} flagged ({words_flagged / max(total, 1):.0%})')
sys.exit(1 if flags else 0)

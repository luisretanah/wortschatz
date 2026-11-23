"""Unpack the German Wiktionary extract (Kaikki/Wiktextract, dump 2026-11-01, CC BY-SA 4.0) that
ChatGPT's "Mein-Deutsch-B21.html" carries as gzip+base64, into gpt_wiktionary.json (~210 MB, gitignored).

python3 -I extract_wiktionary.py [path/to/Mein-Deutsch-B21.html]
If that file is gone, the same data comes from https://kaikki.org/dewiktionary/rawdata.html
(German entries, fields word/pos/senses/core/aliasKey would need re-deriving).
"""
import re, base64, gzip, json, sys, os
HERE = os.path.dirname(os.path.abspath(__file__))
src = sys.argv[1] if len(sys.argv) > 1 else '/Users/luis/Documents/Codex/2026-11-23/can-x20/outputs/Mein-Deutsch-B21.html'
s = open(src, encoding='utf-8').read()
m = re.search(r'id="dictionary"[^>]*>(.*?)</script>', s, re.S)
raw = json.loads(gzip.decompress(base64.b64decode(m.group(1).strip())))
json.dump(raw, open(os.path.join(HERE, 'gpt_wiktionary.json'), 'w'), ensure_ascii=False)
print(len(raw), 'entries -> gpt_wiktionary.json')

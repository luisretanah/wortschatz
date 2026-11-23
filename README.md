# Wortschatz

German-German dictionary and vocabulary trainer for B2 learners, built as a
static web app (no server, no account). Install on iPhone: open in Safari,
Share, "Zum Home-Bildschirm".

- Lookup: German Wiktionary (CC BY-SA 4.0) live, synonyms also from
  OpenThesaurus; every entry links to Duden and DWDS.
- Emergency English: English Wiktionary glosses, example sentences via DeepL link.
- Practice: spaced-repetition flashcards, der/die/das drill with ending rules,
  cloze sentences. Progress lives in the browser (localStorage), with a JSON
  backup export/import in "Meine Wörter".

Files: `index.html`, `app.css`, `app.js` (UI), `wiki.js` (Wiktionary parser),
`words.js` (B2 theme lists), `sw.js` (offline), `manifest.webmanifest`, `icons/`.

Checks:
- `node tools/verify_words.js` checks every theme word's article against Wiktionary.
- `node tools/test_wiki.js Wort ...` prints the parsed entry.
- `python3 tools/e2e.py <outdir>` walks the app headlessly (serve on :8765 first).

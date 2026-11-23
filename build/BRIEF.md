# Writing simple explanations ("Einfach erklärt")

Reader: an adult learning German, nominally B2 but with real vocabulary nearer B1. She reads the
explanation on her iPhone, German only. The explanation must be understood at first glance.

## Input
A JSON list. Each item: `word`, `pos` (noun, verb, adj, adv, prep, conj, intj, particle), `art`
(der/die/das for nouns), `wiktionary` (one or two native-speaker definitions: the facts to rely on).

## Output
A JSON list, same order, one object per input word:

```json
{"w": "beenden", "m": ["mit etwas aufhören", "etwas fertig machen"], "x": "Wir ⟦beenden⟧ das Treffen um fünf Uhr."}
```

- `w`: the word exactly as given.
- `m`: one or two meanings, the most common first. Usually one is enough. Only add a second when
  it is a different everyday meaning (Bank: Sitzbank / Geldinstitut).
- `x`: one everyday example sentence, 5 to 12 words, the word (in any form) wrapped in ⟦ ⟧.
- `skip: true` instead of m/x when the item is not a German word a learner would look up
  (English word, name, typo, letter).

## How to write a meaning
- Short: at most 12 words. No full stop at the end.
- Only very common words (A1 to A2). If you need a harder word, rephrase.
- Do not use the word itself or a word from the same family in the meaning.
- Nouns: describe the thing ("Dinge, die man nicht mehr braucht und wegwirft"), no article at the start.
- Verbs: start like an infinitive phrase ("mit etwas aufhören", "jemandem etwas erklären").
- Adjectives: "so, dass ..." or a simple paraphrase ("nicht krank", "viel Arbeit, wenig Zeit").
- Small words (aber, doch, also, eben): say what they do in a sentence ("zeigt einen Gegensatz").
- Stay true to the Wiktionary facts. Never add a meaning that is not there. No medical, legal or
  political opinions.
- Everyday register. No "jmd./etw.", no abbreviations, no linguistics terms.

## Examples
- Abfall → m: ["Dinge, die man nicht mehr braucht und wegwirft"], x: "Bring bitte den ⟦Abfall⟧ nach unten."
- Voraussetzung → m: ["etwas, das man zuerst braucht, damit etwas anderes geht"], x: "Gutes Deutsch ist eine ⟦Voraussetzung⟧ für den Job."
- allerdings → m: ["aber; das muss man auch sagen"], x: "Das Hotel war schön, ⟦allerdings⟧ sehr teuer."
- gesund → m: ["nicht krank; gut für den Körper"], x: "Obst und Gemüse sind ⟦gesund⟧."
- Bank → m: ["ein Platz zum Sitzen für mehrere Personen", "ein Ort für Geld und Konten"], x: "Wir sitzen auf einer ⟦Bank⟧ im Park."

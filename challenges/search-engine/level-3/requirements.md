# Level 3: Phrase Search

Extend the existing search engine so learners can find consecutive terms in the same order. All Level 1 and Level 2 behavior must continue to work.

## API

Do not change the public API:

```python
engine = SearchEngine()
engine.index(document_id, text)
results = engine.search(query)
```

## Phrase-query syntax

A query surrounded by double quotes is a phrase query:

```python
engine.search('"distributed systems"')
```

Unquoted queries remain exact-term or prefix queries.

## Required behavior

- Preserve every requirement from Levels 1 and 2.
- A phrase matches only when all its terms are consecutive and in the requested order.
- Phrase matching is case-insensitive.
- Terms are split using whitespace, just as they are in earlier levels.
- A document appears only once, even when the phrase occurs several times.
- Results follow the order in which documents were first indexed.
- An unknown or empty phrase (`""`) returns an empty list.
- Replacing a document removes phrase matches from its previous text.
- Wildcards have special meaning only in unquoted prefix queries.
- Only a pair of surrounding double quotes has special meaning.

## Example

```python
engine = SearchEngine()

engine.index("doc-1", "Distributed systems are challenging")
engine.index("doc-2", "Distributed reliable systems")
engine.index("doc-3", "I study distributed systems")

assert engine.search('"distributed systems"') == ["doc-1", "doc-3"]
assert engine.search('"systems distributed"') == []
assert engine.search("distributed") == ["doc-1", "doc-2", "doc-3"]
assert engine.search("dist*") == ["doc-1", "doc-2", "doc-3"]
```

Do not add a separate phrase-search method. Extend the existing query behavior while keeping the API stable.

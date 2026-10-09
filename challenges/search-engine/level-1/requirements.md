# Level 1: Single-Term Search

Implement an in-memory search engine that supports exact single-term searches.

## API

Do not change the public API:

```python
engine = SearchEngine()
engine.index(document_id, text)
results = engine.search(query)
```

## Required behavior

- `index(document_id, text)` adds a document to the search engine.
- A document ID is a string.
- Document text is split into terms using whitespace.
- Terms are matched case-insensitively.
- `search(query)` accepts one complete term.
- A document matches when it contains that complete term.
- Partial matches do not count at this level.
- Each matching document ID appears only once.
- Results follow the order in which documents were first indexed.
- Searching for an unknown or empty term returns an empty list.
- Indexing an existing document ID replaces its previous text.

## Example

```python
engine = SearchEngine()

engine.index("doc-1", "Python is expressive")
engine.index("doc-2", "Python is popular")
engine.index("doc-3", "JavaScript is popular")

assert engine.search("python") == ["doc-1", "doc-2"]
assert engine.search("popular") == ["doc-2", "doc-3"]
assert engine.search("java") == []
```

Only single-term queries are required in this level.

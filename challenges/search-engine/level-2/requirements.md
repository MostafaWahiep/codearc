# Level 2: Prefix Search

Extend the existing search engine so learners can search for terms by prefix. All Level 1 behavior must continue to work.

## API

Do not change the public API:

```python
engine = SearchEngine()
engine.index(document_id, text)
results = engine.search(query)
```

## Prefix-query syntax

A query ending in `*` is a prefix query:

```python
engine.search("pro*")
```

The text before `*` is the prefix. Queries without `*` remain exact-term searches.

## Required behavior

- Preserve every requirement from Level 1.
- A prefix query matches a document when at least one complete term begins with the requested prefix.
- Prefix matching is case-insensitive.
- A document appears only once, even when several of its terms match the prefix.
- Results follow the order in which documents were first indexed.
- An unknown prefix returns an empty list.
- An empty prefix (`"*"`) returns an empty list.
- Only a single trailing `*` has special meaning.

## Example

```python
engine = SearchEngine()

engine.index("doc-1", "Python programming")
engine.index("doc-2", "Progressive web applications")
engine.index("doc-3", "Product design")

assert engine.search("pro*") == ["doc-1", "doc-2", "doc-3"]
assert engine.search("prog*") == ["doc-1", "doc-2"]
assert engine.search("python") == ["doc-1"]
assert engine.search("py") == []
```

Do not add a separate prefix-search method. The goal is to extend the existing query behavior while keeping the API stable.

Keep the Level 1 methods and add one new method for prefix search:

```python
engine = SearchEngine()
engine.add_document(document_id, text)
exact_matches = engine.search_term(term)
prefix_matches = engine.search_prefix(prefix)
```

Do not change or remove `add_document` or `search_term`. Existing Level 1 callers must continue to work.

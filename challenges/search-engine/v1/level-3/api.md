Keep the earlier methods and add one new method for phrase search:

```python
engine = SearchEngine()
engine.add_document(document_id, text)
exact_matches = engine.search_term(term)
prefix_matches = engine.search_prefix(prefix)
phrase_matches = engine.search_phrase(phrase)
```

Do not change or remove the Level 1 and Level 2 methods. Existing callers must continue to work.

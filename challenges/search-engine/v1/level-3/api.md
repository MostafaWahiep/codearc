Keep the existing public API:

```python
engine = SearchEngine()
engine.index(document_id, text)
results = engine.search(query)
```

Do not add a separate phrase-search method. Extend how `search(query)` interprets a query while keeping existing callers working.

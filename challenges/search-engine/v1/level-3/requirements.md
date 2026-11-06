Add a phrase-search method:

```python
engine.search_phrase("distributed systems")
```

- A phrase matches only when all its terms are consecutive and in the requested order.
- Phrase matching is case-insensitive.
- Terms are split using whitespace, just as they are in earlier levels.
- A document appears only once, even when the phrase occurs several times.
- Matching document IDs may be returned in any order.
- An unknown or empty phrase returns an empty list.
- `add_document`, `search_term`, and `search_prefix` must keep their earlier behavior.

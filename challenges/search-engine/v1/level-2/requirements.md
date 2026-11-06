Add a prefix-search method:

```python
engine.search_prefix("pro")
```

- A prefix query matches a document when at least one complete term begins with the requested prefix.
- Prefix matching is case-insensitive.
- A document appears only once, even when several of its terms match the prefix.
- Matching document IDs may be returned in any order.
- An unknown prefix returns an empty list.
- An empty prefix returns an empty list.
- `add_document` and `search_term` must keep their Level 1 behavior.

A query ending in `*` is a prefix query:

```python
engine.search("pro*")
```

The text before `*` is the prefix. Queries without `*` remain exact-term searches.

- A prefix query matches a document when at least one complete term begins with the requested prefix.
- Prefix matching is case-insensitive.
- A document appears only once, even when several of its terms match the prefix.
- Results follow the order in which documents were first indexed.
- An unknown prefix returns an empty list.
- An empty prefix (`"*"`) returns an empty list.
- Only a single trailing `*` has special meaning.

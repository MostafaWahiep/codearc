A query surrounded by double quotes is a phrase query:

```python
engine.search('"distributed systems"')
```

Unquoted queries remain exact-term or prefix queries.

- A phrase matches only when all its terms are consecutive and in the requested order.
- Phrase matching is case-insensitive.
- Terms are split using whitespace, just as they are in earlier levels.
- A document appears only once, even when the phrase occurs several times.
- Results follow the order in which documents were first indexed.
- An unknown or empty phrase (`""`) returns an empty list.
- Replacing a document removes phrase matches from its previous text.
- Wildcards have special meaning only in unquoted prefix queries.
- Only a pair of surrounding double quotes has special meaning.

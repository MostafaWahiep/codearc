# Level 1 Design Feedback

There are two common ways to implement exact-term search at this stage.

## Scan every document

The simplest approach stores each document's terms and checks every document when a search is performed.

This design is easy to understand and makes replacing documents straightforward. Its main limitation is that every search becomes slower as more documents are added.

## Build an inverted index

An inverted index stores the relationship in the opposite direction:

```text
python  -> doc-1, doc-2
popular -> doc-2, doc-3
```

This makes exact-term lookup fast because the search engine can go directly from a term to its matching documents. It introduces additional responsibilities:

- Duplicate terms must not produce duplicate results.
- Replacing a document must remove its old index entries.
- Result ordering must be preserved separately from the index.

## Reflection checkpoint

The next requirement is intentionally still hidden. Before revealing it, look at the responsibilities in your current design:

- Which parts are responsible for normalizing and storing documents?
- Which parts decide how a query is interpreted?
- What information would be expensive to recover later if you stop storing it now?
- Which behavior is protected by the public API and existing tests?

Do not try to predict every future feature. Instead, identify the assumptions your current design makes and decide whether its present simplicity is worth those constraints.

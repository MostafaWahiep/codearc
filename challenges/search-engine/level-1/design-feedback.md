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

## Preparing for the next levels

A hash-based inverted index works well when the complete query term is known. Prefix search is different: looking up `pro` does not directly locate keys such as `programming` or `progress`.

You may decide to scan the indexed vocabulary, keep the vocabulary sorted, or introduce a prefix-oriented structure such as a trie. Each choice trades implementation complexity for faster searches.

Phrase search will add another constraint. Knowing that a document contains `distributed` and `systems` is not enough to prove that the terms occur next to each other in the correct order. Supporting phrases efficiently may require storing term positions, not only document IDs.

Before continuing, consider which parts of your current design can remain unchanged and which parts will need to evolve.

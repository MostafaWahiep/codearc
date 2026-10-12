- `index(document_id, text)` adds a document to the search engine.
- A document ID is a string.
- Document text is split into terms using whitespace.
- Terms are matched case-insensitively.
- `search(query)` accepts one complete term.
- A document matches when it contains that complete term.
- Partial matches do not count at this level.
- Each matching document ID appears only once.
- Results follow the order in which documents were first indexed.
- Searching for an unknown or empty term returns an empty list.
- Indexing an existing document ID replaces its previous text.

Only single-term queries are required in this level.

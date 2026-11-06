- `add_document(document_id, text)` adds a document to the search engine.
- A document ID is a string.
- You may assume each document ID is added only once.
- Document text is split into terms using whitespace.
- Terms are matched case-insensitively.
- `search_term(term)` accepts one complete term.
- A document matches when it contains that complete term.
- Partial matches do not count at this level.
- Each matching document ID appears only once.
- Matching document IDs may be returned in any order.
- Searching for an unknown or empty term returns an empty list.

Only exact-term search is required in this level.

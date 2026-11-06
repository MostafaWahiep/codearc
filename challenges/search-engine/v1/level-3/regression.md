Every earlier guarantee remains part of the contract:

- `add_document` still adds documents with unique IDs.
- `search_term` from Level 1 still works.
- `search_prefix` from Level 2 still works.
- Matching remains case-insensitive.
- Results contain each matching document once.

The check run includes regression tests from Levels 1 and 2 as well as the new phrase-search tests.

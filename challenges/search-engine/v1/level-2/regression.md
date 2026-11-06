Every Level 1 guarantee remains part of the contract:

- `add_document` still adds documents with unique IDs.
- `search_term` still performs exact-term search.
- Matching remains case-insensitive.
- Results contain each matching document once.
- Unknown and empty exact terms return an empty list.

The check run includes Level 1 regression tests as well as the new prefix-search tests.

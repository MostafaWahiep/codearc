Every Level 1 guarantee remains part of the contract:

- Exact-term queries still work without a trailing `*`.
- Matching remains case-insensitive.
- Results contain each document once and preserve first-indexed order.
- Unknown and empty exact terms return an empty list.
- Re-indexing a document ID replaces its previous text.

The check run includes Level 1 regression tests as well as the new prefix-search tests.

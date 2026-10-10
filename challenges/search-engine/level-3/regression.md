Every earlier guarantee remains part of the contract:

- Exact-term search from Level 1 still works.
- Prefix queries from Level 2 still work.
- Matching remains case-insensitive.
- Results contain each document once and preserve first-indexed order.
- Re-indexing a document removes every match associated with its previous text.

The check run includes regression tests from Levels 1 and 2 as well as the new phrase-search tests.

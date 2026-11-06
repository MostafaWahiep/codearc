Exact-term search works only when a caller knows the complete indexed term. Now support partial knowledge: a caller can enter the beginning of a term and find documents containing matching words.

Add prefix search as a new operation. Extend the existing engine rather than replacing it, and keep exact-term search working through the Level 1 API.

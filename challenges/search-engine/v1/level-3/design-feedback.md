# Level 3 Design Feedback

Phrase search adds a new question: not only which documents contain a term, but where each occurrence appears.

## Scan stored document tokens

The simplest approach is to retain every document as an ordered token list and scan those lists for the requested phrase.

This is easy to reason about and may be entirely adequate for a small collection. Search time grows with the total amount of document text examined.

## Use a positional inverted index

A positional inverted index extends each term's posting with its positions:

```text
distributed -> doc-1: [0], doc-2: [3]
systems     -> doc-1: [1], doc-2: [4]
```

The phrase `distributed systems` matches when a `systems` position is exactly one greater than a `distributed` position in the same document.

For longer phrases, every successive term must appear at the next position. This avoids scanning documents that do not contain all the requested terms.

## Costs of positional information

Positions make phrase queries more efficient, but they increase index size and indexing complexity.

This illustrates a recurring systems tradeoff: additional work and storage during writes can make later reads substantially faster.

## Evolving without breaking earlier behavior

The final API now exposes three focused search operations:

```text
search_term("python")
search_prefix("py")
search_phrase("distributed systems")
```

Because each requirement adds a new method, the meanings of earlier methods remain unchanged and all previous tests can run as regressions. The tradeoff is a larger public API, but callers do not need to learn a query syntax or depend on one method to classify several kinds of input.

## Further extensions

A production search engine would need to make additional decisions about punctuation, Unicode normalization, stop words, stemming, and ranking. Those concerns are intentionally outside this challenge so learners can focus on how changing requirements influence data-structure design.

Review your implementation across all three levels. Identify which early decisions made extension easier, which required redesign, and whether that redesign was avoidable or simply a natural response to new requirements.

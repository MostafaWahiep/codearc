# Level 2 Design Feedback

Prefix search changes what the index must answer. An exact query provides a complete dictionary key, while a prefix query asks for every key beginning with only part of a term.

## Scan the vocabulary

The smallest extension to a hash-based inverted index is to inspect every indexed term:

```text
for each indexed term:
    if term starts with the prefix:
        include its documents
```

This approach reuses the Level 1 design and is easy to implement correctly. Its search cost grows with the number of unique terms, even when only a few terms match.

For a small local challenge, this may be the best tradeoff. A simpler design is often preferable until measurements show that it is too slow.

## Keep terms sorted

With a sorted vocabulary, the engine can use binary search to find the first possible match and then read consecutive terms until the prefix stops matching.

This reduces the amount of vocabulary examined during a search, but maintaining sorted data makes indexing and document replacement more complicated.

## Use a trie

A trie stores terms character by character. Following the prefix leads directly to the part of the structure containing matching terms.

Tries can make prefix lookup efficient, especially when many terms share prefixes. They also require more code and may use significantly more memory than a hash map or sorted list.

## Preserve behavior across levels

Using a trailing wildcard keeps exact and prefix queries distinct:

```text
python -> exact term
py*    -> prefix
```

This allows the Level 1 behavior and tests to remain valid. Extending an interface without silently changing its previous meaning is an important part of evolving software safely.

## Reflection checkpoint

The next requirement remains hidden until you choose to continue. For now, review the cost of this change:

- Did you extend one focused part of the system or touch several responsibilities?
- Which Level 1 decisions helped you preserve earlier behavior?
- Did you add complexity for a measured need, or only for a possible future?
- If you refactored now, what specific evidence would tell you that the refactor paid off later?

The goal is not to minimize the number of changed lines. The goal is to understand why the change had the shape and cost that it did.

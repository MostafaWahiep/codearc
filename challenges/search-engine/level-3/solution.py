class SearchEngine:
    def __init__(self) -> None:
        self._document_tokens: dict[str, list[str]] = {}
        self._document_order: dict[str, int] = {}
        self._positions_by_term: dict[str, dict[str, set[int]]] = {}

    def index(self, document_id: str, text: str) -> None:
        if document_id not in self._document_order:
            self._document_order[document_id] = len(self._document_order)

        self._remove_from_index(document_id)

        tokens = [term.casefold() for term in text.split()]
        self._document_tokens[document_id] = tokens

        for position, term in enumerate(tokens):
            documents = self._positions_by_term.setdefault(term, {})
            documents.setdefault(document_id, set()).add(position)

    def search(self, query: str) -> list[str]:
        normalized_query = query.casefold().strip()
        if not normalized_query:
            return []

        if self._is_phrase_query(normalized_query):
            matches = self._search_phrase(normalized_query[1:-1])
        elif self._is_prefix_query(normalized_query):
            matches = self._search_prefix(normalized_query[:-1])
        else:
            matches = set(self._positions_by_term.get(normalized_query, {}))

        return sorted(matches, key=self._document_order.__getitem__)

    def _is_phrase_query(self, query: str) -> bool:
        return len(query) >= 2 and query.startswith('"') and query.endswith('"') and query.count('"') == 2

    def _is_prefix_query(self, query: str) -> bool:
        return query.endswith("*") and query.count("*") == 1 and len(query) > 1

    def _search_prefix(self, prefix: str) -> set[str]:
        matches: set[str] = set()

        for term, documents in self._positions_by_term.items():
            if term.startswith(prefix):
                matches.update(documents)

        return matches

    def _search_phrase(self, phrase: str) -> set[str]:
        terms = phrase.split()
        if not terms:
            return set()

        candidate_documents = set(self._positions_by_term.get(terms[0], {}))
        for term in terms[1:]:
            candidate_documents.intersection_update(self._positions_by_term.get(term, {}))

        return {
            document_id
            for document_id in candidate_documents
            if self._document_contains_phrase(document_id, terms)
        }

    def _document_contains_phrase(self, document_id: str, terms: list[str]) -> bool:
        starting_positions = self._positions_by_term[terms[0]][document_id]

        return any(
            all(
                start + offset in self._positions_by_term[term][document_id]
                for offset, term in enumerate(terms[1:], start=1)
            )
            for start in starting_positions
        )

    def _remove_from_index(self, document_id: str) -> None:
        for term in set(self._document_tokens.get(document_id, [])):
            documents = self._positions_by_term[term]
            del documents[document_id]

            if not documents:
                del self._positions_by_term[term]

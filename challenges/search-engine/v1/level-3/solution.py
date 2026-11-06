class SearchEngine:
    def __init__(self) -> None:
        self._positions_by_term: dict[str, dict[str, set[int]]] = {}

    def add_document(self, document_id: str, text: str) -> None:
        tokens = [term.casefold() for term in text.split()]

        for position, term in enumerate(tokens):
            documents = self._positions_by_term.setdefault(term, {})
            documents.setdefault(document_id, set()).add(position)

    def search_term(self, term: str) -> list[str]:
        normalized_term = term.casefold().strip()
        if not normalized_term:
            return []

        return list(self._positions_by_term.get(normalized_term, {}))

    def search_prefix(self, prefix: str) -> list[str]:
        normalized_prefix = prefix.casefold().strip()
        if not normalized_prefix:
            return []

        matches: set[str] = set()

        for term, documents in self._positions_by_term.items():
            if term.startswith(normalized_prefix):
                matches.update(documents)

        return list(matches)

    def search_phrase(self, phrase: str) -> list[str]:
        terms = phrase.casefold().strip().split()
        if not terms:
            return []

        candidate_documents = set(self._positions_by_term.get(terms[0], {}))
        for term in terms[1:]:
            candidate_documents.intersection_update(self._positions_by_term.get(term, {}))

        return [
            document_id
            for document_id in candidate_documents
            if self._document_contains_phrase(document_id, terms)
        ]

    def _document_contains_phrase(self, document_id: str, terms: list[str]) -> bool:
        starting_positions = self._positions_by_term[terms[0]][document_id]

        return any(
            all(
                start + offset in self._positions_by_term[term][document_id]
                for offset, term in enumerate(terms[1:], start=1)
            )
            for start in starting_positions
        )

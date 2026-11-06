class SearchEngine:
    def __init__(self) -> None:
        self._documents_by_term: dict[str, set[str]] = {}

    def add_document(self, document_id: str, text: str) -> None:
        terms = {term.casefold() for term in text.split()}

        for term in terms:
            self._documents_by_term.setdefault(term, set()).add(document_id)

    def search_term(self, term: str) -> list[str]:
        normalized_term = term.casefold().strip()
        if not normalized_term:
            return []

        return list(self._documents_by_term.get(normalized_term, set()))

    def search_prefix(self, prefix: str) -> list[str]:
        normalized_prefix = prefix.casefold().strip()
        if not normalized_prefix:
            return []

        matches: set[str] = set()

        for term, document_ids in self._documents_by_term.items():
            if term.startswith(normalized_prefix):
                matches.update(document_ids)

        return list(matches)

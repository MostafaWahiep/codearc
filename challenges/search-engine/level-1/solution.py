class SearchEngine:
    def __init__(self) -> None:
        self._document_terms: dict[str, set[str]] = {}
        self._document_order: dict[str, int] = {}
        self._documents_by_term: dict[str, set[str]] = {}

    def index(self, document_id: str, text: str) -> None:
        if document_id not in self._document_order:
            self._document_order[document_id] = len(self._document_order)

        self._remove_from_index(document_id)

        terms = {term.casefold() for term in text.split()}
        self._document_terms[document_id] = terms

        for term in terms:
            self._documents_by_term.setdefault(term, set()).add(document_id)

    def search(self, query: str) -> list[str]:
        term = query.casefold().strip()
        if not term:
            return []

        matches = self._documents_by_term.get(term, set())
        return sorted(matches, key=self._document_order.__getitem__)

    def _remove_from_index(self, document_id: str) -> None:
        for term in self._document_terms.get(document_id, set()):
            document_ids = self._documents_by_term[term]
            document_ids.remove(document_id)

            if not document_ids:
                del self._documents_by_term[term]

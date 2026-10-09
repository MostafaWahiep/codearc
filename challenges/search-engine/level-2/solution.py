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
        normalized_query = query.casefold().strip()
        if not normalized_query:
            return []

        if self._is_prefix_query(normalized_query):
            matches = self._search_prefix(normalized_query[:-1])
        else:
            matches = self._documents_by_term.get(normalized_query, set())

        return sorted(matches, key=self._document_order.__getitem__)

    def _is_prefix_query(self, query: str) -> bool:
        return query.endswith("*") and query.count("*") == 1 and len(query) > 1

    def _search_prefix(self, prefix: str) -> set[str]:
        matches: set[str] = set()

        for term, document_ids in self._documents_by_term.items():
            if term.startswith(prefix):
                matches.update(document_ids)

        return matches

    def _remove_from_index(self, document_id: str) -> None:
        for term in self._document_terms.get(document_id, set()):
            document_ids = self._documents_by_term[term]
            document_ids.remove(document_id)

            if not document_ids:
                del self._documents_by_term[term]

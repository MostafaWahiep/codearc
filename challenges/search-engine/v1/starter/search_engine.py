class SearchEngine:
    def __init__(self) -> None:
        """Create an empty search engine."""
        pass

    def add_document(self, document_id: str, text: str) -> None:
        """Add a document to the search engine."""
        raise NotImplementedError

    def search_term(self, term: str) -> list[str]:
        """Return the IDs of documents containing an exact term."""
        raise NotImplementedError

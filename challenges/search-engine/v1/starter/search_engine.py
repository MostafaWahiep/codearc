class SearchEngine:
    def __init__(self) -> None:
        """Create an empty search engine."""
        pass

    def index(self, document_id: str, text: str) -> None:
        """Add or replace a document in the search engine."""
        raise NotImplementedError

    def search(self, query: str) -> list[str]:
        """Return the IDs of documents matching the query."""
        raise NotImplementedError
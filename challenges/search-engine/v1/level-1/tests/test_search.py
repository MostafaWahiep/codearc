from search_engine import SearchEngine


def test_finds_documents_containing_term() -> None:
    engine = SearchEngine()
    engine.index("doc-1", "Python is expressive")
    engine.index("doc-2", "Python is popular")
    engine.index("doc-3", "JavaScript is popular")

    assert engine.search("python") == ["doc-1", "doc-2"]
    assert engine.search("popular") == ["doc-2", "doc-3"]


def test_search_is_case_insensitive() -> None:
    engine = SearchEngine()
    engine.index("doc-1", "Python")

    assert engine.search("PYTHON") == ["doc-1"]


def test_requires_a_complete_term() -> None:
    engine = SearchEngine()
    engine.index("doc-1", "python")

    assert engine.search("py") == []


def test_returns_each_document_only_once() -> None:
    engine = SearchEngine()
    engine.index("doc-1", "python python python")

    assert engine.search("python") == ["doc-1"]


def test_returns_empty_list_for_unknown_or_empty_term() -> None:
    engine = SearchEngine()
    engine.index("doc-1", "python")

    assert engine.search("missing") == []
    assert engine.search("") == []


def test_replaces_an_existing_document() -> None:
    engine = SearchEngine()
    engine.index("doc-1", "python")
    engine.index("doc-2", "rust")
    engine.index("doc-1", "rust")

    assert engine.search("python") == []
    assert engine.search("rust") == ["doc-1", "doc-2"]
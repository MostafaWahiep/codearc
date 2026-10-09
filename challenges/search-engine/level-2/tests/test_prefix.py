from search_engine import SearchEngine


def test_finds_terms_with_matching_prefix() -> None:
    engine = SearchEngine()
    engine.index("doc-1", "Python programming")
    engine.index("doc-2", "Progressive web applications")
    engine.index("doc-3", "Product design")

    assert engine.search("pro*") == ["doc-1", "doc-2", "doc-3"]
    assert engine.search("prog*") == ["doc-1", "doc-2"]


def test_prefix_search_is_case_insensitive() -> None:
    engine = SearchEngine()
    engine.index("doc-1", "Python")

    assert engine.search("PYT*") == ["doc-1"]


def test_returns_document_once_when_multiple_terms_match() -> None:
    engine = SearchEngine()
    engine.index("doc-1", "programming progress productivity")

    assert engine.search("pro*") == ["doc-1"]


def test_prefix_results_preserve_document_order() -> None:
    engine = SearchEngine()
    engine.index("doc-1", "product")
    engine.index("doc-2", "programming")
    engine.index("doc-3", "progress")

    assert engine.search("pro*") == ["doc-1", "doc-2", "doc-3"]


def test_returns_empty_list_for_unknown_or_empty_prefix() -> None:
    engine = SearchEngine()
    engine.index("doc-1", "python")

    assert engine.search("rust*") == []
    assert engine.search("*") == []


def test_query_without_wildcard_remains_an_exact_search() -> None:
    engine = SearchEngine()
    engine.index("doc-1", "python")

    assert engine.search("python") == ["doc-1"]
    assert engine.search("py") == []


def test_only_one_trailing_wildcard_is_special() -> None:
    engine = SearchEngine()
    engine.index("doc-1", "programming")

    assert engine.search("*pro") == []
    assert engine.search("pro**") == []

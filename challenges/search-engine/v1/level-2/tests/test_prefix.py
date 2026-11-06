from search_engine import SearchEngine


def test_finds_terms_with_matching_prefix() -> None:
    engine = SearchEngine()
    engine.add_document("doc-1", "Python programming")
    engine.add_document("doc-2", "Progressive web applications")
    engine.add_document("doc-3", "Product design")

    assert sorted(engine.search_prefix("pro")) == ["doc-1", "doc-2", "doc-3"]
    assert sorted(engine.search_prefix("prog")) == ["doc-1", "doc-2"]


def test_prefix_search_is_case_insensitive() -> None:
    engine = SearchEngine()
    engine.add_document("doc-1", "Python")

    assert engine.search_prefix("PYT") == ["doc-1"]


def test_prefix_must_match_every_character() -> None:
    engine = SearchEngine()
    engine.add_document("doc-1", "python")

    assert engine.search_prefix("pyt") == ["doc-1"]
    assert engine.search_prefix("pya") == []


def test_prefix_must_start_at_the_beginning_of_a_term() -> None:
    engine = SearchEngine()
    engine.add_document("doc-1", "programming")

    assert engine.search_prefix("gram") == []


def test_complete_term_is_a_valid_prefix() -> None:
    engine = SearchEngine()
    engine.add_document("doc-1", "python")

    assert engine.search_prefix("python") == ["doc-1"]


def test_prefix_longer_than_the_term_does_not_match() -> None:
    engine = SearchEngine()
    engine.add_document("doc-1", "python")

    assert engine.search_prefix("pythonic") == []


def test_returns_document_once_when_multiple_terms_match() -> None:
    engine = SearchEngine()
    engine.add_document("doc-1", "programming progress productivity")

    assert engine.search_prefix("pro") == ["doc-1"]


def test_returns_all_documents_with_matching_terms() -> None:
    engine = SearchEngine()
    engine.add_document("doc-1", "product")
    engine.add_document("doc-2", "programming")
    engine.add_document("doc-3", "progress")

    assert sorted(engine.search_prefix("pro")) == ["doc-1", "doc-2", "doc-3"]


def test_returns_empty_list_for_unknown_or_empty_prefix() -> None:
    engine = SearchEngine()
    engine.add_document("doc-1", "python")

    assert engine.search_prefix("rust") == []
    assert engine.search_prefix("") == []

from search_engine import SearchEngine


def test_finds_documents_containing_term() -> None:
    engine = SearchEngine()
    engine.add_document("doc-1", "Python is expressive")
    engine.add_document("doc-2", "Python is popular")
    engine.add_document("doc-3", "JavaScript is popular")

    assert sorted(engine.search_term("python")) == ["doc-1", "doc-2"]
    assert sorted(engine.search_term("popular")) == ["doc-2", "doc-3"]


def test_search_is_case_insensitive() -> None:
    engine = SearchEngine()
    engine.add_document("doc-1", "Python")

    assert engine.search_term("PYTHON") == ["doc-1"]


def test_requires_a_complete_term() -> None:
    engine = SearchEngine()
    engine.add_document("doc-1", "python")
    engine.add_document("doc-2", "pythonic")

    assert engine.search_term("py") == []
    assert engine.search_term("python") == ["doc-1"]


def test_does_not_match_a_multiword_query_as_one_term() -> None:
    engine = SearchEngine()
    engine.add_document("doc-1", "python programming")

    assert engine.search_term("python programming") == []


def test_splits_document_text_on_whitespace() -> None:
    engine = SearchEngine()
    engine.add_document("doc-1", "python\tsearch\nengine")

    assert engine.search_term("python") == ["doc-1"]
    assert engine.search_term("search") == ["doc-1"]
    assert engine.search_term("engine") == ["doc-1"]


def test_does_not_remove_punctuation_from_terms() -> None:
    engine = SearchEngine()
    engine.add_document("doc-1", "python, rust")

    assert engine.search_term("python") == []
    assert engine.search_term("python,") == ["doc-1"]


def test_returns_each_document_only_once() -> None:
    engine = SearchEngine()
    engine.add_document("doc-1", "python python python")

    assert engine.search_term("python") == ["doc-1"]


def test_returns_empty_list_for_unknown_or_empty_term() -> None:
    engine = SearchEngine()
    engine.add_document("doc-1", "python")

    assert engine.search_term("missing") == []
    assert engine.search_term("") == []

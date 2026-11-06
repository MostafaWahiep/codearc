from search_engine import SearchEngine


def test_finds_consecutive_terms_in_order() -> None:
    engine = SearchEngine()
    engine.add_document("doc-1", "Distributed systems are challenging")
    engine.add_document("doc-2", "Distributed reliable systems")
    engine.add_document("doc-3", "I study distributed systems")

    assert sorted(engine.search_phrase("distributed systems")) == ["doc-1", "doc-3"]


def test_does_not_match_terms_in_a_different_order() -> None:
    engine = SearchEngine()
    engine.add_document("doc-1", "systems distributed")

    assert engine.search_phrase("distributed systems") == []


def test_does_not_match_non_consecutive_terms() -> None:
    engine = SearchEngine()
    engine.add_document("doc-1", "distributed reliable systems")

    assert engine.search_phrase("distributed systems") == []


def test_does_not_match_terms_across_different_documents() -> None:
    engine = SearchEngine()
    engine.add_document("doc-1", "distributed")
    engine.add_document("doc-2", "systems")

    assert engine.search_phrase("distributed systems") == []


def test_requires_complete_terms_in_a_phrase() -> None:
    engine = SearchEngine()
    engine.add_document("doc-1", "distributed systems")

    assert engine.search_phrase("distrib systems") == []
    assert engine.search_phrase("distributed sys") == []


def test_phrase_longer_than_document_does_not_match() -> None:
    engine = SearchEngine()
    engine.add_document("doc-1", "search engine")

    assert engine.search_phrase("search engine design") == []


def test_phrase_search_is_case_insensitive() -> None:
    engine = SearchEngine()
    engine.add_document("doc-1", "Distributed Systems")

    assert engine.search_phrase("DISTRIBUTED SYSTEMS") == ["doc-1"]


def test_splits_document_and_phrase_text_on_whitespace() -> None:
    engine = SearchEngine()
    engine.add_document("doc-1", "distributed\tsystems\nengineering")

    assert engine.search_phrase("distributed   systems") == ["doc-1"]


def test_supports_repeated_terms_in_a_phrase() -> None:
    engine = SearchEngine()
    engine.add_document("doc-1", "very very useful")
    engine.add_document("doc-2", "very useful")

    assert engine.search_phrase("very very") == ["doc-1"]


def test_returns_document_once_when_phrase_occurs_multiple_times() -> None:
    engine = SearchEngine()
    engine.add_document("doc-1", "search engine and search engine")

    assert engine.search_phrase("search engine") == ["doc-1"]


def test_returns_empty_list_for_unknown_or_empty_phrase() -> None:
    engine = SearchEngine()
    engine.add_document("doc-1", "distributed systems")

    assert engine.search_phrase("missing phrase") == []
    assert engine.search_phrase("") == []

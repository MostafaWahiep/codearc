from search_engine import SearchEngine


def test_finds_consecutive_terms_in_order() -> None:
    engine = SearchEngine()
    engine.index("doc-1", "Distributed systems are challenging")
    engine.index("doc-2", "Distributed reliable systems")
    engine.index("doc-3", "I study distributed systems")

    assert engine.search('"distributed systems"') == ["doc-1", "doc-3"]


def test_does_not_match_terms_in_a_different_order() -> None:
    engine = SearchEngine()
    engine.index("doc-1", "systems distributed")

    assert engine.search('"distributed systems"') == []


def test_phrase_search_is_case_insensitive() -> None:
    engine = SearchEngine()
    engine.index("doc-1", "Distributed Systems")

    assert engine.search('"DISTRIBUTED SYSTEMS"') == ["doc-1"]


def test_supports_repeated_terms_in_a_phrase() -> None:
    engine = SearchEngine()
    engine.index("doc-1", "very very useful")
    engine.index("doc-2", "very useful")

    assert engine.search('"very very"') == ["doc-1"]


def test_returns_document_once_when_phrase_occurs_multiple_times() -> None:
    engine = SearchEngine()
    engine.index("doc-1", "search engine and search engine")

    assert engine.search('"search engine"') == ["doc-1"]


def test_phrase_results_preserve_document_order() -> None:
    engine = SearchEngine()
    engine.index("doc-1", "a search engine")
    engine.index("doc-2", "another search engine")
    engine.index("doc-3", "search engine design")

    assert engine.search('"search engine"') == ["doc-1", "doc-2", "doc-3"]


def test_returns_empty_list_for_unknown_or_empty_phrase() -> None:
    engine = SearchEngine()
    engine.index("doc-1", "distributed systems")

    assert engine.search('"missing phrase"') == []
    assert engine.search('""') == []


def test_replacing_document_updates_phrase_matches() -> None:
    engine = SearchEngine()
    engine.index("doc-1", "distributed systems")
    engine.index("doc-2", "distributed systems")
    engine.index("doc-1", "distributed reliable systems")

    assert engine.search('"distributed systems"') == ["doc-2"]


def test_quotes_must_surround_the_complete_query() -> None:
    engine = SearchEngine()
    engine.index("doc-1", "distributed systems")

    assert engine.search('"distributed systems') == []
    assert engine.search('distributed systems"') == []


def test_wildcard_inside_phrase_is_not_a_prefix_query() -> None:
    engine = SearchEngine()
    engine.index("doc-1", "distributed systems")

    assert engine.search('"dist* systems"') == []

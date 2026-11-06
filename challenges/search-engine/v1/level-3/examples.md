```python
engine = SearchEngine()

engine.add_document("doc-1", "Distributed systems are challenging")
engine.add_document("doc-2", "Distributed reliable systems")
engine.add_document("doc-3", "I study distributed systems")

assert sorted(engine.search_phrase("distributed systems")) == ["doc-1", "doc-3"]
assert engine.search_phrase("systems distributed") == []
assert sorted(engine.search_term("distributed")) == ["doc-1", "doc-2", "doc-3"]
assert sorted(engine.search_prefix("dist")) == ["doc-1", "doc-2", "doc-3"]
```

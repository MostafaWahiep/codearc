```python
engine = SearchEngine()

engine.add_document("doc-1", "Python programming")
engine.add_document("doc-2", "Progressive web applications")
engine.add_document("doc-3", "Product design")

assert sorted(engine.search_prefix("pro")) == ["doc-1", "doc-2", "doc-3"]
assert sorted(engine.search_prefix("prog")) == ["doc-1", "doc-2"]
assert engine.search_term("python") == ["doc-1"]
assert engine.search_term("py") == []
```

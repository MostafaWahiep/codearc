```python
engine = SearchEngine()

engine.add_document("doc-1", "Python is expressive")
engine.add_document("doc-2", "Python is popular")
engine.add_document("doc-3", "JavaScript is popular")

assert sorted(engine.search_term("python")) == ["doc-1", "doc-2"]
assert sorted(engine.search_term("popular")) == ["doc-2", "doc-3"]
assert engine.search_term("java") == []
```

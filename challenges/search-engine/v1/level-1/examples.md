```python
engine = SearchEngine()

engine.index("doc-1", "Python is expressive")
engine.index("doc-2", "Python is popular")
engine.index("doc-3", "JavaScript is popular")

assert engine.search("python") == ["doc-1", "doc-2"]
assert engine.search("popular") == ["doc-2", "doc-3"]
assert engine.search("java") == []
```

```python
engine = SearchEngine()

engine.index("doc-1", "Python programming")
engine.index("doc-2", "Progressive web applications")
engine.index("doc-3", "Product design")

assert engine.search("pro*") == ["doc-1", "doc-2", "doc-3"]
assert engine.search("prog*") == ["doc-1", "doc-2"]
assert engine.search("python") == ["doc-1"]
assert engine.search("py") == []
```

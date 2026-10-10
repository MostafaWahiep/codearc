```python
engine = SearchEngine()

engine.index("doc-1", "Distributed systems are challenging")
engine.index("doc-2", "Distributed reliable systems")
engine.index("doc-3", "I study distributed systems")

assert engine.search('"distributed systems"') == ["doc-1", "doc-3"]
assert engine.search('"systems distributed"') == []
assert engine.search("distributed") == ["doc-1", "doc-2", "doc-3"]
assert engine.search("dist*") == ["doc-1", "doc-2", "doc-3"]
```

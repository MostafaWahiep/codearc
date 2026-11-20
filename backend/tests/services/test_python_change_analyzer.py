import unittest

from app.domain.submission import SourceFile, SourceSnapshot
from app.services.python_change_analyzer import (
    InvalidPythonSource,
    PythonChangeImpactAnalyzer,
)


class PythonChangeImpactAnalyzerTests(unittest.TestCase):
    def setUp(self) -> None:
        self.analyzer = PythonChangeImpactAnalyzer()

    def test_identical_snapshots_have_no_change_impact(self) -> None:
        snapshot = self._snapshot(
            ("search_engine.py", "def search_term(term):\n    return []\n"),
        )

        impact = self.analyzer.analyze(snapshot, snapshot)

        self.assertEqual(impact.changed_files, ())
        self.assertEqual(impact.changed_file_count, 0)
        self.assertEqual(impact.modified_method_count, 0)
        self.assertEqual(impact.changed_line_count, 0)

    def test_reports_changes_to_existing_methods_separately_from_new_methods(
        self,
    ) -> None:
        previous = self._snapshot(
            (
                "search_engine.py",
                "class SearchEngine:\n"
                "    def search_term(self, term):\n"
                "        return self.index.get(term, [])\n",
            ),
        )
        current = self._snapshot(
            (
                "search_engine.py",
                "class SearchEngine:\n"
                "    def search_term(self, term):\n"
                "        normalized = term.lower()\n"
                "        return self.index.get(normalized, [])\n"
                "\n"
                "    def search_prefix(self, prefix):\n"
                "        return []\n",
            ),
        )

        impact = self.analyzer.analyze(previous, current)

        self.assertEqual(impact.changed_file_count, 1)
        file_impact = impact.changed_files[0]
        self.assertEqual(file_impact.path, "search_engine.py")
        self.assertEqual(
            file_impact.added_methods,
            ("SearchEngine.search_prefix",),
        )
        self.assertEqual(file_impact.removed_methods, ())
        self.assertEqual(len(file_impact.modified_methods), 1)
        method = file_impact.modified_methods[0]
        self.assertEqual(method.qualified_name, "SearchEngine.search_term")
        self.assertEqual(method.lines_added, 2)
        self.assertEqual(method.lines_removed, 1)
        self.assertEqual(method.changed_line_count, 3)
        self.assertEqual(impact.modified_method_count, 1)
        self.assertEqual(impact.changed_line_count, 3)

    def test_reports_removed_methods_without_counting_them_as_modified(self) -> None:
        previous = self._snapshot(
            (
                "search_engine.py",
                "def search_term(term):\n"
                "    return []\n"
                "\n"
                "def unused_helper():\n"
                "    return None\n",
            ),
        )
        current = self._snapshot(
            ("search_engine.py", "def search_term(term):\n    return []\n"),
        )

        impact = self.analyzer.analyze(previous, current)

        self.assertEqual(
            impact.changed_files[0].removed_methods,
            ("unused_helper",),
        )
        self.assertEqual(impact.modified_method_count, 0)
        self.assertEqual(impact.changed_line_count, 0)

    def test_counts_added_removed_and_non_python_files_as_changed(self) -> None:
        previous = self._snapshot(
            ("removed.py", "def old():\n    return True\n"),
            ("notes.md", "before\n"),
        )
        current = self._snapshot(
            ("added.py", "def new():\n    return True\n"),
            ("notes.md", "after\n"),
        )

        impact = self.analyzer.analyze(previous, current)

        self.assertEqual(impact.changed_file_count, 3)
        impacts_by_path = {
            file_impact.path: file_impact
            for file_impact in impact.changed_files
        }
        self.assertEqual(impacts_by_path["added.py"].added_methods, ("new",))
        self.assertEqual(
            impacts_by_path["removed.py"].removed_methods,
            ("old",),
        )
        self.assertEqual(impacts_by_path["notes.md"].modified_methods, ())

    def test_ignores_formatting_and_comment_only_method_changes(self) -> None:
        previous = self._snapshot(
            ("search_engine.py", "def search():\n    return []\n"),
        )
        current = self._snapshot(
            (
                "search_engine.py",
                "def search( ):\n"
                "    # This comment does not alter the design.\n"
                "    return []\n",
            ),
        )

        impact = self.analyzer.analyze(previous, current)

        self.assertEqual(impact.changed_file_count, 1)
        self.assertEqual(impact.modified_method_count, 0)
        self.assertEqual(impact.changed_line_count, 0)

    def test_uses_class_name_to_distinguish_methods_with_the_same_name(self) -> None:
        previous = self._snapshot(
            (
                "models.py",
                "class First:\n"
                "    def run(self):\n"
                "        return 1\n"
                "\n"
                "class Second:\n"
                "    def run(self):\n"
                "        return 1\n",
            ),
        )
        current = self._snapshot(
            (
                "models.py",
                "class First:\n"
                "    def run(self):\n"
                "        return 2\n"
                "\n"
                "class Second:\n"
                "    def run(self):\n"
                "        return 1\n",
            ),
        )

        impact = self.analyzer.analyze(previous, current)

        modified = impact.changed_files[0].modified_methods
        self.assertEqual(len(modified), 1)
        self.assertEqual(modified[0].qualified_name, "First.run")

    def test_rejects_invalid_python_with_its_source_location(self) -> None:
        previous = self._snapshot(
            ("search_engine.py", "def search():\n    return []\n"),
        )
        current = self._snapshot(
            ("search_engine.py", "def search(:\n    return []\n"),
        )

        with self.assertRaisesRegex(
            InvalidPythonSource,
            "search_engine.py:1",
        ):
            self.analyzer.analyze(previous, current)

    @staticmethod
    def _snapshot(*files: tuple[str, str]) -> SourceSnapshot:
        return SourceSnapshot(
            files=tuple(
                SourceFile(path=path, content=content)
                for path, content in files
            ),
        )


if __name__ == "__main__":
    unittest.main()

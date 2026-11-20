import ast
from dataclasses import dataclass
from difflib import SequenceMatcher

from app.domain.change_impact import ChangeImpact, FileImpact, ModifiedMethod
from app.domain.submission import SourceSnapshot


@dataclass(frozen=True)
class _MethodSource:
    qualified_name: str
    node: ast.FunctionDef | ast.AsyncFunctionDef
    lines: tuple[str, ...]


class InvalidPythonSource(ValueError):
    pass


class PythonAstChangeImpactAnalyzer:
    def analyze(
        self,
        previous: SourceSnapshot,
        current: SourceSnapshot,
    ) -> ChangeImpact:
        previous_files = self._files_by_path(previous)
        current_files = self._files_by_path(current)
        changed_paths = sorted(
            path
            for path in previous_files.keys() | current_files.keys()
            if previous_files.get(path) != current_files.get(path)
        )

        return ChangeImpact(
            changed_files=tuple(
                self._analyze_file(
                    path,
                    previous_files.get(path),
                    current_files.get(path),
                )
                for path in changed_paths
            ),
        )

    @staticmethod
    def _files_by_path(snapshot: SourceSnapshot) -> dict[str, str]:
        return {
            source_file.path: source_file.content
            for source_file in snapshot.files
        }

    def _analyze_file(
        self,
        path: str,
        previous_content: str | None,
        current_content: str | None,
    ) -> FileImpact:
        previous_methods = self._extract_methods(path, previous_content)
        current_methods = self._extract_methods(path, current_content)

        previous_names = previous_methods.keys()
        current_names = current_methods.keys()
        existing_names = sorted(previous_names & current_names)

        modified_methods = tuple(
            method
            for name in existing_names
            if (
                method := self._compare_method(
                    path,
                    previous_methods[name],
                    current_methods[name],
                )
            ) is not None
        )

        return FileImpact(
            path=path,
            added_methods=tuple(sorted(current_names - previous_names)),
            removed_methods=tuple(sorted(previous_names - current_names)),
            modified_methods=modified_methods,
        )

    def _extract_methods(
        self,
        path: str,
        content: str | None,
    ) -> dict[str, _MethodSource]:
        if content is None or not path.endswith(".py"):
            return {}

        try:
            module = ast.parse(content, filename=path)
        except SyntaxError as error:
            location = f"{path}:{error.lineno}" if error.lineno else path
            raise InvalidPythonSource(
                f"Could not analyze invalid Python source at {location}: "
                f"{error.msg}",
            ) from error

        lines = content.splitlines()
        methods: dict[str, _MethodSource] = {}
        self._collect_methods(module.body, (), lines, methods)
        return methods

    def _collect_methods(
        self,
        statements: list[ast.stmt],
        class_names: tuple[str, ...],
        lines: list[str],
        methods: dict[str, _MethodSource],
    ) -> None:
        for statement in statements:
            if isinstance(statement, ast.ClassDef):
                self._collect_methods(
                    statement.body,
                    (*class_names, statement.name),
                    lines,
                    methods,
                )
                continue

            if not isinstance(statement, (ast.FunctionDef, ast.AsyncFunctionDef)):
                continue

            qualified_name = ".".join((*class_names, statement.name))
            start_line = min(
                (decorator.lineno for decorator in statement.decorator_list),
                default=statement.lineno,
            )
            end_line = statement.end_lineno or statement.lineno
            methods[qualified_name] = _MethodSource(
                qualified_name=qualified_name,
                node=statement,
                lines=tuple(lines[start_line - 1:end_line]),
            )

    @staticmethod
    def _compare_method(
        path: str,
        previous: _MethodSource,
        current: _MethodSource,
    ) -> ModifiedMethod | None:
        if ast.dump(previous.node, include_attributes=False) == ast.dump(
            current.node,
            include_attributes=False,
        ):
            return None

        lines_added = 0
        lines_removed = 0
        matcher = SequenceMatcher(
            None,
            previous.lines,
            current.lines,
            autojunk=False,
        )
        for operation, previous_start, previous_end, current_start, current_end in (
            matcher.get_opcodes()
        ):
            if operation in {"replace", "delete"}:
                lines_removed += previous_end - previous_start
            if operation in {"replace", "insert"}:
                lines_added += current_end - current_start

        return ModifiedMethod(
            file_path=path,
            qualified_name=previous.qualified_name,
            lines_added=lines_added,
            lines_removed=lines_removed,
        )

from dataclasses import dataclass


@dataclass(frozen=True)
class ModifiedMethod:
    file_path: str
    qualified_name: str
    lines_added: int
    lines_removed: int

    @property
    def changed_line_count(self) -> int:
        return self.lines_added + self.lines_removed


@dataclass(frozen=True)
class FileImpact:
    path: str
    added_methods: tuple[str, ...]
    removed_methods: tuple[str, ...]
    modified_methods: tuple[ModifiedMethod, ...]


@dataclass(frozen=True)
class ChangeImpact:
    changed_files: tuple[FileImpact, ...]

    @property
    def changed_file_count(self) -> int:
        return len(self.changed_files)

    @property
    def modified_method_count(self) -> int:
        return sum(
            len(file.modified_methods)
            for file in self.changed_files
        )

    @property
    def changed_line_count(self) -> int:
        return sum(
            method.changed_line_count
            for file in self.changed_files
            for method in file.modified_methods
        )

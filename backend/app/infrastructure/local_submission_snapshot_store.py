import hashlib
import json
import re
import shutil
import tempfile
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath
from typing import Any
from uuid import UUID

from app.domain.submission import (
    SnapshotContext,
    SnapshotFileManifest,
    SnapshotManifest,
    SourceFile,
    SourceSnapshot,
    Submission,
)
from app.repositories.submission_snapshot_store import (
    InvalidSnapshot,
    SnapshotAlreadyExists,
    SnapshotDestinationNotEmpty,
    SnapshotIntegrityError,
    SnapshotNotFound,
    SubmissionSnapshotStore,
)


_MANIFEST_SCHEMA_VERSION = 1
_MANIFEST_FILE_NAME = "manifest.json"
_SOURCE_DIRECTORY_NAME = "source"
_SHA256_PATTERN = re.compile(r"^[0-9a-f]{64}$")
_FORBIDDEN_ROOT_DIRECTORIES = frozenset(
    {
        ".codearc",
        ".git",
        ".venv",
        "__pycache__",
        "node_modules",
        "venv",
    },
)


class LocalSubmissionSnapshotStore(SubmissionSnapshotStore):
    def __init__(self, root_path: Path | str) -> None:
        self._root_path = Path(root_path)

    def save(
        self,
        submission: Submission,
        snapshot: SourceSnapshot,
        context: SnapshotContext,
    ) -> SnapshotManifest:
        prepared_files = self._prepare_files(snapshot)
        self._validate_context(context)
        created_at = self._as_utc(submission.created_at)
        file_manifests = tuple(
            SnapshotFileManifest(
                path=source_file.path,
                sha256=file_hash,
                size_bytes=len(content),
            )
            for source_file, content, file_hash in prepared_files
        )
        manifest = SnapshotManifest(
            schema_version=_MANIFEST_SCHEMA_VERSION,
            submission_id=submission.id,
            attempt_id=submission.attempt_id,
            challenge_id=context.challenge_id,
            challenge_version=context.challenge_version,
            level_id=submission.level_id,
            sequence_number=submission.sequence_number,
            created_at=created_at,
            source_hash=self._source_hash(file_manifests),
            file_count=len(file_manifests),
            total_bytes=sum(file.size_bytes for file in file_manifests),
            files=file_manifests,
        )

        attempt_directory = self._root_path / str(submission.attempt_id)
        snapshot_directory = attempt_directory / str(submission.id)
        if snapshot_directory.exists():
            raise SnapshotAlreadyExists(
                f"Snapshot '{submission.id}' already exists for attempt "
                f"'{submission.attempt_id}'",
            )

        attempt_directory.mkdir(parents=True, exist_ok=True)
        temporary_directory = Path(
            tempfile.mkdtemp(
                prefix=f".{submission.id}.",
                suffix=".tmp",
                dir=attempt_directory,
            ),
        )
        try:
            source_directory = temporary_directory / _SOURCE_DIRECTORY_NAME
            source_directory.mkdir()
            for source_file, content, _ in prepared_files:
                target = source_directory.joinpath(*source_file.path.split("/"))
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(content)

            manifest_path = temporary_directory / _MANIFEST_FILE_NAME
            manifest_path.write_text(
                json.dumps(self._serialize_manifest(manifest), indent=2)
                + "\n",
                encoding="utf-8",
            )
            try:
                temporary_directory.rename(snapshot_directory)
            except FileExistsError as error:
                raise SnapshotAlreadyExists(
                    f"Snapshot '{submission.id}' already exists for attempt "
                    f"'{submission.attempt_id}'",
                ) from error
        except Exception:
            shutil.rmtree(temporary_directory, ignore_errors=True)
            raise

        return manifest

    def load(
        self,
        attempt_id: UUID,
        submission_id: UUID,
    ) -> SourceSnapshot:
        manifest = self.load_manifest(attempt_id, submission_id)
        files: list[SourceFile] = []
        for file in manifest.files:
            content = self._read_verified_file(
                attempt_id,
                submission_id,
                file,
            )
            try:
                decoded_content = content.decode("utf-8")
            except UnicodeDecodeError as error:
                raise SnapshotIntegrityError(
                    f"Snapshot source file '{file.path}' is not UTF-8",
                ) from error
            files.append(SourceFile(path=file.path, content=decoded_content))
        return SourceSnapshot(files=tuple(files))

    def load_manifest(
        self,
        attempt_id: UUID,
        submission_id: UUID,
    ) -> SnapshotManifest:
        manifest_path = self._snapshot_directory(
            attempt_id,
            submission_id,
        ) / _MANIFEST_FILE_NAME
        if not manifest_path.is_file() or manifest_path.is_symlink():
            raise SnapshotNotFound(
                f"Snapshot '{submission_id}' was not found for attempt "
                f"'{attempt_id}'",
            )

        try:
            value = json.loads(manifest_path.read_text(encoding="utf-8"))
            manifest = self._parse_manifest(value)
        except SnapshotIntegrityError:
            raise
        except (
            OSError,
            UnicodeError,
            json.JSONDecodeError,
            TypeError,
            ValueError,
        ) as error:
            raise SnapshotIntegrityError(
                f"Snapshot manifest '{manifest_path}' is invalid",
            ) from error

        if (
            manifest.attempt_id != attempt_id
            or manifest.submission_id != submission_id
        ):
            raise SnapshotIntegrityError(
                "Snapshot manifest identity does not match its storage location",
            )
        return manifest

    def materialize(
        self,
        attempt_id: UUID,
        submission_id: UUID,
        destination: Path,
    ) -> None:
        destination = Path(destination)
        if destination.exists():
            if not destination.is_dir() or any(destination.iterdir()):
                raise SnapshotDestinationNotEmpty(
                    f"Snapshot destination '{destination}' must be an empty directory",
                )
        else:
            destination.mkdir(parents=True)

        manifest = self.load_manifest(attempt_id, submission_id)
        for file in manifest.files:
            target = destination.joinpath(*file.path.split("/"))
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(
                self._read_verified_file(attempt_id, submission_id, file),
            )

    def delete(
        self,
        attempt_id: UUID,
        submission_id: UUID,
    ) -> None:
        snapshot_directory = self._snapshot_directory(attempt_id, submission_id)
        if snapshot_directory.exists():
            shutil.rmtree(snapshot_directory)
        attempt_directory = snapshot_directory.parent
        try:
            attempt_directory.rmdir()
        except OSError:
            pass

    def _prepare_files(
        self,
        snapshot: SourceSnapshot,
    ) -> tuple[tuple[SourceFile, bytes, str], ...]:
        if not snapshot.files:
            raise InvalidSnapshot(
                "A submission snapshot must contain at least one file",
            )

        prepared: list[tuple[SourceFile, bytes, str]] = []
        paths: set[str] = set()
        for source_file in snapshot.files:
            normalized_path = self._validate_relative_path(source_file.path)
            if normalized_path in paths:
                raise InvalidSnapshot(
                    f"Snapshot contains duplicate file path '{normalized_path}'",
                )
            paths.add(normalized_path)
            try:
                content = source_file.content.encode("utf-8")
            except UnicodeEncodeError as error:
                raise InvalidSnapshot(
                    f"Snapshot source file '{normalized_path}' is not valid UTF-8",
                ) from error
            prepared.append(
                (
                    SourceFile(path=normalized_path, content=source_file.content),
                    content,
                    hashlib.sha256(content).hexdigest(),
                ),
            )

        return tuple(sorted(prepared, key=lambda item: item[0].path))

    def _read_verified_file(
        self,
        attempt_id: UUID,
        submission_id: UUID,
        file: SnapshotFileManifest,
    ) -> bytes:
        source_path = (
            self._snapshot_directory(attempt_id, submission_id)
            / _SOURCE_DIRECTORY_NAME
        ).joinpath(*file.path.split("/"))
        if source_path.is_symlink():
            raise SnapshotIntegrityError(
                f"Snapshot source file '{file.path}' must not be a symbolic link",
            )
        try:
            content = source_path.read_bytes()
        except OSError as error:
            raise SnapshotIntegrityError(
                f"Snapshot source file '{file.path}' is missing or unreadable",
            ) from error

        if len(content) != file.size_bytes:
            raise SnapshotIntegrityError(
                f"Snapshot source file '{file.path}' has the wrong size",
            )
        if hashlib.sha256(content).hexdigest() != file.sha256:
            raise SnapshotIntegrityError(
                f"Snapshot source file '{file.path}' has the wrong hash",
            )
        return content

    def _snapshot_directory(
        self,
        attempt_id: UUID,
        submission_id: UUID,
    ) -> Path:
        return self._root_path / str(attempt_id) / str(submission_id)

    @staticmethod
    def _validate_context(context: SnapshotContext) -> None:
        if not context.challenge_id.strip():
            raise InvalidSnapshot("Snapshot challenge ID must not be empty")
        if not context.challenge_version.strip():
            raise InvalidSnapshot("Snapshot challenge version must not be empty")

    @staticmethod
    def _validate_relative_path(value: str) -> str:
        if not value or "\\" in value or "\x00" in value:
            raise InvalidSnapshot(f"Unsafe snapshot file path '{value}'")
        path = PurePosixPath(value)
        normalized = path.as_posix()
        if (
            path.is_absolute()
            or normalized != value
            or any(part in {".", ".."} for part in path.parts)
            or path.parts[0] in _FORBIDDEN_ROOT_DIRECTORIES
        ):
            raise InvalidSnapshot(f"Unsafe snapshot file path '{value}'")
        return normalized

    @staticmethod
    def _source_hash(files: tuple[SnapshotFileManifest, ...]) -> str:
        digest = hashlib.sha256()
        for file in files:
            digest.update(file.path.encode("utf-8"))
            digest.update(b"\0")
            digest.update(bytes.fromhex(file.sha256))
            digest.update(b"\0")
        return digest.hexdigest()

    @staticmethod
    def _as_utc(value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise InvalidSnapshot("Submission creation time must include a timezone")
        return value.astimezone(timezone.utc)

    @staticmethod
    def _serialize_manifest(manifest: SnapshotManifest) -> dict[str, Any]:
        return {
            "schemaVersion": manifest.schema_version,
            "submissionId": str(manifest.submission_id),
            "attemptId": str(manifest.attempt_id),
            "challengeId": manifest.challenge_id,
            "challengeVersion": manifest.challenge_version,
            "levelId": manifest.level_id,
            "sequenceNumber": manifest.sequence_number,
            "createdAt": manifest.created_at.isoformat(),
            "sourceHash": manifest.source_hash,
            "fileCount": manifest.file_count,
            "totalBytes": manifest.total_bytes,
            "files": [
                {
                    "path": file.path,
                    "sha256": file.sha256,
                    "sizeBytes": file.size_bytes,
                }
                for file in manifest.files
            ],
        }

    @classmethod
    def _parse_manifest(cls, value: Any) -> SnapshotManifest:
        if not isinstance(value, dict):
            raise SnapshotIntegrityError("Snapshot manifest must be a JSON object")
        files_value = value.get("files")
        if not isinstance(files_value, list):
            raise SnapshotIntegrityError("Snapshot manifest files must be a list")

        files = tuple(cls._parse_file_manifest(file) for file in files_value)
        if len({file.path for file in files}) != len(files):
            raise SnapshotIntegrityError("Snapshot manifest contains duplicate paths")

        manifest = SnapshotManifest(
            schema_version=cls._required_int(value, "schemaVersion"),
            submission_id=UUID(cls._required_string(value, "submissionId")),
            attempt_id=UUID(cls._required_string(value, "attemptId")),
            challenge_id=cls._required_string(value, "challengeId"),
            challenge_version=cls._required_string(value, "challengeVersion"),
            level_id=cls._required_string(value, "levelId"),
            sequence_number=cls._required_int(value, "sequenceNumber"),
            created_at=cls._parse_datetime(value, "createdAt"),
            source_hash=cls._required_hash(value, "sourceHash"),
            file_count=cls._required_int(value, "fileCount"),
            total_bytes=cls._required_int(value, "totalBytes"),
            files=files,
        )
        cls._validate_manifest(manifest)
        return manifest

    @classmethod
    def _parse_file_manifest(cls, value: Any) -> SnapshotFileManifest:
        if not isinstance(value, dict):
            raise SnapshotIntegrityError("Snapshot file metadata must be an object")
        try:
            path = cls._validate_relative_path(
                cls._required_string(value, "path"),
            )
        except InvalidSnapshot as error:
            raise SnapshotIntegrityError(
                "Snapshot manifest contains an unsafe file path",
            ) from error
        size_bytes = cls._required_int(value, "sizeBytes")
        if size_bytes < 0:
            raise SnapshotIntegrityError("Snapshot file size must not be negative")
        return SnapshotFileManifest(
            path=path,
            sha256=cls._required_hash(value, "sha256"),
            size_bytes=size_bytes,
        )

    @classmethod
    def _validate_manifest(cls, manifest: SnapshotManifest) -> None:
        if manifest.schema_version != _MANIFEST_SCHEMA_VERSION:
            raise SnapshotIntegrityError(
                f"Unsupported snapshot manifest version {manifest.schema_version}",
            )
        if manifest.sequence_number <= 0:
            raise SnapshotIntegrityError(
                "Snapshot manifest sequence number must be positive",
            )
        if not manifest.files:
            raise SnapshotIntegrityError(
                "Snapshot manifest must contain at least one file",
            )
        if manifest.file_count != len(manifest.files):
            raise SnapshotIntegrityError("Snapshot manifest file count is incorrect")
        if manifest.total_bytes != sum(file.size_bytes for file in manifest.files):
            raise SnapshotIntegrityError("Snapshot manifest total size is incorrect")
        if manifest.source_hash != cls._source_hash(manifest.files):
            raise SnapshotIntegrityError("Snapshot manifest source hash is incorrect")

    @staticmethod
    def _required_string(value: dict[str, Any], key: str) -> str:
        result = value.get(key)
        if not isinstance(result, str) or not result:
            raise SnapshotIntegrityError(
                f"Snapshot manifest field '{key}' must be a non-empty string",
            )
        return result

    @staticmethod
    def _required_int(value: dict[str, Any], key: str) -> int:
        result = value.get(key)
        if not isinstance(result, int) or isinstance(result, bool):
            raise SnapshotIntegrityError(
                f"Snapshot manifest field '{key}' must be an integer",
            )
        return result

    @classmethod
    def _required_hash(cls, value: dict[str, Any], key: str) -> str:
        result = cls._required_string(value, key)
        if not _SHA256_PATTERN.fullmatch(result):
            raise SnapshotIntegrityError(
                f"Snapshot manifest field '{key}' must be a SHA-256 hash",
            )
        return result

    @classmethod
    def _parse_datetime(cls, value: dict[str, Any], key: str) -> datetime:
        result = datetime.fromisoformat(cls._required_string(value, key))
        if result.tzinfo is None or result.utcoffset() is None:
            raise SnapshotIntegrityError(
                f"Snapshot manifest field '{key}' must include a timezone",
            )
        return result.astimezone(timezone.utc)

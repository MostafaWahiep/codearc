import json
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from uuid import UUID, uuid4

from app.domain.submission import (
    SnapshotContext,
    SourceFile,
    SourceSnapshot,
    Submission,
    SubmissionStatus,
)
from app.infrastructure.local_submission_snapshot_store import (
    LocalSubmissionSnapshotStore,
)
from app.repositories.submission_snapshot_store import (
    InvalidSnapshot,
    SnapshotAlreadyExists,
    SnapshotDestinationNotEmpty,
    SnapshotIntegrityError,
    SnapshotNotFound,
)


class LocalSubmissionSnapshotStoreTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary_directory.name)
        self.store = LocalSubmissionSnapshotStore(self.root)
        self.submission = self._submission()
        self.context = SnapshotContext(
            challenge_id="search-engine",
            challenge_version="1",
        )

    def tearDown(self) -> None:
        self.temporary_directory.cleanup()

    def test_saves_manifest_and_loads_snapshot(self) -> None:
        snapshot = self._snapshot()

        manifest = self.store.save(self.submission, snapshot, self.context)
        loaded_manifest = self.store.load_manifest(
            self.submission.attempt_id,
            self.submission.id,
        )
        loaded_snapshot = self.store.load(
            self.submission.attempt_id,
            self.submission.id,
        )

        self.assertEqual(loaded_manifest, manifest)
        self.assertEqual(manifest.schema_version, 1)
        self.assertEqual(manifest.challenge_id, "search-engine")
        self.assertEqual(manifest.challenge_version, "1")
        self.assertEqual(manifest.file_count, 2)
        self.assertEqual(
            manifest.total_bytes,
            sum(len(file.content.encode("utf-8")) for file in snapshot.files),
        )
        self.assertEqual(len(manifest.source_hash), 64)
        self.assertEqual(
            loaded_snapshot.files,
            tuple(sorted(snapshot.files, key=lambda file: file.path)),
        )

        snapshot_directory = self._snapshot_directory(self.submission)
        stored_manifest = json.loads(
            snapshot_directory.joinpath("manifest.json").read_text("utf-8"),
        )
        self.assertEqual(stored_manifest["submissionId"], str(self.submission.id))
        self.assertEqual(stored_manifest["fileCount"], 2)
        self.assertTrue(
            snapshot_directory.joinpath("source", "search_engine.py").is_file(),
        )

    def test_source_hash_is_independent_of_file_order(self) -> None:
        snapshot = self._snapshot()
        first_manifest = self.store.save(
            self.submission,
            snapshot,
            self.context,
        )
        second_submission = self._submission(
            attempt_id=self.submission.attempt_id,
            sequence_number=2,
        )
        second_manifest = self.store.save(
            second_submission,
            SourceSnapshot(files=tuple(reversed(snapshot.files))),
            self.context,
        )

        self.assertEqual(first_manifest.source_hash, second_manifest.source_hash)

    def test_materializes_snapshot_into_empty_directory(self) -> None:
        self.store.save(self.submission, self._snapshot(), self.context)
        destination = self.root / "runner" / "workspace"

        self.store.materialize(
            self.submission.attempt_id,
            self.submission.id,
            destination,
        )

        self.assertEqual(
            destination.joinpath("search_engine.py").read_text("utf-8"),
            "class SearchEngine:\n    pass\n",
        )
        self.assertEqual(
            destination.joinpath("src", "tokenizer.py").read_text("utf-8"),
            "def tokenize(text):\n    return text.split()\n",
        )

    def test_rejects_unsafe_and_internal_paths(self) -> None:
        unsafe_paths = (
            "",
            "/absolute.py",
            "../outside.py",
            "src/../outside.py",
            "./search_engine.py",
            "src\\tokenizer.py",
            ".codearc/tests/test_search.py",
            ".git/config",
            ".venv/bin/python",
        )

        for path in unsafe_paths:
            with self.subTest(path=path):
                snapshot = SourceSnapshot(
                    files=(SourceFile(path=path, content="pass\n"),),
                )
                with self.assertRaises(InvalidSnapshot):
                    self.store.save(self.submission, snapshot, self.context)

    def test_rejects_duplicate_file_paths(self) -> None:
        snapshot = SourceSnapshot(
            files=(
                SourceFile(path="search_engine.py", content="first"),
                SourceFile(path="search_engine.py", content="second"),
            ),
        )

        with self.assertRaises(InvalidSnapshot):
            self.store.save(self.submission, snapshot, self.context)

    def test_rejects_empty_snapshot(self) -> None:
        with self.assertRaises(InvalidSnapshot):
            self.store.save(
                self.submission,
                SourceSnapshot(files=()),
                self.context,
            )

    def test_never_overwrites_existing_snapshot(self) -> None:
        original = self._snapshot()
        self.store.save(self.submission, original, self.context)

        with self.assertRaises(SnapshotAlreadyExists):
            self.store.save(
                self.submission,
                SourceSnapshot(
                    files=(SourceFile(path="search_engine.py", content="changed"),),
                ),
                self.context,
            )

        self.assertEqual(
            self.store.load(self.submission.attempt_id, self.submission.id).files,
            tuple(sorted(original.files, key=lambda file: file.path)),
        )

    def test_detects_tampered_source_file(self) -> None:
        self.store.save(self.submission, self._snapshot(), self.context)
        source_file = self._snapshot_directory(self.submission).joinpath(
            "source",
            "search_engine.py",
        )
        source_file.write_text("tampered\n", encoding="utf-8")

        with self.assertRaises(SnapshotIntegrityError):
            self.store.load(self.submission.attempt_id, self.submission.id)

    def test_detects_tampered_manifest(self) -> None:
        self.store.save(self.submission, self._snapshot(), self.context)
        manifest_path = self._snapshot_directory(self.submission).joinpath(
            "manifest.json",
        )
        manifest = json.loads(manifest_path.read_text("utf-8"))
        manifest["fileCount"] = 99
        manifest_path.write_text(json.dumps(manifest), encoding="utf-8")

        with self.assertRaises(SnapshotIntegrityError):
            self.store.load_manifest(
                self.submission.attempt_id,
                self.submission.id,
            )

    def test_requires_empty_materialization_destination(self) -> None:
        self.store.save(self.submission, self._snapshot(), self.context)
        destination = self.root / "runner"
        destination.mkdir()
        destination.joinpath("existing.py").write_text("pass\n", encoding="utf-8")

        with self.assertRaises(SnapshotDestinationNotEmpty):
            self.store.materialize(
                self.submission.attempt_id,
                self.submission.id,
                destination,
            )

    def test_deletes_snapshot_idempotently(self) -> None:
        self.store.save(self.submission, self._snapshot(), self.context)

        self.store.delete(self.submission.attempt_id, self.submission.id)
        self.store.delete(self.submission.attempt_id, self.submission.id)

        with self.assertRaises(SnapshotNotFound):
            self.store.load_manifest(
                self.submission.attempt_id,
                self.submission.id,
            )

    def _snapshot_directory(self, submission: Submission) -> Path:
        return self.root / str(submission.attempt_id) / str(submission.id)

    @staticmethod
    def _snapshot() -> SourceSnapshot:
        return SourceSnapshot(
            files=(
                SourceFile(
                    path="src/tokenizer.py",
                    content="def tokenize(text):\n    return text.split()\n",
                ),
                SourceFile(
                    path="search_engine.py",
                    content="class SearchEngine:\n    pass\n",
                ),
            ),
        )

    @staticmethod
    def _submission(
        *,
        attempt_id: UUID | None = None,
        sequence_number: int = 1,
    ) -> Submission:
        return Submission(
            id=uuid4(),
            attempt_id=attempt_id or uuid4(),
            level_id="single-term-search",
            sequence_number=sequence_number,
            status=SubmissionStatus.RECEIVED,
            created_at=datetime(2026, 11, 14, 12, tzinfo=timezone.utc),
            started_at=None,
            completed_at=None,
        )


if __name__ == "__main__":
    unittest.main()

from pathlib import Path
from typing import Protocol
from uuid import UUID

from app.domain.submission import (
    SnapshotContext,
    SnapshotManifest,
    SourceSnapshot,
    Submission,
)


class SnapshotStoreError(RuntimeError):
    pass


class SnapshotAlreadyExists(SnapshotStoreError):
    pass


class SnapshotNotFound(SnapshotStoreError):
    pass


class InvalidSnapshot(SnapshotStoreError):
    pass


class SnapshotIntegrityError(SnapshotStoreError):
    pass


class SnapshotDestinationNotEmpty(SnapshotStoreError):
    pass


class SubmissionSnapshotStore(Protocol):
    def save(
        self,
        submission: Submission,
        snapshot: SourceSnapshot,
        context: SnapshotContext,
    ) -> SnapshotManifest:
        ...

    def load(
        self,
        attempt_id: UUID,
        submission_id: UUID,
    ) -> SourceSnapshot:
        ...

    def load_manifest(
        self,
        attempt_id: UUID,
        submission_id: UUID,
    ) -> SnapshotManifest:
        ...

    def materialize(
        self,
        attempt_id: UUID,
        submission_id: UUID,
        destination: Path,
    ) -> None:
        ...

    def delete(
        self,
        attempt_id: UUID,
        submission_id: UUID,
    ) -> None:
        ...

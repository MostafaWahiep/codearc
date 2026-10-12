import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock

from app.infrastructure.file_challenge_repository import (
    ChallengeReleaseNotFound,
    FileChallengeRepository,
    InvalidChallengePackage,
)
from app.validation.manifest_validator import ManifestValidator


class FileChallengeRepositoryTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.challenges_root = Path(self.temporary_directory.name)
        self.validator = Mock(spec=ManifestValidator)

    def tearDown(self) -> None:
        self.temporary_directory.cleanup()

    def test_caches_all_releases_and_supports_exact_lookup(self) -> None:
        first_path = self._write_manifest("search-engine", "1")
        second_path = self._write_manifest("search-engine", "2")

        repository = FileChallengeRepository(
            challenges_root=self.challenges_root,
            validator=self.validator,
        )
        first_path.unlink()
        second_path.unlink()

        self.assertEqual(
            tuple(manifest.version for manifest in repository.list_manifests()),
            ("1", "2"),
        )
        self.assertEqual(repository.get_manifest("search-engine", "1").version, "1")
        self.assertEqual(self.validator.validate.call_count, 2)

    def test_unknown_release_raises_not_found(self) -> None:
        repository = FileChallengeRepository(
            challenges_root=self.challenges_root,
            validator=self.validator,
        )

        with self.assertRaises(ChallengeReleaseNotFound):
            repository.get_manifest("search-engine", "1")

    def test_rejects_manifest_id_that_differs_from_directory(self) -> None:
        self._write_manifest(
            directory_id="search-engine",
            version="1",
            manifest_id="message-queue",
        )

        with self.assertRaisesRegex(InvalidChallengePackage, "does not match"):
            FileChallengeRepository(self.challenges_root, self.validator)

    def test_rejects_manifest_version_that_differs_from_directory(self) -> None:
        self._write_manifest(
            directory_id="search-engine",
            version="1",
            manifest_version="2",
        )

        with self.assertRaisesRegex(InvalidChallengePackage, "does not match"):
            FileChallengeRepository(self.challenges_root, self.validator)

    def test_rejects_invalid_version_directory(self) -> None:
        self._write_manifest("search-engine", "01")

        with self.assertRaisesRegex(InvalidChallengePackage, "Invalid version directory"):
            FileChallengeRepository(self.challenges_root, self.validator)

    def _write_manifest(
        self,
        directory_id: str,
        version: str,
        *,
        manifest_id: str | None = None,
        manifest_version: str | None = None,
    ) -> Path:
        manifest_path = (
            self.challenges_root
            / directory_id
            / f"v{version}"
            / "challenge.json"
        )
        manifest_path.parent.mkdir(parents=True)
        manifest = {
            "id": manifest_id or directory_id,
            "version": manifest_version or version,
            "title": "Build a Search Engine",
            "description": "Build an evolving search engine.",
            "starterPath": "starter",
            "entrypointPath": "starter/search_engine.py",
            "levels": [
                {
                    "id": "single-term-search",
                    "title": "Level 1: Single-Term Search",
                    "sections": [
                        {
                            "id": "api",
                            "title": "Public API",
                            "contentPath": "level-1/api.md",
                            "display": "expanded",
                        }
                    ],
                    "designFeedbackPath": "level-1/design-feedback.md",
                    "testsPath": "level-1/tests",
                }
            ],
        }
        manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
        return manifest_path


if __name__ == "__main__":
    unittest.main()

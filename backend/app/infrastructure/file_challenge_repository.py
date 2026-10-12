import json
import re
from pathlib import Path

from app.domain.challenge import ChallengeManifest
from app.domain.challenge_level import LoadedChallengeLevel
from app.infrastructure.challenge_manifest_mapper import map_challenge_manifest
from app.validation.manifest_validator import (
    InvalidChallengeManifest,
    ManifestValidator,
)


CHALLENGE_MANIFEST_NAME = "challenge.json"
VERSION_DIRECTORY_PATTERN = re.compile(r"^v[1-9]\d*$")


class InvalidChallengePackage(ValueError):
    pass


class ChallengeReleaseNotFound(LookupError):
    pass


class FileChallengeRepository:
    def __init__(
        self,
        challenges_root: Path,
        validator: ManifestValidator,
    ):
        self._challenges_root = challenges_root
        self._validator = validator
        self._manifests = self._load_manifests()

    def list_manifests(self) -> tuple[ChallengeManifest, ...]:
        return tuple(
            sorted(
                self._manifests.values(),
                key=lambda manifest: (manifest.id, int(manifest.version)),
            )
        )

    def get_manifest(
        self,
        challenge_id: str,
        version: str,
    ) -> ChallengeManifest:
        try:
            return self._manifests[(challenge_id, version)]
        except KeyError as error:
            raise ChallengeReleaseNotFound(
                f"Challenge release '{challenge_id}' version '{version}' was not found"
            ) from error

    def load_level(
        self,
        challenge_id: str,
        version: str,
        level_id: str,
    ) -> LoadedChallengeLevel:
        raise NotImplementedError("Challenge level loading is not implemented yet")

    def load_design_feedback(
        self,
        challenge_id: str,
        version: str,
        level_id: str,
    ) -> str:
        raise NotImplementedError("Design feedback loading is not implemented yet")

    def _load_manifests(self) -> dict[tuple[str, str], ChallengeManifest]:
        if not self._challenges_root.is_dir():
            raise InvalidChallengePackage(
                f"Challenges root does not exist: {self._challenges_root}"
            )

        manifests: dict[tuple[str, str], ChallengeManifest] = {}
        manifest_paths = sorted(
            self._challenges_root.glob(f"*/*/{CHALLENGE_MANIFEST_NAME}")
        )

        for manifest_path in manifest_paths:
            manifest = self._load_manifest(manifest_path)
            key = (manifest.id, manifest.version)
            if key in manifests:
                raise InvalidChallengePackage(
                    f"Duplicate challenge release '{manifest.id}' version "
                    f"'{manifest.version}'"
                )
            manifests[key] = manifest

        return manifests

    def _load_manifest(self, manifest_path: Path) -> ChallengeManifest:
        challenge_directory = manifest_path.parent.parent
        version_directory = manifest_path.parent

        if not VERSION_DIRECTORY_PATTERN.fullmatch(version_directory.name):
            raise InvalidChallengePackage(
                f"Invalid version directory '{version_directory.name}' at {manifest_path}"
            )

        try:
            raw_manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            self._validator.validate(raw_manifest)
        except (OSError, json.JSONDecodeError, InvalidChallengeManifest) as error:
            raise InvalidChallengePackage(
                f"Could not load challenge manifest at {manifest_path}: {error}"
            ) from error

        manifest = map_challenge_manifest(raw_manifest)

        if manifest.id != challenge_directory.name:
            raise InvalidChallengePackage(
                f"Manifest id '{manifest.id}' does not match challenge directory "
                f"'{challenge_directory.name}'"
            )

        expected_version_directory = f"v{manifest.version}"
        if expected_version_directory != version_directory.name:
            raise InvalidChallengePackage(
                f"Manifest version '{manifest.version}' does not match version directory "
                f"'{version_directory.name}'"
            )

        return manifest

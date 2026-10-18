import json
import re
from pathlib import Path

from app.domain.challenge import ChallengeManifest
from app.domain.challenge_level import (
    ChallengeLevelDefinition,
    LoadedChallengeLevel,
)
from app.domain.level_section import LevelSection
from app.domain.test_bundle import PublicTestFile, TestCategory
from app.infrastructure.challenge_manifest_mapper import map_challenge_manifest
from app.repositories.challenge_repository import ChallengeNotFound, ChallengeRepository
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


class ChallengeLevelNotFound(LookupError):
    pass


class FileChallengeRepository(ChallengeRepository):
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

    def get_latest_manifest(
        self,
        challenge_id: str,
    ) -> ChallengeManifest:
        manifest = max(
            (
                manifest
                for manifest in self._manifests.values()
                if manifest.id == challenge_id
            ),
            key=lambda item: int(item.version),
            default=None,
        )

        if manifest is None:
            raise ChallengeNotFound(challenge_id)

        return manifest

    def load_level(
        self,
        challenge_id: str,
        version: str,
        level_id: str,
    ) -> LoadedChallengeLevel:
        manifest = self.get_manifest(challenge_id, version)

        level_definition = self._get_level_definition(manifest, level_id)
        sections = self._load_sections(manifest, level_definition)

        return LoadedChallengeLevel(
            id=level_definition.id,
            title=level_definition.title,
            sections=sections,
        )

    def load_design_feedback(
        self,
        challenge_id: str,
        version: str,
        level_id: str,
    ) -> str:
        manifest = self.get_manifest(challenge_id, version)
        level_definition = self._get_level_definition(manifest, level_id)

        challenge_path = self._challenges_root.joinpath(
            manifest.id,
            f"v{manifest.version}",
        )

        return self._read_text_within(
            challenge_path,
            challenge_path / level_definition.design_feedback_path,
            "challenge content file",
        )

    def load_public_tests(
        self,
        challenge_id: str,
        version: str,
        level_id: str,
    ) -> tuple[PublicTestFile, ...]:
        manifest = self.get_manifest(challenge_id, version)
        level_definition = self._get_level_definition(manifest, level_id)
        challenge_path = self._challenges_root.joinpath(
            manifest.id,
            f"v{manifest.version}",
        ).resolve()
        tests_path = (challenge_path / level_definition.tests_path).resolve()

        try:
            tests_path.relative_to(challenge_path)
        except ValueError as error:
            raise InvalidChallengePackage(
                f"Tests path '{level_definition.tests_path}' points outside "
                f"challenge package '{challenge_path}'"
            ) from error

        if not tests_path.is_dir():
            raise InvalidChallengePackage(
                f"Challenge tests directory does not exist: {tests_path}"
            )

        files = tuple(
            PublicTestFile(
                level_id=level_id,
                path=file_path.relative_to(tests_path).as_posix(),
                content=self._read_text_within(
                    tests_path,
                    file_path,
                    "public test file",
                ),
                category=TestCategory.CURRENT,
            )
            for file_path in sorted(tests_path.rglob("*"))
            if file_path.is_file()
            and "__pycache__" not in file_path.parts
            and file_path.suffix != ".pyc"
        )
        if not files:
            raise InvalidChallengePackage(
                f"Challenge tests directory is empty: {tests_path}"
            )
        return files

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

    def _get_level_definition(
        self,
        manifest: ChallengeManifest,
        level_id: str,
    ) -> ChallengeLevelDefinition:
        level_definitions = [
            level for level in manifest.levels if level.id == level_id
        ]

        if not level_definitions:
            raise ChallengeLevelNotFound(
                f"Level '{level_id}' was not found in challenge "
                f"'{manifest.id}' version '{manifest.version}'"
            )

        if len(level_definitions) > 1:
            raise InvalidChallengePackage(
                f"Duplicate level id '{level_id}' in challenge "
                f"'{manifest.id}' version '{manifest.version}'"
            )

        return level_definitions[0]

    def _load_sections(
        self,
        manifest: ChallengeManifest,
        level: ChallengeLevelDefinition,
    ) -> tuple[LevelSection, ...]:
        challenge_path = self._challenges_root.joinpath(
            manifest.id,
            f"v{manifest.version}",
        )

        return tuple(
            LevelSection(
                id=section.id,
                title=section.title,
                content=self._read_text_within(
                    challenge_path,
                    challenge_path / section.content_path,
                    "challenge content file",
                ),
                display=section.display,
            )
            for section in level.sections
        )

    def _read_text_within(
        self,
        root: Path,
        file_path: Path,
        description: str,
    ) -> str:
        resolved_root = root.resolve()
        resolved_file_path = file_path.resolve()

        try:
            resolved_file_path.relative_to(resolved_root)
        except ValueError as error:
            raise InvalidChallengePackage(
                f"{description.capitalize()} '{file_path}' points outside "
                f"allowed directory '{resolved_root}'"
            ) from error

        if not resolved_file_path.is_file():
            raise InvalidChallengePackage(
                f"{description.capitalize()} does not exist: {resolved_file_path}"
            )

        try:
            return resolved_file_path.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError) as error:
            raise InvalidChallengePackage(
                f"Could not read {description}: {resolved_file_path}"
            ) from error

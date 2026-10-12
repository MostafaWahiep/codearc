import copy
import json
import unittest

from app.config import Config
from app.validation.manifest_validator import (
    InvalidChallengeManifest,
    ManifestValidator,
)


class ManifestValidatorTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.validator = ManifestValidator(Config.CHALLENGE_SCHEMA_PATH)
        manifest_path = (
            Config.CHALLENGES_ROOT
            / "search-engine"
            / "v1"
            / "challenge.json"
        )
        cls.valid_manifest = json.loads(manifest_path.read_text(encoding="utf-8"))

    def test_accepts_valid_manifest(self) -> None:
        self.validator.validate(self.valid_manifest)

    def test_rejects_invalid_version(self) -> None:
        invalid_manifest = copy.deepcopy(self.valid_manifest)
        invalid_manifest["version"] = "v1"

        with self.assertRaises(InvalidChallengeManifest) as raised:
            self.validator.validate(invalid_manifest)

        self.assertIn("at version", str(raised.exception))

if __name__ == "__main__":
    unittest.main()

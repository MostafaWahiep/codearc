import json
from pathlib import Path
from typing import Any, Mapping

from jsonschema import Draft7Validator


class InvalidChallengeManifest(ValueError):
    pass


class ManifestValidator:
    def __init__(self, schema_path: Path):
        schema = json.loads(schema_path.read_text(encoding="utf-8"))
        Draft7Validator.check_schema(schema)
        self._validator = Draft7Validator(schema)

    def validate(self, manifest: Mapping[str, Any]) -> None:
        error = next(self._validator.iter_errors(manifest), None)
        if error is None:
            return

        property_path = ".".join(str(part) for part in error.absolute_path)
        location = property_path or "<root>"
        raise InvalidChallengeManifest(
            f"Invalid challenge manifest at {location}: {error.message}"
        ) from error

from dataclasses import dataclass


@dataclass(frozen=True)
class StarterFile:
    file_path: str
    content: str


@dataclass(frozen=True)
class StarterFiles:
    challenge_id: str
    version: str
    entrypoint: str
    files: tuple[StarterFile, ...]

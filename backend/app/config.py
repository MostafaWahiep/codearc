from pathlib import Path

class Config:
    SQLALCHEMY_DATABASE_URI = "sqlite:///codearc.db"
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
    CHALLENGES_ROOT = REPOSITORY_ROOT.joinpath("challenges")
    CHALLENGE_SCHEMA_PATH = REPOSITORY_ROOT.joinpath(
        "shared",
        "schemas",
        "challenge-manifest.schema.json"
        )

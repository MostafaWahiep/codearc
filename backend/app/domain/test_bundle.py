from dataclasses import dataclass
from enum import Enum


class TestCategory(str, Enum):
    CURRENT = "current"
    REGRESSION = "regression"


@dataclass(frozen=True)
class PublicTestFile:
    level_id: str
    path: str
    content: str
    category: TestCategory

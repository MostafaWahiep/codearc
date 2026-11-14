from datetime import datetime, timezone
from enum import Enum as PythonEnum


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _enum_values(enum_class: type[PythonEnum]) -> list[str]:
    return [member.value for member in enum_class]

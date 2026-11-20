from typing import Protocol

from app.domain.change_impact import ChangeImpact
from app.domain.submission import SourceSnapshot


class ChangeImpactAnalyzer(Protocol):
    def analyze(
        self,
        previous: SourceSnapshot,
        current: SourceSnapshot,
    ) -> ChangeImpact:
        ...

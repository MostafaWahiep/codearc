from dataclasses import dataclass
from enum import Enum


class SectionDisplay(str, Enum):
    STATIC = "static"
    EXPANDED = "expanded"
    COLLAPSED = "collapsed"


@dataclass(frozen=True)
class LevelSectionDefinition:
    """Metadata from the manifest; the Markdown file is not read yet."""

    id: str
    title: str
    content_path: str
    display: SectionDisplay


@dataclass(frozen=True)
class LevelSection:
    """A section whose Markdown content has been loaded for the learner."""

    id: str
    title: str
    content: str
    display: SectionDisplay

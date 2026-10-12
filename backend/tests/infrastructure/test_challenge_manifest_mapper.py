import unittest

from app.domain.level_section import SectionDisplay
from app.infrastructure.challenge_manifest_mapper import map_challenge_manifest


class ChallengeManifestMapperTests(unittest.TestCase):
    def test_maps_manifest_to_domain_model_in_manifest_order(self) -> None:
        manifest = {
            "id": "search-engine",
            "version": "1",
            "title": "Build a Search Engine",
            "description": "Build an evolving search engine.",
            "starterPath": "starter",
            "entrypointPath": "starter/search_engine.py",
            "levels": [
                {
                    "id": "single-term-search",
                    "title": "Level 1: Single-Term Search",
                    "sections": [
                        {
                            "id": "api",
                            "title": "Public API",
                            "contentPath": "level-1/api.md",
                            "display": "expanded",
                        },
                        {
                            "id": "requirements",
                            "title": "What must work",
                            "contentPath": "level-1/requirements.md",
                            "display": "collapsed",
                        },
                    ],
                    "designFeedbackPath": "level-1/design-feedback.md",
                    "testsPath": "level-1/tests",
                },
                {
                    "id": "prefix-search",
                    "title": "Level 2: Prefix Search",
                    "sections": [
                        {
                            "id": "api",
                            "title": "Public API",
                            "contentPath": "level-2/api.md",
                            "display": "expanded",
                        }
                    ],
                    "designFeedbackPath": "level-2/design-feedback.md",
                    "testsPath": "level-2/tests",
                },
            ],
        }

        mapped = map_challenge_manifest(manifest)

        self.assertEqual(mapped.id, "search-engine")
        self.assertEqual(mapped.version, "1")
        self.assertEqual(mapped.starter_path, "starter")
        self.assertEqual(mapped.entrypoint_path, "starter/search_engine.py")
        self.assertIsInstance(mapped.levels, tuple)
        self.assertEqual(
            tuple(level.id for level in mapped.levels),
            ("single-term-search", "prefix-search"),
        )

        first_level = mapped.levels[0]
        self.assertIsInstance(first_level.sections, tuple)
        self.assertEqual(
            tuple(section.id for section in first_level.sections),
            ("api", "requirements"),
        )
        self.assertEqual(first_level.design_feedback_path, "level-1/design-feedback.md")
        self.assertEqual(first_level.tests_path, "level-1/tests")
        self.assertEqual(first_level.sections[0].content_path, "level-1/api.md")
        self.assertEqual(first_level.sections[0].display, SectionDisplay.EXPANDED)


if __name__ == "__main__":
    unittest.main()

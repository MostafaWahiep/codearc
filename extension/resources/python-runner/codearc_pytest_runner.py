from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path, PurePosixPath
from typing import Any, TextIO

import pytest


class CodeArcReporter:
    def __init__(self, report_file: TextIO, workspace: Path) -> None:
        self._report_file = report_file
        workspace_absolute = workspace.absolute()
        self._workspace = workspace_absolute.resolve()
        self._workspace_labels = {str(workspace_absolute), str(self._workspace)}
        self._reports: dict[str, list[Any]] = {}

    def pytest_sessionstart(self) -> None:
        self._write(
            {
                "type": "run_started",
                "runner": {"name": "pytest", "version": pytest.__version__},
            }
        )

    def pytest_collectreport(self, report: Any) -> None:
        if report.outcome != "failed":
            return
        details = str(report.longrepr)
        source = self._source_from_text(details)
        event: dict[str, Any] = {
            "type": "run_failed",
            "message": self._exception_message(details) or "Pytest could not collect the tests.",
            "details": self._collection_details(details, source),
        }
        if source:
            event.update(source)
        self._write(event)

    def pytest_runtest_logstart(self, nodeid: str, location: Any) -> None:
        del location
        self._reports[nodeid] = []
        self._write(
            {"type": "test_started", "testId": nodeid, "test": self._identity(nodeid)}
        )

    def pytest_runtest_logreport(self, report: Any) -> None:
        self._reports.setdefault(report.nodeid, []).append(report)

    def pytest_runtest_logfinish(self, nodeid: str, location: Any) -> None:
        del location
        reports = self._reports.pop(nodeid, [])
        self._write(
            {
                "type": "test_finished",
                "testId": nodeid,
                "test": self._test_result(nodeid, reports),
            }
        )

    def pytest_sessionfinish(self, exitstatus: int) -> None:
        self._write({"type": "run_finished", "exitCode": int(exitstatus)})

    def _test_result(self, nodeid: str, reports: list[Any]) -> dict[str, Any]:
        failed_report = next(
            (report for report in reports if report.outcome == "failed"),
            next((report for report in reports if report.outcome != "passed"), None),
        )
        passed = failed_report is None and any(
            report.when == "call" and report.outcome == "passed"
            for report in reports
        )
        stdout = []
        for report in reports:
            if report.when == "call" and hasattr(report, 'capstdout') and report.capstdout:
                stdout.append(report.capstdout)
        result: dict[str, Any] = {
            **self._identity(nodeid),
            "status": "passed" if passed else "failed",
            "stdout": "\n".join(stdout) if stdout else None,
        }
        if failed_report is None:
            if not passed:
                result["failureKind"] = "test_error"
                result["message"] = "Test did not pass."
            return result

        longrepr = getattr(failed_report, "longrepr", None)
        traceback = getattr(failed_report, "longreprtext", "") or str(longrepr or "")
        crash = getattr(longrepr, "reprcrash", None)
        message = self._failure_message(crash, traceback)
        source = self._source_from_crash(crash)
        result.update(
            {
                "failureKind": self._failure_kind(message, source),
                "message": message,
                "traceback": self._relative_paths(traceback),
            }
        )
        comparison = self._comparison(message)
        if comparison:
            result["comparison"] = comparison
        if source:
            result.update(source)
        return result

    def _identity(self, nodeid: str) -> dict[str, str]:
        test_path = nodeid.split("::", 1)[0].replace("\\", "/")
        parts = list(PurePosixPath(test_path).parts)
        current_index = self._last_index(parts, "current")
        regression_index = self._last_index(parts, "regression")
        category_index = max(current_index, regression_index)
        name = nodeid.rsplit("::", 1)[-1]
        return {
            "name": name,
            "testFunctionName": name.split("[", 1)[0],
            "testPath": test_path,
            "levelId": parts[category_index + 1] if category_index >= 0 else "unknown",
            "category": "regression" if regression_index > current_index else "current",
        }

    def _source_from_crash(self, crash: Any) -> dict[str, Any] | None:
        if crash is None:
            return None
        return self._learner_source(str(crash.path), int(crash.lineno))

    def _source_from_text(self, value: str) -> dict[str, Any] | None:
        patterns = (
            re.compile(r"^(.+?\.py):(\d+)(?::|$)"),
            re.compile(r'^File ["\'](.+?\.py)["\'], line (\d+)'),
        )
        for line in value.splitlines():
            normalized = re.sub(r"^E\s+", "", line.strip())
            for pattern in patterns:
                match = pattern.match(normalized)
                if match:
                    source = self._learner_source(match.group(1), int(match.group(2)))
                    if source:
                        return source
        return None

    def _learner_source(self, candidate: str, line: int) -> dict[str, Any] | None:
        path = Path(candidate)
        absolute = path.resolve() if path.is_absolute() else (self._workspace / path).resolve()
        try:
            relative = absolute.relative_to(self._workspace)
        except ValueError:
            return None
        if not relative.parts or relative.parts[0] == ".codearc":
            return None
        return {"sourcePath": relative.as_posix(), "sourceLine": line}

    def _failure_message(self, crash: Any, traceback: str) -> str:
        message = str(crash.message) if crash is not None else ""
        if message.startswith("assert "):
            return f"AssertionError: {message}"
        return message or self._exception_message(traceback) or "Test did not pass."

    @staticmethod
    def _failure_kind(message: str, source: dict[str, Any] | None) -> str:
        if source:
            return "learner_error"
        if message.startswith("AssertionError") or message.startswith("assert "):
            return "assertion"
        return "test_error"

    @staticmethod
    def _comparison(message: str) -> dict[str, str] | None:
        first_line = message.splitlines()[0] if message else ""
        match = re.match(r"^AssertionError:\s*assert\s+(.+?)\s*==\s*(.+)$", first_line)
        if not match:
            return None
        return {"received": match.group(1).strip(), "expected": match.group(2).strip()}

    @staticmethod
    def _exception_message(value: str) -> str | None:
        pattern = re.compile(r"^[\w.]+(?:Error|Exception|Interrupt)(?::.*)?$")
        for line in reversed(value.splitlines()):
            normalized = re.sub(r"^E\s+", "", line.strip())
            if pattern.match(normalized):
                return normalized
        return None

    def _collection_details(
        self,
        value: str,
        source: dict[str, Any] | None,
    ) -> str:
        if not source:
            return self._relative_paths(value)
        lines = value.splitlines()
        source_path = str(source["sourcePath"])
        source_line = int(source["sourceLine"])
        for index, line in enumerate(lines):
            normalized = line.replace("\\", "/")
            if source_path in normalized and (
                f":{source_line}" in normalized or f"line {source_line}" in normalized
            ):
                end = min(index + 12, len(lines))
                for cursor in range(index + 1, end):
                    if self._exception_message(lines[cursor]):
                        end = cursor + 1
                        break
                return self._relative_paths("\n".join(lines[index:end]).strip())
        return self._exception_message(value) or "Pytest could not load the learner code."

    def _relative_paths(self, value: str) -> str:
        result = value
        for workspace in sorted(self._workspace_labels, key=len, reverse=True):
            result = result.replace(f"{workspace}/", "")
        return result

    def _write(self, event: dict[str, Any]) -> None:
        self._report_file.write(json.dumps(event, separators=(",", ":")) + "\n")
        self._report_file.flush()

    @staticmethod
    def _last_index(values: list[str], target: str) -> int:
        return len(values) - 1 - values[::-1].index(target) if target in values else -1


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--report", required=True, type=Path)
    parser.add_argument("--workspace", required=True, type=Path)
    parser.add_argument("--tests", required=True, type=Path)
    args = parser.parse_args()

    workspace = args.workspace.resolve()
    tests = args.tests.resolve()
    sys.path.insert(0, str(workspace))
    args.report.parent.mkdir(parents=True, exist_ok=True)
    with args.report.open("w", encoding="utf-8", buffering=1) as report_file:
        reporter = CodeArcReporter(report_file, args.workspace)
        return int(
            pytest.main(
                [
                    "-q",
                    "--color=no",
                    #"--capture=sys",
                    f"--rootdir={workspace}",
                    str(tests),
                ],
                plugins=[reporter],
            )
        )


if __name__ == "__main__":
    raise SystemExit(main())

from uuid import UUID

from dependency_injector.wiring import Provide, inject
from flask import Blueprint, jsonify, request

from app.api.v1.exceptions import InvalidRequest
from app.container import Container
from app.domain.attempt import Attempt
from app.domain.challenge_level import VisibleLevel
from app.domain.test_bundle import PublicTestFile
from app.domain.test_submission import TestSubmission, TestSubmissionResult
from app.repositories.attempt_repository import AttemptNotFound
from app.repositories.challenge_repository import ChallengeNotFound
from app.services.attempt_service import (
    AttemptLevelNotVisible,
    AttemptLevelNotActive,
    AttemptService,
)


attempt_bp = Blueprint("attempt", __name__, url_prefix="/attempts")


def _serialize_attempt(attempt: Attempt) -> dict:
    return {
        "id": attempt.id,
        "userId": attempt.user_id,
        "challengeId": attempt.challenge_id,
        "version": attempt.challenge_version,
        "status": attempt.status.value,
        "startedAt": attempt.started_at.isoformat(),
        "updatedAt": attempt.updated_at.isoformat(),
        "completedAt": (
            attempt.completed_at.isoformat() if attempt.completed_at else None
        ),
        "activeLevelId": attempt.active_level_id,
        "levels": [
            {
                "levelId": level.level_id,
                "status": level.status.value,
                "submissionCount": level.submission_count,
                "completedAt": (
                    level.completed_at.isoformat() if level.completed_at else None
                ),
            }
            for level in attempt.levels
        ],
    }


def _serialize_attempt_summary(attempt: Attempt) -> dict:
    return {
        "id": attempt.id,
        "version": attempt.challenge_version,
        "status": attempt.status.value,
        "activeLevelId": attempt.active_level_id,
        "startedAt": attempt.started_at.isoformat(),
        "updatedAt": attempt.updated_at.isoformat(),
        "completedAt": (
            attempt.completed_at.isoformat() if attempt.completed_at else None
        ),
    }


def _serialize_visible_level(level: VisibleLevel) -> dict:
    return {
        "id": level.id,
        "title": level.title,
        "status": level.status.value,
        "sections": [
            {
                "id": section.id,
                "title": section.title,
                "content": section.content,
                "display": section.display.value,
            }
            for section in level.sections
        ],
        "designFeedback": level.design_feedback,
    }


def _serialize_test_bundle(files: tuple[PublicTestFile, ...]) -> dict:
    return {
        "runner": "pytest",
        "files": [
            {
                "levelId": file.level_id,
                "path": file.path,
                "content": file.content,
                "category": file.category.value,
            }
            for file in files
        ],
    }


def _serialize_test_submission_result(result: TestSubmissionResult) -> dict:
    return {
        "outcome": result.outcome,
        "attempt": _serialize_attempt(result.attempt),
        "completedLevelId": result.completed_level_id,
    }


def _parse_test_submission(body: object) -> TestSubmission:
    if not isinstance(body, dict):
        raise InvalidRequest("Request body must be a JSON object")

    level_id = body.get("levelId")
    exit_code = body.get("exitCode")
    timed_out = body.get("timedOut")
    passed_count = body.get("passedCount")
    failed_count = body.get("failedCount")

    if not isinstance(level_id, str) or not level_id.strip():
        raise InvalidRequest("levelId must be a non-empty string")

    if type(exit_code) is not int:
        raise InvalidRequest("exitCode must be an integer")

    if type(timed_out) is not bool:
        raise InvalidRequest("timedOut must be a boolean")

    if type(passed_count) is not int or passed_count < 0:
        raise InvalidRequest("passedCount must be a non-negative integer")

    if type(failed_count) is not int or failed_count < 0:
        raise InvalidRequest("failedCount must be a non-negative integer")

    return TestSubmission(
        level_id=level_id,
        exit_code=exit_code,
        timed_out=timed_out,
        passed_count=passed_count,
        failed_count=failed_count,
    )


@attempt_bp.get("/")
@inject
def list_attempts(
    attempt_service: AttemptService = Provide[Container.attempt_service],
):
    user_id = request.args.get("userId")
    challenge_id = request.args.get("challengeId")
    if not user_id or not challenge_id:
        return jsonify({
            "message": "userId and challengeId are required query parameters",
        }), 400

    try:
        parsed_user_id = UUID(user_id)
    except ValueError:
        return jsonify({
            "message": "userId must be a valid UUID",
        }), 400

    attempts = attempt_service.list_attempts(
        user_id=parsed_user_id,
        challenge_id=challenge_id,
    )
    return jsonify([
        _serialize_attempt_summary(attempt)
        for attempt in attempts
    ]), 200


@attempt_bp.post("/")
@inject
def start_attempt(
    attempt_service: AttemptService = Provide[Container.attempt_service],
):
    try:
        body = request.get_json(silent=True)

        if not isinstance(body, dict):
            return jsonify({
                "message": "Request body must be a JSON object",
            }), 400

        user_id = body.get("userId")
        challenge_id = body.get("challengeId")

        if (
            not isinstance(user_id, str)
            or not user_id.strip()
            or not isinstance(challenge_id, str)
            or not challenge_id.strip()
        ):
            return jsonify({
                "message": "userId and challengeId are required strings",
            }), 400

        try:
            parsed_user_id = UUID(user_id)
        except ValueError:
            return jsonify({
                "message": "userId must be a valid UUID",
            }), 400

        attempt = attempt_service.start_attempt(
            user_id=parsed_user_id,
            challenge_id=challenge_id,
        )

        return jsonify(_serialize_attempt(attempt)), 201

    except ChallengeNotFound as error:
        return jsonify({
            "message": str(error),
        }), 404


@attempt_bp.get("/<uuid:attempt_id>")
@inject
def get_attempt(
    attempt_id: UUID,
    attempt_service: AttemptService = Provide[Container.attempt_service],
):
    try:
        attempt = attempt_service.get_attempt(
            attempt_id=attempt_id,
        )

        return jsonify(_serialize_attempt(attempt)), 200

    except AttemptNotFound as error:
        return jsonify({
            "message": str(error),
        }), 404


@attempt_bp.get("/<uuid:attempt_id>/levels/<string:level_id>")
@inject
def get_visible_level_in_attempt(
    attempt_id: UUID,
    level_id: str,
    attempt_service: AttemptService = Provide[Container.attempt_service],
):
    try:
        level = attempt_service.get_visible_level(
            attempt_id=attempt_id,
            level_id=level_id,
        )

        return jsonify(_serialize_visible_level(level)), 200
    except AttemptNotFound as error:
        return jsonify({
            "message": str(error),
        }), 404
    except AttemptLevelNotVisible as error:
        return jsonify({
            "message": str(error),
        }), 409


@attempt_bp.get("/<uuid:attempt_id>/tests")
@inject
def get_visible_tests_in_attempt(
    attempt_id: UUID,
    attempt_service: AttemptService = Provide[Container.attempt_service],
):
    try:
        files = attempt_service.get_visible_tests(attempt_id=attempt_id)
        return jsonify(_serialize_test_bundle(files)), 200
    except AttemptNotFound as error:
        return jsonify({
            "message": str(error),
        }), 404


@attempt_bp.post("/<uuid:attempt_id>/submissions")
@inject
def submit_test_results(
    attempt_id: UUID,
    attempt_service: AttemptService = Provide[Container.attempt_service],
):
    try:
        body = request.get_json(silent=True)
        submission = _parse_test_submission(body)

        result = attempt_service.submit_test_results(
            attempt_id,
            submission,
        )

        return jsonify(_serialize_test_submission_result(result)), 200

    except InvalidRequest as error:
        return jsonify({
            "message": str(error),
        }), 400

    except AttemptNotFound as error:
        return jsonify({
            "message": str(error),
        }), 404

    except AttemptLevelNotActive as error:
        return jsonify({
            "message": str(error),
        }), 409

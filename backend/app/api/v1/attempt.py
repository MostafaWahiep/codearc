from uuid import UUID

from dependency_injector.wiring import Provide, inject
from flask import Blueprint, jsonify, request

from app.container import Container
from app.domain.attempt import Attempt
from app.domain.challenge_level import VisibleLevel
from app.repositories.attempt_repository import AttemptNotFound
from app.repositories.challenge_repository import ChallengeNotFound
from app.services.attempt_service import (
    AttemptLevelNotVisible,
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

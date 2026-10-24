from dependency_injector.wiring import Provide, inject
from flask import Blueprint, jsonify, request

from app.container import Container
from app.infrastructure.file_challenge_repository import InvalidChallengePackage
from app.repositories.challenge_repository import ChallengeReleaseNotFound
from app.services.challenge_service import ChallengeService


challenge_bp = Blueprint("challenge", __name__, url_prefix="/challenges")


@challenge_bp.get("/")
@inject
def get_challenges_summary(
    service: ChallengeService = Provide[Container.challenge_service],
):
    summaries = service.list_challenges()
    return jsonify(
        [
            {
                "id": summary.id,
                "version": summary.version,
                "title": summary.title,
                "description": summary.description,
                "levelCount": summary.level_count,
            }
            for summary in summaries
        ]
    )


@challenge_bp.get("/<string:challenge_id>/starter-files")
@inject
def get_starter_files(
    challenge_id: str,
    service: ChallengeService = Provide[Container.challenge_service],
):
    try:
        version = request.args.get("version")

        if not version:
            return jsonify({"message": "version is a required query parameter"}), 400

        starter_files = service.load_starter_files(challenge_id, version)

        return jsonify(
            {
                "challengeId": starter_files.challenge_id,
                "version": starter_files.version,
                "entrypoint": starter_files.entrypoint,
                "files": [
                    {
                        "filePath": file.file_path,
                        "content": file.content,
                    }
                    for file in starter_files.files
                ],
            }
        )
    except ChallengeReleaseNotFound as error:
        return jsonify({"message": str(error)}), 404
    except InvalidChallengePackage:
        return jsonify(
            {
                "message": "Challenge starter files are unavailable",
            }
        ), 500

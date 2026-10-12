from dependency_injector.wiring import Provide, inject
from flask import Blueprint, jsonify

from app.container import Container
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

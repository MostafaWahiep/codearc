from flask import Blueprint, jsonify

from app.api.v1.attempt import attempt_bp
from app.api.v1.challenge import challenge_bp


api_bp = Blueprint("api", __name__, url_prefix="/api/v1")
api_bp.register_blueprint(attempt_bp)
api_bp.register_blueprint(challenge_bp)


@api_bp.get("/health")
def health_check():
    """Health check endpoint."""
    return jsonify({"status": "healthy", "message": "API is running"}), 200


from flask import Flask
from flask_cors import CORS

from app.api.v1 import api_bp
from app.config import Config
from app.container import Container
from app.extensions import db
from app.infrastructure.database import attempt_models as _attempt_models


def create_app(test_config: dict | None = None):
    app = Flask(__name__)
    app.config.from_object(Config)

    if test_config is not None:
        app.config.update(test_config)

    container = Container()
    container.config.from_dict(dict(app.config))
    app.container = container

    app.url_map.strict_slashes = False

    db.init_app(app)
    CORS(app)
    app.register_blueprint(api_bp)

    @app.get("/")
    def root():
        return {"status": "ok"}, 200

    return app

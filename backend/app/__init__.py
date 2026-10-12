from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS

from app.api.v1 import api_bp
from app.config import Config
from app.container import Container

db = SQLAlchemy()

def create_app():

    app = Flask(__name__)
    app.config.from_object(Config)

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

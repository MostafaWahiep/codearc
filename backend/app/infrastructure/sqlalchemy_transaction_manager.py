from collections.abc import Generator
from contextlib import contextmanager

from flask_sqlalchemy import SQLAlchemy


class SQLAlchemyTransactionManager:
    def __init__(self, db: SQLAlchemy) -> None:
        self._db = db

    @contextmanager
    def transaction(self) -> Generator[None, None, None]:
        try:
            yield
            self._db.session.commit()
        except Exception:
            self._db.session.rollback()
            raise

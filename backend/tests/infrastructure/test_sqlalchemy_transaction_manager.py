import unittest
from types import SimpleNamespace
from unittest.mock import Mock

from app.infrastructure.sqlalchemy_transaction_manager import (
    SQLAlchemyTransactionManager,
)


class SQLAlchemyTransactionManagerTests(unittest.TestCase):
    def setUp(self) -> None:
        self.session = Mock()
        self.transaction_manager = SQLAlchemyTransactionManager(
            SimpleNamespace(session=self.session),
        )

    def test_commits_when_transaction_succeeds(self) -> None:
        with self.transaction_manager.transaction():
            pass

        self.session.commit.assert_called_once_with()
        self.session.rollback.assert_not_called()

    def test_rolls_back_and_reraises_when_transaction_fails(self) -> None:
        with self.assertRaisesRegex(RuntimeError, "write failed"):
            with self.transaction_manager.transaction():
                raise RuntimeError("write failed")

        self.session.rollback.assert_called_once_with()
        self.session.commit.assert_not_called()

    def test_rolls_back_when_commit_fails(self) -> None:
        self.session.commit.side_effect = RuntimeError("commit failed")

        with self.assertRaisesRegex(RuntimeError, "commit failed"):
            with self.transaction_manager.transaction():
                pass

        self.session.rollback.assert_called_once_with()


if __name__ == "__main__":
    unittest.main()

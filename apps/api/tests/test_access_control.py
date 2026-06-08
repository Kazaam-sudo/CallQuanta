import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

try:
    from fastapi import HTTPException
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker

    from app import main
    from app.db import Base, Call, User
except ModuleNotFoundError as exc:
    raise unittest.SkipTest(f"API test dependency is not installed: {exc.name}") from exc


class AccessControlTests(unittest.TestCase):
    def setUp(self):
        engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(bind=engine)
        self.SessionLocal = sessionmaker(bind=engine)
        self.db = self.SessionLocal()
        self.admin = User(email="admin@example.com", password_hash="x", role="admin", visibility_scope="all", is_active=True)
        self.manager = User(email="manager@example.com", password_hash="x", role="manager", team="Team A", visibility_scope="team", is_active=True)
        self.agent = User(email="agent@example.com", password_hash="x", role="agent", agent_name="Alice", visibility_scope="own", is_active=True)
        self.viewer = User(email="viewer@example.com", password_hash="x", role="viewer", team="Team A", visibility_scope="team", is_active=True)
        self.db.add_all([self.admin, self.manager, self.agent, self.viewer])
        self.db.flush()
        self.call_a = Call(filename="a.wav", status="uploaded", team="Team A", agent_name="Alice")
        self.call_b = Call(filename="b.wav", status="uploaded", team="Team B", agent_name="Bob")
        self.db.add_all([self.call_a, self.call_b])
        self.db.commit()

    def tearDown(self):
        self.db.close()

    def test_admin_can_list_all_calls(self):
        result = main.list_calls(limit=50, offset=0, db=self.db, user=self.admin)
        self.assertEqual(result["total"], 2)

    def test_team_scoped_user_sees_only_own_team_calls(self):
        result = main.list_calls(limit=50, offset=0, db=self.db, user=self.manager)
        self.assertEqual(result["total"], 1)
        self.assertEqual(result["items"][0]["team"], "Team A")

    def test_own_scoped_user_sees_only_own_agent_calls(self):
        result = main.list_calls(limit=50, offset=0, db=self.db, user=self.agent)
        self.assertEqual(result["total"], 1)
        self.assertEqual(result["items"][0]["agent_name"], "Alice")

    def test_scoped_user_cannot_open_forbidden_call(self):
        with self.assertRaises(HTTPException) as ctx:
            main.get_call(self.call_b.id, db=self.db, user=self.manager)
        self.assertEqual(ctx.exception.status_code, 403)

    def test_scoped_export_cannot_export_forbidden_ids(self):
        with self.assertRaises(HTTPException) as ctx:
            main.export_calls(call_ids=f"{self.call_a.id},{self.call_b.id}", db=self.db, user=self.manager)
        self.assertEqual(ctx.exception.status_code, 403)

    def test_admin_cannot_deactivate_last_active_admin(self):
        with self.assertRaises(HTTPException) as ctx:
            main.deactivate_user(self.admin.id, db=self.db, user=self.admin)
        self.assertEqual(ctx.exception.status_code, 400)

    def test_non_admin_cannot_access_provider_settings(self):
        with self.assertRaises(HTTPException) as ctx:
            main.require_admin(self.viewer)
        self.assertEqual(ctx.exception.status_code, 403)


if __name__ == "__main__":
    unittest.main()

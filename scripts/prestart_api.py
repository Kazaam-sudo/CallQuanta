#!/usr/bin/env python3
"""Prepare the database schema before the API starts.

The application historically performs lightweight runtime migrations in its FastAPI
startup hook. This pre-start step keeps container startup fail-fast and, importantly,
invokes the telephony ingestion migration explicitly so existing deployments receive
the external-call uniqueness index before accepting webhook traffic.
"""

from __future__ import annotations

import os

from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session
from werkzeug.security import generate_password_hash

from app.db import (
    Base,
    User,
    migrate_access_control_tables,
    migrate_calls_table,
    migrate_pilot_feedback_tables,
    migrate_production_readiness_tables,
    migrate_qa_coaching_actions_table,
    migrate_qa_reviews_table,
    migrate_stt_provider_configs_table,
    migrate_telephony_ingestion_tables,
    migrate_topic_tables,
)

DEFAULT_DATABASE_URL = "postgresql+psycopg://callquanta:callquanta@postgres:5432/callquanta"
PROTECTED_ENVIRONMENTS = {"production", "prod"}


def _bootstrap_production_admin(engine) -> None:
    if os.environ.get("APP_ENV", "development").strip().lower() not in PROTECTED_ENVIRONMENTS:
        return
    with Session(engine) as db:
        user_count = db.scalar(select(func.count(User.id))) or 0
        if user_count:
            return
        email = os.environ.get("ADMIN_EMAIL", "").strip().lower()
        password = os.environ.get("ADMIN_PASSWORD", "")
        if not email or not password:
            raise RuntimeError(
                "No users exist. Configure ADMIN_EMAIL and ADMIN_PASSWORD for the first "
                "production startup; they may be removed after the initial password change."
            )
        db.add(
            User(
                email=email,
                password_hash=generate_password_hash(password, method="pbkdf2:sha256", salt_length=16),
                role="admin",
                visibility_scope="all",
                is_active=True,
                must_change_password=True,
            )
        )
        db.commit()


def prepare_schema() -> None:
    engine = create_engine(os.environ.get("DATABASE_URL", DEFAULT_DATABASE_URL), pool_pre_ping=True)
    try:
        Base.metadata.create_all(bind=engine)
        migrate_qa_reviews_table(engine)
        migrate_qa_coaching_actions_table(engine)
        migrate_pilot_feedback_tables(engine)
        migrate_calls_table(engine)
        migrate_stt_provider_configs_table(engine)
        migrate_telephony_ingestion_tables(engine)
        migrate_production_readiness_tables(engine)
        migrate_access_control_tables(engine)
        migrate_topic_tables(engine)
        _bootstrap_production_admin(engine)
    finally:
        engine.dispose()


if __name__ == "__main__":
    prepare_schema()

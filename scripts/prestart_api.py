#!/usr/bin/env python3
"""Prepare the database schema before the API starts.

The application historically performs lightweight runtime migrations in its FastAPI
startup hook. This pre-start step keeps container startup fail-fast and, importantly,
invokes the telephony ingestion migration explicitly so existing deployments receive
the external-call uniqueness index before accepting webhook traffic.
"""

from __future__ import annotations

import os

from sqlalchemy import create_engine

from app.db import (
    Base,
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
    finally:
        engine.dispose()


if __name__ == "__main__":
    prepare_schema()

from sqlalchemy import JSON, BigInteger, DateTime, Engine, Float, ForeignKey, Integer, String, Text, func, inspect, text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class Call(Base):
    __tablename__ = "calls"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    filename: Mapped[str] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(String(64), default="uploaded")
    stored_filename: Mapped[str | None] = mapped_column(String(512), nullable=True)
    stored_path: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    file_size_bytes: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    content_type: Mapped[str | None] = mapped_column(String(255), nullable=True)
    agent_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    team: Mapped[str | None] = mapped_column(String(255), nullable=True)
    campaign: Mapped[str | None] = mapped_column(String(255), nullable=True)
    direction: Mapped[str | None] = mapped_column(String(16), nullable=True)
    language: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[str] = mapped_column(DateTime(timezone=True), server_default=func.now())


class TranscriptSegment(Base):
    __tablename__ = "transcript_segments"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    call_id: Mapped[int] = mapped_column(ForeignKey("calls.id"))
    speaker: Mapped[str] = mapped_column(String(32))
    start_ms: Mapped[int] = mapped_column(Integer)
    end_ms: Mapped[int] = mapped_column(Integer)
    text: Mapped[str] = mapped_column(Text)


class QAReview(Base):
    __tablename__ = "qa_reviews"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    call_id: Mapped[int] = mapped_column(ForeignKey("calls.id"))
    created_at: Mapped[str] = mapped_column(DateTime(timezone=True), server_default=func.now())
    status: Mapped[str] = mapped_column(String(32), default="success")
    analysis_mode: Mapped[str | None] = mapped_column(String(64), nullable=True)
    provider_name: Mapped[str | None] = mapped_column(String(128), nullable=True)
    provider_preset: Mapped[str | None] = mapped_column(String(64), nullable=True)
    model: Mapped[str | None] = mapped_column(String(128), nullable=True)
    scorecard_name: Mapped[str | None] = mapped_column(String(128), nullable=True)
    report_language: Mapped[str | None] = mapped_column(String(64), nullable=True)
    score: Mapped[float | None] = mapped_column(Float, nullable=True)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    criteria_breakdown: Mapped[list | None] = mapped_column(JSON, nullable=True)
    findings: Mapped[list | None] = mapped_column(JSON, nullable=True)
    raw_review_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    normalized_review_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    scorecard_snapshot: Mapped[dict | None] = mapped_column(JSON, nullable=True)


class ProviderConfig(Base):
    __tablename__ = "provider_configs"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    provider_type: Mapped[str] = mapped_column(String(32))
    name: Mapped[str] = mapped_column(String(128))
    config: Mapped[dict] = mapped_column(JSON)


class ScorecardConfig(Base):
    __tablename__ = "scorecard_configs"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(128))
    config: Mapped[dict] = mapped_column(JSON)


def migrate_qa_reviews_table(engine: Engine) -> None:
    """Backfill/upgrade pre-v0.10.0 qa_reviews tables in-place.

    Older deployments can have qa_reviews limited to (id, call_id, score, summary).
    This migration adds the new history/snapshot columns required by the API and worker.
    """
    inspector = inspect(engine)
    if "qa_reviews" not in inspector.get_table_names():
        return

    existing_columns = {column["name"] for column in inspector.get_columns("qa_reviews")}

    add_columns_sql = {
        "created_at": "ALTER TABLE qa_reviews ADD COLUMN created_at TIMESTAMPTZ DEFAULT NOW()",
        "status": "ALTER TABLE qa_reviews ADD COLUMN status VARCHAR(32)",
        "analysis_mode": "ALTER TABLE qa_reviews ADD COLUMN analysis_mode VARCHAR(64)",
        "provider_name": "ALTER TABLE qa_reviews ADD COLUMN provider_name VARCHAR(128)",
        "provider_preset": "ALTER TABLE qa_reviews ADD COLUMN provider_preset VARCHAR(64)",
        "model": "ALTER TABLE qa_reviews ADD COLUMN model VARCHAR(128)",
        "scorecard_name": "ALTER TABLE qa_reviews ADD COLUMN scorecard_name VARCHAR(128)",
        "report_language": "ALTER TABLE qa_reviews ADD COLUMN report_language VARCHAR(64)",
        "criteria_breakdown": "ALTER TABLE qa_reviews ADD COLUMN criteria_breakdown JSON",
        "findings": "ALTER TABLE qa_reviews ADD COLUMN findings JSON",
        "raw_review_json": "ALTER TABLE qa_reviews ADD COLUMN raw_review_json JSON",
        "normalized_review_json": "ALTER TABLE qa_reviews ADD COLUMN normalized_review_json JSON",
        "error_message": "ALTER TABLE qa_reviews ADD COLUMN error_message TEXT",
        "scorecard_snapshot": "ALTER TABLE qa_reviews ADD COLUMN scorecard_snapshot JSON",
    }

    with engine.begin() as conn:
        for column_name, ddl in add_columns_sql.items():
            if column_name not in existing_columns:
                conn.execute(text(ddl))

        if "status" in add_columns_sql:
            conn.execute(text("UPDATE qa_reviews SET status = 'success' WHERE status IS NULL"))


def migrate_calls_table(engine: Engine) -> None:
    """Backfill/upgrade calls table with metadata columns for operator-level reporting."""
    inspector = inspect(engine)
    if "calls" not in inspector.get_table_names():
        return

    existing_columns = {column["name"] for column in inspector.get_columns("calls")}
    add_columns_sql = {
        "agent_name": "ALTER TABLE calls ADD COLUMN agent_name VARCHAR(255)",
        "team": "ALTER TABLE calls ADD COLUMN team VARCHAR(255)",
        "campaign": "ALTER TABLE calls ADD COLUMN campaign VARCHAR(255)",
        "direction": "ALTER TABLE calls ADD COLUMN direction VARCHAR(16)",
        "language": "ALTER TABLE calls ADD COLUMN language VARCHAR(64)",
    }
    with engine.begin() as conn:
        for column_name, ddl in add_columns_sql.items():
            if column_name not in existing_columns:
                conn.execute(text(ddl))

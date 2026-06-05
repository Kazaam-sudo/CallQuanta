from sqlalchemy import JSON, BigInteger, Boolean, DateTime, Engine, Float, ForeignKey, Integer, String, Text, func, inspect, text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class Call(Base):
    __tablename__ = "calls"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    filename: Mapped[str] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(String(64), default="uploaded")
    last_error_type: Mapped[str | None] = mapped_column(String(128), nullable=True)
    last_error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    last_processed_at: Mapped[str | None] = mapped_column(DateTime(timezone=True), nullable=True)
    stored_filename: Mapped[str | None] = mapped_column(String(512), nullable=True)
    stored_path: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    file_size_bytes: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    content_type: Mapped[str | None] = mapped_column(String(255), nullable=True)
    agent_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    team: Mapped[str | None] = mapped_column(String(255), nullable=True)
    campaign: Mapped[str | None] = mapped_column(String(255), nullable=True)
    direction: Mapped[str | None] = mapped_column(String(16), nullable=True)
    language: Mapped[str | None] = mapped_column(String(64), nullable=True)
    stt_provider_name: Mapped[str | None] = mapped_column(String(128), nullable=True)
    stt_provider_type: Mapped[str | None] = mapped_column(String(64), nullable=True)
    stt_model: Mapped[str | None] = mapped_column(String(128), nullable=True)
    stt_language_used: Mapped[str | None] = mapped_column(String(64), nullable=True)
    detected_language: Mapped[str | None] = mapped_column(String(64), nullable=True)
    source: Mapped[str | None] = mapped_column(String(64), nullable=True)
    source_provider: Mapped[str | None] = mapped_column(String(64), nullable=True)
    external_call_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    external_recording_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    customer_phone: Mapped[str | None] = mapped_column(String(64), nullable=True)
    agent_phone: Mapped[str | None] = mapped_column(String(64), nullable=True)
    started_at: Mapped[str | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ended_at: Mapped[str | None] = mapped_column(DateTime(timezone=True), nullable=True)
    duration_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    ingestion_status: Mapped[str | None] = mapped_column(String(64), nullable=True)
    ingestion_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    imported_at: Mapped[str | None] = mapped_column(DateTime(timezone=True), nullable=True)
    auto_analyze_after_transcription: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[str] = mapped_column(DateTime(timezone=True), server_default=func.now())


class TelephonyIntegration(Base):
    __tablename__ = "telephony_integrations"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(128))
    provider_type: Mapped[str] = mapped_column(String(64), default="generic_webhook")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    ingestion_token_hash: Mapped[str | None] = mapped_column(String(128), nullable=True)
    auto_transcribe: Mapped[bool] = mapped_column(Boolean, default=True)
    auto_analyze: Mapped[bool] = mapped_column(Boolean, default=False)
    default_agent_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    default_team: Mapped[str | None] = mapped_column(String(255), nullable=True)
    default_campaign: Mapped[str | None] = mapped_column(String(255), nullable=True)
    default_direction: Mapped[str | None] = mapped_column(String(16), nullable=True)
    default_language: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[str] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[str] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class IngestionEvent(Base):
    __tablename__ = "ingestion_events"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    integration_id: Mapped[int | None] = mapped_column(ForeignKey("telephony_integrations.id"), nullable=True)
    source_provider: Mapped[str] = mapped_column(String(64))
    external_call_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    event_type: Mapped[str] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(String(64))
    message: Mapped[str | None] = mapped_column(Text, nullable=True)
    payload_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    call_id: Mapped[int | None] = mapped_column(ForeignKey("calls.id"), nullable=True)
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


class SttProviderConfig(Base):
    __tablename__ = "stt_provider_configs"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(128))
    provider_type: Mapped[str] = mapped_column(String(64))
    preset: Mapped[str] = mapped_column(String(64), default="custom")
    model: Mapped[str] = mapped_column(String(128), default="")
    base_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    api_key: Mapped[str | None] = mapped_column(Text, nullable=True)
    timeout_seconds: Mapped[int] = mapped_column(Integer, default=180)
    is_active: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[str] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[str] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class ScorecardConfig(Base):
    __tablename__ = "scorecard_configs"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(128))
    config: Mapped[dict] = mapped_column(JSON)


class AppSetting(Base):
    __tablename__ = "app_settings"
    key: Mapped[str] = mapped_column(String(128), primary_key=True)
    value: Mapped[dict] = mapped_column(JSON)


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
        "last_error_type": "ALTER TABLE calls ADD COLUMN last_error_type VARCHAR(128)",
        "last_error_message": "ALTER TABLE calls ADD COLUMN last_error_message TEXT",
        "last_processed_at": "ALTER TABLE calls ADD COLUMN last_processed_at TIMESTAMPTZ",
        "agent_name": "ALTER TABLE calls ADD COLUMN agent_name VARCHAR(255)",
        "team": "ALTER TABLE calls ADD COLUMN team VARCHAR(255)",
        "campaign": "ALTER TABLE calls ADD COLUMN campaign VARCHAR(255)",
        "direction": "ALTER TABLE calls ADD COLUMN direction VARCHAR(16)",
        "language": "ALTER TABLE calls ADD COLUMN language VARCHAR(64)",
        "stt_provider_name": "ALTER TABLE calls ADD COLUMN stt_provider_name VARCHAR(128)",
        "stt_provider_type": "ALTER TABLE calls ADD COLUMN stt_provider_type VARCHAR(64)",
        "stt_model": "ALTER TABLE calls ADD COLUMN stt_model VARCHAR(128)",
        "stt_language_used": "ALTER TABLE calls ADD COLUMN stt_language_used VARCHAR(64)",
        "detected_language": "ALTER TABLE calls ADD COLUMN detected_language VARCHAR(64)",
        "source": "ALTER TABLE calls ADD COLUMN source VARCHAR(64)",
        "source_provider": "ALTER TABLE calls ADD COLUMN source_provider VARCHAR(64)",
        "external_call_id": "ALTER TABLE calls ADD COLUMN external_call_id VARCHAR(255)",
        "external_recording_url": "ALTER TABLE calls ADD COLUMN external_recording_url TEXT",
        "customer_phone": "ALTER TABLE calls ADD COLUMN customer_phone VARCHAR(64)",
        "agent_phone": "ALTER TABLE calls ADD COLUMN agent_phone VARCHAR(64)",
        "started_at": "ALTER TABLE calls ADD COLUMN started_at TIMESTAMPTZ",
        "ended_at": "ALTER TABLE calls ADD COLUMN ended_at TIMESTAMPTZ",
        "duration_seconds": "ALTER TABLE calls ADD COLUMN duration_seconds INTEGER",
        "ingestion_status": "ALTER TABLE calls ADD COLUMN ingestion_status VARCHAR(64)",
        "ingestion_error": "ALTER TABLE calls ADD COLUMN ingestion_error TEXT",
        "imported_at": "ALTER TABLE calls ADD COLUMN imported_at TIMESTAMPTZ",
        "auto_analyze_after_transcription": "ALTER TABLE calls ADD COLUMN auto_analyze_after_transcription BOOLEAN DEFAULT FALSE",
    }
    with engine.begin() as conn:
        for column_name, ddl in add_columns_sql.items():
            if column_name not in existing_columns:
                conn.execute(text(ddl))


def migrate_stt_provider_configs_table(engine: Engine) -> None:
    """Backfill/upgrade STT provider settings and call-level STT metadata."""
    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())
    if "calls" in existing_tables:
        existing_columns = {column["name"] for column in inspector.get_columns("calls")}
        add_columns_sql = {
            "stt_provider_name": "ALTER TABLE calls ADD COLUMN stt_provider_name VARCHAR(128)",
            "stt_provider_type": "ALTER TABLE calls ADD COLUMN stt_provider_type VARCHAR(64)",
            "stt_model": "ALTER TABLE calls ADD COLUMN stt_model VARCHAR(128)",
            "stt_language_used": "ALTER TABLE calls ADD COLUMN stt_language_used VARCHAR(64)",
            "detected_language": "ALTER TABLE calls ADD COLUMN detected_language VARCHAR(64)",
        }
        with engine.begin() as conn:
            for column_name, ddl in add_columns_sql.items():
                if column_name not in existing_columns:
                    conn.execute(text(ddl))
    if "stt_provider_configs" not in existing_tables:
        Base.metadata.tables["stt_provider_configs"].create(bind=engine, checkfirst=True)


def migrate_telephony_ingestion_tables(engine: Engine) -> None:
    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())
    if "calls" in existing_tables:
        existing_columns = {column["name"] for column in inspector.get_columns("calls")}
        add_columns_sql = {
            "source": "ALTER TABLE calls ADD COLUMN source VARCHAR(64)",
            "source_provider": "ALTER TABLE calls ADD COLUMN source_provider VARCHAR(64)",
            "external_call_id": "ALTER TABLE calls ADD COLUMN external_call_id VARCHAR(255)",
            "external_recording_url": "ALTER TABLE calls ADD COLUMN external_recording_url TEXT",
            "customer_phone": "ALTER TABLE calls ADD COLUMN customer_phone VARCHAR(64)",
            "agent_phone": "ALTER TABLE calls ADD COLUMN agent_phone VARCHAR(64)",
            "started_at": "ALTER TABLE calls ADD COLUMN started_at TIMESTAMPTZ",
            "ended_at": "ALTER TABLE calls ADD COLUMN ended_at TIMESTAMPTZ",
            "duration_seconds": "ALTER TABLE calls ADD COLUMN duration_seconds INTEGER",
            "ingestion_status": "ALTER TABLE calls ADD COLUMN ingestion_status VARCHAR(64)",
            "ingestion_error": "ALTER TABLE calls ADD COLUMN ingestion_error TEXT",
            "imported_at": "ALTER TABLE calls ADD COLUMN imported_at TIMESTAMPTZ",
            "auto_analyze_after_transcription": "ALTER TABLE calls ADD COLUMN auto_analyze_after_transcription BOOLEAN DEFAULT FALSE",
        }
        with engine.begin() as conn:
            for column_name, ddl in add_columns_sql.items():
                if column_name not in existing_columns:
                    conn.execute(text(ddl))
            conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS uq_calls_source_provider_external_call_id ON calls (source_provider, external_call_id) WHERE external_call_id IS NOT NULL"))
    Base.metadata.tables["telephony_integrations"].create(bind=engine, checkfirst=True)
    Base.metadata.tables["ingestion_events"].create(bind=engine, checkfirst=True)

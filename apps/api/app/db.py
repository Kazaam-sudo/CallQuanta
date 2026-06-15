from sqlalchemy import JSON, BigInteger, Boolean, DateTime, Engine, Float, ForeignKey, Integer, String, Text, false, func, inspect, text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(Text)
    role: Mapped[str] = mapped_column(String(32), default="viewer")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    display_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    team: Mapped[str | None] = mapped_column(String(255), nullable=True)
    agent_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    visibility_scope: Mapped[str] = mapped_column(String(16), default="team")
    must_change_password: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[str] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[str] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class AuditEvent(Base):
    __tablename__ = "audit_events"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    actor_user_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    actor_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    action: Mapped[str] = mapped_column(String(128), index=True)
    entity_type: Mapped[str] = mapped_column(String(64), index=True)
    entity_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    message: Mapped[str | None] = mapped_column(Text, nullable=True)
    metadata_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[str] = mapped_column(DateTime(timezone=True), server_default=func.now())


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
    audio_deleted: Mapped[bool] = mapped_column(Boolean, default=False)
    audio_deleted_at: Mapped[str | None] = mapped_column(DateTime(timezone=True), nullable=True)
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
    review_status: Mapped[str] = mapped_column(String(32), nullable=False, default="ai_generated", server_default="ai_generated")
    human_reviewer_user_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    human_reviewer_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    human_reviewed_at: Mapped[str | None] = mapped_column(DateTime(timezone=True), nullable=True)
    human_total_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    human_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    human_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    ai_human_score_delta: Mapped[float | None] = mapped_column(Float, nullable=True)
    calibration_flag: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=false())
    calibration_notes: Mapped[str | None] = mapped_column(Text, nullable=True)


class QAReviewAssignment(Base):
    __tablename__ = "qa_review_assignments"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    review_id: Mapped[int] = mapped_column(ForeignKey("qa_reviews.id"))
    call_id: Mapped[int] = mapped_column(ForeignKey("calls.id"))
    assigned_to_user_id: Mapped[int] = mapped_column(Integer)
    assigned_by_user_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="assigned")
    due_date: Mapped[str | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[str] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[str] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class QAFeedback(Base):
    __tablename__ = "qa_feedback"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    review_id: Mapped[int] = mapped_column(ForeignKey("qa_reviews.id"))
    call_id: Mapped[int] = mapped_column(ForeignKey("calls.id"))
    created_by_user_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_by_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    transcript_quality: Mapped[str | None] = mapped_column(String(32), nullable=True)
    qa_analysis_quality: Mapped[str | None] = mapped_column(String(32), nullable=True)
    score_agreement: Mapped[str | None] = mapped_column(String(32), nullable=True)
    scorecard_fit: Mapped[str | None] = mapped_column(String(64), nullable=True)
    ai_missed_something: Mapped[bool] = mapped_column(Boolean, default=False)
    ai_missed_comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    ai_false_positive: Mapped[bool] = mapped_column(Boolean, default=False)
    ai_false_positive_comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    useful_for_coaching: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    coaching_usefulness_comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    overall_feedback: Mapped[str | None] = mapped_column(Text, nullable=True)
    issue_tags_json: Mapped[list | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[str] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[str] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class QACoachingAction(Base):
    __tablename__ = "qa_coaching_actions"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    review_id: Mapped[int] = mapped_column(ForeignKey("qa_reviews.id"))
    call_id: Mapped[int] = mapped_column(ForeignKey("calls.id"))
    agent_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    assigned_to_user_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_by_user_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    title: Mapped[str] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="open")
    due_date: Mapped[str | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[str] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[str] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


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
        "review_status": "ALTER TABLE qa_reviews ADD COLUMN review_status VARCHAR(32) DEFAULT 'ai_generated'",
        "human_reviewer_user_id": "ALTER TABLE qa_reviews ADD COLUMN human_reviewer_user_id INTEGER",
        "human_reviewer_email": "ALTER TABLE qa_reviews ADD COLUMN human_reviewer_email VARCHAR(255)",
        "human_reviewed_at": "ALTER TABLE qa_reviews ADD COLUMN human_reviewed_at TIMESTAMPTZ",
        "human_total_score": "ALTER TABLE qa_reviews ADD COLUMN human_total_score DOUBLE PRECISION",
        "human_summary": "ALTER TABLE qa_reviews ADD COLUMN human_summary TEXT",
        "human_notes": "ALTER TABLE qa_reviews ADD COLUMN human_notes TEXT",
        "ai_human_score_delta": "ALTER TABLE qa_reviews ADD COLUMN ai_human_score_delta DOUBLE PRECISION",
        "calibration_flag": "ALTER TABLE qa_reviews ADD COLUMN calibration_flag BOOLEAN DEFAULT FALSE",
        "calibration_notes": "ALTER TABLE qa_reviews ADD COLUMN calibration_notes TEXT",
    }

    with engine.begin() as conn:
        for column_name, ddl in add_columns_sql.items():
            if column_name not in existing_columns:
                conn.execute(text(ddl))

        conn.execute(text("UPDATE qa_reviews SET status = 'success' WHERE status IS NULL"))
        conn.execute(text("UPDATE qa_reviews SET review_status = 'ai_generated' WHERE review_status IS NULL"))
        conn.execute(text("UPDATE qa_reviews SET calibration_flag = FALSE WHERE calibration_flag IS NULL"))
        if conn.dialect.name == "postgresql":
            conn.execute(text("ALTER TABLE qa_reviews ALTER COLUMN review_status SET DEFAULT 'ai_generated'"))
            conn.execute(text("ALTER TABLE qa_reviews ALTER COLUMN review_status SET NOT NULL"))
            conn.execute(text("ALTER TABLE qa_reviews ALTER COLUMN calibration_flag SET DEFAULT FALSE"))
            conn.execute(text("ALTER TABLE qa_reviews ALTER COLUMN calibration_flag SET NOT NULL"))



def migrate_qa_coaching_actions_table(engine: Engine) -> None:
    inspector = inspect(engine)
    if "qa_coaching_actions" in inspector.get_table_names():
        existing_columns = {column["name"] for column in inspector.get_columns("qa_coaching_actions")}
        add_columns_sql = {
            "assigned_to_user_id": "ALTER TABLE qa_coaching_actions ADD COLUMN assigned_to_user_id INTEGER",
            "created_by_user_id": "ALTER TABLE qa_coaching_actions ADD COLUMN created_by_user_id INTEGER",
            "due_date": "ALTER TABLE qa_coaching_actions ADD COLUMN due_date TIMESTAMPTZ",
            "updated_at": "ALTER TABLE qa_coaching_actions ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW()",
        }
        with engine.begin() as conn:
            for column_name, ddl in add_columns_sql.items():
                if column_name not in existing_columns:
                    conn.execute(text(ddl))
        return
    ddl = """
        CREATE TABLE qa_coaching_actions (
            id SERIAL PRIMARY KEY,
            review_id INTEGER NOT NULL REFERENCES qa_reviews(id),
            call_id INTEGER NOT NULL REFERENCES calls(id),
            agent_name VARCHAR(255),
            assigned_to_user_id INTEGER,
            created_by_user_id INTEGER,
            title VARCHAR(255) NOT NULL,
            description TEXT,
            status VARCHAR(32) DEFAULT 'open',
            due_date TIMESTAMPTZ,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        )
    """
    with engine.begin() as conn:
        conn.execute(text(ddl))


def migrate_pilot_feedback_tables(engine: Engine) -> None:
    Base.metadata.tables["qa_review_assignments"].create(bind=engine, checkfirst=True)
    Base.metadata.tables["qa_feedback"].create(bind=engine, checkfirst=True)

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
        "audio_deleted": "ALTER TABLE calls ADD COLUMN audio_deleted BOOLEAN DEFAULT FALSE",
        "audio_deleted_at": "ALTER TABLE calls ADD COLUMN audio_deleted_at TIMESTAMPTZ",
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


def migrate_access_control_tables(engine: Engine) -> None:
    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())
    Base.metadata.tables["users"].create(bind=engine, checkfirst=True)
    Base.metadata.tables["audit_events"].create(bind=engine, checkfirst=True)
    if "users" in existing_tables:
        existing_columns = {column["name"] for column in inspector.get_columns("users")}
        add_columns_sql = {
            "display_name": "ALTER TABLE users ADD COLUMN display_name VARCHAR(255)",
            "team": "ALTER TABLE users ADD COLUMN team VARCHAR(255)",
            "agent_name": "ALTER TABLE users ADD COLUMN agent_name VARCHAR(255)",
            "visibility_scope": "ALTER TABLE users ADD COLUMN visibility_scope VARCHAR(16) DEFAULT 'team'",
            "must_change_password": "ALTER TABLE users ADD COLUMN must_change_password BOOLEAN DEFAULT FALSE",
        }
        with engine.begin() as conn:
            for column_name, ddl in add_columns_sql.items():
                if column_name not in existing_columns:
                    conn.execute(text(ddl))
            conn.execute(text("UPDATE users SET visibility_scope = CASE WHEN role = 'admin' THEN 'all' WHEN role = 'agent' THEN 'own' ELSE COALESCE(visibility_scope, 'team') END WHERE visibility_scope IS NULL"))
            conn.execute(text("UPDATE users SET visibility_scope = 'all' WHERE role = 'admin' AND (visibility_scope IS NULL OR visibility_scope = '' OR visibility_scope = 'team')"))
            conn.execute(text("UPDATE users SET must_change_password = FALSE WHERE must_change_password IS NULL"))


def migrate_production_readiness_tables(engine: Engine) -> None:
    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())
    Base.metadata.tables["users"].create(bind=engine, checkfirst=True)
    Base.metadata.tables["audit_events"].create(bind=engine, checkfirst=True)
    Base.metadata.tables["app_settings"].create(bind=engine, checkfirst=True)
    if "calls" in existing_tables:
        existing_columns = {column["name"] for column in inspector.get_columns("calls")}
        add_columns_sql = {
            "audio_deleted": "ALTER TABLE calls ADD COLUMN audio_deleted BOOLEAN DEFAULT FALSE",
            "audio_deleted_at": "ALTER TABLE calls ADD COLUMN audio_deleted_at TIMESTAMPTZ",
        }
        with engine.begin() as conn:
            for column_name, ddl in add_columns_sql.items():
                if column_name not in existing_columns:
                    conn.execute(text(ddl))

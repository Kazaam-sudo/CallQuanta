"""telephony ingestion MVP

Revision ID: 0007_telephony_ingestion
Revises: 0006_stt_provider_settings
Create Date: 2026-06-05
"""

from alembic import op
import sqlalchemy as sa

revision = "0007_telephony_ingestion"
down_revision = "0006_stt_provider_settings"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "telephony_integrations",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("provider_type", sa.String(length=64), nullable=False, server_default="generic_webhook"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("ingestion_token_hash", sa.String(length=128), nullable=True),
        sa.Column("auto_transcribe", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("auto_analyze", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("default_agent_name", sa.String(length=255), nullable=True),
        sa.Column("default_team", sa.String(length=255), nullable=True),
        sa.Column("default_campaign", sa.String(length=255), nullable=True),
        sa.Column("default_direction", sa.String(length=16), nullable=True),
        sa.Column("default_language", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_table(
        "ingestion_events",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("integration_id", sa.Integer(), sa.ForeignKey("telephony_integrations.id"), nullable=True),
        sa.Column("source_provider", sa.String(length=64), nullable=False),
        sa.Column("external_call_id", sa.String(length=255), nullable=True),
        sa.Column("event_type", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=64), nullable=False),
        sa.Column("message", sa.Text(), nullable=True),
        sa.Column("payload_json", sa.JSON(), nullable=True),
        sa.Column("call_id", sa.Integer(), sa.ForeignKey("calls.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    for name, column in [
        ("source", sa.Column("source", sa.String(length=64), nullable=True)),
        ("source_provider", sa.Column("source_provider", sa.String(length=64), nullable=True)),
        ("external_call_id", sa.Column("external_call_id", sa.String(length=255), nullable=True)),
        ("external_recording_url", sa.Column("external_recording_url", sa.Text(), nullable=True)),
        ("customer_phone", sa.Column("customer_phone", sa.String(length=64), nullable=True)),
        ("agent_phone", sa.Column("agent_phone", sa.String(length=64), nullable=True)),
        ("started_at", sa.Column("started_at", sa.DateTime(timezone=True), nullable=True)),
        ("ended_at", sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True)),
        ("duration_seconds", sa.Column("duration_seconds", sa.Integer(), nullable=True)),
        ("ingestion_status", sa.Column("ingestion_status", sa.String(length=64), nullable=True)),
        ("ingestion_error", sa.Column("ingestion_error", sa.Text(), nullable=True)),
        ("imported_at", sa.Column("imported_at", sa.DateTime(timezone=True), nullable=True)),
        ("auto_analyze_after_transcription", sa.Column("auto_analyze_after_transcription", sa.Boolean(), nullable=False, server_default=sa.false())),
    ]:
        op.add_column("calls", column)
    op.create_index("uq_calls_source_provider_external_call_id", "calls", ["source_provider", "external_call_id"], unique=True, postgresql_where=sa.text("external_call_id IS NOT NULL"))


def downgrade() -> None:
    op.drop_index("uq_calls_source_provider_external_call_id", table_name="calls")
    for name in ["auto_analyze_after_transcription", "imported_at", "ingestion_error", "ingestion_status", "duration_seconds", "ended_at", "started_at", "agent_phone", "customer_phone", "external_recording_url", "external_call_id", "source_provider", "source"]:
        op.drop_column("calls", name)
    op.drop_table("ingestion_events")
    op.drop_table("telephony_integrations")

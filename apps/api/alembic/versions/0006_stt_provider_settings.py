"""STT provider settings and transcription metadata

Revision ID: 0006_stt_provider_settings
Revises: 0005_call_processing_status_columns
Create Date: 2026-06-02
"""
from alembic import op
import sqlalchemy as sa

revision = "0006_stt_provider_settings"
down_revision = "0005_call_processing_status_columns"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "stt_provider_configs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("provider_type", sa.String(length=64), nullable=False),
        sa.Column("preset", sa.String(length=64), nullable=False, server_default="custom"),
        sa.Column("model", sa.String(length=128), nullable=False, server_default=""),
        sa.Column("base_url", sa.String(length=512), nullable=True),
        sa.Column("api_key", sa.Text(), nullable=True),
        sa.Column("timeout_seconds", sa.Integer(), nullable=False, server_default="180"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.add_column("calls", sa.Column("stt_provider_name", sa.String(length=128), nullable=True))
    op.add_column("calls", sa.Column("stt_provider_type", sa.String(length=64), nullable=True))
    op.add_column("calls", sa.Column("stt_model", sa.String(length=128), nullable=True))
    op.add_column("calls", sa.Column("stt_language_used", sa.String(length=64), nullable=True))
    op.add_column("calls", sa.Column("detected_language", sa.String(length=64), nullable=True))


def downgrade() -> None:
    op.drop_column("calls", "detected_language")
    op.drop_column("calls", "stt_language_used")
    op.drop_column("calls", "stt_model")
    op.drop_column("calls", "stt_provider_type")
    op.drop_column("calls", "stt_provider_name")
    op.drop_table("stt_provider_configs")

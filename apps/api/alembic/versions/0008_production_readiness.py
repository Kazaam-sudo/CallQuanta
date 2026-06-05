"""production readiness auth and retention

Revision ID: 0008_production_readiness
Revises: 0007_telephony_ingestion
Create Date: 2026-06-05
"""
from alembic import op
import sqlalchemy as sa


revision = "0008_production_readiness"
down_revision = "0007_telephony_ingestion"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("password_hash", sa.Text(), nullable=False),
        sa.Column("role", sa.String(length=32), nullable=False, server_default="viewer"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)
    op.add_column("calls", sa.Column("audio_deleted", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("calls", sa.Column("audio_deleted_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("calls", "audio_deleted_at")
    op.drop_column("calls", "audio_deleted")
    op.drop_index("ix_users_email", table_name="users")
    op.drop_table("users")

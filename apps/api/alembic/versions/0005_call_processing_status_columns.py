"""add call processing status columns

Revision ID: 0005_call_processing_status_columns
Revises: 0004_app_settings
Create Date: 2026-05-29
"""

from alembic import op
import sqlalchemy as sa


revision = "0005_call_processing_status_columns"
down_revision = "0004_app_settings"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("calls", sa.Column("last_error_type", sa.String(length=128), nullable=True))
    op.add_column("calls", sa.Column("last_error_message", sa.Text(), nullable=True))
    op.add_column("calls", sa.Column("last_processed_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("calls", "last_processed_at")
    op.drop_column("calls", "last_error_message")
    op.drop_column("calls", "last_error_type")

"""add call metadata columns

Revision ID: 0003_calls_metadata_columns
Revises: 0002_qa_review_history_columns
Create Date: 2026-05-28
"""

from alembic import op
import sqlalchemy as sa


revision = "0003_calls_metadata_columns"
down_revision = "0002_qa_review_history_columns"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("calls", sa.Column("agent_name", sa.String(length=255), nullable=True))
    op.add_column("calls", sa.Column("team", sa.String(length=255), nullable=True))
    op.add_column("calls", sa.Column("campaign", sa.String(length=255), nullable=True))
    op.add_column("calls", sa.Column("direction", sa.String(length=16), nullable=True))
    op.add_column("calls", sa.Column("language", sa.String(length=64), nullable=True))


def downgrade() -> None:
    op.drop_column("calls", "language")
    op.drop_column("calls", "direction")
    op.drop_column("calls", "campaign")
    op.drop_column("calls", "team")
    op.drop_column("calls", "agent_name")

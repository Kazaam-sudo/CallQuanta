"""add qa review history columns

Revision ID: 0002_qa_review_history_columns
Revises: 0001_initial
Create Date: 2026-05-28
"""

from alembic import op
import sqlalchemy as sa

revision = "0002_qa_review_history_columns"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("qa_reviews", sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True))
    op.add_column("qa_reviews", sa.Column("status", sa.String(length=32), nullable=True))
    op.add_column("qa_reviews", sa.Column("analysis_mode", sa.String(length=64), nullable=True))
    op.add_column("qa_reviews", sa.Column("provider_name", sa.String(length=128), nullable=True))
    op.add_column("qa_reviews", sa.Column("provider_preset", sa.String(length=64), nullable=True))
    op.add_column("qa_reviews", sa.Column("model", sa.String(length=128), nullable=True))
    op.add_column("qa_reviews", sa.Column("scorecard_name", sa.String(length=128), nullable=True))
    op.add_column("qa_reviews", sa.Column("report_language", sa.String(length=64), nullable=True))
    op.add_column("qa_reviews", sa.Column("criteria_breakdown", sa.JSON(), nullable=True))
    op.add_column("qa_reviews", sa.Column("findings", sa.JSON(), nullable=True))
    op.add_column("qa_reviews", sa.Column("raw_review_json", sa.JSON(), nullable=True))
    op.add_column("qa_reviews", sa.Column("normalized_review_json", sa.JSON(), nullable=True))
    op.add_column("qa_reviews", sa.Column("error_message", sa.Text(), nullable=True))
    op.add_column("qa_reviews", sa.Column("scorecard_snapshot", sa.JSON(), nullable=True))

    op.execute("UPDATE qa_reviews SET status = 'success' WHERE status IS NULL")


def downgrade() -> None:
    op.drop_column("qa_reviews", "scorecard_snapshot")
    op.drop_column("qa_reviews", "error_message")
    op.drop_column("qa_reviews", "normalized_review_json")
    op.drop_column("qa_reviews", "raw_review_json")
    op.drop_column("qa_reviews", "findings")
    op.drop_column("qa_reviews", "criteria_breakdown")
    op.drop_column("qa_reviews", "report_language")
    op.drop_column("qa_reviews", "scorecard_name")
    op.drop_column("qa_reviews", "model")
    op.drop_column("qa_reviews", "provider_preset")
    op.drop_column("qa_reviews", "provider_name")
    op.drop_column("qa_reviews", "analysis_mode")
    op.drop_column("qa_reviews", "status")
    op.drop_column("qa_reviews", "created_at")

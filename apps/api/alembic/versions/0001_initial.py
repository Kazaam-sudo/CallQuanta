"""initial schema

Revision ID: 0001_initial
Revises:
Create Date: 2026-05-14
"""

from alembic import op
import sqlalchemy as sa

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "calls",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("filename", sa.String(length=255), nullable=False),
        sa.Column("status", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_table(
        "transcript_segments",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("call_id", sa.Integer(), sa.ForeignKey("calls.id"), nullable=False),
        sa.Column("speaker", sa.String(length=32), nullable=False),
        sa.Column("start_ms", sa.Integer(), nullable=False),
        sa.Column("end_ms", sa.Integer(), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
    )
    op.create_table(
        "qa_reviews",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("call_id", sa.Integer(), sa.ForeignKey("calls.id"), nullable=False),
        sa.Column("score", sa.Integer(), nullable=False),
        sa.Column("summary", sa.Text(), nullable=False),
    )
    op.create_table(
        "qa_findings",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("qa_review_id", sa.Integer(), sa.ForeignKey("qa_reviews.id"), nullable=False),
        sa.Column("severity", sa.String(length=32), nullable=False),
        sa.Column("evidence", sa.Text(), nullable=False),
    )
    op.create_table(
        "provider_configs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("provider_type", sa.String(length=32), nullable=False),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("config", sa.JSON(), nullable=False),
    )
    op.create_table(
        "scorecards",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("yaml_content", sa.Text(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("scorecards")
    op.drop_table("provider_configs")
    op.drop_table("qa_findings")
    op.drop_table("qa_reviews")
    op.drop_table("transcript_segments")
    op.drop_table("calls")

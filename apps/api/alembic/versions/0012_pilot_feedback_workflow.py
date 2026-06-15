"""pilot feedback workflow tables

Revision ID: 0012_pilot_feedback_workflow
Revises: 0011_qa_calibration_workflow
Create Date: 2026-06-15
"""

from alembic import op
import sqlalchemy as sa

revision = "0012_pilot_feedback_workflow"
down_revision = "0011_qa_calibration_workflow"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "qa_review_assignments",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("review_id", sa.Integer(), sa.ForeignKey("qa_reviews.id"), nullable=False),
        sa.Column("call_id", sa.Integer(), sa.ForeignKey("calls.id"), nullable=False),
        sa.Column("assigned_to_user_id", sa.Integer(), nullable=False),
        sa.Column("assigned_by_user_id", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=True, server_default="assigned"),
        sa.Column("due_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_table(
        "qa_feedback",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("review_id", sa.Integer(), sa.ForeignKey("qa_reviews.id"), nullable=False),
        sa.Column("call_id", sa.Integer(), sa.ForeignKey("calls.id"), nullable=False),
        sa.Column("created_by_user_id", sa.Integer(), nullable=True),
        sa.Column("created_by_email", sa.String(length=255), nullable=True),
        sa.Column("transcript_quality", sa.String(length=32), nullable=True),
        sa.Column("qa_analysis_quality", sa.String(length=32), nullable=True),
        sa.Column("score_agreement", sa.String(length=32), nullable=True),
        sa.Column("scorecard_fit", sa.String(length=64), nullable=True),
        sa.Column("ai_missed_something", sa.Boolean(), nullable=True, server_default=sa.false()),
        sa.Column("ai_missed_comment", sa.Text(), nullable=True),
        sa.Column("ai_false_positive", sa.Boolean(), nullable=True, server_default=sa.false()),
        sa.Column("ai_false_positive_comment", sa.Text(), nullable=True),
        sa.Column("useful_for_coaching", sa.Boolean(), nullable=True),
        sa.Column("coaching_usefulness_comment", sa.Text(), nullable=True),
        sa.Column("overall_feedback", sa.Text(), nullable=True),
        sa.Column("issue_tags_json", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("qa_feedback")
    op.drop_table("qa_review_assignments")

"""qa calibration workflow

Revision ID: 0011_qa_calibration_workflow
Revises: 0010_password_change_users_ux
Create Date: 2026-06-09
"""
from alembic import op
import sqlalchemy as sa

revision = "0011_qa_calibration_workflow"
down_revision = "0010_password_change_users_ux"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("qa_reviews", sa.Column("review_status", sa.String(length=32), nullable=False, server_default="ai_generated"))
    op.add_column("qa_reviews", sa.Column("human_reviewer_user_id", sa.Integer(), nullable=True))
    op.add_column("qa_reviews", sa.Column("human_reviewer_email", sa.String(length=255), nullable=True))
    op.add_column("qa_reviews", sa.Column("human_reviewed_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("qa_reviews", sa.Column("human_total_score", sa.Float(), nullable=True))
    op.add_column("qa_reviews", sa.Column("human_summary", sa.Text(), nullable=True))
    op.add_column("qa_reviews", sa.Column("human_notes", sa.Text(), nullable=True))
    op.add_column("qa_reviews", sa.Column("ai_human_score_delta", sa.Float(), nullable=True))
    op.add_column("qa_reviews", sa.Column("calibration_flag", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("qa_reviews", sa.Column("calibration_notes", sa.Text(), nullable=True))
    op.create_table(
        "qa_coaching_actions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("review_id", sa.Integer(), sa.ForeignKey("qa_reviews.id"), nullable=False),
        sa.Column("call_id", sa.Integer(), sa.ForeignKey("calls.id"), nullable=False),
        sa.Column("agent_name", sa.String(length=255), nullable=True),
        sa.Column("assigned_to_user_id", sa.Integer(), nullable=True),
        sa.Column("created_by_user_id", sa.Integer(), nullable=True),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="open"),
        sa.Column("due_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("qa_coaching_actions")
    op.drop_column("qa_reviews", "calibration_notes")
    op.drop_column("qa_reviews", "calibration_flag")
    op.drop_column("qa_reviews", "ai_human_score_delta")
    op.drop_column("qa_reviews", "human_notes")
    op.drop_column("qa_reviews", "human_summary")
    op.drop_column("qa_reviews", "human_total_score")
    op.drop_column("qa_reviews", "human_reviewed_at")
    op.drop_column("qa_reviews", "human_reviewer_email")
    op.drop_column("qa_reviews", "human_reviewer_user_id")
    op.drop_column("qa_reviews", "review_status")

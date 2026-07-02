"""pilot feedback transcript safety fields

Revision ID: 0014_pilot_feedback_transcript_safety
Revises: 0013_call_topics
"""
from alembic import op
import sqlalchemy as sa

revision = "0014_pilot_feedback_transcript_safety"
down_revision = "0013_call_topics"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("qa_feedback", sa.Column("ai_topic_correct", sa.String(length=32), nullable=True))
    op.add_column("qa_feedback", sa.Column("manager_correct_topic", sa.String(length=255), nullable=True))
    op.add_column("qa_feedback", sa.Column("topic_feedback_comment", sa.Text(), nullable=True))
    op.add_column("qa_feedback", sa.Column("required_actions_correct", sa.String(length=32), nullable=True))
    op.add_column("qa_feedback", sa.Column("missed_required_actions_feedback", sa.Text(), nullable=True))
    op.add_column("qa_feedback", sa.Column("false_required_actions_feedback", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("qa_feedback", "false_required_actions_feedback")
    op.drop_column("qa_feedback", "missed_required_actions_feedback")
    op.drop_column("qa_feedback", "required_actions_correct")
    op.drop_column("qa_feedback", "topic_feedback_comment")
    op.drop_column("qa_feedback", "manager_correct_topic")
    op.drop_column("qa_feedback", "ai_topic_correct")

"""call topics taxonomy and compliance

Revision ID: 0013_call_topics
Revises: 0012_pilot_feedback_workflow
Create Date: 2026-06-22 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = "0013_call_topics"
down_revision = "0012_pilot_feedback_workflow"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table("call_topics", sa.Column("id", sa.Integer(), primary_key=True), sa.Column("name", sa.String(255), nullable=False, unique=True), sa.Column("slug", sa.String(255), nullable=False, unique=True), sa.Column("description", sa.Text()), sa.Column("examples", sa.JSON()), sa.Column("keywords", sa.JSON()), sa.Column("negative_examples", sa.JSON()), sa.Column("required_actions", sa.JSON()), sa.Column("script_checklist", sa.JSON()), sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()), sa.Column("priority", sa.Integer(), nullable=False, server_default="100"), sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()), sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()))
    op.create_index("ix_call_topics_name", "call_topics", ["name"])
    op.create_index("ix_call_topics_slug", "call_topics", ["slug"])
    op.create_table("call_topic_classifications", sa.Column("id", sa.Integer(), primary_key=True), sa.Column("call_id", sa.Integer(), sa.ForeignKey("calls.id"), nullable=False), sa.Column("primary_topic_id", sa.Integer(), sa.ForeignKey("call_topics.id")), sa.Column("primary_topic_name", sa.String(255)), sa.Column("secondary_topics", sa.JSON()), sa.Column("confidence", sa.Float()), sa.Column("rationale", sa.Text()), sa.Column("evidence", sa.JSON()), sa.Column("classified_by", sa.String(255)), sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()), sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()), sa.Column("manually_overridden", sa.Boolean(), nullable=False, server_default=sa.false()), sa.Column("manual_topic_id", sa.Integer(), sa.ForeignKey("call_topics.id")), sa.Column("manual_notes", sa.Text()))
    op.create_index("ix_call_topic_classifications_call_id", "call_topic_classifications", ["call_id"])
    op.create_table("topic_action_results", sa.Column("id", sa.Integer(), primary_key=True), sa.Column("call_id", sa.Integer(), sa.ForeignKey("calls.id"), nullable=False), sa.Column("topic_id", sa.Integer(), sa.ForeignKey("call_topics.id"), nullable=False), sa.Column("action_key", sa.String(255)), sa.Column("action_text", sa.Text(), nullable=False), sa.Column("status", sa.String(32), nullable=False, server_default="unclear"), sa.Column("evidence", sa.JSON()), sa.Column("rationale", sa.Text()), sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()), sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()))
    op.create_index("ix_topic_action_results_call_id", "topic_action_results", ["call_id"])
    op.create_index("ix_topic_action_results_topic_id", "topic_action_results", ["topic_id"])


def downgrade() -> None:
    op.drop_table("topic_action_results")
    op.drop_table("call_topic_classifications")
    op.drop_table("call_topics")

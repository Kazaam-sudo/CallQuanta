"""access control users and audit events

Revision ID: 0009_access_control_audit
Revises: 0008_production_readiness
Create Date: 2026-06-08
"""
from alembic import op
import sqlalchemy as sa

revision = "0009_access_control_audit"
down_revision = "0008_production_readiness"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("display_name", sa.String(length=255), nullable=True))
    op.add_column("users", sa.Column("team", sa.String(length=255), nullable=True))
    op.add_column("users", sa.Column("agent_name", sa.String(length=255), nullable=True))
    op.add_column("users", sa.Column("visibility_scope", sa.String(length=16), nullable=False, server_default="team"))
    op.execute("UPDATE users SET visibility_scope = CASE WHEN role = 'admin' THEN 'all' WHEN role = 'agent' THEN 'own' ELSE COALESCE(visibility_scope, 'team') END")
    op.create_table(
        "audit_events",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("actor_user_id", sa.Integer(), nullable=True),
        sa.Column("actor_email", sa.String(length=255), nullable=True),
        sa.Column("action", sa.String(length=128), nullable=False),
        sa.Column("entity_type", sa.String(length=64), nullable=False),
        sa.Column("entity_id", sa.String(length=128), nullable=True),
        sa.Column("message", sa.Text(), nullable=True),
        sa.Column("metadata_json", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_audit_events_action", "audit_events", ["action"])
    op.create_index("ix_audit_events_entity_type", "audit_events", ["entity_type"])


def downgrade() -> None:
    op.drop_index("ix_audit_events_entity_type", table_name="audit_events")
    op.drop_index("ix_audit_events_action", table_name="audit_events")
    op.drop_table("audit_events")
    op.drop_column("users", "visibility_scope")
    op.drop_column("users", "agent_name")
    op.drop_column("users", "team")
    op.drop_column("users", "display_name")

"""password change users ux

Revision ID: 0010_password_change_users_ux
Revises: 0009_access_control_audit
Create Date: 2026-06-08
"""
from alembic import op
import sqlalchemy as sa

revision = "0010_password_change_users_ux"
down_revision = "0009_access_control_audit"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("must_change_password", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.execute("UPDATE users SET visibility_scope = 'all' WHERE role = 'admin' AND (visibility_scope IS NULL OR visibility_scope = '' OR visibility_scope = 'team')")


def downgrade() -> None:
    op.drop_column("users", "must_change_password")

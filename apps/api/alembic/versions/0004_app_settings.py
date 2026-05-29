"""add app settings

Revision ID: 0004_app_settings
Revises: 0003_calls_metadata_columns
Create Date: 2026-05-29
"""

from alembic import op
import sqlalchemy as sa


revision = "0004_app_settings"
down_revision = "0003_calls_metadata_columns"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "app_settings",
        sa.Column("key", sa.String(length=128), primary_key=True),
        sa.Column("value", sa.JSON(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("app_settings")

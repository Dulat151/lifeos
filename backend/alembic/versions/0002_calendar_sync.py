"""two-way calendar sync (Google, CalDAV): account meta + per-event sync bookkeeping

Revision ID: 0002
Revises: 0001
"""
import sqlalchemy as sa

from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("connected_accounts", sa.Column("meta", sa.JSON(), server_default="{}", nullable=False))
    op.add_column("calendar_events", sa.Column("external_meta", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("calendar_events", "external_meta")
    op.drop_column("connected_accounts", "meta")

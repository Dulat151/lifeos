"""projects, rewards, quests, links

Revision ID: 0003
Revises: 0002
Create Date: 2026-11-27 22:15:24.887884
"""
import sqlalchemy as sa

from alembic import op

revision = '0003'
down_revision = '0002'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table('coin_transactions',
    sa.Column('amount', sa.Integer(), nullable=False),
    sa.Column('reason', sa.String(length=60), nullable=False),
    sa.Column('idempotency_key', sa.String(length=200), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('user_id', 'idempotency_key', name='uq_coin_idem')
    )
    op.create_index(op.f('ix_coin_transactions_created_at'), 'coin_transactions', ['created_at'], unique=False)
    op.create_index(op.f('ix_coin_transactions_user_id'), 'coin_transactions', ['user_id'], unique=False)
    op.create_table('streak_freezes',
    sa.Column('day', sa.Date(), nullable=False),
    sa.Column('source', sa.String(length=20), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('user_id', 'day')
    )
    op.create_index(op.f('ix_streak_freezes_user_id'), 'streak_freezes', ['user_id'], unique=False)
    op.create_table('user_items',
    sa.Column('item_code', sa.String(length=60), nullable=False),
    sa.Column('quantity', sa.Integer(), nullable=False),
    sa.Column('acquired_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('user_id', 'item_code')
    )
    op.create_index(op.f('ix_user_items_user_id'), 'user_items', ['user_id'], unique=False)
    op.create_table('projects',
    sa.Column('title', sa.String(length=200), nullable=False),
    sa.Column('description', sa.Text(), nullable=False),
    sa.Column('status', sa.String(length=20), nullable=False),
    sa.Column('priority', sa.Integer(), nullable=False),
    sa.Column('color', sa.String(length=20), nullable=False),
    sa.Column('deadline', sa.Date(), nullable=True),
    sa.Column('position', sa.Float(), nullable=False),
    sa.Column('goal_id', sa.UUID(), nullable=True),
    sa.Column('archived', sa.Boolean(), nullable=False),
    sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.ForeignKeyConstraint(['goal_id'], ['goals.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_projects_archived'), 'projects', ['archived'], unique=False)
    op.create_index(op.f('ix_projects_deleted_at'), 'projects', ['deleted_at'], unique=False)
    op.create_index(op.f('ix_projects_goal_id'), 'projects', ['goal_id'], unique=False)
    op.create_index(op.f('ix_projects_status'), 'projects', ['status'], unique=False)
    op.create_index(op.f('ix_projects_user_id'), 'projects', ['user_id'], unique=False)
    op.add_column('calendar_events', sa.Column('project_id', sa.UUID(), nullable=True))
    op.add_column('calendar_events', sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('calendar_events', sa.Column('done_occurrences', sa.JSON(), nullable=True))
    op.create_index(op.f('ix_calendar_events_project_id'), 'calendar_events', ['project_id'], unique=False)
    op.create_foreign_key('fk_calendar_events_project_id', 'calendar_events', 'projects', ['project_id'], ['id'], ondelete='SET NULL')
    op.add_column('notes', sa.Column('is_pinned', sa.Boolean(), server_default=sa.false(), nullable=False))
    op.add_column('notes', sa.Column('project_id', sa.UUID(), nullable=True))
    op.add_column('notes', sa.Column('habit_id', sa.UUID(), nullable=True))
    op.create_index(op.f('ix_notes_habit_id'), 'notes', ['habit_id'], unique=False)
    op.create_index(op.f('ix_notes_project_id'), 'notes', ['project_id'], unique=False)
    op.create_foreign_key('fk_notes_project_id', 'notes', 'projects', ['project_id'], ['id'], ondelete='SET NULL')
    op.create_foreign_key('fk_notes_habit_id', 'notes', 'habits', ['habit_id'], ['id'], ondelete='SET NULL')
    op.add_column('settings', sa.Column('cosmetics', sa.JSON(), server_default='{}', nullable=False))
    op.add_column('settings', sa.Column('preferences', sa.JSON(), server_default='{}', nullable=False))
    op.add_column('tasks', sa.Column('project_id', sa.UUID(), nullable=True))
    op.create_index(op.f('ix_tasks_project_id'), 'tasks', ['project_id'], unique=False)
    op.create_foreign_key('fk_tasks_project_id', 'tasks', 'projects', ['project_id'], ['id'], ondelete='SET NULL')


def downgrade() -> None:
    op.drop_constraint('fk_tasks_project_id', 'tasks', type_='foreignkey')
    op.drop_index(op.f('ix_tasks_project_id'), table_name='tasks')
    op.drop_column('tasks', 'project_id')
    op.drop_column('settings', 'preferences')
    op.drop_column('settings', 'cosmetics')
    op.drop_constraint('fk_notes_habit_id', 'notes', type_='foreignkey')
    op.drop_constraint('fk_notes_project_id', 'notes', type_='foreignkey')
    op.drop_index(op.f('ix_notes_project_id'), table_name='notes')
    op.drop_index(op.f('ix_notes_habit_id'), table_name='notes')
    op.drop_column('notes', 'habit_id')
    op.drop_column('notes', 'project_id')
    op.drop_column('notes', 'is_pinned')
    op.drop_constraint('fk_calendar_events_project_id', 'calendar_events', type_='foreignkey')
    op.drop_index(op.f('ix_calendar_events_project_id'), table_name='calendar_events')
    op.drop_column('calendar_events', 'done_occurrences')
    op.drop_column('calendar_events', 'completed_at')
    op.drop_column('calendar_events', 'project_id')
    op.drop_index(op.f('ix_projects_user_id'), table_name='projects')
    op.drop_index(op.f('ix_projects_status'), table_name='projects')
    op.drop_index(op.f('ix_projects_goal_id'), table_name='projects')
    op.drop_index(op.f('ix_projects_deleted_at'), table_name='projects')
    op.drop_index(op.f('ix_projects_archived'), table_name='projects')
    op.drop_table('projects')
    op.drop_index(op.f('ix_user_items_user_id'), table_name='user_items')
    op.drop_table('user_items')
    op.drop_index(op.f('ix_streak_freezes_user_id'), table_name='streak_freezes')
    op.drop_table('streak_freezes')
    op.drop_index(op.f('ix_coin_transactions_user_id'), table_name='coin_transactions')
    op.drop_index(op.f('ix_coin_transactions_created_at'), table_name='coin_transactions')
    op.drop_table('coin_transactions')

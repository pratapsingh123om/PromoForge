"""add evaluation workflow

Revision ID: 9a71c4d82e16
Revises: 6e9c24a8310f
Create Date: 2026-11-20 19:15:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "9a71c4d82e16"
down_revision: Union[str, Sequence[str], None] = "6e9c24a8310f"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "evaluation_sessions",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("job_id", sa.String(length=36), nullable=False),
        sa.Column("episode_id", sa.String(length=36), nullable=False),
        sa.Column("session_key", sa.String(length=128), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("candidate_count", sa.Integer(), nullable=False),
        sa.Column("min_reviews_per_candidate", sa.Integer(), nullable=False),
        sa.Column("report_json", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["episode_id"], ["episodes.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["job_id"], ["analysis_jobs.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "job_id", "episode_id", "session_key", name="uq_evaluation_session_key"
        ),
    )
    op.create_index(
        "ix_evaluation_session_status",
        "evaluation_sessions",
        ["status", "created_at"],
        unique=False,
    )
    op.create_index(
        op.f("ix_evaluation_sessions_episode_id"),
        "evaluation_sessions",
        ["episode_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_evaluation_sessions_job_id"),
        "evaluation_sessions",
        ["job_id"],
        unique=False,
    )
    op.create_table(
        "review_assignments",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("session_id", sa.String(length=36), nullable=False),
        sa.Column("promo_candidate_id", sa.String(length=36), nullable=False),
        sa.Column("reviewer_id", sa.String(length=128), nullable=False),
        sa.Column("blind_label", sa.String(length=32), nullable=False),
        sa.Column("assignment_order", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["promo_candidate_id"], ["promo_candidates.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["session_id"], ["evaluation_sessions.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "session_id",
            "promo_candidate_id",
            "reviewer_id",
            name="uq_review_assignment_reviewer_candidate",
        ),
    )
    op.create_index(
        "ix_review_assignment_queue",
        "review_assignments",
        ["session_id", "reviewer_id", "status"],
        unique=False,
    )
    op.create_index(
        op.f("ix_review_assignments_promo_candidate_id"),
        "review_assignments",
        ["promo_candidate_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_review_assignments_session_id"),
        "review_assignments",
        ["session_id"],
        unique=False,
    )
    op.create_table(
        "editor_reviews",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("assignment_id", sa.String(length=36), nullable=False),
        sa.Column("decision", sa.String(length=32), nullable=False),
        sa.Column("scores", sa.JSON(), nullable=False),
        sa.Column("boundary_usable", sa.Boolean(), nullable=False),
        sa.Column("spoiler_safe", sa.Boolean(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["assignment_id"], ["review_assignments.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("assignment_id"),
    )
    op.create_index(
        op.f("ix_editor_reviews_assignment_id"),
        "editor_reviews",
        ["assignment_id"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_editor_reviews_assignment_id"), table_name="editor_reviews")
    op.drop_table("editor_reviews")
    op.drop_index(op.f("ix_review_assignments_session_id"), table_name="review_assignments")
    op.drop_index(
        op.f("ix_review_assignments_promo_candidate_id"), table_name="review_assignments"
    )
    op.drop_index("ix_review_assignment_queue", table_name="review_assignments")
    op.drop_table("review_assignments")
    op.drop_index(op.f("ix_evaluation_sessions_job_id"), table_name="evaluation_sessions")
    op.drop_index(op.f("ix_evaluation_sessions_episode_id"), table_name="evaluation_sessions")
    op.drop_index("ix_evaluation_session_status", table_name="evaluation_sessions")
    op.drop_table("evaluation_sessions")

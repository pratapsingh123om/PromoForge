"""add promo candidates

Revision ID: 6e9c24a8310f
Revises: 298f2ff1bd0b
Create Date: 2026-11-20 18:10:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "6e9c24a8310f"
down_revision: Union[str, Sequence[str], None] = "298f2ff1bd0b"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "promo_candidates",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("job_id", sa.String(length=36), nullable=False),
        sa.Column("episode_id", sa.String(length=36), nullable=False),
        sa.Column("model_run_id", sa.String(length=36), nullable=False),
        sa.Column("generator_version", sa.String(length=64), nullable=False),
        sa.Column("candidate_key", sa.String(length=128), nullable=False),
        sa.Column("rank", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("start_ms", sa.Integer(), nullable=False),
        sa.Column("end_ms", sa.Integer(), nullable=False),
        sa.Column("duration_ms", sa.Integer(), nullable=False),
        sa.Column("hook_event_key", sa.String(length=64), nullable=False),
        sa.Column("end_event_key", sa.String(length=64), nullable=False),
        sa.Column("evidence_event_ids", sa.JSON(), nullable=False),
        sa.Column("score", sa.Double(), nullable=False),
        sa.Column("score_components", sa.JSON(), nullable=False),
        sa.Column("validation_issues", sa.JSON(), nullable=False),
        sa.Column("suppressed_by_key", sa.String(length=128), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["episode_id"], ["episodes.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["job_id"], ["analysis_jobs.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["model_run_id"], ["model_runs.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "job_id",
            "candidate_key",
            "generator_version",
            name="uq_promo_job_candidate_version",
        ),
    )
    op.create_index(
        "ix_promo_episode_status_rank",
        "promo_candidates",
        ["episode_id", "status", "rank"],
        unique=False,
    )
    op.create_index(
        op.f("ix_promo_candidates_episode_id"),
        "promo_candidates",
        ["episode_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_promo_candidates_job_id"),
        "promo_candidates",
        ["job_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_promo_candidates_model_run_id"),
        "promo_candidates",
        ["model_run_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_promo_candidates_model_run_id"), table_name="promo_candidates")
    op.drop_index(op.f("ix_promo_candidates_job_id"), table_name="promo_candidates")
    op.drop_index(op.f("ix_promo_candidates_episode_id"), table_name="promo_candidates")
    op.drop_index("ix_promo_episode_status_rank", table_name="promo_candidates")
    op.drop_table("promo_candidates")

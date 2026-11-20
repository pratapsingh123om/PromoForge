from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def new_id() -> str:
    return str(uuid4())


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class ProjectRecord(Base):
    __tablename__ = "projects"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    source_name: Mapped[str | None] = mapped_column(String(500))
    source_sha256: Mapped[str | None] = mapped_column(String(64), unique=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="ready")
    ingestion_warnings: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now
    )

    episodes: Mapped[list[EpisodeRecord]] = relationship(
        back_populates="project", cascade="all, delete-orphan"
    )
    jobs: Mapped[list[AnalysisJobRecord]] = relationship(
        back_populates="project", cascade="all, delete-orphan"
    )


class EpisodeRecord(Base):
    __tablename__ = "episodes"
    __table_args__ = (
        UniqueConstraint("project_id", "episode_key", name="uq_episode_project_key"),
        Index("ix_episodes_project_number", "project_id", "episode_number"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    episode_key: Mapped[str] = mapped_column(String(64), nullable=False)
    episode_number: Mapped[int] = mapped_column(Integer, nullable=False)
    external_episode_id: Mapped[str | None] = mapped_column(String(128))
    source_name: Mapped[str | None] = mapped_column(String(500))
    source_sha256: Mapped[str | None] = mapped_column(String(64))
    duration_ms: Mapped[int] = mapped_column(Integer, nullable=False)
    language: Mapped[str] = mapped_column(String(16), nullable=False, default="en")
    logline: Mapped[str | None] = mapped_column(Text)
    continuity_notes: Mapped[str | None] = mapped_column(Text)
    parse_warnings: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    project: Mapped[ProjectRecord] = relationship(back_populates="episodes")
    scenes: Mapped[list[SceneRecord]] = relationship(
        back_populates="episode", cascade="all, delete-orphan"
    )
    events: Mapped[list[ScreenplayEventRecord]] = relationship(
        back_populates="episode", cascade="all, delete-orphan"
    )
    checkpoints: Mapped[list[EpisodeCheckpointRecord]] = relationship(
        back_populates="episode", cascade="all, delete-orphan"
    )
    model_runs: Mapped[list[ModelRunRecord]] = relationship(
        back_populates="episode", cascade="all, delete-orphan"
    )
    narrative_events: Mapped[list[NarrativeEventRecord]] = relationship(
        back_populates="episode", cascade="all, delete-orphan"
    )
    promo_candidates: Mapped[list[PromoCandidateRecord]] = relationship(
        back_populates="episode", cascade="all, delete-orphan"
    )
    evaluation_sessions: Mapped[list[EvaluationSessionRecord]] = relationship(
        back_populates="episode", cascade="all, delete-orphan"
    )


class SceneRecord(Base):
    __tablename__ = "screenplay_scenes"
    __table_args__ = (
        UniqueConstraint("episode_id", "scene_key", name="uq_scene_episode_key"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    episode_id: Mapped[str] = mapped_column(
        ForeignKey("episodes.id", ondelete="CASCADE"), nullable=False, index=True
    )
    scene_key: Mapped[str] = mapped_column(String(64), nullable=False)
    heading: Mapped[str] = mapped_column(Text, nullable=False)
    start_ms: Mapped[int] = mapped_column(Integer, nullable=False)
    end_ms: Mapped[int] = mapped_column(Integer, nullable=False)
    source_line: Mapped[int] = mapped_column(Integer, nullable=False)

    episode: Mapped[EpisodeRecord] = relationship(back_populates="scenes")


class ScreenplayEventRecord(Base):
    __tablename__ = "screenplay_events"
    __table_args__ = (
        UniqueConstraint("episode_id", "event_key", name="uq_event_episode_key"),
        Index("ix_events_episode_time", "episode_id", "start_ms", "end_ms"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    episode_id: Mapped[str] = mapped_column(
        ForeignKey("episodes.id", ondelete="CASCADE"), nullable=False, index=True
    )
    event_key: Mapped[str] = mapped_column(String(64), nullable=False)
    scene_key: Mapped[str] = mapped_column(String(64), nullable=False)
    start_ms: Mapped[int] = mapped_column(Integer, nullable=False)
    end_ms: Mapped[int] = mapped_column(Integer, nullable=False)
    event_type: Mapped[str] = mapped_column(String(32), nullable=False)
    character: Mapped[str | None] = mapped_column(String(255))
    performance_cue: Mapped[str | None] = mapped_column(String(500))
    source_label: Mapped[str | None] = mapped_column(String(500))
    text: Mapped[str] = mapped_column(Text, nullable=False)
    timing_source: Mapped[str] = mapped_column(String(32), nullable=False)
    source_line: Mapped[int] = mapped_column(Integer, nullable=False)

    episode: Mapped[EpisodeRecord] = relationship(back_populates="events")


class AnalysisJobRecord(Base):
    __tablename__ = "analysis_jobs"
    __table_args__ = (
        UniqueConstraint("project_id", "idempotency_key", name="uq_job_idempotency"),
        Index("ix_jobs_project_created", "project_id", "created_at"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    idempotency_key: Mapped[str] = mapped_column(String(128), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="queued")
    stage: Mapped[str] = mapped_column(String(64), nullable=False, default="pending")
    episodes_total: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    episodes_completed: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    episodes_failed: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    progress_percent: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    resumable: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    cancel_requested: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    error_message: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now
    )
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    project: Mapped[ProjectRecord] = relationship(back_populates="jobs")
    checkpoints: Mapped[list[EpisodeCheckpointRecord]] = relationship(
        back_populates="job", cascade="all, delete-orphan"
    )
    model_runs: Mapped[list[ModelRunRecord]] = relationship(
        back_populates="job", cascade="all, delete-orphan"
    )
    promo_candidates: Mapped[list[PromoCandidateRecord]] = relationship(
        back_populates="job", cascade="all, delete-orphan"
    )
    evaluation_sessions: Mapped[list[EvaluationSessionRecord]] = relationship(
        back_populates="job", cascade="all, delete-orphan"
    )


class EpisodeCheckpointRecord(Base):
    __tablename__ = "episode_checkpoints"
    __table_args__ = (
        UniqueConstraint("job_id", "episode_id", name="uq_checkpoint_job_episode"),
        Index("ix_checkpoints_job_status", "job_id", "status"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    job_id: Mapped[str] = mapped_column(
        ForeignKey("analysis_jobs.id", ondelete="CASCADE"), nullable=False, index=True
    )
    episode_id: Mapped[str] = mapped_column(
        ForeignKey("episodes.id", ondelete="CASCADE"), nullable=False, index=True
    )
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="pending")
    stage: Mapped[str] = mapped_column(String(64), nullable=False, default="pending")
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    error_message: Mapped[str | None] = mapped_column(Text)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now
    )

    job: Mapped[AnalysisJobRecord] = relationship(back_populates="checkpoints")
    episode: Mapped[EpisodeRecord] = relationship(back_populates="checkpoints")


class ModelRunRecord(Base):
    __tablename__ = "model_runs"
    __table_args__ = (
        Index(
            "ix_model_run_cache",
            "episode_id",
            "provider",
            "model",
            "prompt_version",
            "request_hash",
        ),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    job_id: Mapped[str] = mapped_column(
        ForeignKey("analysis_jobs.id", ondelete="CASCADE"), nullable=False, index=True
    )
    episode_id: Mapped[str] = mapped_column(
        ForeignKey("episodes.id", ondelete="CASCADE"), nullable=False, index=True
    )
    provider: Mapped[str] = mapped_column(String(64), nullable=False)
    model: Mapped[str] = mapped_column(String(128), nullable=False)
    prompt_version: Mapped[str] = mapped_column(String(64), nullable=False)
    request_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    fallback_used: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    input_tokens: Mapped[int | None] = mapped_column(Integer)
    output_tokens: Mapped[int | None] = mapped_column(Integer)
    latency_ms: Mapped[int | None] = mapped_column(Integer)
    retry_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    raw_output: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    error_message: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    job: Mapped[AnalysisJobRecord] = relationship(back_populates="model_runs")
    episode: Mapped[EpisodeRecord] = relationship(back_populates="model_runs")
    narrative_events: Mapped[list[NarrativeEventRecord]] = relationship(
        back_populates="model_run", cascade="all, delete-orphan"
    )
    promo_candidates: Mapped[list[PromoCandidateRecord]] = relationship(
        back_populates="model_run", cascade="all, delete-orphan"
    )


class NarrativeEventRecord(Base):
    __tablename__ = "narrative_events"
    __table_args__ = (
        UniqueConstraint(
            "model_run_id", "source_event_key", name="uq_narrative_run_source_event"
        ),
        Index("ix_narrative_episode_type", "episode_id", "narrative_type"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    episode_id: Mapped[str] = mapped_column(
        ForeignKey("episodes.id", ondelete="CASCADE"), nullable=False, index=True
    )
    model_run_id: Mapped[str] = mapped_column(
        ForeignKey("model_runs.id", ondelete="CASCADE"), nullable=False, index=True
    )
    source_event_key: Mapped[str] = mapped_column(String(64), nullable=False)
    narrative_type: Mapped[str] = mapped_column(String(64), nullable=False)
    characters: Mapped[list[str]] = mapped_column(JSON, default=list)
    conflict: Mapped[str | None] = mapped_column(Text)
    emotional_appeal: Mapped[str] = mapped_column(String(128), nullable=False)
    hook_strength: Mapped[int] = mapped_column(Integer, nullable=False)
    tension: Mapped[int] = mapped_column(Integer, nullable=False)
    context_dependency: Mapped[str] = mapped_column(String(32), nullable=False)
    open_question: Mapped[str | None] = mapped_column(Text)
    resolves_question: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    evidence_event_ids: Mapped[list[str]] = mapped_column(JSON, default=list)
    confidence: Mapped[float] = mapped_column(nullable=False)

    episode: Mapped[EpisodeRecord] = relationship(back_populates="narrative_events")
    model_run: Mapped[ModelRunRecord] = relationship(back_populates="narrative_events")


class PromoCandidateRecord(Base):
    __tablename__ = "promo_candidates"
    __table_args__ = (
        UniqueConstraint(
            "job_id",
            "candidate_key",
            "generator_version",
            name="uq_promo_job_candidate_version",
        ),
        Index("ix_promo_episode_status_rank", "episode_id", "status", "rank"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    job_id: Mapped[str] = mapped_column(
        ForeignKey("analysis_jobs.id", ondelete="CASCADE"), nullable=False, index=True
    )
    episode_id: Mapped[str] = mapped_column(
        ForeignKey("episodes.id", ondelete="CASCADE"), nullable=False, index=True
    )
    model_run_id: Mapped[str] = mapped_column(
        ForeignKey("model_runs.id", ondelete="CASCADE"), nullable=False, index=True
    )
    generator_version: Mapped[str] = mapped_column(String(64), nullable=False)
    candidate_key: Mapped[str] = mapped_column(String(128), nullable=False)
    rank: Mapped[int | None] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    start_ms: Mapped[int] = mapped_column(Integer, nullable=False)
    end_ms: Mapped[int] = mapped_column(Integer, nullable=False)
    duration_ms: Mapped[int] = mapped_column(Integer, nullable=False)
    hook_event_key: Mapped[str] = mapped_column(String(64), nullable=False)
    end_event_key: Mapped[str] = mapped_column(String(64), nullable=False)
    evidence_event_ids: Mapped[list[str]] = mapped_column(JSON, default=list)
    score: Mapped[float] = mapped_column(nullable=False)
    score_components: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    validation_issues: Mapped[list[str]] = mapped_column(JSON, default=list)
    suppressed_by_key: Mapped[str | None] = mapped_column(String(128))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    job: Mapped[AnalysisJobRecord] = relationship(back_populates="promo_candidates")
    episode: Mapped[EpisodeRecord] = relationship(back_populates="promo_candidates")
    model_run: Mapped[ModelRunRecord] = relationship(back_populates="promo_candidates")
    review_assignments: Mapped[list[ReviewAssignmentRecord]] = relationship(
        back_populates="promo_candidate", cascade="all, delete-orphan"
    )


class EvaluationSessionRecord(Base):
    __tablename__ = "evaluation_sessions"
    __table_args__ = (
        UniqueConstraint(
            "job_id", "episode_id", "session_key", name="uq_evaluation_session_key"
        ),
        Index("ix_evaluation_session_status", "status", "created_at"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    job_id: Mapped[str] = mapped_column(
        ForeignKey("analysis_jobs.id", ondelete="CASCADE"), nullable=False, index=True
    )
    episode_id: Mapped[str] = mapped_column(
        ForeignKey("episodes.id", ondelete="CASCADE"), nullable=False, index=True
    )
    session_key: Mapped[str] = mapped_column(String(128), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="active")
    candidate_count: Mapped[int] = mapped_column(Integer, nullable=False)
    min_reviews_per_candidate: Mapped[int] = mapped_column(Integer, nullable=False, default=2)
    report_json: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    job: Mapped[AnalysisJobRecord] = relationship(back_populates="evaluation_sessions")
    episode: Mapped[EpisodeRecord] = relationship(back_populates="evaluation_sessions")
    assignments: Mapped[list[ReviewAssignmentRecord]] = relationship(
        back_populates="session", cascade="all, delete-orphan"
    )


class ReviewAssignmentRecord(Base):
    __tablename__ = "review_assignments"
    __table_args__ = (
        UniqueConstraint(
            "session_id",
            "promo_candidate_id",
            "reviewer_id",
            name="uq_review_assignment_reviewer_candidate",
        ),
        Index("ix_review_assignment_queue", "session_id", "reviewer_id", "status"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    session_id: Mapped[str] = mapped_column(
        ForeignKey("evaluation_sessions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    promo_candidate_id: Mapped[str] = mapped_column(
        ForeignKey("promo_candidates.id", ondelete="CASCADE"), nullable=False, index=True
    )
    reviewer_id: Mapped[str] = mapped_column(String(128), nullable=False)
    blind_label: Mapped[str] = mapped_column(String(32), nullable=False)
    assignment_order: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="pending")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    session: Mapped[EvaluationSessionRecord] = relationship(back_populates="assignments")
    promo_candidate: Mapped[PromoCandidateRecord] = relationship(
        back_populates="review_assignments"
    )
    review: Mapped[EditorReviewRecord | None] = relationship(
        back_populates="assignment", cascade="all, delete-orphan", uselist=False
    )


class EditorReviewRecord(Base):
    __tablename__ = "editor_reviews"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    assignment_id: Mapped[str] = mapped_column(
        ForeignKey("review_assignments.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )
    decision: Mapped[str] = mapped_column(String(32), nullable=False)
    scores: Mapped[dict[str, int]] = mapped_column(JSON, nullable=False)
    boundary_usable: Mapped[bool] = mapped_column(Boolean, nullable=False)
    spoiler_safe: Mapped[bool] = mapped_column(Boolean, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)
    submitted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    assignment: Mapped[ReviewAssignmentRecord] = relationship(back_populates="review")


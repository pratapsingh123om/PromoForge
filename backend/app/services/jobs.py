from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import AnalysisJobRecord, EpisodeCheckpointRecord, EpisodeRecord
from app.repositories import RepositoryError, get_project


JOB_TRANSITIONS: dict[str, set[str]] = {
    "queued": {"running", "cancelled"},
    "running": {"completed", "failed", "cancelling"},
    "cancelling": {"cancelled", "failed"},
    "failed": {"queued"},
    "cancelled": {"queued"},
    "completed": set(),
}


class JobStateError(RuntimeError):
    pass


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def get_job(session: Session, job_id: str) -> AnalysisJobRecord:
    job = session.get(AnalysisJobRecord, job_id)
    if job is None:
        raise RepositoryError(f"job not found: {job_id}")
    return job


def create_analysis_job(
    session: Session,
    *,
    project_id: str,
    idempotency_key: str,
) -> tuple[AnalysisJobRecord, bool]:
    get_project(session, project_id)
    existing = session.scalar(
        select(AnalysisJobRecord).where(
            AnalysisJobRecord.project_id == project_id,
            AnalysisJobRecord.idempotency_key == idempotency_key,
        )
    )
    if existing is not None:
        return existing, False

    episodes = session.scalars(
        select(EpisodeRecord)
        .where(EpisodeRecord.project_id == project_id)
        .order_by(EpisodeRecord.episode_number)
    ).all()
    if not episodes:
        raise RepositoryError("project has no episodes to analyze")

    job = AnalysisJobRecord(
        project_id=project_id,
        idempotency_key=idempotency_key,
        status="queued",
        stage="pending",
        episodes_total=len(episodes),
        resumable=True,
    )
    session.add(job)
    session.flush()
    session.add_all(
        [
            EpisodeCheckpointRecord(
                job_id=job.id,
                episode_id=episode.id,
                status="pending",
                stage="pending",
            )
            for episode in episodes
        ]
    )
    session.commit()
    session.refresh(job)
    return job, True


def transition_job(
    session: Session,
    job: AnalysisJobRecord,
    next_status: str,
    *,
    stage: str | None = None,
    error_message: str | None = None,
) -> AnalysisJobRecord:
    allowed = JOB_TRANSITIONS.get(job.status)
    if allowed is None or next_status not in allowed:
        raise JobStateError(f"illegal job transition: {job.status} -> {next_status}")

    job.status = next_status
    if stage is not None:
        job.stage = stage
    if next_status == "running" and job.started_at is None:
        job.started_at = now_utc()
    if next_status in {"completed", "failed", "cancelled"}:
        job.completed_at = now_utc()
    job.error_message = error_message
    session.commit()
    session.refresh(job)
    return job


def refresh_job_progress(session: Session, job: AnalysisJobRecord) -> AnalysisJobRecord:
    status_counts = dict(
        session.execute(
            select(EpisodeCheckpointRecord.status, func.count(EpisodeCheckpointRecord.id))
            .where(EpisodeCheckpointRecord.job_id == job.id)
            .group_by(EpisodeCheckpointRecord.status)
        ).all()
    )
    job.episodes_completed = int(status_counts.get("completed", 0))
    job.episodes_failed = int(status_counts.get("failed", 0))
    processed = job.episodes_completed + job.episodes_failed
    job.progress_percent = (
        round(processed * 100 / job.episodes_total) if job.episodes_total else 0
    )

    active = int(status_counts.get("pending", 0)) + int(status_counts.get("running", 0))
    if active == 0 and job.status in {"running", "cancelling"}:
        if job.status == "cancelling":
            job.status = "cancelled"
        elif job.episodes_failed:
            job.status = "failed"
            job.error_message = f"{job.episodes_failed} episode checkpoint(s) failed"
        else:
            job.status = "completed"
            job.stage = "complete"
        job.completed_at = now_utc()

    session.commit()
    session.refresh(job)
    return job


def _get_checkpoint(
    session: Session,
    *,
    job_id: str,
    episode_key: str,
) -> EpisodeCheckpointRecord:
    checkpoint = session.scalar(
        select(EpisodeCheckpointRecord)
        .join(EpisodeRecord, EpisodeRecord.id == EpisodeCheckpointRecord.episode_id)
        .where(
            EpisodeCheckpointRecord.job_id == job_id,
            EpisodeRecord.episode_key == episode_key,
        )
    )
    if checkpoint is None:
        raise RepositoryError(f"checkpoint not found: {job_id}/{episode_key}")
    return checkpoint


def start_checkpoint(
    session: Session,
    *,
    job_id: str,
    episode_key: str,
    stage: str,
) -> EpisodeCheckpointRecord:
    checkpoint = _get_checkpoint(session, job_id=job_id, episode_key=episode_key)
    if checkpoint.status not in {"pending", "failed"}:
        raise JobStateError(
            f"cannot start checkpoint in status {checkpoint.status}: {episode_key}"
        )
    checkpoint.status = "running"
    checkpoint.stage = stage
    checkpoint.attempts += 1
    checkpoint.started_at = now_utc()
    checkpoint.completed_at = None
    checkpoint.error_message = None
    session.commit()
    session.refresh(checkpoint)
    return checkpoint


def complete_checkpoint(
    session: Session,
    *,
    job_id: str,
    episode_key: str,
) -> AnalysisJobRecord:
    job = get_job(session, job_id)
    checkpoint = _get_checkpoint(session, job_id=job_id, episode_key=episode_key)
    if checkpoint.status != "running":
        raise JobStateError(f"cannot complete checkpoint in status {checkpoint.status}")
    checkpoint.status = "completed"
    checkpoint.stage = "complete"
    checkpoint.completed_at = now_utc()
    session.flush()
    return refresh_job_progress(session, job)


def fail_checkpoint(
    session: Session,
    *,
    job_id: str,
    episode_key: str,
    error_message: str,
) -> AnalysisJobRecord:
    job = get_job(session, job_id)
    checkpoint = _get_checkpoint(session, job_id=job_id, episode_key=episode_key)
    if checkpoint.status != "running":
        raise JobStateError(f"cannot fail checkpoint in status {checkpoint.status}")
    checkpoint.status = "failed"
    checkpoint.error_message = error_message
    checkpoint.completed_at = now_utc()
    session.flush()
    return refresh_job_progress(session, job)


def request_cancellation(session: Session, job: AnalysisJobRecord) -> AnalysisJobRecord:
    job.cancel_requested = True
    if job.status == "queued":
        job.status = "cancelled"
        job.completed_at = now_utc()
    elif job.status == "running":
        job.status = "cancelling"
    elif job.status not in {"cancelling", "cancelled"}:
        raise JobStateError(f"cannot cancel job in status {job.status}")
    session.commit()
    session.refresh(job)
    return job


def retry_job(session: Session, job: AnalysisJobRecord) -> AnalysisJobRecord:
    if job.status not in {"failed", "cancelled"}:
        raise JobStateError(f"cannot retry job in status {job.status}")

    checkpoints = session.scalars(
        select(EpisodeCheckpointRecord).where(EpisodeCheckpointRecord.job_id == job.id)
    ).all()
    for checkpoint in checkpoints:
        if checkpoint.status != "completed":
            checkpoint.status = "pending"
            checkpoint.stage = "pending"
            checkpoint.error_message = None
            checkpoint.started_at = None
            checkpoint.completed_at = None

    job.status = "queued"
    job.stage = "pending"
    job.cancel_requested = False
    job.error_message = None
    job.completed_at = None
    session.flush()
    return refresh_job_progress(session, job)


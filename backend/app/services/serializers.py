from __future__ import annotations

from app.models import AnalysisJobRecord
from app.schemas.persistence import AnalysisJobResponse


def serialize_job(job: AnalysisJobRecord) -> AnalysisJobResponse:
    pending = max(0, job.episodes_total - job.episodes_completed - job.episodes_failed)
    return AnalysisJobResponse(
        id=job.id,
        project_id=job.project_id,
        idempotency_key=job.idempotency_key,
        status=job.status,
        stage=job.stage,
        episodes_total=job.episodes_total,
        episodes_completed=job.episodes_completed,
        episodes_failed=job.episodes_failed,
        episodes_pending=pending,
        progress_percent=job.progress_percent,
        resumable=job.resumable,
        cancel_requested=job.cancel_requested,
        error_message=job.error_message,
        created_at=job.created_at,
        updated_at=job.updated_at,
    )


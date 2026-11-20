from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_session
from app.models import EpisodeRecord, ModelRunRecord, NarrativeEventRecord
from app.repositories import RepositoryError
from app.schemas.narrative import EpisodeNarrativeResponse, NarrativeEventResponse
from app.schemas.persistence import AnalysisJobMutationResponse, AnalysisJobResponse
from app.services.jobs import JobStateError, get_job, request_cancellation, retry_job
from app.services.serializers import serialize_job


router = APIRouter(prefix="/jobs", tags=["jobs"])


@router.get("/{job_id}", response_model=AnalysisJobResponse)
def read_job(job_id: str, session: Session = Depends(get_session)) -> AnalysisJobResponse:
    try:
        return serialize_job(get_job(session, job_id))
    except RepositoryError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get(
    "/{job_id}/episodes/{episode_key}/narrative",
    response_model=EpisodeNarrativeResponse,
)
def read_episode_narrative(
    job_id: str,
    episode_key: str,
    session: Session = Depends(get_session),
) -> EpisodeNarrativeResponse:
    try:
        job = get_job(session, job_id)
    except RepositoryError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    episode = session.scalar(
        select(EpisodeRecord).where(
            EpisodeRecord.project_id == job.project_id,
            EpisodeRecord.episode_key == episode_key,
        )
    )
    if episode is None:
        raise HTTPException(status_code=404, detail=f"episode not found: {episode_key}")
    model_run = session.scalar(
        select(ModelRunRecord)
        .where(
            ModelRunRecord.job_id == job.id,
            ModelRunRecord.episode_id == episode.id,
            ModelRunRecord.status == "completed",
        )
        .order_by(ModelRunRecord.completed_at.desc())
    )
    if model_run is None:
        raise HTTPException(status_code=404, detail="completed narrative analysis not found")

    rows = session.scalars(
        select(NarrativeEventRecord)
        .where(NarrativeEventRecord.model_run_id == model_run.id)
        .order_by(NarrativeEventRecord.source_event_key)
    ).all()
    return EpisodeNarrativeResponse(
        episode_id=episode.episode_key,
        model_run_id=model_run.id,
        provider=model_run.provider,
        model=model_run.model,
        prompt_version=model_run.prompt_version,
        fallback_used=model_run.fallback_used,
        analyses=[
            NarrativeEventResponse(
                event_id=row.source_event_key,
                narrative_type=row.narrative_type,
                characters=row.characters,
                conflict=row.conflict,
                emotional_appeal=row.emotional_appeal,
                hook_strength=row.hook_strength,
                tension=row.tension,
                context_dependency=row.context_dependency,
                open_question=row.open_question,
                resolves_question=row.resolves_question,
                evidence_event_ids=row.evidence_event_ids,
                confidence=row.confidence,
            )
            for row in rows
        ],
    )


@router.post("/{job_id}/retry", response_model=AnalysisJobMutationResponse)
def retry_analysis_job(
    job_id: str,
    session: Session = Depends(get_session),
) -> AnalysisJobMutationResponse:
    try:
        job = retry_job(session, get_job(session, job_id))
        from app.services.orchestration import dispatch_analysis_job
        dispatch_analysis_job(job.id)
    except RepositoryError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except JobStateError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return AnalysisJobMutationResponse(job=serialize_job(job))


@router.post("/{job_id}/cancel", response_model=AnalysisJobMutationResponse)
def cancel_analysis_job(
    job_id: str,
    session: Session = Depends(get_session),
) -> AnalysisJobMutationResponse:
    try:
        job = request_cancellation(session, get_job(session, job_id))
    except RepositoryError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except JobStateError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return AnalysisJobMutationResponse(job=serialize_job(job))


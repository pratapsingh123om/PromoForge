import hashlib
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_session
from app.models import EpisodeRecord, PromoCandidateRecord, ScreenplayEventRecord
from app.repositories import RepositoryError
from app.schemas.evaluation import PromoEvaluationRequest
from app.schemas.promos import (
    PromoCandidateResponse,
    PromoGenerationResponse,
    PromoRecommendationResponse,
)
from app.services.promos import (
    PromoGenerationError,
    _serialize_candidate,
    build_promo_evaluation_template,
    generate_episode_promos,
    read_episode_recommendation,
    read_episode_promos,
)


class PromoCandidateUpdateRequest(BaseModel):
    status: Literal["approved", "rejected", "selected", "review"] | None = None
    start_ms: int | None = None
    end_ms: int | None = None


class PromoExportResponse(BaseModel):
    format: str
    filename: str
    content: str
    sha256: str
    candidate_count: int


router = APIRouter(prefix="/jobs", tags=["promos"])


@router.post(
    "/{job_id}/episodes/{episode_key}/promos/generate",
    response_model=PromoGenerationResponse,
)
def generate_promos(
    job_id: str,
    episode_key: str,
    session: Session = Depends(get_session),
) -> PromoGenerationResponse:
    try:
        return generate_episode_promos(
            session,
            job_id=job_id,
            episode_key=episode_key,
        )
    except RepositoryError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except PromoGenerationError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.get(
    "/{job_id}/episodes/{episode_key}/promos",
    response_model=PromoGenerationResponse,
)
def read_promos(
    job_id: str,
    episode_key: str,
    session: Session = Depends(get_session),
) -> PromoGenerationResponse:
    try:
        return read_episode_promos(
            session,
            job_id=job_id,
            episode_key=episode_key,
        )
    except RepositoryError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get(
    "/{job_id}/episodes/{episode_key}/promos/recommendation",
    response_model=PromoRecommendationResponse,
)
def read_promo_recommendation(
    job_id: str,
    episode_key: str,
    session: Session = Depends(get_session),
) -> PromoRecommendationResponse:
    try:
        return read_episode_recommendation(
            session,
            job_id=job_id,
            episode_key=episode_key,
        )
    except RepositoryError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except PromoGenerationError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.get(
    "/{job_id}/episodes/{episode_key}/promos/evaluation-template",
    response_model=PromoEvaluationRequest,
)
def read_promo_evaluation_template(
    job_id: str,
    episode_key: str,
    session: Session = Depends(get_session),
) -> PromoEvaluationRequest:
    try:
        return build_promo_evaluation_template(
            session,
            job_id=job_id,
            episode_key=episode_key,
        )
    except RepositoryError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except PromoGenerationError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


def _handle_candidate_update(
    candidate_id: str,
    payload: PromoCandidateUpdateRequest,
    session: Session,
    job_id: str | None = None,
    episode_key: str | None = None,
) -> PromoCandidateResponse:
    query = select(PromoCandidateRecord).where(
        (PromoCandidateRecord.id == candidate_id) | (PromoCandidateRecord.candidate_key == candidate_id)
    )
    if job_id and job_id not in {"undefined", "null", ""}:
        query = query.where(PromoCandidateRecord.job_id == job_id)
    candidate = session.scalar(query)
    if candidate is None:
        candidate = session.scalar(
            select(PromoCandidateRecord).where(
                (PromoCandidateRecord.id == candidate_id) | (PromoCandidateRecord.candidate_key == candidate_id)
            )
        )
    if candidate is None:
        raise HTTPException(status_code=404, detail=f"candidate not found: {candidate_id}")

    episode = candidate.episode or session.get(EpisodeRecord, candidate.episode_id)
    resolved_episode_key = episode.episode_key if episode else (episode_key or "EP_UNKNOWN")

    if payload.status is not None:
        candidate.status = payload.status
    if payload.start_ms is not None:
        if payload.start_ms < 0 or payload.start_ms >= candidate.end_ms:
            raise HTTPException(status_code=422, detail="invalid start_ms")
        candidate.start_ms = payload.start_ms
        candidate.duration_ms = candidate.end_ms - candidate.start_ms
    if payload.end_ms is not None:
        max_duration = episode.duration_ms if episode and episode.duration_ms else candidate.end_ms + 60000
        if payload.end_ms <= candidate.start_ms or payload.end_ms > max_duration:
            raise HTTPException(status_code=422, detail="invalid end_ms")
        candidate.end_ms = payload.end_ms
        candidate.duration_ms = candidate.end_ms - candidate.start_ms

    session.commit()
    session.refresh(candidate)
    return _serialize_candidate(candidate, episode_key=resolved_episode_key)


@router.patch(
    "/{job_id}/episodes/{episode_key}/promos/{candidate_id}",
    response_model=PromoCandidateResponse,
)
@router.post(
    "/{job_id}/episodes/{episode_key}/promos/{candidate_id}",
    response_model=PromoCandidateResponse,
)
def update_candidate(
    job_id: str,
    episode_key: str,
    candidate_id: str,
    payload: PromoCandidateUpdateRequest,
    session: Session = Depends(get_session),
) -> PromoCandidateResponse:
    return _handle_candidate_update(
        candidate_id=candidate_id,
        payload=payload,
        session=session,
        job_id=job_id,
        episode_key=episode_key,
    )


@router.patch(
    "/promos/{candidate_id}",
    response_model=PromoCandidateResponse,
)
@router.post(
    "/promos/{candidate_id}",
    response_model=PromoCandidateResponse,
)
@router.patch(
    "/episodes/{episode_key}/promos/{candidate_id}",
    response_model=PromoCandidateResponse,
)
@router.post(
    "/episodes/{episode_key}/promos/{candidate_id}",
    response_model=PromoCandidateResponse,
)
def update_candidate_direct(
    candidate_id: str,
    payload: PromoCandidateUpdateRequest,
    episode_key: str | None = None,
    session: Session = Depends(get_session),
) -> PromoCandidateResponse:
    return _handle_candidate_update(
        candidate_id=candidate_id,
        payload=payload,
        session=session,
        episode_key=episode_key,
    )


@router.get(
    "/{job_id}/episodes/{episode_key}/export",
    response_model=PromoExportResponse,
)
def export_promos(
    job_id: str,
    episode_key: str,
    format: Literal["json", "csv", "txt", "otio"] = Query(default="json"),
    session: Session = Depends(get_session),
) -> PromoExportResponse:
    episode = session.scalar(
        select(EpisodeRecord).where(
            (EpisodeRecord.episode_key == episode_key) | (EpisodeRecord.id == episode_key)
        )
    )
    if episode is None:
        raise HTTPException(status_code=404, detail=f"episode not found: {episode_key}")

    candidates = session.scalars(
        select(PromoCandidateRecord)
        .where(
            PromoCandidateRecord.job_id == job_id,
            PromoCandidateRecord.episode_id == episode.id,
            PromoCandidateRecord.status.in_(["selected", "approved"]),
        )
        .order_by(PromoCandidateRecord.rank.asc().nulls_last())
    ).all()

    import json as json_lib

    if format == "json":
        data = {
            "version": "1.0.0",
            "episode_id": episode.episode_key,
            "project_id": episode.project_id,
            "duration_ms": episode.duration_ms,
            "candidate_count": len(candidates),
            "candidates": [
                {
                    "candidate_key": c.candidate_key,
                    "rank": c.rank,
                    "status": c.status,
                    "start_ms": c.start_ms,
                    "end_ms": c.end_ms,
                    "duration_ms": c.duration_ms,
                    "score": c.score,
                    "hook_event_id": c.hook_event_key,
                    "evidence_event_ids": c.evidence_event_ids,
                    "score_components": c.score_components,
                }
                for c in candidates
            ],
        }
        content = json_lib.dumps(data, indent=2)
        filename = f"{episode_key}_cut_sheet.json"
    elif format == "csv":
        headers = "candidate_key,rank,status,start_ms,end_ms,duration_ms,score\n"
        lines = [headers]
        for c in candidates:
            lines.append(f'"{c.candidate_key}",{c.rank or 0},"{c.status}",{c.start_ms},{c.end_ms},{c.duration_ms},{c.score}\n')
        content = "".join(lines)
        filename = f"{episode_key}_cut_sheet.csv"
    elif format == "txt":
        lines = [
            f"PROMOFORGE PRODUCTION CUT SHEET\nEpisode: {episode_key}\nTotal Candidates: {len(candidates)}\n"
            + "=" * 40 + "\n\n"
        ]
        for c in candidates:
            start_s = c.start_ms / 1000.0
            end_s = c.end_ms / 1000.0
            dur_s = c.duration_ms / 1000.0
            lines.append(
                f"Candidate: {c.candidate_key} (Rank #{c.rank or 'N/A'})\n"
                f"Status: {c.status.upper()}\n"
                f"Timecode: {int(start_s // 60):02d}:{start_s % 60:04.1f} -> {int(end_s // 60):02d}:{end_s % 60:04.1f} (Duration: {dur_s:.1f}s)\n"
                f"Score: {c.score:.1f} / 100\n"
                f"Hook Event: {c.hook_event_key}\n"
                + "-" * 40 + "\n"
            )
        content = "".join(lines)
        filename = f"{episode_key}_cut_sheet.txt"
    else:  # otio
        otio_doc = {
            "OTIO_SCHEMA": "Timeline.1",
            "name": f"{episode_key}_promo_timeline",
            "tracks": {
                "OTIO_SCHEMA": "Stack.1",
                "children": [
                    {
                        "OTIO_SCHEMA": "Track.1",
                        "name": "Promo Cuts",
                        "kind": "Video",
                        "children": [
                            {
                                "OTIO_SCHEMA": "Clip.1",
                                "name": c.candidate_key,
                                "source_range": {
                                    "OTIO_SCHEMA": "TimeRange.1",
                                    "start_time": {"OTIO_SCHEMA": "RationalTime.1", "value": c.start_ms, "rate": 1000},
                                    "duration": {"OTIO_SCHEMA": "RationalTime.1", "value": c.duration_ms, "rate": 1000},
                                },
                            }
                            for c in candidates
                        ],
                    }
                ],
            },
        }
        content = json_lib.dumps(otio_doc, indent=2)
        filename = f"{episode_key}_promos.otio"

    sha = hashlib.sha256(content.encode("utf-8")).hexdigest()
    return PromoExportResponse(
        format=format,
        filename=filename,
        content=content,
        sha256=sha,
        candidate_count=len(candidates),
    )

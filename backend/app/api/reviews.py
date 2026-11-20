from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_session
from app.models import EvaluationSessionRecord
from app.repositories import RepositoryError
from app.schemas.reviews import (
    CreateEvaluationSessionRequest,
    CreateEvaluationSessionResponse,
    EvaluationReadyItem,
    EvaluationSessionReport,
    EvaluationSessionSummary,
    ReviewAssignmentListResponse,
    ReviewSubmission,
    ReviewSubmissionResponse,
    TiebreakerRequest,
    TiebreakerResponse,
)
from app.services.promos import PromoGenerationError
from app.services.reviews import (
    ReviewWorkflowError,
    assign_tiebreaker,
    create_evaluation_session,
    finalize_evaluation_session,
    list_evaluation_ready_items,
    list_review_assignments,
    read_evaluation_report,
    read_evaluation_session,
    submit_review,
)


router = APIRouter(tags=["editorial reviews"])


@router.get("/evaluation/ready", response_model=list[EvaluationReadyItem])
def read_evaluation_ready_items(
    session: Session = Depends(get_session),
) -> list[EvaluationReadyItem]:
    return list_evaluation_ready_items(session)


@router.post(
    "/jobs/{job_id}/episodes/{episode_key}/evaluation/sessions",
    response_model=CreateEvaluationSessionResponse,
)
def create_session(
    job_id: str,
    episode_key: str,
    payload: CreateEvaluationSessionRequest,
    session: Session = Depends(get_session),
) -> CreateEvaluationSessionResponse:
    try:
        return create_evaluation_session(
            session,
            job_id=job_id,
            episode_key=episode_key,
            request=payload,
        )
    except RepositoryError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except (PromoGenerationError, ReviewWorkflowError) as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.get(
    "/evaluation/sessions",
    response_model=list[EvaluationSessionSummary],
)
def list_evaluation_sessions(
    limit: int = Query(default=20, ge=1, le=50),
    session: Session = Depends(get_session),
) -> list[EvaluationSessionSummary]:
    rows = session.scalars(
        select(EvaluationSessionRecord)
        .order_by(EvaluationSessionRecord.created_at.desc())
        .limit(limit)
    ).all()
    return [read_evaluation_session(session, s.id) for s in rows]


@router.get(
    "/evaluation/sessions/{session_id}",
    response_model=EvaluationSessionSummary,
)
def read_session(
    session_id: str,
    session: Session = Depends(get_session),
) -> EvaluationSessionSummary:
    try:
        return read_evaluation_session(session, session_id)
    except RepositoryError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get(
    "/evaluation/sessions/{session_id}/assignments",
    response_model=ReviewAssignmentListResponse,
)
def read_assignments(
    session_id: str,
    reviewer_id: str | None = Query(default=None),
    session: Session = Depends(get_session),
) -> ReviewAssignmentListResponse:
    try:
        return list_review_assignments(
            session,
            session_id=session_id,
            reviewer_id=reviewer_id,
        )
    except RepositoryError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post(
    "/evaluation/assignments/{assignment_id}/review",
    response_model=ReviewSubmissionResponse,
)
def create_review(
    assignment_id: str,
    payload: ReviewSubmission,
    session: Session = Depends(get_session),
) -> ReviewSubmissionResponse:
    try:
        return submit_review(
            session,
            assignment_id=assignment_id,
            submission=payload,
        )
    except RepositoryError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ReviewWorkflowError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.post(
    "/evaluation/sessions/{session_id}/tiebreaker",
    response_model=TiebreakerResponse,
)
def create_tiebreaker_assignments(
    session_id: str,
    payload: TiebreakerRequest,
    session: Session = Depends(get_session),
) -> TiebreakerResponse:
    try:
        return assign_tiebreaker(
            session,
            session_id=session_id,
            reviewer_id=payload.reviewer_id,
        )
    except RepositoryError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ReviewWorkflowError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.get(
    "/evaluation/sessions/{session_id}/report",
    response_model=EvaluationSessionReport,
)
def read_report(
    session_id: str,
    session: Session = Depends(get_session),
) -> EvaluationSessionReport:
    try:
        return read_evaluation_report(session, session_id)
    except RepositoryError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ReviewWorkflowError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.post(
    "/evaluation/sessions/{session_id}/finalize",
    response_model=EvaluationSessionReport,
)
def finalize_session(
    session_id: str,
    session: Session = Depends(get_session),
) -> EvaluationSessionReport:
    try:
        return finalize_evaluation_session(session, session_id)
    except RepositoryError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ReviewWorkflowError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc

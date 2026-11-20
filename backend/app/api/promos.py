from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_session
from app.repositories import RepositoryError
from app.schemas.evaluation import PromoEvaluationRequest
from app.schemas.promos import PromoGenerationResponse, PromoRecommendationResponse
from app.services.promos import (
    PromoGenerationError,
    build_promo_evaluation_template,
    generate_episode_promos,
    read_episode_recommendation,
    read_episode_promos,
)


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

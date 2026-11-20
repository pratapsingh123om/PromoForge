from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from app.schemas.evaluation import (
    PromoEvaluationReport,
    PromoEvaluationRequest,
    RubricDefinition,
)
from app.services.evaluation import EvaluationInputError, evaluate_promos, get_rubric


router = APIRouter(prefix="/evaluation", tags=["evaluation"])


@router.get("/rubric", response_model=RubricDefinition)
def read_evaluation_rubric() -> RubricDefinition:
    return get_rubric()


@router.post("/promos", response_model=PromoEvaluationReport)
def evaluate_promo_candidates(payload: PromoEvaluationRequest) -> PromoEvaluationReport:
    try:
        return evaluate_promos(payload)
    except EvaluationInputError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={"code": "invalid_evaluation_dataset", "message": str(exc)},
        ) from exc

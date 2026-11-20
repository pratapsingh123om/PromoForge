from __future__ import annotations

import pytest

from app.schemas.evaluation import (
    EditorReview,
    EvaluationPolicy,
    PromoCandidate,
    PromoEvaluationRequest,
    PromoSegment,
    RubricScores,
    SourceEpisodeReference,
)
from app.services.evaluation import EvaluationInputError, evaluate_promos, temporal_iou


def _scores(value: int) -> RubricScores:
    return RubricScores(
        hook=value,
        curiosity=value,
        clarity=value,
        emotion=value,
        coherence=value,
        spoiler_safety=value,
        editability=value,
        brand_fit=value,
    )


def _review(
    candidate_id: str,
    reviewer_id: str,
    decision: str,
    *,
    boundary_usable: bool = True,
    spoiler_safe: bool = True,
) -> EditorReview:
    return EditorReview(
        candidate_id=candidate_id,
        reviewer_id=reviewer_id,
        decision=decision,
        scores=_scores(4 if decision != "reject" else 2),
        boundary_usable=boundary_usable,
        spoiler_safe=spoiler_safe,
    )


def _payload() -> PromoEvaluationRequest:
    return PromoEvaluationRequest(
        source_episodes=[
            SourceEpisodeReference(
                episode_id="EP_TEST",
                episode_number=1,
                duration_ms=120_000,
                event_ids=["E1", "E2", "E3"],
                spoiler_event_ids=["E3"],
            )
        ],
        candidates=[
            PromoCandidate(
                candidate_id="P1",
                rank=1,
                segments=[
                    PromoSegment(
                        episode_id="EP_TEST",
                        start_ms=0,
                        end_ms=30_000,
                        evidence_event_ids=["E1"],
                    )
                ],
            ),
            PromoCandidate(
                candidate_id="P2",
                rank=2,
                segments=[
                    PromoSegment(
                        episode_id="EP_TEST",
                        start_ms=5_000,
                        end_ms=35_000,
                        evidence_event_ids=["E2"],
                    )
                ],
            ),
            PromoCandidate(
                candidate_id="P3",
                rank=3,
                segments=[
                    PromoSegment(
                        episode_id="EP_TEST",
                        start_ms=90_000,
                        end_ms=120_000,
                        evidence_event_ids=["E3"],
                    )
                ],
            ),
        ],
        reviews=[
            _review("P1", "R1", "approve"),
            _review("P1", "R2", "approve"),
            _review("P2", "R1", "approve"),
            _review("P2", "R2", "approve_with_changes"),
            _review("P3", "R1", "reject", boundary_usable=False, spoiler_safe=False),
            _review("P3", "R2", "reject", boundary_usable=False, spoiler_safe=False),
        ],
        policy=EvaluationPolicy(top_k=3),
    )


def test_temporal_iou_uses_shared_episode_footage() -> None:
    payload = _payload()

    assert temporal_iou(payload.candidates[0], payload.candidates[1]) == pytest.approx(
        25_000 / 35_000
    )
    assert temporal_iou(payload.candidates[0], payload.candidates[2]) == 0


def test_evaluation_combines_automatic_gates_and_editor_consensus() -> None:
    report = evaluate_promos(_payload())

    metrics = report.systems[0].metrics
    assert report.dataset.candidate_count == 3
    assert report.dataset.reviewer_count == 2
    assert metrics.automatic_validity_rate == pytest.approx(2 / 3)
    assert metrics.review_coverage == 1
    assert metrics.precision_at_k_complete is True
    assert metrics.precision_at_k == pytest.approx(2 / 3)
    assert metrics.acceptance_rate == pytest.approx(2 / 3)
    assert metrics.duplicate_candidate_rate == pytest.approx(1 / 3)
    assert metrics.duplicate_pair_count == 1
    assert metrics.spoiler_violation_rate == pytest.approx(1 / 3)
    assert metrics.inter_reviewer_agreement == pytest.approx(2 / 3)

    results = {candidate.candidate_id: candidate for candidate in report.candidates}
    assert results["P1"].usable is True
    assert results["P2"].duplicate_of == ["P1"]
    assert results["P2"].consensus_decision == "split"
    assert results["P2"].usable is True
    assert results["P3"].issues == ["spoiler_evidence"]
    assert results["P3"].usable is False


def test_precision_is_not_reported_until_top_k_has_enough_reviews() -> None:
    payload = _payload()
    payload.reviews = [review for review in payload.reviews if review.candidate_id != "P2"]

    report = evaluate_promos(payload)
    metrics = report.systems[0].metrics

    assert metrics.review_coverage == pytest.approx(2 / 3)
    assert metrics.precision_at_k_complete is False
    assert metrics.precision_at_k is None


def test_duplicate_system_rank_is_rejected() -> None:
    payload = _payload()
    payload.candidates[1].rank = 1

    with pytest.raises(EvaluationInputError, match="duplicate rank"):
        evaluate_promos(payload)


def test_invalid_evidence_and_chronology_are_rejected_automatically() -> None:
    payload = _payload()
    payload.candidates = [
        PromoCandidate(
            candidate_id="BAD",
            rank=1,
            segments=[
                PromoSegment(
                    episode_id="EP_TEST",
                    start_ms=40_000,
                    end_ms=55_000,
                    evidence_event_ids=["UNKNOWN"],
                ),
                PromoSegment(
                    episode_id="EP_TEST",
                    start_ms=20_000,
                    end_ms=35_000,
                    evidence_event_ids=["E1"],
                ),
            ],
        )
    ]
    payload.reviews = []

    result = evaluate_promos(payload).candidates[0]

    assert result.automatically_valid is False
    assert result.issues == ["non_chronological_segments", "unknown_evidence_event"]

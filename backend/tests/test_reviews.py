from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

import pytest
from sqlalchemy.orm import Session, sessionmaker

from app.database import Base, create_database_engine
from app.schemas.evaluation import RubricScores
from app.schemas.reviews import CreateEvaluationSessionRequest, ReviewSubmission
from app.services.promos import generate_episode_promos
from app.services.reviews import (
    ReviewWorkflowError,
    assign_tiebreaker,
    create_evaluation_session,
    finalize_evaluation_session,
    list_review_assignments,
    list_evaluation_ready_items,
    read_evaluation_report,
    submit_review,
)
from test_promos import _persist_source_graph


@pytest.fixture
def review_session(tmp_path: Path) -> Iterator[Session]:
    engine = create_database_engine(f"sqlite:///{(tmp_path / 'reviews.db').as_posix()}")
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    with factory() as session:
        yield session
    Base.metadata.drop_all(engine)
    engine.dispose()


def _scores(value: int = 4) -> RubricScores:
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


def _submission(
    reviewer_id: str,
    *,
    positive: bool = True,
) -> ReviewSubmission:
    return ReviewSubmission(
        reviewer_id=reviewer_id,
        decision="approve" if positive else "reject",
        scores=_scores(4 if positive else 2),
        boundary_usable=positive,
        spoiler_safe=positive,
        notes="Synthetic editorial review.",
    )


def _create_workflow(
    session: Session,
    *,
    session_key: str = "review-test",
) -> tuple[str, str]:
    job_id, _, _ = _persist_source_graph(session)
    generate_episode_promos(session, job_id=job_id, episode_key="EP_TEST")
    created = create_evaluation_session(
        session,
        job_id=job_id,
        episode_key="EP_TEST",
        request=CreateEvaluationSessionRequest(
            session_key=session_key,
            reviewer_ids=["EDITOR_A", "EDITOR_B"],
        ),
    )
    return job_id, created.session.id


def test_session_creation_is_blinded_persisted_and_idempotent(
    review_session: Session,
) -> None:
    job_id, session_id = _create_workflow(review_session)
    assignments = list_review_assignments(
        review_session,
        session_id=session_id,
        reviewer_id="EDITOR_A",
    )
    duplicate = create_evaluation_session(
        review_session,
        job_id=job_id,
        episode_key="EP_TEST",
        request=CreateEvaluationSessionRequest(
            session_key="review-test",
            reviewer_ids=["EDITOR_A", "EDITOR_B"],
        ),
    )

    assert assignments.assignments
    assert len(assignments.assignments) == assignments.session.candidate_count
    assert all(item.blind_label.startswith("CANDIDATE-") for item in assignments.assignments)
    assert all(item.evidence for item in assignments.assignments)
    public_fields = assignments.assignments[0].model_dump()
    assert "rank" not in public_fields
    assert "score" not in public_fields
    assert "system_id" not in public_fields
    assert duplicate.created is False
    assert duplicate.session.id == session_id
    ready = list_evaluation_ready_items(review_session)
    assert len(ready) == 1
    assert ready[0].job_id == job_id
    assert ready[0].candidate_count == assignments.session.candidate_count


def test_completed_reviews_finalize_a_report(review_session: Session) -> None:
    _, session_id = _create_workflow(review_session)
    assignments = list_review_assignments(review_session, session_id=session_id).assignments

    for assignment in assignments:
        submit_review(
            review_session,
            assignment_id=assignment.id,
            submission=_submission(assignment.reviewer_id),
        )

    report_before_finalize = read_evaluation_report(review_session, session_id)
    finalized = finalize_evaluation_session(review_session, session_id)

    assert report_before_finalize.report.systems[0].metrics.review_coverage == 1
    assert finalized.session.status == "completed"
    assert finalized.report.systems[0].metrics.precision_at_k_complete is True
    assert finalized.report.systems[0].metrics.precision_at_k == 1

    with pytest.raises(ReviewWorkflowError, match="not active"):
        submit_review(
            review_session,
            assignment_id=assignments[0].id,
            submission=_submission(assignments[0].reviewer_id),
        )


def test_split_decisions_require_independent_tiebreaker(review_session: Session) -> None:
    _, session_id = _create_workflow(review_session)
    assignments = list_review_assignments(review_session, session_id=session_id).assignments

    for assignment in assignments:
        submit_review(
            review_session,
            assignment_id=assignment.id,
            submission=_submission(
                assignment.reviewer_id,
                positive=assignment.reviewer_id == "EDITOR_A",
            ),
        )

    with pytest.raises(ReviewWorkflowError, match="tiebreaker"):
        finalize_evaluation_session(review_session, session_id)
    with pytest.raises(ReviewWorkflowError, match="new independent"):
        assign_tiebreaker(
            review_session,
            session_id=session_id,
            reviewer_id="EDITOR_A",
        )

    tiebreaker = assign_tiebreaker(
        review_session,
        session_id=session_id,
        reviewer_id="EDITOR_C",
    )
    third_assignments = list_review_assignments(
        review_session,
        session_id=session_id,
        reviewer_id="EDITOR_C",
    ).assignments

    assert tiebreaker.assignments_created == len(third_assignments)
    assert tiebreaker.assignments_created > 0
    for assignment in third_assignments:
        submit_review(
            review_session,
            assignment_id=assignment.id,
            submission=_submission("EDITOR_C"),
        )

    finalized = finalize_evaluation_session(review_session, session_id)
    assert finalized.session.status == "completed"
    assert all(candidate.usable is True for candidate in finalized.report.candidates)


def test_assignment_enforces_reviewer_ownership(review_session: Session) -> None:
    _, session_id = _create_workflow(review_session)
    assignment = list_review_assignments(
        review_session,
        session_id=session_id,
        reviewer_id="EDITOR_A",
    ).assignments[0]

    with pytest.raises(ReviewWorkflowError, match="does not own"):
        submit_review(
            review_session,
            assignment_id=assignment.id,
            submission=_submission("EDITOR_B"),
        )

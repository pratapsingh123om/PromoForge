from __future__ import annotations

import hashlib

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import (
    EditorReviewRecord,
    EpisodeRecord,
    EvaluationSessionRecord,
    NarrativeEventRecord,
    ProjectRecord,
    PromoCandidateRecord,
    ReviewAssignmentRecord,
    ScreenplayEventRecord,
    utc_now,
)
from app.repositories import RepositoryError
from app.schemas.evaluation import (
    EditorReview,
    EvaluationPolicy,
    PromoCandidate as EvaluationPromoCandidate,
    PromoEvaluationRequest,
    PromoSegment as EvaluationPromoSegment,
    SourceEpisodeReference,
)
from app.schemas.reviews import (
    CreateEvaluationSessionRequest,
    CreateEvaluationSessionResponse,
    EvaluationReadyItem,
    EvaluationSessionReport,
    EvaluationSessionSummary,
    ReviewAssignmentListResponse,
    ReviewAssignmentResponse,
    ReviewEvidenceItem,
    ReviewSubmission,
    ReviewSubmissionResponse,
    TiebreakerResponse,
)
from app.services.evaluation import evaluate_promos
from app.services.jobs import get_job
from app.services.promos import PromoGenerationError, read_episode_promos


class ReviewWorkflowError(RuntimeError):
    pass


def list_evaluation_ready_items(session: Session) -> list[EvaluationReadyItem]:
    rows = session.execute(
        select(
            PromoCandidateRecord.job_id,
            ProjectRecord.id,
            ProjectRecord.name,
            EpisodeRecord.episode_key,
            PromoCandidateRecord.generator_version,
            func.count(PromoCandidateRecord.id),
        )
        .join(EpisodeRecord, EpisodeRecord.id == PromoCandidateRecord.episode_id)
        .join(ProjectRecord, ProjectRecord.id == EpisodeRecord.project_id)
        .where(PromoCandidateRecord.status == "selected")
        .where(PromoCandidateRecord.rank <= 3)
        .group_by(
            PromoCandidateRecord.job_id,
            ProjectRecord.id,
            ProjectRecord.name,
            EpisodeRecord.episode_key,
            PromoCandidateRecord.generator_version,
        )
        .order_by(ProjectRecord.name, EpisodeRecord.episode_key)
    ).all()
    return [
        EvaluationReadyItem(
            job_id=job_id,
            project_id=project_id,
            project_name=project_name,
            episode_id=episode_key,
            generator_version=generator_version,
            candidate_count=int(candidate_count),
        )
        for (
            job_id,
            project_id,
            project_name,
            episode_key,
            generator_version,
            candidate_count,
        ) in rows
    ]


def _get_session_record(session: Session, session_id: str) -> EvaluationSessionRecord:
    record = session.get(EvaluationSessionRecord, session_id)
    if record is None:
        raise RepositoryError(f"evaluation session not found: {session_id}")
    return record


def _session_summary(
    session: Session,
    record: EvaluationSessionRecord,
) -> EvaluationSessionSummary:
    assignment_count = int(
        session.scalar(
            select(func.count(ReviewAssignmentRecord.id)).where(
                ReviewAssignmentRecord.session_id == record.id
            )
        )
        or 0
    )
    completed_count = int(
        session.scalar(
            select(func.count(ReviewAssignmentRecord.id)).where(
                ReviewAssignmentRecord.session_id == record.id,
                ReviewAssignmentRecord.status == "completed",
            )
        )
        or 0
    )
    return EvaluationSessionSummary(
        id=record.id,
        job_id=record.job_id,
        episode_id=record.episode.episode_key,
        session_key=record.session_key,
        status=record.status,
        candidate_count=record.candidate_count,
        assignment_count=assignment_count,
        completed_assignment_count=completed_count,
        min_reviews_per_candidate=record.min_reviews_per_candidate,
        created_at=record.created_at,
        completed_at=record.completed_at,
    )


def create_evaluation_session(
    session: Session,
    *,
    job_id: str,
    episode_key: str,
    request: CreateEvaluationSessionRequest,
) -> CreateEvaluationSessionResponse:
    job = get_job(session, job_id)
    episode = session.scalar(
        select(EpisodeRecord).where(
            EpisodeRecord.project_id == job.project_id,
            EpisodeRecord.episode_key == episode_key,
        )
    )
    if episode is None:
        raise RepositoryError(f"episode not found: {episode_key}")

    existing = session.scalar(
        select(EvaluationSessionRecord).where(
            EvaluationSessionRecord.job_id == job_id,
            EvaluationSessionRecord.episode_id == episode.id,
            EvaluationSessionRecord.session_key == request.session_key,
        )
    )
    if existing is not None:
        return CreateEvaluationSessionResponse(
            session=_session_summary(session, existing),
            created=False,
        )

    generated = read_episode_promos(
        session,
        job_id=job_id,
        episode_key=episode_key,
    )
    selected = [
        candidate
        for candidate in generated.candidates
        if candidate.status == "selected"
        and candidate.rank is not None
        and candidate.rank <= 3
    ]
    if not selected:
        raise PromoGenerationError("selected promo candidates are required")

    record = EvaluationSessionRecord(
        job_id=job_id,
        episode_id=episode.id,
        session_key=request.session_key,
        status="active",
        candidate_count=len(selected),
        min_reviews_per_candidate=2,
    )
    session.add(record)
    session.flush()

    blind_order = sorted(
        selected,
        key=lambda candidate: hashlib.sha256(
            f"{record.id}|blind|{candidate.id}".encode("utf-8")
        ).hexdigest(),
    )
    blind_labels = {
        candidate.id: f"CANDIDATE-{index:02d}"
        for index, candidate in enumerate(blind_order, start=1)
    }
    selected_by_id = {candidate.id: candidate for candidate in selected}
    assignments = []
    for reviewer_id in request.reviewer_ids:
        reviewer_order = sorted(
            selected_by_id,
            key=lambda candidate_id: hashlib.sha256(
                f"{record.id}|{reviewer_id}|{candidate_id}".encode("utf-8")
            ).hexdigest(),
        )
        assignments.extend(
            ReviewAssignmentRecord(
                session_id=record.id,
                promo_candidate_id=candidate_id,
                reviewer_id=reviewer_id,
                blind_label=blind_labels[candidate_id],
                assignment_order=index,
                status="pending",
            )
            for index, candidate_id in enumerate(reviewer_order, start=1)
        )
    session.add_all(assignments)
    session.commit()
    session.refresh(record)
    return CreateEvaluationSessionResponse(
        session=_session_summary(session, record),
        created=True,
    )


def read_evaluation_session(
    session: Session,
    session_id: str,
) -> EvaluationSessionSummary:
    return _session_summary(session, _get_session_record(session, session_id))


def _assignment_response(
    session: Session,
    assignment: ReviewAssignmentRecord,
) -> ReviewAssignmentResponse:
    candidate = assignment.promo_candidate
    source_rows = session.scalars(
        select(ScreenplayEventRecord)
        .where(
            ScreenplayEventRecord.episode_id == candidate.episode_id,
            ScreenplayEventRecord.event_key.in_(candidate.evidence_event_ids),
        )
        .order_by(ScreenplayEventRecord.start_ms, ScreenplayEventRecord.source_line)
    ).all()
    return ReviewAssignmentResponse(
        id=assignment.id,
        session_id=assignment.session_id,
        reviewer_id=assignment.reviewer_id,
        blind_label=assignment.blind_label,
        assignment_order=assignment.assignment_order,
        status=assignment.status,
        episode_id=candidate.episode.episode_key,
        start_ms=candidate.start_ms,
        end_ms=candidate.end_ms,
        duration_ms=candidate.duration_ms,
        evidence=[
            ReviewEvidenceItem(
                event_id=row.event_key,
                start_ms=row.start_ms,
                end_ms=row.end_ms,
                event_type=row.event_type,
                character=row.character,
                text=row.text,
            )
            for row in source_rows
        ],
        completed_at=assignment.completed_at,
    )


def list_review_assignments(
    session: Session,
    *,
    session_id: str,
    reviewer_id: str | None = None,
) -> ReviewAssignmentListResponse:
    record = _get_session_record(session, session_id)
    query = select(ReviewAssignmentRecord).where(
        ReviewAssignmentRecord.session_id == session_id
    )
    if reviewer_id is not None:
        query = query.where(ReviewAssignmentRecord.reviewer_id == reviewer_id)
    assignments = session.scalars(
        query.order_by(
            ReviewAssignmentRecord.reviewer_id,
            ReviewAssignmentRecord.assignment_order,
        )
    ).all()
    return ReviewAssignmentListResponse(
        session=_session_summary(session, record),
        assignments=[_assignment_response(session, assignment) for assignment in assignments],
    )


def submit_review(
    session: Session,
    *,
    assignment_id: str,
    submission: ReviewSubmission,
) -> ReviewSubmissionResponse:
    assignment = session.get(ReviewAssignmentRecord, assignment_id)
    if assignment is None:
        raise RepositoryError(f"review assignment not found: {assignment_id}")
    if assignment.session.status != "active":
        raise ReviewWorkflowError("evaluation session is not active")
    if submission.reviewer_id != assignment.reviewer_id:
        raise ReviewWorkflowError("reviewer does not own this assignment")
    if assignment.status != "pending" or assignment.review is not None:
        raise ReviewWorkflowError("review assignment is already completed")

    review = EditorReviewRecord(
        assignment_id=assignment.id,
        decision=submission.decision.value,
        scores=submission.scores.model_dump(mode="json"),
        boundary_usable=submission.boundary_usable,
        spoiler_safe=submission.spoiler_safe,
        notes=submission.notes,
    )
    assignment.status = "completed"
    assignment.completed_at = utc_now()
    session.add(review)
    session.commit()
    session.refresh(assignment)
    return ReviewSubmissionResponse(
        assignment=_assignment_response(session, assignment)
    )


def _evaluation_payload(
    session: Session,
    record: EvaluationSessionRecord,
) -> PromoEvaluationRequest:
    assignments = session.scalars(
        select(ReviewAssignmentRecord).where(
            ReviewAssignmentRecord.session_id == record.id
        )
    ).all()
    candidate_by_id = {
        assignment.promo_candidate_id: assignment.promo_candidate
        for assignment in assignments
    }
    candidates = sorted(
        candidate_by_id.values(),
        key=lambda candidate: candidate.rank or 10_000,
    )
    if not candidates:
        raise ReviewWorkflowError("evaluation session has no candidates")

    episode = record.episode
    event_ids = list(
        session.scalars(
            select(ScreenplayEventRecord.event_key)
            .where(ScreenplayEventRecord.episode_id == episode.id)
            .order_by(ScreenplayEventRecord.source_line)
        )
    )
    model_run_id = candidates[0].model_run_id
    spoiler_event_ids = list(
        session.scalars(
            select(NarrativeEventRecord.source_event_key).where(
                NarrativeEventRecord.model_run_id == model_run_id,
                NarrativeEventRecord.resolves_question.is_(True),
            )
        )
    )
    reviews = []
    for assignment in assignments:
        if assignment.review is None:
            continue
        review = assignment.review
        reviews.append(
            EditorReview(
                candidate_id=assignment.promo_candidate.candidate_key,
                reviewer_id=assignment.reviewer_id,
                decision=review.decision,
                scores=review.scores,
                boundary_usable=review.boundary_usable,
                spoiler_safe=review.spoiler_safe,
                notes=review.notes,
            )
        )
    return PromoEvaluationRequest(
        source_episodes=[
            SourceEpisodeReference(
                episode_id=episode.episode_key,
                episode_number=episode.episode_number,
                duration_ms=episode.duration_ms,
                event_ids=event_ids,
                spoiler_event_ids=spoiler_event_ids,
            )
        ],
        candidates=[
            EvaluationPromoCandidate(
                candidate_id=candidate.candidate_key,
                system_id="promoforge",
                rank=candidate.rank or index,
                segments=[
                    EvaluationPromoSegment(
                        episode_id=episode.episode_key,
                        start_ms=candidate.start_ms,
                        end_ms=candidate.end_ms,
                        evidence_event_ids=candidate.evidence_event_ids,
                    )
                ],
            )
            for index, candidate in enumerate(candidates, start=1)
        ],
        reviews=reviews,
        policy=EvaluationPolicy(
            top_k=min(10, len(candidates)),
            min_reviews_per_candidate=record.min_reviews_per_candidate,
        ),
    )


def read_evaluation_report(
    session: Session,
    session_id: str,
) -> EvaluationSessionReport:
    record = _get_session_record(session, session_id)
    report = evaluate_promos(_evaluation_payload(session, record))
    return EvaluationSessionReport(
        session=_session_summary(session, record),
        report=report,
    )


def assign_tiebreaker(
    session: Session,
    *,
    session_id: str,
    reviewer_id: str,
) -> TiebreakerResponse:
    record = _get_session_record(session, session_id)
    if record.status != "active":
        raise ReviewWorkflowError("evaluation session is not active")
    pending = session.scalar(
        select(func.count(ReviewAssignmentRecord.id)).where(
            ReviewAssignmentRecord.session_id == session_id,
            ReviewAssignmentRecord.status == "pending",
        )
    )
    if pending:
        raise ReviewWorkflowError("complete all current assignments before resolving splits")
    existing_reviewer = session.scalar(
        select(ReviewAssignmentRecord.id).where(
            ReviewAssignmentRecord.session_id == session_id,
            ReviewAssignmentRecord.reviewer_id == reviewer_id,
        )
    )
    if existing_reviewer is not None:
        raise ReviewWorkflowError("tiebreaker must be a new independent reviewer")

    report = evaluate_promos(_evaluation_payload(session, record))
    unresolved_keys = {
        candidate.candidate_id
        for candidate in report.candidates
        if candidate.usable is None
    }
    if not unresolved_keys:
        raise ReviewWorkflowError("evaluation session has no split decisions")

    existing_assignments = session.scalars(
        select(ReviewAssignmentRecord).where(
            ReviewAssignmentRecord.session_id == session_id
        )
    ).all()
    assignment_by_key = {
        assignment.promo_candidate.candidate_key: assignment
        for assignment in existing_assignments
    }
    created = []
    for order, candidate_key in enumerate(sorted(unresolved_keys), start=1):
        source_assignment = assignment_by_key[candidate_key]
        created.append(
            ReviewAssignmentRecord(
                session_id=session_id,
                promo_candidate_id=source_assignment.promo_candidate_id,
                reviewer_id=reviewer_id,
                blind_label=source_assignment.blind_label,
                assignment_order=order,
                status="pending",
            )
        )
    session.add_all(created)
    session.commit()
    session.refresh(record)
    return TiebreakerResponse(
        session=_session_summary(session, record),
        assignments_created=len(created),
    )


def finalize_evaluation_session(
    session: Session,
    session_id: str,
) -> EvaluationSessionReport:
    record = _get_session_record(session, session_id)
    if record.status == "completed" and record.report_json is not None:
        return EvaluationSessionReport(
            session=_session_summary(session, record),
            report=record.report_json,
        )
    pending = session.scalar(
        select(func.count(ReviewAssignmentRecord.id)).where(
            ReviewAssignmentRecord.session_id == session_id,
            ReviewAssignmentRecord.status == "pending",
        )
    )
    if pending:
        raise ReviewWorkflowError("all review assignments must be completed")
    report = evaluate_promos(_evaluation_payload(session, record))
    if any(candidate.usable is None for candidate in report.candidates):
        raise ReviewWorkflowError("split decisions require an independent tiebreaker")

    record.status = "completed"
    record.completed_at = utc_now()
    record.report_json = report.model_dump(mode="json")
    session.commit()
    session.refresh(record)
    return EvaluationSessionReport(
        session=_session_summary(session, record),
        report=report,
    )

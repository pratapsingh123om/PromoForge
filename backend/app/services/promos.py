from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.engines.promos import GENERATOR_VERSION, discover_promo_candidates
from app.models import (
    EpisodeRecord,
    ModelRunRecord,
    NarrativeEventRecord,
    PromoCandidateRecord,
    ScreenplayEventRecord,
)
from app.repositories import RepositoryError
from app.schemas.evaluation import (
    EvaluationPolicy,
    PromoCandidate as EvaluationPromoCandidate,
    PromoEvaluationRequest,
    PromoSegment as EvaluationPromoSegment,
    SourceEpisodeReference,
)
from app.schemas.promos import (
    PromoCandidateResponse,
    PromoGenerationResponse,
    PromoRecommendationCandidate,
    PromoRecommendationEvidence,
    PromoRecommendationResponse,
    PromoScoreComponents,
    PromoSourceEvent,
)
from app.services.jobs import get_job


class PromoGenerationError(RuntimeError):
    pass


SHORTLIST_SIZE = 3


def _serialize_candidate(
    row: PromoCandidateRecord,
    *,
    episode_key: str,
) -> PromoCandidateResponse:
    return PromoCandidateResponse(
        id=row.id,
        candidate_key=row.candidate_key,
        episode_id=episode_key,
        generator_version=row.generator_version,
        rank=row.rank,
        status=row.status,
        start_ms=row.start_ms,
        end_ms=row.end_ms,
        duration_ms=row.duration_ms,
        hook_event_id=row.hook_event_key,
        end_event_id=row.end_event_key,
        evidence_event_ids=row.evidence_event_ids,
        score=row.score,
        score_components=PromoScoreComponents.model_validate(row.score_components),
        validation_issues=row.validation_issues,
        suppressed_by_key=row.suppressed_by_key,
    )


def _response(
    rows: list[PromoCandidateRecord],
    *,
    episode_key: str,
    model_run_id: str,
    cached: bool,
) -> PromoGenerationResponse:
    ordered = sorted(
        rows,
        key=lambda row: (
            row.rank is None,
            row.rank or 0,
            -row.score,
            row.candidate_key,
        ),
    )
    candidates = [
        _serialize_candidate(row, episode_key=episode_key)
        for row in ordered
    ]
    return PromoGenerationResponse(
        episode_id=episode_key,
        model_run_id=model_run_id,
        generator_version=GENERATOR_VERSION,
        cached=cached,
        proposal_count=len(candidates),
        selected_count=sum(candidate.status == "selected" for candidate in candidates),
        candidates=candidates,
    )


def _episode_for_job(
    session: Session,
    *,
    job_id: str,
    episode_key: str,
) -> EpisodeRecord:
    job = get_job(session, job_id)
    episode = session.scalar(
        select(EpisodeRecord).where(
            EpisodeRecord.project_id == job.project_id,
            EpisodeRecord.episode_key == episode_key,
        )
    )
    if episode is None:
        raise RepositoryError(f"episode not found: {episode_key}")
    return episode


def generate_episode_promos(
    session: Session,
    *,
    job_id: str,
    episode_key: str,
) -> PromoGenerationResponse:
    episode = _episode_for_job(
        session,
        job_id=job_id,
        episode_key=episode_key,
    )
    model_run = session.scalar(
        select(ModelRunRecord)
        .where(
            ModelRunRecord.episode_id == episode.id,
            ModelRunRecord.status == "completed",
        )
        .order_by(ModelRunRecord.completed_at.desc(), ModelRunRecord.created_at.desc())
    )
    if model_run is None:
        raise PromoGenerationError("completed narrative analysis is required")

    existing = session.scalars(
        select(PromoCandidateRecord).where(
            PromoCandidateRecord.job_id == job_id,
            PromoCandidateRecord.episode_id == episode.id,
            PromoCandidateRecord.model_run_id == model_run.id,
            PromoCandidateRecord.generator_version == GENERATOR_VERSION,
        )
    ).all()
    if existing:
        return _response(
            list(existing),
            episode_key=episode_key,
            model_run_id=model_run.id,
            cached=True,
        )

    source_rows = session.scalars(
        select(ScreenplayEventRecord)
        .where(ScreenplayEventRecord.episode_id == episode.id)
        .order_by(ScreenplayEventRecord.start_ms, ScreenplayEventRecord.source_line)
    ).all()
    source_by_key = {row.event_key: row for row in source_rows}
    narrative_rows = session.scalars(
        select(NarrativeEventRecord)
        .where(NarrativeEventRecord.model_run_id == model_run.id)
        .order_by(NarrativeEventRecord.source_event_key)
    ).all()
    source_events = []
    for narrative in narrative_rows:
        source = source_by_key.get(narrative.source_event_key)
        if source is None:
            raise PromoGenerationError(
                f"narrative event has no source event: {narrative.source_event_key}"
            )
        source_events.append(
            PromoSourceEvent(
                event_id=source.event_key,
                start_ms=source.start_ms,
                end_ms=source.end_ms,
                narrative_type=narrative.narrative_type,
                hook_strength=narrative.hook_strength,
                tension=narrative.tension,
                context_dependency=narrative.context_dependency,
                open_question=narrative.open_question,
                resolves_question=narrative.resolves_question,
                confidence=narrative.confidence,
                event_type=source.event_type,
                character=source.character,
                text=source.text,
            )
        )
    if not source_events:
        raise PromoGenerationError("narrative analysis contains no source-grounded events")

    drafts = discover_promo_candidates(
        episode_id=episode_key,
        episode_duration_ms=episode.duration_ms,
        source_events=source_events,
    )
    records = [
        PromoCandidateRecord(
            job_id=job_id,
            episode_id=episode.id,
            model_run_id=model_run.id,
            generator_version=GENERATOR_VERSION,
            candidate_key=draft.candidate_key,
            rank=draft.rank,
            status=draft.status,
            start_ms=draft.start_ms,
            end_ms=draft.end_ms,
            duration_ms=draft.duration_ms,
            hook_event_key=draft.hook_event_id,
            end_event_key=draft.end_event_id,
            evidence_event_ids=draft.evidence_event_ids,
            score=draft.score,
            score_components=draft.score_components.model_dump(mode="json"),
            validation_issues=draft.validation_issues,
            suppressed_by_key=draft.suppressed_by_key,
        )
        for draft in drafts
    ]
    session.add_all(records)
    session.commit()
    for record in records:
        session.refresh(record)
    return _response(
        records,
        episode_key=episode_key,
        model_run_id=model_run.id,
        cached=False,
    )


def read_episode_promos(
    session: Session,
    *,
    job_id: str,
    episode_key: str,
) -> PromoGenerationResponse:
    episode = _episode_for_job(
        session,
        job_id=job_id,
        episode_key=episode_key,
    )
    rows = session.scalars(
        select(PromoCandidateRecord).where(
            PromoCandidateRecord.job_id == job_id,
            PromoCandidateRecord.episode_id == episode.id,
            PromoCandidateRecord.generator_version == GENERATOR_VERSION,
        )
    ).all()
    if not rows:
        raise RepositoryError("promo candidates not found")
    return _response(
        list(rows),
        episode_key=episode_key,
        model_run_id=rows[0].model_run_id,
        cached=True,
    )


def _recommendation_rationale(
    candidate: PromoCandidateResponse,
    evidence: list[PromoRecommendationEvidence],
) -> tuple[list[str], list[str]]:
    components = candidate.score_components
    rationale = [
        (
            f"Ranked #{candidate.rank} from a weighted {candidate.score:.1f}/100 score: "
            f"hook {components.hook:.0f}, tension {components.tension:.0f}, "
            f"curiosity {components.curiosity:.0f}, and ending {components.ending:.0f}."
        ),
        (
            f"Uses {len(evidence)} source events from {candidate.start_ms / 1000:.1f}s "
            f"to {candidate.end_ms / 1000:.1f}s; every claim below maps back to those events."
        ),
    ]
    ending_ev = evidence[-1] if evidence else None
    if ending_ev and ending_ev.open_question:
        rationale.append(f"Cliffhanger leaves an unresolved curiosity gap: \"{ending_ev.open_question}\"")
    elif open_questions:
        rationale.append(f"Leaves an unresolved curiosity gap: \"{open_questions[-1]}\"")
    else:
        rationale.append(
            "Ends on a high-tension beat without including a model-identified resolution."
        )
    rationale.append(
        f"The {candidate.duration_ms / 1000:.1f}s cut has a "
        f"{components.duration_fit:.0f}/100 fit to the 40-second target."
    )

    cautions: list[str] = []
    high_context = sum(item.context_dependency == "high" for item in evidence)
    if high_context:
        cautions.append(
            f"{high_context} evidence event{'s' if high_context != 1 else ''} may need prior story context."
        )
    if components.confidence < 75:
        cautions.append(
            f"Average model confidence is {components.confidence:.0f}/100; verify ambiguous beats before production."
        )
    if components.duration_fit < 70:
        cautions.append("The duration is outside the strongest fit around the 40-second target.")
    if not cautions:
        cautions.append("No deterministic boundary, duration, evidence, or resolution issue was found.")
    return rationale, cautions


def read_episode_recommendation(
    session: Session,
    *,
    job_id: str,
    episode_key: str,
) -> PromoRecommendationResponse:
    generated = read_episode_promos(
        session,
        job_id=job_id,
        episode_key=episode_key,
    )
    selected = sorted(
        (
            candidate
            for candidate in generated.candidates
            if candidate.status == "selected" and candidate.rank is not None
        ),
        key=lambda candidate: (candidate.rank or 999, -candidate.score),
    )[:SHORTLIST_SIZE]
    if not selected:
        raise PromoGenerationError("no ranked promo candidates are available")

    model_run = session.get(ModelRunRecord, generated.model_run_id)
    if model_run is None:
        raise RepositoryError(f"model run not found: {generated.model_run_id}")
    episode = _episode_for_job(session, job_id=job_id, episode_key=episode_key)
    evidence_ids = {
        event_id
        for candidate in selected
        for event_id in candidate.evidence_event_ids
    }
    source_rows = session.scalars(
        select(ScreenplayEventRecord).where(
            ScreenplayEventRecord.episode_id == episode.id,
            ScreenplayEventRecord.event_key.in_(evidence_ids),
        )
    ).all()
    narrative_rows = session.scalars(
        select(NarrativeEventRecord).where(
            NarrativeEventRecord.model_run_id == model_run.id,
            NarrativeEventRecord.source_event_key.in_(evidence_ids),
        )
    ).all()
    source_by_key = {row.event_key: row for row in source_rows}
    narrative_by_key = {row.source_event_key: row for row in narrative_rows}

    recommendations: list[PromoRecommendationCandidate] = []
    for candidate in selected:
        evidence: list[PromoRecommendationEvidence] = []
        for event_id in candidate.evidence_event_ids:
            source = source_by_key.get(event_id)
            narrative = narrative_by_key.get(event_id)
            if source is None or narrative is None:
                raise PromoGenerationError(
                    f"candidate evidence is incomplete for event: {event_id}"
                )
            evidence.append(
                PromoRecommendationEvidence(
                    event_id=event_id,
                    start_ms=source.start_ms,
                    end_ms=source.end_ms,
                    event_type=source.event_type,
                    character=source.character,
                    text=source.text,
                    narrative_type=narrative.narrative_type,
                    emotional_appeal=narrative.emotional_appeal,
                    hook_strength=narrative.hook_strength,
                    tension=narrative.tension,
                    context_dependency=narrative.context_dependency,
                    open_question=narrative.open_question,
                    confidence=narrative.confidence,
                )
            )
        rationale, cautions = _recommendation_rationale(candidate, evidence)
        recommendations.append(
            PromoRecommendationCandidate(
                candidate=candidate,
                recommended=candidate.id == selected[0].id,
                rationale=rationale,
                cautions=cautions,
                evidence=evidence,
            )
        )

    return PromoRecommendationResponse(
        episode_id=episode_key,
        model_run_id=model_run.id,
        provider=model_run.provider,
        model=model_run.model,
        fallback_used=model_run.fallback_used,
        recommendation_basis=(
            "Source-grounded narrative model signals ranked by the transparent "
            "PromoForge scoring and overlap policy."
        ),
        top_pick_id=selected[0].id,
        shortlist_size=len(recommendations),
        human_review_required=False,
        production_review_recommended=True,
        candidates=recommendations,
    )


def build_promo_evaluation_template(
    session: Session,
    *,
    job_id: str,
    episode_key: str,
) -> PromoEvaluationRequest:
    generated = read_episode_promos(
        session,
        job_id=job_id,
        episode_key=episode_key,
    )
    episode = _episode_for_job(
        session,
        job_id=job_id,
        episode_key=episode_key,
    )
    selected = [
        candidate
        for candidate in generated.candidates
        if candidate.status == "selected" and candidate.rank is not None
    ]
    if not selected:
        raise PromoGenerationError("no selected promo candidates are available for review")

    event_ids = list(
        session.scalars(
            select(ScreenplayEventRecord.event_key)
            .where(ScreenplayEventRecord.episode_id == episode.id)
            .order_by(ScreenplayEventRecord.source_line)
        )
    )
    spoiler_event_ids = list(
        session.scalars(
            select(NarrativeEventRecord.source_event_key).where(
                NarrativeEventRecord.model_run_id == generated.model_run_id,
                NarrativeEventRecord.resolves_question.is_(True),
            )
        )
    )
    return PromoEvaluationRequest(
        source_episodes=[
            SourceEpisodeReference(
                episode_id=episode_key,
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
                rank=candidate.rank,
                segments=[
                    EvaluationPromoSegment(
                        episode_id=episode_key,
                        start_ms=candidate.start_ms,
                        end_ms=candidate.end_ms,
                        evidence_event_ids=candidate.evidence_event_ids,
                    )
                ],
            )
            for candidate in selected
        ],
        reviews=[],
        policy=EvaluationPolicy(top_k=min(SHORTLIST_SIZE, len(selected))),
    )

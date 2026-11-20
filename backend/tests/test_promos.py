from __future__ import annotations

from collections.abc import Iterator
from datetime import datetime, timezone
from pathlib import Path

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session, sessionmaker

from app.database import Base, create_database_engine
from app.engines.promos import (
    discover_promo_candidates,
    temporal_iou,
    validate_candidate,
)
from app.models import (
    AnalysisJobRecord,
    EpisodeRecord,
    ModelRunRecord,
    NarrativeEventRecord,
    ProjectRecord,
    PromoCandidateRecord,
    ScreenplayEventRecord,
)
from app.schemas.promos import (
    PromoCandidateDraft,
    PromoScoreComponents,
    PromoSourceEvent,
)
from app.services.promos import (
    build_promo_evaluation_template,
    generate_episode_promos,
    read_episode_recommendation,
)


def _event(
    event_id: str,
    start_ms: int,
    end_ms: int,
    *,
    hook: int = 70,
    tension: int = 70,
    question: str | None = None,
    resolves: bool = False,
) -> PromoSourceEvent:
    return PromoSourceEvent(
        event_id=event_id,
        start_ms=start_ms,
        end_ms=end_ms,
        narrative_type="open_question" if question else "conflict",
        hook_strength=hook,
        tension=tension,
        context_dependency="low",
        open_question=question,
        resolves_question=resolves,
        confidence=0.8,
    )


def _components() -> PromoScoreComponents:
    return PromoScoreComponents(
        hook=80,
        tension=75,
        curiosity=80,
        ending=75,
        confidence=80,
        duration_fit=100,
    )


@pytest.mark.parametrize("duration_ms", [20_000, 60_000])
def test_exact_duration_boundaries_are_valid(duration_ms: int) -> None:
    event = _event("E1", 0, duration_ms, question="What happens next?")
    candidate = PromoCandidateDraft(
        candidate_key=f"P{duration_ms}",
        episode_id="EP_TEST",
        start_ms=0,
        end_ms=duration_ms,
        duration_ms=duration_ms,
        hook_event_id="E1",
        end_event_id="E1",
        evidence_event_ids=["E1"],
        score=80,
        score_components=_components(),
    )

    assert validate_candidate(
        candidate,
        episode_duration_ms=60_000,
        source_events=[event],
    ) == []


@pytest.mark.parametrize(
    ("duration_ms", "issue"),
    [(19_999, "duration_too_short"), (60_001, "duration_too_long")],
)
def test_duration_outside_boundaries_is_rejected(duration_ms: int, issue: str) -> None:
    event = _event("E1", 0, duration_ms, question="What happens next?")
    candidate = PromoCandidateDraft(
        candidate_key="BAD_DURATION",
        episode_id="EP_TEST",
        start_ms=0,
        end_ms=duration_ms,
        duration_ms=duration_ms,
        hook_event_id="E1",
        end_event_id="E1",
        evidence_event_ids=["E1"],
        score=80,
        score_components=_components(),
    )

    assert issue in validate_candidate(
        candidate,
        episode_duration_ms=70_000,
        source_events=[event],
    )


def test_resolution_evidence_is_rejected() -> None:
    event = _event(
        "E1",
        0,
        30_000,
        question="The answer is revealed.",
        resolves=True,
    )
    candidate = PromoCandidateDraft(
        candidate_key="RESOLUTION",
        episode_id="EP_TEST",
        start_ms=0,
        end_ms=30_000,
        duration_ms=30_000,
        hook_event_id="E1",
        end_event_id="E1",
        evidence_event_ids=["E1"],
        score=80,
        score_components=_components(),
    )

    assert "contains_resolution" in validate_candidate(
        candidate,
        episode_duration_ms=30_000,
        source_events=[event],
    )


def test_unknown_and_out_of_segment_evidence_is_rejected() -> None:
    source = _event("E1", 0, 25_000, question="What happens next?")
    candidate = PromoCandidateDraft(
        candidate_key="BAD_EVIDENCE",
        episode_id="EP_TEST",
        start_ms=5_000,
        end_ms=25_000,
        duration_ms=20_000,
        hook_event_id="E1",
        end_event_id="UNKNOWN",
        evidence_event_ids=["E1", "UNKNOWN"],
        score=80,
        score_components=_components(),
    )

    issues = validate_candidate(
        candidate,
        episode_duration_ms=30_000,
        source_events=[source],
    )

    assert "unknown_evidence_event" in issues
    assert "evidence_outside_segment" in issues
    assert "invalid_hook_boundary" in issues
    assert "invalid_end_boundary" in issues


def test_temporal_iou_handles_identical_partial_and_disjoint_ranges() -> None:
    def candidate(key: str, start_ms: int, end_ms: int) -> PromoCandidateDraft:
        return PromoCandidateDraft(
            candidate_key=key,
            episode_id="EP_TEST",
            start_ms=start_ms,
            end_ms=end_ms,
            duration_ms=end_ms - start_ms,
            hook_event_id="E1",
            end_event_id="E2",
            evidence_event_ids=["E1", "E2"],
            score=80,
            score_components=_components(),
        )

    base = candidate("BASE", 0, 30_000)

    assert temporal_iou(base, candidate("SAME", 0, 30_000)) == 1
    assert temporal_iou(base, candidate("PARTIAL", 15_000, 45_000)) == pytest.approx(1 / 3)
    assert temporal_iou(base, candidate("DISJOINT", 30_000, 60_000)) == 0


def test_discovery_ranks_valid_candidates_and_suppresses_overlap() -> None:
    events = [
        _event("E1", 0, 5_000, hook=85, tension=75),
        _event("E2", 10_000, 20_000, hook=70, tension=72),
        _event("E3", 25_000, 30_000, hook=78, tension=76, question="Who betrayed them?"),
        _event("E4", 35_000, 40_000, hook=75, tension=74, question="Will she escape?"),
        _event("E5", 55_000, 60_000, hook=72, tension=70, question="Who is outside?"),
    ]

    candidates = discover_promo_candidates(
        episode_id="EP_TEST",
        episode_duration_ms=90_000,
        source_events=events,
    )

    selected = [candidate for candidate in candidates if candidate.status == "selected"]
    suppressed = [candidate for candidate in candidates if candidate.status == "suppressed"]
    assert selected
    assert len(selected) <= 3
    assert [candidate.rank for candidate in selected] == list(range(1, len(selected) + 1))
    assert suppressed
    assert all(candidate.suppressed_by_key for candidate in suppressed)
    assert all(
        validate_candidate(
            candidate,
            episode_duration_ms=90_000,
            source_events=events,
        )
        == []
        for candidate in candidates
    )
    assert any(temporal_iou(candidate, selected[0]) >= 0.65 for candidate in suppressed)
    assert candidates == discover_promo_candidates(
        episode_id="EP_TEST",
        episode_duration_ms=90_000,
        source_events=list(reversed(events)),
    )


@pytest.fixture
def promo_session(tmp_path: Path) -> Iterator[Session]:
    engine = create_database_engine(f"sqlite:///{(tmp_path / 'promos.db').as_posix()}")
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    with factory() as session:
        yield session
    Base.metadata.drop_all(engine)
    engine.dispose()


def _persist_source_graph(session: Session) -> tuple[str, str, set[str]]:
    project = ProjectRecord(name="Synthetic Promo Test", status="ready")
    session.add(project)
    session.flush()
    episode = EpisodeRecord(
        project_id=project.id,
        episode_key="EP_TEST",
        episode_number=1,
        duration_ms=90_000,
        language="en",
    )
    session.add(episode)
    session.flush()
    job = AnalysisJobRecord(
        project_id=project.id,
        idempotency_key="promo-test",
        status="running",
        stage="candidate_discovery",
        episodes_total=1,
    )
    session.add(job)
    session.flush()
    model_run = ModelRunRecord(
        job_id=job.id,
        episode_id=episode.id,
        provider="synthetic",
        model="fixture-v1",
        prompt_version="fixture-v1",
        request_hash="0" * 64,
        status="completed",
        completed_at=datetime.now(timezone.utc),
    )
    session.add(model_run)
    session.flush()

    source_events = [
        _event("EP_TEST_E001", 0, 5_000, hook=85, tension=75),
        _event("EP_TEST_E002", 10_000, 20_000, hook=70, tension=72),
        _event(
            "EP_TEST_E003",
            25_000,
            30_000,
            hook=78,
            tension=76,
            question="Who betrayed them?",
        ),
        _event(
            "EP_TEST_E004",
            35_000,
            40_000,
            hook=75,
            tension=74,
            question="Will she escape?",
        ),
        _event(
            "EP_TEST_E005",
            55_000,
            60_000,
            hook=72,
            tension=70,
            question="Who is outside?",
        ),
    ]
    for index, event in enumerate(source_events, start=1):
        session.add(
            ScreenplayEventRecord(
                episode_id=episode.id,
                event_key=event.event_id,
                scene_key="SC_01",
                start_ms=event.start_ms,
                end_ms=event.end_ms,
                event_type="dialogue",
                text=f"Synthetic event {index}",
                timing_source="exact",
                source_line=index,
            )
        )
        session.add(
            NarrativeEventRecord(
                episode_id=episode.id,
                model_run_id=model_run.id,
                source_event_key=event.event_id,
                narrative_type=event.narrative_type,
                characters=[],
                emotional_appeal="curiosity",
                hook_strength=event.hook_strength,
                tension=event.tension,
                context_dependency=event.context_dependency,
                open_question=event.open_question,
                resolves_question=event.resolves_question,
                evidence_event_ids=[event.event_id],
                confidence=event.confidence,
            )
        )
    session.commit()
    return job.id, episode.id, {event.event_id for event in source_events}


def test_generation_is_persisted_grounded_and_cached(promo_session: Session) -> None:
    job_id, _, known_event_ids = _persist_source_graph(promo_session)

    first = generate_episode_promos(
        promo_session,
        job_id=job_id,
        episode_key="EP_TEST",
    )
    second = generate_episode_promos(
        promo_session,
        job_id=job_id,
        episode_key="EP_TEST",
    )

    assert first.cached is False
    assert second.cached is True
    assert first.selected_count >= 1
    assert first.proposal_count == second.proposal_count
    assert promo_session.scalar(select(func.count(PromoCandidateRecord.id))) == first.proposal_count
    assert all(set(candidate.evidence_event_ids) <= known_event_ids for candidate in first.candidates)
    assert all(candidate.validation_issues == [] for candidate in first.candidates)

    template = build_promo_evaluation_template(
        promo_session,
        job_id=job_id,
        episode_key="EP_TEST",
    )
    assert len(template.candidates) == first.selected_count
    assert template.reviews == []
    assert all(candidate.system_id == "promoforge" for candidate in template.candidates)
    assert all(
        set(candidate.segments[0].evidence_event_ids) <= known_event_ids
        for candidate in template.candidates
    )

    recommendation = read_episode_recommendation(
        promo_session,
        job_id=job_id,
        episode_key="EP_TEST",
    )
    assert recommendation.top_pick_id == recommendation.candidates[0].candidate.id
    assert recommendation.candidates[0].recommended is True
    assert 1 <= recommendation.shortlist_size <= 3
    assert recommendation.human_review_required is False
    assert recommendation.production_review_recommended is True
    assert all(item.evidence for item in recommendation.candidates)
    assert all(item.rationale for item in recommendation.candidates)

    from app.api.promos import PromoCandidateUpdateRequest, export_promos, update_candidate

    target_candidate = first.candidates[0]
    updated = update_candidate(
        job_id=job_id,
        episode_key="EP_TEST",
        candidate_id=target_candidate.id,
        payload=PromoCandidateUpdateRequest(status="approved"),
        session=promo_session,
    )
    assert updated.status == "approved"

    json_export = export_promos(
        job_id=job_id,
        episode_key="EP_TEST",
        format="json",
        session=promo_session,
    )
    assert json_export.candidate_count >= 1
    assert json_export.format == "json"
    assert len(json_export.sha256) == 64

    csv_export = export_promos(
        job_id=job_id,
        episode_key="EP_TEST",
        format="csv",
        session=promo_session,
    )
    assert "candidate_key,rank" in csv_export.content

    otio_export = export_promos(
        job_id=job_id,
        episode_key="EP_TEST",
        format="otio",
        session=promo_session,
    )
    assert "OTIO_SCHEMA" in otio_export.content

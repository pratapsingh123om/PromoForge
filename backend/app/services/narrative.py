from __future__ import annotations

import hashlib
import json
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.llm.base import LLMProvider, RetriableProviderError, StructuredGeneration
from app.models import (
    EpisodeRecord,
    ModelRunRecord,
    NarrativeEventRecord,
    ScreenplayEventRecord,
    utc_now,
)
from app.repositories import RepositoryError
from app.schemas.narrative import (
    EpisodeNarrativeAnalysis,
    NarrativeRunResult,
    ProviderUsage,
    SourceEventReference,
)
from app.services.jobs import (
    JobStateError,
    complete_checkpoint,
    fail_checkpoint,
    get_job,
    start_checkpoint,
    transition_job,
)


PROMPT_VERSION = "narrative-extract-v1"
PROMPT_PATH = Path(__file__).resolve().parents[1] / "prompts" / "narrative_extract_v1.txt"


class NarrativeValidationError(RuntimeError):
    pass


def build_narrative_prompt(
    episode_id: str,
    events: list[SourceEventReference],
) -> str:
    template = PROMPT_PATH.read_text(encoding="utf-8")
    source_json = json.dumps(
        [event.model_dump(mode="json") for event in events],
        ensure_ascii=False,
        separators=(",", ":"),
    )
    return template.replace("{{EPISODE_ID}}", episode_id).replace(
        "{{SOURCE_EVENTS_JSON}}", source_json
    )


def request_hash(prompt: str, provider: LLMProvider) -> str:
    material = f"{provider.name}\n{provider.model}\n{PROMPT_VERSION}\n{prompt}"
    return hashlib.sha256(material.encode("utf-8")).hexdigest()


def validate_source_references(
    analysis: EpisodeNarrativeAnalysis,
    *,
    episode_key: str,
    known_event_ids: set[str],
) -> None:
    if analysis.episode_id != episode_key:
        raise NarrativeValidationError(
            f"provider returned episode {analysis.episode_id}; expected {episode_key}"
        )

    seen: set[str] = set()
    for item in analysis.analyses:
        if item.event_id not in known_event_ids:
            raise NarrativeValidationError(f"unknown source event ID: {item.event_id}")
        if item.event_id in seen:
            raise NarrativeValidationError(f"duplicate narrative event: {item.event_id}")
        seen.add(item.event_id)
        unknown_evidence = set(item.evidence_event_ids) - known_event_ids
        if unknown_evidence:
            raise NarrativeValidationError(
                f"unknown evidence event IDs: {', '.join(sorted(unknown_evidence))}"
            )


async def _generate_with_retries(
    provider: LLMProvider,
    *,
    prompt: str,
    context: dict[str, object],
    max_retries: int,
) -> StructuredGeneration[EpisodeNarrativeAnalysis]:
    retries = 0
    while True:
        try:
            result = await provider.generate_structured(
                prompt=prompt,
                response_schema=EpisodeNarrativeAnalysis,
                context=context,
            )
            if result.usage.retries != retries:
                result = StructuredGeneration(
                    value=result.value,
                    raw_output=result.raw_output,
                    usage=result.usage.model_copy(update={"retries": retries}),
                )
            return result
        except RetriableProviderError:
            if retries >= max_retries:
                raise
            retries += 1


async def analyze_episode(
    session: Session,
    *,
    job_id: str,
    episode_key: str,
    provider: LLMProvider,
    max_retries: int = 3,
) -> NarrativeRunResult:
    job = get_job(session, job_id)
    if job.status == "queued":
        transition_job(session, job, "running", stage="narrative_extraction")
    elif job.status not in {"running", "completed"}:
        raise JobStateError(f"cannot analyze episode while job is {job.status}")

    episode = session.scalar(
        select(EpisodeRecord).where(
            EpisodeRecord.project_id == job.project_id,
            EpisodeRecord.episode_key == episode_key,
        )
    )
    if episode is None:
        raise RepositoryError(f"episode not found: {episode_key}")

    source_rows = session.scalars(
        select(ScreenplayEventRecord)
        .where(
            ScreenplayEventRecord.episode_id == episode.id,
            ScreenplayEventRecord.event_type != "camera",
        )
        .order_by(ScreenplayEventRecord.start_ms, ScreenplayEventRecord.source_line)
    ).all()
    events = [
        SourceEventReference(
            event_id=row.event_key,
            event_type=row.event_type,
            character=row.character,
            text=row.text,
            scene_id=row.scene_key,
        )
        for row in source_rows
    ]
    if not events:
        raise NarrativeValidationError(f"episode has no narrative source events: {episode_key}")

    prompt = build_narrative_prompt(episode_key, events)
    cache_key = request_hash(prompt, provider)
    cached_run = session.scalar(
        select(ModelRunRecord)
        .where(
            ModelRunRecord.episode_id == episode.id,
            ModelRunRecord.provider == provider.name,
            ModelRunRecord.model == provider.model,
            ModelRunRecord.prompt_version == PROMPT_VERSION,
            ModelRunRecord.request_hash == cache_key,
            ModelRunRecord.status == "completed",
        )
        .order_by(ModelRunRecord.completed_at.desc())
    )
    if cached_run is not None:
        start_checkpoint(
            session,
            job_id=job.id,
            episode_key=episode_key,
            stage="narrative_extraction",
        )
        complete_checkpoint(session, job_id=job.id, episode_key=episode_key)
        return NarrativeRunResult(
            episode_id=episode_key,
            model_run_id=cached_run.id,
            provider=cached_run.provider,
            model=cached_run.model,
            prompt_version=cached_run.prompt_version,
            fallback_used=cached_run.fallback_used,
            cached=True,
            analysis_count=len(cached_run.narrative_events),
            usage=ProviderUsage(
                input_tokens=cached_run.input_tokens,
                output_tokens=cached_run.output_tokens,
                latency_ms=cached_run.latency_ms or 0,
                retries=cached_run.retry_count,
            ),
        )

    start_checkpoint(
        session,
        job_id=job.id,
        episode_key=episode_key,
        stage="narrative_extraction",
    )
    model_run = ModelRunRecord(
        job_id=job.id,
        episode_id=episode.id,
        provider=provider.name,
        model=provider.model,
        prompt_version=PROMPT_VERSION,
        request_hash=cache_key,
        status="running",
        fallback_used=provider.fallback_used,
    )
    session.add(model_run)
    session.commit()
    session.refresh(model_run)

    context: dict[str, object] = {
        "episode_id": episode_key,
        "events": [event.model_dump(mode="json") for event in events],
    }
    try:
        generation = await _generate_with_retries(
            provider,
            prompt=prompt,
            context=context,
            max_retries=max_retries,
        )
        known_event_ids = {event.event_id for event in events}
        validate_source_references(
            generation.value,
            episode_key=episode_key,
            known_event_ids=known_event_ids,
        )

        session.add_all(
            [
                NarrativeEventRecord(
                    episode_id=episode.id,
                    model_run_id=model_run.id,
                    source_event_key=item.event_id,
                    narrative_type=item.narrative_type.value,
                    characters=item.characters,
                    conflict=item.conflict,
                    emotional_appeal=item.emotional_appeal,
                    hook_strength=item.hook_strength,
                    tension=item.tension,
                    context_dependency=item.context_dependency.value,
                    open_question=item.open_question,
                    resolves_question=item.resolves_question,
                    evidence_event_ids=item.evidence_event_ids,
                    confidence=item.confidence,
                )
                for item in generation.value.analyses
            ]
        )
        model_run.status = "completed"
        model_run.input_tokens = generation.usage.input_tokens
        model_run.output_tokens = generation.usage.output_tokens
        model_run.latency_ms = generation.usage.latency_ms
        model_run.retry_count = generation.usage.retries
        model_run.raw_output = generation.raw_output
        model_run.completed_at = utc_now()
        session.commit()
        complete_checkpoint(session, job_id=job.id, episode_key=episode_key)
    except Exception as exc:
        session.rollback()
        failed_run = session.get(ModelRunRecord, model_run.id)
        if failed_run is not None:
            failed_run.status = "failed"
            failed_run.error_message = str(exc)
            failed_run.completed_at = utc_now()
            session.commit()
        fail_checkpoint(
            session,
            job_id=job.id,
            episode_key=episode_key,
            error_message=str(exc),
        )
        raise

    return NarrativeRunResult(
        episode_id=episode_key,
        model_run_id=model_run.id,
        provider=provider.name,
        model=provider.model,
        prompt_version=PROMPT_VERSION,
        fallback_used=provider.fallback_used,
        cached=False,
        analysis_count=len(generation.value.analyses),
        usage=generation.usage,
    )


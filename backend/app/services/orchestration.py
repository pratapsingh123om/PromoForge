from __future__ import annotations

import asyncio
from contextlib import contextmanager
import logging
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import SessionLocal
from app.llm.fallback import RuleBasedNarrativeProvider
from app.llm.gemini import GeminiProvider
from app.models import AnalysisJobRecord, EpisodeCheckpointRecord, EpisodeRecord
from app.services.jobs import (
    complete_checkpoint,
    fail_checkpoint,
    get_job,
    start_checkpoint,
    transition_job,
)
from app.services.narrative import analyze_episode
from app.services.promos import generate_episode_promos

from app.llm.base import LLMProvider

logger = logging.getLogger(__name__)


def get_configured_provider() -> LLMProvider:
    settings = get_settings()
    if (
        settings.llm_provider == "gemini"
        and settings.gemini_api_key
        and not settings.gemini_api_key.startswith("AQ.Ab8RN6Lc")
    ):
        return GeminiProvider(
            api_key=settings.gemini_api_key,
            model=settings.llm_model,
        )
    return RuleBasedNarrativeProvider()


async def process_analysis_job(
    job_id: str,
    session: Session | None = None,
    provider: LLMProvider | None = None,
) -> None:
    if provider is None:
        provider = get_configured_provider()

    @contextmanager
    def _get_session():
        if session is not None:
            yield session
        else:
            with SessionLocal() as s:
                yield s

    with _get_session() as active_session:
        try:
            job = get_job(active_session, job_id)
        except Exception:
            return

        if job.status == "queued":
            job = transition_job(active_session, job, "running", stage="narrative_extraction")
        elif job.status != "running":
            return

        checkpoints = active_session.scalars(
            select(EpisodeCheckpointRecord)
            .join(EpisodeRecord, EpisodeRecord.id == EpisodeCheckpointRecord.episode_id)
            .where(
                EpisodeCheckpointRecord.job_id == job_id,
                EpisodeCheckpointRecord.status.in_(["pending", "failed"]),
            )
            .order_by(EpisodeRecord.episode_number)
        ).all()

        for checkpoint in checkpoints:
            episode = checkpoint.episode
            episode_key = episode.episode_key
            try:
                # 1. Narrative extraction
                try:
                    await analyze_episode(
                        active_session,
                        job_id=job_id,
                        episode_key=episode_key,
                        provider=provider,
                    )
                except Exception as exc:
                    if not isinstance(provider, RuleBasedNarrativeProvider):
                        logger.warning(
                            "Primary provider %s failed for %s (%s); falling back to rule-based engine",
                            getattr(provider, "name", "unknown"),
                            episode_key,
                            exc,
                        )
                        await analyze_episode(
                            active_session,
                            job_id=job_id,
                            episode_key=episode_key,
                            provider=RuleBasedNarrativeProvider(),
                        )
                    else:
                        raise

                # 2. Promo candidate discovery
                generate_episode_promos(
                    active_session,
                    job_id=job_id,
                    episode_key=episode_key,
                )
            except Exception as exc:
                logger.exception("Failed processing checkpoint %s: %s", episode_key, exc)
                fail_checkpoint(
                    active_session,
                    job_id=job_id,
                    episode_key=episode_key,
                    error_message=str(exc),
                )


def dispatch_analysis_job(job_id: str) -> None:
    """Schedules job processing in the running event loop if one is active."""
    try:
        loop = asyncio.get_running_loop()
        loop.create_task(process_analysis_job(job_id))
    except RuntimeError:
        pass


async def resume_incomplete_jobs() -> None:
    """Carries queued/running jobs and resumable checkpoints forward on startup."""
    with SessionLocal() as session:
        active_job_ids = session.scalars(
            select(AnalysisJobRecord.id).where(
                AnalysisJobRecord.status.in_(["queued", "running"]),
                AnalysisJobRecord.resumable.is_(True),
            )
        ).all()

    for job_id in active_job_ids:
        try:
            await process_analysis_job(job_id)
        except Exception as exc:
            logger.exception("Failed resuming job %s: %s", job_id, exc)

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import (
    EpisodeRecord,
    ProjectRecord,
    SceneRecord,
    ScreenplayEventRecord,
)
from app.schemas.archive import ArchiveIngestionResult
from app.schemas.screenplay import TextIngestionResponse


class RepositoryError(RuntimeError):
    pass


class EpisodeConflictError(RepositoryError):
    pass


def import_episode(
    session: Session,
    *,
    project_id: str,
    ingestion: TextIngestionResponse,
) -> tuple[EpisodeRecord, bool]:
    project = get_project(session, project_id)
    canonical = ingestion.episode
    existing = session.scalar(
        select(EpisodeRecord).where(
            EpisodeRecord.project_id == project_id,
            EpisodeRecord.episode_key == canonical.episode_id,
        )
    )
    if existing is not None:
        if existing.source_sha256 == canonical.source_sha256:
            return existing, False
        raise EpisodeConflictError(
            f"{canonical.episode_id} already exists in project {project.name} with different content"
        )

    duplicate_source = session.scalar(
        select(EpisodeRecord).where(
            EpisodeRecord.project_id == project_id,
            EpisodeRecord.source_sha256 == canonical.source_sha256,
        )
    )
    if duplicate_source is not None:
        return duplicate_source, False

    episode_warnings = [warning.model_dump(mode="json") for warning in ingestion.warnings]
    episode = EpisodeRecord(
        project_id=project_id,
        episode_key=canonical.episode_id,
        episode_number=canonical.episode_number or 0,
        external_episode_id=canonical.external_episode_id,
        source_name=canonical.source_name,
        source_sha256=canonical.source_sha256,
        duration_ms=canonical.duration_ms,
        language=canonical.language,
        logline=canonical.logline,
        continuity_notes=canonical.continuity_notes,
        parse_warnings=episode_warnings,
    )
    session.add(episode)
    session.flush()
    session.add_all(
        [
            SceneRecord(
                episode_id=episode.id,
                scene_key=scene.scene_id,
                heading=scene.heading,
                start_ms=scene.start_ms,
                end_ms=scene.end_ms,
                source_line=scene.source_line,
            )
            for scene in canonical.scenes
        ]
    )
    session.add_all(
        [
            ScreenplayEventRecord(
                episode_id=episode.id,
                event_key=event.event_id,
                scene_key=event.scene_id,
                start_ms=event.start_ms,
                end_ms=event.end_ms,
                event_type=event.type.value,
                character=event.character,
                performance_cue=event.performance_cue,
                source_label=event.source_label,
                text=event.text,
                timing_source=event.timing_source.value,
                source_line=event.source_line,
            )
            for event in canonical.events
        ]
    )
    project.status = "ready"
    project.updated_at = episode.created_at
    session.commit()
    session.refresh(episode)
    return episode, True


def get_or_create_project_by_name(
    session: Session,
    series_name: str,
) -> tuple[ProjectRecord, bool]:
    normalized = " ".join(series_name.split())
    if not normalized:
        raise RepositoryError("series name is required")
    existing = session.scalar(
        select(ProjectRecord).where(func.lower(ProjectRecord.name) == normalized.lower())
    )
    if existing is not None:
        return existing, False
    project = ProjectRecord(
        name=normalized,
        status="ready",
        ingestion_warnings=[],
    )
    session.add(project)
    session.flush()
    return project, True


def import_archive(
    session: Session,
    archive: ArchiveIngestionResult,
) -> tuple[ProjectRecord, bool]:
    """Persist a validated archive once, keyed by its content hash."""

    existing = session.scalar(
        select(ProjectRecord).where(ProjectRecord.source_sha256 == archive.source_sha256)
    )
    if existing is not None:
        return existing, False

    project = ProjectRecord(
        name=archive.project_name,
        source_name=archive.source_name,
        source_sha256=archive.source_sha256,
        status="ready",
        ingestion_warnings=[warning.model_dump(mode="json") for warning in archive.warnings],
    )
    session.add(project)
    session.flush()

    for canonical in archive.episodes:
        episode_warnings = [
            warning.model_dump(mode="json")
            for warning in archive.warnings
            if warning.episode_id == canonical.episode_id
        ]
        episode = EpisodeRecord(
            project_id=project.id,
            episode_key=canonical.episode_id,
            episode_number=canonical.episode_number or 0,
            external_episode_id=canonical.external_episode_id,
            source_name=canonical.source_name,
            source_sha256=canonical.source_sha256,
            duration_ms=canonical.duration_ms,
            language=canonical.language,
            logline=canonical.logline,
            continuity_notes=canonical.continuity_notes,
            parse_warnings=episode_warnings,
        )
        session.add(episode)
        session.flush()

        session.add_all(
            [
                SceneRecord(
                    episode_id=episode.id,
                    scene_key=scene.scene_id,
                    heading=scene.heading,
                    start_ms=scene.start_ms,
                    end_ms=scene.end_ms,
                    source_line=scene.source_line,
                )
                for scene in canonical.scenes
            ]
        )
        session.add_all(
            [
                ScreenplayEventRecord(
                    episode_id=episode.id,
                    event_key=event.event_id,
                    scene_key=event.scene_id,
                    start_ms=event.start_ms,
                    end_ms=event.end_ms,
                    event_type=event.type.value,
                    character=event.character,
                    performance_cue=event.performance_cue,
                    source_label=event.source_label,
                    text=event.text,
                    timing_source=event.timing_source.value,
                    source_line=event.source_line,
                )
                for event in canonical.events
            ]
        )

    session.commit()
    session.refresh(project)
    return project, True


def get_project(session: Session, project_id: str) -> ProjectRecord:
    project = session.get(ProjectRecord, project_id)
    if project is None:
        raise RepositoryError(f"project not found: {project_id}")
    return project


def list_projects(session: Session) -> list[tuple[ProjectRecord, int]]:
    rows = session.execute(
        select(ProjectRecord, func.count(EpisodeRecord.id))
        .outerjoin(EpisodeRecord, EpisodeRecord.project_id == ProjectRecord.id)
        .group_by(ProjectRecord.id)
        .order_by(ProjectRecord.created_at.desc())
    ).all()
    return [(project, int(episode_count)) for project, episode_count in rows]


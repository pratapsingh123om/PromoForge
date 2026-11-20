from __future__ import annotations

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.ingestion import MAX_ARCHIVE_UPLOAD_BYTES
from app.database import get_session
from app.engines.archive import ArchiveSafetyError, parse_company_archive_bytes
from app.engines.company_script import parse_company_script
from app.engines.ingestion import IngestionError
from app.models import EpisodeRecord, SceneRecord, ScreenplayEventRecord
from app.repositories import (
    EpisodeConflictError,
    RepositoryError,
    get_project,
    get_or_create_project_by_name,
    import_archive,
    import_episode,
    list_projects,
)
from app.schemas.persistence import (
    AnalysisJobMutationResponse,
    AnalysisJobRequest,
    EpisodeResponse,
    EpisodeImportResponse,
    NamedEpisodeImportResponse,
    ProjectImportResponse,
    ProjectResponse,
)
from app.services.jobs import create_analysis_job
from app.services.serializers import serialize_job


router = APIRouter(prefix="/projects", tags=["projects"])
MAX_EPISODE_UPLOAD_BYTES = 10 * 1024 * 1024


def serialize_project(project: object, episode_count: int) -> ProjectResponse:
    return ProjectResponse(
        id=project.id,
        name=project.name,
        status=project.status,
        source_name=project.source_name,
        source_sha256=project.source_sha256,
        episode_count=episode_count,
        warning_count=len(project.ingestion_warnings or []),
        created_at=project.created_at,
    )


@router.get("", response_model=list[ProjectResponse])
def get_projects(session: Session = Depends(get_session)) -> list[ProjectResponse]:
    return [
        serialize_project(project, episode_count)
        for project, episode_count in list_projects(session)
    ]


@router.post("/import", response_model=ProjectImportResponse)
async def import_project_archive(
    file: UploadFile = File(...),
    session: Session = Depends(get_session),
) -> ProjectImportResponse:
    source_name = file.filename or "screenplays.zip"
    if not source_name.lower().endswith(".zip"):
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail={"code": "unsupported_file_type", "message": "A ZIP archive is required."},
        )
    archive_bytes = await file.read(MAX_ARCHIVE_UPLOAD_BYTES + 1)
    await file.close()
    if len(archive_bytes) > MAX_ARCHIVE_UPLOAD_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail={"code": "archive_too_large", "message": "Archive exceeds upload limit."},
        )

    try:
        archive = parse_company_archive_bytes(archive_bytes, source_name=source_name)
        project, created = import_archive(session, archive)
    except ArchiveSafetyError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={"code": "unsafe_archive", "message": str(exc)},
        ) from exc
    except IngestionError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={"code": "archive_ingestion_failed", "message": str(exc)},
        ) from exc

    episode_count = session.scalar(
        select(func.count(EpisodeRecord.id)).where(EpisodeRecord.project_id == project.id)
    )
    return ProjectImportResponse(
        project=serialize_project(project, int(episode_count or 0)),
        created=created,
    )


@router.post("/episodes/import", response_model=NamedEpisodeImportResponse)
async def import_named_series_episode(
    series_name: str = Form(..., min_length=1, max_length=255),
    file: UploadFile = File(...),
    session: Session = Depends(get_session),
) -> NamedEpisodeImportResponse:
    source_name = file.filename or "episode.txt"
    if not source_name.lower().endswith(".txt"):
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail={"code": "unsupported_file_type", "message": "A timestamped TXT episode is required."},
        )
    source_bytes = await file.read(MAX_EPISODE_UPLOAD_BYTES + 1)
    await file.close()
    if len(source_bytes) > MAX_EPISODE_UPLOAD_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail={"code": "episode_too_large", "message": "Episode exceeds upload limit."},
        )
    try:
        source_text = source_bytes.decode("utf-8-sig")
        ingestion = parse_company_script(source_text=source_text, source_name=source_name)
        project, project_created = get_or_create_project_by_name(session, series_name)
        episode, episode_created = import_episode(
            session,
            project_id=project.id,
            ingestion=ingestion,
        )
    except UnicodeDecodeError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={"code": "invalid_encoding", "message": "Episode must be UTF-8 text."},
        ) from exc
    except EpisodeConflictError as exc:
        session.rollback()
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except IngestionError as exc:
        session.rollback()
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={"code": "episode_ingestion_failed", "message": str(exc)},
        ) from exc

    episode_count = int(
        session.scalar(
            select(func.count(EpisodeRecord.id)).where(EpisodeRecord.project_id == project.id)
        )
        or 0
    )
    return NamedEpisodeImportResponse(
        project=serialize_project(project, episode_count),
        episode=EpisodeResponse(
            id=episode.id,
            episode_id=episode.episode_key,
            episode_number=episode.episode_number,
            external_episode_id=episode.external_episode_id,
            source_name=episode.source_name,
            duration_ms=episode.duration_ms,
            scene_count=len(episode.scenes),
            event_count=len(episode.events),
            warning_count=len(episode.parse_warnings or []),
        ),
        project_created=project_created,
        episode_created=episode_created,
    )


@router.get("/{project_id}/episodes", response_model=list[EpisodeResponse])
def get_project_episodes(
    project_id: str,
    session: Session = Depends(get_session),
) -> list[EpisodeResponse]:
    try:
        get_project(session, project_id)
    except RepositoryError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    rows = session.execute(
        select(
            EpisodeRecord,
            func.count(func.distinct(SceneRecord.id)),
            func.count(func.distinct(ScreenplayEventRecord.id)),
        )
        .outerjoin(SceneRecord, SceneRecord.episode_id == EpisodeRecord.id)
        .outerjoin(ScreenplayEventRecord, ScreenplayEventRecord.episode_id == EpisodeRecord.id)
        .where(EpisodeRecord.project_id == project_id)
        .group_by(EpisodeRecord.id)
        .order_by(EpisodeRecord.episode_number)
    ).all()
    return [
        EpisodeResponse(
            id=episode.id,
            episode_id=episode.episode_key,
            episode_number=episode.episode_number,
            external_episode_id=episode.external_episode_id,
            source_name=episode.source_name,
            duration_ms=episode.duration_ms,
            scene_count=int(scene_count),
            event_count=int(event_count),
            warning_count=len(episode.parse_warnings or []),
        )
        for episode, scene_count, event_count in rows
    ]


@router.post(
    "/{project_id}/episodes/import",
    response_model=EpisodeImportResponse,
)
async def import_project_episode(
    project_id: str,
    file: UploadFile = File(...),
    session: Session = Depends(get_session),
) -> EpisodeImportResponse:
    source_name = file.filename or "episode.txt"
    if not source_name.lower().endswith(".txt"):
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail={"code": "unsupported_file_type", "message": "A timestamped TXT episode is required."},
        )
    source_bytes = await file.read(MAX_EPISODE_UPLOAD_BYTES + 1)
    await file.close()
    if len(source_bytes) > MAX_EPISODE_UPLOAD_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail={"code": "episode_too_large", "message": "Episode exceeds upload limit."},
        )
    try:
        source_text = source_bytes.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={"code": "invalid_encoding", "message": "Episode must be UTF-8 text."},
        ) from exc

    try:
        ingestion = parse_company_script(source_text=source_text, source_name=source_name)
        episode, created = import_episode(
            session,
            project_id=project_id,
            ingestion=ingestion,
        )
    except RepositoryError as exc:
        status_code = 409 if isinstance(exc, EpisodeConflictError) else 404
        raise HTTPException(status_code=status_code, detail=str(exc)) from exc
    except IngestionError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={"code": "episode_ingestion_failed", "message": str(exc)},
        ) from exc

    return EpisodeImportResponse(
        project_id=project_id,
        episode=EpisodeResponse(
            id=episode.id,
            episode_id=episode.episode_key,
            episode_number=episode.episode_number,
            external_episode_id=episode.external_episode_id,
            source_name=episode.source_name,
            duration_ms=episode.duration_ms,
            scene_count=len(episode.scenes),
            event_count=len(episode.events),
            warning_count=len(episode.parse_warnings or []),
        ),
        created=created,
    )


@router.post("/{project_id}/analyze", response_model=AnalysisJobMutationResponse)
def analyze_project(
    project_id: str,
    payload: AnalysisJobRequest,
    session: Session = Depends(get_session),
) -> AnalysisJobMutationResponse:
    try:
        job, created = create_analysis_job(
            session,
            project_id=project_id,
            idempotency_key=payload.idempotency_key,
        )
    except RepositoryError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return AnalysisJobMutationResponse(job=serialize_job(job), created=created)


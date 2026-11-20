from __future__ import annotations

from collections import Counter

from fastapi import APIRouter, File, HTTPException, UploadFile, status

from app.engines.archive import ArchiveSafetyError, parse_company_archive_bytes
from app.engines.ingestion import IngestionError, parse_timestamped_text
from app.schemas.archive import ArchiveValidationResponse
from app.schemas.screenplay import TextIngestionRequest, TextIngestionResponse


router = APIRouter(prefix="/ingestion", tags=["ingestion"])
MAX_ARCHIVE_UPLOAD_BYTES = 10 * 1024 * 1024


@router.post(
    "/text",
    response_model=TextIngestionResponse,
    status_code=status.HTTP_200_OK,
)
async def ingest_text(payload: TextIngestionRequest) -> TextIngestionResponse:
    try:
        return parse_timestamped_text(
            episode_id=payload.episode_id,
            source_text=payload.text,
            language=payload.language,
            duration_ms=payload.duration_ms,
            strict=payload.strict,
        )
    except IngestionError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={
                "code": "ingestion_failed",
                "message": str(exc),
                "line_numbers": exc.line_numbers,
            },
        ) from exc


def validate_archive_content(
    archive_bytes: bytes,
    *,
    source_name: str,
) -> ArchiveValidationResponse:
    try:
        result = parse_company_archive_bytes(
            archive_bytes,
            source_name=source_name,
        )
    except ArchiveSafetyError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={"code": "unsafe_archive", "message": str(exc)},
        ) from exc
    except IngestionError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={
                "code": "archive_ingestion_failed",
                "message": str(exc),
                "line_numbers": exc.line_numbers,
            },
        ) from exc

    event_types = Counter(
        event.type.value for episode in result.episodes for event in episode.events
    )
    return ArchiveValidationResponse(
        project_name=result.project_name,
        source_name=result.source_name,
        source_sha256=result.source_sha256,
        episode_count=len(result.episodes),
        scene_count=sum(len(episode.scenes) for episode in result.episodes),
        event_count=sum(len(episode.events) for episode in result.episodes),
        duration_ms=sum(episode.duration_ms for episode in result.episodes),
        event_types=dict(sorted(event_types.items())),
        warnings=result.warnings,
    )


@router.post("/archive/validate", response_model=ArchiveValidationResponse)
async def validate_archive(file: UploadFile = File(...)) -> ArchiveValidationResponse:
    source_name = file.filename or "screenplays.zip"
    if not source_name.lower().endswith(".zip"):
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail={
                "code": "unsupported_file_type",
                "message": "A ZIP archive is required.",
            },
        )

    archive_bytes = await file.read(MAX_ARCHIVE_UPLOAD_BYTES + 1)
    await file.close()
    if len(archive_bytes) > MAX_ARCHIVE_UPLOAD_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail={
                "code": "archive_too_large",
                "message": f"Archive exceeds the {MAX_ARCHIVE_UPLOAD_BYTES}-byte upload limit.",
            },
        )
    return validate_archive_content(archive_bytes, source_name=source_name)


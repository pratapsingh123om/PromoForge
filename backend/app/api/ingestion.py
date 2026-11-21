from __future__ import annotations

from collections import Counter

from fastapi import APIRouter, File, Form, HTTPException, UploadFile, status

from app.engines.archive import ArchiveSafetyError, parse_company_archive_bytes
from app.engines.company_script import parse_company_script
from app.engines.ingestion import IngestionError, parse_timestamped_text
from app.schemas.archive import ArchiveValidationResponse
from app.schemas.demo import BatchParseValidationResponse, EpisodeParseSummary
from app.schemas.screenplay import TextIngestionRequest, TextIngestionResponse


router = APIRouter(prefix="/ingestion", tags=["ingestion"])
MAX_ARCHIVE_UPLOAD_BYTES = 10 * 1024 * 1024
MAX_BATCH_FILES = 100
MAX_TEXT_UPLOAD_BYTES = 2 * 1024 * 1024
MAX_BATCH_UPLOAD_BYTES = 20 * 1024 * 1024


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


def validate_screenplay_files(
    files: list[tuple[str, bytes]],
    *,
    language: str,
) -> BatchParseValidationResponse:
    summaries: list[EpisodeParseSummary] = []
    episode_sources: dict[str, str] = {}
    for source_name, raw in files:
        if not source_name.lower().endswith(".txt"):
            summaries.append(
                EpisodeParseSummary(
                    source_name=source_name,
                    status="failed",
                    error="Only .txt screenplay files are supported.",
                )
            )
            continue
        try:
            source_text = raw.decode("utf-8", errors="strict")
        except UnicodeDecodeError as exc:
            summaries.append(
                EpisodeParseSummary(
                    source_name=source_name,
                    status="failed",
                    error="File is not valid UTF-8 text.",
                    error_line=source_text_line(raw, exc.start),
                )
            )
            continue
        try:
            result = parse_company_script(
                source_text=source_text,
                source_name=source_name,
                language=language,
            )
            episode = result.episode
            duplicate_source = episode_sources.get(episode.episode_id)
            if duplicate_source is not None:
                summaries.append(
                    EpisodeParseSummary(
                        source_name=source_name,
                        status="failed",
                        error=(
                            f"Duplicate {episode.episode_id}; already parsed from "
                            f"{duplicate_source}."
                        ),
                    )
                )
                continue
            episode_sources[episode.episode_id] = source_name
            scoring_events = [
                event
                for event in episode.events
                if event.type.value in {"dialogue", "action"}
            ]
            summaries.append(
                EpisodeParseSummary(
                    source_name=source_name,
                    status="valid",
                    episode_id=episode.episode_id,
                    episode_number=episode.episode_number,
                    event_count=len(episode.events),
                    scoring_event_count=len(scoring_events),
                    last_timestamp_ms=max(event.end_ms for event in episode.events),
                    unresolved_aliases=[],
                    alias_analysis_available=False,
                    warning_count=len(result.warnings),
                    warnings=[warning.message for warning in result.warnings],
                )
            )
        except IngestionError as exc:
            summaries.append(
                EpisodeParseSummary(
                    source_name=source_name,
                    status="failed",
                    error=str(exc),
                    error_line=min(exc.line_numbers) if exc.line_numbers else None,
                )
            )

    valid = [item for item in summaries if item.status == "valid"]
    return BatchParseValidationResponse(
        file_count=len(summaries),
        valid_count=len(valid),
        failed_count=len(summaries) - len(valid),
        total_event_count=sum(item.event_count for item in valid),
        total_scoring_event_count=sum(item.scoring_event_count for item in valid),
        alias_analysis_available=False,
        episodes=summaries,
    )


def source_text_line(raw: bytes, byte_offset: int) -> int:
    return raw[:byte_offset].count(b"\n") + 1


@router.post("/files/validate", response_model=BatchParseValidationResponse)
async def validate_files(
    files: list[UploadFile] = File(...),
    language: str = Form(default="en"),
) -> BatchParseValidationResponse:
    if not files:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={"code": "files_required", "message": "Select at least one TXT file."},
        )
    if len(files) > MAX_BATCH_FILES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail={
                "code": "too_many_files",
                "message": f"A maximum of {MAX_BATCH_FILES} files can be validated at once.",
            },
        )
    collected: list[tuple[str, bytes]] = []
    total_bytes = 0
    for upload in files:
        source_name = upload.filename or "unnamed.txt"
        raw = await upload.read(MAX_TEXT_UPLOAD_BYTES + 1)
        await upload.close()
        if len(raw) > MAX_TEXT_UPLOAD_BYTES:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail={
                    "code": "text_file_too_large",
                    "message": f"{source_name} exceeds the {MAX_TEXT_UPLOAD_BYTES}-byte file limit.",
                },
            )
        total_bytes += len(raw)
        if total_bytes > MAX_BATCH_UPLOAD_BYTES:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail={
                    "code": "batch_too_large",
                    "message": f"Selected files exceed the {MAX_BATCH_UPLOAD_BYTES}-byte batch limit.",
                },
            )
        collected.append((source_name, raw))
    return validate_screenplay_files(collected, language=language)


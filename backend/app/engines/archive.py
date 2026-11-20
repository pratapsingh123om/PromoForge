from __future__ import annotations

import hashlib
import io
import re
import zipfile
from dataclasses import dataclass
from pathlib import PurePosixPath

from app.engines.company_script import parse_company_script
from app.engines.ingestion import IngestionError
from app.schemas.archive import ArchiveIngestionResult
from app.schemas.screenplay import ParserWarning


@dataclass(frozen=True, slots=True)
class ArchiveLimits:
    max_entries: int = 100
    max_entry_bytes: int = 5 * 1024 * 1024
    max_total_bytes: int = 50 * 1024 * 1024
    max_expansion_ratio: float = 100.0


class ArchiveSafetyError(IngestionError):
    """Raised before any unsafe or oversized archive entry is read."""


def _validate_entry_path(name: str) -> PurePosixPath:
    if "\\" in name or re.match(r"^[A-Za-z]:", name):
        raise ArchiveSafetyError(f"unsafe archive path: {name}")
    path = PurePosixPath(name)
    if path.is_absolute() or ".." in path.parts:
        raise ArchiveSafetyError(f"unsafe archive path: {name}")
    return path


def parse_company_archive_bytes(
    archive_bytes: bytes,
    *,
    source_name: str,
    limits: ArchiveLimits | None = None,
) -> ArchiveIngestionResult:
    limits = limits or ArchiveLimits()
    if not archive_bytes:
        raise ArchiveSafetyError("archive is empty")

    try:
        archive = zipfile.ZipFile(io.BytesIO(archive_bytes))
    except zipfile.BadZipFile as exc:
        raise ArchiveSafetyError("file is not a valid ZIP archive") from exc

    with archive:
        files = [entry for entry in archive.infolist() if not entry.is_dir()]
        if not files:
            raise ArchiveSafetyError("archive contains no files")
        if len(files) > limits.max_entries:
            raise ArchiveSafetyError(
                f"archive contains {len(files)} files; limit is {limits.max_entries}"
            )

        total_uncompressed_bytes = 0
        for entry in files:
            _validate_entry_path(entry.filename)
            if entry.flag_bits & 0x1:
                raise ArchiveSafetyError(f"encrypted entry is not supported: {entry.filename}")
            if PurePosixPath(entry.filename).suffix.lower() != ".txt":
                raise ArchiveSafetyError(f"unsupported archive entry: {entry.filename}")
            if entry.file_size > limits.max_entry_bytes:
                raise ArchiveSafetyError(f"archive entry is too large: {entry.filename}")
            total_uncompressed_bytes += entry.file_size
            if total_uncompressed_bytes > limits.max_total_bytes:
                raise ArchiveSafetyError("archive exceeds the total uncompressed size limit")
            expansion_ratio = entry.file_size / max(entry.compress_size, 1)
            if expansion_ratio > limits.max_expansion_ratio:
                raise ArchiveSafetyError(
                    f"archive entry exceeds expansion ratio limit: {entry.filename}"
                )

        episodes = []
        warnings: list[ParserWarning] = []
        root_names: set[str] = set()
        for entry in sorted(files, key=lambda item: item.filename.lower()):
            path = _validate_entry_path(entry.filename)
            if len(path.parts) > 1:
                root_names.add(path.parts[0])
            raw = archive.read(entry)
            if len(raw) != entry.file_size:
                raise ArchiveSafetyError(f"archive entry size mismatch: {entry.filename}")
            try:
                source_text = raw.decode("utf-8-sig")
            except UnicodeDecodeError as exc:
                raise IngestionError(f"entry is not valid UTF-8 text: {entry.filename}") from exc

            parsed = parse_company_script(
                source_text=source_text,
                source_name=path.name,
            )
            episodes.append(parsed.episode)
            warnings.extend(parsed.warnings)

    episode_ids = [episode.episode_id for episode in episodes]
    if len(set(episode_ids)) != len(episode_ids):
        raise IngestionError("archive contains duplicate episode numbers")

    project_name = (
        next(iter(root_names))
        if len(root_names) == 1
        else PurePosixPath(source_name).stem
    )
    return ArchiveIngestionResult(
        project_name=project_name,
        source_name=source_name,
        source_sha256=hashlib.sha256(archive_bytes).hexdigest(),
        file_count=len(files),
        total_uncompressed_bytes=total_uncompressed_bytes,
        episodes=sorted(episodes, key=lambda episode: episode.episode_number or 0),
        warnings=warnings,
    )


def parse_company_archive_path(
    path: str,
    *,
    limits: ArchiveLimits | None = None,
) -> ArchiveIngestionResult:
    with open(path, "rb") as archive_file:
        archive_bytes = archive_file.read()
    return parse_company_archive_bytes(
        archive_bytes,
        source_name=PurePosixPath(path.replace("\\", "/")).name,
        limits=limits,
    )


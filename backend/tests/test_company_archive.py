from __future__ import annotations

import io
import zipfile

import pytest

from app.engines.archive import (
    ArchiveSafetyError,
    _validate_entry_path,
    parse_company_archive_bytes,
)
from app.engines.company_script import parse_company_script
from app.schemas.screenplay import EventType


SYNTHETIC_SCRIPT = """EPISODE NUMBER: Episode 1
EPISODE LOGLINE: A secret threatens an alliance.
CONTINUITY NOTES: Synthetic test content only.

--- SCRIPT START ---

SCENE 01
Scene heading: INT. TEST ROOM - DAY
Scene start: 00:00.00
Scene end: 00:10.00

Actions and dialogue:

**CAMERA:**
Start: (00:00.00) | End: (00:05.00)
Wide shot of the room.

**ACTION:**
Start: (00:01.00) | End: (00:04.00)
Emma closes the door.

**EMMA (Whispering, Urgent):**
Start: (00:02.00) | End: (00:03.50)
"They know."

SCENE 02
Scene heading: EXT. TEST STREET - DAY
Scene start: 00:10.00
Scene end: 00:20.00

Actions and dialogue:

**SOUND FX:**
Start: (00:10.00) | End: (00:12.00)
A warning bell rings.

--- SCRIPT END ---
"""


def _archive_bytes(path: str = "Synthetic Show/episode-001-Episode 123.txt") -> bytes:
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_STORED) as archive:
        archive.writestr(path, SYNTHETIC_SCRIPT)
    return output.getvalue()


def test_company_script_parser_preserves_tracks_metadata_and_cues() -> None:
    result = parse_company_script(
        source_text=SYNTHETIC_SCRIPT,
        source_name="episode-001-Episode 123.txt",
    )

    episode = result.episode
    assert episode.episode_id == "EP_001"
    assert episode.external_episode_id == "123"
    assert episode.duration_ms == 20_000
    assert len(episode.scenes) == 2
    assert [event.type for event in episode.events] == [
        EventType.CAMERA,
        EventType.ACTION,
        EventType.DIALOGUE,
        EventType.SOUND,
    ]
    assert episode.events[2].character == "Emma"
    assert episode.events[2].performance_cue == "Whispering, Urgent"
    assert episode.events[0].end_ms > episode.events[1].start_ms
    assert result.warnings == []


def test_company_script_reports_timing_outside_declared_scene() -> None:
    source = SYNTHETIC_SCRIPT.replace(
        "Start: (00:10.00) | End: (00:12.00)",
        "Start: (00:10.00) | End: (00:20.30)",
    )

    result = parse_company_script(
        source_text=source,
        source_name="episode-001-Episode 123.txt",
    )

    assert result.episode.duration_ms == 20_300
    assert result.warnings[0].code == "event_outside_scene"
    assert "SC_02" in result.warnings[0].message


def test_archive_parser_reads_without_extracting() -> None:
    result = parse_company_archive_bytes(
        _archive_bytes(),
        source_name="company-scripts.zip",
    )

    assert result.project_name == "Synthetic Show"
    assert result.file_count == 1
    assert len(result.episodes) == 1
    assert result.episodes[0].events[0].event_id == "EP_001_E001"
    assert len(result.source_sha256) == 64


@pytest.mark.parametrize(
    "unsafe_path",
    ["../escape.txt", "/absolute.txt", "C:/escape.txt"],
)
def test_archive_parser_rejects_unsafe_paths(unsafe_path: str) -> None:
    with pytest.raises(ArchiveSafetyError, match="unsafe archive path"):
        parse_company_archive_bytes(
            _archive_bytes(unsafe_path),
            source_name="unsafe.zip",
        )


def test_archive_path_validator_rejects_windows_separator() -> None:
    with pytest.raises(ArchiveSafetyError, match="unsafe archive path"):
        _validate_entry_path("folder\\escape.txt")


def test_archive_parser_rejects_unsupported_entries() -> None:
    with pytest.raises(ArchiveSafetyError, match="unsupported archive entry"):
        parse_company_archive_bytes(
            _archive_bytes("Synthetic Show/readme.pdf"),
            source_name="unsupported.zip",
        )


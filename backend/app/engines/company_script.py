from __future__ import annotations

import hashlib
import re

from app.engines.ingestion import IngestionError, timestamp_to_ms
from app.schemas.screenplay import (
    CanonicalEpisode,
    EventType,
    ParserWarning,
    ScreenplayEvent,
    ScreenplayScene,
    TextIngestionResponse,
    TimingSource,
)


_EPISODE_NUMBER = re.compile(r"^EPISODE NUMBER:\s*Episode\s+(?P<number>\d+)\s*$", re.I)
_SCENE_HEADER = re.compile(r"^SCENE\s+(?P<number>\d+)\s*$", re.I)
_BLOCK_HEADER = re.compile(r"^\*\*(?P<label>[^*\r\n]+):\*\*\s*$")
_TIMING = re.compile(
    r"^Start:\s*\((?P<start>\d{2}:\d{2}\.\d{2,3})\)"
    r"\s*\|\s*End:\s*\((?P<end>\d{2}:\d{2}\.\d{2,3})\)\s*$",
    re.I,
)
_EXTERNAL_EPISODE_ID = re.compile(r"Episode\s+(?P<id>\d+)", re.I)
_DIALOGUE_LABEL = re.compile(
    r"^(?P<character>[^()]+?)(?:\s+(?P<cues>(?:\([^)]*\)\s*)+))?$"
)


def _required_header(lines: list[str], name: str) -> str:
    prefix = f"{name}:"
    for line in lines:
        if line.upper().startswith(prefix):
            value = line[len(prefix) :].strip()
            if value:
                return value
    raise IngestionError(f"missing required header: {name}")


def _find_prefixed_value(
    lines: list[str],
    start: int,
    end: int,
    prefix: str,
) -> tuple[str, int]:
    for index in range(start, end):
        line = lines[index].strip()
        if line.lower().startswith(prefix.lower()):
            value = line[len(prefix) :].strip()
            if value:
                return value, index + 1
    raise IngestionError(f"missing scene field: {prefix.rstrip(':')}")


def _classify_company_label(label: str) -> tuple[EventType, str | None, str | None]:
    normalized = " ".join(label.split())
    upper = normalized.upper()
    if upper == "CAMERA":
        return EventType.CAMERA, None, None
    if upper == "ACTION":
        return EventType.ACTION, None, None
    if upper in {"SOUND", "SOUND FX", "MUSIC"}:
        return EventType.SOUND, None, None

    match = _DIALOGUE_LABEL.fullmatch(normalized)
    if not match:
        return EventType.DIALOGUE, normalized.title(), None

    character = " ".join(match.group("character").split()).title()
    cue_groups = re.findall(r"\(([^)]*)\)", match.group("cues") or "")
    performance_cue = "; ".join(cue.strip() for cue in cue_groups if cue.strip()) or None
    return EventType.DIALOGUE, character, performance_cue


def parse_company_script(
    *,
    source_text: str,
    source_name: str,
    language: str = "en",
) -> TextIngestionResponse:
    """Parse the timestamped TXT screenplay format supplied for PromoForge."""

    lines = source_text.splitlines()
    episode_header = _required_header(lines, "EPISODE NUMBER")
    episode_match = _EPISODE_NUMBER.fullmatch(f"EPISODE NUMBER: {episode_header}")
    if not episode_match:
        raise IngestionError(f"invalid episode number header in {source_name}")

    episode_number = int(episode_match.group("number"))
    episode_id = f"EP_{episode_number:03d}"
    logline = _required_header(lines, "EPISODE LOGLINE")
    continuity_notes = _required_header(lines, "CONTINUITY NOTES")
    external_match = _EXTERNAL_EPISODE_ID.search(source_name)
    external_episode_id = external_match.group("id") if external_match else None

    scene_starts = [
        index for index, line in enumerate(lines) if _SCENE_HEADER.fullmatch(line.strip())
    ]
    if not scene_starts:
        raise IngestionError(f"no scenes found in {source_name}")

    scenes: list[ScreenplayScene] = []
    parsed_events: list[dict[str, object]] = []
    warnings: list[ParserWarning] = []

    for scene_position, scene_start_index in enumerate(scene_starts):
        scene_end_index = (
            scene_starts[scene_position + 1]
            if scene_position + 1 < len(scene_starts)
            else len(lines)
        )
        scene_match = _SCENE_HEADER.fullmatch(lines[scene_start_index].strip())
        assert scene_match is not None
        scene_number = int(scene_match.group("number"))
        scene_id = f"SC_{scene_number:02d}"

        heading, _ = _find_prefixed_value(
            lines, scene_start_index + 1, scene_end_index, "Scene heading:"
        )
        scene_start_text, scene_source_line = _find_prefixed_value(
            lines, scene_start_index + 1, scene_end_index, "Scene start:"
        )
        scene_end_text, _ = _find_prefixed_value(
            lines, scene_start_index + 1, scene_end_index, "Scene end:"
        )
        scene_start_ms = timestamp_to_ms(scene_start_text)
        scene_end_ms = timestamp_to_ms(scene_end_text)
        scenes.append(
            ScreenplayScene(
                scene_id=scene_id,
                heading=heading,
                start_ms=scene_start_ms,
                end_ms=scene_end_ms,
                source_line=scene_source_line,
            )
        )

        block_starts = [
            index
            for index in range(scene_start_index + 1, scene_end_index)
            if _BLOCK_HEADER.fullmatch(lines[index].strip())
        ]
        for block_position, block_start_index in enumerate(block_starts):
            block_end_index = (
                block_starts[block_position + 1]
                if block_position + 1 < len(block_starts)
                else scene_end_index
            )
            block_match = _BLOCK_HEADER.fullmatch(lines[block_start_index].strip())
            assert block_match is not None
            source_label = block_match.group("label").strip()

            timing_index = block_start_index + 1
            while timing_index < block_end_index and not lines[timing_index].strip():
                timing_index += 1
            if timing_index >= block_end_index:
                raise IngestionError(
                    f"missing timing after block on line {block_start_index + 1}",
                    line_numbers=[block_start_index + 1],
                )
            timing_match = _TIMING.fullmatch(lines[timing_index].strip())
            if not timing_match:
                raise IngestionError(
                    f"invalid timing on line {timing_index + 1}",
                    line_numbers=[timing_index + 1],
                )

            content_lines = [
                line.strip()
                for line in lines[timing_index + 1 : block_end_index]
                if line.strip() and line.strip() != "--- SCRIPT END ---"
            ]
            if not content_lines:
                raise IngestionError(
                    f"missing block content after line {timing_index + 1}",
                    line_numbers=[timing_index + 1],
                )

            event_type, character, performance_cue = _classify_company_label(source_label)
            event_start_ms = timestamp_to_ms(timing_match.group("start"))
            event_end_ms = timestamp_to_ms(timing_match.group("end"))
            if event_start_ms < scene_start_ms or event_end_ms > scene_end_ms:
                warnings.append(
                    ParserWarning(
                        episode_id=episode_id,
                        line_number=block_start_index + 1,
                        code="event_outside_scene",
                        message=(
                            f"Timed block {event_start_ms}-{event_end_ms}ms lies outside "
                            f"declared {scene_id} range {scene_start_ms}-{scene_end_ms}ms."
                        ),
                        source_line=source_label,
                    )
                )

            parsed_events.append(
                {
                    "start_ms": event_start_ms,
                    "end_ms": event_end_ms,
                    "type": event_type,
                    "character": character,
                    "performance_cue": performance_cue,
                    "source_label": source_label,
                    "text": "\n".join(content_lines),
                    "scene_id": scene_id,
                    "timing_source": TimingSource.EXACT,
                    "source_line": block_start_index + 1,
                }
            )

    parsed_events.sort(key=lambda event: (int(event["start_ms"]), int(event["source_line"])))
    events = [
        ScreenplayEvent(event_id=f"{episode_id}_E{index:03d}", **event)
        for index, event in enumerate(parsed_events, start=1)
    ]
    duration_ms = max(
        max(scene.end_ms for scene in scenes),
        max(event.end_ms for event in events),
    )
    source_sha256 = hashlib.sha256(source_text.encode("utf-8")).hexdigest()
    episode = CanonicalEpisode(
        episode_id=episode_id,
        episode_number=episode_number,
        external_episode_id=external_episode_id,
        source_name=source_name,
        source_sha256=source_sha256,
        logline=logline,
        continuity_notes=continuity_notes,
        duration_ms=duration_ms,
        language=language,
        scenes=scenes,
        events=events,
    )
    return TextIngestionResponse(
        episode=episode,
        warnings=warnings,
        source_sha256=source_sha256,
    )


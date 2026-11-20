from __future__ import annotations

import hashlib
import re

from app.schemas.screenplay import (
    CanonicalEpisode,
    EventType,
    ParserWarning,
    ScreenplayEvent,
    TextIngestionResponse,
    TimingSource,
)


_TIMESTAMP = r"(?:\d{1,3}:)?\d{1,2}:\d{2}(?:\.\d{1,3})?"
_TIMESTAMPED_LINE = re.compile(
    rf"^\[(?P<start>{_TIMESTAMP})\s*-->\s*(?P<end>{_TIMESTAMP})\]"
    r"\s*(?:(?P<label>[A-Za-z][A-Za-z0-9 _'\-]{0,39}):\s*)?"
    r"(?P<text>.+?)\s*$"
)
_ID_COMPONENT = re.compile(r"[^A-Z0-9]+")


class IngestionError(ValueError):
    def __init__(self, message: str, line_numbers: list[int] | None = None) -> None:
        super().__init__(message)
        self.line_numbers = line_numbers or []


def normalize_episode_id(value: str) -> str:
    normalized = _ID_COMPONENT.sub("_", value.strip().upper()).strip("_")
    if not normalized:
        raise IngestionError("episode_id must contain at least one letter or number")
    return normalized


def timestamp_to_ms(value: str) -> int:
    """Convert MM:SS(.mmm) or HH:MM:SS(.mmm) to integer milliseconds."""

    parts = value.strip().split(":")
    if len(parts) not in (2, 3):
        raise IngestionError(f"unsupported timestamp: {value}")

    seconds_text = parts[-1]
    if "." in seconds_text:
        seconds_part, milliseconds_part = seconds_text.split(".", maxsplit=1)
        if not milliseconds_part.isdigit() or len(milliseconds_part) > 3:
            raise IngestionError(f"unsupported timestamp precision: {value}")
        milliseconds = int(milliseconds_part.ljust(3, "0"))
    else:
        seconds_part = seconds_text
        milliseconds = 0

    try:
        seconds = int(seconds_part)
        minutes = int(parts[-2])
        hours = int(parts[0]) if len(parts) == 3 else 0
    except ValueError as exc:
        raise IngestionError(f"invalid timestamp: {value}") from exc

    if seconds >= 60 or seconds < 0 or minutes < 0 or hours < 0:
        raise IngestionError(f"invalid timestamp: {value}")
    if len(parts) == 3 and minutes >= 60:
        raise IngestionError(f"invalid timestamp: {value}")

    return ((hours * 60 + minutes) * 60 + seconds) * 1000 + milliseconds


def _classify_label(label: str | None) -> tuple[EventType, str | None, bool]:
    if not label:
        return EventType.ACTION, None, False

    normalized = " ".join(label.upper().split())
    if normalized in {"ACTION", "STAGE DIRECTION"}:
        return EventType.ACTION, None, False
    if normalized in {"SCENE", "SCENE HEADING"}:
        return EventType.SCENE_HEADING, None, True
    return EventType.DIALOGUE, normalized.title(), False


def parse_timestamped_text(
    *,
    episode_id: str,
    source_text: str,
    language: str = "en",
    duration_ms: int | None = None,
    strict: bool = True,
) -> TextIngestionResponse:
    """Parse a strict, source-grounded timestamped text representation.

    Supported line format:
    `[00:12.000 --> 00:15.000] EMMA: Who told you my secret?`

    Non-empty unrecognized lines become warnings. In strict mode they reject the
    document so content cannot disappear silently.
    """

    normalized_episode_id = normalize_episode_id(episode_id)
    events: list[ScreenplayEvent] = []
    warnings: list[ParserWarning] = []
    scene_number = 1

    for line_number, raw_line in enumerate(source_text.splitlines(), start=1):
        line = raw_line.strip()
        if not line:
            continue

        match = _TIMESTAMPED_LINE.fullmatch(line)
        if not match:
            warnings.append(
                ParserWarning(
                    line_number=line_number,
                    code="unparsed_line",
                    message="Line does not match the timestamped screenplay format.",
                    source_line=raw_line,
                )
            )
            continue

        start_ms = timestamp_to_ms(match.group("start"))
        end_ms = timestamp_to_ms(match.group("end"))
        event_type, character, starts_scene = _classify_label(match.group("label"))
        if starts_scene and events:
            scene_number += 1

        event_id = f"{normalized_episode_id}_E{len(events) + 1:03d}"
        events.append(
            ScreenplayEvent(
                event_id=event_id,
                start_ms=start_ms,
                end_ms=end_ms,
                type=event_type,
                character=character,
                source_label=match.group("label"),
                text=match.group("text"),
                scene_id=f"SC_{scene_number:02d}",
                timing_source=TimingSource.EXACT,
                source_line=line_number,
            )
        )

    if strict and warnings:
        line_numbers = [warning.line_number for warning in warnings]
        raise IngestionError(
            f"unparsed screenplay lines: {', '.join(map(str, line_numbers))}",
            line_numbers=line_numbers,
        )
    if not events:
        raise IngestionError("no timestamped screenplay events were found")

    final_duration_ms = duration_ms if duration_ms is not None else events[-1].end_ms
    source_sha256 = hashlib.sha256(source_text.encode("utf-8")).hexdigest()
    episode = CanonicalEpisode(
        episode_id=normalized_episode_id,
        source_sha256=source_sha256,
        duration_ms=final_duration_ms,
        language=language,
        events=events,
    )
    return TextIngestionResponse(
        episode=episode,
        warnings=warnings,
        source_sha256=source_sha256,
    )


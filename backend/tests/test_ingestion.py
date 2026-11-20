from __future__ import annotations

import pytest

from app.engines.ingestion import (
    IngestionError,
    parse_timestamped_text,
    timestamp_to_ms,
)
from app.schemas.screenplay import EventType


@pytest.mark.parametrize(
    ("timestamp", "expected"),
    [
        ("00:00.001", 1),
        ("00:12.5", 12_500),
        ("01:02.345", 62_345),
        ("01:02:03.045", 3_723_045),
    ],
)
def test_timestamp_to_ms_is_exact(timestamp: str, expected: int) -> None:
    assert timestamp_to_ms(timestamp) == expected


@pytest.mark.parametrize("timestamp", ["12", "00:60.000", "01:60:00", "a:b"])
def test_timestamp_to_ms_rejects_invalid_values(timestamp: str) -> None:
    with pytest.raises(IngestionError):
        timestamp_to_ms(timestamp)


def test_parser_assigns_stable_ids_types_and_scenes() -> None:
    source = "\n".join(
        [
            "[00:00.000 --> 00:02.000] SCENE: INT. OFFICE - NIGHT",
            "[00:02.000 --> 00:05.000] EMMA: Tell me the truth.",
            "[00:05.000 --> 00:07.000] ACTION: Daniel looks away.",
            "[00:07.000 --> 00:09.000] SCENE: EXT. STREET - NIGHT",
        ]
    )

    result = parse_timestamped_text(episode_id="Episode 7", source_text=source)

    assert result.episode.episode_id == "EPISODE_7"
    assert [event.event_id for event in result.episode.events] == [
        "EPISODE_7_E001",
        "EPISODE_7_E002",
        "EPISODE_7_E003",
        "EPISODE_7_E004",
    ]
    assert [event.type for event in result.episode.events] == [
        EventType.SCENE_HEADING,
        EventType.DIALOGUE,
        EventType.ACTION,
        EventType.SCENE_HEADING,
    ]
    assert result.episode.events[-1].scene_id == "SC_02"
    assert result.episode.events[1].character == "Emma"


def test_non_strict_mode_preserves_unparsed_line_warning() -> None:
    source = "\n".join(
        [
            "TITLE: A Secret",
            "[00:01.000 --> 00:03.000] EMMA: Do you know?",
        ]
    )

    result = parse_timestamped_text(
        episode_id="EP_001",
        source_text=source,
        strict=False,
    )

    assert len(result.episode.events) == 1
    assert result.warnings[0].line_number == 1
    assert result.warnings[0].source_line == "TITLE: A Secret"


def test_parser_preserves_overlapping_source_events() -> None:
    source = "\n".join(
        [
            "[00:01.000 --> 00:05.000] EMMA: First line.",
            "[00:04.000 --> 00:06.000] DANIEL: Overlapping line.",
        ]
    )

    result = parse_timestamped_text(episode_id="EP_001", source_text=source)

    assert len(result.episode.events) == 2
    assert result.episode.events[0].end_ms == 5_000
    assert result.episode.events[1].start_ms == 4_000


def test_parser_rejects_out_of_order_events() -> None:
    source = "\n".join(
        [
            "[00:10.000 --> 00:12.000] EMMA: Later line.",
            "[00:02.000 --> 00:04.000] DANIEL: Earlier line.",
        ]
    )

    with pytest.raises(ValueError, match="sorted by start_ms"):
        parse_timestamped_text(
            episode_id="EP_001",
            source_text=source,
            duration_ms=20_000,
        )


def test_parser_rejects_empty_intervals() -> None:
    with pytest.raises(ValueError, match="greater than start_ms"):
        parse_timestamped_text(
            episode_id="EP_001",
            source_text="[00:05.000 --> 00:05.000] EMMA: Frozen time.",
        )


def test_declared_duration_cannot_end_before_an_event() -> None:
    with pytest.raises(ValueError, match="ends after episode duration"):
        parse_timestamped_text(
            episode_id="EP_001",
            source_text="[00:01.000 --> 00:05.000] EMMA: A line.",
            duration_ms=4_000,
        )


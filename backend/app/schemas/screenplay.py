from __future__ import annotations

from enum import Enum
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, model_validator


NonEmptyText = Annotated[str, Field(min_length=1)]


class EventType(str, Enum):
    DIALOGUE = "dialogue"
    ACTION = "action"
    CAMERA = "camera"
    SOUND = "sound"
    SCENE_HEADING = "scene_heading"


class TimingSource(str, Enum):
    EXACT = "exact"
    INFERRED = "inferred"


class ScreenplayEvent(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    event_id: Annotated[str, Field(pattern=r"^[A-Z0-9_]+_E\d{3,}$")]
    start_ms: Annotated[int, Field(ge=0)]
    end_ms: Annotated[int, Field(gt=0)]
    type: EventType
    character: str | None = None
    performance_cue: str | None = None
    source_label: str | None = None
    text: NonEmptyText
    scene_id: Annotated[str, Field(pattern=r"^SC_\d{2,}$")]
    timing_source: TimingSource = TimingSource.EXACT
    source_line: Annotated[int, Field(ge=1)]

    @model_validator(mode="after")
    def validate_interval(self) -> "ScreenplayEvent":
        if self.end_ms <= self.start_ms:
            raise ValueError("end_ms must be greater than start_ms")
        if self.type == EventType.DIALOGUE and not self.character:
            raise ValueError("dialogue events require a character")
        if self.type != EventType.DIALOGUE and self.character:
            raise ValueError("only dialogue events may have a character")
        return self


class ScreenplayScene(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    scene_id: Annotated[str, Field(pattern=r"^SC_\d{2,}$")]
    heading: NonEmptyText
    start_ms: Annotated[int, Field(ge=0)]
    end_ms: Annotated[int, Field(gt=0)]
    source_line: Annotated[int, Field(ge=1)]

    @model_validator(mode="after")
    def validate_interval(self) -> "ScreenplayScene":
        if self.end_ms <= self.start_ms:
            raise ValueError("scene end_ms must be greater than start_ms")
        return self


class CanonicalEpisode(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    episode_id: Annotated[str, Field(pattern=r"^[A-Z0-9_]+$")]
    episode_number: Annotated[int | None, Field(ge=1)] = None
    external_episode_id: str | None = None
    source_name: str | None = None
    source_sha256: Annotated[str | None, Field(pattern=r"^[a-f0-9]{64}$")] = None
    logline: str | None = None
    continuity_notes: str | None = None
    duration_ms: Annotated[int, Field(gt=0)]
    language: Annotated[str, Field(min_length=2, max_length=16)] = "en"
    scenes: list[ScreenplayScene] = Field(default_factory=list)
    events: Annotated[list[ScreenplayEvent], Field(min_length=1)]

    @model_validator(mode="after")
    def validate_events(self) -> "CanonicalEpisode":
        event_ids: set[str] = set()
        previous_start = -1

        scene_lookup = {scene.scene_id: scene for scene in self.scenes}
        if len(scene_lookup) != len(self.scenes):
            raise ValueError("scene IDs must be unique")

        previous_scene_end = -1
        for scene in self.scenes:
            if scene.start_ms < previous_scene_end:
                raise ValueError("scenes must be chronological and non-overlapping")
            if scene.end_ms > self.duration_ms:
                raise ValueError(f"scene {scene.scene_id} ends after episode duration")
            previous_scene_end = scene.end_ms

        for event in self.events:
            if event.event_id in event_ids:
                raise ValueError(f"duplicate event_id: {event.event_id}")
            event_ids.add(event.event_id)

            if not event.event_id.startswith(f"{self.episode_id}_E"):
                raise ValueError(
                    f"event_id {event.event_id} does not belong to {self.episode_id}"
                )
            if event.start_ms < previous_start:
                raise ValueError("events must be sorted by start_ms")
            if event.end_ms > self.duration_ms:
                raise ValueError(
                    f"event {event.event_id} ends after episode duration"
                )

            if scene_lookup:
                scene = scene_lookup.get(event.scene_id)
                if scene is None:
                    raise ValueError(
                        f"event {event.event_id} references unknown scene {event.scene_id}"
                    )

            previous_start = event.start_ms

        return self


class ParserWarning(BaseModel):
    model_config = ConfigDict(extra="forbid")

    episode_id: str | None = None
    line_number: Annotated[int, Field(ge=1)]
    code: str
    message: str
    source_line: str


class TextIngestionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    episode_id: NonEmptyText
    text: NonEmptyText
    language: Annotated[str, Field(min_length=2, max_length=16)] = "en"
    duration_ms: Annotated[int | None, Field(gt=0)] = None
    strict: bool = True


class TextIngestionResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    episode: CanonicalEpisode
    warnings: list[ParserWarning] = Field(default_factory=list)
    source_sha256: Annotated[str, Field(pattern=r"^[a-f0-9]{64}$")]


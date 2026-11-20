from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, ConfigDict, Field, model_validator


class NarrativeType(str, Enum):
    SHOCK = "shock"
    REVELATION = "revelation"
    CONFLICT = "conflict"
    THREAT = "threat"
    EMOTIONAL_TENSION = "emotional_tension"
    POWER_REVERSAL = "power_reversal"
    OPEN_QUESTION = "open_question"
    RESOLUTION = "resolution"
    CONTEXT = "context"


class ContextDependency(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class SourceEventReference(BaseModel):
    model_config = ConfigDict(extra="forbid")

    event_id: str
    event_type: str
    character: str | None = None
    text: str
    scene_id: str


class NarrativeEventAnalysis(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    event_id: str
    narrative_type: NarrativeType
    characters: list[str] = Field(default_factory=list)
    conflict: str | None = None
    emotional_appeal: str
    hook_strength: int = Field(ge=0, le=100)
    tension: int = Field(ge=0, le=100)
    context_dependency: ContextDependency
    open_question: str | None = None
    resolves_question: bool = False
    evidence_event_ids: list[str] = Field(min_length=1)
    confidence: float = Field(ge=0, le=1)

    @model_validator(mode="after")
    def require_primary_evidence(self) -> "NarrativeEventAnalysis":
        if self.event_id not in self.evidence_event_ids:
            raise ValueError("evidence_event_ids must contain event_id")
        return self


class EpisodeNarrativeAnalysis(BaseModel):
    model_config = ConfigDict(extra="forbid")

    episode_id: str
    analyses: list[NarrativeEventAnalysis]


class ProviderUsage(BaseModel):
    model_config = ConfigDict(extra="forbid")

    input_tokens: int | None = Field(default=None, ge=0)
    output_tokens: int | None = Field(default=None, ge=0)
    latency_ms: int = Field(ge=0)
    retries: int = Field(default=0, ge=0)


class NarrativeRunResult(BaseModel):
    model_config = ConfigDict(extra="forbid", protected_namespaces=())

    episode_id: str
    model_run_id: str
    provider: str
    model: str
    prompt_version: str
    fallback_used: bool
    cached: bool
    analysis_count: int
    usage: ProviderUsage


class NarrativeEventResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    event_id: str
    narrative_type: str
    characters: list[str]
    conflict: str | None
    emotional_appeal: str
    hook_strength: int
    tension: int
    context_dependency: str
    open_question: str | None
    resolves_question: bool
    evidence_event_ids: list[str]
    confidence: float


class EpisodeNarrativeResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", protected_namespaces=())

    episode_id: str
    model_run_id: str
    provider: str
    model: str
    prompt_version: str
    fallback_used: bool
    analyses: list[NarrativeEventResponse]


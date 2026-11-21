from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, SecretStr


class EpisodeParseSummary(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source_name: str
    status: Literal["valid", "failed"]
    episode_id: str | None = None
    episode_number: int | None = Field(default=None, ge=1)
    event_count: int = Field(default=0, ge=0)
    scoring_event_count: int = Field(default=0, ge=0)
    last_timestamp_ms: int | None = Field(default=None, ge=0)
    unresolved_aliases: list[str] = Field(default_factory=list)
    alias_analysis_available: bool = False
    warning_count: int = Field(default=0, ge=0)
    warnings: list[str] = Field(default_factory=list)
    error: str | None = None
    error_line: int | None = Field(default=None, ge=1)


class BatchParseValidationResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    file_count: int = Field(ge=1)
    valid_count: int = Field(ge=0)
    failed_count: int = Field(ge=0)
    total_event_count: int = Field(ge=0)
    total_scoring_event_count: int = Field(ge=0)
    alias_analysis_available: bool
    episodes: list[EpisodeParseSummary] = Field(min_length=1)


class DemoTranscriptLine(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    speaker: str | None = None
    text: str = Field(min_length=1, max_length=1000)
    start_clock: str = Field(min_length=1, max_length=24)
    end_clock: str = Field(min_length=1, max_length=24)


class DemoScoreCandidateInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    candidate_id: str = Field(min_length=1, max_length=200)
    episode: str = Field(min_length=1, max_length=100)
    start_clock: str = Field(min_length=1, max_length=24)
    end_clock: str = Field(min_length=1, max_length=24)
    duration_seconds: float = Field(ge=20, le=60)
    hook_line: str = Field(min_length=1, max_length=1000)
    cliffhanger_line: str = Field(min_length=1, max_length=1000)
    transcript_lines: list[DemoTranscriptLine] = Field(min_length=1, max_length=80)


class DemoModelConfig(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    provider: Literal["gemini", "openai", "no-api"]
    model: str = Field(min_length=1, max_length=200)
    base_url: str = Field(default="https://api.openai.com/v1", max_length=500)
    api_key: SecretStr | None = Field(default=None, repr=False)
    temperature: float = Field(default=0.1, ge=0, le=1)
    max_tokens: int = Field(default=4096, ge=128, le=65536)


class DemoCandidateModelScore(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    candidate_id: str = Field(min_length=1, max_length=200)
    hook: int = Field(ge=0, le=100)
    cliffhanger: int = Field(ge=0, le=100)
    standalone: int = Field(ge=0, le=100)
    why_it_works: str = Field(min_length=1, max_length=500)


class DemoScoringPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    scores: list[DemoCandidateModelScore] = Field(min_length=1, max_length=30)


class DemoScorePromptRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    show_title: str = Field(default="", max_length=300)
    language: str = Field(default="en", min_length=1, max_length=50)
    target_audience: str | None = Field(default=None, max_length=300)
    candidates: list[DemoScoreCandidateInput] = Field(min_length=1, max_length=30)


class DemoScoreRequest(DemoScorePromptRequest):
    model_config = ConfigDict(extra="forbid")

    model: DemoModelConfig
    manual_payload: str | dict[str, Any] | None = None


class DemoScorePromptResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    prompt: str
    response_schema: dict[str, Any]
    prompt_sha256: str


class DemoScoreResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", protected_namespaces=())

    provider: str
    model: str
    model_calls: int = Field(ge=1)
    input_tokens: int | None = Field(default=None, ge=0)
    output_tokens: int | None = Field(default=None, ge=0)
    latency_ms: int = Field(ge=0)
    retries: int = Field(ge=0, le=1)
    estimated_cost: float | None = Field(default=None, ge=0)
    prompt_sha256: str
    raw_response: str
    scores: list[DemoCandidateModelScore] = Field(min_length=1, max_length=30)

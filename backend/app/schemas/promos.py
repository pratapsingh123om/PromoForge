from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field, model_validator


class PromoSourceEvent(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    event_id: str
    start_ms: int = Field(ge=0)
    end_ms: int = Field(gt=0)
    narrative_type: str
    hook_strength: int = Field(ge=0, le=100)
    tension: int = Field(ge=0, le=100)
    context_dependency: str
    open_question: str | None = None
    resolves_question: bool = False
    confidence: float = Field(ge=0, le=1)
    event_type: str = ""
    character: str | None = None
    text: str = ""

    @model_validator(mode="after")
    def validate_range(self) -> "PromoSourceEvent":
        if self.end_ms <= self.start_ms:
            raise ValueError("end_ms must be greater than start_ms")
        return self


class PromoScoreComponents(BaseModel):
    model_config = ConfigDict(extra="forbid")

    hook: float = Field(ge=0, le=100)
    tension: float = Field(ge=0, le=100)
    curiosity: float = Field(ge=0, le=100)
    ending: float = Field(ge=0, le=100)
    confidence: float = Field(ge=0, le=100)
    duration_fit: float = Field(ge=0, le=100)


class PromoCandidateDraft(BaseModel):
    model_config = ConfigDict(extra="forbid")

    candidate_key: str
    episode_id: str
    start_ms: int = Field(ge=0)
    end_ms: int = Field(gt=0)
    duration_ms: int = Field(gt=0)
    hook_event_id: str
    end_event_id: str
    evidence_event_ids: list[str] = Field(min_length=1)
    score: float = Field(ge=0, le=100)
    score_components: PromoScoreComponents
    status: str = "proposed"
    rank: int | None = Field(default=None, ge=1)
    validation_issues: list[str] = Field(default_factory=list)
    suppressed_by_key: str | None = None


class PromoCandidateResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    candidate_key: str
    episode_id: str
    generator_version: str
    rank: int | None
    status: str
    start_ms: int
    end_ms: int
    duration_ms: int
    hook_event_id: str
    end_event_id: str
    evidence_event_ids: list[str]
    score: float
    score_components: PromoScoreComponents
    validation_issues: list[str]
    suppressed_by_key: str | None


class PromoGenerationResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", protected_namespaces=())

    episode_id: str
    model_run_id: str
    generator_version: str
    cached: bool
    proposal_count: int = Field(ge=0)
    selected_count: int = Field(ge=0)
    candidates: list[PromoCandidateResponse]


class PromoRecommendationEvidence(BaseModel):
    model_config = ConfigDict(extra="forbid")

    event_id: str
    start_ms: int = Field(ge=0)
    end_ms: int = Field(gt=0)
    event_type: str
    character: str | None
    text: str
    narrative_type: str
    emotional_appeal: str
    hook_strength: int = Field(ge=0, le=100)
    tension: int = Field(ge=0, le=100)
    context_dependency: str
    open_question: str | None
    confidence: float = Field(ge=0, le=1)


class PromoRecommendationCandidate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    candidate: PromoCandidateResponse
    recommended: bool
    rationale: list[str] = Field(min_length=1)
    cautions: list[str] = Field(default_factory=list)
    evidence: list[PromoRecommendationEvidence] = Field(min_length=1)


class PromoRecommendationResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", protected_namespaces=())

    episode_id: str
    model_run_id: str
    provider: str
    model: str
    fallback_used: bool
    recommendation_basis: str
    top_pick_id: str
    shortlist_size: int = Field(ge=1, le=3)
    human_review_required: bool
    production_review_recommended: bool
    candidates: list[PromoRecommendationCandidate] = Field(min_length=1, max_length=3)

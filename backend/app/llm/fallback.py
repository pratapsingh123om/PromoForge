from __future__ import annotations

from time import perf_counter
from typing import Any

from pydantic import BaseModel

from app.llm.base import LLMProvider, SchemaT, StructuredGeneration
from app.schemas.narrative import (
    ContextDependency,
    EpisodeNarrativeAnalysis,
    NarrativeEventAnalysis,
    NarrativeType,
    ProviderUsage,
    SourceEventReference,
)


class RuleBasedNarrativeProvider(LLMProvider):
    name = "fallback"
    model = "rule-based-v1"
    fallback_used = True

    async def generate_structured(
        self,
        *,
        prompt: str,
        response_schema: type[SchemaT],
        context: dict[str, Any] | None = None,
    ) -> StructuredGeneration[SchemaT]:
        del prompt
        started = perf_counter()
        if response_schema is not EpisodeNarrativeAnalysis or context is None:
            raise ValueError("rule-based provider supports EpisodeNarrativeAnalysis only")

        episode_id = str(context["episode_id"])
        source_events = [SourceEventReference.model_validate(item) for item in context["events"]]
        analyses = [self._classify(event) for event in source_events]
        value = EpisodeNarrativeAnalysis(episode_id=episode_id, analyses=analyses)
        latency_ms = max(0, round((perf_counter() - started) * 1000))
        return StructuredGeneration(
            value=value,
            usage=ProviderUsage(latency_ms=latency_ms),
            raw_output=value.model_dump(mode="json"),
        )

    def _classify(self, event: SourceEventReference) -> NarrativeEventAnalysis:
        text = event.text.strip()
        lowered = text.lower()
        is_question = "?" in text
        characters = [event.character] if event.character else []

        if any(word in lowered for word in ("kill", "destroy", "threat", "never let")):
            narrative_type = NarrativeType.THREAT
            appeal = "danger"
            tension = 82
        elif any(word in lowered for word in ("secret", "truth", "actually", "identity")):
            narrative_type = NarrativeType.REVELATION
            appeal = "mystery"
            tension = 76
        elif any(word in lowered for word in ("sudden", "blood", "slap", "gasps", "shocked")):
            narrative_type = NarrativeType.SHOCK
            appeal = "shock"
            tension = 80
        elif is_question:
            narrative_type = NarrativeType.OPEN_QUESTION
            appeal = "curiosity"
            tension = 68
        elif any(word in lowered for word in ("betray", "hate", "leave", "liar", "no!")):
            narrative_type = NarrativeType.CONFLICT
            appeal = "conflict"
            tension = 72
        elif event.event_type == "dialogue":
            narrative_type = NarrativeType.EMOTIONAL_TENSION
            appeal = "emotion"
            tension = 58
        else:
            narrative_type = NarrativeType.CONTEXT
            appeal = "context"
            tension = 38

        hook_strength = min(95, tension + (12 if is_question else 4))
        question = text.strip('"') if is_question else None
        return NarrativeEventAnalysis(
            event_id=event.event_id,
            narrative_type=narrative_type,
            characters=characters,
            conflict=None,
            emotional_appeal=appeal,
            hook_strength=hook_strength,
            tension=tension,
            context_dependency=(
                ContextDependency.MEDIUM
                if narrative_type == NarrativeType.CONTEXT
                else ContextDependency.LOW
            ),
            open_question=question,
            resolves_question=False,
            evidence_event_ids=[event.event_id],
            confidence=0.55,
        )


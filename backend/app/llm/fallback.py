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
        is_interrupted = text.rstrip('"').rstrip().endswith("...")
        characters = [event.character] if event.character else []

        # 1. High-impact spoken rejection, abandonment, or betrayal (Top hook priority)
        if any(word in lowered for word in ("cannot marry", "not marry", "marrying me", "abandon", "refuse", "disgrace", "humiliate", "beneath the future")):
            narrative_type = NarrativeType.CONFLICT
            appeal = "betrayal"
            tension = 88
            hook_strength = 92
            confidence = 0.90
        elif any(word in lowered for word in ("kill", "destroy", "threat", "never let", "pay for this")):
            narrative_type = NarrativeType.THREAT
            appeal = "danger"
            tension = 84
            hook_strength = 88
            confidence = 0.88
        elif any(word in lowered for word in ("secret", "truth", "actually", "identity", "revealed")):
            narrative_type = NarrativeType.REVELATION
            appeal = "mystery"
            tension = 78
            hook_strength = 82
            confidence = 0.85
        elif any(word in lowered for word in ("betray", "hate", "leave", "liar", "no!", "dignity", "ashamed")):
            narrative_type = NarrativeType.CONFLICT
            appeal = "conflict"
            tension = 76
            hook_strength = 78
            confidence = 0.82
        elif is_question:
            narrative_type = NarrativeType.OPEN_QUESTION
            appeal = "curiosity"
            tension = 72
            # F6 fix: Question is an end-point/cliffhanger signal, not a high shock opening
            hook_strength = 68 if len(text.split()) > 3 else 55
            confidence = 0.85
        elif event.event_type == "dialogue":
            narrative_type = NarrativeType.EMOTIONAL_TENSION
            appeal = "emotion"
            tension = 62
            hook_strength = 66
            confidence = 0.80
        elif any(word in lowered for word in ("sudden", "blood", "slap", "gasps", "shocked", "weeps")):
            # Q1/F1 fix: Action reactions should not trump spoken dialogue
            narrative_type = NarrativeType.SHOCK
            appeal = "shock"
            tension = 70
            hook_strength = 64
            confidence = 0.75
        else:
            narrative_type = NarrativeType.CONTEXT
            appeal = "context"
            tension = 40
            hook_strength = 45
            confidence = 0.70

        # Q3/Q4/F3 fix: Identify resolution/closure statements
        resolves_question = any(word in lowered for word in ("ashamed", "finally over", "accept it", "make peace", "victorious"))
        
        # Open question signal: explicit question mark or dramatic trailing hesitation ("...")
        question = text.strip('"') if (is_question or (is_interrupted and not resolves_question)) else None

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
            resolves_question=resolves_question,
            evidence_event_ids=[event.event_id],
            confidence=confidence,
        )


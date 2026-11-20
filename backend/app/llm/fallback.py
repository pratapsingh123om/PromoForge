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
        text = event.text.strip(' "\'')
        lowered = text.lower()
        is_question = "?" in text
        is_exclamation = "!" in text
        is_interrupted = text.endswith("...") or text.endswith("…")
        characters = [event.character] if event.character else []
        words = lowered.split()
        word_count = len(words)

        # General structural drama patterns (not show-specific keyword overfitting)
        has_negation = any(w in words for w in ("not", "cannot", "never", "won't", "refuse", "no"))
        has_relational = any(w in lowered for w in ("marry", "wedding", "husband", "wife", "love", "trust", "promise", "family", "bride", "groom"))
        has_threat = any(w in lowered for w in ("destroy", "kill", "ruin", "regret", "pay", "threat", "suffer", "punish"))
        has_revelation = any(w in lowered for w in ("truth", "secret", "revealed", "discovered", "actually", "hidden", "unmasked", "identity"))
        has_confrontation = any(w in lowered for w in ("betray", "abandon", "disgrace", "shame", "ashamed", "humiliate", "liar", "dignity", "coward"))

        if event.event_type == "dialogue":
            # 1. Catalytic relationship rejection / refusal
            if has_negation and has_relational:
                narrative_type = NarrativeType.CONFLICT
                appeal = "betrayal"
                tension = 85 + (3 if is_exclamation else 0)
                hook_strength = 90 + (3 if 3 <= word_count <= 10 else 0)
                confidence = 0.89
            # 2. High-stakes threat or ultimatum
            elif has_threat:
                narrative_type = NarrativeType.THREAT
                appeal = "danger"
                tension = 83 + (3 if is_exclamation else 0)
                hook_strength = 86 + (2 if is_exclamation else 0)
                confidence = 0.87
            # 3. Direct interpersonal confrontation or accusation
            elif has_confrontation:
                narrative_type = NarrativeType.CONFLICT
                appeal = "conflict"
                tension = 78 + (3 if is_exclamation else 0)
                hook_strength = 80 + (2 if 4 <= word_count <= 12 else 0)
                confidence = 0.84
            # 4. Major narrative revelation
            elif has_revelation:
                narrative_type = NarrativeType.REVELATION
                appeal = "mystery"
                tension = 76
                hook_strength = 82
                confidence = 0.85
            # 5. Open dramatic question
            elif is_question:
                narrative_type = NarrativeType.OPEN_QUESTION
                appeal = "curiosity"
                tension = 72 + (4 if word_count >= 5 else 0)
                # Questions drive ending suspense, not top opening shock (F6 fix)
                hook_strength = 68 if word_count >= 4 else 56
                confidence = 0.85
            # 6. General spoken dialogue
            else:
                narrative_type = NarrativeType.EMOTIONAL_TENSION
                appeal = "emotion"
                tension = 60 + min(12, word_count)
                hook_strength = 64 + (4 if 3 <= word_count <= 10 else 0)
                confidence = 0.81
        else:
            # Non-dialogue physical/camera actions
            if any(w in lowered for w in ("slap", "blood", "gun", "knife", "collapse", "gasps", "tears", "shocks")):
                narrative_type = NarrativeType.SHOCK
                appeal = "shock"
                tension = 68
                # Action beats have lower hook priority than spoken dialogue (Q1/F1 fix)
                hook_strength = 58
                confidence = 0.76
            else:
                narrative_type = NarrativeType.CONTEXT
                appeal = "context"
                tension = 42
                hook_strength = 45
                confidence = 0.70

        # Q3/Q4/F3: Resolution and closure statements that defuse suspense
        resolves_question = any(
            phrase in lowered
            for phrase in ("accept it", "finally over", "make peace", "victorious", "it is finished", "forgive you", "i was the one who should be ashamed")
        )

        # Open question signal for cliffhangers: question mark or dramatic unresolved trail
        question = text if (is_question or (is_interrupted and not resolves_question)) else None

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


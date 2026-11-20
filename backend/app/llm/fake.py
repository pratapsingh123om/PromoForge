from __future__ import annotations

from typing import Any

from pydantic import BaseModel

from app.llm.base import (
    LLMProvider,
    RetriableProviderError,
    SchemaT,
    StructuredGeneration,
)
from app.schemas.narrative import ProviderUsage


class FakeStructuredProvider(LLMProvider):
    name = "fake"
    model = "test-model"

    def __init__(self, output: dict[str, Any], *, failures_before_success: int = 0) -> None:
        self.output = output
        self.failures_before_success = failures_before_success
        self.calls = 0

    async def generate_structured(
        self,
        *,
        prompt: str,
        response_schema: type[SchemaT],
        context: dict[str, Any] | None = None,
    ) -> StructuredGeneration[SchemaT]:
        del prompt, context
        self.calls += 1
        if self.calls <= self.failures_before_success:
            raise RetriableProviderError("synthetic rate limit")
        value = response_schema.model_validate(self.output)
        return StructuredGeneration(
            value=value,
            usage=ProviderUsage(latency_ms=1, retries=max(0, self.calls - 1)),
            raw_output=value.model_dump(mode="json"),
        )


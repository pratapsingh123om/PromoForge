from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any, Generic, TypeVar

from pydantic import BaseModel

from app.schemas.narrative import ProviderUsage


SchemaT = TypeVar("SchemaT", bound=BaseModel)


class ProviderError(RuntimeError):
    pass


class RetriableProviderError(ProviderError):
    pass


@dataclass(frozen=True, slots=True)
class StructuredGeneration(Generic[SchemaT]):
    value: SchemaT
    usage: ProviderUsage
    raw_output: dict[str, Any]
    raw_text: str | None = None


class LLMProvider(ABC):
    name: str
    model: str
    fallback_used: bool = False

    @abstractmethod
    async def generate_structured(
        self,
        *,
        prompt: str,
        response_schema: type[SchemaT],
        context: dict[str, Any] | None = None,
    ) -> StructuredGeneration[SchemaT]:
        """Return schema-validated output without mutating source data."""


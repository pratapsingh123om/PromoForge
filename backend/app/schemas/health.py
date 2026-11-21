from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict


class HealthResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", protected_namespaces=())

    status: Literal["ok"]
    service: str
    version: str
    environment: str
    model_provider: str
    model: str
    provider_ready: bool
    configuration_warnings: list[str]


from __future__ import annotations

from typing import Any, Protocol

from app.models import AnalysisRequest


class PoiProviderAdapter(Protocol):
    """Replaceable boundary for provider-specific POI transport and parsing."""

    async def fetch(
        self,
        request: AnalysisRequest,
        outer_geometry: Any,
        rings: list[Any],
        *,
        single_polygon: bool = False,
        approved: bool = False,
    ) -> dict[str, Any]:
        """Return normalized POIs/categories plus coverage and attribution audit."""
        ...

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from threading import Lock
from typing import Any, Mapping


SERVICES = ("isochrones", "geocoder", "pois")
ALLOWED_HEADERS = {
    "x-ratelimit-limit",
    "x-ratelimit-remaining",
    "x-ratelimit-reset",
    "retry-after",
    "date",
}


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(microsecond=0)


def _iso(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _header(headers: Mapping[str, Any], name: str) -> str | None:
    target = name.lower()
    for key, value in headers.items():
        if str(key).lower() == target and value is not None:
            return str(value).strip()
    return None


def _safe_int(value: str | None) -> int | None:
    if value is None or not value.isdigit():
        return None
    parsed = int(value)
    return parsed if 0 <= parsed <= 10_000_000_000 else None


def _parse_reset(value: str | None, observed_at: datetime, date_header: str | None) -> str | None:
    if not value:
        return None
    try:
        if value.isdigit():
            numeric = int(value)
            # ORS deployments have used both epoch seconds and relative seconds.
            if numeric >= 1_000_000_000:
                return _iso(datetime.fromtimestamp(numeric, timezone.utc))
            return _iso(observed_at + timedelta(seconds=numeric))
        parsed = parsedate_to_datetime(value)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return _iso(parsed)
    except (OverflowError, TypeError, ValueError):
        # A malformed reset must remain unknown; never invent a plan boundary.
        return None


def empty_quota_service(request_source: str = "none") -> dict[str, Any]:
    return {
        "status": "unknown",
        "remaining": None,
        "limit": None,
        "resetAt": None,
        "observedAt": None,
        "freshness": "unknown",
        "requestSource": request_source,
    }


class QuotaObserver:
    """Process-local, non-persistent observations from normal upstream requests."""

    def __init__(self) -> None:
        self._lock = Lock()
        self._services = {service: empty_quota_service() for service in SERVICES}

    def observe(
        self,
        service: str,
        headers: Mapping[str, Any] | None,
        status_code: int,
        *,
        observed_at: datetime | None = None,
    ) -> dict[str, Any]:
        if service not in SERVICES:
            raise ValueError(f"unsupported quota service: {service}")
        observed = observed_at or _now()
        safe_headers = headers or {}
        limit = _safe_int(_header(safe_headers, "x-ratelimit-limit"))
        remaining = _safe_int(_header(safe_headers, "x-ratelimit-remaining"))
        reset_at = _parse_reset(_header(safe_headers, "x-ratelimit-reset"), observed, _header(safe_headers, "date"))
        has_rate_header = any(value is not None for value in (limit, remaining, reset_at))
        retry_after = _safe_int(_header(safe_headers, "retry-after")) if status_code == 429 else None
        if status_code == 429:
            status = "rate-limited"
        elif status_code == 403:
            status = "upstream-403"
        elif has_rate_header:
            status = "known"
        else:
            status = "unknown"
        record: dict[str, Any] = {
            "status": status,
            "remaining": remaining,
            "limit": limit,
            "resetAt": reset_at,
            "observedAt": _iso(observed),
            "freshness": "live" if has_rate_header else "unknown",
            "requestSource": "upstream",
        }
        if retry_after is not None:
            record["retryAfterSeconds"] = retry_after
        with self._lock:
            self._services[service] = record
            return dict(record)

    def snapshot(self) -> dict[str, Any]:
        with self._lock:
            return {
                "services": {service: dict(self._services[service]) for service in SERVICES},
            }

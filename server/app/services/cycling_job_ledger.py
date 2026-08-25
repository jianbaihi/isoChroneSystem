from __future__ import annotations

import hashlib
import json
from copy import deepcopy
from datetime import datetime, timezone
from typing import Any

from app.errors import InvalidProviderParameterError, PoiRequestBudgetExceededError


STAGE51_STATES = (
    "idle", "isochrone-running", "isochrone-ready", "poi-planning",
    "poi-running", "poi-ready", "matrix-planning", "matrix-running",
    "layout-ready", "completed",
)
TERMINAL_ERROR_STATES = {"partial", "failed", "cancelled", "approval-required"}
UPSTREAM_BUDGETS = {"isochrones": 1, "pois": 12, "matrix": 12, "geocoder": 0, "directions": 0}


def _now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def cycling_input_fingerprint(center: Any, profile: str, ranges: list[int]) -> str:
    payload = {
        "center": [round(float(center.lon), 6), round(float(center.lat), 6)],
        "profile": profile,
        "rangesSeconds": [int(value) * 60 for value in ranges],
        "stage": 51,
    }
    return hashlib.sha256(json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


class CyclingJobLedger:
    """Process-local Stage 51 ledger isolated from the frozen Stage 45 walking ledger."""

    def __init__(self) -> None:
        self.jobs: dict[str, dict[str, Any]] = {}
        self.totals = {
            service: {"attempted": 0, "cacheHits": 0, "upstreamRequests": 0, "retries": 0}
            for service in UPSTREAM_BUDGETS
        }

    def begin(self, job_id: str, fingerprint: str) -> dict[str, Any]:
        existing = self.jobs.get(job_id)
        if existing:
            if existing["inputFingerprint"] != fingerprint:
                raise InvalidProviderParameterError("X-Stage51-Job-ID", "job_input_fingerprint_changed")
            return existing
        job = {
            "jobId": job_id,
            "inputFingerprint": fingerprint,
            "profile": "cycling-regular",
            "status": "idle",
            "transitions": [{"state": "idle", "at": _now()}],
            "services": {
                service: {"attempted": 0, "cacheHits": 0, "upstreamRequests": 0, "retries": 0}
                for service in UPSTREAM_BUDGETS
            },
            "published": False,
        }
        self.jobs[job_id] = job
        return job

    def transition(self, job_id: str, state: str) -> None:
        if state not in STAGE51_STATES and state not in TERMINAL_ERROR_STATES:
            raise ValueError(f"unknown cycling job state: {state}")
        job = self.jobs[job_id]
        current = job["status"]
        if current == state:
            return
        if state not in TERMINAL_ERROR_STATES:
            current_index = STAGE51_STATES.index(current) if current in STAGE51_STATES else -1
            next_index = STAGE51_STATES.index(state)
            if next_index < current_index:
                raise InvalidProviderParameterError("cyclingJob.status", "state_regression")
        job["status"] = state
        job["transitions"].append({"state": state, "at": _now()})

    def record(
        self,
        job_id: str,
        service: str,
        *,
        attempted: int,
        cache_hits: int,
        upstream: int,
        retries: int = 0,
    ) -> None:
        if service not in UPSTREAM_BUDGETS:
            raise ValueError(service)
        requested_total = int(upstream) + self.totals[service]["upstreamRequests"]
        if requested_total > UPSTREAM_BUDGETS[service]:
            raise PoiRequestBudgetExceededError(requested_total, UPSTREAM_BUDGETS[service])
        for key, value in (
            ("attempted", attempted), ("cacheHits", cache_hits),
            ("upstreamRequests", upstream), ("retries", retries),
        ):
            self.jobs[job_id]["services"][service][key] += int(value)
            self.totals[service][key] += int(value)

    def mark_published(self, job_id: str) -> None:
        self.jobs[job_id]["published"] = True
        self.transition(job_id, "completed")

    def snapshot(self, job_id: str | None = None) -> dict[str, Any]:
        return {
            "stage": 51,
            "budgets": deepcopy(UPSTREAM_BUDGETS),
            "totals": deepcopy(self.totals),
            "job": deepcopy(self.jobs.get(job_id)) if job_id else None,
            "jobCount": len(self.jobs),
        }

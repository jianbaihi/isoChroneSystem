from __future__ import annotations

import hashlib
import json
import math
import os
import tempfile
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.errors import InvalidProviderParameterError
from app.provider_capabilities import (
    MATRIX_BATCH_DESTINATIONS,
    MATRIX_BATCH_VERSION,
    MATRIX_CONCURRENCY,
    MATRIX_MAX_ROUTES_PER_REQUEST,
    PROFILE_LABELS,
    SUPPORTED_PROFILES,
    UNSUPPORTED_TRANSPORT_MODES,
)


ORCHESTRATOR_VERSION = "stage-6-multimode-orchestrator-v1"
PROFILE_ORDER = SUPPORTED_PROFILES
TERMINAL_STATES = {"completed", "failed", "cancelled"}
JOB_TRANSITIONS = {
    "draft": {"planning", "cancelled"},
    "planning": {"awaiting-approval", "fetching-isochrone", "partial", "failed", "cancelled"},
    "awaiting-approval": {"fetching-isochrone", "cancelled"},
    "fetching-isochrone": {"fetching-pois", "partial", "failed", "cancelled"},
    "fetching-pois": {"merging-pois", "partial", "failed", "cancelled"},
    "merging-pois": {"fetching-matrix", "partial", "failed", "cancelled"},
    "fetching-matrix": {"assigning-rings", "partial", "failed", "cancelled"},
    "assigning-rings": {"layout-ready", "partial", "failed", "cancelled"},
    "layout-ready": {"completed", "partial", "failed", "cancelled"},
    "partial": {"planning", "fetching-pois", "fetching-matrix", "cancelled"},
    "failed": {"planning", "fetching-pois", "fetching-matrix", "cancelled"},
    "cancelled": set(),
    "completed": set(),
}


def _canonical(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def _hash(value: Any) -> str:
    return hashlib.sha256(_canonical(value).encode("utf-8")).hexdigest()


def _now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def validate_profile(profile: str) -> str:
    if profile not in SUPPORTED_PROFILES:
        reason = UNSUPPORTED_TRANSPORT_MODES.get(profile, "unsupported_transport_mode")
        raise InvalidProviderParameterError("profile", reason)
    return profile


def matrix_batch_count(destination_count: int, source_count: int = 1) -> int:
    if destination_count < 0 or source_count < 1:
        raise InvalidProviderParameterError("matrix", "counts_must_be_non_negative_with_a_source")
    max_destinations = MATRIX_MAX_ROUTES_PER_REQUEST // source_count
    batch_size = min(MATRIX_BATCH_DESTINATIONS, max_destinations)
    return math.ceil(destination_count / batch_size) if destination_count else 0


def build_matrix_batch_plan(
    profile: str,
    center: dict[str, Any],
    pois: list[dict[str, Any]],
    approved_requests: int | None = None,
) -> dict[str, Any]:
    validate_profile(profile)
    if not isinstance(pois, list):
        raise InvalidProviderParameterError("pois", "must_be_array")
    normalized: list[dict[str, Any]] = []
    seen: set[str] = set()
    for poi in pois:
        poi_id = str(poi.get("poiId") or "")
        location = poi.get("location") or {}
        if not poi_id or poi_id in seen:
            raise InvalidProviderParameterError("pois.poiId", "missing_or_duplicate")
        try:
            lon, lat = float(location["lon"]), float(location["lat"])
        except (KeyError, TypeError, ValueError) as exc:
            raise InvalidProviderParameterError("pois.location", "invalid") from exc
        if not (-180 <= lon <= 180 and -90 <= lat <= 90):
            raise InvalidProviderParameterError("pois.location", "out_of_wgs84_bounds")
        seen.add(poi_id)
        normalized.append({"poiId": poi_id, "location": {"lon": lon, "lat": lat}})
    normalized.sort(key=lambda item: item["poiId"])
    batch_size = min(MATRIX_BATCH_DESTINATIONS, MATRIX_MAX_ROUTES_PER_REQUEST)
    batches = []
    for index in range(0, len(normalized), batch_size):
        members = normalized[index:index + batch_size]
        identity = {
            "version": MATRIX_BATCH_VERSION,
            "profile": profile,
            "center": center,
            "poiIds": [item["poiId"] for item in members],
            "coordinates": [[item["location"]["lon"], item["location"]["lat"]] for item in members],
        }
        fingerprint = _hash(identity)
        batches.append({
            "batchId": f"matrix-batch-{fingerprint[:24]}",
            "batchFingerprint": fingerprint,
            "profile": profile,
            "index": len(batches),
            "poiIds": identity["poiIds"],
            "coordinateHash": _hash(identity["coordinates"]),
            "destinationCount": len(members),
            "status": "planned",
            "attemptCount": 0,
            "cacheHit": False,
            "requestBody": {
                "locations": [[center["lon"], center["lat"]], *identity["coordinates"]],
                "sources": ["0"],
                "destinations": [str(value) for value in range(1, len(members) + 1)],
                "metrics": ["duration", "distance"],
                "units": "m",
                "resolve_locations": True,
            },
        })
    minimum = len(batches)
    approved = minimum if approved_requests is None else int(approved_requests)
    return {
        "profile": profile,
        "destinationCount": len(normalized),
        "sourceCount": 1,
        "batchSize": batch_size,
        "batchCount": minimum,
        "minimumMatrixRequests": minimum,
        "approvedMatrixRequests": approved,
        "budgetStatus": "within-budget" if approved >= minimum else "approval-required",
        "maxRoutesPerRequest": MATRIX_MAX_ROUTES_PER_REQUEST,
        "concurrency": MATRIX_CONCURRENCY,
        "batches": batches,
        "planFingerprint": _hash({
            "version": MATRIX_BATCH_VERSION, "profile": profile, "center": center,
            "batches": [batch["batchFingerprint"] for batch in batches],
        }),
        "upstreamRequestCount": 0,
    }


def parse_matrix_batch_result(batch: dict[str, Any], payload: dict[str, Any]) -> list[dict[str, Any]]:
    expected = int(batch["destinationCount"])
    durations = payload.get("durations")
    distances = payload.get("distances")
    if not isinstance(durations, list) or len(durations) != 1 or not isinstance(durations[0], list) or len(durations[0]) != expected:
        raise InvalidProviderParameterError("matrix.durations", "dimension_mismatch")
    if not isinstance(distances, list) or len(distances) != 1 or not isinstance(distances[0], list) or len(distances[0]) != expected:
        raise InvalidProviderParameterError("matrix.distances", "dimension_mismatch")
    result = []
    for poi_id, raw_duration, raw_distance in zip(batch["poiIds"], durations[0], distances[0]):
        if raw_duration is None or raw_distance is None:
            status, duration, distance = "unreachable", None, None
        elif any(isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(float(value)) or float(value) < 0 for value in (raw_duration, raw_distance)):
            status, duration, distance = "invalid", None, None
        else:
            status, duration, distance = "ok", float(raw_duration), float(raw_distance)
        band = None
        if status == "ok":
            band = "ring-0-10" if duration <= 600 else "ring-10-20" if duration <= 1200 else "ring-20-30" if duration <= 1800 else "matrix-out-of-range"
        result.append({
            "poiId": poi_id, "matrixStatus": status, "travelTimeSeconds": duration,
            "networkDistanceMeters": distance, "matrixBandId": band,
            "matrixBatchId": batch["batchId"], "profile": batch["profile"],
        })
    return result


def merge_matrix_batches(profile: str, plan: dict[str, Any], results_by_batch: dict[str, list[dict[str, Any]]]) -> dict[str, Any]:
    validate_profile(profile)
    if plan.get("profile") != profile:
        raise InvalidProviderParameterError("matrix.profile", "cross_profile_plan")
    merged = []
    for batch in plan["batches"]:
        if batch.get("status") not in {"completed", "cache-hit"}:
            return {"publishable": False, "reason": "partial_matrix_batches", "accessibility": []}
        values = results_by_batch.get(batch["batchId"])
        if not isinstance(values, list) or [item.get("poiId") for item in values] != batch["poiIds"]:
            return {"publishable": False, "reason": "batch_result_order_mismatch", "accessibility": []}
        if any(item.get("profile") != profile for item in values):
            return {"publishable": False, "reason": "cross_profile_accessibility", "accessibility": []}
        merged.extend(values)
    merged.sort(key=lambda item: item["poiId"])
    counts = Counter(item["matrixStatus"] for item in merged)
    ring_counts = Counter(item["matrixBandId"] for item in merged if item["matrixBandId"] and item["matrixBandId"] != "matrix-out-of-range")
    out_of_range = sum(item["matrixBandId"] == "matrix-out-of-range" for item in merged)
    conserved = len(merged) == counts["ok"] + counts["unreachable"] + counts["invalid"]
    return {
        "publishable": conserved,
        "profile": profile,
        "accessibility": merged,
        "summary": {
            "destinationCount": len(merged), "matrixOkCount": counts["ok"],
            "matrixUnreachableCount": counts["unreachable"], "matrixInvalidCount": counts["invalid"],
            "matrixOutOfRangeCount": out_of_range, "ringCounts": dict(sorted(ring_counts.items())),
            "countConserved": conserved,
        },
    }


def retry_decision(http_status: int, attempt_count: int, requests_used: int, approved_requests: int, cancelled: bool = False) -> dict[str, Any]:
    if cancelled or requests_used >= approved_requests:
        return {"retry": False, "reason": "cancelled_or_budget_exhausted"}
    retryable = http_status == 429 or http_status in {502, 503, 504}
    if not retryable or attempt_count >= 1:
        return {"retry": False, "reason": "non_retryable_or_retry_limit"}
    return {"retry": True, "reason": "rate_limited" if http_status == 429 else "temporary_upstream", "nextAttemptConsumesBudget": True}


def prepare_all_profiles(profile_inputs: dict[str, dict[str, Any]]) -> dict[str, Any]:
    profiles = []
    for profile in PROFILE_ORDER:
        source = profile_inputs.get(profile) or {}
        if source.get("status") == "N/A" or not source.get("outerGeometryAvailable", False):
            profiles.append({
                "profile": profile, "label": PROFILE_LABELS[profile], "status": "N/A",
                "reason": source.get("reason", "missing-cache-no-network"),
                "poiRequests": 0, "matrixRequests": 0, "executable": False,
            })
            continue
        minimum = int(source.get("minimumPoiRequests", 0))
        reserve = int(source.get("adaptiveReserve", 0))
        upper = minimum + reserve
        approval_required = source.get("budgetStatus") == "approval-required" or not source.get("approved", False)
        profiles.append({
            "profile": profile, "label": PROFILE_LABELS[profile],
            "status": "awaiting-approval" if approval_required else "planned",
            "poiRequests": minimum, "poiRequestUpperBound": upper,
            "matrixRequests": int(source.get("minimumMatrixRequests", 0)),
            "executable": False,
            "planFingerprint": source.get("planFingerprint"),
        })
    return {
        "mode": "prepare-only", "profileOrder": list(PROFILE_ORDER), "profiles": profiles,
        "totals": {
            "poiMinimumRequests": sum(item["poiRequests"] for item in profiles),
            "matrixMinimumRequests": sum(item["matrixRequests"] for item in profiles),
        },
        "approved": False, "executed": False, "upstreamRequestCount": 0,
        "fingerprint": _hash({"version": ORCHESTRATOR_VERSION, "profiles": profiles}),
    }


class MultimodeJobStore:
    """Atomic, profile-isolated manifests and published results."""

    def __init__(self, directory: str | Path) -> None:
        self.directory = Path(directory)

    def _path(self, name: str) -> Path:
        return self.directory / f"{name}.json"

    def _write(self, path: Path, payload: dict[str, Any]) -> None:
        self.directory.mkdir(parents=True, exist_ok=True)
        fd, temporary = tempfile.mkstemp(prefix=f".{path.stem}.", suffix=".tmp", dir=self.directory)
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as handle:
                json.dump(payload, handle, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(temporary, path)
        finally:
            try:
                os.unlink(temporary)
            except FileNotFoundError:
                pass

    def create(self, profile: str, fingerprint: str) -> dict[str, Any]:
        validate_profile(profile)
        job_id = f"multimode-{profile}-{fingerprint[:20]}"
        manifest = {
            "jobId": job_id, "profile": profile, "fingerprint": fingerprint,
            "status": "draft", "updatedAt": _now(), "progress": {},
            "poiPieces": [], "matrixBatches": [], "published": False,
            "upstreamRequestCount": 0,
        }
        self._write(self._path(f"job-{profile}"), manifest)
        return manifest

    def current(self, profile: str) -> dict[str, Any] | None:
        validate_profile(profile)
        try:
            return json.loads(self._path(f"job-{profile}").read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return None

    def transition(self, profile: str, job_id: str, status: str, progress: dict[str, Any] | None = None) -> dict[str, Any] | None:
        manifest = self.current(profile)
        if not manifest or manifest["jobId"] != job_id:
            return None
        current_status = manifest["status"]
        if status not in JOB_TRANSITIONS.get(current_status, set()):
            raise InvalidProviderParameterError("job.status", f"illegal_transition_{current_status}_to_{status}")
        manifest["status"] = status
        manifest["updatedAt"] = _now()
        manifest["progress"] = dict(progress or manifest.get("progress") or {})
        self._write(self._path(f"job-{profile}"), manifest)
        return manifest

    def checkpoint(self, profile: str, job_id: str, collection: str, item: dict[str, Any]) -> dict[str, Any] | None:
        if collection not in {"poiPieces", "matrixBatches"}:
            raise InvalidProviderParameterError("checkpoint.collection", "unsupported")
        manifest = self.current(profile)
        if not manifest or manifest["jobId"] != job_id:
            return None
        key = "pieceId" if collection == "poiPieces" else "batchId"
        values = list(manifest.get(collection) or [])
        index = next((position for position, value in enumerate(values) if value.get(key) == item.get(key)), None)
        if index is None:
            values.append(item)
        else:
            values[index] = item
        manifest[collection] = values
        manifest["updatedAt"] = _now()
        self._write(self._path(f"job-{profile}"), manifest)
        return manifest

    def recover(self, profile: str) -> dict[str, Any] | None:
        manifest = self.current(profile)
        if not manifest:
            return None
        for collection in ("poiPieces", "matrixBatches"):
            for item in manifest.get(collection, []):
                if item.get("status") == "running":
                    item["status"] = "pending"
        if manifest["status"] not in TERMINAL_STATES and manifest["status"] != "awaiting-approval":
            manifest["status"] = "partial"
        manifest["updatedAt"] = _now()
        self._write(self._path(f"job-{profile}"), manifest)
        return manifest

    def publish(self, profile: str, job_id: str, result: dict[str, Any]) -> bool:
        manifest = self.current(profile)
        valid = (
            manifest is not None and manifest["jobId"] == job_id
            and manifest["status"] == "layout-ready"
            and result.get("profile") == profile and result.get("status") == "completed"
            and result.get("poiQueryPlan", {}).get("fullyCovered") is True
            and result.get("summary", {}).get("countConserved") is True
        )
        if not valid:
            return False
        self._write(self._path(f"result-{profile}"), result)
        manifest["published"] = True
        manifest["status"] = "completed"
        manifest["updatedAt"] = _now()
        self._write(self._path(f"job-{profile}"), manifest)
        return True

    def result(self, profile: str) -> dict[str, Any] | None:
        validate_profile(profile)
        try:
            return json.loads(self._path(f"result-{profile}").read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return None


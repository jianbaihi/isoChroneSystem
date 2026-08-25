from __future__ import annotations

import hashlib
import json
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def canonical_cache_key(endpoint_type: str, endpoint: str, body: dict[str, Any]) -> str:
    value = json.dumps(
        {"endpointType": endpoint_type, "endpoint": endpoint, "body": body},
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    return hashlib.sha256(value).hexdigest()


class JsonResponseCache:
    """Small file cache whose contents never include request headers or credentials."""

    def __init__(self, directory: str | Path) -> None:
        self.directory = Path(directory).expanduser()

    def _path(self, key: str) -> Path:
        return self.directory / f"{key}.json"

    def read(
        self,
        endpoint_type: str,
        endpoint: str,
        body: dict[str, Any],
        ttl_seconds: int,
        allow_stale: bool = False,
    ) -> tuple[Any, dict[str, Any], bool] | None:
        path = self._path(canonical_cache_key(endpoint_type, endpoint, body))
        try:
            record = json.loads(path.read_text(encoding="utf-8"))
            retrieved_at = float(record["retrievedAtEpoch"])
            payload = record["payload"]
            metadata = record.get("metadata") if isinstance(record.get("metadata"), dict) else {}
        except (OSError, ValueError, KeyError, TypeError):
            return None
        stale = ttl_seconds > 0 and (datetime.now(timezone.utc).timestamp() - retrieved_at) > ttl_seconds
        if stale and not allow_stale:
            return None
        return payload, metadata, stale

    def write(
        self,
        endpoint_type: str,
        endpoint: str,
        body: dict[str, Any],
        payload: Any,
        metadata: dict[str, Any] | None = None,
    ) -> None:
        self.directory.mkdir(parents=True, exist_ok=True)
        key = canonical_cache_key(endpoint_type, endpoint, body)
        record = {
            "endpointType": endpoint_type,
            "endpoint": endpoint,
            "request": body,
            "payload": payload,
            "retrievedAt": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
            "retrievedAtEpoch": datetime.now(timezone.utc).timestamp(),
            "metadata": metadata or {},
        }
        fd, temporary = tempfile.mkstemp(prefix=f".{key}.", suffix=".tmp", dir=self.directory)
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as handle:
                json.dump(record, handle, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(temporary, self._path(key))
        finally:
            try:
                os.unlink(temporary)
            except FileNotFoundError:
                pass

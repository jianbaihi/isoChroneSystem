from __future__ import annotations

import hashlib
import json
from pathlib import Path


class AmapQueryCache:
    def __init__(self, root: str | Path | None):
        self.root = Path(root) / "amap-query-v1" if root else None

    def _path(self, identity: dict) -> Path | None:
        if self.root is None:
            return None
        digest = hashlib.sha256(json.dumps(identity, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
        return self.root / f"{digest}.json"

    def read(self, identity: dict):
        path = self._path(identity)
        if path is None or not path.exists():
            return None
        return json.loads(path.read_text(encoding="utf-8"))

    def write(self, identity: dict, payload: dict) -> None:
        path = self._path(identity)
        if path is None:
            return
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

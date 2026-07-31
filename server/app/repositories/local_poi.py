from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Any, Iterable

from app.errors import PoiCandidateLimitError, PoiDatasetNotReadyError


SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS poi_dataset (
  dataset_id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  source_release TEXT NOT NULL,
  region_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  country_code TEXT NOT NULL,
  crs TEXT NOT NULL,
  min_lon REAL NOT NULL,
  min_lat REAL NOT NULL,
  max_lon REAL NOT NULL,
  max_lat REAL NOT NULL,
  default_lon REAL NOT NULL,
  default_lat REAL NOT NULL,
  default_label TEXT NOT NULL,
  raw_read_count INTEGER NOT NULL,
  eligible_record_count INTEGER NOT NULL,
  source_sha256 TEXT NOT NULL,
  license_summary TEXT NOT NULL,
  attribution TEXT NOT NULL,
  imported_at TEXT NOT NULL,
  taxonomy_valid_rate REAL NOT NULL,
  basic_category_present_rate REAL NOT NULL,
  ready INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS category_node (
  category_id TEXT PRIMARY KEY,
  parent_category_id TEXT,
  depth INTEGER NOT NULL,
  top_level_id TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS dataset_category_stats (
  dataset_id TEXT NOT NULL REFERENCES poi_dataset(dataset_id) ON DELETE CASCADE,
  category_id TEXT NOT NULL REFERENCES category_node(category_id),
  eligible_count INTEGER NOT NULL,
  PRIMARY KEY (dataset_id, category_id)
);
CREATE TABLE IF NOT EXISTS poi (
  row_id INTEGER PRIMARY KEY,
  poi_id TEXT NOT NULL,
  dataset_id TEXT NOT NULL REFERENCES poi_dataset(dataset_id) ON DELETE CASCADE,
  source_poi_id TEXT NOT NULL,
  source_feature_version INTEGER,
  name TEXT NOT NULL,
  name_locale TEXT,
  lon REAL NOT NULL,
  lat REAL NOT NULL,
  top_level_category_id TEXT NOT NULL,
  basic_category_id TEXT,
  primary_category_id TEXT NOT NULL,
  confidence REAL,
  operating_status TEXT,
  address TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  UNIQUE(dataset_id, poi_id)
);
CREATE TABLE IF NOT EXISTS poi_primary_path (
  poi_row_id INTEGER NOT NULL REFERENCES poi(row_id) ON DELETE CASCADE,
  category_id TEXT NOT NULL REFERENCES category_node(category_id),
  depth INTEGER NOT NULL,
  is_basic INTEGER NOT NULL DEFAULT 0,
  is_primary INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (poi_row_id, depth)
);
CREATE TABLE IF NOT EXISTS poi_alternate_category (
  poi_row_id INTEGER NOT NULL REFERENCES poi(row_id) ON DELETE CASCADE,
  category_id TEXT NOT NULL,
  PRIMARY KEY (poi_row_id, category_id)
);
CREATE VIRTUAL TABLE IF NOT EXISTS poi_rtree USING rtree(row_id, min_lon, max_lon, min_lat, max_lat);
CREATE INDEX IF NOT EXISTS idx_poi_dataset_active ON poi(dataset_id, is_active);
CREATE INDEX IF NOT EXISTS idx_primary_path_category ON poi_primary_path(category_id, poi_row_id);
"""


class LocalPoiRepository:
    def __init__(self, database_path: str | Path, read_only: bool = False) -> None:
        self.database_path = Path(database_path).expanduser()
        self.read_only = read_only
        self.connection: sqlite3.Connection | None = None

    def connect(self) -> sqlite3.Connection:
        if self.connection is not None:
            return self.connection
        if self.read_only:
            if not self.database_path.exists():
                raise PoiDatasetNotReadyError()
            uri = f"file:{self.database_path.resolve().as_posix()}?mode=ro"
            connection = sqlite3.connect(uri, uri=True)
        else:
            self.database_path.parent.mkdir(parents=True, exist_ok=True)
            connection = sqlite3.connect(self.database_path)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        self.connection = connection
        return connection

    def initialize(self) -> None:
        if self.read_only:
            raise RuntimeError("只读 POI Repository 不能初始化 schema。")
        connection = self.connect()
        connection.executescript(SCHEMA_SQL)
        connection.commit()

    def close(self) -> None:
        if self.connection is not None:
            self.connection.close()
            self.connection = None

    def __enter__(self) -> "LocalPoiRepository":
        return self

    def __exit__(self, *_: object) -> None:
        self.close()

    def list_ready_datasets(self) -> list[dict[str, Any]]:
        try:
            rows = self.connect().execute(
                "SELECT * FROM poi_dataset WHERE ready = 1 ORDER BY source_release, region_id"
            ).fetchall()
        except sqlite3.OperationalError:
            return []
        return [self._dataset_public(dict(row)) for row in rows]

    def get_dataset(self, dataset_id: str, require_ready: bool = True) -> dict[str, Any] | None:
        try:
            row = self.connect().execute(
                "SELECT * FROM poi_dataset WHERE dataset_id = ?", (dataset_id,)
            ).fetchone()
        except sqlite3.OperationalError:
            return None
        if row is None or (require_ready and not row["ready"]):
            return None
        return dict(row)

    def category_ids(self, dataset_id: str) -> set[str]:
        try:
            rows = self.connect().execute(
                "SELECT category_id FROM dataset_category_stats WHERE dataset_id = ?",
                (dataset_id,),
            ).fetchall()
        except sqlite3.OperationalError:
            return set()
        return {str(row[0]) for row in rows}

    def replace_dataset(
        self,
        dataset: dict[str, Any],
        category_nodes: Iterable[dict[str, Any]],
        category_stats: dict[str, int],
        records: Iterable[dict[str, Any]],
    ) -> int:
        if self.read_only:
            raise RuntimeError("只读 POI Repository 不能写入。")
        connection = self.connect()
        self.initialize()
        inserted = 0
        with connection:
            existing = connection.execute(
                "SELECT row_id FROM poi WHERE dataset_id = ?", (dataset["dataset_id"],)
            ).fetchall()
            if existing:
                connection.execute(
                    "DELETE FROM poi_rtree WHERE row_id IN (SELECT row_id FROM poi WHERE dataset_id = ?)",
                    (dataset["dataset_id"],),
                )
                connection.execute("DELETE FROM poi WHERE dataset_id = ?", (dataset["dataset_id"],))
            connection.execute("DELETE FROM dataset_category_stats WHERE dataset_id = ?", (dataset["dataset_id"],))
            connection.execute("DELETE FROM poi_dataset WHERE dataset_id = ?", (dataset["dataset_id"],))

            for node in category_nodes:
                existing_node = connection.execute(
                    "SELECT parent_category_id, depth, top_level_id FROM category_node WHERE category_id = ?",
                    (node["category_id"],),
                ).fetchone()
                if existing_node:
                    if tuple(existing_node) != (node.get("parent_category_id"), node["depth"], node["top_level_id"]):
                        raise ValueError(f"taxonomy 父级冲突: {node['category_id']}")
                else:
                    connection.execute(
                        "INSERT INTO category_node(category_id, parent_category_id, depth, top_level_id) VALUES (?, ?, ?, ?)",
                        (node["category_id"], node.get("parent_category_id"), node["depth"], node["top_level_id"]),
                    )
            connection.execute(
                """INSERT INTO poi_dataset(
                  dataset_id, source, source_release, region_id, display_name, country_code, crs,
                  min_lon, min_lat, max_lon, max_lat, default_lon, default_lat, default_label,
                  raw_read_count, eligible_record_count, source_sha256, license_summary, attribution,
                  imported_at, taxonomy_valid_rate, basic_category_present_rate, ready
                ) VALUES (:dataset_id, :source, :source_release, :region_id, :display_name, :country_code, :crs,
                  :min_lon, :min_lat, :max_lon, :max_lat, :default_lon, :default_lat, :default_label,
                  :raw_read_count, :eligible_record_count, :source_sha256, :license_summary, :attribution,
                  :imported_at, :taxonomy_valid_rate, :basic_category_present_rate, :ready)""",
                dataset,
            )
            for category_id, count in category_stats.items():
                connection.execute(
                    "INSERT INTO dataset_category_stats(dataset_id, category_id, eligible_count) VALUES (?, ?, ?)",
                    (dataset["dataset_id"], category_id, count),
                )
            for record in records:
                cursor = connection.execute(
                    """INSERT INTO poi(
                      poi_id, dataset_id, source_poi_id, source_feature_version, name, name_locale,
                      lon, lat, top_level_category_id, basic_category_id, primary_category_id,
                      confidence, operating_status, address, is_active
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (
                        record["poi_id"], dataset["dataset_id"], record["source_poi_id"], record.get("source_feature_version"),
                        record["name"], record.get("name_locale"), record["lon"], record["lat"],
                        record["top_level_category_id"], record.get("basic_category_id"), record["primary_category_id"],
                        record.get("confidence"), record.get("operating_status"), record.get("address"), int(record.get("is_active", 1)),
                    ),
                )
                row_id = int(cursor.lastrowid)
                connection.execute(
                    "INSERT INTO poi_rtree(row_id, min_lon, max_lon, min_lat, max_lat) VALUES (?, ?, ?, ?, ?)",
                    (row_id, record["lon"], record["lon"], record["lat"], record["lat"]),
                )
                for path_item in record["primary_path"]:
                    connection.execute(
                        "INSERT INTO poi_primary_path(poi_row_id, category_id, depth, is_basic, is_primary) VALUES (?, ?, ?, ?, ?)",
                        (row_id, path_item["category_id"], path_item["depth"], int(path_item["is_basic"]), int(path_item["is_primary"])),
                    )
                for alternate in record["alternates"]:
                    connection.execute(
                        "INSERT INTO poi_alternate_category(poi_row_id, category_id) VALUES (?, ?)", (row_id, alternate)
                    )
                inserted += 1
        return inserted

    def query_candidates(self, dataset_id: str, bbox: tuple[float, float, float, float], limit: int) -> list[dict[str, Any]]:
        dataset = self.get_dataset(dataset_id)
        if not dataset:
            raise PoiDatasetNotReadyError(dataset_id)
        west, south, east, north = bbox
        connection = self.connect()
        try:
            count = connection.execute(
                """SELECT COUNT(*) FROM poi p JOIN poi_rtree r ON r.row_id = p.row_id
                   WHERE p.dataset_id = ? AND p.is_active = 1
                     AND r.max_lon >= ? AND r.min_lon <= ? AND r.max_lat >= ? AND r.min_lat <= ?""",
                (dataset_id, west, east, south, north),
            ).fetchone()[0]
            if count > limit:
                raise PoiCandidateLimitError(limit)
            rows = connection.execute(
                """SELECT p.*
                   FROM poi p JOIN poi_rtree r ON r.row_id = p.row_id
                   WHERE p.dataset_id = ? AND p.is_active = 1
                     AND r.max_lon >= ? AND r.min_lon <= ? AND r.max_lat >= ? AND r.min_lat <= ?
                   ORDER BY p.poi_id""",
                (dataset_id, west, east, south, north),
            ).fetchall()
        except sqlite3.OperationalError as exc:
            raise PoiDatasetNotReadyError(dataset_id) from exc
        result = []
        for row in rows:
            item = dict(row)
            path_rows = connection.execute(
                "SELECT category_id FROM poi_primary_path WHERE poi_row_id = ? ORDER BY depth",
                (row["row_id"],),
            ).fetchall()
            item["hierarchy"] = [str(path_row[0]) for path_row in path_rows]
            alternate_rows = connection.execute(
                "SELECT category_id FROM poi_alternate_category WHERE poi_row_id = ? ORDER BY category_id",
                (row["row_id"],),
            ).fetchall()
            item["alternates"] = [str(alternate[0]) for alternate in alternate_rows]
            result.append(item)
        return result

    @staticmethod
    def _dataset_public(dataset: dict[str, Any]) -> dict[str, Any]:
        return {
            "datasetId": dataset["dataset_id"],
            "source": dataset["source"],
            "sourceRelease": dataset["source_release"],
            "regionId": dataset["region_id"],
            "displayName": dataset["display_name"],
            "bbox": [dataset["min_lon"], dataset["min_lat"], dataset["max_lon"], dataset["max_lat"]],
            "defaultCenter": {"lon": dataset["default_lon"], "lat": dataset["default_lat"], "label": dataset["default_label"]},
            "recordCount": dataset["eligible_record_count"],
            "taxonomyValidRate": dataset["taxonomy_valid_rate"],
            "basicCategoryPresentRate": dataset["basic_category_present_rate"],
            "attribution": dataset["attribution"],
            "ready": bool(dataset["ready"]),
        }

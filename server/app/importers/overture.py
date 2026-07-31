from __future__ import annotations

import hashlib
import json
import math
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

from app.repositories.local_poi import LocalPoiRepository


FIXED_RELEASE = "2026-07-22.0"
DEFAULT_MIN_TAXONOMY_VALID_RATE = 0.80


class ImportValidationError(ValueError):
    pass


def _as_float(value: Any) -> float | None:
    try:
        result = float(value)
    except (TypeError, ValueError):
        return None
    return result if math.isfinite(result) else None


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_json(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ImportValidationError(f"无法读取 manifest: {path.name}") from exc
    if not isinstance(value, dict):
        raise ImportValidationError(f"manifest 必须是 JSON 对象: {path.name}")
    return value


def validate_release_manifest(manifest: dict[str, Any]) -> None:
    if manifest.get("source") != "overture" or manifest.get("theme") != "places" or manifest.get("type") != "place":
        raise ImportValidationError("release manifest 必须是 overture places place。")
    if manifest.get("sourceRelease") != FIXED_RELEASE:
        raise ImportValidationError(f"sourceRelease 必须固定为 {FIXED_RELEASE}。")
    required = {"taxonomy.hierarchy", "taxonomy.primary", "taxonomy.alternates", "basic_category"}
    if not required.issubset(set(manifest.get("schemaFields", []))):
        raise ImportValidationError("release manifest 缺少 OPC taxonomy 字段声明。")


def validate_region_manifest(region: dict[str, Any], release: dict[str, Any]) -> tuple[float, float, float, float]:
    if region.get("source") != "overture" or region.get("sourceRelease") != release.get("sourceRelease"):
        raise ImportValidationError("区域 manifest 必须使用与 release manifest 完全相同的 Overture release。")
    if region.get("crs") != "EPSG:4326":
        raise ImportValidationError("区域 manifest crs 必须是 EPSG:4326。")
    bbox = region.get("bbox")
    if not isinstance(bbox, list) or len(bbox) != 4:
        raise ImportValidationError("bbox 必须是 [west, south, east, north]。")
    values = tuple(_as_float(item) for item in bbox)
    if any(item is None for item in values):
        raise ImportValidationError("bbox 必须全部是有限数字。")
    west, south, east, north = values  # type: ignore[misc]
    if not (-180 <= west < east <= 180 and -90 <= south < north <= 90):
        raise ImportValidationError("bbox 顺序或 WGS84 范围无效。")
    center = region.get("defaultCenter") or {}
    lon, lat = _as_float(center.get("lon")), _as_float(center.get("lat"))
    if lon is None or lat is None or not (west <= lon <= east and south <= lat <= north):
        raise ImportValidationError("defaultCenter 必须是 bbox 内的 WGS84 坐标。")
    if not region.get("datasetId") or not region.get("regionId") or not region.get("sourceFile"):
        raise ImportValidationError("区域 manifest 缺少 datasetId、regionId 或 sourceFile。")
    return west, south, east, north


def _iter_json_features(path: Path) -> Iterable[dict[str, Any]]:
    if path.suffix.lower() in {".jsonl", ".geojsonl"}:
        with path.open(encoding="utf-8") as stream:
            for line in stream:
                if line.strip():
                    value = json.loads(line)
                    if isinstance(value, dict):
                        yield value
        return
    value = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(value, dict) and value.get("type") == "FeatureCollection":
        yield from (feature for feature in value.get("features", []) if isinstance(feature, dict))
    elif isinstance(value, list):
        yield from (feature for feature in value if isinstance(feature, dict))
    elif isinstance(value, dict):
        yield value


def _iter_parquet_features(path: Path) -> Iterable[dict[str, Any]]:
    try:
        import pyarrow.parquet as parquet  # type: ignore
    except ImportError as exc:
        raise ImportValidationError("GeoParquet 导入需要运行环境提供 pyarrow；未下载或提交数据文件。") from exc
    table = parquet.read_table(path)
    for row in table.to_pylist():
        if not isinstance(row, dict):
            continue
        properties = dict(row)
        geometry = properties.pop("geometry", None)
        if isinstance(geometry, (bytes, bytearray, memoryview)):
            try:
                from shapely import wkb
                from shapely.geometry import mapping
                geometry = mapping(wkb.loads(bytes(geometry)))
            except (ImportError, ValueError, TypeError):
                geometry = None
        elif hasattr(geometry, "__geo_interface__"):
            geometry = dict(geometry.__geo_interface__)
        feature_id = properties.pop("id", None)
        yield {"type": "Feature", "id": feature_id, "geometry": geometry, "properties": properties}


def iter_source_features(path: Path) -> Iterable[dict[str, Any]]:
    if not path.exists() or not path.is_file():
        raise ImportValidationError("sourceFile 不存在；真实数据文件尚未准备。")
    if path.suffix.lower() in {".parquet", ".geoparquet"}:
        yield from _iter_parquet_features(path)
    else:
        yield from _iter_json_features(path)


def _property(feature: dict[str, Any], key: str) -> Any:
    properties = feature.get("properties")
    if isinstance(properties, dict) and key in properties:
        return properties[key]
    return feature.get(key)


def _name_candidates(names: Any) -> list[tuple[str, str | None, bool]]:
    candidates: list[tuple[str, str | None, bool]] = []

    def add(value: Any, locale: Any, primary: bool) -> None:
        if isinstance(value, dict):
            locale = value.get("language") or value.get("locale") or locale
            value = value.get("value") or value.get("name")
        if isinstance(value, str) and value.strip():
            candidates.append((value.strip(), str(locale) if locale else None, primary))

    if isinstance(names, dict):
        add(names.get("primary"), None, True)
        common = names.get("common")
        if isinstance(common, list):
            for item in common:
                add(item, None, False)
        for rule in names.get("rules", []) if isinstance(names.get("rules"), list) else []:
            if isinstance(rule, dict):
                add(rule.get("value") or rule.get("name"), rule.get("language"), False)
    else:
        add(names, None, True)
    return candidates


def choose_name(names: Any, preferred_locales: list[str]) -> tuple[str | None, str | None]:
    candidates = _name_candidates(names)
    normalized_locales = [locale.lower().replace("_", "-") for locale in preferred_locales]
    for preferred in normalized_locales:
        for value, locale, _ in candidates:
            if locale and locale.lower().replace("_", "-").startswith(preferred):
                return value, locale
    for value, locale, primary in candidates:
        if primary:
            return value, locale
    return (candidates[0][0], candidates[0][1]) if candidates else (None, None)


def _address(value: Any) -> str | None:
    if isinstance(value, list) and value:
        value = value[0]
    if isinstance(value, str) and value.strip():
        return value.strip()
    if isinstance(value, dict):
        for key in ("freeform", "value", "locality", "street", "postcode"):
            item = value.get(key)
            if isinstance(item, str) and item.strip():
                return item.strip()
    return None


def _taxonomy(properties: dict[str, Any]) -> tuple[list[str], str, list[str], str | None] | None:
    taxonomy = properties.get("taxonomy")
    if not isinstance(taxonomy, dict):
        return None
    hierarchy = taxonomy.get("hierarchy")
    primary = taxonomy.get("primary")
    alternates = taxonomy.get("alternates", [])
    basic = properties.get("basic_category")
    if not isinstance(hierarchy, list) or not hierarchy or any(not isinstance(item, str) or not item.strip() for item in hierarchy):
        return None
    hierarchy = [item.strip() for item in hierarchy]
    if len(set(hierarchy)) != len(hierarchy) or not isinstance(primary, str) or primary != hierarchy[-1]:
        return None
    if not isinstance(alternates, list):
        return None
    alternate_ids = sorted({str(item).strip() for item in alternates if isinstance(item, str) and item.strip()})
    if set(alternate_ids) & set(hierarchy):
        return None
    return hierarchy, primary, alternate_ids, str(basic).strip() if isinstance(basic, str) and basic.strip() else None


def _quality_config(region: dict[str, Any]) -> tuple[float | None, bool, bool, float]:
    eligibility = region.get("eligibility") or {}
    min_confidence = _as_float(eligibility.get("minConfidence"))
    if min_confidence is not None and not 0 <= min_confidence <= 1:
        raise ImportValidationError("eligibility.minConfidence 必须为空或 0 至 1。")
    return (
        min_confidence,
        bool(eligibility.get("allowMissingConfidence", True)),
        bool(eligibility.get("excludePermanentlyClosed", True)),
        float((region.get("quality") or {}).get("minTaxonomyValidRate", DEFAULT_MIN_TAXONOMY_VALID_RATE)),
    )


def prepare_import(release_manifest_path: str | Path, region_manifest_path: str | Path) -> tuple[dict[str, Any], list[dict[str, Any]], list[dict[str, Any]], dict[str, int]]:
    release_path = Path(release_manifest_path).expanduser().resolve()
    region_path = Path(region_manifest_path).expanduser().resolve()
    release = load_json(release_path)
    region = load_json(region_path)
    validate_release_manifest(release)
    bbox = validate_region_manifest(region, release)
    source_path = Path(str(region["sourceFile"]))
    if not source_path.is_absolute():
        source_path = (region_path.parents[1] / source_path).resolve()
    source_hash = sha256_file(source_path)
    declared_hash = str(region.get("sha256", "")).strip()
    if declared_hash and declared_hash not in {source_hash, "导入前计算", "待导入前计算"}:
        raise ImportValidationError("region manifest 的 sha256 与 sourceFile 不一致。")

    min_confidence, allow_missing_confidence, exclude_closed, min_taxonomy_rate = _quality_config(region)
    report: dict[str, Any] = {
        "datasetId": region["datasetId"], "sourceRelease": FIXED_RELEASE, "sourceSha256": source_hash,
        "readCount": 0, "eligibleCount": 0, "insertedCount": 0, "noOp": False,
        "skippedInvalidGeometryCount": 0, "skippedOutsideBboxCount": 0, "skippedEmptyNameCount": 0,
        "skippedInvalidTaxonomyCount": 0, "skippedClosedCount": 0, "skippedConfidenceCount": 0,
        "missingBasicCategoryCount": 0, "basicCategoryOutsideHierarchyCount": 0,
        "alternateCategoryCount": 0, "topLevelCategoryCount": 0, "RTreeRowCount": 0,
        "exactDuplicateIdCount": 0, "suspectedSpatialDuplicateCount": 0,
        "confidenceMissingCount": 0, "taxonomyValidCount": 0, "namePresentCount": 0,
        "languageNameCount": 0, "languageNameRate": 0.0, "elapsed": None,
    }
    records: list[dict[str, Any]] = []
    category_nodes: dict[str, dict[str, Any]] = {}
    category_stats: Counter[str] = Counter()
    seen_ids: set[str] = set()
    preferred_locales = [str(item) for item in region.get("preferredLocales", [])]

    for feature in iter_source_features(source_path):
        report["readCount"] += 1
        properties = feature.get("properties") if isinstance(feature.get("properties"), dict) else feature
        source_id = feature.get("id") or properties.get("id") or properties.get("GERS_ID") or properties.get("gers_id")
        if not source_id:
            report["skippedInvalidGeometryCount"] += 1
            continue
        source_id = str(source_id)
        if source_id in seen_ids:
            report["exactDuplicateIdCount"] += 1
            continue
        seen_ids.add(source_id)
        geometry = feature.get("geometry") or properties.get("geometry")
        if not isinstance(geometry, dict) or geometry.get("type") != "Point" or not isinstance(geometry.get("coordinates"), (list, tuple)):
            report["skippedInvalidGeometryCount"] += 1
            continue
        coords = geometry.get("coordinates")
        lon, lat = (_as_float(coords[0]) if len(coords) > 0 else None), (_as_float(coords[1]) if len(coords) > 1 else None)
        if lon is None or lat is None or not (-180 <= lon <= 180 and -90 <= lat <= 90):
            report["skippedInvalidGeometryCount"] += 1
            continue
        west, south, east, north = bbox
        if not (west <= lon <= east and south <= lat <= north):
            report["skippedOutsideBboxCount"] += 1
            continue
        name, name_locale = choose_name(properties.get("names"), preferred_locales)
        if not name:
            report["skippedEmptyNameCount"] += 1
            continue
        report["namePresentCount"] += 1
        if name_locale:
            report["languageNameCount"] += 1
        taxonomy = _taxonomy(properties)
        if taxonomy is None:
            report["skippedInvalidTaxonomyCount"] += 1
            continue
        report["taxonomyValidCount"] += 1
        hierarchy, primary, alternates, basic = taxonomy
        closed = properties.get("operating_status") == "permanently_closed"
        if closed and exclude_closed:
            report["skippedClosedCount"] += 1
            continue
        confidence = _as_float(properties.get("confidence"))
        if confidence is None:
            report["confidenceMissingCount"] += 1
            if min_confidence is not None and not allow_missing_confidence:
                report["skippedConfidenceCount"] += 1
                continue
        elif not 0 <= confidence <= 1 or (min_confidence is not None and confidence < min_confidence):
            report["skippedConfidenceCount"] += 1
            continue
        if basic is None:
            report["missingBasicCategoryCount"] += 1
        if basic and basic not in hierarchy:
            report["basicCategoryOutsideHierarchyCount"] += 1
        report["alternateCategoryCount"] += len(alternates)
        for depth, category_id in enumerate(hierarchy):
            parent_id = hierarchy[depth - 1] if depth else None
            existing = category_nodes.get(category_id)
            candidate = {"category_id": category_id, "parent_category_id": parent_id, "depth": depth, "top_level_id": hierarchy[0]}
            if existing and (existing["parent_category_id"], existing["top_level_id"]) != (parent_id, hierarchy[0]):
                raise ImportValidationError(f"taxonomy 父级冲突: {category_id}")
            category_nodes[category_id] = existing or candidate
            category_stats[category_id] += 1
        records.append({
            "poi_id": f"overture:{source_id}", "source_poi_id": source_id,
            "source_feature_version": properties.get("version") or feature.get("version"),
            "name": name, "name_locale": name_locale, "lon": lon, "lat": lat,
            "top_level_category_id": hierarchy[0], "basic_category_id": basic,
            "primary_category_id": primary, "confidence": confidence,
            "operating_status": properties.get("operating_status"), "address": _address(properties.get("addresses")),
            "is_active": 1, "primary_path": [
                {"category_id": category_id, "depth": depth, "is_basic": int(category_id == basic), "is_primary": int(category_id == primary)}
                for depth, category_id in enumerate(hierarchy)
            ], "alternates": alternates,
        })

    report["eligibleCount"] = len(records)
    report["topLevelCategoryCount"] = len({record["top_level_category_id"] for record in records})
    report["languageNameRate"] = report["languageNameCount"] / report["namePresentCount"] if report["namePresentCount"] else 0.0
    taxonomy_rate = report["taxonomyValidCount"] / report["readCount"] if report["readCount"] else 0.0
    basic_rate = (report["eligibleCount"] - report["missingBasicCategoryCount"]) / report["eligibleCount"] if report["eligibleCount"] else 0.0
    report["taxonomyValidRate"] = taxonomy_rate
    report["basicCategoryPresentRate"] = basic_rate
    report["ready"] = bool(taxonomy_rate >= min_taxonomy_rate)
    report["topLevelDistribution"] = dict(sorted(Counter(record["top_level_category_id"] for record in records).items()))
    report["basicCategoryDistribution"] = dict(sorted(Counter(record["basic_category_id"] for record in records if record["basic_category_id"]).items()))
    report["primaryCategoryDistribution"] = dict(sorted(Counter(record["primary_category_id"] for record in records).items()))

    dataset = {
        "dataset_id": region["datasetId"], "source": "overture", "source_release": FIXED_RELEASE,
        "region_id": region["regionId"], "display_name": region["displayName"], "country_code": region["countryCode"],
        "crs": "EPSG:4326", "min_lon": bbox[0], "min_lat": bbox[1], "max_lon": bbox[2], "max_lat": bbox[3],
        "default_lon": region["defaultCenter"]["lon"], "default_lat": region["defaultCenter"]["lat"],
        "default_label": region["defaultCenter"].get("label", region["displayName"]),
        "raw_read_count": report["readCount"], "eligible_record_count": report["eligibleCount"],
        "source_sha256": source_hash, "license_summary": json.dumps(release.get("licenseSummary", []), ensure_ascii=False),
        "attribution": region.get("attribution", release.get("attribution", "Overture Maps Foundation")),
        "imported_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "taxonomy_valid_rate": taxonomy_rate, "basic_category_present_rate": basic_rate, "ready": int(report["ready"]),
    }
    return dataset, list(category_nodes.values()), records, report | {"categoryStats": dict(category_stats), "releaseManifest": release, "regionManifest": region}


def import_overture_places(
    release_manifest_path: str | Path,
    region_manifest_path: str | Path,
    database_path: str | Path,
    *,
    dry_run: bool = False,
    replace: bool = False,
) -> dict[str, Any]:
    dataset, category_nodes, records, report = prepare_import(release_manifest_path, region_manifest_path)
    if not dry_run:
        with LocalPoiRepository(database_path) as repository:
            repository.initialize()
            existing = repository.get_dataset(dataset["dataset_id"], require_ready=False)
            if existing and existing["source_release"] == dataset["source_release"] and existing["source_sha256"] == dataset["source_sha256"]:
                report["noOp"] = True
            elif existing and not replace:
                raise ImportValidationError("datasetId 已存在但 SHA-256 不同；必须显式使用 --replace。")
            else:
                report["insertedCount"] = repository.replace_dataset(
                    dataset, category_nodes, report["categoryStats"], records
                )
                report["RTreeRowCount"] = report["insertedCount"]
    else:
        report["insertedCount"] = 0
    report.pop("categoryStats", None)
    report.pop("releaseManifest", None)
    report.pop("regionManifest", None)
    return report

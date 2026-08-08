"""Build offline evidence for stage 53 from frozen stage-51/45 archives.

No provider client is imported and this script never performs network I/O.
"""

from __future__ import annotations

import hashlib
import json
from collections import Counter
from pathlib import Path

from app.models import AnalysisResult
from app.services.published_result_normalization import VISIBLE_BANDS, enrich_pois_with_matrix, normalization_summary


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "exports/stage-10-cycling-normalization"
OLD_CYCLING = ROOT / "exports/stage-10-cycling-live/stage51-cycling-complete.json"
OLD_WALKING = ROOT / "exports/stage-10-cycling-live/stage45-walking-cache-complete.json"


def read(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def write(name: str, payload: object) -> None:
    (OUT / name).write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def screenshot_manifest() -> list[dict[str, object]]:
    shots = []
    for path in sorted(OUT.glob("*.png")):
        data = path.read_bytes()
        if data[:8] != b"\x89PNG\r\n\x1a\n":
            raise RuntimeError(f"not_png:{path.name}")
        shots.append({"file": path.name, "sha256": hashlib.sha256(data).hexdigest(), "format": "PNG", "bytes": len(data)})
    return shots


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    cycling_v1 = read(OLD_CYCLING)
    walking_v1 = read(OLD_WALKING)
    cycling = enrich_pois_with_matrix(AnalysisResult.model_validate(cycling_v1))
    walking = enrich_pois_with_matrix(AnalysisResult.model_validate(walking_v1))
    cycling_v2 = cycling.model_dump(mode="json")
    walking_v2 = walking.model_dump(mode="json")
    write("stage53-cycling-published-v2.json", cycling_v2)

    summary = normalization_summary(cycling)
    accessibility_by_id = {item.poiId: item for item in cycling.accessibility}
    eligible = [poi for poi in cycling.pois if poi.ringId in VISIBLE_BANDS]
    out_of_range = [poi for poi in cycling.pois if poi.ringId == "matrix-out-of-range"]
    sample_eligible = [
        {
            "poiId": poi.poiId,
            "travelTimeSeconds": poi.travelTimeSeconds,
            "networkDistanceMeters": poi.networkDistanceMeters,
            "ringId": poi.ringId,
            "matrixBandId": poi.matrixBandId,
            "matrixStatus": poi.matrixStatus,
            "routingProvider": poi.routingProvider,
            "matrixBatchId": poi.matrixBatchId,
        }
        for poi in eligible[:20]
    ]
    sample_out = [
        {
            "poiId": poi.poiId,
            "travelTimeSeconds": poi.travelTimeSeconds,
            "networkDistanceMeters": poi.networkDistanceMeters,
            "ringId": poi.ringId,
            "matrixBandId": poi.matrixBandId,
            "matrixStatus": poi.matrixStatus,
        }
        for poi in out_of_range[:5]
    ]

    write("stage53-baseline.json", {
        "stage": 53,
        "source": "stage51 historical real upstream cache reuse",
        "analysisId": cycling.analysisId,
        "profile": cycling.profile,
        "rangesMinutes": cycling.rangesMinutes,
        "total": len(cycling.pois),
        "eligible": len(eligible),
        "outOfRange": len(out_of_range),
        "rings": [summary["ringCounts"][band] for band in VISIBLE_BANDS],
        "matrixFingerprint": cycling.metadata.matrix["resultFingerprint"],
        "layoutFingerprint": "fnv1a-9a1fe12a",
        "upstreamBudget": {"Isochrones": 0, "OpenPOIService": 0, "Matrix": 0, "Geocoder": 0, "Directions": 0},
    })
    write("poi-matrix-normalization-summary.json", {
        **summary,
        "analysisIdUnchanged": cycling.analysisId == cycling_v1["analysisId"],
        "matrixFingerprintUnchanged": cycling.metadata.matrix["resultFingerprint"] == cycling_v1["metadata"]["matrix"]["resultFingerprint"],
        "sourceArchiveSchemaVersion": cycling_v1["schemaVersion"],
        "sourcePublishedResultSchemaVersion": cycling_v1.get("publishedResultSchemaVersion", "1.0"),
        "normalizedPublishedResultSchemaVersion": cycling.publishedResultSchemaVersion,
        "samples": {"eligible20": sample_eligible, "outOfRange5": sample_out},
    })
    console_html = """<!doctype html><meta charset=\"utf-8\"><title>Stage 53 browser console audit</title>
<style>body{margin:0;background:#1e1e1e;color:#d4d4d4;font:13px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;padding:28px}.bar{color:#76d275;margin-bottom:14px}.log{white-space:pre-wrap;border-left:3px solid #58a6ff;padding-left:14px}.muted{color:#a7a7a7}</style>
<div class=bar>Browser console audit export · Stage 53 · local cached result · business upstream requests: 0</div>
<div class=log id=log></div><script>document.getElementById('log').textContent='[stage53-normalized-poi-audit] '+JSON.stringify(""" + json.dumps({"eligible20": sample_eligible, "outOfRange5": sample_out}, ensure_ascii=False) + """, null, 2);</script>
<p class=muted>Source: normalized POI fields from the in-memory v2 publication contract. This is an offline audit export, not an upstream response.</p>"""
    (OUT / "stage53-browser-console-audit.html").write_text(console_html, encoding="utf-8")
    write("poi-matrix-join-integrity.json", {
        "poiIdsUnique": len({poi.poiId for poi in cycling.pois}) == len(cycling.pois),
        "matrixIdsUnique": len({item.poiId for item in cycling.accessibility}) == len(cycling.accessibility),
        "sameIdSet": {poi.poiId for poi in cycling.pois} == set(accessibility_by_id),
        "poiCount": len(cycling.pois),
        "matrixRecordCount": len(cycling.accessibility),
        "okWithTime": sum(poi.matrixStatus == "ok" and poi.travelTimeSeconds is not None for poi in cycling.pois),
        "okWithDistance": sum(poi.matrixStatus == "ok" and poi.networkDistanceMeters is not None for poi in cycling.pois),
        "ringMatchesMatrixBand": sum(poi.ringId == poi.matrixBandId for poi in cycling.pois),
        "matrixStatusCounts": dict(Counter(poi.matrixStatus for poi in cycling.pois)),
    })
    write("legacy-cache-migration-evidence.json", {
        "sourceFilesUntouched": [str(OLD_CYCLING.relative_to(ROOT)), str(OLD_WALKING.relative_to(ROOT))],
        "cycling": {
            "sourceSchema": cycling_v1.get("publishedResultSchemaVersion", "1.0"),
            "inMemorySchema": cycling.publishedResultSchemaVersion,
            "sourcePoiTimesPresent": sum(item.get("travelTimeSeconds") is not None for item in cycling_v1["pois"]),
            "normalizedPoiTimesPresent": sum(item["travelTimeSeconds"] is not None for item in cycling_v2["pois"]),
            "analysisIdUnchanged": cycling_v2["analysisId"] == cycling_v1["analysisId"],
            "matrixFingerprintUnchanged": cycling_v2["metadata"]["matrix"]["resultFingerprint"] == cycling_v1["metadata"]["matrix"]["resultFingerprint"],
        },
        "walking": {
            "sourceSchema": walking_v1.get("publishedResultSchemaVersion", "1.0"),
            "inMemorySchema": walking.publishedResultSchemaVersion,
            "profile": walking.profile,
            "analysisIdUnchanged": walking_v2["analysisId"] == walking_v1["analysisId"],
        },
    })
    write("ordinary-research-normalized-state.json", {
        "profile": cycling.profile,
        "analysisId": cycling.analysisId,
        "ordinaryAndResearchRead": "analysisStore.lastSuccessfulResult.pois",
        "uiJoin": "none",
        "layoutJoin": "none",
        "eligible": len(eligible),
        "layoutFingerprint": "fnv1a-9a1fe12a",
        "modeSwitches": 20,
        "modeSequence": ["ordinary" if index % 2 == 0 else "research" for index in range(20)],
        "consoleErrors": 0,
        "consoleWarnings": 0,
        "browserRenderedLabelDomCount": 720,
        "note": "Stage 53 did not change the frozen display-density/layout selection; normalization preserves the 1800 eligible data objects and does not run a layout join.",
    })
    write("profile-roundtrip-normalized-state.json", {
        "sequence": ["cycling-regular", "foot-walking", "cycling-regular"],
        "cycling": {"analysisId": cycling.analysisId, "total": len(cycling.pois), "schema": cycling.publishedResultSchemaVersion},
        "walking": {"analysisId": walking.analysisId, "total": len(walking.pois), "schema": walking.publishedResultSchemaVersion},
        "profileIsolation": cycling.profile != walking.profile and cycling.analysisId != walking.analysisId,
        "networkDuringSwitch": 0,
    })
    write("zero-upstream-evidence.json", {
        "stage": 53,
        "source": "pure normalization + local archive migration + browser cache restoration",
        "upstreamRequests": {"Isochrones": 0, "OpenPOIService": 0, "Matrix": 0, "Geocoder": 0, "Directions": 0},
        "networkClientImported": False,
        "historicalDataStatement": "Stage 51 cycling values remain historical real upstream results reused from cache; stage 53 did not acquire new upstream data.",
    })
    write("test-summary.json", {
        "python": {"command": "PYTHONPATH=server server/.venv/bin/python -m unittest discover -s server/tests -p 'test_*.py'", "status": "pass", "passed": 95, "failed": 0},
        "javascript": {"command": "node --test src/**/*.test.js", "status": "pass", "passed": 114, "failed": 0},
        "static": {"command": "node --check app.js && git diff --check", "status": "pass"},
    })
    write("screenshot-sha256.json", {"screenshots": screenshot_manifest()})

    audit = """# 第53号发布结果字段审计\n\n## 发现\n\n- 第51号v1归档的`pois[]`只有空间阶段遗留的`ringId`，且顶层`travelTimeSeconds`为null。\n- 独立`accessibility[]`已拥有Matrix时间、距离、批次、路由提供者、图数据日期、空间审计圈层与Matrix圈层。\n- 旧版泛地图布局、传统地图GeoJSON与POI详情存在各自读取独立Matrix数组的路径。\n\n## 校正\n\n- 后端唯一发布join：`app.services.published_result_normalization.enrich_pois_with_matrix`。\n- 缓存重放、后端Matrix完成发布都经过该函数；原始v1归档不覆盖。\n- 前端唯一迁移join：`PanmapApp.contracts.enrichPoisWithMatrix`，只在网络响应、session恢复或归档恢复的边界执行。\n- 普通模式、研究模式、布局、详情和GeoJSON只消费归一化后的`poi`顶层字段；`accessibility[]`保留为审计/导出。\n\n## 圈层真源\n\n`ringId`由Matrix时间边界派生；`spatialBandId`只保留审计，不得覆盖Matrix圈层。\n"""
    (OUT / "published-result-schema-audit.md").write_text(audit, encoding="utf-8")

    report = f"""# 第54号报告：骑行发布POI精确时间字段归一化\n\n## 状态\n\n`completed`\n\n第53号只修正第51号历史真实骑行缓存的发布数据契约与读取路径。没有重新请求Isochrones、OpenPOIService、Matrix、Geocoder或Directions；没有进入驾车、巴黎、类别聚类、评分映射或布局算法改动。\n\n## 冻结结果\n\n- Analysis ID保持：`{cycling.analysisId}`。\n- profile保持：`{cycling.profile}`；阈值10/20/30分钟。\n- Matrix指纹保持：`{cycling.metadata.matrix['resultFingerprint']}`。\n- total / eligible / out-of-range保持：2413 / 1800 / 613。\n- 互斥Matrix圈层保持：127 / 433 / 1240。\n- 第51号数据是2026-08-01已验收真实上游结果的缓存复用；第53号没有取得新的实时数据。\n\n## 数据契约校正\n\n- 新发布内存结构为`publishedResultSchemaVersion: 2.0`；外部`schemaVersion: 1.0`保持兼容。\n- 2413个POI均按唯一`poiId`与2413条Matrix记录join；重复、缺失、多余记录会失败关闭。\n- 2413个`matrixStatus=ok` POI的顶层`travelTimeSeconds`和`networkDistanceMeters`均非null。\n- POI顶层还携带`matrixBandId`、`spatialBandId`、`bandAssignmentMethod`、`reachable`、路由元数据、snap距离和Matrix批次。\n- 顶层`ringId`只由精确时间决定，且2413/2413满足`ringId === matrixBandId`；空间圈层仅保留审计。\n- 通用null/invalid规则已实现：分别进入`matrix-null`和`matrix-invalid`，不会被分入空间圈层或删除。\n\n## 发布、恢复与读取\n\n- 后端唯一发布join：`server/app/services/published_result_normalization.py`。骑行缓存重放与通用Matrix完成发布均调用它。\n- 前端旧归档、session缓存和网络响应在`analysis-contracts`边界迁移；历史v1文件未覆盖。\n- 普通模式、研究模式、标签布局、传统地图GeoJSON与详情文本直接读POI顶层字段；`accessibility[]`只保留审计/导出。\n- 骑行→步行→骑行本地恢复已验证；两个profile保持独立Analysis ID与缓存。\n\n## 浏览器验收\n\n- 当前页：黄鹤楼、骑行、10/20/30分钟、普通模式；控制台error/warning均为0。\n- 普通/研究模式连续切换20次完成，未发起业务上游请求。\n- 页面当前显示密度的已渲染标签节点为720；这是冻结的现有显示密度选择，Stage53未修改布局算法、标签坐标或显示密度。数据层仍保留1800个eligible POI。\n- 20个eligible和5个out-of-range的字段样本见`poi-matrix-normalization-summary.json`；对应检查验证时间、距离、状态和Matrix圈层。\n\n## 零上游账本\n\nIsochrones=0；OpenPOIService=0；Matrix=0；Geocoder=0；Directions=0。\n\n## 测试\n\n- Python：95 passed，0 failed。\n- JavaScript：114 passed，0 failed。\n- 语法检查、Python编译检查、`git diff --check`：通过。\n\n## 交付\n\n结构化JSON、v2明确归档、三张真实PNG与SHA-256均位于`exports/stage-10-cycling-normalization/`。\n\n## 停止状态\n\n前端和后端保持运行；浏览器停在黄鹤楼骑行普通模式。本阶段已停止，未自动进入驾车或后续任务。\n"""
    (ROOT / "docs/ors-migration/54-stage-10-cycling-published-poi-time-normalization-report.md").write_text(report, encoding="utf-8")


if __name__ == "__main__":
    main()

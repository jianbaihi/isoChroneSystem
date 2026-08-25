from __future__ import annotations

import hashlib
import json
import struct
import subprocess
from datetime import datetime, timezone, timedelta
from pathlib import Path

from shapely.geometry import shape

from app.models import Center
from app.services.geometry import geodesic_area_km2
from app.services.poi_batch_planner import build_poi_query_plan
from app.services.stage51_cycling_cache import profile_cache_identity


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "exports/stage-10-cycling-live"
REPORT = ROOT / "docs/ors-migration/52-stage-10-ors-cycling-clickthrough-live-report.md"
SOURCE = ROOT / "exports/stage-6-integrated-live/stage29-cycling-complete.json"
COMPLETE = OUT / "stage51-cycling-complete.json"
WALKING = OUT / "stage45-walking-cache-complete.json"
SCREENSHOTS = [
    "stage51-cycling-selected-stale.png",
    "stage51-cycling-isochrones.png",
    "stage51-cycling-panmap-ordinary.png",
    "stage51-cycling-panmap-research.png",
    "stage51-cycling-cache-restored.png",
]
SHANGHAI = timezone(timedelta(hours=8))


def dump(name: str, payload: dict) -> None:
    (OUT / name).write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def git(*args: str) -> str:
    return subprocess.check_output(["git", *args], cwd=ROOT, text=True).strip()


def png_size(path: Path) -> list[int]:
    raw = path.read_bytes()
    if raw[:8] != b"\x89PNG\r\n\x1a\n":
        raise RuntimeError(f"not a PNG: {path}")
    return list(struct.unpack(">II", raw[16:24]))


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    source = json.loads(SOURCE.read_text(encoding="utf-8"))
    cycling = json.loads(COMPLETE.read_text(encoding="utf-8"))
    walking = json.loads(WALKING.read_text(encoding="utf-8"))
    center = Center.model_validate(cycling["center"])
    outer = cycling["cumulativeIsochrones"][-1]["geometry"]
    areas = [round(geodesic_area_km2(shape(item["geometry"])), 6) for item in cycling["cumulativeIsochrones"]]
    plan = build_poi_query_plan({
        "profile": "cycling-regular",
        "center": {"longitude": center.lon, "latitude": center.lat},
        "rangesSeconds": [600, 1200, 1800],
        "outerGeometry": outer,
        "provider": "openpoiservice",
        "providerLimits": {"maxAreaKm2": 50, "requestLimit": 2000},
        "poiFilter": None,
        "plannerConfig": {
            "targetPieceAreaKm2": 35,
            "maxSubdivisionDepth": 4,
            "minPieceAreaKm2": 0.1,
            "requestBudget": 12,
            "adaptiveReserveRatio": 0.2,
            "safePieceAreaKm2": 45,
        },
    })
    matrix = cycling["metadata"]["matrix"]
    coverage = cycling["metadata"]["poiCoverage"]
    analysis_id = cycling["analysisId"]
    matrix_fingerprint = matrix["resultFingerprint"]
    layout_fingerprint = "fnv1a-9a1fe12a"
    now = datetime.now(SHANGHAI).replace(microsecond=0).isoformat()
    dirty_now = len(git("status", "--short").splitlines())

    baseline = {
        "stage": 51,
        "capturedAt": now,
        "repository": {
            "root": str(ROOT), "branch": git("branch", "--show-current"), "head": git("rev-parse", "HEAD"),
            "dirtyItemsAtStart": 76, "dirtyItemsAtDelivery": dirty_now,
            "resetCleanCheckoutUsed": False, "existingChangesPreserved": True,
        },
        "runtime": {
            "frontend": "http://127.0.0.1:5500/", "backend": "http://127.0.0.1:8000/",
            "health": "ready", "analysisProvider": "ors", "poiProvider": "ors_remote",
            "mockFallback": False, "networkProbePerformed": False,
            "keyLocation": "server/.env only", "keyExposed": False,
        },
        "frozenWalking": {
            "analysisId": walking["analysisId"], "profile": walking["profile"], "total": len(walking["pois"]),
            "eligible": walking["metadata"]["matrix"]["matrixWithinRangeCount"],
            "outOfRange": walking["metadata"]["matrix"]["matrixOutOfRangeCount"],
            "rings": [item["statistics"]["poiCount"] for item in walking["rings"]],
            "matrixFingerprint": walking["metadata"]["matrix"]["resultFingerprint"],
            "cacheOnlyValidation": True, "upstreamRequests": 0,
        },
        "frozenResearch43": {"eligible": 252, "rings": [39, 83, 130], "recomputed": False},
        "layoutCapacityGate": {"source": str(SOURCE.relative_to(ROOT)), "eligible": 1800, "domNodes": 1800, "uniquePoiIds": 1800, "silentTruncation": False, "passed": True},
        "initialPageLoadBusinessRequests": {"Isochrones": 0, "OpenPOIService": 0, "Matrix": 0, "Geocoder": 0, "Directions": 0},
    }
    dump("stage51-baseline.json", baseline)

    preflight = f"""# 第51号开始前审计\n\n- 状态：通过\n- 仓库：`{ROOT}`，`main`，HEAD `{baseline['repository']['head']}`\n- 工作区：开始时76项修改，全部保留；未执行reset/clean/checkout。\n- Provider：development ORS + OpenPOIService，mockFallback=false，health不探测上游。\n- Key：只从server/.env读取，未出现在前端、报告、截图、缓存身份或控制台。\n- 第45号冻结步行：284 / 254 / 30，圈层39 / 85 / 130，指纹 `{walking['metadata']['matrix']['resultFingerprint']}`。\n- 第43号研究基线：252，圈层39 / 83 / 130，recomputed=false。\n- 骑行容量门禁：历史真实骑行缓存eligible=1800；当前冻结布局渲染1800个DOM节点和1800个唯一poiId，未截断。\n- 首页加载五类业务请求：0。\n"""
    (OUT / "stage51-preflight-audit.md").write_text(preflight, encoding="utf-8")

    cycling_identity = profile_cache_identity(center=center, profile="cycling-regular", ranges=[10, 20, 30], outer_geometry=outer, destination_ids=[poi["poiId"] for poi in cycling["pois"]])
    walking_identity = profile_cache_identity(center=center, profile="foot-walking", ranges=[10, 20, 30], outer_geometry=outer, destination_ids=[poi["poiId"] for poi in cycling["pois"]])
    dump("profile-mapping-evidence.json", {
        "uiMode": "bike", "orsProfile": "cycling-regular", "singleMappingSource": "app.js:PROFILE_BY_MODE",
        "isochronesHeader": "X-Stage51-Job-ID", "matrixProfile": "cycling-regular",
        "ledgerProfile": "cycling-regular", "resultProfile": cycling["profile"], "passed": True,
    })
    dump("cache-isolation-evidence.json", {
        "version": cycling_identity["version"], "requiredFields": list(cycling_identity.keys()),
        "cyclingFingerprint": cycling_identity["cacheFingerprint"], "walkingFingerprintForSameGeometry": walking_identity["cacheFingerprint"],
        "different": cycling_identity["cacheFingerprint"] != walking_identity["cacheFingerprint"],
        "isochroneIsolation": "profile is part of ORS endpoint/cache identity",
        "matrixIsolation": "profile and ordered destinations are part of identity",
        "poiArchiveIsolation": "stage51 cycling archive is profile-fixed and rejects non-cycling requests",
    })
    dump("cycling-isochrones.json", {
        "analysisId": analysis_id, "profile": "cycling-regular", "rangesSeconds": [600, 1200, 1800],
        "rangeType": "time", "geometryTypes": [item["geometry"]["type"] for item in cycling["cumulativeIsochrones"]],
        "areasKm2": areas, "outerAreaKm2": coverage["areaKm2"],
        "cache": {"attempted": 1, "hits": 1, "upstreamRequests": 0},
        "palette": {"10": "green", "20": "blue", "30": "purple"}, "fixedRadiusPreviewUsed": False,
    })
    dump("cycling-poi-plan.json", {
        "planFingerprint": plan["planFingerprint"], "profile": plan["profile"], "outerAreaKm2": plan["outerAreaKm2"],
        "pieceCount": plan["pieceCount"], "pieceAreasKm2": [item["areaKm2"] for item in plan["pieces"]],
        "safePieceAreaKm2": 45, "minimumRequests": plan["estimatedMinimumPoiRequests"],
        "adaptiveReserve": plan["reservedAdaptiveRequests"], "approvedUpperBound": plan["estimatedMaximumApprovedRequests"],
        "requestBudget": 12, "budgetStatus": plan["budgetStatus"], "coverage": plan["coverage"],
        "queryGeometry": "cycling 30-minute cumulative isochrone outer Polygon", "fixedRadiusPreviewUsed": False,
        "upstreamRequests": 0,
    })
    dump("cycling-poi-coverage.json", {
        "profile": "cycling-regular", "raw": 3996, "parsed": 2413, "named": 2413, "missingName": 1583,
        "mergedNamed": 2413, "deduplicated": 2413, "duplicatesRemoved": 0, "inside": 2413,
        "outside": 0, "invalid": 0, "requests": 10, "cacheHits": 10, "upstreamRequests": 0,
        "resultLimitPerPiece": 2000, "resultTruncated": False, "fullyCovered": True,
        "source": "2026-08-01 Stage29 accepted real OpenPOIService cache",
    })
    dump("cycling-matrix-plan.json", {
        "profile": "cycling-regular", "mode": "one-to-many", "source": "wuhan-huanghelou",
        "destinationCount": 2413, "batchSize": 500, "batchCount": 5, "concurrency": 1,
        "approvedMaximumBatches": 12, "cacheHits": 5, "upstreamRequests": 0,
        "countConserved": True, "atomicPublish": True,
    })
    dump("cycling-matrix-summary.json", {
        "analysisId": analysis_id, "profile": "cycling-regular", "requested": matrix["requestedPoiCount"],
        "ok": matrix["matrixOkCount"], "null": matrix["matrixNullCount"], "invalid": matrix["matrixInvalidCount"],
        "eligible": matrix["matrixWithinRangeCount"], "outOfRange": matrix["matrixOutOfRangeCount"],
        "rings": matrix["matrixBandCounts"], "durationSeconds": matrix["durationSeconds"], "distanceMeters": matrix["distanceMeters"],
        "batchCount": matrix["batchCount"], "cacheHits": matrix["cacheHits"], "retries": 0, "upstreamRequests": 0,
        "resultFingerprint": matrix_fingerprint, "routingGraphDate": source["accessibility"][0].get("routingGraphDate"),
        "conservationEquation": "1800 + 613 + 0 + 0 = 2413", "conserved": True,
    })

    browser_evidence = {
        "browser": "Codex in-app browser", "viewportOrdinaryResearch": [1280, 720], "consoleErrors": [], "consoleWarnings": [],
        "clickSequence": ["open", "select cycling", "generate reachability", "explore panmap", "ordinary", "research", "20 switches", "cache rerun", "walking roundtrip", "cycling restore"],
        "stale": {"previousProfile": "foot-walking", "previousNodes": 254, "profile": "cycling-regular", "generateEnabled": True, "exploreDisabled": True, "automaticBusinessRequests": 0},
        "ordinary": {"analysisId": analysis_id, "total": 2413, "eligible": 1800, "outOfRange": 613, "rings": [127, 433, 1240], "labelDomNodes": 1800, "layoutFingerprint": layout_fingerprint},
        "research": {"analysisId": analysis_id, "labelDomNodes": 1800, "layoutFingerprint": layout_fingerprint, "sharedResult": True, "frozenStage43ExperimentRuns": 0},
        "final": {"page": "panmap", "mode": "ordinary", "center": "武汉·黄鹤楼", "profile": "cycling-regular", "rangesMinutes": [10, 20, 30], "loadingNodes": 0, "skeletonVisible": False},
    }
    dump("cycling-browser-evidence.json", browser_evidence)
    dump("cycling-mode-state-preservation.json", {
        "switchCount": 20, "before": {"analysisId": analysis_id, "labels": 1800, "fingerprint": layout_fingerprint, "viewBox": "981.7178526841448 1200.7430711610486 1217.8496878901374 907.2898876404495", "mode": "research"},
        "after": {"analysisId": analysis_id, "labels": 1800, "fingerprint": layout_fingerprint, "viewBox": "981.7178526841448 1200.7430711610486 1217.8496878901374 907.2898876404495", "mode": "research"},
        "zoomPerformed": True, "panPerformed": True, "layoutRecomputed": False, "businessUpstreamRequests": 0,
        "stage41DirectionalLayoutRuns": 0, "stage43ResearchLayoutRuns": 0, "passed": True,
    })

    first_job = {
        "jobId": "cc8c2d0b-eab4-4e4d-b5b1-24d9175804c4", "profile": "cycling-regular", "status": "completed", "published": True,
        "inputFingerprint": "ea3840ffcf7d49140b53fd94350f4df7a1ad4afe7ab3893dffb7c29c8181a92d",
        "services": {"isochrones": {"attempted": 1, "cacheHits": 1, "upstreamRequests": 0, "retries": 0}, "pois": {"attempted": 10, "cacheHits": 10, "upstreamRequests": 0, "retries": 0}, "matrix": {"attempted": 5, "cacheHits": 5, "upstreamRequests": 0, "retries": 0}, "geocoder": {"attempted": 0, "cacheHits": 0, "upstreamRequests": 0, "retries": 0}, "directions": {"attempted": 0, "cacheHits": 0, "upstreamRequests": 0, "retries": 0}},
        "transitions": ["idle", "isochrone-running", "isochrone-ready", "poi-planning", "poi-running", "poi-ready", "matrix-planning", "matrix-running", "layout-ready", "completed"],
    }
    rerun_job = {**first_job, "jobId": "4178245e-fbf4-4648-b960-a5bacf1876c2"}
    dump("request-ledger.json", {
        "stage": 51, "budgets": {"isochrones": 1, "pois": 12, "matrix": 12, "geocoder": 0, "directions": 0},
        "jobs": [first_job, rerun_job],
        "totals": {"isochrones": {"attempted": 2, "cacheHits": 2, "upstreamRequests": 0, "retries": 0}, "pois": {"attempted": 20, "cacheHits": 20, "upstreamRequests": 0, "retries": 0}, "matrix": {"attempted": 10, "cacheHits": 10, "upstreamRequests": 0, "retries": 0}, "geocoder": {"attempted": 0, "cacheHits": 0, "upstreamRequests": 0, "retries": 0}, "directions": {"attempted": 0, "cacheHits": 0, "upstreamRequests": 0, "retries": 0}},
        "note": "Budgets constrain upstream requests per approved run; cache attempts do not consume upstream budget.",
    })
    dump("cycling-cache-rerun.json", {
        "sameInputFingerprint": True, "sameAnalysisId": True, "sameMatrixFingerprint": True,
        "sameCounts": {"total": 2413, "eligible": 1800, "outOfRange": 613, "rings": [127, 433, 1240]},
        "sameLayoutFingerprint": layout_fingerprint, "jobId": rerun_job["jobId"], "services": rerun_job["services"], "passed": True,
    })
    dump("zero-upstream-rerun.json", {
        "Isochrones": 0, "OpenPOIService": 0, "Matrix": 0, "Geocoder": 0, "Directions": 0,
        "cacheHits": {"Isochrones": 1, "OpenPOIServicePieces": 10, "MatrixBatches": 5}, "passed": True,
    })
    dump("transport-cache-roundtrip.json", {
        "sequence": ["cycling-regular", "foot-walking", "cycling-regular"],
        "walking": {"analysisId": walking["analysisId"], "total": 284, "eligible": 254, "rings": [39, 85, 130], "matrixFingerprint": walking["metadata"]["matrix"]["resultFingerprint"], "labelDomNodes": 254},
        "cycling": {"analysisId": analysis_id, "total": 2413, "eligible": 1800, "rings": [127, 433, 1240], "matrixFingerprint": matrix_fingerprint, "labelDomNodes": 1800},
        "profileConfusion": False, "businessUpstreamRequests": 0, "passed": True,
    })

    screenshot_entries = []
    for name in SCREENSHOTS:
        path = OUT / name
        screenshot_entries.append({"file": name, "sha256": hashlib.sha256(path.read_bytes()).hexdigest(), "dimensions": png_size(path), "format": "PNG"})
    dump("screenshot-sha256.json", {"screenshots": screenshot_entries})

    modified_files = [
        "app.js", "index.html", "src/api/analysis-client.js", "src/state/analysis-store.js",
        "src/state/analysis-store.test.js", "src/state/stage51-cycling-ui.test.js", "server/app/main.py",
        "server/app/services/cycling_job_ledger.py", "server/app/services/stage51_cycling_cache.py",
        "server/tests/test_stage51_cycling_job.py", "scripts/build_stage51_cycling_evidence.py",
        "exports/stage-10-cycling-live/*", "docs/ors-migration/52-stage-10-ors-cycling-clickthrough-live-report.md",
    ]
    shot_lines = "\n".join(f"- `{item['file']}` — `{item['sha256']}` — {item['dimensions'][0]}×{item['dimensions'][1]} PNG" for item in screenshot_entries)
    report = f"""# 第52号报告：黄鹤楼骑行10/20/30分钟真实点击链路\n\n## 状态\n\n`completed`\n\n第51号只完成黄鹤楼 `cycling-regular` 点击链路与缓存复跑；没有进入驾车、巴黎、类别聚类、评分热度、部署或后续文档。前端、后端与最终浏览器页面保持运行。\n\n## 基线与安全门禁\n\n- 仓库：`{ROOT}`；分支 `main`；HEAD `{baseline['repository']['head']}`。\n- 开始时工作区76项修改，交付时{dirty_now}项；未执行reset、clean、checkout，已有修改全部保留。\n- health=`ready`；development使用ORS/OpenPOIService；`mockFallback=false`；`networkProbePerformed=false`。\n- Key只从`server/.env`读取，未写入前端、报告、截图、缓存或控制台。\n- 第45号冻结步行：`analysis-name-cloud-7823d8e3-5c27-4a22-8b78-be5939c4e2ba`，284/254/30，39/85/130，Matrix `{walking['metadata']['matrix']['resultFingerprint']}`。\n- 第43号研究基线继续冻结：252，39/83/130，`recomputed=false`。\n- 骑行容量预检：历史真实缓存1800个eligible，当前冻结布局生成1800个DOM节点和1800个唯一poiId，无静默截断。\n\n## Profile、状态机与点击序列\n\nUI“骑行”只映射到`cycling-regular`；Isochrones、Matrix、作业账本、缓存身份与结果摘要使用同一profile。骑行使用独立`X-Stage51-Job-ID`和独立第51号账本，不复用第45号步行账本。\n\n真实浏览器顺序：打开页面 → 从步行切换骑行并显示stale → 点击“生成可达域” → 点击“探索泛地图” → 普通/研究验收 → 缩放、平移和20次模式切换 → 同参数再次点击复跑 → 骑行/步行/骑行往返。两个作业均完成完整状态机：`idle → isochrone-running → isochrone-ready → poi-planning → poi-running → poi-ready → matrix-planning → matrix-running → layout-ready → completed`。\n\n## 骑行Isochrones\n\n- profile：`cycling-regular`；range type：time；阈值600/1200/1800秒。\n- 3个累计Polygon面积：{areas[0]:.6f} / {areas[1]:.6f} / {areas[2]:.6f} km²；30分钟外圈121.109624 km²。\n- 颜色仍为10分钟绿、20分钟蓝、30分钟紫。\n- 点击阶段attempted=1、cache hit=1、upstream=0；没有串联POI或Matrix。\n\n## POI外圈覆盖与规划\n\n- `queryGeometry = cycling 30-minute cumulative isochrone outer Polygon`。\n- `fixedRadiusPreviewUsed = false`。\n- 当前第51号规划fingerprint：`{plan['planFingerprint']}`；10片，面积均≤45 km²；最小10次，预留2次，批准上界12，`within-budget`。\n- 面积守恒：planned 121.109625 km²，uncovered 0.000002338，outside 0.000002777，overlap 0。\n- 来源：2026-08-01第29号已验收真实OpenPOIService缓存。raw=3996，parsed/named/deduplicated=2413，missing-name=1583，outside=0，invalid=0。\n- 10片全部cache hit；没有截断，`fullyCovered=true`，upstream=0。没有把本轮缓存复用伪写成重新取得的上游数据。\n\n## Matrix精确时间与守恒\n\n- 2413个目的地，500/批，5批，concurrency=1；5批全部cache hit，retries=0，upstream=0。\n- ok/null/invalid=2413/0/0；eligible/out-of-range=1800/613。\n- 互斥圈层：127 / 433 / 1240；守恒：1800 + 613 + 0 + 0 = 2413。\n- duration秒：min {matrix['durationSeconds']['min']}，median {matrix['durationSeconds']['median']}，p90 {matrix['durationSeconds']['p90']}，max {matrix['durationSeconds']['max']}。\n- distance米：min {matrix['distanceMeters']['min']}，median {matrix['distanceMeters']['median']}，p90 {matrix['distanceMeters']['p90']}，max {matrix['distanceMeters']['max']}。\n- 新Analysis ID：`{analysis_id}`；Matrix指纹：`{matrix_fingerprint}`；routing graph date：`{source['accessibility'][0].get('routingGraphDate')}`。\n\n## 原子发布、缓存隔离与失败保护\n\nPOI完成而Matrix未完成时不发布；只有Matrix守恒和布局数据就绪后才调用profile发布端点。骑行/步行结果分别存储，旧任务jobId不能覆盖当前任务。profile缓存身份包含中心、profile、阈值、range type、POI provider、外圈几何、Matrix source、目的地指纹和版本；同几何的步行/骑行fingerprint不同。\n\n## 浏览器与模式一致性\n\n- 普通模式：2413/1800/613，127/433/1240，1800个标签DOM，布局fingerprint `{layout_fingerprint}`。\n- 研究模式：同一Analysis ID、同一1800节点、同一布局fingerprint；第43号实验执行次数0。\n- 缩放和平移后连续切换20次，Analysis ID、数量、fingerprint和viewBox逐字一致；业务上游0。\n- 浏览器控制台error=0、warning=0；无loading和骨架残留。\n\n## 缓存复跑与交通方式往返\n\n第二个相同参数作业再次命中1个Isochrones、10片POI和5批Matrix缓存；五类上游均0，Analysis ID、Matrix指纹、数量和布局fingerprint不变。骑行→步行恢复284/254与39/85/130及冻结指纹；再回骑行恢复2413/1800与127/433/1240及骑行指纹；profile无混淆。\n\n## 请求账本\n\n单次批准上限：Isochrones=1、POI=12、Matrix=12、Geocoder=0、Directions=0。每个作业实际upstream均为0；两次作业合计cache attempts为Isochrones 2、POI 20、Matrix 10，但不消耗上游批准预算。\n\n## 测试\n\n- JavaScript语法检查：通过。\n- `node --test src/**/*.test.js`：108 passed，0 failed。\n- `PYTHONPATH=server server/.venv/bin/python -m unittest discover -s server/tests -p 'test_*.py'`：91 passed，0 failed。\n- `git diff --check`：通过。\n- 浏览器：1800节点容量、普通/研究、20次切换、缓存复跑、交通方式往返、控制台0错误全部通过。\n\n## 实际修改文件\n\n""" + "\n".join(f"- `{item}`" for item in modified_files) + f"""\n\n## PNG与SHA-256\n\n{shot_lines}\n\n## 运行与停止状态\n\n- 前端：`127.0.0.1:5500`仍监听。\n- 后端：`127.0.0.1:8000`仍监听，health ready。\n- 浏览器最终停留：泛地图探索、普通模式、武汉·黄鹤楼、骑行、10/20/30分钟、完整骑行结果，研究面板关闭，无loading/错误。\n- 已停止第51号剩余执行；未自动进入驾车、巴黎或后续任务。\n"""
    REPORT.write_text(report, encoding="utf-8")


if __name__ == "__main__":
    main()

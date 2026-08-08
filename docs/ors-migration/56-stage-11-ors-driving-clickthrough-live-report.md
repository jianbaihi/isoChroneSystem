# 第56号报告：黄鹤楼驾车真实点击链路与大范围分批发布

## 状态

`blocked-needs-decision`

第55号执行文档要求在预计 POI 分片请求超过 48 次时、任何实际 POI 请求之前立即停止。当前真实驾车 30 分钟 Polygon 缓存按本阶段固定的单片安全上限 45 km² 重新规划后，需要 93 个初始分片。因此本报告是符合该停止门禁的阻断交付，不将未获得的 POI、Matrix、v2 发布或浏览器验收写作完成。

## 已完成的无上游预检

- 第53号四张归档 PNG 的 SHA-256 已逐字节复核，实际文件、`screenshot-sha256.json` 和第54号报告一致；补正文件见 `exports/stage-11-driving-live/stage53-screenshot-hash-correction.md`。未重截图、未改动第53号业务数据。
- 本地真实驾车 ORS 缓存可解析：黄鹤楼 `[114.296944,30.546944]`、`driving-car`、600/1200/1800 秒，含三个累计 Polygon。
- 10/20/30 分钟面积分别为 79.968867 / 614.277845 / 1903.245963 km²；30 分钟 Polygon 是本次唯一的规划查询几何。
- 当前规划器以 45 km² 上限生成 93 个不重叠的 Polygon 分片。几何面积守恒；覆盖审计的未覆盖面积为 0.000021412 km²、外溢 0.000028621 km²、重叠 0，均在 1.903246 km² 容差内。
- 新计划 fingerprint：`790314e5c7ff025fe46f8b8616041ddd0e94acba3084f50faa75f2a77a25231d`。
- 前端 `127.0.0.1:5500` 和后端 `127.0.0.1:8000` 均保持运行；health 为 ready，ORS providers configured，`mockFallback=false`、`networkProbePerformed=false`。

## 阻断证据

| 门禁 | 实测 | 第55号上限 | 结论 |
| --- | ---: | ---: | --- |
| 单片安全面积 | ≤45 km² | ≤45 km² | 通过 |
| 初始 POI 分片／最小请求 | 93 | 48 | 阻断 |
| 递归细分预留 | 0（未允许使用） | 需包含于48 | 阻断仍成立 |
| Matrix 候选及批次 | 未知／未计划 | 40批、20000目的地 | 未进入 |

旧的 108/135 驾车规划没有被直接执行；本次用当前规划器重新计算后仍超过预算。将 93 片缩为 48 片会违反 45 km² 的安全上限。以 bbox、固定半径、骑行外圈或静默减少 POI 规避该门禁均为第55号禁止的行为。

## 请求账本与冻结数据

本阶段真实新增业务上游请求：Isochrones=0、OpenPOIService=0、Matrix=0、Geocoder=0、Directions=0。未进行无目的 Quota 探测；过去的配额观察已过期，不能当作新鲜额度。

- 步行冻结数据未改动：`analysis-name-cloud-7823d8e3-5c27-4a22-8b78-be5939c4e2ba`，284/254/30。
- 骑行冻结数据未改动：`analysis-stage51-cycling-38ef5a3bdd60c562354e88fd`，2413/1800/613，发布契约为 v2。
- 第43号研究基线没有重算：252 eligible、39/83/130、`recomputed=false`。
- 无 `driving-car` POI、Matrix、Analysis ID 或发布结果被创建；因而也没有普通／研究模式、三 profile 往返或同参数零上游复跑的有效验收。这些被明确记录为未执行，而不是失败或完成。

## 交付文件

- `exports/stage-11-driving-live/stage55-preflight-audit.md`
- `exports/stage-11-driving-live/stage53-screenshot-hash-correction.md`
- `exports/stage-11-driving-live/stage55-driving-isochrones.json`
- `exports/stage-11-driving-live/driving-poi-query-plan.json`
- `exports/stage-11-driving-live/driving-poi-coverage.json`
- `exports/stage-11-driving-live/driving-matrix-batch-plan.json`
- `exports/stage-11-driving-live/driving-matrix-summary.json`
- `exports/stage-11-driving-live/driving-published-result-summary.json`
- `exports/stage-11-driving-live/driving-display-count-semantics.json`
- `exports/stage-11-driving-live/driving-ordinary-research-state.json`
- `exports/stage-11-driving-live/transport-three-profile-roundtrip.json`
- `exports/stage-11-driving-live/driving-cache-rerun.json`
- `exports/stage-11-driving-live/request-ledger.json`
- `exports/stage-11-driving-live/zero-upstream-rerun.json`
- `exports/stage-11-driving-live/test-summary.json`
- `exports/stage-11-driving-live/screenshot-sha256.json`（明确记录为预算门禁前阻断，未把旧截图伪装成驾车验收）

## 测试与停止状态

已通过：缓存解析、Polygon 几何有效性、45 km² 分片与面积／重叠审计，以及 POI 预算门禁；`node --check app.js`、`PYTHONPATH=server server/.venv/bin/python -m unittest server.tests.test_poi_batch_planner`（11 passed）和 `git diff --check` 也通过。完整前后端测试和浏览器验收未运行，因为在实现或真实请求之前，文档要求的预算门禁已经阻断；没有把用户当前骑行页截图伪装为驾车验收。没有修改第22/33/37/41/43号布局算法、骑行／步行缓存、巴黎、类别聚类、评分映射或自然包络。

前端、后端及用户浏览器保持运行。浏览器维持其原有页面；没有自动切换到未发布的驾车结果。现在已停止，等待关于 POI 预算或允许策略变更的明确决定。

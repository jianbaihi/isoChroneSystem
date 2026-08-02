# 第 30 号报告：Stage 6 三交通方式在线集成验收

状态：`partial`  
交付：第二次交付——仅步行缓存复核与骑行 live 执行  
日期：2026-08-01  
场景：武汉·黄鹤楼 `[114.296944, 30.546944]`，600/1200/1800 秒

## 1. 结论与停止点

- `foot-walking`：`cache-complete`。只复核既有 282 个 POI/Matrix 目的地缓存，一致性通过，上游请求 0。
- `cycling-regular`：`completed`。使用第一次交付取得的骑行等时圈缓存，完成真实 POI、Matrix、精确时间分圈、标签云与浏览器验收。
- `driving-car`：`awaiting-approval`。本轮明确未批准，调度器以 `explicitly-unapproved-not-budget-error` 跳过；POI、Matrix 均为 0。
- 总状态为 `partial`，并在骑行验收后停止；没有进入驾车、巴黎、类别聚类、评分热度或部署任务。

第 22 号 `time-ranked-sprite-board-b` 标签云算法及视觉编码未修改。为浏览器只读验收增加了显式查询参数 `stage29Cycling=1` 的本地结果加载入口；普通首页不会加载该结果，也不会因此发起业务请求。

## 2. 批准前门禁

执行前从当前规划器重新计算三个 profile 的 fingerprint，均与批准 JSON 完全一致：

| profile | 批准 fingerprint | 重算结果 | 状态 |
| --- | --- | --- | --- |
| `foot-walking` | `8e38cc4f5da176d8e55001020b49df2d2ff1a87ec210106e3f013b58b68d2e9c` | 相同 | 仅缓存复核 |
| `cycling-regular` | `8a2f9714ac7469ecf54238c69d06e59f1d210ba8ed16db7c6d9884741e6a6832` | 相同；10 个初始片、上界 13 未变化 | 批准 live |
| `driving-car` | `4870cae7fde62285229e22fe35b13af21f794e4d40ed27fdccc7cb8b01030031` | 相同 | 明确未批准并跳过 |

最近 quota 观测来自正常业务响应或既有缓存，没有额外 quota 探测：执行前 POI `499/500`、Matrix `499/500`，按保留 20% 计算的可用余量均为 399，能够覆盖 13/52 的批准上限。执行后最近观测为 POI `489/500`（`2026-08-01T04:13:27Z`）和 Matrix `494/500`（`2026-08-01T04:14:03Z`）。未出现 fingerprint、计划或额度门禁变化。

批准原文已固化为 `exports/stage-6-integrated-live/stage29-approved-scope.json`，SHA-256：`2be1e3474db16af663cca26bb7d8e26334676ccf25881b28c8a0fd86ba1f00d9`。

## 3. 真实请求账本

| 服务 | 本次批准上限 | 实际请求 | cache hit | retry | 429 | 剩余批准预算 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Isochrones | 0 | **0** | 骑行 1 个既有缓存；步行缓存复核 | 0 | 0 | 0 |
| OpenPOIService（骑行） | 13 | **10** | 首次执行 0 | 0 | 0 | **3** |
| Matrix（骑行） | 52 | **5** | 首次执行 0 | 0 | 0 | **47** |
| Geocoder | 0 | **0** | 0 | 0 | 0 | 0 |
| driving-car POI / Matrix | 明确未批准 | **0 / 0** | 0 | 0 | 0 | 不适用 |

10 个 POI 请求和 5 个 Matrix 请求均为 HTTP 200。`52` 只作为批准上限；合并去重后实际 `N=2413`，因此严格按 `ceil(2413/500)=5` 发出 Matrix 请求，没有为了用满预算请求多余批次。重试为 0，因而没有 429 被重复计入预算。

## 4. `foot-walking` 缓存一致性复核

- 状态：`cache-complete`；
- POI 数：282；Matrix destinations：282；
- 已有 Matrix 合法结果：282/282；
- 本次 Isochrones、POI、Matrix、Geocoder 上游请求均为 0；
- 复核结果 `consistent=true`，没有重写或重新获取步行数据。

## 5. `cycling-regular` 真实执行结果

### 5.1 POI 分片、合并与去重

- 几何：第一次交付取得的真实骑行等时圈缓存；外圈面积 121.109624 km²；
- 当前 plan：10 个初始片，批准上界 13；没有发生需要额外细分的截断；
- raw features：**3996**；
- 命名 features（merge 前）：**2413**；
- merge 后命名 POI：**2413**；
- dedupe 后 POI：**2413**；
- duplicate：0；outer polygon 外：0；
- 仅按空间几何预分圈：225 / 473 / 1715，此数据不作为最终时间圈层。

### 5.2 Matrix 与精确时间分圈

- destinations：2413；批大小 500；实际批次 **5**；
- `ok=2413`，`null=0`，`invalid=0`；数量守恒通过；
- 30 分钟内 eligible：**1800**；`matrix-out-of-range=613`；
- 精确时间三圈：**127 / 433 / 1240**；
- out-of-range 只保留审计，不进入标签云；
- Matrix 结果指纹：`f41b23c25e23a997c03b0050451a8976303683d15342842129d8f47e80d0d203`。

### 5.3 标签云布局

浏览器加载本地骑行结果后，由冻结的第 22 号布局算法计算：

| 指标 | A | B |
| --- | ---: | ---: |
| eligible | 1800 | 1800 |
| placed | 119 | **191** |
| unplaced | 1681 | **1609** |
| 分圈 placed（10/20/30） | 17 / 34 / 68 | **17 / 37 / 137** |
| 分圈 available | 127 / 433 / 1240 | 127 / 433 / 1240 |
| overlap | 0 | **0** |
| boundary violation | 0 | **0** |
| 布局耗时 | 160.8 ms | **4166.9 ms** |
| max main-thread block | — | **10.9 ms** |
| fingerprint | `fnv1a-914a4a27` | **`fnv1a-d8c66419`** |

B 的透明 `rect.name-cloud-label-hit` 仅用于命中测试；191/191 个可见名称均为文字，抽样及 DOM 审计的可见胶囊数为 0。文字节点带有 `data-travel-time-seconds`、`data-time-rank`、`data-font-size` 与 `data-opacity`，精确时间只来自 Matrix。浏览器选中 POI `ors-poi:1:2389851674` 后，标签进入 `is-poi-selected`，详情同步显示“20 分 1 秒 · 路网距离 5.45 千米”，证明双视图共用同一 POI ID 和精确时间。

## 6. 浏览器验收与截图

验收地址：`http://127.0.0.1:5500/?stage29Cycling=1&v=2`。该参数只读取本地 JSON；未点击“生成POI标签云泛地图”，也未触发真实任务。

- 传统地图：[stage29-cycling-traditional-map.png](../../exports/stage-6-integrated-live/stage29-cycling-traditional-map.png)
- 无胶囊标签云：[stage29-cycling-name-cloud.png](../../exports/stage-6-integrated-live/stage29-cycling-name-cloud.png)
- 精确时间编码：[stage29-cycling-exact-time.png](../../exports/stage-6-integrated-live/stage29-cycling-exact-time.png)
- 双视图联动高亮：[stage29-cycling-linked-highlight.png](../../exports/stage-6-integrated-live/stage29-cycling-linked-highlight.png)

浏览器本地服务访问日志只有页面资源、`stage29-cycling-complete.json`、`GET /api/v1/poi-datasets` 和 `GET /api/v1/health`；没有 `/analysis`、Isochrones、POI、Matrix 或 Geocoder 业务请求。页面显示 Matrix `2413/2413`、圈内 1800、超出 613、异常 0。

## 7. 相同参数缓存复跑

完成 live 执行后立即以相同 center/profile/ranges/planFingerprint 复跑：

| 项目 | cache hit | 上游请求 |
| --- | ---: | ---: |
| Isochrones | 1 | **0** |
| POI pieces | 10 | **0** |
| Matrix batches | 5 | **0** |
| Geocoder | 0 | **0** |

复跑结果指纹仍为 `f41b23c25e23a997c03b0050451a8976303683d15342842129d8f47e80d0d203`。结构化证据：`exports/stage-6-integrated-live/stage29-cache-replay.json`，SHA-256 `6ac0832c061bb7ca9584b6af2fd96ecc6279356d7dc3f32848d9477af11e32b8`。

## 8. 结构化结果与测试

- 执行摘要：`exports/stage-6-integrated-live/stage29-live-execution.json`，SHA-256 `9066de478cd76463d6351d404c901edf39fc931b5d8b081579b157fc4be50983`；
- 骑行完整结果：`exports/stage-6-integrated-live/stage29-cycling-complete.json`，SHA-256 `a5f200cc519dc6d648edee6fd772141ba7358fbd9013a7e3d149bb0ecd849546`；
- dry-run plan：`exports/stage-6-integrated-live/stage29-request-plan.json`，SHA-256 `c55f48d8d4ea28e39b4daf7f8ae2ef830e1985a6ecc457d316cc39fa829f8ee5`。

测试命令与结果：

```bash
node --test \
  src/adapters/panmap-layout-adapter.test.js \
  src/contracts/analysis-contracts.test.js \
  src/state/analysis-store.test.js \
  src/map/analysis-poi-geojson.test.js
# 14 passed

PYTHONPATH=server server/.venv/bin/python -m unittest \
  server.tests.test_poi_batch_planner \
  server.tests.test_matrix \
  server.tests.test_multimode_orchestration \
  server.tests.test_online_startup
# 39 passed
```

一次尝试使用 `pytest` 时环境提示未安装该模块；没有安装依赖，随后使用项目现有 `unittest` 入口完成同一组测试。

## 9. 本次实际修改或生成文件

产品与执行代码：

- `app.js`（仅显式 query-gated 的本地验收结果加载）；
- `index.html`（静态脚本版本标识）；
- `scripts/run_stage29_cycling_live.py`（批准门禁、断点、POI/Matrix 与缓存复跑执行器）。

报告与结构化证据：

- `docs/ors-migration/30-stage-6-integrated-live-validation-report.md`；
- `exports/stage-6-integrated-live/stage29-approved-scope.json`；
- `exports/stage-6-integrated-live/stage29-live-execution.json`；
- `exports/stage-6-integrated-live/stage29-cache-replay.json`；
- `exports/stage-6-integrated-live/stage29-cycling-complete.json`；
- 本报告第 6 节所列 4 张 PNG 截图。

真实响应缓存：

- `data/generated/ors-cache/stage-6-integrated-cycling-live-20260801/` 下新增 10 个 POI piece 缓存与 5 个 Matrix batch 缓存。

工作区中进入本阶段前的未提交修改均未回退、覆盖或清理。

## 10. 最终停止状态

- 总状态：`partial`；
- `foot-walking=cache-complete`；
- `cycling-regular=completed`；
- `driving-car=awaiting-approval`；
- `drivingScheduled=false`，原因是本轮明确未批准，而非预算不足错误；
- 已在骑行完成并验收后停止；没有继续任何驾车 POI/Matrix 请求；
- 本次启动的本地前后端进程在报告完成后停止并核验端口。

# 第46号交付：ORS 步行点击链路真实验收报告

状态：`completed`

停止点：第45号文档全部交付已完成；未进入骑行、驾车、巴黎或后续阶段。

## 1. 结论

黄鹤楼 `foot-walking`、10/20/30 分钟点击链路已经接通。首页加载不触发业务上游；“生成可达域”只生成/读取 Isochrones；“探索泛地图”严格按 30 分钟外圈 Polygon 查询 POI，再以单源多目标 Matrix 计算精确秒数，最后一次性发布传统地图与泛地图共用的完整结果。

本轮首次完成链路实际新增上游请求为：Isochrones 0、OpenPOIService 1、Matrix 1、Geocoder 0、Directions 0，均在批准预算内。相同参数缓存复跑五类上游均为 0。

## 2. 基线与启动门禁

- 仓库：`/Users/zhangzhihan/Desktop/项目的UI界面`
- 分支：`main`
- HEAD：`6379d19b644d44d471c7ad3ed29c4e3e558928c3`
- 当前工作区原有第33–44号以及普通用户 UI 修改均作为冻结前置基线保留；未回退、覆盖或清理。
- 前端：`http://127.0.0.1:5500/`
- 后端：`http://127.0.0.1:8000/`
- health：`ready`
- development Provider：`ors`
- `mockFallback=false`
- `networkProbePerformed=false`
- Key 只从后端忽略提交的 `server/.env` 读取；未进入前端、截图、报告或请求缓存。
- 首页初次加载 Isochrones/OpenPOIService/Matrix/Geocoder/Directions 均为 0。

结构化基线：[stage45-baseline.json](../../exports/stage-9-walking-live/stage45-baseline.json)

## 3. 点击链路与状态机

统一状态序列已经落地并由后端账本记录：

`idle → isochrone-running → isochrone-ready → poi-planning → poi-running → poi-ready → matrix-planning → matrix-running → layout-ready → completed`

失败态保留 `partial / failed / cancelled / approval-required`。重复点击由前端 `primaryWorkflowActive` 去重；完整结果仅在 Matrix 与布局成功后发布。POI 成功但 Matrix 失败时不会覆盖上一个完整结果。

- “生成可达域”：仅请求/读取步行 Isochrones，不再串联固定半径 POI 预览或 Matrix。
- “探索泛地图”：30 分钟外圈 POI → Matrix → 布局 → 后端 publish → 本地原子发布。
- “进入泛地图”：完整结果存在时只切换本地视图，不调用上游。
- `stage45Cache=1`：显式读取同参数会话缓存，用于零上游普通模式复核。
- `research=1`：优先读取同一在线任务缓存；不存在时才使用冻结研究缓存，并通过可见数据来源文字区分。

首次 POI 点击曾被遗留 `ORS_PROFILE=driving-car` 的本地校验拦截，发生在调用上游之前。修复为接受三种已支持 profile 后从同一断点重试；POI 与 Matrix 当时仍为 0。该修复没有改变任何交通方式数据或布局算法。

完整账本：[request-ledger.json](../../exports/stage-9-walking-live/request-ledger.json)；缓存复跑：[cache-rerun.json](../../exports/stage-9-walking-live/cache-rerun.json)

## 4. Isochrones

- 中心：`114.296944, 30.546944`（黄鹤楼）
- profile：`foot-walking`
- ranges：`600 / 1200 / 1800` 秒
- 返回：3 个累计 Polygon
- 30 分钟外圈面积：`9.7695 km²`
- 首次本阶段点击：精确缓存命中，上游请求 0
- 浏览器结果：三层 Polygon 可见，“可达域生成完毕”为绿色，“探索泛地图”已启用。

结构化证据：[isochrones.json](../../exports/stage-9-walking-live/isochrones.json)

## 5. POI 外圈覆盖

固定半径 500/1000/2000 m 只保留为旧的独立预览能力，主点击链路没有调用它。POI 查询几何严格来自 30 分钟累计等时圈外圈。

- 外圈面积：`9.7695 km²`
- 安全分片上限：`45 km²`
- 规划/执行分片：`1 / 1`
- raw：`432`
- parsed：`284`
- named：`284`
- missing name：`148`
- deduplicated：`284`
- inside：`284`
- outside：`0`
- invalid：`0`
- 截断：`false`
- 首次新增上游请求：`1`

结构化证据：[poi-coverage.json](../../exports/stage-9-walking-live/poi-coverage.json)

## 6. Matrix 精确时间

- endpoint profile：`foot-walking`
- 方式：单源多目标
- 目的地：`284`
- 每批最大：`500`
- 并发：`1`
- 实际批次/请求：`1 / 1`
- retry：`0`
- ok/null/invalid：`284 / 0 / 0`
- 30分钟内/out-of-range：`254 / 30`
- 10/20/30 分钟互斥圈层：`39 / 85 / 130`
- 守恒：`39 + 85 + 130 + 30 + 0 + 0 = 284`
- 结果指纹：`c4a00b9309bdd758ad6313c068a3321151e6576079c78fa97cc78db75c67578f`

边界规则为 `<=600`、`<=1200`、`<=1800`，其余进入 `matrix-out-of-range`；null 与 invalid 保留审计记录，不伪造时间、不静默丢弃。

结构化证据：[matrix-summary.json](../../exports/stage-9-walking-live/matrix-summary.json)

## 7. 普通模式与研究模式一致性

两种模式均读取分析 ID `analysis-name-cloud-7823d8e3-5c27-4a22-8b78-be5939c4e2ba` 的会话缓存结果：总 POI 284、eligible 254、圈层 39/85/130、out-of-range 30，DOM 名称标签节点 254。

研究模式显示“数据来源：当前在线任务缓存（与普通模式同一结果）”。由于本轮在线 eligible 为 254，而第43号研究算法冻结基线为 252，研究面板只展示同一在线结果，并明确提示“第43号 252 基线实验保持冻结，未重算”；没有把 254 数据静默套入旧实验，也没有修改第22号或第33/37/41/43号布局算法。

结构化证据：[browser-evidence.json](../../exports/stage-9-walking-live/browser-evidence.json)

## 8. 请求预算与缓存复跑

| 阶段 | Isochrones | OpenPOIService | Matrix | Geocoder | Directions |
| --- | ---: | ---: | ---: | ---: | ---: |
| 批准上限 | 1 | 2 | 2 | 0 | 0 |
| 首页加载 | 0 | 0 | 0 | 0 | 0 |
| 首次完成（新增上游） | 0 | 1 | 1 | 0 | 0 |
| 同参数复跑（新增上游） | 0 | 0 | 0 | 0 | 0 |

缓存复跑 job：`f0dbb825-55d6-40c0-b676-5e0503b96697`；输入指纹：`9579b48f9570c9ba340c98a22b1562703134012469b7199785fc5367f94b9525`；状态：`completed`；published：`true`。页面完成后观测到 API 余量显示 `495`。

## 9. 浏览器截图与 SHA-256

- [stage45-walking-isochrones.png](../../exports/stage-9-walking-live/stage45-walking-isochrones.png) — `d1a4b320e3928ab6c1c5a8e0bda0306b23f9dcf6e485a47d715f59848c1863c8`
- [stage45-walking-panmap.png](../../exports/stage-9-walking-live/stage45-walking-panmap.png) — `1a21def2b2626103dae8a2420cac94f2d1bd03e3f6bee02814b1ba94787f1bda`
- [stage45-walking-research-mode.png](../../exports/stage-9-walking-live/stage45-walking-research-mode.png) — `4a77c04fd10ba9265db32074e2ad0d30418bbe3577c0c4fac7144f25f43e380f`

哈希清单：[screenshot-sha256.json](../../exports/stage-9-walking-live/screenshot-sha256.json)

## 10. 测试结果

```text
node --check app.js
node --check src/research/research-mode.js
node --check src/api/analysis-client.js
node --test src/**/*.test.js
→ 91 passed, 0 failed

PYTHONPATH=server server/.venv/bin/python -m unittest discover -s server/tests -p 'test_*.py'
→ 88 passed, 0 failed
```

浏览器控制台错误：0。后端 unittest 仅有现存 FastAPI/httpx 与 Pydantic 弃用警告，无失败。

## 11. 本阶段实际修改文件

- `app.js`
- `index.html`
- `src/api/analysis-client.js`
- `src/research/research-mode.js`
- `server/app/main.py`
- `server/app/providers/poi/ors_remote.py`
- `server/app/services/analysis.py`
- `server/app/services/matrix_accessibility.py`
- `server/app/services/walking_job_ledger.py`
- `server/tests/test_matrix.py`
- `server/tests/test_stage45_walking_job.py`
- `exports/stage-9-walking-live/stage45-baseline.json`
- `exports/stage-9-walking-live/request-ledger.json`
- `exports/stage-9-walking-live/isochrones.json`
- `exports/stage-9-walking-live/poi-coverage.json`
- `exports/stage-9-walking-live/matrix-summary.json`
- `exports/stage-9-walking-live/browser-evidence.json`
- `exports/stage-9-walking-live/cache-rerun.json`
- `exports/stage-9-walking-live/screenshot-sha256.json`
- `exports/stage-9-walking-live/stage45-walking-isochrones.png`
- `exports/stage-9-walking-live/stage45-walking-panmap.png`
- `exports/stage-9-walking-live/stage45-walking-research-mode.png`
- `docs/ors-migration/46-stage-9-ors-walking-clickthrough-live-report.md`

## 12. 停止声明

第45号文档已完成，第46号报告与全部结构化证据、真实 PNG、SHA-256 已生成。未启动骑行、驾车、巴黎、类别聚类、评分热度、部署或下一阶段任务；现立即停止。

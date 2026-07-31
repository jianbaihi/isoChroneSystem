# 第 5 阶段补充验证报告：ORS 配额观测与黄鹤楼步行名称云

执行日期：2026-07-30  
对应执行文档：`docs/ors-migration/17-stage-5-ors-quota-walking-name-cloud-execution.md`

## 1. 结论

| 验收项 | 状态 | 结论 |
| --- | --- | --- |
| API 配额被动观测 | 完成 | 等时圈、地点搜索和 POI 三个服务独立显示；每类只随一次正常真实请求取得观测，没有余额探测请求；缓存复跑显示“上次观测”和“未消耗上游请求”。 |
| 黄鹤楼步行 10/20/30 分钟名称云 | 完成 | 真实步行 Polygon 和一次 OpenPOIService Polygon 查询生成 282 个互斥分段具名 POI；108 个标签成功摆放，174 个明确计入未摆放；无类别节点；缓存复跑为零上游且布局指纹一致。 |

本报告继承第 16 号报告已证明的真实 ORS 等时圈、后端响应、Store、MapLibre 和传统地图链路。本次没有推翻或替换这些能力，只补充了配额观测、未分类名称云、独立 loading、缓存语义与联动验收。

## 2. 修改文件与职责

### 前端

- `index.html`：中心点搜索和推荐地点、名称云按钮、配额面板、名称云专属概览、资源版本号。
- `styles.css`：搜索下拉、圈层眼睛按钮、两套独立 loading、配额面板、名称云标签及专属概览样式。
- `app.js`：中心点搜索、参数匹配、等时圈与 POI 独立请求状态、配额渲染和跨服务合并、缓存“上次观测”、名称云入口及地图联动。
- `panmap-layout.js`：固定三圈名称云框架、确定性候选搜索、矩形碰撞和圈层边界检查、placed/unplaced 输出。
- `src/adapters/panmap-layout-adapter.js`：taxonomy 为空时按互斥时间 band 直接生成 POI 名称标签输入。
- `src/api/analysis-client.js`、`src/contracts/analysis-contracts.js`、`src/state/analysis-store.js`：名称云请求、响应契约、成功结果和交互状态。
- `src/config/app-config.js`、`src/config/center-presets.js`：武汉黄鹤楼默认中心与巴黎埃菲尔铁塔推荐地点。

### 后端

- `server/app/services/quota.py`：白名单 rate-limit header 解析、三服务独立状态、403/429 区分。
- `server/app/adapters/ors.py`、`server/app/providers/geocoder.py`、`server/app/providers/poi/ors_client.py`：在正常上游请求上被动采集配额；认证信息只留在服务端。
- `server/app/services/ors_cache.py`：等时圈、地点搜索、POI 缓存和命中元数据。
- `server/app/services/geometry.py`：外圈测地面积与互斥 ring 几何。
- `server/app/providers/poi/ors_remote.py`：单 Polygon POI 请求、名称规范化、稳定 ID 去重、互斥圈层分配及 coverage 统计。
- `server/app/services/analysis.py`、`server/app/main.py`、`server/app/models.py`：名称云 API、面积闸门、响应 metadata 和前端白名单契约。

### 测试与证据

- `server/tests/test_quota.py`：大小写不敏感、畸形值、403/429、缓存语义和服务隔离。
- `server/tests/test_ors_remote_analysis.py`、`server/tests/test_ors_remote_poi.py`、`server/tests/test_stage5_interactive.py`、`server/tests/test_centers.py`：真实模式契约、POI 名称云、中心点和交互路径。
- `src/adapters/panmap-layout-adapter.test.js`、`src/config/center-presets.test.js`、`src/state/analysis-store.test.js`：空 taxonomy 三圈输入、冻结预设和 Store 行为。
- `exports/stage-5-live/`：三张最终浏览器证据图。

## 3. 测试

中止恢复后的基线和最终回归使用同一组默认离线命令，均为零公网：

```text
PYTHONPATH=server server/.venv/bin/python -m unittest discover -s server/tests -p 'test_*.py'
node --test src/**/*.test.js
PYTHONPATH=server server/.venv/bin/python -m compileall -q server/app
find src -name '*.js' -type f -print0 | xargs -0 -n1 node --check
node --check app.js
git diff --check
```

结果：

- 后端：44/44 通过；
- 前端：14/14 通过；
- Python 编译、全部 JavaScript 语法和 `git diff --check` 通过；
- 另行针对性执行配额测试 11/11、空 taxonomy 名称云输入测试 1/1；
- 仅出现 FastAPI/TestClient 和 Pydantic 的弃用警告，没有测试失败。

## 4. API 配额观测

主验收上游预算实际为：

- Isochrones：1 次；
- Geocoder autocomplete：1 次；
- OpenPOIService POI：1 次；
- 余额探测请求：0 次。

三类真实响应都返回了可解析的 rate-limit 字段。下表是正常请求产生的非敏感观测值，时间使用 UTC；页面按 Asia/Shanghai 显示：

| 服务 | limit | remaining | observedAt | resetAt |
| --- | ---: | ---: | --- | --- |
| Isochrones | 500 | 478 | 2026-07-30T14:34:00Z | 2026-07-31T01:29:01Z |
| Geocoder | 1000 | 994 | 2026-07-30T15:14:50Z | 2026-07-31T02:58:31Z |
| POI | 500 | 488 | 2026-07-30T14:34:55Z | 2026-07-31T01:29:03Z |

配额面板位于页面顶栏的折叠按钮下方，不遮挡主画布。三个服务各自保存状态；地点搜索返回服务级观测时，前端只合并 Geocoder 行，不覆盖已有 Isochrones/POI 行。

缓存命中时：

- 保留原 `observedAt` 和数值；
- 行状态显示“上次观测”；
- 面板说明显示“本次命中缓存，未消耗上游请求”；
- 不制造新的观测时间或余额。

403 与 429 分别转译为 `upstream-403` 和 `rate-limited`；仅返回 remaining、limit、resetAt、observedAt、freshness、requestSource 和可选 retryAfterSeconds。认证凭据和完整响应 headers 不进入前端契约。

## 5. 冻结场景和几何

- 中心：武汉·黄鹤楼，`[114.296944, 30.546944]`，WGS84；
- profile：`foot-walking`；
- ranges：`10/20/30` 分钟，即 `600/1200/1800` 秒；
- 真实响应：3 个嵌套 `Polygon`；
- 30 分钟外圈类型：`Polygon`；
- 30 分钟外圈测地面积：`9.769500 km²`；
- 安全闸门：`9.769500 < 45 km²`，通过。

没有用圆、bbox、buffer、fixture 或驾车等时圈替代真实步行 Polygon。

## 6. POI 请求与 coverage

用户主动点击“生成步行名称云”后，后端只对 30 分钟外圈执行一次 OpenPOIService 请求：

```text
request=pois
geometry.type=Polygon
limit=2000
sortby=category
```

实际 coverage：

- strategy：`outer-isochrone-single-polygon`；
- requests：1；
- complete / fullyCovered：true；
- outerRangeSeconds：1800；
- resultLimit：2000；
- resultTruncated：false；
- datasetCompleteness：unknown。

该结果只证明本次公共接口响应在此次请求契约内完成，不代表现实世界 POI 完整性。

## 7. 名称清洗、去重与互斥圈层

名称优先级为：

1. `name:zh`；
2. `name:zh-CN`；
3. `name`；
4. `name:en`。

字典型名称内部按 `zh-CN`、`zh`、`en`、`default` 选择；随后执行 Unicode NFKC、首尾及连续空白规范化，并过滤空名、URL、电话号码样式和内部 ID。

真实计数：

| 指标 | 数量 |
| --- | ---: |
| raw | 430 |
| parsed | 282 |
| named | 282 |
| unnamed | 148 |
| deduplicated | 282 |
| outside outer Polygon | 0 |
| invalid（不含 unnamed） | 0 |

148 条被明确归因于 `name_missing`。互斥 band 计数为：

| band | POI |
| --- | ---: |
| 0–10 分钟 | 54 |
| 10–20 分钟 | 121 |
| 20–30 分钟 | 107 |
| outside exclusive rings | 0 |

`54 + 121 + 107 + 0 = 282`，与 deduplicated/named 数守恒。边界点优先归入更早圈层，三个 band 互斥。

## 8. 名称云布局

本次复用现有 SVG 泛地图渲染器，但为名称云增加了独立模式：

- 不生成 category 节点，taxonomy 为空不阻塞；
- 按 POI 名称长度和稳定 `poiId` 排序；
- 使用固定三圈框架和黄金角候选搜索；
- 每个标签最多检查 720 个确定性候选；
- 用文本测量后的矩形包围盒做碰撞检查；
- 同时检查内外半径，标签不能跨出所属时间 band；
- 放不下的标签进入 unplaced，不截断或伪造。

这里采用的是固定三圈框架，不是数据驱动 KDE 或最终包络线。

字号统一为 13 px、600 字重，只表示可读性；颜色表示步行时间 band。字号不表示 POI 重要性，页面也明确展示这一说明。

布局结果：

| band | available | placed | unplaced |
| --- | ---: | ---: | ---: |
| 0–10 分钟 | 54 | 16 | 38 |
| 10–20 分钟 | 121 | 28 | 93 |
| 20–30 分钟 | 107 | 64 | 43 |
| 合计 | 282 | 108 | 174 |

DOM 包围盒验收：

- 已摆放标签：108；
- 重叠对数：0；
- 圈层边界违规：0；
- 真实首次结果与缓存复跑的排序坐标指纹长度均为 3583，内容完全一致。

## 9. 地图、Store、联动和缓存

最终页面状态：

- Store 状态：success；
- draft/submitted profile：`foot-walking`；
- draft/submitted ranges：`10,20,30`；
- MapLibre analysis source：`ors-public-api`；
- MapLibre POI feature count：282；
- 屏幕时间 band：10、20、30；
- `.name-cloud-label`：108；
- `.category-cluster`：0；
- 可见 MapLibre canvas：1。

传统地图和名称云使用相同 `poiId`：

- 点击名称标签会设置 selected POI，并高亮传统地图对应点；
- 悬停传统地图点会设置 hovered POI，并高亮对应名称标签；
- 实测样本覆盖 30 分钟标签点击和 20 分钟地图点悬停；
- 联动期间上游请求：0。

相同参数复跑通过已有缓存：

- Isochrones 上游请求：0；
- Geocoder 上游请求：0；
- POI 上游请求：0；
- 三个缓存文件的首次 miss 时间未被复跑改写；
- 页面显示“缓存命中”“上次观测”和“未消耗上游请求”。

浏览器验收中应用 MapLibre 状态为空（无应用错误提示），单一 canvas 保持不变。后端请求日志只出现本地业务端点；缓存条目只保存白名单 metadata 和响应摘要，不保存认证 headers。截图和页面未出现 Key。

## 10. 截图

- `exports/stage-5-live/wuhan-huanghelou-walking-10-20-30-name-cloud.png`
- `exports/stage-5-live/api-quota-status-panel.png`
- `exports/stage-5-live/walking-name-cloud-map-link.png`

另保留真实传统地图过程图：

- `exports/stage-5-live/wuhan-huanghelou-walking-10-20-30-traditional.png`

## 11. 已知限制与未执行范围

- 公共 POI 数据集完整性未知；
- 282 个具名 POI 中只有 108 个可在当前固定画布无重叠摆放，其余 174 个已明确计数；
- 本阶段故意不建立统一 taxonomy，不提供分类树或无限下钻；
- 未实现 POI 评分、重要性映射、Matrix 精确通行时间或最终 KDE/数据驱动包络线；
- 巴黎只保留推荐中心，没有执行巴黎名称云；
- 武汉 30 分钟驾车完整 POI 94-cell 继续未执行；
- 没有执行 Overture 对比或正式 POI 数据集任务；
- 没有提交、推送或创建 PR。

本次完成第 5 阶段补充验证后停止，**未进入正式第 6 阶段**。

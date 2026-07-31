# ORS 迁移第 3 阶段实施报告

## 完成状态

完成：第 3 阶段的双 provider 实现、模拟测试、真实 ORS 等时圈联调、浏览器闭环和失败保留视图均已验证。

本阶段停在“真实 ORS 等时圈 + 模拟 POI”边界，没有开始真实 POI、Matrix、PostGIS 或 MapLibre 接入，也没有进入第 4 阶段。

## 验收范围

本阶段实现了以下边界：

- `ANALYSIS_PROVIDER=mock` 为安全默认值；`ors` 仅在显式真实联调命令中启用。
- `OrsAdapter` 使用 ORS Isochrones V2，支持 `foot-walking`、`cycling-regular`、`driving-car`。
- ORS FeatureCollection 先转换为内部 `CumulativeIsochrone`，后端再做累计几何差集生成互斥环带。
- POI 仍是开发 fixture；没有虚构 `travelTimeSeconds` 或 `importanceScore`。
- `metadata.source` 保持兼容，并增加 `metadata.sources.isochrones` 与 `metadata.sources.pois`。
- 上游超时、认证、限流、拒绝、不可用和非法响应均映射为统一错误；响应包含安全的 `X-Request-ID`，不透传原始 ORS 正文或凭据。
- 浏览器只请求本地 FastAPI；浏览器源码没有 ORS URL、API Key、`Authorization` 或 `Bearer`。

## 文件变更

### 新增

- `server/app/services/analysis.py`：按 provider 分派分析流程。
- `server/app/services/geometry.py`：Shapely 2.x 几何校验、修复、累计等时圈差集。
- `docs/ors-migration/05-stage-3-contract-addendum.md`：第 3 阶段内部契约补充。
- `server/tests/fixtures/ors_isochrones_success.json`：无密钥的 ORS 成功响应 fixture。
- `server/tests/test_ors_adapter.py`、`server/tests/test_geometry.py`、`server/tests/test_analysis_api.py`：适配器、几何和 provider API 测试。

### 修改

- `server/app/config.py`：provider、ORS 地址、超时和 provider readiness 配置校验。
- `server/app/adapters/ors.py`：真实 ORS V2 请求映射和安全错误映射。
- `server/app/models.py`：`CumulativeIsochrone`、`AnalysisSources` 及结果字段。
- `server/app/main.py`：动态 health、provider 分派、统一错误和请求 ID。
- `server/app/services/mock_analysis.py`：mock 来源元数据和 `includePois=false` 语义。
- `server/requirements.txt`：增加 `shapely>=2.0,<3`。
- `server/.env.example`：补全开发配置，`ORS_API_KEY` 保持为空。
- `src/contracts/analysis-contracts.js`、`app.js`：消费累计等时圈、来源元数据和真实 ORS 状态提示。
- `panmap-layout.js`：仅增加 API 布局输入、稳定 `data-*` 标识和无效输入保留视图适配；原有碰撞检测、KDE、包络线和 SVG 布局计算函数未改写。
- `docs/ors-migration/03-internal-data-contracts.md`：仅增加指向第 3 阶段契约补充的指针，第 2 阶段历史内容保留。

## 实际命令与结果

以下命令均在项目目录 `/Users/zhangzhihan/Desktop/项目的UI界面` 下执行。实际虚拟环境为 Python 3.14，满足本阶段要求的 Python 3.11+ 范围。

### 依赖安装

```bash
cd server
.venv/bin/python -m pip install 'shapely>=2.0,<3'
.venv/bin/python -m pip install -r requirements.txt
```

结果：Shapely 2.1.2 已安装；随后完整 `requirements.txt` 检查为全部满足。首次受限沙箱安装因网络/DNS 失败，之后在获准的本地网络环境完成安装。

### 后端自动测试

```bash
cd server
.venv/bin/python -m unittest discover -s tests -v
```

结果：`Ran 26 tests in 0.044s`，`OK`，26 项全部通过。测试覆盖：

- mock health、合法分析、坐标/范围非法请求、`calculateTravelTimes=true` 的 501 未实现错误；
- ORS 请求 endpoint、profile、body、headers、超时、上游错误、缺少服务端 Key、无效响应；
- Polygon/MultiPolygon 校验、无效几何修复、累计等时圈差集、空差集失败；
- `mock`、`mixed`、`ors` 来源矩阵及 request ID / `Retry-After`。

自动化 ORS 测试使用 `httpx.MockTransport` 和本地 fixture，不访问真实 ORS，不使用真实密钥。

测试输出只有 Starlette/httpx 的兼容性弃用提示，没有失败。

### 静态检查

```bash
python3 -m compileall -q server/app server/tests
node --check app.js
node --check src/contracts/analysis-contracts.js
node --check src/api/analysis-client.js
node --check src/state/analysis-store.js
node --check src/adapters/panmap-layout-adapter.js
git diff --check
```

结果：全部退出码为 0。

## FastAPI 验收

### mock 模式

以不加载真实配置文件的方式启动：

```bash
cd server
.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

已验证：

- `GET /api/v1/health` 返回 200、`mode=mock`、`providerReady=true`，并返回 `X-Request-ID`。
- 合法 `POST /api/v1/analyses` 返回 200，保留 center/profile/ranges，请求 ID 在响应 header 和 metadata 中一致。
- 非法坐标和非法时间阈值返回统一 `VALIDATION_ERROR`。
- `calculateTravelTimes=true` 返回 501、`FEATURE_NOT_AVAILABLE`。
- mock 结果的 `rings[].geometry` 为空，POI 的 `travelTimeSeconds` 与 `importanceScore` 为 `null`。

### 真实 ORS 联调

仅在这一步显式切换 provider：

```bash
cd server
ANALYSIS_PROVIDER=ors .venv/bin/python -m uvicorn app.main:app --env-file .env --host 127.0.0.1 --port 8000
```

`.env` 仅由运行时加载；本次没有读取、打印或提交其中任何密钥值。

通过本地 FastAPI 实际请求 ORS，三个 profile 均返回 200：

| profile | API | source | isochrones | rings | geometry | POI | travelTime |
|---|---:|---|---|---|---|---:|---|
| `foot-walking` | 200 | `mixed` | `ors` | 10/20/30 | Polygon | 18 | 全部 `null` |
| `cycling-regular` | 200 | `mixed` | `ors` | 10/20/30 | Polygon | 18 | 全部 `null` |
| `driving-car` | 200 | `mixed` | `ors` | 10/20/30 | Polygon | 18 | 全部 `null` |

响应只记录了状态、来源、数量和几何类型等摘要，没有记录原始 ORS response 或 Authorization header。

联调结束后已停止 `ors` 服务，并恢复本地 mock 服务；当前运行服务不使用真实 ORS provider。

## 浏览器验收

前端页面通过本地页面和本地 FastAPI 完成：

```text
页面参数
→ AnalysisRequest
→ FastAPI mock / ORS 模拟或真实等时圈接口
→ AnalysisResult
→ AnalysisStore
→ Panmap Adapter
→ 泛地图重新绘制
```

### mock 成功闭环

- 页面点击“生成可达域”后提示：`模拟分析已完成：10 / 20 / 30 分钟圈层`。
- 再进入泛地图后，页面为 `app-shell is-panmap`。
- DOM 中有 3 个时间圈层，时间标识为 `30`、`20`、`10`；有 27 个类别节点。
- 泛地图布局引擎标识仍为 `force-collision+kde-polar-level-set`。
- POI 使用稳定 `data-poi-id` / `data-poi-ids`，没有依赖 DOM 顺序作为唯一标识。

### 真实 ORS 成功闭环

在真实 ORS 服务运行期间，页面成功显示：`真实 ORS 等时圈已生成；POI 仍为模拟数据。`，随后成功进入泛地图。页面仍然得到 3 个圈层、27 个类别和同一布局引擎标识。

### API 失败保留最近一次有效视图

停止 ORS API 后再次点击生成，页面提示：`分析失败：Failed to fetch（已保留当前泛地图）`。此前已渲染的 3 个圈层和 27 个类别仍保留，未被清空或静态回退覆盖。恢复 mock 服务后再次生成成功。

浏览器页面错误/警告日志检查结果为空。

## 算法与安全边界

- Shapely 只负责后端几何校验、必要的 polygonal `make_valid` 和环带差集；没有引入真实 POI、Matrix、PostGIS 或地图瓦片服务。
- `panmap-layout.js` 保留原有碰撞检测、KDE、包络线和 SVG 布局流程；第 3 阶段只让其接收内部 API 数据并携带稳定数据标识。
- 浏览器范围扫描：

  ```bash
  rg -n -i 'api\.openrouteservice|openrouteservice\.org|authorization|bearer|ORS_API_KEY|ors_api_key' src app.js index.html
  ```

  结果：无匹配。

- 后端/示例范围扫描未读取 `server/.env`；只发现后端配置名、空的 `ORS_API_KEY=` 示例占位、测试用 `fixture-key` 和后端 Authorization header 构造。没有真实 Key 值进入源码、报告或提交内容。
- `server/.env.example` 已补全且 `ORS_API_KEY=` 为空；真实 `server/.env` 未修改、未打印、未纳入提交。

## 已知限制与停点

- POI 仍为 mock fixture，尚未接入真实 POI provider。
- `calculateTravelTimes=true` 仍明确返回未实现错误，未接入 Matrix。
- 未接入 PostGIS，也未接入 MapLibre。
- ORS 实际返回的是累计等时圈；POI 圈层归属仍是 fixture 语义，没有通过真实路网时间重新计算。
- 默认运行配置保持 `mock`，真实 ORS 仅用于本次显式联调。

第 3 阶段验收完成后停止，等待后续明确的第 4 阶段任务。

# ORS 迁移第 2 阶段实施报告

## 完成状态

完成：第 2 阶段代码闭环、FastAPI 模拟接口、自动测试和浏览器成功闭环均已验证。

## 已完成

- 冻结 `AnalysisRequest`、`AnalysisResult`、`Center`、`Ring`、`Poi`、`Category` 和统一错误结构。
- 新增原生 JavaScript 契约校验、`AnalysisStore`、自有 Analysis Client 和 Panmap Adapter。
- 新增 FastAPI 后端骨架、健康检查、模拟分析接口、统一错误处理、CORS 配置和 ORS 占位边界。
- 既有 `panmap-layout.js` 保留原碰撞、环带、密度采样、KDE 和 SVG 算法，仅包装输入、保存最近一次有效输入并补充稳定 `data-*` ID。
- 页面生成入口改为读取 UI 参数、调用本地 Analysis API、写入 Store，并在成功时通过 Adapter 重建泛地图；失败时保留已有泛地图。
- 收尾修正泛地图父级节点的 `data-poi-ids` / 子级节点的单值 `data-poi-id` 边界，确保渲染的单值 POI ID 唯一且稳定。
- 未修改 `styles.css`、传统地图静态 SVG、真实外部服务、数据库、MapLibre 或前端框架。

## 文件变更

### 新增

- `.gitignore`
- `src/config/app-config.js`
- `src/contracts/analysis-contracts.js`
- `src/state/analysis-store.js`
- `src/api/analysis-client.js`
- `src/adapters/panmap-layout-adapter.js`
- `server/app/__init__.py`
- `server/app/config.py`
- `server/app/errors.py`
- `server/app/models.py`
- `server/app/main.py`
- `server/app/adapters/__init__.py`
- `server/app/adapters/ors.py`
- `server/app/services/__init__.py`
- `server/app/services/mock_analysis.py`
- `server/tests/__init__.py`
- `server/tests/test_api.py`
- `server/.env.example`
- `server/requirements.txt`
- `docs/ors-migration/03-internal-data-contracts.md`
- `docs/ors-migration/04-stage-2-implementation-report.md`

### 修改

- `index.html`：只登记新增脚本，并保留原有页面结构。
- `app.js`：接入请求快照、Store、API Client、加载/错误状态、动态 Adapter 结果和交互状态写入。
- `panmap-layout.js`：静态 `fallbackLayers` 回退、参数化输入、最近一次有效输入和稳定渲染 ID。

### 未触碰

- `styles.css`
- 传统地图静态 SVG 路径、文字和结构
- 既有用户未提交的阶段 1 执行文档、现有 `docs/ors-migration/01-current-state-audit.md` 和 `02-target-boundaries.md`

## 数据闭环

- UI → `AnalysisRequest`：`app.js` 的 `buildAnalysisRequestFromUI()` 从中心点、交通方式、选中阈值和 POI 类别生成规范化请求；内部统一 `[lon, lat]` 语义。
- FastAPI 模拟接口：`GET /api/v1/health` 与 `POST /api/v1/analyses`；后者只生成开发 fixture，不访问互联网。
- `AnalysisResult` → Store：成功写入 `result/status=success`；请求开始写入 `request/status=loading`；异常写入统一 `error/status=error`。
- Store → Panmap Adapter → 泛地图：`buildPanmapLayers()` 按 `ringId`、`categoryId` 聚合，传给 `window.rebuildPanmapLayout()`；布局算法仍由 `panmap-layout.js` 执行。

## 实际验收命令与结果

### 运行环境与依赖

```bash
cd server
.venv/bin/python --version
.venv/bin/python -m pip install -r requirements.txt
```

结果：Python `3.14.3`（满足 Python 3.11+）；`fastapi=0.140.0`、`uvicorn=0.51.0`、`httpx=0.28.1` 均已安装。

### 自动检查与后端测试

```bash
cd server
.venv/bin/python -m unittest discover -s tests -v
cd ..
python3 -m compileall -q server/app server/tests
for file in app.js panmap-layout.js src/config/app-config.js \
  src/contracts/analysis-contracts.js src/state/analysis-store.js \
  src/api/analysis-client.js src/adapters/panmap-layout-adapter.js; do
  node --check "$file"
done
git diff --check
```

结果：7 项后端测试全部通过；Python 编译、全部 JavaScript 语法检查和 Git 差异检查通过。测试过程有 Starlette/httpx 与 Pydantic 弃用提示，但没有失败。

### 服务启动

前端：

```bash
python3 -m http.server 5500 --bind 127.0.0.1
```

后端：

```bash
cd server
.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

两个本地服务均成功启动并保持运行。

### FastAPI 接口验收

使用本地 Python `urllib.request` 验收脚本依次调用 `GET /api/v1/health` 和 `POST /api/v1/analyses`，结果如下：

| 验收项 | 实际结果 |
|---|---|
| 健康检查 | `200`，`status=ok`、`mode=mock` |
| 合法请求 | `200`，`source=mock`、`ranges=[10,20,30]`、3 个 rings、27 个 POI、geometry/travelTime 均为空 |
| 越界坐标 | `422 VALIDATION_ERROR`，包含 `requestId` |
| 非法 profile | `422 VALIDATION_ERROR`，包含 `requestId` |
| 重复/乱序时间阈值 | `422 VALIDATION_ERROR`，包含 `requestId` |
| `calculateTravelTimes=true` | `501 FEATURE_NOT_AVAILABLE`，包含 `requestId` |

### 浏览器成功闭环

浏览器打开 `http://127.0.0.1:5500/`，点击“生成可达域”并进入“泛地图探索”后：

- UI 参数生成请求，浏览器只向自有 `http://127.0.0.1:8000/api/v1/analyses` 发起请求。
- Store 状态为 `success`，提示为“模拟分析已完成：10 / 20 / 30 分钟圈层”。
- `.organic-map` 布局版本由静态回退的 `1` 更新为 `2`。
- 泛地图包含 3 个圈层，`ringIds` 为 `ring-20-30`、`ring-10-20`、`ring-0-10`。
- 包含 27 个动态类别节点，即 3 个圈层 × 9 个一级类别；类别 ID 为稳定的 `food`、`shopping`、`hotel`、`service`、`transit`、`medical`、`scenic`、`leisure`、`education`。
- 渲染出 81 个唯一的单值 `data-poi-id`，父级聚合节点使用 `data-poi-ids`。
- 布局引擎标记仍为 `force-collision+kde-polar-level-set`，页面无 error/warning 日志。

### 浏览器失败保留视图

停止 FastAPI 后再次点击“生成可达域”：Store 进入 `error`，提示“已保留当前泛地图”；布局版本仍为 `2`，3 个圈层和 27 个类别节点未被清空。随后已重新启动 FastAPI，页面恢复为成功结果展示。

### 算法与安全边界

- `git diff --unified=0 -- panmap-layout.js` 显示修改仅涉及 fallback 输入、Adapter 输入兼容、稳定 `data-*` ID 和最近一次有效输入；`resolveCollisions`、`densitySamples`、`kdeContour`、`catmullRomClosed`、`blobPath` 等核心函数未被改写。
- 外部边界扫描命令：`rg -n -i 'api\\.openrouteservice|openrouteservice\\.org|authorization|bearer|ors_api_key|ORS_API_KEY' src app.js index.html server/app server/.env.example`。结果仅有 `ORS_API_KEY=` 配置占位和后端配置读取占位，没有 ORS URL、真实 API Key 或 Authorization/Bearer 凭据。

## 已知限制

- 当前数据为 mock fixture，尚未接入 ORS、POI、Matrix、PostGIS 和 MapLibre。
- `geometry` 和 `travelTimeSeconds` 按契约为空；未实现真实等时圈、路网时间或空间归属。
- 当前页面的传统地图仍是静态 SVG；本阶段没有做传统地图与泛地图的 POI 双向联动。
- 当前仅验证本地 mock 数据闭环，真实服务接入仍属于后续阶段。

## 用户已有修改如何被保留

执行前 `git status --short` 显示用户未提交的阶段 1 执行文档和 `docs/` 内容；本阶段未覆盖、清理、移动或回退这些文件。根目录 `.DS_Store` 也未处理。

## 第 3 阶段开始前仍需确认的问题

- 确认模拟 fixture 的类别 ID、类别数量口径和成功响应后的视觉基线，再进入真实 ORS Isochrones Adapter。
- 确认真实 ORS 配置只进入后端运行环境，并在进入第 3 阶段前确定超时、限流和请求追踪策略。

## 变更统计

执行 `git diff --stat`（仅统计已跟踪文件）结果为：

```text
 app.js           | 212 +++++++++++++++++++++++++++++++++++++++++++++++++------
 index.html       |   9 ++-
 panmap-layout.js |  48 +++++++++++--
 3 files changed, 238 insertions(+), 31 deletions(-)
```

新增的 `src/`、`server/`、契约文档和实施报告当前仍是未跟踪文件，因此不计入上述 Git 统计；本报告不复制长日志或整段源码。

## 停点

已按要求在第 2 阶段结束后停止，没有开始第 3 阶段。

# 第 4 阶段实施报告：参数 UI、地图选点与双视图联动

状态：**完成**

完成日期：2026-07-27

本阶段严格按《ORS地图服务重构_Codex执行文档_第4阶段（更新版）》的 13 个步骤执行。第 4 阶段完成了参数 UI、地图选点、MapLibre 底图、ORS 等时圈、泛地图/传统地图双视图联动及收尾验收。

本阶段没有开始真实 POI、Matrix、Geocoding 或 PostGIS；这些能力仍属于后续阶段。验收完成后已停止继续扩展。

## 1. 基线检查

执行命令：

~~~
git status --short
git diff --stat
git check-ignore -v server/.env
rg --files -g '!server/.env' -g '!server/.venv/**'
~~~

结果：

- 保留了工作区中已有的用户改动、阶段文档及未跟踪文件，没有执行破坏性清理。
- server/.env 仍由 .gitignore 忽略；本次没有读取、打印或提交其内容。
- 现有 mock 页面可完成一次分析闭环，默认生成 10 / 20 / 30 分钟三层和 27 个类别。
- 基线后端测试为 26 个，全部通过。

## 2. 内部契约补充

新增文档：

- docs/ors-migration/07-stage-4-contract-addendum.md

该文档明确了：

- AnalysisRequest、AnalysisResult、MapRingFeature 和 MapCenterFeature 的职责边界；
- parameterDraft、lastSubmittedRequest、lastSuccessfulResult 的 Store 生命周期；
- WGS84 坐标顺序为 [longitude, latitude]；
- 地图选点只更新 draft，不自动发起分析；
- MapLibre 仅负责传统地图渲染，Panmap Adapter 仅负责泛地图渲染；
- mock 模式不伪造等时圈几何；
- 失败请求必须保留最近一次有效视图；
- 本阶段不接入真实 POI、Matrix、Geocoding、PostGIS。

## 3. ORS 服务地址与真实 ORS 验证

将后端默认 ORS 地址统一迁移为：

~~~
https://api.heigit.org/openrouteservice
~~~

涉及文件：

- server/app/config.py
- server/tests/test_ors_adapter.py
- server/.env.example

server/.env.example 已补全为不含密钥的模板，包含运行地址、CORS、ANALYSIS_PROVIDER=mock、ORS 地址、空的 ORS_API_KEY 占位和超时配置。真实密钥仅由本地未提交的 server/.env 提供，本次没有将其写入任何报告或代码。

执行后端单元测试：

~~~
cd server
.venv/bin/python -m unittest discover -s tests -v
~~~

结果：26 个测试全部通过。

在独立本地端口临时启动 ORS provider 后，分别验证：

- foot-walking：HTTP 200，来源为 ors，10 / 20 / 30 分钟，3 个 Polygon 圈层；
- cycling-regular：HTTP 200，来源为 ors，10 / 20 / 30 分钟，3 个 Polygon 圈层；
- driving-car：HTTP 200，来源为 ors，10 / 20 / 30 分钟，3 个 Polygon 圈层。

真实 ORS 验证完成后已停止 ORS provider，并恢复 FastAPI mock provider。未读取或输出 API Key，未输出 Authorization 头或原始响应。

## 4. MapLibre 版本与资源加载

当前应用是无构建步骤的传统 HTML/JavaScript 页面，因此采用固定版本的 UMD 浏览器资源：

- MapLibre GL JS 5.24.0
- CSS：https://cdn.jsdelivr.net/npm/maplibre-gl@5.24.0/dist/maplibre-gl.css
- JS：https://cdn.jsdelivr.net/npm/maplibre-gl@5.24.0/dist/maplibre-gl.js

官方资料：

- [MapLibre GL JS v6.0.0 release](https://github.com/maplibre/maplibre-gl-js/releases/tag/v6.0.0)
- [MapLibre WebGL 支持示例](https://maplibre.org/maplibre-gl-js/docs/examples/check-if-webgl-is-supported/)

选择固定 5.24.0 是为了兼容当前无构建、脚本直接加载的页面；MapLibre 当前更新版本为 ESM-only，不能直接替换为本项目现有的 UMD 加载方式。资源加载由 src/map/maplibre-loader.js 统一报告 ready/error 状态。

## 5. OSM 底图与传统地图容器

新增：

- src/config/map-config.js
- src/map/maplibre-loader.js
- src/adapters/traditional-map-adapter.js

底图配置：

- OSM 标准瓦片：https://tile.openstreetmap.org/{z}/{x}/{y}.png；
- minZoom=0、maxZoom=19；
- © OpenStreetMap contributors 及版权链接；
- 初始缩放级别为 12。

传统地图只创建一个 MapLibre 实例。普通视图、紧凑视图和分屏视图复用同一实例及同一容器；只通过容器尺寸和 CSS 布局变化实现视图切换。运行时会移除旧的传统静态 SVG 地图和旧的 mini SVG 地图，避免旧算法继续绘制活动地图。

## 6. 参数 UI 与地图选点

app.js 已将页面控件统一同步到 Store 的 parameterDraft，请求构造只从 Store draft 读取，不再直接从 DOM 拼装第二份请求。

已实现：

- 步行、骑行、驾车 profile 切换；
- 分钟阈值的输入、添加、删除、可见性切换及排序去重；
- preset 中心点选择；
- 地图选点按钮、十字准星状态和 Escape/再次点击取消路径；
- 地图选点后显示五位小数的经纬度，并保留 WGS84 语义；
- 地图选点只更新 draft，不触发请求。

浏览器验证了一组非默认参数：

~~~
profile = foot-walking
ranges = 5, 15, 30
~~~

页面显示 5 / 15 / 30 分钟，并成功将相同参数提交到 FastAPI mock 接口；返回结果进入 AnalysisStore 后驱动两种地图视图。

## 7. AnalysisResult 到 GeoJSON

新增：

- src/map/analysis-map-geojson.js
- src/map/analysis-map-geojson.test.js

该转换层只接受后端返回的 Polygon / MultiPolygon 几何，校验有限经纬度及 WGS84 范围，并生成稳定的 Feature.id、ringId 和中心点 Feature。mock 结果没有真实圈层几何时，不生成伪造 Polygon。

本地 Node 测试覆盖：

- Polygon 转换；
- MultiPolygon 转换；
- 非法/空几何跳过；
- bounds 计算及稳定 ID。

## 8. 传统地图 Adapter 与图层

TraditionalMapAdapter 只接受规范化后的 AnalysisResult，不读取原始 API 响应，也不发起 API 请求。

MapLibre source/layer：

- source：analysis-rings、analysis-center、analysis-draft-center；
- layer：圈层填充、外框、高亮、hover、中心点 halo/point、draft 中心点。

每次新的 analysisId 只更新 GeoJSON source 并进行一次合适的 bounds 调整。圈层颜色按照外层时间阈值映射，活动圈层和 hover 圈层使用稳定过滤条件。

## 9. Store 状态与双向选中联动

Store 当前保留：

- parameterDraft；
- lastSubmittedRequest；
- lastSuccessfulResult；
- requestStatus；
- activeRingId、hoveredRingId、isMapPickMode。

成功时保存最新有效结果；失败时只更新错误状态，不清空最近一次有效结果。传统地图点击圈层会更新 Panmap 的活动圈层；Panmap 点击圈层会反向更新传统地图的活动样式。

真实 ORS 浏览器验证中，传统地图点击后观察到 Panmap 活动层变化；随后点击 Panmap 圈层，传统地图活动状态反向更新。稳定 ID 使用 ring-{inner}-{outer} 格式，避免使用数组索引作为联动依据。

## 10. 模式切换与分屏验收

验证结果：

- Panmap 模式：传统地图缩略容器约为 240 x 160，MapLibre canvas 数量为 1；
- split 模式：传统地图容器约为 403 x 558，MapLibre canvas 数量仍为 1；
- 普通模式与 split 模式切换后，地图可继续 resize，圈层状态和活动 ID 保留；
- Panmap 仍使用原有布局、碰撞检测、KDE、包络线和 SVG 布局逻辑；本阶段只新增 API/Store/Adapter 桥接，没有改写这些算法。

## 11. 全部自动化测试

后端：

~~~
cd server
.venv/bin/python -m unittest discover -s tests -v
python3 -m compileall -q app tests
~~~

结果：26 个后端测试全部通过，Python 编译检查通过。

前端语法与单元测试：

~~~
node --check app.js
node --check panmap-layout.js
node --check src/config/app-config.js
node --check src/config/map-config.js
node --check src/contracts/analysis-contracts.js
node --check src/state/analysis-store.js
node --check src/api/analysis-client.js
node --check src/adapters/panmap-layout-adapter.js
node --check src/adapters/traditional-map-adapter.js
node --check src/map/analysis-map-geojson.js
node --check src/map/maplibre-loader.js
node --test src/map/analysis-map-geojson.test.js src/state/analysis-store.test.js src/contracts/analysis-contracts.test.js
git diff --check
~~~

结果：7 个前端测试全部通过；全部 JavaScript 语法检查通过；git diff --check 通过。

## 12. 浏览器端到端验收

启动命令：

~~~
# 前端
python3 -m http.server 5500

# 后端 mock
cd server
.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
~~~

接口验证：

- GET /api/v1/health：成功，显示 mock provider 就绪；
- 合法 POST /api/v1/analyses：成功返回 AnalysisResult；
- 坐标、profile、时间阈值等非法请求：按契约返回校验错误；
- calculateTravelTimes=true：返回明确的未实现错误，没有静默伪造 travel time。

mock 浏览器闭环：

~~~
页面参数
→ AnalysisRequest
→ FastAPI mock 接口
→ AnalysisResult
→ AnalysisStore
→ Panmap Adapter
→ 泛地图重新绘制
~~~

验证结果：

- Store 状态为 success；
- 页面 toast 为“模拟分析已完成：10 / 20 / 30 分钟圈层”；
- mock 结果的 analysisSource=mock；
- mock 不生成伪造圈层几何，传统地图保留 MapLibre 底图及中心点；
- 泛地图显示 API 返回的结果状态，不使用静态 SVG 回退；
- 三个圈层和 27 个类别符合预期；
- 运行时旧地图 SVG 均不存在，MapLibre canvas 存在且数量为 1。

真实 ORS 浏览器闭环中，按顺序验证了：

- driving-car：成功，3 个 ORS Polygon 圈层，27 个模拟类别；
- cycling-regular：成功，3 个 ORS Polygon 圈层，27 个模拟类别；
- foot-walking：成功，3 个 ORS Polygon 圈层，27 个模拟类别。

失败保留视图验证：停止 ORS provider 后重新提交请求，页面显示 Failed to fetch 错误，但仍保留最近一次有效的 3 个圈层、27 个类别和 MapLibre canvas，未退回静态地图。

地图选点验证：选点后页面显示“地图选点”及 WGS84 经纬度，Store 保持 idle，没有生成新的 submitted request；取消选点后回到普通交互状态。

浏览器页面自身错误/警告日志为空。浏览器宿主输出过一次 Statsig 网络超时，该请求不属于项目页面代码，也不影响页面验收。

## 13. 安全、范围与最终结论

执行的安全扫描：

~~~
git check-ignore -v server/.env
rg -n -i 'ORS_API_KEY|Authorization|Bearer|api.openrouteservice.org|maps.openrouteservice.org' index.html app.js src server/app server/tests server/.env.example
rg -n 'api.heigit.org/openrouteservice|api.openrouteservice.org' server/app server/.env.example
~~~

结果：

- 浏览器代码没有 ORS URL、API Key、Authorization 或 Bearer；
- ORS 地址只存在于后端配置及不含密钥的 .env.example；
- 浏览器不持有或转发 ORS 凭证；
- 未发现旧 ORS 主机地址仍被运行时代码使用；
- server/.env 被忽略，且没有被读取、打印或提交。

明确未做事项：

- 没有接入真实 POI；
- 没有接入 Matrix；
- 没有接入 Geocoding；
- 没有接入 PostGIS；
- 没有实现真实 POI 点、标签或聚合；
- 没有开始第 5 阶段或其他后续阶段工作。

结论：第 4 阶段 13 项要求均已完成并通过验收，状态改为“完成”。当前开发运行态已恢复为 ANALYSIS_PROVIDER=mock，并在本报告完成后停止继续执行。


# 第五阶段 ORS 真实页面交互执行报告

执行日期：2026-07-30  
执行依据：`docs/ors-migration/15-stage-5-ors-interactive-ui-execution.md`  
执行边界：本报告只覆盖第五阶段续执行；未开始第六阶段。

## 1. 三项独立状态

| 项目 | 状态 | 结论 |
|---|---|---|
| ORS 等时圈页面交互 | 核心闭环已打通，完整阶段验收仍为部分完成 | 黄鹤楼驾车 10/20/30 已在真实页面看到三个 ORS Polygon；缓存、步行、骑行、搜索、固定预设、地图选点均已核验。浏览器权限模拟定位和真实失败竞态只完成代码/单元边界核验，未冒充完整 H 阶段通过。 |
| ORS POI 小范围预览 | 部分完成 | 用户主动触发的 1000 m Point + buffer 真实请求成功，传统地图显示 136 个点，coverage 明确为 preview 且 `complete=false`。本次 live 响应没有返回可用的 taxonomy category 记录，因此泛地图没有生成 POI 类别节点；这不被标记为完整 POI 交互通过。 |
| 武汉 30 分钟 POI 完整覆盖 | 未执行 | 已知初始计划为 94 个 cell，当前冻结预算为 40；本次没有提高预算、没有执行 94-cell 任务。 |

## 2. 对第 14 号报告的继承

第 14 号报告中“后端真实 ORS 等时圈成功、500 m POI 冒烟成功、30 分钟完整 POI 因 94/40 预算阻塞、浏览器真实验收未执行”的事实继续成立。本次只补齐真实页面快速等时圈和小范围预览，不覆盖历史报告，也没有把小范围预览写成正式研究数据。

## 3. 页面此前看不到真实等时圈的根因

代码核对确认此前页面仍由历史静态泛地图/结果摘要作为主要可见状态，快速等时圈没有在页面入口显式走 `includePois=false` 的本地后端路径；真实响应也没有被同时作为 Store、MapLibre source 和屏幕摘要的验收对象。另有三个可见的历史残留：结果卡硬编码旧 POI 统计、泛地图中心标签硬编码“望京广场”、正常可达域页面中的 Panmap 搜索工具栏默认隐藏。

本次处理为：快速生成路径固定显式 `includePois=false`；结果 metadata 驱动状态、结果卡和 MapLibre；泛地图中心标签跟随成功分析中心；地点/profile/阈值变更后禁用旧 POI 预览并要求重新生成；搜索工具在进入泛地图后可见并可操作。此前一次使用 `localhost:5500` 的浏览器检查还受到 CORS origin 不匹配影响，最终使用本地 `127.0.0.1:5500` 与显式 API base URL 完成验证。

## 4. 本次涉及的主要文件

- `app.js`、`index.html`、`styles.css`、`panmap-layout.js`：快速 ORS 请求、真实/缓存状态、结果统计、地点/交通/阈值控制、地图选点、预览按钮保护、单一 MapLibre 与泛地图中心联动。
- `src/config/center-presets.js`、`src/config/app-config.js`：武汉/巴黎固定中心与非敏感本地 API 地址覆盖。
- `src/contracts/analysis-contracts.js`、`src/state/analysis-store.js`、`src/api/analysis-client.js`：统一 Center、请求归一化、draft/success 分离、真实结果和 POI preview 客户端。
- `src/adapters/traditional-map-adapter.js`、`src/map/analysis-map-geojson.js`、`src/map/analysis-poi-geojson.js`、`src/adapters/panmap-layout-adapter.js`：真实 GeoJSON、单一地图实例、等时圈/POI source 与泛地图布局衔接。
- `server/app/main.py`、`server/app/models.py`、`server/app/config.py`、`server/app/providers/geocoder.py`、`server/app/providers/poi/ors_remote.py`、`server/app/adapters/ors.py`、`server/app/services/analysis.py`：ORS 等时圈、Geocoder、一次性 POI preview、缓存与安全 metadata。
- `docs/ors-migration/15-stage-5-ors-interactive-ui-execution.md`：执行文档原样归档。
- `exports/stage-5-live/`：真实页面截图和既有非敏感验证证据。

## 5. 自动测试与静态检查

本次复跑结果：

- 后端：`./.venv/bin/python -m unittest discover -s tests -q`，39 项通过。
- 前端：`node --test $(rg --files src | rg '\\.test\\.js$' | sort)`，13 项通过。
- Python：`./.venv/bin/python -m compileall -q app tests`，通过。
- JavaScript：`node --check app.js`、`panmap-layout.js`、analysis client/contracts/store，通过。
- `git diff --check`，通过。

新增/已覆盖的边界包括：固定武汉/巴黎中心、阈值去重排序和 1–60 分钟校验、统一 Center source、Map pick 互斥、失败保留上一成功结果、未知 ring 忽略、taxonomy 主路径和旧响应状态分离。真实联网测试没有改变默认离线测试行为。

## 6. 凭据与隐私

- ORS Key 只由后端进程加载；没有写入前端、URL、响应、日志、截图、报告或缓存键。
- 浏览器只请求本地后端 API；前端没有携带认证头。
- 页面 diagnostics 最终为 0 条记录、0 条项目错误；浏览器控制层曾出现外部 telemetry 超时，但不属于项目页面日志，也未写入报告证据。
- 当前位置只实现用户主动点击后的 `navigator.geolocation` 分支；本次没有读取、记录或报告执行机器真实位置。
- 地图选点只做了一次性模式验证，报告不记录所选坐标。

## 7. 四种 Center 入口

| 入口 | 结果 |
|---|---|
| 固定预设 | 默认显示 `武汉·黄鹤楼`，坐标为 `[114.296944, 30.546944]`；巴黎预设为 `巴黎·埃菲尔铁塔`，坐标为 `[2.294478, 48.858297]`。修复了按中文 label 选择巴黎预设时错误回退到武汉的问题。 |
| Geocoder | 后端 `黄鹤楼` 搜索 HTTP 200、5 条结果；`Eiffel Tower` 页面搜索 HTTP 200、8 条结果，选择第一条后中心统一进入 Geocoder Center。坐标文本 `114.296944,30.546944` 在后端本地解析为 1 条结果，不消耗 Geocoder 上游请求。 |
| 浏览器当前位置 | 代码只在点击“使用当前位置”后请求权限，并处理拒绝、超时、不可用和非法坐标；本次未进行浏览器权限模拟，因此不宣称该入口完成 live E2E。 |
| 地图点选 | 真实页面进入一次性点选模式，点击传统地图后立即退出，draft center source 为 `map-click`，旧 ORS 结果保留但 POI 预览被禁用，状态提示先生成新等时圈。 |

## 8. Geocoder 处理

前端使用约 350 ms 防抖、AbortController 和 sequence ID；后端校验文本、size、focus 和经纬度，并对安全最小结果做缓存。中文搜索、拉丁文字搜索、坐标文本和 reverse 路由均已通过后端验证；重复的 `黄鹤楼` 查询命中缓存。页面搜索结果支持结果按钮选择，地点变更不会自动触发完整 POI 查询。

## 9. Profile 与时间阈值

- 页面驾车映射 `driving-car`，步行映射 `foot-walking`，骑行映射 `cycling-regular`；公交、地铁等未展示。
- 黄鹤楼步行页面真实请求返回 `ors-public-api`、3 个 Polygon；骑行页面真实请求返回 `ors-public-api`、3 个 Polygon。
- 后端真实冒烟还覆盖了 Paris 固定预设驾车、武汉步行和武汉骑行，均 HTTP 200、3 个有效 Polygon。
- 默认阈值为 10/20/30 分钟；快捷值为 5/10/15/20/30/45/60；请求归一化为整数、去重、升序、秒数，并限制 1–10 个及 1–60 分钟。
- 页面第一次真实阻塞请求为：中心 `[114.296944, 30.546944]`、profile `driving-car`、ranges `[600,1200,1800]` 秒、`includePois=false`。

## 10. 黄鹤楼页面四方证据

首次浏览器真实运行使用新的本地缓存命名空间。页面向本地后端发出 1 个分析请求；后端 ORS Adapter 首次为 cache miss 并走 1 个 Isochrones 上游请求。HTTP 200 响应中有 3 个 feature，geometry 类型均为 `Polygon`，对应 600/1200/1800 秒。

同一页面的四方证据如下：

1. 后端响应 metadata：`isochroneProvider=ors-public-api`、`isLive=true`、首次 `cacheHit=false`、`featureCount=3`、`profile=driving-car`、`rangesSeconds=[600,1200,1800]`。
2. Store：保存本次 `lastSuccessfulResult`，draft 与 success 结果分离。
3. MapLibre：只有 1 个实例和 1 个 canvas；`traditionalMap` 的 ring feature count 为 3，source 为真实 ORS。
4. 屏幕：显示“武汉·黄鹤楼”、驾车、10/20/30 分钟和三个可见真实圈层；状态显示“ORS 实时等时圈 · 已请求上游”或缓存命中。

## 11. 缓存与旧结果保护

同一 center/profile/ranges 再次提交时，页面显示“ORS 实时等时圈 · 缓存命中”，3 个圈保持一致；本地后端再次收到分析请求，但 ORS 上游请求数为 0。步行、骑行、Paris 页面请求均使用同一真实 Adapter 和缓存边界。

新中心、profile 或阈值进入 draft 后，POI 预览按钮被禁用并提示先生成新的等时圈；不会把旧 POI 贴到新参数上。Store 单元测试证明失败保留上一成功结果，旧响应不能覆盖参数草稿；真实页面的地图选点也验证了这一保护。真实网络失败注入和快速竞态页面测试未在本轮伪造为通过。

## 12. POI preview 证据

- 触发方式：用户主动点击“加载附近 POI 预览”。
- 半径：1000 m；只允许 500/1000/2000 m。
- 上游请求：1 个 Point + buffer 请求；没有自动扩大半径、递归或完整格网查询。
- HTTP 200；返回并解析 136 个 POI；传统 MapLibre source 的 POI feature count 为 136。
- live metadata：`mode=preview-radius`、`complete=false`、`fullyCovered=false`、`radiusMeters=1000`、`requests=1`。
- UI 明确显示“POI 预览：1000 m · 未代表完整覆盖”，结果卡显示 3 个圈层、136 个 POI、预览状态。
- 本次 live 返回的可分类 category 记录为 0，因此传统地图点已显示，但泛地图没有生成真实 POI 类别节点；该限制已保留在状态结论中，没有用静态类别或完整覆盖数字补齐。

## 13. 传统地图、泛地图和实例数量

传统地图使用同一 Analysis Store 的 3 个真实圈层和 136 个 preview POI；进入泛地图不会新增 ORS 请求，单一 MapLibre 实例仍为 1 个，传统地图缩小到左下角。泛地图中心标签已改为跟随当前成功结果，武汉页面显示“武汉·黄鹤楼”，不再显示历史“望京广场”。由于 live preview 没有 category records，泛地图的 POI 标签/类别树尚未宣称完成。

## 14. 截图与证据文件

已生成以下相对路径：

- `exports/stage-5-live/wuhan-huanghelou-driving-10-20-30.png`
- `exports/stage-5-live/ors-center-search-controls.png`
- `exports/stage-5-live/ors-profile-threshold-switch.png`
- `exports/stage-5-live/ors-poi-preview-panmap.png`

第一张显示黄鹤楼、驾车、10/20/30 分钟、三个真实圈、OSM 底图、缓存命中状态且不含凭据。POI 截图显示用户主动加载的 1000 m 预览和 136 个地图点，未标记为完整研究范围。

## 15. 非敏感请求消耗摘要

本轮只报告请求次数，不报告账户配额、认证信息或响应头：黄鹤楼首次 Isochrones 1 个上游请求；完全相同请求复跑 0 个 Isochrones 上游请求；步行、骑行和 Paris 各完成真实分析冒烟；Geocoder 完成武汉、巴黎、坐标文本和 reverse 验证；POI preview 为 1 个上游请求。没有执行 94-cell 完整 POI 计划。

## 16. 尚未完成与停止条件

- 未完成浏览器权限模拟定位、权限拒绝/超时的 live UI 证据；只保留实现和错误分支。
- 未完成真实网络失败注入、快速连续不同请求的浏览器级证据；已有 Store/contract 回归不替代该证据。
- POI preview 的传统地图已成功，但 live taxonomy 为空，泛地图 POI 类别节点尚未完成；不可把 136 点当成正式研究统计。
- 武汉 30 分钟完整 POI 仍为 94 cell 对 40 budget 的独立阻塞；本次未提高预算、未下载或导入 Overture、未创建 ready dataset。
- 未执行巴黎完整 POI、全国数据、离线瓦片、部署、Matrix、本地 ORS/OpenPOIService 或其他第六阶段内容。

第五阶段续执行到此停止。没有开始第六阶段。

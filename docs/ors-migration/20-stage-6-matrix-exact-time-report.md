# 第 6 阶段第 1 步：现有步行 POI 的 Matrix 精确时间执行报告

状态：完成

执行文档：`docs/ors-migration/19-stage-6-matrix-exact-time-execution.md`

本报告完成后按第 19 号文档停止，不执行第 21 号及后续任务。

## 1. 结果摘要

本次复用第 18 阶段的黄鹤楼步行 10/20/30 分钟等时圈与 282 个具名去重 POI，完成一次 ORS Matrix `foot-walking` one-to-many 真实请求，并按路网估算时长重新判定时间圈层。

- Matrix 请求 POI：282；
- 合法 Matrix 状态：282/282；
- null：0；
- 非法值：0；
- 30 分钟内：252；
- 超出 30 分钟：30；
- 空间圈层与 Matrix 圈层不一致：91；
- 首次真实 Matrix 上游请求：1；
- 相同输入缓存复跑 Matrix 上游请求：0。

`travelTimeSeconds` 是 ORS 当前步行路网图的估算值，不是实时到达时间或绝对真值。

## 2. 工作树与基线保护

执行期间没有 clean、reset、回退、提交、推送或创建 PR，也没有清理或覆盖进入本阶段前的 UI 修改。

保留的既有 UI 修改包括：

- 中心点搜索框、推荐地点与贴边下拉联想；
- 快捷时间阈值自动合并排序；
- 圈层眼睛式显示/隐藏；
- 等时圈与 POI 独立 loading；
- 单列地图缩放控件与单一比例尺。

第 19 号文档已原样归档，并通过逐字文件比对。

## 3. 第 18 阶段缓存审计

审计直接读取安全缓存，不请求网络：

- 原始 POI：430；
- 具名去重 POI：282；
- 唯一稳定 `poiId`：282；
- 坐标合法：282/282；
- 空间圈层：`54 / 121 / 107`；
- 外圈之外：0；
- 有序 POI ID + 坐标指纹：`e02425d21eb26cb9791b440f2609240817c8253d13bdc0cc47146180e437c754`。

因此没有重新调用 Isochrones、Geocoder 或 OpenPOIService。

## 4. 实现内容

### 后端

- 新增严格 one-to-many 的 ORS Matrix Adapter；
- 固定使用 `/v2/matrix/foot-walking`；
- 请求中显式发送一个 source 和 282 个 destinations；
- 同时请求 `duration`、`distance`，距离单位为米，并启用 resolved locations；
- 严格校验 `1 × N` 行列维度、POI 顺序、null、负值、NaN、Infinity 与零时长吸附点；
- 新增独立 `PoiAccessibility`，不把与中心/profile 相关的时间写入 POI 主体；
- 仅完整 Matrix 结果可原子替换前端成功状态；部分失败返回统一错误并保留旧结果；
- 新增稳定批次 ID、凭据安全缓存、迁移矩阵、分布统计与结果指纹；
- quota 增加独立 `matrix` 服务，不复用旧服务余量；
- 新增本地业务端点 `POST /api/v1/matrix-accessibility`。

### 前端

- 名称云完成后启用“补齐精确时间”显式动作；
- 摘要显示 `Matrix 已计算 X/Y`、圈内、超出范围和异常数；
- 传统地图与泛地图仍通过相同 `poiId` 联动；
- 选中 POI 显示“Matrix 路网估算：分钟 秒钟”和路网距离；
- 圈层计数和名称云 band 使用 Matrix 归属；
- 失败不调用 Store 的错误覆盖流程，旧完整结果继续保留；
- 旧响应没有 `accessibility` 时保持兼容。

## 5. 真实请求契约与预算

真实 Matrix 请求结构：

```text
locations: 283（中心 1 + POI 282）
sources: ["0"]
destinations: ["1", ..., "282"]
metrics: ["duration", "distance"]
units: "m"
resolve_locations: true
OD pairs: 1 × 282 = 282
```

官方当前 Matrix 上限仍为每次 3500 个 origin×destination 对，本次未使用 dynamic arguments，282 对在限制内：

- [ORS API Restrictions](https://openrouteservice.org/restrictions/)
- [ORS Matrix endpoint](https://giscience.github.io/openrouteservice/api-reference/endpoints/matrix/)

本次真实上游计数：

| 服务 | 上游请求 |
| --- | ---: |
| Isochrones | 0 |
| Geocoder | 0 |
| POI | 0 |
| Matrix | 1 |

浏览器产生 1 次首次本地 Matrix 业务请求和 1 次缓存复跑请求；后端日志均为 200。首次响应 metadata 为 `cache=miss / upstreamRequestCount=1`，复跑为 `cache=hit / upstreamRequestCount=0`，没有自动重试或分批。

## 6. Matrix 结果

### 圈层计数

| 圈层 | 空间包含 | Matrix 时长 |
| --- | ---: | ---: |
| 0–10 分钟 | 54 | 39 |
| 10–20 分钟 | 121 | 83 |
| 20–30 分钟 | 107 | 130 |
| 超出 30 分钟 | 0 | 30 |
| 合计 | 282 | 282 |

### 迁移矩阵

| 空间圈层 → Matrix 圈层 | 0–10 | 10–20 | 20–30 | 超出 30 |
| --- | ---: | ---: | ---: | ---: |
| 0–10 | 39 | 13 | 0 | 2 |
| 10–20 | 0 | 70 | 48 | 3 |
| 20–30 | 0 | 0 | 82 | 25 |

不一致合计为 `13 + 2 + 48 + 3 + 25 = 91`。没有用直线距离修补或把超出范围 POI 塞回 30 分钟圈层。

### 数值分布

| 指标 | min | median | p90 | max |
| --- | ---: | ---: | ---: | ---: |
| duration（秒） | 58.73 | 1306.235 | 1815.84 | 2498.38 |
| distance（米） | 81.57 | 1814.24 | 2522.04 | 3470.02 |

非敏感 provider 信息：

- routing graph date：`2026-07-28T19:03:26Z`；
- calculated at：`2026-07-31T10:50:31Z`；
- Matrix batch：`ors-matrix-c43f2e88afb746a60bd71ecf`；
- 结果指纹：`5f969170a27089acbe6d4e59abf03d8cf3b56404de35c1370b9831b4c7203c6e`；
- 原始响应 SHA-256：`ba14a06cfb779f1ecb8680d7368ba3983f9e61a20e5d5616976e598f844f5a34`。

页面抽查样本：`中船重工719研究所 · Matrix 路网估算：27 分 54 秒 · 路网距离 2.33 千米`。

## 7. 缓存、幂等与配额

Matrix 安全缓存：

```text
data/generated/ors-cache/stage-5-name-cloud-resume-20260730/821d9ce4a9edd68ab92aa0671f96ab320c2a67f78fe37a110e41c3f07395d03e.json
```

缓存键包含 provider、profile、中心、按顺序排列的 POI ID 与坐标、metrics、units、options 和 adapter version；不包含 API Key。缓存文件只保存请求身份、响应与白名单 metadata，不保存认证 headers。

同一输入复跑证明：

- Matrix 上游：0；
- `calculatedAt` 保持 `2026-07-31T10:50:31Z`；
- batch ID、duration、distance、band 与结果指纹保持不变；
- quota `observedAt` 没有伪造更新；
- 页面显示“缓存命中，未消耗上游请求”。

首次 Matrix 正常业务响应被动观测到 `remaining=499 / limit=500`。新启动的后端进程没有伪造旧三类服务观测，所以等时圈、地点搜索和 POI 行保持“未知”，Matrix 行独立显示 499 和“上次观测”。

## 8. 自动测试

- 后端全量离线回归：53/53 通过；
- 前端全量 Node 回归：17/17 通过；
- `node --check app.js`：通过；
- `git diff --check`：通过。

新增覆盖包括：

- 显式 source/destination 与稳定顺序；
- 正常、null、非法数值和维度错误；
- 600/1200/1800 秒边界、零时长与同点吸附；
- out-of-range 与不可达不可进入可见圈层；
- 部分失败不修改旧结果；
- 相同输入缓存命中与无第二次上游；
- Matrix quota 与旧服务隔离；
- 缓存与错误中无 Key；
- 前端摘要、分钟秒数、距离、Matrix band、缺失状态和旧响应兼容。

## 9. 浏览器验收与截图

在 `127.0.0.1:5500` 页面与 `127.0.0.1:8000` 后端完成短验收：

- 等时圈与名称云均从第 18 阶段缓存恢复；
- 首次 Matrix 结果为 282/282，页面圈层为 39/83/130；
- 名称云布局算法、颜色和字号未改，Matrix 重分圈后摆放 106、未摆放 146；
- POI 点击详情正确显示估算时间和路网距离；
- Matrix quota 独立显示；
- 缓存复跑显示 0 上游；
- 浏览器控制台 error/warning：0；
- 页面和截图不含 API Key、完整请求 headers 或本地绝对路径。

截图：

- `exports/stage-6-live/wuhan-huanghelou-matrix-exact-time.png`；
- `exports/stage-6-live/matrix-summary-poi-detail.png`；
- `exports/stage-6-live/matrix-quota-cache-hit.png`。

## 10. 已知限制与停止

- 本次只处理黄鹤楼、`foot-walking` 和 10/20/30 分钟冻结场景；
- 30 个 POI 的路网估算超过 1800 秒，仍保留在传统地图审计数据中，但不进入 30 分钟名称云；
- 公共 ORS 路网图更新后结果可能变化，缓存复跑只证明相同输入和同一缓存版本幂等；
- quota 仅来自正常业务响应的被动观测，不是账户全局账单或主动探测结果；
- 没有实现大范围 Matrix 分批、骑行或驾车 Matrix。

第 20 号报告已生成。按第 19 号文档要求立即停止，不执行第 21 号或其他后续功能。

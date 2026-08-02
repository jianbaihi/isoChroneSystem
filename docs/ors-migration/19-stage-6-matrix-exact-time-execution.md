# 第 6 阶段第 1 步：现有步行 POI 的 Matrix 精确时间执行文档

状态：待执行

直接基线：`docs/ors-migration/18-stage-5-ors-quota-walking-name-cloud-report.md`

执行完成后新增：

```text
docs/ors-migration/19-stage-6-matrix-exact-time-execution.md
docs/ors-migration/20-stage-6-matrix-exact-time-report.md
```

完成第 20 号报告后强制停止。不得自动执行第 21 号及后续文档。

## 0. 给 Codex 的直接指令

继续当前项目，只完成一个最小闭环：

```text
复用第 18 号报告的黄鹤楼步行三圈与 282 个去重具名 POI
→ 调用 ORS Matrix one-to-many
→ 为每个 POI 补齐路网估算 duration/distance
→ 以 Matrix duration 重新判定 0–10 / 10–20 / 20–30 分钟
→ 原子写入本次分析结果
→ 页面与报告显示 Matrix 覆盖率、异常数和精确时间
```

本次只处理 `foot-walking`，不请求骑行、驾车 POI，不重构标签云布局，不修改颜色和字号，不开始大范围 POI 分块。

必须先读取并保护当前工作树；不得 clean、reset、回退、提交、推送或创建 PR；不得读取、输出或报告 API Key。

## 1. 冻结场景与调用预算

| 参数 | 冻结值 |
| --- | --- |
| 中心 | 武汉·黄鹤楼 |
| 坐标 | `[114.296944, 30.546944]`，WGS84，经度在前 |
| profile | `foot-walking` |
| 阈值 | `[600, 1200, 1800]` 秒 |
| POI 基线 | 第 18 号报告中的 282 个去重具名 POI |
| Matrix metrics | `duration`、`distance` |
| Matrix source 数 | 1 |
| Matrix destination 数 | 282，若实际缓存数量不同则以审计值为准并说明 |

真实上游预算：

| 服务 | 最大次数 |
| --- | ---: |
| Isochrones | 0 |
| Geocoder | 0 |
| POI | 0 |
| Matrix | 1 |

若第 18 号 POI 缓存或稳定 POI 坐标已经丢失，立即停止并报告，不得自动重新请求 Isochrones/POI。若单次 Matrix 因明确的请求大小限制被拒绝，不得在本轮自动改成多批重试；先记录响应中的非敏感错误与建议批量大小，完成“部分实现/未完成”报告后停止。

## 2. 术语与数据边界

### 2.1 精确但不是实时真值

本项目字段 `travelTimeSeconds` 表示 ORS 当前路网图和选定 profile 的估算值。UI 使用：

```text
Matrix 路网估算：12 分 34 秒
```

不得写成“实际只需 12 分 34 秒”“实时到达时间”或“绝对精确”。

### 2.2 不把时间写进 POI 主体属性

同一 POI 从不同中心、采用不同交通方式时通行时间不同。保持两层对象：

```text
Poi
  poiId / source / name / longitude / latitude / category...

PoiAccessibility
  analysisRunId / poiId / center / profile / travelTimeSeconds / distanceMeters...
```

若当前项目尚未使用持久数据库，本次只扩展既有分析响应、Store 与安全缓存，不强行引入数据库迁移。

## 3. 请求契约

### 3.1 one-to-many Matrix

请求端点：

```text
POST /v2/matrix/foot-walking
```

请求体结构：

```json
{
  "locations": [
    [114.296944, 30.546944],
    [114.300000, 30.550000]
  ],
  "sources": ["0"],
  "destinations": ["1"],
  "metrics": ["duration", "distance"],
  "units": "m",
  "resolve_locations": true
}
```

真实请求中 `locations[0]` 始终是中心，后续位置与一个稳定有序的 `poiIds[]` 一一对应。必须显式发送 `sources` 和 `destinations`，不得遗漏后让 ORS 计算 `(N+1) × (N+1)` 全矩阵。

ORS 公共限制按 origin-destination 对计数；本场景是 `1 × 282 = 282`，低于当前官方 3500 对上限。[ORS API Restrictions](https://openrouteservice.org/restrictions/)

### 3.2 响应解析

必须校验：

- HTTP 成功并不等于所有 destination 成功；
- `durations` 与 `distances` 的外层 source 行数为 1；
- 内层长度必须等于 destination 数；
- `null`、负值、NaN、Infinity 或维度不一致不得转成 0；
- POI 映射严格依赖请求时保存的有序 `poiIds[]`，不能依赖对象遍历顺序；
- 若 resolved locations 提供吸附坐标与 `snapped_distance`，安全解析；缺失时保留 `null`；
- 记录响应中的非敏感 provider/engine/graph date（若存在），不保存完整 headers 或认证信息。

### 3.3 内部统一对象

建议字段；可适应现有命名，但语义必须等价：

```json
{
  "analysisRunId": "stable-run-id",
  "poiId": "stable-poi-id",
  "centerId": "wuhan-huanghelou",
  "profile": "foot-walking",
  "travelTimeSeconds": 754.2,
  "networkDistanceMeters": 914.6,
  "reachable": true,
  "matrixBandId": "10-20",
  "spatialBandId": "10-20",
  "bandAssignmentMethod": "matrix-duration",
  "routingProvider": "ors-public-api",
  "routingGraphDate": null,
  "calculatedAt": "ISO-8601",
  "snappedDistanceMeters": null,
  "matrixBatchId": "stable-batch-id",
  "matrixStatus": "ok"
}
```

保留 `spatialBandId` 只用于核对等时圈包含关系和 Matrix 结果差异。成功完成后，泛地图正式圈层归属使用 `matrixBandId`。

## 4. Matrix 分圈规则与异常审计

对每个合法 duration：

```text
0 < t ≤ 600       → 0–10 分钟
600 < t ≤ 1200    → 10–20 分钟
1200 < t ≤ 1800   → 20–30 分钟
t > 1800           → matrix-out-of-range
null / 非法值      → matrix-unreachable-or-invalid
```

要求：

- 边界值归入较早圈层；
- `t=0` 仅在目的地确实与中心吸附到同一点且响应合法时允许，否则标记异常；
- `matrix-out-of-range` 不进入 30 分钟标签云，但保留在传统地图审计状态；
- null 结果不得硬塞回空间圈层；
- 统计 `spatialBandId != matrixBandId` 的数量和迁移矩阵；
- 不用直线距离修补 Matrix 缺失值；
- Matrix 未全部成功时不得把半数结果原子替换为完整成功版本。

报告至少包含：

```text
requestedPoiCount
matrixOkCount
matrixNullCount
matrixInvalidCount
matrixOutOfRangeCount
matrixWithinRangeCount
spatialVsMatrixMismatchCount
duration min / median / p90 / max
distance min / median / p90 / max
```

## 5. 缓存、幂等与配额

### 5.1 缓存键

Matrix 缓存至少包含：

```text
provider
profile
center longitude/latitude
有序 destination poiId + 坐标 hash
metrics
units
routing options/version
matrix adapter version
```

不得包含 Key。时间阈值不是路径成本输入，可放在分析关联中，不应导致同一中心/profile/POI 的 Matrix 无意义重复计算。

### 5.2 配额面板

在第 18 号三服务 quota 观察器中增加独立 `matrix` 服务：

```text
等时圈 / 地点搜索 / POI / Matrix
```

只随真实 Matrix 业务响应被动更新。不得用 Isochrones 余额填充 Matrix；不得发送余额探测请求；缓存复跑显示“上次观测，本次未消耗上游请求”。

### 5.3 幂等

完全相同输入再次执行：

- 本地业务 API 可以响应；
- Matrix 上游请求为 0；
- `calculatedAt` 和 quota `observedAt` 不伪造为新值；
- 每个 POI 的 duration、distance、band 和排序指纹保持一致。

## 6. 后端与前端职责

### 6.1 后端

1. 新增或扩展 ORS Matrix Adapter；
2. 使用后端密钥，不允许浏览器直接调用 ORS；
3. 显式构造 one-to-many 请求；
4. 保存有序 POI 映射并严格校验响应维度；
5. 生成 `PoiAccessibility` 与汇总 metadata；
6. 对全部成功结果原子更新；
7. 将 Matrix 配额白名单状态合并到现有 quota 契约；
8. 缓存命中不联网；
9. 统一错误，禁止把完整上游 body 或 headers 返回前端。

### 6.2 前端

本次只做最小展示：

- 结果摘要增加“Matrix 已计算 X/Y”；
- POI hover/选中详情显示估算分钟秒数和路网距离；
- 圈层计数使用 Matrix band；
- 若 Matrix 未完整，维持上一次完整结果，并提示当前失败；
- 不在本次改变字号、颜色、胶囊样式或布局算法。

## 7. 分步实施

### 阶段 A：只读预检

1. 阅读第 18 号报告和本文；
2. 将本文原样归档到第 19 号路径；
3. 检查工作树和未跟踪目录，禁止清理；
4. 定位第 18 号 282 POI 的真实安全缓存；
5. 核对每个 POI 有稳定 ID 和合法 WGS84 坐标；
6. 检查当前 ORS HTTP client、缓存、quota 观察器和错误体系；
7. 运行与 Matrix 改动直接相关的离线基线测试。

缓存缺失或 POI 数无法守恒时停止。

### 阶段 B：契约与离线 Adapter

1. 先定义请求/响应模型；
2. 用 fixture 实现正常、null、维度错误、乱序风险和错误响应解析；
3. 实现稳定批次 ID 与缓存键；
4. 实现 Matrix band 与空间 band 差异统计；
5. 不联网完成单元测试。

### 阶段 C：服务与 UI 最小接线

1. 接入现有分析服务；
2. 增加 Matrix quota 行；
3. 增加 POI 精确时间详情和覆盖摘要；
4. 保持旧成功结果保护；
5. 不触碰布局样式。

### 阶段 D：一次真实 Matrix

1. 关闭自动重试；
2. 确认 Isochrones、Geocoder、POI Network 计数均为 0；
3. 对冻结的 282 POI 发起至多 1 次 Matrix 请求；
4. 校验维度、空值、异常、分圈和汇总；
5. 保存非敏感证据；
6. 相同输入复跑并证明 Matrix 上游为 0。

### 阶段 E：报告并停止

生成第 20 号报告，包含修改文件、测试结果、真实请求计数、Matrix 计数、分圈差异、缓存证据、已知限制与下一步建议，然后停止。

## 8. 自动测试最低要求

后端至少覆盖：

- `sources=[0]`、destinations 索引正确，未退化为全矩阵；
- 一个 source、N 个 destination 的正常响应；
- duration/distance 为 null；
- 响应长度过短、过长或外层行数不为 1；
- POI 请求顺序与响应映射一致；
- 600/1200/1800 秒边界；
- out-of-range 与 unreachable 不进入可见圈层；
- 部分失败不覆盖完整旧结果；
- 相同输入缓存命中；
- Matrix quota 与三类旧服务隔离；
- 错误和日志无 Key。

前端至少覆盖：

- Matrix 成功摘要；
- 精确时间/距离详情；
- Matrix band 计数；
- Matrix 缺失状态；
- 旧响应兼容，`travelTimeSeconds=null` 不崩溃。

## 9. 浏览器验收

只需一次短验收：

1. 使用 `127.0.0.1` 启动已有页面与后端；
2. 不刷新丢失第 18 号缓存；
3. 触发“补齐精确时间”或等价显式动作；
4. Network 确认仅 1 个本地 Matrix 业务请求，后端仅 1 个 Matrix 上游请求；
5. 查看三圈计数、一个 POI 的分钟秒数和 Matrix quota；
6. 复跑确认上游 0；
7. 截图不得含 Key、完整请求 headers 或本地绝对路径。

## 10. 时间盒与停止条件

- 单个测试命令最长 120 秒；
- 单个真实 Matrix 请求最长 60 秒；
- 浏览器验收最长 10 分钟；
- 本任务累计 60 分钟仍未完成时，生成断点版第 20 号报告并停止；
- 不允许为了赶时间跳过响应维度校验、缓存证明或异常计数。

以下情况立即停止：

- 第 18 号 POI 缓存缺失；
- 需要重新调用 Isochrones/POI 才能继续；
- 单次 Matrix 被明确限制拒绝；
- 响应无法稳定映射回 poiId；
- 发现 Key 可能进入前端、日志或缓存；
- Matrix 部分结果已污染旧完整状态。

## 11. 完成判据

只有同时满足以下条件才可写“完成”：

- 282 个 POI（或报告中经审计后的真实数量）全部有明确 Matrix 状态；
- 合法 duration/distance 与 poiId 一一对应；
- 可达 POI 按 Matrix duration 重新分圈；
- null/out-of-range/异常没有被伪造；
- 首次 Matrix 上游请求不超过 1；
- 相同输入复跑上游请求为 0；
- Matrix quota 独立显示；
- 测试通过且页面未改变当前标签布局样式；
- 第 20 号报告已生成并停止。

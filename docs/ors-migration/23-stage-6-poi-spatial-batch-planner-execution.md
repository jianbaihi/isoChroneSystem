# 第 6 阶段第 3 步：大范围 POI 空间分批规划与断点续跑执行文档

状态：待执行

直接基线：

- `docs/ors-migration/22-stage-6-d3-time-label-cloud-report.md` 已完成；
- 当前系统已有真实 Polygon 等时圈、OpenPOIService Adapter、缓存和 POI 去重；
- 已知黄鹤楼 30 分钟驾车外圈约 `1903.246 km²`，旧计划约 94 个 cell；
- ORS 公共 POI Polygon 最大面积为 50 km²。[ORS API Restrictions](https://openrouteservice.org/restrictions/)

执行完成后新增：

```text
docs/ors-migration/23-stage-6-poi-spatial-batch-planner-execution.md
docs/ors-migration/24-stage-6-poi-spatial-batch-planner-report.md
```

完成第 24 号报告后强制停止。本任务只实现和验证规划器，不真实执行大范围 POI 请求。

## 0. 给 Codex 的直接指令

为步行、骑行、驾车的大范围 POI 获取建立一个确定性、可预算、可缓存、可断点续跑的空间分批层。主验收必须完全离线：真实 Isochrones、POI、Matrix、Geocoder 上游调用均为 0。

目标：

```text
最外层真实等时圈 Polygon/MultiPolygon
→ 几何规范化与面积检查
→ 非重叠安全分片
→ 每片独立 POI 请求计划
→ 密集分片自适应细分规则
→ 请求预算与配额预检
→ 分片级缓存、检查点与恢复
→ coverage/截断/失败审计
```

不得在本次顺便抓取 94 个驾车 cell；不得增加真实 API 预算；不得把“规划完成”写成“数据完整获取”。

## 1. 为什么 POI 必须按交通方式规划

OpenPOIService 的查询本身不理解步行、骑行或驾车，它只按几何范围返回 POI。不同交通方式产生不同的最外层等时圈，因此流程应为：

```text
profile-specific outer isochrone
→ profile-specific POI query geometry
→ POI collection
→ same-profile Matrix
```

同一个 POI 可以出现在多个 profile 结果中：

- POI 主体只保存一份稳定 `poiId`；
- 每个 profile 保存独立 `PoiAccessibility`；
- 不复制成三个不同地点；
- 不把某个 profile 的 Matrix 时间用于另一个 profile。

## 2. 规划器输入与输出契约

### 2.1 输入

```json
{
  "center": {"longitude": 114.296944, "latitude": 30.546944},
  "profile": "driving-car",
  "rangesSeconds": [600, 1200, 1800],
  "outerGeometry": {"type": "Polygon", "coordinates": []},
  "poiFilter": null,
  "provider": "openpoiservice",
  "providerLimits": {
    "maxAreaKm2": 50,
    "requestLimit": 2000
  },
  "plannerConfig": {
    "targetPieceAreaKm2": 35,
    "maxSubdivisionDepth": 4,
    "minPieceAreaKm2": 0.1,
    "requestBudget": 20
  }
}
```

`requestLimit=2000` 只能在当前 Adapter/OpenAPI 已验证支持时使用；否则读取真实配置，不能为追求数量擅自发送非法 limit。

### 2.2 输出

```json
{
  "planId": "stable-plan-id",
  "planFingerprint": "sha256-like-stable-hash",
  "profile": "driving-car",
  "outerAreaKm2": 1903.246,
  "strategy": "non-overlapping-grid-intersection",
  "pieceCount": 0,
  "estimatedMinimumPoiRequests": 0,
  "reservedAdaptiveRequests": 0,
  "estimatedMaximumApprovedRequests": 0,
  "budgetStatus": "within-budget|approval-required|invalid",
  "pieces": [],
  "coverage": {
    "outerGeometryValid": true,
    "plannedAreaKm2": 0,
    "uncoveredAreaKm2": 0,
    "overlapAreaKm2": 0
  }
}
```

每个 piece 至少包含：

```json
{
  "pieceId": "stable-piece-id",
  "parentPieceId": null,
  "depth": 0,
  "geometry": {"type": "Polygon", "coordinates": []},
  "areaKm2": 0,
  "bbox": [0, 0, 0, 0],
  "geometryHash": "...",
  "status": "planned",
  "attemptCount": 0,
  "resultCount": null,
  "resultTruncated": null,
  "cacheHit": false
}
```

## 3. 几何规范化

1. 只接受真实 ORS `Polygon` 或 `MultiPolygon`；
2. 验证 WGS84 坐标、非空、闭合、合法；
3. 修复仅限安全的 ring orientation/轻微合法化；不得用 buffer 圆或 bbox 替代失败等时圈；
4. 对 MultiPolygon 保留所有非空组成部分；
5. 使用测地面积或可靠局部投影计算 km²；
6. 规划结果重新 union 后应覆盖原几何；
7. 分片之间内部不得重叠，公共边界允许；
8. 面积守恒误差阈值集中配置，建议不超过 `max(0.01 km², outerArea × 0.001)`；
9. 规划器不改变原等时圈存档。

## 4. 非重叠安全分片算法

### 4.1 单 Polygon 快速路径

若：

```text
outerAreaKm2 ≤ 45
```

生成单 piece。`45 km²` 是项目安全阈值，低于公共 50 km² 上限，不代表接口必须成功。

### 4.2 大范围路径

大于 45 km² 时：

1. 在适合中心纬度的局部等面积/米制投影中建立规则网格；
2. 目标网格面积默认 `35 km²`，为误差和复杂边界留余量；
3. 每个网格 cell 与 outer geometry 做 intersection；
4. 丢弃空交集；
5. MultiPolygon 交集拆成独立 Polygon piece；
6. 任一 piece 测地面积仍大于 45 km² 时递归四分；
7. 对 piece 按空间稳定顺序排序，例如 `minY、minX、geometryHash`；
8. `pieceId` 由 plan version + geometry hash 生成，不能使用数组临时序号作为唯一身份；
9. union 与面积守恒通过后才输出可执行计划。

不得使用互相覆盖的 buffer 或简单 bbox 请求后把 bbox 外 POI 当成合法结果。

### 4.3 密集分片的自适应细分

执行器将来收到某 piece 的 POI 结果时：

```text
resultCount < requestLimit
→ piece complete

resultCount == requestLimit 或上游明确 truncated
→ 当前 piece incomplete
→ 若 depth < maxDepth 且 area > minArea，分成 4 个互斥 child pieces
→ parent 标记 superseded-by-children
→ 只执行 children
```

若达到最大深度/最小面积仍截断：

- 标记 `incomplete-dense-piece`；
- 整个 profile 结果不得写 `fullyCovered=true`；
- 不无限细分；
- 不把返回上限等于“恰好完整”。

## 5. 请求预算与批准模型

### 5.1 计划阶段

至少计算：

```text
minimumRequests = initial piece count
adaptiveReserve = ceil(minimumRequests × 0.25)
plannedUpperBound = minimumRequests + adaptiveReserve
```

25% 只是首版预算储备，可配置。它不是密集区域完整性的保证。

预算状态：

```text
plannedUpperBound ≤ requestBudget
→ within-budget

plannedUpperBound > requestBudget
→ approval-required
```

### 5.2 配额检查

将来执行前需同时比较：

- 计划请求数；
- 用户明确批准预算；
- POI 最近一次 `remaining` 观测；
- 保留余量比例，默认至少 20%；
- 当前分钟窗口/429 状态。

quota 为 unknown 时：

- 小范围单 profile 可在明确批准下执行；
- “一次跑三种交通方式”不得静默开始；
- 不能把公开套餐上限当真实 remaining。

### 5.3 批准绑定

批准必须绑定：

```text
planFingerprint
profile
center
ranges
approvedPoiRequests
expiry/createdAt
```

几何、profile 或阈值变化后 fingerprint 改变，旧批准失效。不得用一次批准覆盖未来任意范围。

## 6. 分片级缓存与断点续跑

### 6.1 缓存键

```text
provider
geometryHash
poi filter/categories
request limit
adapter version
normalization version
```

profile 不必写进纯 POI 查询缓存键，因为同一 geometry 的 POI 数据与交通方式无关；profile 与 piece 的关联保存在 job manifest。

### 6.2 检查点

每完成一个 piece：

1. 验证并规范化响应；
2. 原子写入该 piece 缓存；
3. 更新 job manifest；
4. 保存 resultCount/truncated/quota observedAt；
5. 再开始下一个 piece。

中止后恢复：

- completed/cache-hit piece 不重新请求；
- failed piece 根据明确策略最多重试一次；
- running 但无完成记录的 piece 恢复为 pending；
- 不删除已完成缓存；
- 结果合并必须等所有必要叶子 piece 完成。

### 6.3 并发与限流

默认：

```text
POI_CONCURRENCY = 1
```

首版不追求并发最大化。只有在 quota/分钟限制和实际稳定性明确后才允许配置为 2。必须尊重 `Retry-After`，429 不得形成并发重试风暴。

## 7. 合并、去重与 coverage

所有完成叶子 piece 合并时：

1. 先按 `source + sourceId` 去重；
2. 再使用已有保守“名称 + 极近坐标”规则处理上游 ID 异常；
3. 公共边界上的重复 POI 只保留一次；
4. 同名异地必须保留；
5. 每个 POI 仍用原 outer geometry `covers` 做最终空间校验；
6. 记录 piece raw count、merged count、duplicate count、outside count；
7. 只有所有必要叶子完成、无截断、无未覆盖面积时才可 `fullyCovered=true`；
8. `fullyCovered` 只表示本次查询几何与请求计划完成，不表示现实世界 POI 数据完整。

## 8. 计划 API 与 UI

建议增加无上游调用的预检端点，名称可适应现有路由：

```text
POST /api/v1/poi-query-plan
```

它只接收当前成功等时圈引用或安全几何，不调用 POI。返回：

- 面积；
- piece 数；
- 最小与预留请求数；
- 预算状态；
- plan fingerprint；
- coverage 几何摘要；
- 不返回 Key、本地绝对路径或全部高精度 piece 坐标到普通 UI。

前端显示：

```text
预计 POI 请求：18–23 次
当前预算：20
状态：需要确认或缩小范围
```

不得点击按钮后直接跳过计划。用户取消不产生请求。

## 9. 分步执行

### 阶段 A：预检与冻结限制

1. 阅读第 22 号报告和本文；
2. 将本文原样归档到第 23 号路径；
3. 核对当前 50 km² 公共限制和项目 45 km² 安全阈值；
4. 审计旧 94-cell 规划逻辑，只读，不执行；
5. 建立全局上游请求断言，本任务任何真实请求即失败。

### 阶段 B：纯几何规划器

1. 实现 Polygon/MultiPolygon 规范化；
2. 实现测地面积和局部投影；
3. 实现单片快速路径；
4. 实现非重叠网格 intersection；
5. 实现递归面积细分；
6. 实现稳定 piece ID、排序和 fingerprint；
7. 验证 union/重叠/面积守恒。

### 阶段 C：预算、状态机与缓存契约

1. 实现计划预算；
2. 实现 approval 绑定模型；
3. 实现 piece 状态机；
4. 实现 cache/checkpoint/resume；
5. 实现 truncated 自适应子分片；
6. 用 fixture 验证 429、失败、中止、恢复和原子合并。

### 阶段 D：离线真实几何计划

若缓存中存在第 16/18 号真实步行、骑行、驾车 outer polygons：

- 仅生成三份 dry-run plan；
- 记录面积、pieceCount、请求区间和 fingerprint；
- 不执行任何 piece；
- 若某 profile 几何缓存缺失，标记 N/A，不联网补取。

### 阶段 E：报告并停止

生成第 24 号报告，明确哪些计划来自真实缓存几何、哪些只用合成 fixture；所有上游请求计数必须为 0。

## 10. 自动测试最低要求

- 1、44.9、45、45.1、50 km² 边界；
- Polygon 与 MultiPolygon；
- 空/非法/自交几何受控失败；
- 复杂边界 intersection；
- 每片面积不超过安全阈值；
- pieces union 覆盖原 geometry；
- pieces 内部不重叠；
- 面积守恒；
- 同输入 piece IDs/order/fingerprint 稳定；
- resultCount 等于 limit 触发细分；
- 最大深度仍截断则 profile incomplete；
- 公共边界 POI 去重；
- 同名异地保留；
- 预算不足 approval-required；
- fingerprint 变化使旧批准失效；
- 中止恢复不重复 completed piece；
- partial job 不发布完整合并结果；
- quota unknown/429 行为；
- 所有上游调用为 0。

## 11. 时间盒与停止条件

- 单个测试命令最长 120 秒；
- 单个大几何规划最长 30 秒；
- 不进行浏览器长时间自动化；
- 本任务累计 60 分钟仍未完成，生成断点版第 24 号报告并停止；
- 不允许以提高并发或真实请求代替离线验证。

立即停止：

- 规划算法产生明显重叠或未覆盖区域；
- 需要调用真实 POI 才能证明规划器；
- 旧 94-cell 文件存在用户未跟踪修改且可能被覆盖；
- 缓存/manifest 写入不是原子的；
- 请求预算不能绑定到 plan fingerprint；
- 任一上游 API 被调用。

## 12. 完成判据

- 任何合法 outer Polygon/MultiPolygon 都能产生确定性安全分片；
- 单片面积不超过 45 km²；
- coverage、重叠、面积守恒可量化；
- 密集分片可有限递归并显式标记不完整；
- 计划先于请求，预算与 fingerprint 绑定；
- 分片级缓存和中止恢复可测试；
- 第 24 号报告中所有真实 API 计数为 0；
- 报告完成后停止。

# 第60号报告：OpenPOIService MultiPolygon 契约门禁、覆盖审计统一与驾车真实预算定稿

## 状态

`blocked-needs-decision`

阻断原因不是几何、载荷、拆分或测试失败，而是第59号 Canary 的明确前置门禁未满足：本机后端的 POI 配额快照为 `remaining=null`。文档要求每次 Canary 前确认余量不少于 10；没有通过一次真实上游请求去探测余量。

## 已完成：覆盖审计统一

第58号两套覆盖数值已按正确的双层语义保留和统一，不再互相覆盖：

| 层 | 证明对象 | 未覆盖 km² | 外溢 km² | 重叠 km² | 面积差 km² | 容差结果 |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| Canonical projected full precision | V2 内部算法叶片 | `0.000000000000e+00` | `2.661157623152e-13` | `0.000000000000e+00` | `-2.046363078989e-12` | 通过 |
| Provider payload round-trip | 实际 WGS84 JSON 载荷 | `2.141246300703e-05` | `2.862149947359e-05` | `1.077751221601e-10` | `7.209141813291e-06` | 通过 |

两层均使用武汉同一 UTM 投影，并均小于 `1.903245962858 km²` 的 0.1% 容差。Canonical 层证明算法完整；round-trip 层证明实际请求载荷表示误差。后续不得把其中任何一层笼统简写为“覆盖为 0”。

## 已完成：生产 Payload 契约与离线 MultiPolygon 审计

- 冻结计划保持：43 片、fingerprint `633aa700d21cc7582b77dea610a5e43a2bf35c7b382df6bbb48a6b90a941efd0`。
- 实际读取到 38 个 Polygon 和 5 个 MultiPolygon；五个 MultiPolygon 的 partCount 为 5/2/2/2/4，共 15 个 component。
- 43 个 payload 均通过离线 schema、45 km² 面积和复杂度校验。
- Payload 由真实生产构造函数 `OrsRemotePoiProvider._body()` 生成，使用当前无筛选契约：`request=pois`、`geometry.geojson`、`limit=2000`、`sortby=category`。无类别筛选时，生产 body 不包含 `filters` 字段；这是已记录的真实契约而非临时替代实现。
- Payload 清单与证据中不含 Key 或 Authorization。
- 当前客户端没有隐式 MultiPolygon 拆分；普通网格的 `split_poi_cell()` 只在截断递归路径中使用，不会被 Canary 自动调用。

## 已完成：保守 Polygon 回退计划

无论 Provider 最终是否支持 MultiPolygon，离线回退计划均已生成并审计：

```text
原请求单元：43
Polygon 单元：38
MultiPolygon 单元：5
MultiPolygon components：15
拆分后 Polygon 请求：53
新增请求：10
```

所有 child 保持父 component 的原始坐标；没有 buffer、bbox 扩展、删除小部件或跨父级合并。父／子面积和 union 守恒、全局覆盖审计均通过。

条件性预算仍为：

| Provider 实测结论 | 基础请求 | 自适应预留 | 建议批准 POI 请求 |
| --- | ---: | ---: | ---: |
| 支持 MultiPolygon | 43 | 9 | 52 |
| 不支持 MultiPolygon，采用拆分回退 | 53 | 11 | 64 |

这些是下一份执行文档的审批输入，不是本阶段授予的 POI 或 Matrix 权限。POI 候选总数仍未知，Matrix 40 批预算仍未批准。

## Canary 与账本

控制 Polygon、两部件 MultiPolygon 和五部件 MultiPolygon 三项 Canary 都生成了与生产路径一致的离线 payload hash，但没有发送：

- 本地 `GET /api/v1/quota`：`pois.remaining=null`、`status=unknown`。
- 文档要求每次请求前 `remaining >= 10`。
- 因而 Canary 尝试数：0/3；自动重试：0；正式驾车缓存写入：0；Analysis ID：0；Matrix：0。

不能据此推断 Provider 支持或不支持 MultiPolygon，所以最终预算 proposal 保持 `providerContractStatus=not-verified-quota-gate-blocked`，而不是错误地选择 52 或 64。

## 测试与不变项

- `node --check app.js`：通过。
- JS 全量：114 passed，0 failed。
- Python 全量：139 passed，0 failed；其中第59号新增 23 个测试，覆盖 43 payload、实际生产 schema、五个 MultiPolygon、拆分数量／面积／覆盖、双层审计、科学记数、Canary 3 次硬上限、无重试、截断不递归、缓存隔离、Analysis/Matrix 零副作用与计划冻结。
- `git diff --check`：通过。

步行、骑行、研究基线、现有 UI、V1/V2 计划和审计图均未修改；没有重新请求等时圈，也没有进入完整 POI、Matrix、泛地图、巴黎或类别聚类。

## 交付与停止

完整证据位于 [exports/stage-11-openpoiservice-contract-gate](/Users/zhangzhihan/Desktop/项目的UI界面/exports/stage-11-openpoiservice-contract-gate)。其中包括双层覆盖审计、生产契约审计、43 payload manifest、五个 MultiPolygon 的脱敏 payload、53 单元回退计划与 GeoJSON、Canary 阻断账本、条件预算 proposal、零 Matrix 和测试证据。

前端、后端和浏览器保持运行，页面未切换到不存在的驾车 POI 结果。第59号现已停止。要继续，需要先提供一个可确认 POI 余量不少于 10 的合规依据或新的明确 Canary 门禁决策；届时仍只能执行最多 3 次无重试 Canary，不能直接开始完整 POI 抓取。

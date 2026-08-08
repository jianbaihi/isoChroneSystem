# 第58号报告：驾车大范围 POI Polygon 分片器 V2 离线优化与预算可行性复核

## 状态

`completed-approval-ready`

第57号只执行离线几何优化与预算可行性复核。没有发送 Isochrones、OpenPOIService、Matrix、Geocoder 或 Directions 请求，也没有继续第55号真实驾车链路。

## 结果

在不改变黄鹤楼驾车 30 分钟真实 ORS 外圈、不放宽 **45 km²** 单片安全上限、不使用 bbox 或固定半径替代 Polygon 的前提下，新的 `stage-11-balanced-polygon-partitioner-v2` 达到面积理论下界：

| 方案 | 方法 | 片数 | <1 km² | 最大顶点 | 最大 geometry | 覆盖／外溢／重叠 | 指纹 |
| --- | --- | ---: | ---: | ---: | ---: | --- | --- |
| V1 | 固定网格相交（基线） | 93 | 20 | － | － | 通过 | `790314e5…25231d` |
| A（选中） | 平衡递归二分，≤45 km² | **43** | **0** | 236 | 9,370 B | 通过／0.000021412／0 | `633aa700…41efd0` |
| B | 平衡递归二分，≤44 km²、边界复杂度优先 | 44 | 0 | 253 | 10,047 B | 通过／0.000021412／0 | `7f16b0ff…edc6b2` |
| C | V1 共享边界受约束合并 | 61 | 2 | 259 | 10,256 B | 通过／0.000054216／0.000010939 | `8748ec6c…a9330b` |

输入外圈面积为 1903.245963 km²，故 `ceil(1903.245963 / 45) = 43`。方案 A 的 43 片面积均为约 44.261534 km²；每片都小于等于 45 km²，且最大边界复杂度远低于 500 顶点与 100 KB 请求体的推荐门槛。

## V1 碎片问题证据

V1 的 93 片并非面积约束的必然结果。其审计显示：6 片小于 0.1 km²、20 片小于 1 km²、39 片小于 5 km²，同时有 28 片大于 40 km²；共有 136 个共享边界邻接对，57 对在 45 km² 内可直接合并。这是固定网格与不规则外圈相交造成的细条、边缘残片和小孤片组合，而不是“驾车范围必须 93 片”。

静态离线审计图 [v1-fragmentation-map.png](/Users/zhangzhihan/Desktop/项目的UI界面/exports/stage-11-driving-partitioner-v2/v1-fragmentation-map.png) 显示外圈、V1 的 93 条片界与红色的 <1 km² 碎片。它没有请求底图，不是浏览器或产品验收截图。

## V2 方法与约束

V2 在武汉 UTM 米制投影中运行，依次进行 Polygon 归一化、有效性检查、可选拓扑保持简化、连通部件识别、基于目标叶片数的平衡递归二分和覆盖审计。每一条切线按面积不平衡、紧凑度、边界复杂度、多部件和小部件惩罚评分，横纵轴都评估，以稳定顺序选择。

对于方案 A，目标叶片数直接是 43，而不是“面积超过上限就不断对半分”产生的 64 片。递归按 21/22、再按子树所需叶片数分配目标面积，因此达到理论最少叶片数；没有删掉边缘区域，也没有通过放宽面积取得结果。V1 合并方案 C 被完整保留为不利比较，不被静默替换为 V2。

方案 A 含 5 个 MultiPolygon 请求单元。这些均为原始不规则可达域在合法平衡切线下的连通部件结果，不是 bbox 扩展；它们有效、面积合规、无外溢且没有孔洞丢失。请求客户端若日后对 MultiPolygon 有更严格限制，必须在新执行文档中先做离线转换／复核，不能在真实请求期间临时改变范围。

## 确定性、复杂度与测试

选中配置连续运行 5 次，片数、pieceId 集合、geometryHash 集合、计划 fingerprint、排序和面积审计全部一致。普通／研究模式、显示密度等 UI 状态不参与此离线服务的输入，不能改变该指纹。

完整自动测试已经通过：

- `node --check app.js`：通过。
- `node --test src/**/*.test.js`：114 passed，0 failed。
- `PYTHONPATH=server server/.venv/bin/python -m unittest discover -s server/tests -p 'test_*.py'`：116 passed，0 failed；其中第57号新增 21 项，覆盖递归切分、凹 Polygon、MultiPolygon、孔洞、邻接合并拒绝条件、简化、复杂度、覆盖、理论下界、确定性、V1 不覆盖与零上游。
- `git diff --check`：通过。

候选运行耗时约 1.3–1.4 秒；峰值进程 RSS 的本机测量及单位已写入各候选 JSON。所有操作是本地几何计算。

## 预算可行性

方案 A 的基础 POI 请求数为 43。旧第55号的 48 次上限下还剩 5 次，按文档分类属于 `base-feasible-with-minimal-reserve`；但 5 次不足以覆盖密集城区返回达到 2000 条时的递归细分风险。

离线建议（**不是本阶段授权**）：

```json
{
  "baseRequests": 43,
  "minimumAdaptiveReserve": 9,
  "recommendedApprovedPoiRequests": 52
}
```

计算式为 `max(8, ceil(43 × 20%)) = 9`。即使基础分片降至 43，仍无法从离线几何推导 POI 候选总量，因此不能证明后续 Matrix 一定小于 20,000 目的地或 40 批。未来真实执行仍须在 POI 前重新核对计划 fingerprint 和近期额度；任何截断、429 或预算不足都必须保存断点并停止。

## 上游账本与冻结边界

本阶段真实新增请求严格为：Isochrones=0、OpenPOIService=0、Matrix=0、Geocoder=0、Directions=0。步行、骑行、骑行 v2 发布、研究基线、第53号截图及哈希、普通／研究 UI 和第22/33/37/41/43布局算法均未修改。

未产生新的 POI、Matrix、Analysis ID、产品浏览器截图或驾车发布结果；因此本报告的 `completed-approval-ready` 只表示**离线几何可行且可以作为下一次审批的输入**，不表示第55号真实驾车链路已完成。

## 交付

完整机器可读交付位于 [exports/stage-11-driving-partitioner-v2](/Users/zhangzhihan/Desktop/项目的UI界面/exports/stage-11-driving-partitioner-v2)，包括 V1 审计、三方案 JSON、选中 V2 计划及 GeoJSON、覆盖／复杂度／确定性／预算／零上游证据、离线 PNG 与 SHA-256、预检及测试汇总。

前端、后端和用户浏览器保持运行，浏览器没有切换到不存在的驾车 POI 结果。本阶段已停止，等待你对下一次真实 POI 预算和风险策略作出单独决定。

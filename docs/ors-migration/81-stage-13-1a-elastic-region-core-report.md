# 第81号执行报告：Stage 13.1A 单圈层弹性类别区域内核

## 结论

```text
Stage 13.1A
ELASTIC REGION CORE v0 PASS
```

本次严格执行第 80 号文档的最小一步：在固定 20 分钟父容器内，以 10 个一级类别构建加权 Power Diagram 共享分区，并实现 `focusAlpha` 连续扩张、邻域压缩、warm start 与回弹。Stage 13.0 Bubble Baseline 完整保留且仍是默认布局。

没有进入 Stage 13.1B/13.1C/13.1D，也没有加入时间多层统一求解、父子 POI、二级类别、LOD、POI 文本压力、KDE、自然曲线包络、数据库重构或任何新的 Provider 请求。

## 实现边界

新增独立模块：

```text
src/elastic-region/
├── core/contracts.js
├── geometry/polygon.js
├── geometry/power-cell.js
├── constraints/minimum-share.js
├── solver/target-shares.js
├── solver/elastic-region-solver.js
├── metrics/region-metrics.js
└── adapters/isotagmap/category-cluster-adapter.js
```

核心引擎只认识通用父容器、节点、权重、anchor、最小面积和 previous state。`PanmapInputSnapshot`、类别聚合与 20 分钟圈层选择均停留在 IsoTagMap adapter 或视图层。自动扫描确认核心目录没有 `amap`、独立 `poi`、黄鹤楼、餐饮服务或 `20min` 等业务概念。

算法采用固定 semantic anchor 的加权 Power Diagram。每个 cell 由统一的两两半平面裁剪产生，因此区域之间共享同一条边界，不是各画各的独立包络。面积迭代使用“目标面积减实际面积”修正 power weight；warm frame 复用上一帧 site 和 weight。

## 真实输入与浏览器结果

- 中心：黄鹤楼
- 交通方式：步行
- 阈值：10 / 20 / 30 分钟
- 固定父容器：10–20 分钟 exclusive ring
- 分钟级归类：2223 / 2223 POI
- 父容器内：1044 POI，10 个一级类别
- 实际主要类别：餐饮 343、购物 299、生活 71、医疗 62、住宿 53、公共 46
- 开发入口：`http://127.0.0.1:5500/?elasticRegion=1`

稳定状态结果：

| 状态 | Alpha | 单帧求解 | Gap | Overlap | 最大面积误差 | 邻接变化 | Warm start |
|---|---:|---:|---:|---:|---:|---:|---|
| Elastic overview | 0.000 | 5.40 ms | 0 | 0 | 0.68% | 初始建图 | 否 |
| 餐饮半聚焦 | 0.500 | 0.10 ms | 0 | 0 | 0.24% | 0 | 是 |
| 餐饮全聚焦 | 1.000 | 0.40 ms | 0 | 0 | 0.25% | 0 | 是 |
| 回弹结束 | 0.000 | 0.20 ms | 0 | 0 | 0.25% | 0 | 是 |

动画持续时间固定为 280ms，中间帧最多进行 6 轮快速迭代，稳定帧最多 72 轮。真实浏览器中可观察到餐饮区域逐步扩张、相邻区域同步压缩、共享边界连续移动及自然回弹。已实现 `frameMs` 与 `droppedFrames` 运行时记录；由于真实验收页面在最终 DOM 导出字段加入前已经加载，历史 dropped-frame 精确值无法回读，因此证据中保持 `null`，没有补造数值。

## 几何、连续性与性能判断

- Shared Partition：PASS。Power cell 共用裁剪边界。
- Focus Expansion：PASS。真实与自动测试均确认聚焦类别面积随 alpha 增大。
- Context Compression：PASS。至少一个邻域收缩，且所有非聚焦区域保留最小上下文。
- Minimum Share：PASS。默认 `0.035`。
- Warm Start：PASS。上一帧 sites 与 weights 均复用，无随机重置。
- Return Stability：PASS。确定性审计中返回后最大面积占比偏差 `0.004658`，小于 `0.01`；最大质心偏差 `14.016px`，小于 `35px`。
- Geometry Gap/Overlap：PASS。真实稳定状态均为 0，硬门槛为 0.5%。
- Anchor：PASS。v0 固定 anchor，最大位移 0。
- Topology：PASS。审计序列聚焦与返回的 adjacency change 均为 0，指标仍由实际几何计算。
- Performance：PASS。10 类冷启动真实求解 5.40ms，稳定 warm solve 0.10–0.40ms，低于 16ms 目标。
- Provider Isolation：PASS。Elastic 交互期间 AMap / ORS / Minute 增量均为 0。

## 测试与已知环境项

- 前端全量测试：167 / 167 PASS。
- Elastic 核心专项：5 / 5 PASS。
- Elastic UI 集成：4 / 4 PASS。
- JavaScript 语法：PASS。
- `git diff --check`：PASS。
- 浏览器真实闭环：PASS。

后端发现了 145 个测试，没有出现 Stage 13.1A 断言失败，但加载阶段仍受一个历史 Stage 5 ORS cache fixture 缺失影响：

```text
data/generated/ors-cache/stage-5-live-validation/20260730T020216Z-be95b0fa/
e8bb30111305495cf7ab9e17441cceab2079caa7b071c313b6802f7bafb7d55e.json
```

该文件不属于本阶段，也没有为了制造全绿结果而伪造。

## 第 80 号文档的 20 项回答

1. **Stage 13.0 Bubble Baseline 是否保留？** 是，完整保留且普通入口仍默认使用 Bubble Baseline。
2. **ElasticRegionEngine 是否独立于 POI 业务代码？** 是，核心模块通用，POI/类别快照转换仅在 adapter 与视图边界。
3. **是否定义通用 RegionLayoutInput / Result？** 是，版本分别为 `region-layout-input-v0` 与 `region-layout-result-v0`。
4. **是否实现共享分区而非独立类别包络？** 是，使用加权 Power Diagram 的统一半平面裁剪。
5. **区域是否存在明显重叠？** 否，真实稳定状态 overlap ratio 为 0。
6. **是否存在明显空隙？** 否，真实稳定状态 gap ratio 为 0。
7. **Focus 类别面积是否随 alpha 增大？** 是，餐饮区域从 overview 连续增至约 45% 目标上限附近。
8. **非 Focus 类别是否连续压缩？** 是，浏览器动画和测试均确认同步压缩。
9. **非 Focus 类别是否保留最小上下文面积？** 是，默认最小占比为 3.5%，自动测试确认不会归零。
10. **是否使用 previousState / warm start？** 是，复用上一帧 sites 与 power weights。
11. **返回 alpha=0 后是否基本恢复？** 是，面积与质心均回到自动测试容差内。
12. **Anchor 是否出现大范围跳位？** 否，v0 采用固定 anchor，测得最大位移 0。
13. **是否记录 adjacency changes？** 是，稳定聚焦/返回序列记录为 0 次变化。
14. **10 类场景单帧求解时间是多少？** 真实冷启动 5.40ms；warm 稳定帧 0.10–0.40ms。
15. **浏览器动画是否流畅？** 是，280ms 过程可见连续扩张、压缩与回弹，无视觉跳变；历史 dropped-frame 精确数未回填。
16. **是否新增 AMap / ORS / Minute 请求？** 否，布局切换、聚焦、alpha 探针与返回的 Provider 增量均为 0。
17. **是否建立 execution-log？** 是，已记录基线、参数、步骤、提交、测试、指标和已知阻塞。
18. **中期 backup 是否成功？** 是，远端 `backup/stage13-1a-core-20260904` 验证为 `1a12223`。
19. **final backup 是否成功？** 是，浏览器验收实现与证据已在 `backup/stage13-1a-final-20260904` 验证为 `07da118`，最终文档继续以 fast-forward 方式同步。
20. **`.env` 是否仍未进入 Git？** 是，`server/.env` 继续由 `.gitignore` 第 5 行忽略。

## Git / GitHub 安全结果

- 执行前 Stage 13.0 head：`728b4cc`
- 开发分支：`stage13-1a-elastic-region`
- 执行前 bundle：创建并验证 PASS
- Core backup：`backup/stage13-1a-core-20260904` → `1a12223`
- Final accepted implementation backup：`backup/stage13-1a-final-20260904` → `07da118`
- Force push：未使用
- 远端 main：未改动
- Secret audit：PASS

## 下一阶段决策建议

第 80 号最小问题已经得到正向验证：共享边界类别空间可以随交互焦点连续扩张、压缩并稳定回弹，面积可信且单帧求解预算充足。

下一步在批准 Stage 13.1B 前，建议先观察更多真实中心和类别分布下的邻接稳定性，并通过新导出的 `droppedFrames` 指标补一组可量化帧时序。不要在本阶段补入时间嵌套或自然曲线，以免混淆本次已验证的最小算法结论。

## 证据索引

- `exports/stage-13-1a-elastic-region-core/elastic-region-contract.json`
- `exports/stage-13-1a-elastic-region-core/algorithm-notes.md`
- `exports/stage-13-1a-elastic-region-core/geometry-audit.json`
- `exports/stage-13-1a-elastic-region-core/area-error-audit.json`
- `exports/stage-13-1a-elastic-region-core/topology-audit.json`
- `exports/stage-13-1a-elastic-region-core/temporal-stability-audit.json`
- `exports/stage-13-1a-elastic-region-core/performance.json`
- `exports/stage-13-1a-elastic-region-core/browser-evidence.md`
- `exports/stage-13-1a-elastic-region-core/execution-log.md`
- `exports/stage-13-1a-elastic-region-core/test-results.json`
- `exports/stage-13-1a-elastic-region-core/github-sync-report.md`
- `exports/stage-13-1a-elastic-region-core/screenshots/`

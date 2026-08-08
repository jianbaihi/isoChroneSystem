# 第34号报告：双径向全量布局

最终状态：`completed-with-view-contract`

原始状态（保留）：`blocked-needs-design-decision`

日期：2026-08-02

## 1. 结论与停止状态

第33号的功能实现和数量/碰撞门禁均已完成：地理方位与固定种子随机方位使用完全相同的 252 个 eligible POI，均为 placed 252、unplaced 0，逐圈 39/83/130，overlap、outsideOwnRing、centerCollision、timeLabelCollision 均为 0。所有标签水平显示，未隐藏标签，未改变 Matrix 时间或 ringId。

原始 blocked 结论正确并完整保留：逻辑画布为 2324×2324；按当时单一视图口径，全景适配后的最小字号低于 8px，因此原状态为 `blocked-needs-design-decision`。这项历史结果没有删除或改写。

2026-08-02 的产品设计决策把“全量摆放”和“逐字阅读”拆成两个视图状态：全景预览允许小于 8px，仅用于观察三圈结构；阅读视图允许画布超出视口，但最小屏幕字号必须不低于 8px。补充实现后，1280×720 浏览器中的全景预览为 3.55px并显示非错误说明，阅读视图为 8.01px。两种视图均保留 252 个 DOM/布局节点，切换前后 fingerprint、revision、Matrix 时间和 ringId 不变。因此最终状态更新为 `completed-with-view-contract`。

已在生成本报告和全部证据后停止；未执行第35号。

## 2. 数据基线与冻结项

- 唯一输入：`exports/stage-6-layout/stage20-cache-baseline.json`。
- total 282；eligible 252；matrix-out-of-range 30。
- eligible 圈层守恒：10分钟 39、20分钟 83、30分钟 130。
- 第22号只读对照：placed 138、unplaced 114、fingerprint `fnv1a-8b0581ae`。
- foot-walking 只读缓存；cycling-regular 未修改；driving-car 仍为 awaiting-approval。
- 未修改 Matrix 时间和 ringId；对比证据为 `matrixTimesChanged=0`、`ringIdsChanged=0`。

## 3. 实际修改文件

- `src/adapters/dual-radial-layout.js`：纯本地双径向布局内核、bbox 碰撞、动态扩圈、指纹及审计指标。
- `src/adapters/dual-radial-layout.test.js`：方位、边界、数量、碰撞、稳定性、参数和可读性测试。
- `src/adapters/panmap-layout-adapter.js`：向布局输入透传经纬度。
- `src/state/panmap-control-state.js`：开放两个第33号模式，保持自然包络阻塞。
- `panmap-layout.js`：径向布局渲染、圆形圈层、缓存、指标、旧任务隔离；补充阶段只新增布局就绪/resize 视图事件，不改变布局计算。
- `app.js`：本地缓存验收入口、控件应用、稳定种子、零上游标记和全景/阅读 viewBox 状态。
- `index.html`、`styles.css`：第33号控件、随机种子，以及全景/阅读按钮、缩放/字号提示和非错误说明样式。
- `src/view/radial-view-contract.js`、`src/view/radial-view-contract.test.js`：独立的纯视图 transform 契约及测试。
- `scripts/build_stage33_radial_evidence.js`：四份结构化证据生成器。
- `docs/ors-migration/33-stage-7-dual-radial-full-layout-execution.md` 与本报告。
- `exports/stage-7-radial/` 下四份 JSON、原两张模式 PNG 和两张视图契约补充 PNG。

补充阶段未修改 `src/adapters/dual-radial-layout.js`，双径向算法版本与两模式 fingerprint 均保持不变。

## 4. 算法边界与输出契约

地理模式使用中心到 POI 的标准大圆初始方位角，并转换为 SVG 屏幕角；碰撞求解只允许在配置角度窗口及自身圆环带内搜索。随机模式用 `poiId + randomSeed` 的 FNV-1a 稳定哈希生成初始角度。两者共用相同的时间排序、字号函数、矩形 bbox、中心障碍和时间标注障碍；标签 `rotation=0`。

这是对径向标签布局思想的项目化参考/扩展，并非声称逐行复现某篇论文。项目扩展包括：Matrix 时间环带、动态圆形画布、中心/时间标注障碍、可重复指纹、UI 参数 token 与本地双视图联动。

核心输出包括：算法版本、模式、种子、输入/摆放数、逐圈数、逻辑画布、半径、碰撞审计、位移统计、性能、字号、每个 poiId 节点和稳定指纹。未写入真实 Key 或无关上游响应。

## 5. 两种模式结果

| 指标 | 地理方位 | 随机方位 |
|---|---:|---:|
| eligible / placed / unplaced | 252 / 252 / 0 | 252 / 252 / 0 |
| 10 / 20 / 30 分钟 | 39 / 83 / 130 | 39 / 83 / 130 |
| overlapCount | 0 | 0 |
| outsideOwnRingCount | 0 | 0 |
| centerCollisionCount | 0 | 0 |
| timeLabelCollisionCount | 0 | 0 |
| candidateChecks | 53,825 | 22,066 |
| expansionIterations | 11 | 11 |
| mean / max radial displacement | 40.36 / 249px | 37.23 / 216px |
| fingerprint | `fnv1a-c715b7de` | `fnv1a-b4c87899` |

两种 JSON 的 poiId 集相同；`hiddenLabels=0`，`rotationNonZero=0`。字号没有为挤入 252 个标签而静默缩小；语义字号始终由 Matrix 时间排名和字号层次 token 决定。

## 6. 动态圆形画布

最终逻辑画布为 2324×2324，圆心为 (1162,1162)。11 次扩张后，三个互斥圆环为：

- 10分钟：inner 90、outer 448；
- 20分钟：inner 460、outer 790；
- 30分钟：inner 802、outer 1142。

半径严格单调嵌套且留有 12px 环间隔；全过程只使用圆形显示包络，未实现自然包络或 D3 density。

## 7. 地理方位变形

绝对角度偏移：均值 2.37°、中位数 0°、P95 13.75°、最大 57.5°；配置窗口内比例 100%。径向位移均值 40.36px、最大 249px。

以目标方位相差不超过 10° 的 POI 对作为“同/相邻方向”审计口径，共比较 2,183 对，近远次序逆转 305 对，比例 13.97%。该指标作为透明的变形统计保留；它不是通过修改 Matrix 时间或 ringId 得到的。随机模式的 geographic bearing error 按契约记为 `N/A`，没有用 0 冒充。

## 8. 随机种子稳定性

种子 `stage33-fixed-wuhan-20260802` 连续运行 5 次均得到 `fnv1a-b4c87899`。改为备用种子得到 `fnv1a-0305eb8a`，恢复原种子后再次得到 `fnv1a-b4c87899`。浏览器中也完成修改/恢复，且全过程业务上游请求为 0。

## 9. 参数接入

- 紧凑度控制 padding、径向步进、角度步进和搜索角度窗口；改变后指纹改变，但 placed 和逐圈数量守恒。
- 字号层次控制语义字号跨度；改变后字号统计和指纹改变，但不改变 Matrix 时间或 ringId。
- 浏览器对紧凑度和字号层次各调整一次，仍为 252/252；参数应用只重排本地缓存。

## 10. 双视图、任务隔离与浏览器验收

- 标签与传统地图 POI 均以 poiId 联动；点击标签能选中相同 poiId 并显示 Matrix 时间详情，未产生业务请求。
- 地理→随机→地理切换、随机种子修改/恢复、相同参数缓存复跑均已执行；同参数复跑命中本地布局缓存。
- 活动布局作业使用 revision/job 标识；新任务会取消旧布局作业，分析状态测试证明 stale job 不能覆盖当前结果。
- 两张 1280×720 真 PNG 均显示当前模式、圆形包络、252/252、逐圈统计、控制参数、中心/时间标注及水平无胶囊标签；不含 Key。
- DOM 验收：两模式标签节点 252，非零旋转 0，中心 (1162,1162)，业务上游计数 0。

补充后的视图契约：

| 状态 | 用途 | 比例 | 最小屏幕字号 | 画布/节点 |
|---|---|---:|---:|---|
| 全景预览 | 完整观察三圈整体结构，不作为阅读状态 | 24.0% | 3.55px | 三圈完整；252 节点 |
| 阅读视图 | 阅读、平移、滚轮缩放、圈层聚焦 | 54.1% | 8.01px | 允许超出视口；252 节点 |

“适配全景”和“恢复阅读比例”只更新外层 SVG `viewBox`。切换前、全景、恢复阅读、放大和圈层聚焦的布局 fingerprint 均为 `fnv1a-c715b7de`，layout revision 均为 4，DOM 节点均为 252，`viewSwitchRecomputedLayout=false`。resize 在径向模式下只触发视图契约事件，不再调用布局构建器。

当前地理模式是“受约束地理方位布局”，不是严格地理坐标投影。最大角度偏移 57.5°、10°相邻方向窗口内的近远次序逆转率 13.97% 均作为后续实验评价指标原样保留，没有删除或美化。

## 11. 自动化测试

前端语法与测试：

```text
node --check app.js
node --check panmap-layout.js
node --check src/adapters/dual-radial-layout.js
node --check src/view/radial-view-contract.js
node --test src/view/radial-view-contract.test.js src/adapters/dual-radial-layout.test.js src/state/panmap-control-state.test.js src/state/panmap-control-ui.test.js src/state/analysis-store.test.js src/adapters/panmap-layout-adapter.test.js src/contracts/analysis-contracts.test.js
结果：28 passed, 0 failed
```

后端只读/fixture 回归：

```text
PYTHONPATH=server server/.venv/bin/python -m unittest server.tests.test_stage31_data_audit server.tests.test_multimode_orchestration server.tests.test_matrix server.tests.test_online_startup
结果：31 passed, 0 failed
```

覆盖：方位四象限和中心重合、600/1200/1800 边界、252/252、bbox 自身环带、四类碰撞、种子五次稳定、种子恢复、动态扩圈、参数数量守恒、旧响应隔离、禁止自动联网、旧基线对照、全景 fit-all 和阅读视图 8px 门禁。

## 12. 零 API 账本

| 上游 | 预算 | 实际 |
|---|---:|---:|
| Isochrones | 0 | 0 |
| OpenPOIService | 0 | 0 |
| Matrix | 0 | 0 |
| Geocoder | 0 | 0 |

浏览器只读取静态页面、第20号本地缓存，以及本地 `/api/v1/health`、`/api/v1/poi-datasets` 配置/数据集状态；没有调用四类业务上游路由。cycling 未读取/修改，driving 未调度。

## 13. 证据文件、SHA-256 与 MIME

| 文件 | SHA-256 | MIME |
|---|---|---|
| `stage33-geographic-layout.json` | `cdbe7b9d344ccce643551a38746da8a177385f5a6376ba8e216c8493f5824f84` | `application/json` |
| `stage33-random-layout.json` | `6b8e8a03bb939063eec689e5cee03eec9560555a54ffd1bc015befc610312287` | `application/json` |
| `stage33-layout-comparison.json` | `57244967bc800bc241b914333d0bff459f37f74d7a787007ab99cfa1f0cc080f` | `application/json` |
| `stage33-zero-api-evidence.json` | `b8628458a3ef5bfa10e420510dfcaa7c3330a33b4f55a988b91740d2d4c0e199` | `application/json` |
| `stage33-geographic.png` | `b3df1277b344c4a652e8621e8050e2e5447ee64fa9742dfe259a4c262986fc21` | `image/png`，1280×720 |
| `stage33-random.png` | `33742e95694d9176d3717753a7a7251a19a97e8f07619cc887658ae957266b02` | `image/png`，1280×720 |
| `stage33-fit-all-view.png` | `c9ca4807dfa1c596a2bb8eb0927d7a748bcc6de5e6306933e1aa08332002d081` | `image/png`，1280×720 |
| `stage33-reading-view.png` | `21413e4749b86fda2143f5e03e5045d2b3890fa226c12d1157ea2b00270c01cb` | `image/png`，1280×720 |

## 14. 进入第35号门禁

第33号补充门禁满足，最终状态为 `completed-with-view-contract`：全景预览明确不是阅读状态；阅读视图最小字号 8.01px；两个状态及 zoom/focus 均保持 252 节点、相同 fingerprint 和相同 revision。原始 `blocked-needs-design-decision` 及其原因仍保留在报告和比较 JSON 中。本轮按指令立即停止，未执行第35号。

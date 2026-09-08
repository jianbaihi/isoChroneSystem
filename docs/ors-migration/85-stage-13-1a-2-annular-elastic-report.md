# 第85号执行报告：Stage 13.1A.2 中心约束单环带弹性剖分

## 当前结论

```text
Stage 13.1A.2
LOCAL ALGORITHM / UI / BROWSER ACCEPTANCE PASS
GITHUB BACKUP PENDING EXPLICIT AUTHORIZATION
```

第 84 号文档要求的通用环带内核、IsoTagMap adapter、第三开发模式、自动测试、真实浏览器验收、性能测量和本地证据均已完成。两条 GitHub backup 分支会向外部仓库披露源码、测试、证据与截图；因上一阶段同类 push 已被安全审批要求明确授权，本阶段未把“执行文档”扩张解释为外部披露许可。因此在两条 backup 真正推送前，不标记完整 `ANNULAR ELASTIC REGION v1 PASS`。

## 实现范围

本阶段新增通用模块：

- `src/elastic-region/annular/contract.js`
- `src/elastic-region/annular/share-solver.js`
- `src/elastic-region/annular/interpolation.js`
- `src/elastic-region/annular/geometry.js`
- `src/elastic-region/annular/metrics.js`
- `src/elastic-region/annular/engine.js`

业务数据只通过 `src/elastic-region/adapters/isotagmap/annular-category-adapter.js` 进入内核。`annular/` 不包含 POI、AMap、城市、地点、类别名或具体分钟阈值。没有进入多时间环带、真实 POI 方位、二级类别、LOD、KDE、自然边界、数据库或 Provider 改造。

## 真实验收基线

- 中心：武汉·黄鹤楼；
- 交通：步行；
- 阈值：10 / 20 / 30 分钟；
- 最终实时快照：3841 POI；
- 算法输入：互斥 `ring-10-20`，1845 POI，10 个一级类别；
- 固定逻辑中心 `[430,280]`，内外半径 `104 / 246`；
- `minShare=0.035`，`focusExpansionFactor=1.8`，`maxFocusShare=0.45`。

类别采用固定一级 taxonomy 顺序。位置不表达真实地理方位，数量只通过 angular/area share 表达，颜色只来自 `CategoryStyleRegistry`。

## 几何、Focus 与性能结果

| 指标 | 结果 | 门槛 |
|---|---:|---:|
| Coverage | 100.000% | ≥99.9% |
| Gap / Overlap | 0 / 0 | 各≤0.1% |
| Mean / Max Area Share Error | 0 / 0 | <0.005 / <0.01 |
| Sampled Polygon Coverage | 99.9949% | ≥99.9% |
| Order Change Count | 0 | 0 |
| Center / Inner / Outer Delta | 0 / 0 / 0 | 全部0 |
| Node geometry median / p95 | 0.1867 / 0.1924ms | <2ms |
| Final browser geometry frame | 0.2ms | <2ms |
| Final animation | 282.7ms / 18 frames | 260–320ms |
| Max frame / Dropped frames | 17.6ms / 0 | 60fps 目标 |
| Provider interaction delta | 0 | 0 |

餐饮份额随 alpha 单调变化：`17.6437% → 21.1725% → 24.7012% → 31.7587%`。其余类别按基线比例压缩，被 water-filling 锁定的类别保持 `3.5%`，没有消失。`0→1→0` 后 shares、angles、polygons 精确返回初始状态。

## UI 与响应式

Bubble Baseline 和 Rectangular Elastic v0 均保留；开发参数 `?elasticRegion=1` 下新增 Annular Elastic v1。它复用唯一 Single Workspace、Floating Inspector、真实 Mini Map、Breadcrumb 和类别色注册表。标签只显示类别、数量和占比；小区域先隐藏数量/占比，类别名称最后保留。

Inspector 已显示当前环带、当前类别、Focus Alpha、Base / Current share、覆盖率、误差、顺序和中心/半径稳定性。第三个模式按钮引起的窄视口标题重叠已在真实视觉检查中发现并修复，所有截图在修复后重取。

1280×720、1440×900、1920×1080 下主画布面积占工作台均为 1.0，share JSON 完全一致，逻辑中心与半径不变，Resize Provider 调用为 0。

## 测试与安全

- 全量 Node 测试：185/185 PASS；
- Stage 13.1A.2 定向测试：12/12 PASS；
- JavaScript 语法：PASS；
- `git diff --check`：PASS；
- `server/.env`：继续被 `.gitignore:5` 忽略；
- Git bundle：`/Users/zhangzhihan/isoChroneSystem-before-stage13-1a-2.bundle`，verify PASS；
- 本地核心提交：`64e1cb1`；
- force push：未使用；远程 main：未修改。

## 第 84 号文档的 32 项回答

1. **是否保留 Bubble Baseline？** 是，仍为普通默认布局。
2. **是否保留 Rectangular Elastic v0？** 是，原矩形共享分区实现和模式均保留。
3. **是否新增 Annular Elastic v1？** 是，作为第三个开发模式。
4. **Annular v1 是否仍基于统一 `elastic-region` 模块？** 是，位于其独立 `annular/` 子模块中。
5. **核心算法是否与 POI 业务解耦？** 是，业务词与真实数据只存在 adapter/UI 层。
6. **是否只有一个固定中心？** 是，逻辑中心始终为 `[430,280]`。
7. **是否只有一个固定时间环带？** 是，只求解一个 annulus。
8. **是否使用 exclusive ring 数据？** 是，只使用 `ring-10-20`。
9. **类别是否不再承担真实地理方位？** 是，位置仅由稳定 taxonomy 顺序决定。
10. **类别顺序是否稳定？** 是，相同输入、任意 alpha、hover 和 resize 均稳定。
11. **`orderChangeCount` 是否为 0？** 是，为 0。
12. **类别区域是否共同填满 Annulus？** 是，共享边界完整闭合，解析覆盖率 100%。
13. **`gapRatio` 是多少？** 0。
14. **`overlapRatio` 是多少？** 0。
15. **`centerDisplacement` 是否为 0？** 是。
16. **`innerRadiusDelta` 是否为 0？** 是。
17. **`outerRadiusDelta` 是否为 0？** 是。
18. **类别面积是否匹配类别数量权重？** 是，在 minShare water-filling 约束后，area share 与目标 angular share 完全一致。
19. **Focus 类别是否随 alpha 单调扩大？** 是，四个验收采样点严格非递减。
20. **其它类别是否压缩但保持可见？** 是，最小份额为 3.5%。
21. **`minShare` 是否生效？** 是，低权重四类被锁定在 0.035。
22. **0→1→0 后是否恢复初始状态？** 是，shares、angles、polygons 精确返回。
23. **10 类 `geometryBuildMs` 是多少？** Node median 0.1867ms、p95 0.1924ms；最终浏览器 focus 帧 0.2ms。
24. **动画是否流畅？** 是，最终 282.7ms、最大帧 17.6ms、丢帧 0。
25. **是否消除矩形 Treemap 感？** 是，Annular v1 使用固定中心和共享环带扇区，不使用矩形几何。
26. **是否新增 Provider API 请求？** 否，布局/focus/hover/return/resize 增量均为 0。
27. **1280 / 1440 / 1920 是否正常？** 是，三视口布局与逻辑几何验收通过。
28. **是否建立 execution-log？** 是，包含基线、步骤、测试、指标、提交、阻塞和下一步。
29. **Git Bundle 是否 PASS？** 是，bundle create/verify 均 PASS。
30. **中期 GitHub backup 是否成功？** 尚未；等待用户对源码与证据外部披露的明确授权。
31. **最终 GitHub backup 是否成功？** 尚未；同上。
32. **`.env` 是否仍未进入 Git？** 是，文件未被读取到报告或提交，并继续由 `.gitignore` 忽略。

## 硬门槛状态

| Gate | Status |
|---|---|
| Single Center / Single Annulus | PASS |
| Shared Category Partition | PASS |
| No Rectangular Geometry | PASS |
| Category Order / Focus / Context | PASS |
| Return / Gap / Overlap | PASS |
| Center / Radius Stability | PASS |
| Responsive Workspace | PASS |
| Provider Calls = 0 | PASS |
| GitHub Core Backup | PENDING EXPLICIT AUTHORIZATION |
| GitHub Final Backup | PENDING EXPLICIT AUTHORIZATION |

本阶段停在单环带，不自动进入自然化或多环带。前后端保持运行，页面停留在 Annular Elastic v1 overview，供人工验收。

## 证据索引

- `exports/stage-13-1a-2-annular-elastic/00-baseline.md`
- `annular-contract.json`
- `share-solver-audit.json`
- `geometry-audit.json`
- `order-stability-audit.json`
- `focus-monotonicity-audit.json`
- `return-stability-audit.json`
- `responsive-audit.json`
- `performance.json`
- `browser-evidence.md`
- `comparison-notes.md`
- `execution-log.md`
- `test-results.json`
- `github-sync-report.md`
- `screenshots/`

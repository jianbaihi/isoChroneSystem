# 第83号执行报告：Stage 13.1A.1 泛地图单画布工作台

## 当前结论

```text
Stage 13.1A.1
LOCAL UI / BROWSER ACCEPTANCE PASS
FINAL GITHUB BACKUP PENDING EXPLICIT AUTHORIZATION
```

第 82 号文档要求的 UI 重构、自动测试、三视口真实浏览器验收和本地证据均已完成。由于 final backup 提交包含源码、测试证据与页面截图，安全审批要求用户明确确认外部披露；因此在 final branch 真正推送前，不将整阶段标成完整 `PANMAP SINGLE WORKSPACE PASS`。

## 范围控制

本阶段只修改：

- `index.html` 的工作台语义 class 与前端缓存版本；
- `src/view/panmap-mvp-view.js` 的布局、浮层状态、拖动与运行指标；
- `styles.css` 的单工作台与浮层样式；
- 新增布局契约测试和验收证据。

`src/elastic-region/core/`、`geometry/`、`solver/`、`constraints/`、`metrics/` 相对 Stage 13.1A 基线 diff 为空且源码字节一致。没有进入 Stage 13.1B，没有增加时间嵌套、自然包络、文本压力、父子 POI、LOD、数据库或 Provider。

## 布局结果

1440×900 基线：

- Workspace：871×527；
- Main Canvas：585×527；
- Inspector：286×527，参与双栏文档流；
- Main Canvas Area Ratio：0.671637。

重构后：

- Workspace：909×738；
- Main Canvas：909×738；
- Inspector：340px 浮层；
- Mini Map：240×170 浮层；
- Main Canvas Area Ratio：1.0；
- Inspector/Mini Map 展开或收起时，Main Canvas 尺寸均保持 909×738。

`#mapSurface.panmap-workspace` 是唯一工作台。Main Canvas 绝对定位铺满；Inspector、真实 MapLibre Mini Map、Breadcrumb、Developer Toolbar 和快照摘要均为绝对定位浮层。Elastic 仍使用 `viewBox="0 0 860 560"` 与 `preserveAspectRatio="xMidYMid meet"`。

## 响应式结果

| Viewport | Workspace | Main Canvas | Area Ratio | Workspace Count | Provider Delta |
|---|---:|---:|---:|---:|---:|
| 1280×720 | 749×558 | 749×558 | 1.0 | 1 | 0 |
| 1440×900 | 909×738 | 909×738 | 1.0 | 1 | 0 |
| 1920×1080 | 1389×918 | 1389×918 | 1.0 | 1 | 0 |

Resize 只重新发布 viewport 与 overlay 几何数据，没有重建 Snapshot、没有重新执行分钟补齐、没有调用 Provider。

## 交互验收

- 完整 polygon 鼠标点击：`alpha 0 → 1 → 0` PASS。
- 从 polygon 内拖动画布：记录偏移 `60,42` PASS。
- 拖动后再次单击 polygon：`alpha → 1` PASS。
- Inspector 鼠标收起/展开：PASS。
- Mini Map 隐藏/显示：PASS。
- Breadcrumb 回到 Ring：PASS。
- Mini Map 点击：PASS。
- Bubble POI 选择：进入 `poi-selected`，示例 `半边鱼(武昌店)`；Inspector 显示“传统地图小窗 · 已同步定位所选 POI”。
- 布局、浮层、拖动、响应式期间 Provider 调用增量：0。

真实验收中发现并修复了两项叠层命中问题：收起态开发工具条覆盖 Inspector 展开按钮，以及 pointer capture 过早夺走 polygon 短按。两项都已加入回归断言。

## 性能与测试

受控相同输入、相同 860×560 容器、10 节点、20 次预热后 70 次测量：

| 状态 | Before Median | After Median | Delta |
|---|---:|---:|---:|
| Overview cold | 3.477875ms | 3.523416ms | +1.309% |
| Focus warm | 3.433625ms | 3.481583ms | +1.397% |
| Return warm | 3.156208ms | 3.200208ms | +1.394% |

最大回归 1.397%，低于 10% 门槛。最终真实浏览器观测为 cold 7.7ms、focus warm 1.1ms、return warm 1.7ms、dropped frames 0；由于真实 POI 快照在多次 Provider 查询中变化，浏览器数值只作为观察值，不与旧快照强算百分比。

- 前端全量：173/173 PASS；
- Stage 13.1A.1 Layout Contract：6/6 PASS；
- Elastic Core：5/5 PASS；
- Stage 13.1A UI 回归：4/4 PASS；
- JavaScript syntax：PASS；
- `git diff --check`：PASS；
- Elastic core baseline diff：EMPTY。

## 第 82 号文档的 28 项回答

1. **Stage 13.1A 算法核心是否保持不变？** 是，核心目录 diff 为空且字节一致。
2. **Stage 13.0 Bubble Baseline 是否继续保留？** 是，仍是普通默认布局。
3. **是否只存在一个 Panmap Workspace？** 是，运行时计数为 1。
4. **Inspector 是否已脱离正常文档流？** 是，`position:absolute`。
5. **Inspector 打开时主画布尺寸是否不变？** 是，始终 909×738（1440 视口）。
6. **Inspector 是否可折叠？** 是，支持 collapsed/summary/detail 语义状态。
7. **Mini Map 是否已经真正悬浮？** 是，复用真实 MapLibre 实例的绝对定位浮窗。
8. **Mini Map 是否可折叠？** 是。
9. **Breadcrumb 是否已浮层化？** 是，左下 compact overlay。
10. **Developer Toolbar 是否已浮层化？** 是，仅开发参数入口显示。
11. **主 SVG 是否继续使用逻辑 860×560？** 是。
12. **SVG 是否可以铺满实际 Workspace？** 是，宽高 100% 且使用 `meet`。
13. **是否未修改 Elastic solver container 来适配 UI？** 是，solver 未修改。
14. **1440×900 下 mainCanvasAreaRatio 是多少？** 1.0。
15. **1920×1080 是否自动扩展？** 是，扩展为 1389×918。
16. **1280×720 是否仍保持单画布结构？** 是，计数为 1、比例为 1.0。
17. **Overlay 是否出现点击冲突？** 最终没有；验收发现的两个冲突均已修复并加测试。
18. **Inspector 是否遮挡 Focus 类别中心？** 否，安全区视图偏移生效，Focus 主体位于可观察区域。
19. **Safe Area 是否生效？** 是，展开态记录 right 380、left 280、bottom 64，仅作用于视图 transform。
20. **Mini Map 是否仍与 Panmap selected POI 联动？** 是，真实 POI 详情闭环通过。
21. **是否新增 Provider API 调用？** 否，布局交互增量为 0。
22. **Solver 性能是否出现超过 10% 回归？** 否，受控最大回归 1.397%。
23. **是否建立 execution-log？** 是。
24. **中期 GitHub backup 是否成功？** 是，`backup/stage13-1a-1-workspace-core-20260904` 已推送 `31607e7`。
25. **最终 GitHub backup 是否成功？** 尚未；安全审批要求用户明确授权源码、测试证据和截图的外部披露。
26. **`.env` 是否仍未进入 Git？** 是，继续由 `.gitignore:5` 忽略。
27. **是否发生 force push？** 否。
28. **是否修改远程 main？** 否。

## 硬门槛状态

| Gate | Status |
|---|---|
| Single Workspace | PASS |
| Main Canvas ≥80% | PASS（100%） |
| Floating Inspector | PASS |
| Floating Mini Map | PASS |
| Floating Breadcrumb | PASS |
| Dev Toolbar Overlay | PASS |
| Responsive 1280/1440/1920 | PASS |
| Overlay Interaction | PASS |
| Elastic Solver Regression | PASS |
| Provider Calls = 0 | PASS |
| GitHub Core Backup | PASS |
| GitHub Final Backup | PENDING EXPLICIT AUTHORIZATION |

因此当前是本地与浏览器完整通过，但必须等用户明确授权 final backup 后才能正式标记：

```text
Stage 13.1A.1
PANMAP SINGLE WORKSPACE PASS
```

## 证据索引

- `exports/stage-13-1a-1-panmap-workspace/00-baseline.md`
- `exports/stage-13-1a-1-panmap-workspace/01-layout-audit.md`
- `exports/stage-13-1a-1-panmap-workspace/layout-baseline.json`
- `exports/stage-13-1a-1-panmap-workspace/layout-metrics.json`
- `exports/stage-13-1a-1-panmap-workspace/responsive-audit.json`
- `exports/stage-13-1a-1-panmap-workspace/overlay-interaction-audit.json`
- `exports/stage-13-1a-1-panmap-workspace/performance-regression.json`
- `exports/stage-13-1a-1-panmap-workspace/browser-evidence.md`
- `exports/stage-13-1a-1-panmap-workspace/execution-log.md`
- `exports/stage-13-1a-1-panmap-workspace/test-results.json`
- `exports/stage-13-1a-1-panmap-workspace/github-sync-report.md`
- `exports/stage-13-1a-1-panmap-workspace/screenshots/`

本阶段没有自动进入 Stage 13.1B。前后端保持运行，等待人工验收和 final backup 授权。

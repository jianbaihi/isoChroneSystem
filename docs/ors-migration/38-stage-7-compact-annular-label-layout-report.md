# 第 38 号报告：紧凑环带标签布局与候选位置算法对比

## 1. 最终状态

`completed-with-layout-tradeoff`

四组算法均完成真实、可复现的本地计算；主方案前沿接触式的地理匹配与随机匹配均为 `placed=252`、`unplaced=0`，逐圈 `39/83/130`，四类碰撞为 0。紧凑性门禁通过，但地理匹配以明显增加方位角误差换取更小画布和连续贴边填充，因此不写作无条件 `completed`。

## 2. 实际修改文件

实现与接线：

- `src/adapters/compact-annular-layout.js`
- `src/adapters/compact-annular-layout.test.js`
- `src/adapters/panmap-layout-adapter.js`
- `src/state/panmap-control-state.js`
- `panmap-layout.js`
- `app.js`
- `index.html`
- `styles.css`

证据与文档：

- `scripts/build_stage37_compact_evidence.js`
- `docs/ors-migration/37-stage-7-compact-annular-label-layout-execution.md`
- `docs/ors-migration/38-stage-7-compact-annular-label-layout-report.md`
- `exports/stage-7-compact-annular/` 下 10 份结构化 JSON、7 张 PNG 及一个只用于同屏截图的本地 HTML。

未修改第 33 号双径向算法和第 35 号自然包络算法文件。

## 3. 冻结项核验

输入来自 `exports/stage-6-layout/stage20-cache-baseline.json`。输入冻结文件记录 `total=282`、`eligible=252`、`outOfRange=30`，逐圈为 `39/83/130`。全部新布局的 `semanticChanges=0`、`fontChanges=0`；标签 `rotation=0`，未隐藏、未删除，Matrix 时间和 `ringId` 均未变化。骑行未读取或修改，驾车仍为 `awaiting-approval`。

## 4. 旧规则与语义调整

第 33 号旧规则由圈内归一化通行时间 `q` 决定初始半径，并在目标方位附近向外搜索；其地理方位指纹为 `fnv1a-c715b7de`，画布为 `2324×2324`，环带为 `90–448 / 460–790 / 802–1142`。

紧凑模式保留 Matrix 时间用于唯一圈层和稳定排序，但不再声称圈内连续半径表达精确时间。实际半径由无碰撞、从内向外的紧凑填充决定；新模式表达的是“圈层级时间”。

## 5. 四种算法与两种主模式

- 旧径向：只读对照，不重写其坐标。
- 费马：使用黄金角候选场，再向内紧缩到合法接触位置。
- 泊松盘：使用固定种子生成的分散候选场，再执行相同的精确合法性与紧缩流程。
- 前沿接触式：从本圈内边界开始，把新标签放到内边界或既有标签 bbox 的接触前沿，完成后按精确最远角点生成最小圆形外边界。

主方案的“地理匹配”把目标方位作为候选代价；“紧凑随机匹配”只用固定种子改变标签处理顺序、相位和同分槽位选择，不生成无约束随机坐标。相同种子连续 5 次指纹一致；替换种子会改变匹配指纹，但不改变节点数、圈层或碰撞门禁。

## 6. 完整性与碰撞

| 算法 | placed | unplaced | 10/20/30 分钟 | overlap | outside | center | time-label |
|---|---:|---:|---|---:|---:|---:|---:|
| 旧径向 | 252 | 0 | 39/83/130 | 0 | 0 | 0 | 0 |
| 费马 | 252 | 0 | 39/83/130 | 0 | 0 | 0 | 0 |
| 泊松盘 | 252 | 0 | 39/83/130 | 0 | 0 | 0 | 0 |
| 前沿·地理匹配 | 252 | 0 | 39/83/130 | 0 | 0 | 0 | 0 |
| 前沿·随机匹配 | 252 | 0 | 39/83/130 | 0 | 0 | 0 | 0 |

## 7. 紧凑性指标

前沿地理匹配的三圈结果：

| 圈层 | 内/外半径 px | 内边界空环 px | 外边界余量 px | 带利用率 | voidRatio | 最大空洞半径 px | 近邻间距 min/median/p95 px |
|---|---:|---:|---:|---:|---:|---:|---:|
| 0–10 | 64 / 301.54 | 0 | 3 | 0.5784 | 0.4216 | 48.63 | 1.5 / 1.5 / 1.5 |
| 10–20 | 309.54 / 531.71 | 0 | 3 | 0.5992 | 0.4008 | 37.51 | 1.5 / 1.5 / 5.63 |
| 20–30 | 539.71 / 728.76 | 0 | 3 | 0.5574 | 0.4426 | 39.05 | 1.5 / 1.5 / 9.49 |

第一圈距中心安全外包络 2px，后续圈距上一圈外轮廓 8px。三圈 `unusedInnerBandPx=0`，外轮廓余量均为 3px。相比旧布局，前沿地理匹配画布从 2324 降到 1510，缩减 35.03%；有效画布利用率从 0.1721 提升到 0.4077。

费马、泊松盘、前沿地理匹配、前沿随机匹配画布分别为 1563、1548、1510、1717；有效画布利用率分别为 0.3805、0.3879、0.4077、0.3153。所有新算法均未缩小语义字号。

## 8. 画布、视图与字号

独立指标管线中，前沿地理匹配 `fitScale=0.6245`，全景适配后的最小字号为 9.24px；浏览器实际 1280×720 验收由于页面侧栏占用，全景最小屏幕字号为 5.46px，明确标记为非阅读状态。恢复阅读比例后为 8.67px。

浏览器切换前后均保留 252 个 DOM 节点，布局修订号均为 3，渲染指纹均为 `fnv1a-ac6abd7a`；全景/阅读切换只修改 view transform，没有重排。独立指标脚本与浏览器实测字体 bbox 存在亚像素差异，故分别保留稳定指纹，不把两者混写。

## 9. 地理方位代价

前沿地理匹配的角度误差为 mean `46.90°`、median `36.00°`、p95 `131.25°`、max `170.79°`，明显高于旧径向 mean `2.37°`。这是本阶段最主要的布局代价：标签更紧、画布更小，但不是严格的地理方位投影。建议保留前沿接触式为可选紧凑模式，不在缺少产品取舍确认时替换默认地理径向模式。

## 10. 稳定性与性能

| 算法 | 指标脚本指纹 | 布局耗时 ms | 候选检查数 |
|---|---|---:|---:|
| 费马 | `fnv1a-3fb8b6cf` | 83 | 208931 |
| 泊松盘 | `fnv1a-c14ed794` | 94 | 236904 |
| 前沿·地理 | `fnv1a-59ce1506` | 317 | 89546 |
| 前沿·随机 | `fnv1a-b66afd6d` | 356 | 78021 |

随机匹配同种子连续 5 次均为 `fnv1a-b66afd6d`；替换种子得到 `fnv1a-eaa763e6`。耗时来自同一次本地证据生成过程，不代表跨设备基准。

浏览器渲染指纹另行记录为：旧径向 `fnv1a-c715b7de`、费马 `fnv1a-3fb8b6cf`、泊松盘 `fnv1a-fd9a6f8a`、前沿地理 `fnv1a-ac6abd7a`、前沿随机 `fnv1a-a5c15af7`。

## 11. 截图与 SHA-256

7 张 PNG 均为本地页面的真实浏览器截图，完整哈希见 `stage37-screenshot-sha256.json`：

- `stage37-baseline-geographic.png` — `5784aa0e…5313`
- `stage37-fermat-compact.png` — `c6bd5a59…71f1`
- `stage37-poisson-compact.png` — `87e993f1…62eb`
- `stage37-frontier-geographic.png` — `c68b752d…9b5e`
- `stage37-frontier-random-match.png` — `497fdd35…782e`
- `stage37-four-algorithm-comparison.png` — `4eb46e4a…1bdf`
- `stage37-frontier-reading-view.png` — `db09e2b9…7a18`

## 12. 零 API 账本

| API | 预算 | 实际 |
|---|---:|---:|
| Isochrones | 0 | 0 |
| OpenPOIService | 0 | 0 |
| Matrix | 0 | 0 |
| Geocoder | 0 | 0 |

浏览器仅加载 `127.0.0.1` 的静态资源和冻结缓存；页面证据记录四类业务 API 为 0，`naturalEnvelopeRuns=0`。

## 13. 测试结果

执行命令：

```text
node --test src/adapters/compact-annular-layout.test.js src/adapters/dual-radial-layout.test.js src/view/radial-view-contract.test.js src/state/panmap-control-state.test.js src/state/panmap-control-ui.test.js src/state/analysis-store.test.js src/adapters/panmap-layout-adapter.test.js src/contracts/analysis-contracts.test.js
```

结果：`32 passed / 0 failed / 0 skipped`，总耗时约 `5.65s`。另执行 `node --check` 检查新布局、页面接线、应用脚本和证据脚本；全部结构化 JSON 通过 `jq empty`，`git diff --check` 无输出。

## 14. 已知限制与建议

- 前沿接触式的地理角度变形较大，默认模式选择需要产品确认。
- 最大空洞指标基于固定采样，不是解析几何的全局最大空圆证明。
- 泊松盘在本阶段是“固定种子候选场 + 精确紧缩”，不等同于保持原始泊松距离的最终坐标。
- 紧凑模式表达圈层级时间，不表达圈内连续时间半径。

## 15. 停止声明

本轮未运行或修复第 35 号自然包络，未运行 D3 density，未进入类别聚类、渐进展开、评分热度或任何后续阶段。浏览器验收标签已关闭，临时 `127.0.0.1:5500` 静态服务器已停止；第 38 号交付完成后已停止。

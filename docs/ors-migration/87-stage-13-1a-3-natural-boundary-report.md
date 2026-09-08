# 第 87 号执行报告：Stage 13.1A.3 Natural Annular Elastic v2

## 结论

第 86 号文档要求的最小一步已完成：在不改写 Bubble、Rectangular v0、Annular v1，不进入多圈层，也不新增 Provider 请求的前提下，新增了 Natural Annular v2。它在固定中心、固定单一互斥 `ring-10-20` 内，以真正共享的自然曲边构造十个类别区域。

核心提交为 `44338a5`。全量测试 196/196 通过。真实浏览器链路使用武汉·黄鹤楼、步行、10/20/30 分钟，4005 个 POI 全部完成分钟级空间归属，Natural v2 的 20 分钟互斥圈层含 1914 个 POI。

## 基线与新增修改

基线为 Stage 13.1A.2 最终提交 `8dcd6b7`：已具备 Bubble Baseline、Rectangular Elastic v0、Annular Elastic v1、单一泛地图工作区、Inspector、传统地图小窗和面包屑。

本阶段新增：

- `src/elastic-region/natural-boundary/` 九个业务无关核心模块；
- `SharedBoundaryGraph`，每对相邻区域只保存一条边界并反向复用；
- 7 控制点自然曲边、端点圆周投影、循环顺序约束和确定性求解；
- 复用 Annular v1 share solver 的目标份额；
- `previousBoundaryState` warm start 和 4 次/帧、32 次稳定求解；
- 面积、拓扑、曲率、局部性、时间连续性、回程与性能指标；
- Natural v2 第四模式、Inspector 指标、320ms 动画和响应式证据；
- 自动化测试、证据生成脚本、九张浏览器截图及审计 JSON。

## 46 项验收答复

| # | 答复 | 证据/结果 |
|---:|---|---|
| 1 | Bubble 是否保留 | 是，默认模式仍为 Bubble Baseline。 |
| 2 | Rectangular v0 是否保留 | 是，原入口和逻辑保留。 |
| 3 | Annular v1 是否保留 | 是，并提供对照截图 01。 |
| 4 | 是否新增 Natural v2 | 是，作为第四个开发模式。 |
| 5 | 是否只做单中心单圆环 | 是，固定一个中心和一个圆环容器。 |
| 6 | 是否使用 `ring-10-20` 互斥圈层 | 是，真实场景为 20 分钟互斥圈层。 |
| 7 | 是否复用 v1 share solver | 是，直接调用原 `baseShares/solve`，未复制策略。 |
| 8 | 类别顺序是否稳定 | 是，`orderChangeCount=0`。 |
| 9 | 是否未引入地理方向 | 是，核心无经纬方向输入。 |
| 10 | 是否实现 SharedBoundaryGraph | 是，输出 `shared-boundary-graph-v1`。 |
| 11 | 相邻对是否只存一条边界 | 是，10 区域对应 10 条唯一边界，duplicate=0。 |
| 12 | 是否避免独立 envelope 拼接 | 是，区域直接引用边界图中的同一折线。 |
| 13 | `boundaryCrossingCount` | 0。 |
| 14 | `selfIntersectionRegionCount` | 0。 |
| 15 | `gapRatio` | 实测 0.00004995（0.004995%），低于 0.1%。 |
| 16 | `overlapRatio` | 0。 |
| 17 | 平均面积误差 | 0.00000499（0.000499%），低于 2%。 |
| 18 | 最大面积误差 | 0.00001569（约 0.00157%），低于 5%。 |
| 19 | 中心位移 | 0。 |
| 20 | 内半径变化 | 0。 |
| 21 | 外半径变化 | 0。 |
| 22 | 顺序变化 | 0。 |
| 23 | 聚焦面积是否增长 | 是，餐饮从约 17.2% 增至 30.87%。 |
| 24 | 上下文是否仍可见 | 是，最小份额约束保持所有类别可见。 |
| 25 | 是否记录局部性 | 是，按循环图距离输出每条边界最大移动。 |
| 26 | 是否使用 `previousBoundaryState` | 是，动画帧强制 warm start。 |
| 27 | 相邻帧是否平滑 | 是，0.50→0.51 最大控制点位移低于 2px，浏览器无掉帧。 |
| 28 | 回程拓扑是否精确恢复 | 是，0→.25→.5→1→.5→0 的边界引用完全一致。 |
| 29 | 回程几何漂移 | 0.000409px。 |
| 30 | 是否记录曲率 | 是，mean/max/variation 均写入审计。 |
| 31 | p95 求解时间 | 0.699ms，低于 8ms。 |
| 32 | 浏览器最大帧 | 16.7ms，低于 20ms。 |
| 33 | 掉帧 | 0。 |
| 34 | 是否明显区别于规则圆环 | 是，自然 S 形共享曲边清晰可见。 |
| 35 | 是否是真共享几何而非滤镜 | 是，SVG 路径来自共享边界图的几何采样。 |
| 36 | Provider 调用增量 | 0。 |
| 37 | Resize 是否稳定 | 是，1280/1440/1920 边界 fingerprint 相同。 |
| 38 | 测试是否全通过 | 是，196/196。 |
| 39 | 日志是否实时记录 | 是，`execution-log.md` 分阶段记录。 |
| 40 | 离线 bundle | `/Users/zhangzhihan/isoChroneSystem-before-stage13-1a-3.bundle`，verify PASS。 |
| 41 | Stage 13.1A.2 远端备份 | 仍待明确外部推送授权。 |
| 42 | Stage 13.1A.3 core 备份 | 本地分支已创建；远端待授权。 |
| 43 | Stage 13.1A.3 final 备份 | 本地最终分支在报告提交后创建；远端待授权。 |
| 44 | `.env` 是否进入 Git | 否，仍由 `.gitignore` 排除。 |
| 45 | 是否 force push | 否。 |
| 46 | remote main 是否不变 | 是，仍为 `3fd90aba12dd2017d39e65250ae23959b8ef55c5`。 |

## 验收与证据索引

- 浏览器证据：`exports/stage-13-1a-3-natural-boundary/browser-evidence.md`
- 对比说明：`exports/stage-13-1a-3-natural-boundary/comparison-notes.md`
- 图结构、几何、面积、拓扑、曲率、局部性、时间稳定、回程、性能与响应式审计：同目录 JSON
- 截图：`exports/stage-13-1a-3-natural-boundary/screenshots/01` 至 `09`

## 未执行项与边界

- 未进入多圈层嵌套、地理方向、二级类别或标签布局。
- 未修改 Provider、可达域、POI 或分钟级 API 的业务逻辑。
- 未向 GitHub 推送任何新分支；远端备份等待用户明确授权。
- 本地前端 `127.0.0.1:5500` 与后端 `127.0.0.1:8000` 保持运行，最终浏览器停留在 Natural v2、alpha 0、Inspector 与 Mini Map 可见的验收态。

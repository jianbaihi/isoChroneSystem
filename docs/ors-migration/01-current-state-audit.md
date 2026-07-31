# ORS 迁移第 1 阶段：当前状态审计

## 1. 审计范围与仓库状态

- 审计日期：2026-07-26。
- 仓库目录：`/Users/zhangzhihan/Desktop/项目的UI界面`。
- 当前分支：`main`，跟踪 `origin/main`。
- 已跟踪源码：`index.html`、`styles.css`、`app.js`、`panmap-layout.js`。
- 用户现有未提交修改：根目录的 `ORS地图服务重构_Codex执行文档_第1阶段.md` 为未跟踪文件；本阶段未修改、移动或删除该文件。
- 仓库中未找到 `AGENTS.md`、README、包管理文件、锁文件、构建配置、TypeScript 配置、后端配置、Docker Compose、环境变量样例或 CI 配置。
- 本阶段没有安装、删除或升级依赖，没有接入 ORS，没有创建数据库，也没有修改现有页面和业务代码。

## 2. 仓库与技术栈摘要

| 范围 | 当前实现 | 依据 |
|---|---|---|
| 前端框架 | 无框架，原生 HTML、CSS、JavaScript | `index.html:1-10`、`index.html:647-648` |
| 语言 | HTML、CSS、JavaScript；没有 TypeScript | `index.html`、`styles.css`、`app.js`、`panmap-layout.js` |
| 构建工具 | 无；源码由浏览器直接加载 | `index.html:8`、`index.html:647-648`；仓库无包管理和构建配置 |
| 传统地图内核 | 没有 Leaflet、Mapbox GL、MapLibre、OpenLayers 或高德地图；当前是手绘 SVG 原型 | `index.html:211-261` |
| 泛地图 | 原生 SVG DOM；没有 D3、Canvas 或 WebGL 依赖 | `index.html:263-584`、`panmap-layout.js:115-119` |
| 泛地图算法 | 自实现类别吸引/碰撞、环带约束、密度采样、KDE 极坐标等值线与 Catmull-Rom 闭合路径 | `panmap-layout.js:131-287`、`panmap-layout.js:290-424` |
| 状态管理 | 无 Pinia、Vuex、Redux、Zustand 或独立状态中心；使用模块变量、DOM class、`data-*` 和 `window` 全局对象 | `app.js:18-26`、`app.js:157-171`、`panmap-layout.js:593-601` |
| HTTP 层 | 不存在统一请求封装，也不存在任何业务网络请求 | 全仓库未找到 `fetch`、XHR、Axios、WebSocket 等调用 |
| 后端 | 不存在 | 仓库目录树与配置扫描 |
| 数据库 | 不存在；未使用 PostgreSQL/PostGIS | 仓库目录树与配置扫描 |
| 缓存、异步任务、日志 | 不存在；只有浏览器 `setTimeout` 模拟生成等待和 toast | `app.js:129-134`、`app.js:328-340` |
| 测试与 CI | 不存在测试、Lint、类型检查、构建和 CI 脚本 | 仓库无相关配置 |

## 3. 关键目录树

```text
项目的UI界面/
├── index.html
├── styles.css
├── app.js
├── panmap-layout.js
├── ORS地图服务重构_Codex执行文档_第1阶段.md  # 用户未跟踪文件
└── docs/
    └── ors-migration/
        ├── 01-current-state-audit.md
        └── 02-target-boundaries.md
```

当前没有 `src/`、`server/`、`api/`、`tests/`、`public/` 或数据库迁移目录。

## 4. 传统地图实现位置

### 4.1 主视窗

- 入口：`index.html:197-211` 的 `#mapPanel`、`#mapSurface` 和 `svg.map-art`。
- 地图内容：道路、网格、地名、等时圈和中心点全部是硬编码 SVG path/text，见 `index.html:216-260`。
- 地图图层：没有运行时图层对象；“道路层”“等时圈层”和标注只是同一 SVG 中的静态 `<g>`/`<path>`。
- 等时圈来源：`index.html:247-251` 的三个静态 SVG path，不是路网计算结果。
- 交互：`app.js:346-356` 的地图控制仅在泛地图模式下改变泛地图 `viewBox`；传统地图主视窗没有真实缩放、平移、图层或点选实现。

### 4.2 泛地图内的传统地图小窗

- 入口：`index.html:615-630` 的 `#miniTraditional` 与 `svg.mini-map-art`。
- 内容：仍是独立硬编码 SVG，并非主传统地图视图的缩略或共享实例。
- 交互：`app.js:570-574` 只显示提示信息，没有改变地图状态。
- 并列/小窗布局：`app.js:190-205` 和 `app.js:409-427` 通过 DOM class 与 CSS 变量切换、拖拽比例；样式位于 `styles.css:242-254`、`styles.css:279`。

## 5. 泛地图实现位置

- SVG 入口：`index.html:263` 的 `svg.panmap-art`。
- 动态容器：`index.html:420` 的 `g.organic-map`。
- 加载顺序：`index.html:647-648` 先执行 `panmap-layout.js`，再执行 `app.js`。
- 数据定义：`panmap-layout.js:7-105` 的 `layers`，包含 10/20/30 分钟层、类别、父子标签、颜色、数量和半径。
- 布局：
  - `makeLayerNodes()`：生成父子胞泡初始位置，`panmap-layout.js:147-194`。
  - `resolveCollisions()`：同类吸引、异类/同类碰撞分离与环带约束，`panmap-layout.js:196-287`。
  - `densitySamples()`：在胞泡内部和边界采样密度点，`panmap-layout.js:290-314`。
  - `kdeContour()`：沿 120 个方向采样高斯密度并包络所有胞泡，`panmap-layout.js:367-413`。
  - `renderLayer()` / `renderCategory()`：直接创建 SVG 元素，`panmap-layout.js:427-515`。
  - `buildOrganicPanmap()`：逐层排布，累积生成 10/20/30 分钟边界并替换 `.organic-map` 内容，`panmap-layout.js:557-602`。
- 可保留的算法模块：确定性随机数、父子胞泡构造、碰撞分离、环带约束、密度采样、KDE 等值线、碰撞与边界净距审计。
- 交互：
  - 圈层聚焦：`setActiveTimeLayer()`，`app.js:221-250`。
  - 类别悬浮：`app.js:252-264` 与 `styles.css:526-553`。
  - 画布缩放/拖拽：`app.js:28-127`。
  - 重新布局：`app.js:325-340` 调用 `window.rebuildPanmapLayout()`。

## 6. 当前数据来源

| 数据 | 当前来源 | 说明 |
|---|---|---|
| 中心点 | `index.html:87-93`、`index.html:134-138` 的硬编码“望京广场”和坐标 | 下拉选择只改按钮文本，不进入地图计算 |
| 交通方式 | `index.html:97-104`、`index.html:141-149` | 只切换选中样式和文字 |
| 时间阈值 | `index.html:152-168` | 可在 DOM 中增删改，但不会重建真实等时圈参数 |
| POI 类别选择 | `index.html:108-120`、`index.html:171-182` | 只影响复选框/按钮状态和计数文字 |
| POI 类别与数量 | `panmap-layout.js:7-105`、`app.js:215-218`、`index.html:598-604` | 三处静态数据存在重复，且统计口径未由一个模型生成 |
| 等时圈 | 传统地图静态 path；泛地图由静态胞泡数据生成的 KDE 包络 | 都不是 ORS 或真实路网结果 |
| 通行时间 / Matrix | 不存在 | 没有 POI 级 travel time、矩阵或圈层归属数据 |
| POI 实体 | 不存在 | 当前只有类别/标签汇总，没有带 `poiId` 和坐标的 POI 记录 |

## 7. 当前四条数据流

### 7.1 中心点变化 → 数据请求/计算 → 等时圈生成 → 地图绘制

```text
地点建议项点击
→ app.js 的 suggest-option click
→ setLocationToolbarButton()
→ 只替换工具栏 HTML 和 toast
→ 无网络请求、无等时圈计算、无地图重绘
```

- 触发入口：`index.html:90-93`。
- 主要函数：`setLocationToolbarButton()`、建议项 click，`app.js:148-150`、`app.js:380-387`。
- 输入：`data-place` 字符串。
- 中间结构：无。
- 输出：工具栏文字。
- 全局状态：未保存中心点坐标；没有统一数据状态。
- 网络请求：无。
- 问题：中心点表单、工具栏和地图中心之间没有数据绑定。

地图选点链路同样只在 `app.js:389-407` 把文案改成“地图选点，当前视图”，没有读取经纬度或重新计算。

### 7.2 POI 数据载入 → 数据转换 → 圈层/类别分配 → 绘制

```text
页面加载
→ panmap-layout.js 中静态 layers
→ makeLayerNodes()
→ resolveCollisions()
→ densitySamples() / kdeContour()
→ renderLayer() / renderCategory()
→ SVG 泛地图
```

- 触发入口：`panmap-layout.js:602`。
- 输入：`panmap-layout.js:7-105` 的静态类别汇总。
- 中间结构：`node`、`layout`、`contour`，仅存在内存中。
- 输出：动态 SVG 与 `window.panmapLayoutState`，`panmap-layout.js:579-598`。
- 全局状态：写入 `window.panmapLayoutState`。
- 网络请求：无。
- 问题：
  - 没有 POI 实体和坐标；
  - 圈层归属由文件中的 10/20/30 分组直接指定，不是通行时间计算；
  - POI 类别复选框不参与 `buildOrganicPanmap()`；
  - `index.html` 中保留了一份会被 `replaceChildren()` 替换的静态 `.organic-map` 标记，形成重复实现。

### 7.3 传统地图点击 POI → 状态变化 → 泛地图响应

```text
未实现
```

- 传统地图 SVG 没有 POI 实体节点、`poiId` 或 POI click 监听。
- `app.js:397-407` 的 `mapSurface` click 仅服务于“地图选点”文案。
- 没有全局 POI 选中状态，也没有向泛地图派发事件。
- 当前无法完成传统地图到泛地图的 POI 联动。

### 7.4 泛地图点击类别/标签 → 状态变化 → 传统地图响应

```text
类别悬浮
→ 给 category-cluster / time-layer 添加 class
→ CSS 改变透明度和描边
→ 无共享数据状态、无传统地图响应
```

- 入口：`app.js:252-264`。
- 输入：当前 DOM 类别节点及其 `data-category`。
- 输出：视觉高亮。
- 全局状态：无；只有 DOM class。
- 网络请求：无。
- 强耦合：逻辑依赖 `.category-cluster`、`.organic-time-layer` 等选择器。
- 类别点击没有处理器；圈层边界/标签点击会调用 `setActiveTimeLayer()`，但只更新泛地图 class 和概览静态数字，`app.js:221-244`。

## 8. 状态管理与双视图联动

### 8.1 数据状态现状

- 中心点、交通方式、阈值和类别主要保存在 DOM 文字、class、checkbox 或 `data-*` 中。
- `timeLayerStats` 是 `app.js:215-218` 的静态对象。
- 泛地图布局结果位于 `window.panmapLayoutState`，`panmap-layout.js:593-598`。
- 不存在 `poiId`、`ringId`、`categoryId`；只有显示用的 `data-category`、`data-time-layer`。

### 8.2 视觉/交互状态现状

- 模式切换：`#appShell.is-panmap`，`app.js:157-171`。
- 圈层聚焦：`.focus-layer-10/20/30`，`app.js:221-235` 与 `styles.css:508-524`。
- 类别悬浮：`.is-category-hover`、`.is-hovered`，`app.js:252-264`。
- 画布视口：`panmapViewBox`，`app.js:25-50`。
- 并列比例：`--split-ratio`，`app.js:417-422`。

### 8.3 双视图联动现状

两个视图共享页面和 CSS 模式，但不共享领域状态。`setPanmapMode()` 与 `toggleSplitMap()` 只是显示/隐藏和布局切换；传统地图、泛地图之间没有基于稳定 ID 的选择、筛选或高亮协议。

## 9. 外部依赖和密钥风险

### 9.1 扫描结果

- 未发现业务 HTTP 请求、瓦片地址、地理编码、POI、路线、矩阵或等时圈服务 URL。
- `http://www.w3.org/2000/svg` 仅是 SVG XML 命名空间，不是网络请求。
- 未发现 API Key、token、用户名、密码、Authorization 或 Bearer 字符串。
- 未发现 `.env`、环境变量样例、CORS 代理或开发代理配置。
- 未发现第三方前端库或 CDN。

### 9.2 风险记录

```text
仓库根目录：没有 .gitignore 和环境变量样例；中风险；
接入 ORS 或后端之前必须建立忽略规则、仅提交脱敏的 .env.example，并确保前端永不读取 ORS Key。

app.js / index.html / panmap-layout.js：业务数据和视觉演示数据硬编码在浏览器端；中风险；
后续应由内部数据契约承接分析结果，但不得把 ORS 原始响应或 Key 直接注入这些文件。
```

当前没有需要撤销的已暴露密钥。

## 10. 构建与测试基线

| 检查 | 结果 | 说明 |
|---|---|---|
| `node --check app.js` | 通过 | JavaScript 语法有效 |
| `node --check panmap-layout.js` | 通过 | JavaScript 语法有效 |
| 前端构建 | 未执行 | 仓库没有包管理文件或构建命令 |
| TypeScript | 不适用 | 项目没有 TypeScript |
| ESLint | 未执行 | 无配置、无现有命令 |
| 单元测试 | 未执行 | 无测试目录、框架或命令 |
| 后端测试 | 不适用 | 无后端 |
| Docker Compose | 不适用 | 无 Compose 配置 |
| 本地 HTTP 健康检查 | 未执行成功 | `127.0.0.1:4173` 当时没有运行服务；属于环境未启动，不是代码失败 |

## 11. 改造影响矩阵

| 现有模块 | 当前职责 | 目标职责 | 处理方式 | 风险 |
|---|---|---|---|---|
| `index.html` 参数区 | 静态参数控件和演示数据 | 只采集用户参数、渲染视图容器 | 渐进替换 | 中 |
| `index.html` `svg.map-art` | 手绘传统地图 | 由 MapLibre GL JS 容器和图层替代 | 渐进替换 | 高 |
| `index.html` `svg.mini-map-art` | 独立手绘缩略图 | 与传统地图共享同一分析结果和视口摘要 | 渐进替换 | 中 |
| `index.html` `svg.panmap-art` | 泛地图 SVG 容器和旧静态备份标记 | 保留为泛地图渲染容器，移除数据重复来源 | 保留 / 渐进整理 | 中 |
| `panmap-layout.js` 布局算法 | 静态类别汇总的胞泡排布与 KDE 包络 | 消费内部 `AnalysisResult`，输出纯布局结果 | 包装 | 中 |
| `panmap-layout.js` SVG 渲染 | 算法与 DOM 创建混合 | 通过 Adapter 隔离布局计算与 SVG 渲染 | 包装 | 中 |
| `app.js` | 所有页面事件、临时状态和视图控制 | 薄 UI 编排层，读写统一状态并调用 API/视图 Adapter | 渐进替换 | 高 |
| `styles.css` | 全部视觉与交互状态样式 | 继续负责视觉状态，不承载数据状态 | 保留 | 低 |
| `timeLayerStats` 与重复统计 | 演示概览 | 从统一分析结果派生 | 渐进替换 | 中 |
| HTTP / Analysis API | 不存在 | 前端唯一业务请求入口 | 新增 | 高 |
| ORS Adapter | 不存在 | 在后端隔离 ORS 请求/响应与密钥 | 新增 | 高 |
| POI Provider Adapter | 不存在 | 标准化外部或自建 POI 数据 | 新增 | 高 |
| PostgreSQL/PostGIS | 不存在 | 空间数据中心、圈层差集、归属和索引 | 新增 | 高 |
| 统一前端状态中心 | 不存在 | 管理数据状态与视觉状态、协调双视图 | 新增 | 高 |

## 12. 阻塞项与待确认问题

1. **后端技术栈待确认**：仓库没有任何后端基础，不能判断应选择 Node、Python、Java 或其他方案。
2. **部署目标待确认**：没有本地、云端或容器部署约束。
3. **POI 提供者待确认**：公共数据源、许可、限额、中文类别体系和更新频率均未确定。
4. **ORS 运行方式待确认**：先使用公共 ORS 还是直接准备自建 ORS 尚未确定；无论选择哪种，前端均不得接触 Key。
5. **内部坐标系待确认**：当前示例标注 WGS84，但未来底图、POI 数据源和存储坐标系需统一。
6. **时间圈层语义待确认**：当前 10/20/30 分钟是静态类别分组；未来应明确累计等时圈与互斥环带的权威生成规则。
7. **POI 类别树待确认**：当前类别与父子标签为演示数据，没有稳定 `categoryId`、版本或跨提供者映射。
8. **传统地图替换时机待确认**：建议先完成内部契约和最小 API 闭环，再替换 SVG，避免地图内核迁移与数据接入同时发生。
9. **用户执行文档是否纳入版本控制待确认**：该文件当前未跟踪，本阶段没有擅自提交。


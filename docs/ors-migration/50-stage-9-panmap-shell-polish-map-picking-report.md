# 第50号报告：泛地图框架收口、圈层配色与地图选点

状态：`completed`

执行文档：第49号。完成时间：2026-08-06 12:22（Asia/Shanghai）。本阶段未进入后续骑行、驾车、巴黎、类别聚类、评分热度或部署任务。

## 1. 冻结基线

- 第45号真实步行结果保持不变：Analysis ID `analysis-name-cloud-7823d8e3-5c27-4a22-8b78-be5939c4e2ba`。
- total / eligible / out-of-range：284 / 254 / 30。
- 10 / 20 / 30 分钟圈层：39 / 85 / 130。
- Matrix 指纹：`c4a00b9309bdd758ad6313c068a3321151e6576079c78fa97cc78db75c67578f`。
- 第43号 252 / 39 / 83 / 130 实验基线保持冻结，`recomputed=false`。
- 第22、33、37、41、43号标签布局算法未修改。

开始门禁与只读审计：

- [stage49-baseline.json](../../exports/stage-9-panmap-shell-polish/stage49-baseline.json)
- [stage49-ui-audit.md](../../exports/stage-9-panmap-shell-polish/stage49-ui-audit.md)

## 2. 完成能力

### 2.1 紧凑普通/研究开关

- 删除顶部占整行的大型普通/研究 Tab。
- 在“泛地图工作台”标题右侧加入“普通 / 研究”紧凑 Switch，保留 `role=switch`、键盘焦点和 `aria-checked`。
- 继续使用唯一的 `PanmapApp.panmapModeStore`，未新增第二模式状态源。
- 连续切换 20 次后，254 个标签节点、坐标指纹 `fnv1a-0bd70523`、Analysis ID、Matrix 指纹和 viewBox 均未变化。
- `research=1` 旧链接继续进入研究模式。

证据：[mode-switch-compact-evidence.json](../../exports/stage-9-panmap-shell-polish/mode-switch-compact-evidence.json)。

### 2.2 统一工作区 Shell

- 可达域与泛地图左侧卡片统一为 425px、13px 圆角、12px CSS gap、10px workspace padding。
- 当前浏览器实测两页卡片宽度均为 425px，卡片与画布边界间距均约 13px（包含边框像素）。
- 泛地图工作台继续作为 flex 成员真实推挤画布，不覆盖画布。
- 原泛地图收起按钮和逻辑已移除。
- 断点宽度统一为 390px（<=1230px）和 350px（<=900px）。

证据：[workspace-shell-measurements.json](../../exports/stage-9-panmap-shell-polish/workspace-shell-measurements.json)。

### 2.3 骨架屏、推挤与返回

- 视图状态机为 `map-view → panmap-entering-skeleton → panmap-entering-panel → panmap-ready`，返回使用 `panmap-leaving`。
- 骨架阶段立即隐藏旧可达域配置卡片，主画布占满侧栏以外的可用宽度；中性背景为 `#f3f6f8`，无红色或异常纯色背景。
- 工作台由 0px 平滑扩展到 425px，最终与画布间距约 13px，无横向滚动条。
- 完成主要由 `transitionend` 驱动，420ms 仅为单一安全兜底。
- Stage33 resize 与泛地图 ResizeObserver 增加 shell 过渡、隐藏容器、非 ready 状态门禁。修复后连续两次返回/重进，标签节点、坐标指纹和 viewBox 均保持不变。

证据：[panmap-entry-transition-evidence.json](../../exports/stage-9-panmap-shell-polish/panmap-entry-transition-evidence.json)、[state-preservation.json](../../exports/stage-9-panmap-shell-polish/state-preservation.json)。

### 2.4 Favicon

- 新增 `favicon.svg`，复用项目定位针、等时圈和绿/蓝/橙视觉语义。
- `<head>` 已添加 `type=image/svg+xml` 的 icon link。
- 浏览器页面资源清单已观测到 `http://127.0.0.1:5500/favicon.svg`，来源同时包括资源加载与 link href，不存在 favicon 404。

证据：[favicon-evidence.json](../../exports/stage-9-panmap-shell-polish/favicon-evidence.json)。

### 2.5 单一圈层 Palette

- 新增 `src/config/isochrone-palette.js` 作为唯一圈层颜色来源。
- 10 / 20 / 30 分钟统一为绿 `#1e9152`、蓝 `#2670e1`、紫 `#8b57be`。
- 时间阈值色条、图例多边形、MapLibre Polygon fill / line 与 active 强调均从同一 palette 派生。
- 实测新增 15 分钟后，10/15/20/30 为绿/蓝/紫/橙；删除 20 分钟后，10/15/30 重新分配为绿/蓝/紫；最后已恢复 10/20/30。
- 点击 20 分钟图例后，阈值行与图例同时获得 `is-active-ring`，图例 `aria-pressed=true`，其他圈层仍可见。
- 累计 Polygon 继续按外圈优先顺序绘制；配色变更不生成新几何。

证据：[isochrone-palette-evidence.json](../../exports/stage-9-panmap-shell-polish/isochrone-palette-evidence.json)。

### 2.6 地图选点与 stale 契约

- 地图选点按钮拥有显式 active 状态和 `aria-pressed`。
- 选点时 MapLibre dragPan 暂停，光标使用 `assets/map-pick-cursor.svg`，热点为定位针底部 `(16,35)`。
- 鼠标移动显示 6 位小数 WGS84 坐标；不调用 Geocoder。
- 实测点击后更新为“地图选点”，详细坐标为 `116.478860° E, 40.000757° N`；中心 marker 与统一 draft center 状态同步。
- 原圈层与 POI 标记为上一中心点旧结果，显示 stale 提示；“探索泛地图”禁用，“生成可达域”重新可用。
- live region 提示“已选择新的中心点：地图选点”。
- Esc 取消后 `aria-pressed=false`、选点 class 移除、地图拖拽与 grab cursor 恢复。
- 浏览器验收后已恢复黄鹤楼、步行、10/20/30 分钟缓存基线。

证据：[map-picking-evidence.json](../../exports/stage-9-panmap-shell-polish/map-picking-evidence.json)。

## 3. 零业务上游请求

第49号预算及实际新增请求均为：

| 服务 | 预算 | 实际新增上游请求 |
|---|---:|---:|
| Isochrones | 0 | 0 |
| OpenPOIService | 0 | 0 |
| Matrix | 0 | 0 |
| Geocoder | 0 | 0 |
| Directions | 0 | 0 |

新浏览器会话开始时仅按第47号已验收方式进行一次同参数本地缓存恢复，作业 `a087d3ed-6d21-4329-89b0-a1f70795f4ff` 的 Isochrones、POI、Matrix 均为 attempted=1 / cacheHit=1 / upstream=0；Geocoder、Directions 为 0。模式切换、阈值增删、进入动效、地图选点和 favicon 加载未创建新的业务作业或上游请求。

证据：[zero-upstream-evidence.json](../../exports/stage-9-panmap-shell-polish/zero-upstream-evidence.json)。普通 OSM 底图瓦片不计入业务上游。

## 4. 测试结果

- Node 语法检查：`app.js`、`panmap-layout.js`、研究模式、传统地图 adapter、palette、analysis store 全部通过。
- Node 全量测试：104 / 104 通过。
- Python 全量测试：88 / 88 通过；仅有既有 Starlette 与 Pydantic 弃用警告。
- `git diff --check`：通过。
- 浏览器控制台错误：0。

完整命令与结果：[test-summary.json](../../exports/stage-9-panmap-shell-polish/test-summary.json)。

## 5. 实际修改文件

本阶段修改或新增：

- `index.html`
- `app.js`
- `styles.css`
- `panmap-layout.js`
- `favicon.svg`
- `assets/map-pick-cursor.svg`
- `src/config/isochrone-palette.js`
- `src/config/isochrone-palette.test.js`
- `src/config/ring-tokens.js`
- `src/adapters/traditional-map-adapter.js`
- `src/state/analysis-store.js`
- `src/state/analysis-store.test.js`
- `src/state/panmap-control-ui.test.js`
- `src/state/stage49-shell-ui.test.js`
- `src/research/research-mode.test.js`
- `exports/stage-9-panmap-shell-polish/stage49-baseline.json`
- `exports/stage-9-panmap-shell-polish/stage49-ui-audit.md`
- 本报告及本目录第49号结构化证据和 PNG。

未重置、清理、覆盖或回退工作区中第49号开始前已有修改。

## 6. 真实 PNG 与 SHA-256

- [stage49-panmap-skeleton-full-canvas.png](../../exports/stage-9-panmap-shell-polish/stage49-panmap-skeleton-full-canvas.png)
- [stage49-panmap-workbench-slid-in.png](../../exports/stage-9-panmap-shell-polish/stage49-panmap-workbench-slid-in.png)
- [stage49-compact-mode-switch-research.png](../../exports/stage-9-panmap-shell-polish/stage49-compact-mode-switch-research.png)
- [stage49-isochrone-palette-map.png](../../exports/stage-9-panmap-shell-polish/stage49-isochrone-palette-map.png)
- [stage49-map-picking-cursor.png](../../exports/stage-9-panmap-shell-polish/stage49-map-picking-cursor.png)
- [stage49-map-picked-new-center.png](../../exports/stage-9-panmap-shell-polish/stage49-map-picked-new-center.png)
- [stage49-browser-favicon.png](../../exports/stage-9-panmap-shell-polish/stage49-browser-favicon.png)

7 个文件均经 `file` 验证为 PNG；尺寸与 SHA-256 见 [screenshot-sha256.json](../../exports/stage-9-panmap-shell-polish/screenshot-sha256.json)。

## 7. 停止与运行状态

- 第49号状态：`completed`。
- 未执行下一阶段。
- 前端监听 `127.0.0.1:5500`，后端监听 `127.0.0.1:8000`。
- 最终浏览器停留在可达域生成页，中心为黄鹤楼、交通方式为步行、阈值为 10/20/30 分钟，地图选点按钮可立即点击；已生成步行缓存保留。

前端、后端与浏览器均保持运行，未退出；等待用户亲自验收。

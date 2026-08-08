# 第49号开始前 UI 审计

状态：`completed-before-code-change`

## 基线一致性

- 第45号真实步行结果已通过同参数本地缓存恢复：284 个 POI、254 个 eligible、30 个 out-of-range，逐圈 39 / 85 / 130。
- Matrix 指纹为 `c4a00b9309bdd758ad6313c068a3321151e6576079c78fa97cc78db75c67578f`。
- 页面仅在数量和指纹吻合后恢复发布 Analysis ID `analysis-name-cloud-7823d8e3-5c27-4a22-8b78-be5939c4e2ba`。
- 第43号 252 / 39 / 83 / 130 基线保持冻结，`recomputed=false`。
- 恢复作业的 Isochrones、POI、Matrix 各 1 次本地 cache hit，各 0 次上游；Geocoder、Directions 为 0。

## Shell 差异

- 可达域页 `#configPanel` 在 1367×897 视口下实测约 420.97px，泛地图 `#panmapControlPanel` 为 282px。
- 可达域卡片与画布间距约 10.06px；泛地图卡片通过 `.map-panel { margin-left:-10px }` 抵消了 workspace gap，实测间距为 0。
- 两张卡片虽均使用 13px 圆角，但宽度、间距、滚动区域和进入方式没有统一 token。
- 泛地图工作台已经是 map panel 的前置 flex sibling，具备真正推挤画布的结构基础；无需改成覆盖层。

## 模式控件

- `#panmapModeSwitch` 当前位于顶部工具栏，使用两个大尺寸 radio 按钮，占据独立横向区域。
- 模式状态源已经统一为 `PanmapApp.panmapModeStore`，URL 兼容和能力开关可复用。
- 普通/研究切换前后 254 个标签节点、`fnv1a-58331b21` 坐标指纹和 viewBox 完全一致。

## 泛地图进入流程

- 当前 `setPanmapMode(true)` 直接切换 `.is-panmap`，没有独立的视图过渡状态机。
- 当前没有全画布骨架屏；SVG、传统地图小窗和工作台会在同一帧切换。
- 左侧 panel 的出现依赖静态 CSS，没有“骨架 → 推挤 → ready”阶段。
- `ResizeObserver` 在 SVG 尺寸变化后会触发 Stage33 resize；需要在 shell 动画期间显式保护，避免 viewBox 被重新适配。
- SVG 主背景当前为 `#fbfcfb`，未发现仍生效的纯红调试背景；本阶段需要用中性骨架覆盖所有过渡首帧。

## 收起按钮

- `#panmapControlCollapse` 仍存在，并通过 `.controls-collapsed` 把工作台缩到 44px。
- 该状态会让工作台宽度、画布宽度和 Stage33 resize 路径发生额外变化，是本阶段需要移除的半成品入口。

## Favicon

- `<head>` 当前没有 `link[rel~="icon"]`，项目 Logo 只存在于左侧导航内联 SVG。
- 需要复用定位针与等时圈视觉生成 `favicon.svg`，不引入另一套品牌图形。

## 圈层颜色硬编码

- `src/config/ring-tokens.js`：10/20/30 为绿 `#1e9152`、蓝 `#2670e1`、紫 `#8b57be`。
- `styles.css` 图例：另有绿/蓝/紫的独立硬编码。
- `index.html` 时间阈值：10/20/30 为 `#35A866`、`#2878EF`、橙 `#F28C22`，与图例和 Polygon 不一致。
- `app.js` 新阈值 palette 又使用紫、红、青、橙的独立数组。
- `traditional-map-adapter.js` 通过独立插值表达式绘制 Polygon。
- 需要建立一个 palette 模块，并让阈值、图例和 MapLibre paint 都从同一对象派生。

## 地图选点

- `startMapPickMode()` 已能切换 store 与 `.is-map-picking`，但按钮没有 `aria-pressed` 同步。
- MapLibre canvas 目前只切换为 `crosshair`，没有项目定位针光标、底部尖端热点或移动坐标提示。
- 点击后会更新 draft center 和橙色 draft marker，且不会自动 Geocoder；这是可复用基础。
- 搜索、预设、当前位置和地图点击仍经由不同函数更新中心，没有单一 `setCenterSelection()` 入口。
- 旧结果只通过 `successfulResultMatchesDraft()` 间接判断失配，没有明确的 stale 字段、地图视觉降权或提示条。
- 选点完成后探索按钮虽会因参数失配而禁用，但缺少显式 stale 解释和无障碍 live 提示。

## 结论

业务基线一致，允许进入实现。改动必须限制在 UI shell、过渡、palette、map-pick 状态和对应测试/证据；不得改动冻结布局计算或后端业务链路。

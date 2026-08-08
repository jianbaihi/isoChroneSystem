# 第47号普通/研究模式 UI 静态审计

审计日期：2026-08-06

## 实现前差异

| 项目 | 普通模式 | 研究模式 | 风险 |
|---|---|---|---|
| 左侧控制根 | `#panmapControlPanel` 静态控件 | 动态插入 `#stage43ResearchControls` | 控件重复、状态分叉 |
| 面板标题 | 泛地图样式 | 研究布局实验 | 两套页面心智 |
| 研究指标 | 无 | 动态 `#hiddenResearchPanel` | URL 是唯一入口 |
| 模式真源 | 无显式状态 | `research=1` 分散判断 | 无效参数和切换难统一 |
| 普通控件 | 全部可见 | 旧 CSS 整体隐藏 | 研究模式无法复用常用能力 |
| 显式切换 | 不存在 | 不存在 | 用户无法在页面切换 |

## 共用与重复控件

- 共用画布：`.panmap-art`。
- 共用数据结果：`analysisStore.data.lastSuccessfulResult`。
- 共用传统地图、返回可达域和并列显示导航。
- 重复内容：当前数据、布局方案、显示密度、结果统计和布局操作。
- 旧研究模式会隐藏普通控制区，并重新生成一套卡片式控制 DOM。

## 第47号整理结果

- 唯一工作台根：`#panmapControlPanel`。
- 唯一模式真源：`src/state/panmap-mode-state.js`。
- 顶部显式控件：`#panmapModeSwitch`。
- 共用区域：当前数据、布局方案、显示密度、常用样式、应用布局、重置视图、返回和传统地图并列显示。
- 研究增量区域：`#stage43ResearchControls` 与 `#hiddenResearchPanel`，均挂载一次，仅按能力开关显隐。
- 普通模式不显示研究指标、冻结基线、算法细参和实验导出。
- 研究模式保留全部共用控件，并增量显示研究能力。
- 模式切换不调用布局入口、API 客户端或第43号实验运行函数。

## 数据与 API 审计

- 第45号同内容缓存：284 / 254 / 39-85-130 / out-of-range 30。
- Matrix 指纹：`c4a00b9309bdd758ad6313c068a3321151e6576079c78fa97cc78db75c67578f`。
- 第43号 252 / 39-83-130 基线保持冻结，在线 254 不满足时实验按钮禁用。
- 第47号模式切换新增 Isochrones、OpenPOIService、Matrix、Geocoder、Directions 上游请求均为 0。

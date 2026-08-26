# POI 卡片 UI 规范

- Hover Card：244px、12px 圆角、轻阴影，80–120ms 延迟显示，显示名称、分类、分钟时间、圈层和点击提示。
- Detail Card：360px、16px 圆角、右下定位、最大高度 60vh，显示完整 ViewModel；可选字段为空时整行隐藏。
- 动效：Hover 120ms，Detail 160ms；仅使用透明度与轻微位移/缩放。
- 层级：卡片避开左侧参数栏，移动端按视口收缩；详情卡内部滚动。
- 状态：hover 与 selected 使用独立的细描边/光晕 MapLibre 图层；默认不选中。
- 实例：DOM 中固定一个 Hover Card 和一个 Detail Card，不按 POI 创建节点。


# Stage 12.5 基线

- 基线提交：`056c63bb8e8cb52acc1cf3c7ce99dd55e2b055bd`
- 基线阶段：Stage 12.4，分钟级可达性已与 Provider 解耦。
- 已有数据边界：`NormalizedPoi`、`MinuteAccessibilityResult`、`PoiDetailViewModel`。
- 已有地图能力：单一 GeoJSON POI source，普通、hover、selected 三个图层。
- 基线缺口：地图 POI 没有悬浮预览卡和点击详情卡，也没有独立的 POI 交互状态模型。


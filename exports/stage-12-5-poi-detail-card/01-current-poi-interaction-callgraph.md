# 当前 POI 交互调用链

```text
MapLibre POI mouseenter/mousemove
  -> TraditionalMapAdapter.onPoiHover(poiId, pointer)
  -> poiInteractionState.hover(poiId)
  -> buildPoiDetailViewModel(poiId)
  -> 单实例 #poiHoverCard 更新文本与位置
  -> setFilter(traditional-poi-hover-layer)

MapLibre POI click
  -> TraditionalMapAdapter.onPoiClick(poiId)
  -> poiInteractionState.select(poiId)
  -> buildPoiDetailViewModel(poiId)
  -> 单实例 #poiDetailCard 原位更新
  -> setFilter(traditional-poi-selected-layer)

关闭按钮 / Escape
  -> poiInteractionState.close()
  -> 隐藏详情卡并清空 selected 过滤器
```

Hover/selected 只更新 MapLibre filter，不执行 `setData`，因此不会重建 600 个 POI。


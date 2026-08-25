# ORS 迁移第 3 阶段：契约补充

## 1. 兼容范围

本补充建立在 `schemaVersion: "1.0"` 上，不升级协议版本。第 2 阶段字段继续有效；第 3 阶段只增加提供者无关的等时圈几何和分项来源元数据。

浏览器只接收内部 `AnalysisResult`，不接收 ORS `Feature`、`group_index`、`value`、`center` 或原始错误正文。

## 2. `CumulativeIsochrone`

`AnalysisResult.cumulativeIsochrones` 按 `rangeMinutes` 升序返回：

```json
{
  "isochroneId": "isochrone-10",
  "rangeMinutes": 10,
  "rangeSeconds": 600,
  "geometry": {
    "type": "Polygon",
    "coordinates": []
  }
}
```

- `isochroneId` 在单次结果内稳定且唯一。
- `rangeSeconds` 必须等于 `rangeMinutes * 60`。
- `geometry` 只允许有效 GeoJSON `Polygon` 或 `MultiPolygon`。
- 后端必须验证 feature 数量、阈值字段、重复阈值和未知阈值；缺失或不匹配均失败。
- ORS 特有字段不会进入内部模型。

`mock` 模式继续返回空的累计等时圈数组；`ors` 模式返回经过 Adapter 和几何服务转换的内部模型。

## 3. `Ring.geometry`

`ors` 模式的 `rings` 是后端根据累计等时圈生成的互斥环带：

```text
R0 = I10
R1 = I20 - I10
R2 = I30 - I20
```

差集在后端内存几何服务完成，只输出有效 `Polygon` 或 `MultiPolygon`。累计等时圈本身保持累计语义，不被差集覆盖。`mock` 模式的 `Ring.geometry` 仍为 `null`。

本阶段不按几何重新归属模拟 POI；POI 继续使用稳定 fixture 的 `ringId`，并通过 warning 说明其圈层归属未经过真实路网通行时间验证。

## 4. 混合来源元数据

保留兼容字段 `metadata.source`，并增加：

```json
{
  "source": "mixed",
  "sources": {
    "isochrones": "ors",
    "pois": "mock"
  },
  "warnings": [
    "等时圈几何来自真实 ORS。",
    "POI 数据仍为开发用模拟数据。",
    "POI 圈层归属尚未通过真实路网通行时间验证。"
  ]
}
```

| 模式与选项 | `metadata.source` | `sources.isochrones` | `sources.pois` |
|---|---|---|---|
| `mock` + `includePois=true` | `mock` | `mock` | `mock` |
| `mock` + `includePois=false` | `mock` | `mock` | `none` |
| `ors` + `includePois=true` | `mixed` | `ors` | `mock` |
| `ors` + `includePois=false` | `ors` | `ors` | `none` |

无论 provider，`Poi.travelTimeSeconds` 和 `Poi.importanceScore` 没有真实来源时都保持 `null`。

## 5. ORS 错误契约

所有错误继续使用 `{ "error": { ... } }` 包装，并通过 `X-Request-ID` 和 `error.requestId` 追踪：

| HTTP | `error.code` | 场景 |
|---:|---|---|
| 503 | `PROVIDER_NOT_CONFIGURED` | `ors` 模式缺少服务端 Key |
| 504 | `UPSTREAM_TIMEOUT` | ORS 请求超时 |
| 502 | `UPSTREAM_AUTH_ERROR` | ORS 返回 401/403 |
| 429 | `UPSTREAM_RATE_LIMITED` | ORS 返回 429，可安全转发合法 `Retry-After` |
| 422 | `UPSTREAM_REQUEST_REJECTED` | ORS 返回 400/422 |
| 503 | `UPSTREAM_UNAVAILABLE` | ORS 连接失败或返回 5xx |
| 502 | `UPSTREAM_INVALID_RESPONSE` | 非 JSON、非 FeatureCollection、阈值不匹配或几何无效 |

错误消息、日志和响应体不包含原始 ORS 正文、Authorization、API Key 或堆栈。


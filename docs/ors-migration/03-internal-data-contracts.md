# ORS 迁移第 2 阶段：内部数据契约

## 1. 契约范围

本契约版本为 `1.0`，服务于第 2 阶段的模拟 Analysis API。前端只消费本契约，不消费 ORS、POI 或 Matrix 提供者的原始字段。后续真实提供者响应必须在后端 Adapter 中转换后才能进入本契约。

通用规则：

- JSON 字段使用 `camelCase`。
- ID 是稳定字符串，不使用中文显示标签作为唯一 ID。
- 内部坐标系固定为 WGS84 / `EPSG:4326`，坐标顺序固定为 `[longitude, latitude]` 语义。
- 经度范围为 `[-180, 180]`，纬度范围为 `[-90, 90]`。
- 用户阈值是整数分钟；POI 精确通行时间是整数秒；时间戳是 UTC ISO 8601。
- `rangesMinutes` 至少 1 项、最多 10 项，必须为升序、去重的正整数数组。
- `color`、`opacity`、`radius`、`selected` 等视觉状态不进入后端领域模型。
- 第 2 阶段允许 `geometry: null` 和 `travelTimeSeconds: null`，因为没有真实等时圈和路网计算。

## 2. `AnalysisRequest`

| 字段 | 类型 | 必填 | 空值语义 |
|---|---|---:|---|
| `schemaVersion` | string | 是 | 只接受 `"1.0"` |
| `center` | `Center` | 是 | 不允许为空 |
| `profile` | string | 是 | 只接受 `foot-walking`、`cycling-regular`、`driving-car` |
| `rangesMinutes` | integer[] | 是 | 1 至 10 项，严格升序、无重复 |
| `categoryIds` | string[] | 是 | 空数组表示模拟数据中的全部一级类别；请求侧去重 |
| `options.includePois` | boolean | 是 | 默认 `true` |
| `options.calculateTravelTimes` | boolean | 是 | 默认 `false`；传 `true` 返回 `FEATURE_NOT_AVAILABLE` |

```json
{
  "schemaVersion": "1.0",
  "center": {
    "lon": 116.4815,
    "lat": 39.9906,
    "crs": "EPSG:4326",
    "label": "望京广场"
  },
  "profile": "foot-walking",
  "rangesMinutes": [10, 20, 30],
  "categoryIds": ["food", "shopping", "leisure"],
  "options": {
    "includePois": true,
    "calculateTravelTimes": false
  }
}
```

`Center` 的 `lon`、`lat` 必须为有限数字，`crs` 固定为 `EPSG:4326`；`label` 是可选显示文本，不参与坐标匹配。

## 3. `AnalysisResult`

| 字段 | 类型 | 必填 | 空值语义 |
|---|---|---:|---|
| `schemaVersion` | string | 是 | `"1.0"` |
| `analysisId` | string | 是 | 单次分析结果稳定 ID |
| `status` | string | 是 | 第 2 阶段成功值为 `completed` |
| `center` | `Center` | 是 | 原样规范化请求中心点 |
| `profile` | string | 是 | 原样规范化请求 profile |
| `rangesMinutes` | integer[] | 是 | 原样规范化请求阈值 |
| `cumulativeIsochrones` | array | 是 | 第 2 阶段固定为空数组 |
| `rings` | `Ring[]` | 是 | 由阈值生成的互斥元数据圈层 |
| `pois` | `Poi[]` | 是 | 模拟 fixture；`includePois=false` 时为空数组 |
| `categories` | `Category[]` | 是 | 内部一级类别列表 |
| `metadata` | object | 是 | `source` 固定为 `mock`，含生成时间、请求 ID、警告 |

## 4. 子模型

### `Ring`

```json
{
  "ringId": "ring-0-10",
  "innerRangeMinutes": 0,
  "outerRangeMinutes": 10,
  "geometry": null,
  "statistics": { "poiCount": 42 }
}
```

第一圈的 `innerRangeMinutes` 为 `0`，后续圈层的内边界等于上一圈外边界。`ringId` 在结果内唯一，推荐格式为 `ring-{inner}-{outer}`。当前 `geometry` 固定为空，表示尚未计算真实等时圈多边形。

### `Category`

```json
{
  "categoryId": "food",
  "parentCategoryId": null,
  "label": "餐饮美食",
  "level": 1
}
```

`categoryId` 与未来提供者 ID 解耦；`label` 仅用于显示。一级类别的 `parentCategoryId` 为 `null`、`level` 为 `1`。

### `Poi`

```json
{
  "poiId": "mock-poi-001",
  "name": "餐饮美食·火锅示例 1",
  "location": {
    "lon": 116.4821,
    "lat": 39.9912,
    "crs": "EPSG:4326"
  },
  "categoryId": "food",
  "travelTimeSeconds": null,
  "ringId": "ring-0-10",
  "importanceScore": null
}
```

单次结果内 `poiId` 唯一。第 2 阶段允许稳定的 `mock-*` ID；`travelTimeSeconds` 固定为空，不伪造路网时间；`importanceScore` 没有真实来源时为空。

## 5. 错误契约

所有业务和校验错误统一包装为：

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "请求字段校验失败。",
    "details": [
      { "field": "rangesMinutes", "reason": "value_error" }
    ],
    "requestId": "request-uuid"
  }
}
```

| HTTP 状态 | `code` | 用途 |
|---:|---|---|
| 400 | `INVALID_REQUEST` | JSON 无法解析或请求语义无效 |
| 422 | `VALIDATION_ERROR` | 坐标、profile、阈值等字段校验失败 |
| 501 | `FEATURE_NOT_AVAILABLE` | `calculateTravelTimes=true` 等本阶段未实现能力 |
| 500 | `INTERNAL_ERROR` | 未预期错误；不返回堆栈、密钥或提供者响应 |

## 6. 第 2 阶段来源边界

当前 `AnalysisResult.metadata.source` 固定为 `mock`，POI 是开发 fixture，目的是验证 UI 参数、API、Store、Adapter 和泛地图布局之间的可替换数据闭环，不代表真实地点检索结果。第 2 阶段没有请求 ORS、POI、Matrix，也没有生成空间几何。

未来真实 ORS 响应只能在后端 `server/app/adapters/ors.py` 中被转换为本契约；浏览器端、`AnalysisStore`、`Analysis Client` 和 `Panmap Adapter` 不得读取 ORS Key、调用提供者 URL 或依赖提供者原始字段。

第 3 阶段在 `schemaVersion: "1.0"` 上增加的 `CumulativeIsochrone`、几何 `Ring.geometry`、混合来源 `metadata.sources` 和 ORS 错误映射见 `05-stage-3-contract-addendum.md`；本文件第 2 阶段历史内容保持不变。

# 第54号报告：骑行发布POI精确时间字段归一化

## 状态

`completed`

第53号只修正第51号历史真实骑行缓存的发布数据契约与读取路径。没有重新请求Isochrones、OpenPOIService、Matrix、Geocoder或Directions；没有进入驾车、巴黎、类别聚类、评分映射或布局算法改动。

## 冻结结果

- Analysis ID保持：`analysis-stage51-cycling-38ef5a3bdd60c562354e88fd`。
- profile保持：`cycling-regular`；阈值10/20/30分钟。
- Matrix指纹保持：`f41b23c25e23a997c03b0050451a8976303683d15342842129d8f47e80d0d203`。
- total / eligible / out-of-range保持：2413 / 1800 / 613。
- 互斥Matrix圈层保持：127 / 433 / 1240。
- 第51号数据是2026-08-01已验收真实上游结果的缓存复用；第53号没有取得新的实时数据。

## 数据契约校正

- 新发布内存结构为`publishedResultSchemaVersion: 2.0`；外部`schemaVersion: 1.0`保持兼容。
- 2413个POI均按唯一`poiId`与2413条Matrix记录join；重复、缺失、多余记录会失败关闭。
- 2413个`matrixStatus=ok` POI的顶层`travelTimeSeconds`和`networkDistanceMeters`均非null。
- POI顶层还携带`matrixBandId`、`spatialBandId`、`bandAssignmentMethod`、`reachable`、路由元数据、snap距离和Matrix批次。
- 顶层`ringId`只由精确时间决定，且2413/2413满足`ringId === matrixBandId`；空间圈层仅保留审计。
- 通用null/invalid规则已实现：分别进入`matrix-null`和`matrix-invalid`，不会被分入空间圈层或删除。

## 发布、恢复与读取

- 后端唯一发布join：`server/app/services/published_result_normalization.py`。骑行缓存重放与通用Matrix完成发布均调用它。
- 前端旧归档、session缓存和网络响应在`analysis-contracts`边界迁移；历史v1文件未覆盖。
- 普通模式、研究模式、标签布局、传统地图GeoJSON与详情文本直接读POI顶层字段；`accessibility[]`只保留审计/导出。
- 骑行→步行→骑行本地恢复已验证；两个profile保持独立Analysis ID与缓存。

## 浏览器验收

- 当前页：黄鹤楼、骑行、10/20/30分钟、普通模式；控制台error/warning均为0。
- 普通/研究模式连续切换20次完成，未发起业务上游请求。
- 页面当前显示密度的已渲染标签节点为720；这是冻结的现有显示密度选择，Stage53未修改布局算法、标签坐标或显示密度。数据层仍保留1800个eligible POI。
- 20个eligible和5个out-of-range的字段样本见`poi-matrix-normalization-summary.json`；对应检查验证时间、距离、状态和Matrix圈层。

## 零上游账本

Isochrones=0；OpenPOIService=0；Matrix=0；Geocoder=0；Directions=0。

## 测试

- Python：95 passed，0 failed。
- JavaScript：114 passed，0 failed。
- 语法检查、Python编译检查、`git diff --check`：通过。

## 交付

结构化JSON、v2明确归档、四张真实PNG与SHA-256均位于`exports/stage-10-cycling-normalization/`。其中`stage53-browser-console-audit.png`是浏览器开发日志的只读字段审计导出，样本来自归一化后的本地v2结果，不是上游响应。

## 停止状态

前端和后端保持运行；浏览器停在黄鹤楼骑行普通模式。本阶段已停止，未自动进入驾车或后续任务。

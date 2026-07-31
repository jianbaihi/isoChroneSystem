# 第 5 阶段补充执行文档：ORS 配额观测与黄鹤楼步行名称标签云

状态：待执行

执行基线：

- `docs/ors-migration/15-stage-5-ors-interactive-ui-execution.md` 已执行；
- `docs/ors-migration/16-stage-5-ors-interactive-ui-report.md` 是本次唯一直接实施基线；
- 第 16 号报告已经证明真实 ORS 等时圈能够进入后端、Store、MapLibre 和页面；
- 黄鹤楼 `foot-walking` 10/20/30 分钟已经返回 3 个真实 Polygon；
- 1000 m ORS POI preview 已返回并在传统地图显示 136 个点；
- 该次 preview 没有得到可用的 taxonomy category 记录，泛地图尚未生成真实 POI 节点；
- 武汉 30 分钟驾车 POI 完整覆盖仍为 94 cell 对 40 budget 的独立未执行任务。

本文执行完成后新增：

```text
docs/ors-migration/17-stage-5-ors-quota-walking-name-cloud-execution.md
docs/ors-migration/18-stage-5-ors-quota-walking-name-cloud-report.md
```

完成第 18 号报告后强制停止。本文是第 5 阶段补充验证，不自动进入正式第 6 阶段。

## 0. 给 Codex 的直接指令

继续当前项目，在不推翻第 16 号报告已完成能力的前提下，完成两个相互配合的最小闭环。

### 闭环 A：API 配额观测

```text
后端调用 ORS / Geocoder / OpenPOIService
→ 读取上游响应中的非敏感 rate-limit 响应头
→ 按服务保存“最近一次观测值”
→ 通过安全、最小契约返回前端
→ 顶栏紧凑入口显示
→ 展开面板查看剩余量、重置时间、观测时间和新鲜度
```

### 闭环 B：不按类别的步行名称标签云

```text
武汉·黄鹤楼
+ foot-walking
+ 10/20/30 分钟
→ 真实 ORS 累计等时圈
→ 使用最外层 30 分钟 Polygon 主动查询一次 ORS POI
→ 提取有意义的 POI 名称
→ 去重
→ 分配到 0–10 / 10–20 / 20–30 分钟互斥圈层
→ 不按类别直接摆放名称标签
→ 生成三圈嵌套的泛地图名称云
→ 与传统地图同一批 POI 做 hover / click 联动
```

本次目标是验证“真实 POI 名称能否直接形成时间圈层标签云”，不是解决最终分类体系、权重模型或正式实验数据问题。

本次必须：

- 使用真实 ORS Isochrones 与真实 ORS/OpenPOIService；
- 保留现有 API Key 只在后端加载的边界；
- 配额数据只来自真实响应头，不自行估算；
- 不为了查询配额额外发送探测请求；
- 名称云不依赖 taxonomy category；
- 明确显示原始 POI、具名 POI、去重 POI、各圈 POI、已摆放标签和未摆放标签数量；
- 对相同参数复跑使用缓存并证明零上游请求；
- 使用单一 MapLibre 实例；
- 保留现有中心搜索、当前位置、地图选点、交通方式和阈值能力。

本次不得：

- 把 Standard Plan 的公开上限硬编码成当前账户实时剩余额度；
- 在前端暴露 API Key、Authorization、原始上游响应头或完整错误 body；
- 每隔固定时间轮询上游获取配额；
- 自动执行 94-cell 驾车 POI 任务；
- 因 taxonomy 为空而伪造类别；
- 用 POI 类别、评分、评论数、热度或随机值决定标签重要性；
- 调用 Matrix 或 Directions 计算每个 POI 的精确通行时间；
- 下载或导入 Overture；
- 开始巴黎名称云、全国数据、本地 ORS、瓦片替换、部署或正式第 6 阶段。

可以修改与本任务直接相关的前端、后端、Store、Adapter、布局、测试、非敏感配置示例和文档。不得提交、推送或创建 PR；不得读取、打印或报告 API Key。

## 1. 对第 16 号报告的判定

### 1.1 已完成且不得无理由重做

| 能力 | 第 16 号结论 | 本次处理 |
|---|---|---|
| 黄鹤楼真实驾车等时圈 | 页面四方证据已通过 | 只做回归 |
| 黄鹤楼真实步行等时圈 | 3 个真实 Polygon | 直接作为名称云几何输入 |
| 黄鹤楼真实骑行等时圈 | 3 个真实 Polygon | 只做回归 |
| 固定中心、搜索、地图选点 | 已完成真实验证 | 保留 |
| 浏览器当前位置 | 已实现，live 权限场景未完整验证 | 本次不扩展 |
| 1000 m POI preview | 136 个点进入传统地图 | 先复用其缓存做响应结构审计 |
| taxonomy category | 可用记录为 0 | 本次不再作为名称云前置条件 |
| 单一 MapLibre | 已确认 1 个实例和 1 个 canvas | 必须继续保持 |
| 30 分钟驾车完整 POI | 94/40，未执行 | 本次继续不执行 |

### 1.2 当前真正缺口

第 16 号报告已经证明 POI 点可以显示在传统地图，但泛地图仍把“有分类记录”当成生成节点的必要条件。当前应先解除这一耦合：

```text
POI 有可用名称
→ 即可进入“未分类名称云模式”

POI 有 taxonomy
→ 将来才进入“分类聚合与下钻模式”
```

两种模式必须分开，不能让 taxonomy 缺失继续阻塞名称标签摆放实验。

## 2. 冻结的真实验收场景

| 参数 | 冻结值 |
|---|---|
| 中心 | 武汉·黄鹤楼 |
| 坐标 | `[114.296944, 30.546944]` |
| 坐标顺序 | `[longitude, latitude]` |
| ORS profile | `foot-walking` |
| 时间阈值 | `[600, 1200, 1800]` 秒 |
| 页面显示 | 10 / 20 / 30 分钟 |
| POI 查询范围 | 真实 30 分钟最外层 Polygon |
| POI 查询触发 | 用户主动点击“生成名称标签云” |
| 名称云模式 | 不按类别、仅按时间圈层 |

必须先确认当前成功结果与上述参数完全一致。若页面当前是驾车、骑行、其他中心或其他阈值，名称云按钮应提示先生成对应步行等时圈，不得把旧 POI 贴到新参数上。

## 3. API 配额观测设计

### 3.1 UI 位置

在页面顶栏或全局状态栏右侧增加一个低干扰入口：

```text
[ API 余量 ● ]
```

不得在泛地图主画布中央放置大卡片，不得遮挡中心、圈层或标签。

点击或悬停后展开紧凑面板：

| 服务 | 每日剩余 | 重置 | 最近观测 | 状态 |
|---|---:|---|---|---|
| 等时圈 | `remaining` 或“未知” | 时间或“未知” | 时间 | 实时观测 / 上次观测 |
| 地点搜索 | `remaining` 或“未知” | 时间或“未知” | 时间 | 实时观测 / 上次观测 |
| POI | `remaining` 或“未知” | 时间或“未知” | 时间 | 实时观测 / 上次观测 |

要求：

- 默认折叠；
- 桌面端位于顶栏右侧，移动端可进入已有状态/诊断抽屉；
- 不改变地图和泛地图的主要视觉层级；
- 明确写“每日配额最近观测值”，不要简写成容易误解的永久余额；
- 若上游没有返回响应头，显示“未知”，不得填公开套餐默认值；
- 若请求由缓存服务，显示“缓存命中，未消耗上游请求”；
- 若只保留了旧观测值，显示其观测时间，不得显示成刚刚刷新；
- `403` 与每日额度耗尽相关时给出清楚提示；
- `429` 与分钟滑动窗口相关时显示有限等待提示，不能把它误写成每日额度为 0。

### 3.2 后端白名单契约

后端只能从响应头白名单提取：

```text
x-ratelimit-limit
x-ratelimit-remaining
x-ratelimit-reset
retry-after（仅发生限流错误时）
date（仅用于安全解析 reset）
```

字段名大小写不敏感。除上述白名单外，不得把其他上游响应头转发给前端。

建议统一成以下语义；字段名可适应现有代码：

```json
{
  "apiQuota": {
    "services": {
      "isochrones": {
        "status": "known",
        "remaining": 487,
        "limit": 500,
        "resetAt": "2026-07-31T06:20:00Z",
        "observedAt": "2026-07-30T06:20:00Z",
        "freshness": "live",
        "requestSource": "upstream"
      },
      "geocoder": {
        "status": "unknown",
        "remaining": null,
        "limit": null,
        "resetAt": null,
        "observedAt": null,
        "freshness": "unknown",
        "requestSource": "none"
      },
      "pois": {
        "status": "known",
        "remaining": 492,
        "limit": 500,
        "resetAt": "2026-07-31T06:25:00Z",
        "observedAt": "2026-07-30T06:25:00Z",
        "freshness": "last-observed",
        "requestSource": "cache"
      }
    }
  }
}
```

上面数值只是契约示例，严禁作为实现默认值或截图伪造值。

### 3.3 观测状态规则

1. 每个服务独立记录，不把 Isochrones 余额复制给 Geocoder 或 POI。
2. 只有真实上游响应才能更新该服务的观测值。
3. 缓存命中不扣减、不预测、不伪造新值。
4. 进程启动且尚无上游响应时为 `unknown`。
5. 若 `x-ratelimit-limit` 缺失，可以只显示 `remaining`，不得自行补套餐上限。
6. `x-ratelimit-reset` 只在可可靠解析时转换为 ISO 时间；解析失败则为 `null` 并记录非敏感诊断。
7. 不在 Git 中持久化账户使用量；优先使用进程内最近观测状态。
8. 不创建“查询余额”上游请求。配额只随正常业务请求被动更新。
9. 相同分析命中本地缓存时，前端应同时看到：
   - 分析结果来自缓存；
   - 本次没有消耗上游请求；
   - 配额值是上次观测，不是本次刷新。
10. 任何 quota 解析错误都不能阻塞正常等时圈、搜索或 POI 响应。

### 3.4 安全与可见性

- Key 仍只在后端环境变量或既有安全配置中；
- quota 契约不包含 Key、token、请求 URL 中的认证参数、账户 ID、套餐名称或完整 headers；
- 前端不能直接请求 HeiGIT dashboard；
- 若项目已有开发/研究模式开关，可让 quota 入口在开发和论文实验环境开启、公开生产环境默认关闭；
- 若没有开关，本次可先默认显示，但结构必须支持后续通过非敏感配置关闭；
- 页面不得把公开套餐表当成账户真实状态。

## 4. 步行 30 分钟圈 POI 获取

### 4.1 先使用真实等时圈

必须复用上一次成功的真实 ORS 结果：

```text
center = [114.296944, 30.546944]
profile = foot-walking
ranges = [600, 1200, 1800]
featureCount = 3
provider = ors-public-api
```

不得用圆、缓冲区、bbox、fixture、截图轮廓或驾车等时圈代替步行 Polygon。

### 4.2 面积安全检查

在发送 POI Polygon 请求前：

1. 找到 `range=1800` 的最外层真实 Polygon；
2. 验证几何合法且非空；
3. 使用适合 WGS84 的测地面积或可靠投影计算面积；
4. 在 metadata 和报告中记录非敏感面积；
5. 使用 `45 km²` 作为本任务安全阈值，低于公共接口 `50 km²` 上限。

若面积大于 `45 km²`：

- 不自动切网格；
- 不缩小成 2000 m Point buffer 冒充完整步行圈；
- 不静默裁剪；
- 停止 POI 名称云 live 请求并在第 18 号报告中说明；
- 等待用户决定是否另开分块任务。

### 4.3 单次主动请求

面积检查通过后，用户点击“生成名称标签云”才执行一次 POI Polygon 请求。

要求：

- 主验收 happy path 最多 1 个 POI 上游请求；
- 不自动递归、扩大范围或重试认证错误；
- 429 遵循有限等待，不产生请求风暴；
- 使用当前公共服务实际支持的最大合法 `limit`；若当前 OpenAPI/Adapter 已确认支持 `2000`，可使用 `2000`；
- 若返回数量达到请求上限，必须标记 `resultTruncated=true`；
- 即使空间 Polygon 完整覆盖，只能声明“查询范围已覆盖”，不能声明 OSM/ORS 数据源包含现实世界全部 POI；
- 相同 Polygon 与参数再次生成必须命中缓存，POI 上游请求数为 0。

建议 metadata：

```json
{
  "poiCoverage": {
    "mode": "isochrone-outer-polygon",
    "rangeSeconds": 1800,
    "areaKm2": 12.34,
    "spatiallyCovered": true,
    "datasetCompleteness": "unknown",
    "resultLimit": 2000,
    "resultTruncated": false,
    "requests": 1,
    "cacheHit": false
  }
}
```

上面面积和数量只是契约示例，不得伪造。

## 5. POI 名称提取与统一数据

### 5.1 先审计已有真实响应

开始新 live 请求前，优先检查第 16 号任务保存的 136 点缓存或已经归一化的非敏感 POI 对象：

- 只统计 properties 的字段存在率；
- 找出真实名称实际位于哪些字段；
- 不把大段原始 POI body 写入报告；
- 不在报告中逐条列出全部地点；
- 不因为 taxonomy 为空就判定名称为空。

### 5.2 名称优先级

根据实际响应结构实现显式适配器。武汉场景建议优先级：

```text
name:zh
→ name
→ name:en
→ 已确认等价的 properties.name
```

实际字段可能位于 `properties.osm_tags` 或现有 Adapter 的归一化对象中，以 live schema 为准。

要求：

- Unicode 规范化；
- 去除首尾空白；
- 折叠连续空白；
- 保留中文、英文、数字与合法标点；
- 拒绝空字符串、仅 URL、仅电话号码、仅内部 ID；
- 不使用 category、osm_id、brand 类型名或“未命名 POI”作为伪名称；
- 没有可用名称的 POI 进入 `unnamedCount`，不生成标签。

若有 `brand`、`operator` 等字段，只能在明确确认为地点展示名称且项目已有规则时使用；不得为提高具名率擅自混入。

### 5.3 统一对象

名称云最小对象至少包含：

```json
{
  "source": "ors-openpoiservice",
  "sourceId": "稳定的上游对象 ID",
  "label": "黄鹤楼公园",
  "longitude": 114.30,
  "latitude": 30.54,
  "travelBand": "0-10",
  "rangeUpperSeconds": 600,
  "categoryPath": [],
  "importance": null
}
```

要求：

- `categoryPath=[]` 是合法状态；
- `importance=null`，不得生成虚构分值；
- 所有标签保留可回到传统地图点的稳定 ID；
- 原始完整 properties 不进入前端主状态，只有调试所需的安全最小字段。

### 5.4 去重

依次使用：

1. 相同 `source + sourceId`；
2. 若上游重复 ID 不可靠，再使用“规范化名称 + 极近坐标”的保守规则；
3. 同名但相距明显不同的 POI 必须保留，不能只按名称全局去重。

报告必须分别给出：

```text
rawPoiCount
parsedPoiCount
namedPoiCount
unnamedPoiCount
deduplicatedPoiCount
```

## 6. 10/20/30 分钟互斥圈层归属

使用真实累计 Polygon：

```text
P10 = 10 分钟累计面
P20 = 20 分钟累计面
P30 = 30 分钟累计面
```

每个 POI 按最早可达圈层归属：

```text
若点被 P10 covers → 0–10 分钟
否则若点被 P20 covers → 10–20 分钟
否则若点被 P30 covers → 20–30 分钟
否则 → outside
```

要求：

- 使用 `covers` 或等价边界包含语义，边界点归入更早圈层；
- 支持 Polygon；现有场景若出现 MultiPolygon，也要安全处理或明确停止，不能只取第一个部件；
- 不根据与中心的直线距离猜测通行时间；
- 不调用 Matrix；
- 不把 10 分钟内 POI 重复放进 20 和 30 分钟圈；
- 三个 band 的 POI ID 集合必须两两不相交；
- 三圈合计加 `outsideCount` 应与去重具名 POI 数守恒；
- `outside` 不进入名称云，但必须计数；
- 若等时圈嵌套存在几何异常，停止生成并报告，不擅自修圆。

## 7. 不按类别的泛地图名称云

### 7.1 新模式

增加独立模式：

```text
panmapMode = "unclassified-poi-name-cloud"
```

它与未来的：

```text
panmapMode = "category-hierarchy"
```

必须分离。

本模式：

- 不生成类别节点；
- 不显示分类树；
- 不允许类别下钻；
- 直接把真实 POI `label` 作为可视对象；
- 只用颜色和所在区域表达时间圈层；
- 页面图例明确写“颜色表示步行可达时间，不表示 POI 类别”。

### 7.2 视觉结构

至少包含：

- 中心标签“黄鹤楼”；
- 0–10 分钟内圈；
- 10–20 分钟中圈；
- 20–30 分钟外圈；
- 三圈清晰嵌套，不交叉；
- 每圈使用可区分但协调的颜色；
- 时间边界标签；
- 数据源和“未分类名称云”状态；
- `已显示标签数 / 具名 POI 数`。

不得：

- 把标签按类别着色；
- 使用随机颜色；
- 在没有权重时用字号暗示重要性；
- 把未显示标签静默丢弃；
- 把 POI 原始地理坐标直接当作泛地图标签坐标。

### 7.3 字号语义

当前没有统一评分字段，因此：

- 普通 POI 标签默认使用同一字号；
- 只允许为超长名称在明确下限内做技术性缩小，例如从 14 px 降到不低于 12 px；
- 这种缩小只用于适配，不表示重要性；
- 中心标签可单独放大；
- 不使用随机字号；
- 不用名称长度、距中心远近或上游返回顺序冒充重要性。

图例或辅助说明中应明确：

```text
本版标签字号不表示 POI 重要性。
```

### 7.4 摆放算法

优先复用项目现有 `panmap-layout.js`、候选点、碰撞检测和圈层边界逻辑，增加“直接 POI 标签输入”路径，不另建第二套完全无关的渲染器。

最低要求：

1. Canvas/SVG 实际字体测量后得到标签包围盒；
2. 标签保持水平，不旋转；
3. 每个时间 band 内生成确定性的均匀候选点；
4. 可使用黄金角、均匀螺旋或项目现有均匀候选点，但不得每次随机变化；
5. 较大包围盒可先放置，以减少后期碎片；
6. 排序的最终 tie-breaker 使用稳定 ID；
7. 标签包围盒加最小间距；
8. 已放标签之间不得重叠；
9. 标签不得跨出所属时间 band；
10. 内外圈不得交叉；
11. 相同输入、画布尺寸和字体必须得到相同布局；
12. 尝试放置全部具名 POI；
13. 无法合法放置时记录到 `unplaced`，不得强行重叠。

若项目已有“标签摆放后生成包络线”的能力，应复用；若当前只有固定三圈框架，本次可以先保留现有圈层框架，不新增 KDE、虚拟点或复杂包络线研究。第 18 号报告必须说明实际采用了哪一种，不得把固定框架描述成数据驱动包络线。

### 7.5 高密度降级

当全部标签无法放下：

- 优先保留无重叠和圈层边界；
- 不把字号缩小到不可读；
- 不裁掉文字；
- 页面显示每圈 `placed / available`；
- 提供“仍有 N 个名称未显示”的明确摘要；
- 若现有泛地图支持缩放，可在更大虚拟画布上重新布局；
- 本次不要求无限下钻，不用类别替代未放下名称。

任何采样或上限都必须是显式、确定性和可统计的。

## 8. 传统地图与泛地图联动

传统地图与名称云必须复用同一批归一化 POI：

- hover 名称标签时，高亮传统地图对应点；
- hover 传统地图点时，高亮名称云对应标签；
- click 任一侧时设置同一个 selected POI；
- 选中状态切换视图后保留；
- 未摆放的 POI 仍可在传统地图出现；
- 联动只改变本地 Store 和样式，不产生任何 ORS、Geocoder 或 POI 请求；
- 不创建第二个 MapLibre 实例；
- 进入泛地图不重新请求等时圈或 POI；
- 返回传统地图不重新请求。

若分屏空间不足，可先实现 hover/click 的最小可见高亮，不在本次新增复杂详情面板。

## 9. 页面状态与触发

在现有操作区增加或重命名一个明确按钮：

```text
[生成步行名称云]
```

启用条件：

- 当前成功中心为黄鹤楼预设或同坐标合法 Center；
- `profile=foot-walking`；
- ranges 精确包含 10/20/30；
- 三个真实等时圈均存在；
- Provider 不是 Mock；
- 当前 draft 与成功参数一致。

点击后的状态顺序：

```text
检查最外圈面积
→ 查询或命中缓存
→ 解析 POI
→ 提取名称
→ 去重
→ 圈层归属
→ 标签布局
→ 原子更新传统地图 POI 与泛地图
```

状态文案至少区分：

- 检查范围；
- 请求 ORS POI；
- POI 缓存命中；
- 正在布局；
- 名称云完成；
- 上游结果为空；
- 有 POI 但没有可用名称；
- 结果达到上游 limit，可能截断；
- 部分标签未放下；
- 请求失败并保留旧结果。

任何一步失败都不得清除已经成功显示的真实等时圈。

## 10. 缓存与请求预算

### 10.1 缓存键

POI 名称云查询缓存至少包含：

```text
provider
outer polygon 的稳定 hash
center
profile
ranges
POI request 参数
名称适配器版本
```

不得包含 API Key。

布局缓存若存在，应额外包含：

```text
归一化 POI 集合 hash
画布尺寸
字体
字号
padding
布局算法版本
```

### 10.2 主验收请求预算

使用新的 live 缓存命名空间完成首次证据：

| 服务 | happy path 最大上游请求 |
|---|---:|
| Isochrones | 1 |
| Geocoder | 1 |
| POI | 1 |
| 合计 | 3 |

说明：

- 若等时圈已有可验证缓存，Isochrones 可以为 0；
- Geocoder 的 1 次请求只来自用户实际搜索“黄鹤楼”，不是余额探测；
- POI 只查询外层步行 Polygon 一次；
- 相同参数第二次执行时 Isochrones 和 POI 上游请求都必须为 0；
- 离线测试不得联网；
- 不调用 94-cell 任务；
- 未经本文允许不得提高主验收预算。

## 11. 分阶段执行

### 阶段 A：只读预检与基线

1. 阅读第 15、16 号文档和本文；
2. 将本文原样保存到仓库第 17 号路径；若已有不同内容则停止并报告冲突；
3. 检查工作树，保护用户已有改动；
4. 核对第 16 号列出的相关源文件、测试和截图是否存在；
5. 复跑后端、前端、Python、JavaScript 和 `git diff --check` 基线；
6. 查明：
   - 上游 HTTP client 当前是否保留 response headers；
   - 三类 API 是否共用统一请求封装；
   - 136 点 preview 的真实名称字段；
   - 当前泛地图为何只接收 category nodes；
   - 现有布局算法能否接收直接标签；
7. 输出简短预检结论后再修改。

基线失败时，只修复与本任务直接相关的问题。

### 阶段 B：配额后端观测

1. 实现 rate-limit 白名单解析；
2. 按 `isochrones / geocoder / pois` 分开保存最近观测；
3. 缓存命中不更新、不扣减；
4. 解析失败不阻塞业务；
5. 添加安全契约；
6. 添加 403、429 与 retry-after 的最小状态；
7. 单元测试全部使用 fixture，不联网；
8. 检查响应、日志和缓存键均不包含 Key。

### 阶段 C：配额 UI

1. 在顶栏右侧加入折叠入口；
2. 实现三服务面板；
3. 支持 known、unknown、live、last-observed、cache；
4. 显示观测时间；
5. 不发送额外请求；
6. 小屏不遮挡地图；
7. quota UI 错误不影响主应用；
8. 添加前端测试和无障碍 label。

### 阶段 D：POI schema 与名称适配

1. 优先使用已有 136 点缓存做非敏感结构统计；
2. 实现明确名称优先级；
3. 归一化名称；
4. 过滤无效名称；
5. 保守去重；
6. 输出计数；
7. 不依赖 category；
8. 添加中文、英文、空名、URL、电话、重复 ID、同名异地测试。

### 阶段 E：步行 Polygon POI 请求

1. 在真实页面生成或命中黄鹤楼步行 10/20/30 等时圈；
2. 核对 3 个真实 Polygon；
3. 计算 30 分钟外圈面积；
4. 面积不超过 45 km² 后才允许继续；
5. 用户主动点击生成；
6. 最多一个 POI 上游请求；
7. 记录 coverage、limit、truncated、cache metadata；
8. 同参数复跑证明 POI 上游请求为 0。

若面积超限、几何非法或上游拒绝 Polygon，请停止 live 名称云，保留等时圈并在报告中给出证据，不要自行改为驾车格网或 2 km buffer。

### 阶段 F：圈层归属与名称云布局

1. 对去重具名 POI 做 10/20/30 最早可达归属；
2. 验证集合互斥与计数守恒；
3. 创建 `unclassified-poi-name-cloud` 模式；
4. 直接向现有布局输入 POI 标签；
5. 生成三圈嵌套布局；
6. 验证包围盒不重叠；
7. 验证标签不越界；
8. 显示 placed/unplaced；
9. 显示字号无重要性语义；
10. 不生成类别树和类别节点。

### 阶段 G：地图联动

1. 传统地图显示同一 POI 集合；
2. 标签 hover 对应地图点；
3. 地图点 hover 对应标签；
4. click 共用 selected POI；
5. 切换视图保持状态；
6. 联动请求数保持 0；
7. MapLibre canvas 数保持 1。

### 阶段 H：真实浏览器验收

按顺序执行：

1. 打开应用，确认默认中心为武汉·黄鹤楼；
2. 选择步行；
3. 选择 10/20/30；
4. 生成真实等时圈；
5. 核对后端、Store、MapLibre source 和屏幕的 3 个 Polygon；
6. 展开 API 余量面板；
7. 实际搜索一次“黄鹤楼”，选择结果或返回固定预设；
8. 确认 Geocoder quota 为真实观测或明确 unknown；
9. 返回冻结参数；
10. 点击“生成步行名称云”；
11. 确认外圈面积安全；
12. 确认 POI 上游请求不超过 1；
13. 确认具名 POI 数大于 0；若为 0，停止并如实报告；
14. 确认三圈名称标签可见；
15. 确认没有 category 节点；
16. 确认 placed/unplaced 计数；
17. 验证一个名称标签与地图点双向联动；
18. 再次生成相同名称云；
19. 确认 POI 上游请求为 0；
20. 确认 quota 面板标明缓存未消耗；
21. 检查 console、Network、MapLibre source 和 canvas 数；
22. 检查 Network、页面、截图和日志中没有 Key。

## 12. 自动测试要求

### 12.1 后端

至少覆盖：

- response header 大小写不敏感；
- remaining、limit、reset 合法解析；
- 缺失或畸形 header 返回 unknown/null；
- 每个服务状态互不覆盖；
- cache hit 不扣减、不伪造 observedAt；
- quota 解析失败不阻塞业务响应；
- 403 与 429 状态区分；
- 只转译白名单字段；
- Key、Authorization、完整 headers 不进入响应、日志和缓存键；
- 30 分钟外圈选择正确；
- 测地面积与 45 km² 闸门；
- 面积超限不调用 POI；
- happy path 最多一个 POI 请求；
- result limit 命中时标记 truncated；
- 名称字段优先级；
- Unicode 与空白规范化；
- 空名、URL、电话和内部 ID 过滤；
- source ID 去重；
- 同名异地保留；
- 边界点归入更早圈层；
- 三个 band 互斥；
- 计数守恒；
- outside 计数；
- taxonomy 为空仍能生成具名 POI 对象。

### 12.2 前端

至少覆盖：

- quota 面板默认折叠；
- known / unknown / live / last-observed / cache；
- cache hit 显示“未消耗上游请求”；
- quota UI 不触发网络请求；
- quota 契约错误不影响等时圈；
- 名称云按钮启用条件；
- 参数不匹配时禁用；
- taxonomy 为空时进入未分类名称云；
- 三圈输入；
- 同输入布局确定性；
- 已摆放包围盒不重叠；
- 标签不越过所属 band；
- placed/unplaced 计数；
- 字号不表达重要性；
- hover/click 双向联动；
- 联动不发网络请求；
- 失败保留已有等时圈与上一成功名称云；
- 单一 MapLibre 实例。

### 12.3 默认离线

- 默认测试和 CI 必须零公网；
- live 测试只在显式环境开关下运行；
- 不把 live quota 数值写进 fixture；
- fixture 使用明显的非真实示例值；
- 不保存原始认证响应头。

## 13. 截图与证据

至少生成：

```text
exports/stage-5-live/wuhan-huanghelou-walking-10-20-30-name-cloud.png
exports/stage-5-live/api-quota-status-panel.png
exports/stage-5-live/walking-name-cloud-map-link.png
```

第一张必须清楚显示：

- 武汉·黄鹤楼；
- 步行；
- 10/20/30 分钟；
- 三个嵌套时间圈层；
- 真实 POI 名称标签；
- “未分类名称云”；
- 已显示/具名数量；
- 不含 Key。

配额图必须显示：

- 等时圈、地点搜索、POI 三行；
- 真实剩余量或明确的“未知”；
- 最近观测时间；
- live / last-observed / cache 状态；
- 不含账户标识或认证信息。

联动图必须显示一个名称标签和传统地图对应 POI 的共同高亮。

## 14. 完成判定

### 14.1 “API 配额观测：完成”

必须同时满足：

- 三个服务独立状态；
- 真实上游响应后显示 remaining 或如实显示 header 缺失；
- 缓存命中不伪造新余额；
- 不额外探测；
- UI 位置不遮挡主画布；
- 403/429 语义区分；
- Key 与原始 headers 不进入前端；
- 离线测试通过；
- 真实浏览器证据通过。

上游若对某服务确实不返回 rate-limit header，不应伪造；该服务可以显示 unknown，但第 18 号报告必须记录实际 header 可用性。

### 14.2 “黄鹤楼步行名称云：完成”

必须同时满足：

- 真实黄鹤楼步行 10/20/30 Polygon；
- 30 分钟外圈通过面积闸门；
- 用户主动触发；
- POI 上游请求不超过 1；
- 有真实具名 POI；
- category 为空不阻塞；
- 具名 POI 被分配到三个互斥时间 band；
- 名称标签直接摆放，不按类别；
- 标签不重叠、不越界；
- 无法放下的标签有明确计数；
- 字号不暗示重要性；
- 传统地图与泛地图使用同一 POI；
- hover/click 联动不产生请求；
- 相同参数复跑 POI 上游请求为 0；
- 单一 MapLibre；
- 测试与截图通过。

若真实 POI 返回但具名 POI 为 0，应标记为“真实数据阻塞”，不能使用静态标签或类别名冒充完成。

### 14.3 本次仍不完成

以下内容必须继续写为未执行或未进入：

- 武汉 30 分钟驾车完整 POI 94-cell；
- 正式 POI 数据集；
- Overture 对比；
- 分类树与无限下钻；
- 统一 taxonomy；
- POI 评分和重要性映射；
- Matrix 精确通行时间；
- 最终 KDE/包络线研究；
- 巴黎名称云；
- 第 6 阶段。

## 15. 第 18 号报告要求

新增：

```text
docs/ors-migration/18-stage-5-ors-quota-walking-name-cloud-report.md
```

至少包含：

1. API 配额观测与名称云两项独立状态；
2. 对第 16 号报告的继承关系；
3. 修改文件和职责；
4. 基线测试与执行后测试命令、数量；
5. 三类 API 实际是否返回 rate-limit header；
6. quota 契约与 UI 位置；
7. cache hit 如何显示旧观测；
8. 是否产生任何配额探测请求；
9. 403/429 处理；
10. 黄鹤楼 center/profile/ranges；
11. 30 分钟 Polygon geometry 类型与面积；
12. POI 请求参数和上游请求数；
13. POI coverage、limit 与 truncated；
14. raw、parsed、named、unnamed、deduplicated 数量；
15. 实际名称字段优先级；
16. 0–10、10–20、20–30 与 outside 数量；
17. 三圈互斥与计数守恒证据；
18. 名称云布局算法与是否复用现有实现；
19. 字号语义；
20. placed/unplaced 数量；
21. 标签重叠与越界检查；
22. 地图—名称云联动；
23. 联动期间上游请求数；
24. 相同参数缓存零上游证据；
25. Store、MapLibre、泛地图和屏幕证据；
26. console、Network 与 canvas 数；
27. 截图相对路径；
28. Key 与响应头安全检查；
29. 已知限制；
30. 94-cell 驾车 POI 继续未执行；
31. 明确声明未进入正式第 6 阶段。

报告不得包含：

- API Key 或任何片段；
- Authorization；
- `.env` 内容；
- 原始完整上游 headers；
- 大段原始 POI body；
- 全量 POI 名称清单；
- 用户或执行机器真实位置；
- 机器绝对路径；
- 把一次 ORS 查询写成现实世界 POI 完整性的结论；
- 把固定圈层框架写成尚未实现的数据驱动包络线；
- 无证据的“全部正常”。

## 16. 官方边界

执行时以官方文档和真实响应为准：

- ORS quota FAQ：https://giscience.github.io/openrouteservice/frequently-asked-questions.html#when-and-how-does-my-quota-reset
- HeiGIT Standard Plan：https://account.heigit.org/info/plans
- ORS/OpenPOIService：https://giscience.github.io/openrouteservice/api-reference/endpoints/poi/
- ORS 公共 API 限制：https://openrouteservice.org/restrictions/

本文编写时确认的公共边界：

- 每个公共端点存在独立的日请求和分钟请求限制；
- 每日窗口从首次请求起按 24 小时重置，不等同于自然日零点；
- 官方 FAQ 指出可使用 `x-ratelimit-remaining` 与 `x-ratelimit-reset` 查看剩余每日配额；
- 分钟限制是滑动 60 秒窗口；
- 每日耗尽通常返回 403；
- 分钟限制通常返回 429；
- Standard Plan 当前公开表列出 Isochrones、Geocoding 与 POIs 的独立额度；
- POI Polygon 最大面积为 50 km²；
- POI Point buffer 最大半径为 2 km；
- API Key 不应放在客户端。

公开套餐数字只能用于文档说明和人工对照，不能作为当前账户实时状态写死到 UI。

若执行时官方行为变化：

1. 记录变化与官方来源；
2. 以真实响应和当前官方文档为准；
3. 优先调整 Adapter、契约和测试；
4. 不放宽 Key 安全和数据真实性要求；
5. 不静默扩大请求预算；
6. 超出本文范围时停止并请求用户决定。

## 17. 强制停止

生成第 18 号报告和三张证据图后立即停止。

不要自动开始：

- 94-cell 武汉驾车 POI；
- 提高完整 POI budget；
- POI 分块或递归；
- Overture 下载、导入或比较；
- taxonomy 修复和类别映射；
- 分类聚类、类别树或无限下钻；
- 评分、评论、热度或重要性模型；
- Matrix；
- 最终 KDE、虚拟点、复杂包络线或稳定性量化；
- 巴黎完整 POI 或名称云；
- 本地 ORS/OpenPOIService；
- 天地图、离线瓦片或底图替换；
- 课题组服务器部署；
- 全国数据；
- 正式第 6 阶段。

等待用户亲自查看黄鹤楼步行名称云与配额面板后，再决定下一步是：

1. 优化高密度标签容量与包络线；
2. 补 taxonomy 并进入分类聚类；
3. 使用 Overture 做同范围数据源对比；
4. 构建正式可复现 POI 数据集。

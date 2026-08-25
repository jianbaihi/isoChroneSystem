# 第 5 阶段续执行文档：ORS 真实页面交互闭环

状态：待执行
执行基线：

- `13-stage-5-ors-live-validation-execution.md` 已执行；
- `14-stage-5-ors-live-validation-report.md` 的结论为“后端真实等时圈成功、完整 POI 覆盖受预算阻塞”；
- `13A-stage-5-ors-interactive-live-validation-execution.md` 只作为需求来源，不再单独执行；
- 本文是新的续执行任务，不覆盖历史报告。

执行完成后新增：

```text
docs/ors-migration/15-stage-5-ors-interactive-ui-execution.md
docs/ors-migration/16-stage-5-ors-interactive-ui-report.md
```

完成第 16 号报告后强制停止，不进入第 6 阶段。

## 0. 给 Codex 的直接指令

继续当前项目第 5 阶段。下一步的首要目标不是继续扩大 POI 请求预算，而是让用户在真实应用页面中完成以下闭环：

```text
选择中心
→ 选择交通方式与时间阈值
→ 浏览器请求本地后端
→ 后端调用在线 ORS Isochrones
→ 返回真实 GeoJSON
→ Store 保存本次结果
→ 当前单一 MapLibre 实例绘制真实等时圈
→ 页面明确显示真实 ORS / 缓存 / Mock / 失败状态
```

本次必须先以 `includePois=false` 打通快速等时圈路径。不得再让武汉 30 分钟完整 POI 分块查询阻塞用户看到等时圈。

之后再接通：

- 武汉、巴黎固定中心预设；
- ORS Geocoder 地点搜索；
- 浏览器当前位置；
- 地图点选；
- 驾车、步行、普通骑行；
- 1–10 个、1–60 分钟的时间阈值；
- 用户主动触发的小范围真实 POI 预览；
- 传统地图、泛地图和现有交互状态的最小衔接。

本次不得：

- 把完整 POI 请求预算从 40 擅自提高到 94 或更高；
- 自动执行武汉 30 分钟完整 POI 抓取；
- 用 Mock、圆形、bbox、fixture 或旧截图冒充真实 ORS；
- 把小范围 POI 预览标记为完整研究范围；
- 进入 Overture 正式比较、本地 ORS、地图瓦片、服务器部署或第 6 阶段。

可以修改与本任务直接相关的前端、后端、测试、配置示例和文档。不得提交、推送或创建 PR；不得读取或打印 API Key。

## 1. 对第 14 号报告的判定

第 14 号报告已经提供以下可接受的阶段事实，本次先核对代码和证据是否存在，不要无理由重做：

| 项目 | 已报告结果 | 本次处理 |
|---|---|---|
| 武汉中心 | 黄鹤楼 `[114.296944, 30.546944]` | 继续作为默认中心 |
| 巴黎中心 | 埃菲尔铁塔 `[2.294478, 48.858297]` | 继续作为预设 |
| 500 m POI 冒烟 | HTTP 200，60 个要素，49 个被解析 | 作为 POI 接口已可用的证据 |
| 武汉等时圈 | 1 次真实请求，3 个有效 Polygon | 作为后端 Adapter 已可用的证据 |
| 30 分钟驾车外圈 | 约 1903.246 km² | 不缩小、不伪装 |
| 完整 POI 初始计划 | 94 个 cell | 保留为已知阻塞 |
| 冻结 POI 预算 | 40 | 本次不提高 |
| 完整 POI 请求 | 0 次 | 本次仍不自动执行 |
| 浏览器真实验收 | 未执行 | 本次首要补齐 |
| 巴黎真实冒烟 | 未执行 | 本次在页面闭环后补齐 |
| 回归 | 后端 37 项、前端 13 项通过 | 本次先复跑基线 |

需要明确区分：

```text
在线 ORS Isochrones 能力：已由后端真实请求证明
在线 OpenPOIService 小范围能力：已由真实冒烟证明
真实等时圈在应用页面显示：尚未证明
武汉 30 分钟 POI 完整覆盖：尚未完成
```

本次不能把“后端已成功”直接写成“页面已成功”，也不能因为 POI 全覆盖未完成而否定已经成功的等时圈接口。

## 2. 本次架构与交互顺序

### 2.1 快速等时圈路径

```text
Center
+ ORS profile
+ ranges
→ Analysis API（includePois=false）
→ ORS Isochrones（一次请求）
→ 累计等时圈 GeoJSON
→ 互斥 rings
→ Store
→ MapLibre + 泛地图基础圈层
```

这条路径是阻塞性验收基线。没有在真实页面看到黄鹤楼驾车 10/20/30 分钟三个真实圈，不得继续宣告完成。

### 2.2 POI 预览路径

只有用户点击“加载附近 POI / 生成泛地图预览”时才执行：

```text
上一次成功的 Center/profile/ranges
→ 用户选择 500 / 1000 / 2000 m 预览半径
→ OpenPOIService Point + buffer
→ 现有解析、分类、去重和圈层归属
→ POI 预览
→ 传统地图 / 泛地图
```

要求：

- 默认预览半径为 1000 m；
- 最大不超过公共接口的 2000 m；
- 一次预览最多一个上游 POI 请求，失败时不得自动扩大或递归；
- 使用现有缓存；
- 预览结果 metadata 必须明确：

```json
{
  "poiCoverage": {
    "mode": "preview-radius",
    "complete": false,
    "radiusMeters": 1000
  }
}
```

- UI 必须显示“附近 POI 预览”，不得显示“完整覆盖”；
- 预览结果只能证明接口、解析、分类和交互链路，不得直接作为武汉 30 分钟正式实验统计；
- POI 预览失败时保留已经成功显示的等时圈。

### 2.3 完整 POI 数据任务

武汉 30 分钟完整 POI 覆盖继续保留为独立的后续任务：

```text
已知初始计划：94 cell
当前冻结预算：40
状态：未执行、待单独决策
```

本文不提高预算、不优化格网、不触发这 94 个请求，也不将其列为页面交互闭环的前置条件。

## 3. 冻结中心和统一 Center 契约

### 3.1 固定预设

| ID | 标签 | 坐标 `[longitude, latitude]` |
|---|---|---|
| `wuhan-huanghelou` | `武汉·黄鹤楼` | `[114.296944, 30.546944]` |
| `paris-eiffel-tower` | `巴黎·埃菲尔铁塔` | `[2.294478, 48.858297]` |

武汉为首次加载默认中心。北京望京可以作为历史样例保留，但不得再作为用户默认值。

### 3.2 统一对象

预设、搜索、定位和地图点选必须归一化为同一个对象：

```json
{
  "id": "稳定 ID 或会话内生成 ID",
  "label": "地点名或格式化坐标",
  "longitude": 114.296944,
  "latitude": 30.546944,
  "source": "preset|geocoder|geolocation|map-click",
  "accuracyMeters": null
}
```

要求：

- 经度范围 `[-180, 180]`，纬度范围 `[-90, 90]`；
- 向 ORS 发送时始终组装为 `[[longitude, latitude]]`；
- 不允许各入口各自拼接不同请求；
- 定位成功可记录 `accuracyMeters`，但不得持久化用户真实位置；
- 地图点选和定位可先用坐标作为 label；
- Reverse Geocoding 只改善 label，失败不阻塞等时圈；
- 页面同时区分“当前编辑中心”和“上一次成功结果中心”。

## 4. ORS 接口边界

### 4.1 等时圈

继续通过后端 Adapter 调用：

```text
POST /v2/isochrones/{profile}/geojson
```

黄鹤楼默认请求：

```json
{
  "locations": [[114.296944, 30.546944]],
  "range": [600, 1200, 1800],
  "range_type": "time"
}
```

要求：

- 一次请求提交全部 ranges；
- 本次只使用一个 location；
- 返回必须能识别每个 range；
- 任一必要 range 缺失时整次失败，不画部分假圈；
- 不用 bbox、圆形或缓存 fixture 替代真实几何；
- 相同 center/profile/ranges 使用精确缓存。

### 4.2 地点搜索

由后端代理 ORS 公共 Geocoder：

```text
GET /api/v1/geocoding/autocomplete
GET /api/v1/geocoding/search
GET /api/v1/geocoding/reverse
```

若项目已有统一路由规范，可以等价命名。

后端要求：

- Key 只由服务端加载；
- `text` 去首尾空格，少于 2 个有效字符不发上游请求；
- `size` 默认 8，最大 10；
- 校验 focus、lon、lat；
- 支持中文和拉丁文字；
- 可用地图中心作为 ranking focus，但不得硬限制国家；
- 只向前端返回 ID、label、坐标和必要的行政区摘要；
- 不返回完整上游 body、请求头或 Key；
- 设置超时、缓存和统一错误；
- `lon,lat` 格式可以本地解析，不消耗 Geocoder 请求。

前端要求：

- 350 ms 左右防抖；
- 任一时刻最多一个 autocomplete 请求；
- 新输入取消旧请求；
- 即使旧请求完成，也要用 sequence/request ID 忽略过期响应；
- 搜索结果支持键盘上下、Enter 和 Esc；
- 选中结果只更新中心，不自动查询完整 POI；
- 无结果不得伪造地点。

### 4.3 浏览器当前位置

当前位置来自：

```js
navigator.geolocation.getCurrentPosition()
```

要求：

- 只在用户主动点击后请求权限；
- 首次页面加载不自动定位；
- 明确处理拒绝、超时、不可用和非法坐标；
- 本地 `localhost` 和未来生产 HTTPS 均保持可用；
- 自动化验收使用模拟坐标；
- 报告不得记录用户或执行机器的真实位置；
- Reverse Geocoding 异步执行，失败继续允许生成等时圈。

### 4.4 地图点选

- 增加显式的一次性“地图选点”模式；
- 只有进入该模式后，地图空白点击才更新中心；
- POI 点击与选中心不能冲突；
- 点击后立即移动唯一中心 marker；
- 更新后退出一次性选点模式；
- Reverse Geocoding 失败时保留坐标 label；
- 不创建第二个 MapLibre 实例。

## 5. 交通方式与时间阈值

### 5.1 本次支持

| 用户标签 | ORS profile | 验收要求 |
|---|---|---|
| 驾车 | `driving-car` | 黄鹤楼 10/20/30 阻塞性验收 |
| 步行 | `foot-walking` | 至少一次真实页面验收 |
| 骑行 | `cycling-regular` | 至少一次真实页面验收 |

不要展示尚未接通的公交、地铁、火车、高铁或飞机。不得用其他 profile 伪装这些方式。

### 5.2 阈值

默认：

```text
10 / 20 / 30 分钟
```

提供快捷值：

```text
5、10、15、20、30、45、60 分钟
```

提交前：

1. 转为整数；
2. 去重；
3. 升序；
4. 校验数量为 1–10；
5. 校验每个值为 1–60；
6. 转为秒；
7. 一次请求提交。

参数变更只进入待应用状态。默认只有点击“生成/更新等时圈”才请求；若已有用户可控自动更新开关，则至少 500 ms 防抖且默认关闭。

## 6. 页面与状态要求

现有页面中增加或补齐紧凑控制区，至少包含：

```text
[地点搜索                      ] [当前位置] [地图选点]
[黄鹤楼] [埃菲尔铁塔]
交通：[驾车] [步行] [骑行]
时间：[5] [10] [15] [20] [30] [45] [60]
[生成/更新等时圈] [加载附近 POI]
状态：真实 ORS / 真实 ORS·缓存命中 / Mock / 请求失败
```

页面行为：

- 当前中心、profile、阈值始终可见；
- 区分当前编辑参数与上一次成功参数；
- 重复点击只能产生一个分析请求；
- 请求开始后及时显示 loading；
- 新请求期间保留上一轮成功图形；
- 新请求成功后原子替换 Store、MapLibre source、中心和摘要；
- 新请求失败时保留旧图并标明旧结果；
- 旧响应不得覆盖更新后的参数；
- 当前参数与成功参数不一致时，禁用 POI 预览并提示先更新等时圈；
- 下钻、返回、hover、select、面板和底图切换不得触发 ORS 请求；
- Provider 为 Mock 时必须醒目标识；
- 真实模式失败时禁止静默回退 Mock。

## 7. MapLibre 真实绘制

继续复用一个 MapLibre 实例，至少包含：

- 中心点 source/layer；
- 累计等时圈 fill source/layer；
- 等时圈 outline layer；
- 必要时的时间标签 layer。

要求：

- source 直接使用当前 Analysis 响应中的真实 GeoJSON；
- feature properties 保留 range 秒数或分钟数；
- 绘制累计面时最大面先绘制、小面后绘制；
- 不同时间圈颜色和透明度可区分；
- 传统地图使用累计面，泛地图使用互斥 rings；
- 成功后用当前单实例的 `setData()` 或等价路径更新；
- 只在新分析成功时 `fitBounds`；
- 设置合理 padding 与 max zoom；
- 页面切换、下钻或底图切换不得重新 `fitBounds`；
- 地图 canvas 数始终为 1。

浏览器验收必须同时核对：

```text
后端响应 feature 数与 range
Store 中 geometry
MapLibre source 中 feature 数与 range properties
屏幕可见的中心和等时圈
```

截图不能替代 source 检查，source 检查也不能替代屏幕画面。

## 8. 可观测性和安全

Analysis 响应 metadata 至少表达：

```json
{
  "isochroneProvider": "ors-public-api",
  "poiProvider": "none|ors-openpoiservice",
  "isLive": true,
  "cacheHit": false,
  "requestId": "非敏感 ID",
  "profile": "driving-car",
  "rangesSeconds": [600, 1200, 1800],
  "featureCount": 3
}
```

字段名可适应现有契约，但语义必须存在。

安全要求：

- API Key 只在后端加载；
- 不读取、不打印 Key 的值、长度、前缀或后缀；
- Key 不进入前端、URL query、日志、截图、报告或 cache key；
- 前端只请求本地或同域后端；
- 认证失败不重试；
- 429 使用有限退避，不产生请求风暴；
- 缓存和真实响应目录保持 Git ignore；
- 不删除用户已有缓存；
- 本轮第一次浏览器真实验收使用新的缓存命名空间；
- 第二次完全相同请求使用同一命名空间证明缓存命中；
- 不在报告中记录真实定位坐标。

页面不得硬编码当前账户配额为永久事实。可显示后端安全转译的 remaining/reset 摘要，但不得暴露认证信息。

## 9. 分阶段执行

### 阶段 A：只读预检与基线

1. 阅读第 11、12、13、14、13A 和本文；
2. 将本文原样保存到仓库第 15 号路径；若路径已有不同内容则停止报告冲突；
3. 检查工作树并保护用户已有改动；
4. 核对第 14 号报告列出的实现和证据文件是否存在；
5. 查明当前前端为何尚未显示真实等时圈：
   - 页面是否仍为 Mock；
   - 请求是否到达本地后端；
   - `includePois` 当前是否默认为 true；
   - 后端响应是否把 GeoJSON 交给 Store；
   - Store 是否交给 MapLibre；
   - source/layer 是否为空、隐藏、顺序错误或在错误缩放级别；
6. 记录实际根因后再修改；
7. 复跑全部离线基线：
   - 后端测试；
   - Python 编译检查；
   - 前端完整测试；
   - JavaScript 语法检查。

基线失败时先修复与本任务相关的问题，不得开始 live 请求。

### 阶段 B：黄鹤楼真实页面最小闭环

先只完成：

```text
黄鹤楼
→ driving-car
→ 10/20/30
→ includePois=false
→ 真实 ORS
→ 三个圈在当前页面可见
```

这是本次最早阻塞检查点。必须证明：

- 浏览器只向本地后端发出一个分析请求；
- 后端只发出一个 Isochrones 上游请求；
- 响应包含 600/1200/1800 三个有效几何；
- Store 和 MapLibre source 各自包含对应数据；
- 页面可见中心点和三个圈；
- 状态显示“真实 ORS”；
- Browser Network 中没有 Key；
- 没有 Mock 回退；
- 单一 MapLibre 实例。

若此检查点失败，停止开发后续搜索和定位，先定位并最小修复。

### 阶段 C：缓存与请求竞态

1. 完全相同参数再次提交；
2. 证明 Isochrones 上游网络请求数为 0；
3. 页面显示“真实 ORS·缓存命中”；
4. 图形与首次成功结果一致；
5. 快速连续提交不同参数；
6. 证明只有最新响应更新页面；
7. 模拟新请求失败，证明旧结果仍可见且明确标为旧结果。

### 阶段 D：搜索

实现并验证：

- “黄鹤楼”或等价中文搜索；
- “Eiffel Tower”；
- 一个合法无结果查询；
- 快速连续输入只采用最后响应；
- `114.296944,30.546944` 本地坐标解析；
- 搜索结果进入统一 Center 对象；
- 搜索失败时固定预设和地图选点仍可用。

若公共 Geocoder 对中文地点覆盖不足，如实记录，不得加入伪造搜索结果。

### 阶段 E：当前位置与地图点选

实现并验证：

- 模拟定位成功；
- 权限拒绝；
- 超时或不可用；
- 一次性地图点选；
- POI 点击不触发中心移动；
- Reverse Geocoding 成功和失败；
- 两种入口都能继续生成真实等时圈。

人工定位不是自动验收必需项。不得读取或报告执行机器的真实位置。

### 阶段 F：交通方式与时间阈值

至少真实验证：

- 黄鹤楼 `driving-car` + 10/20/30；
- 黄鹤楼或一个可路由点 `foot-walking` + 5/10/15；
- 同一可路由点 `cycling-regular` + 10/20/30；
- 巴黎预设 `driving-car` + 10/20/30。

同时验证：

- 阈值无序、重复、0、61、空值和超过 10 个；
- 未知 profile 在前后端均被拒绝；
- profile 或 ranges 改变后旧 POI 被标记为不匹配；
- 切换 profile 不自动加载 POI。

### 阶段 G：附近 POI 预览与泛地图衔接

返回黄鹤楼驾车 10/20/30 成功状态后：

1. 用户主动点击加载附近 POI；
2. 使用 1000 m Point buffer；
3. 最多发出一个 OpenPOIService 请求；
4. 复用现有真实解析、分类、去重和 ring 归属；
5. metadata 标记 `mode=preview-radius`、`complete=false`；
6. 页面明确显示“附近 POI 预览”；
7. 验证传统地图 POI、泛地图标签或类别树使用同一批结果；
8. 验证下钻、返回、hover 和 select；
9. 验证这些交互不新增 ORS 请求；
10. 预览失败时仍保留三个真实等时圈。

若 1000 m 为合法空结果，可以由用户主动改为 2000 m 再请求一次；不得自动循环扩大。

不得在本阶段调用 94-cell 完整覆盖计划。

### 阶段 H：真实浏览器总验收

使用实际应用完成：

1. 首次打开显示武汉·黄鹤楼；
2. 生成黄鹤楼驾车 10/20/30；
3. 确认三个真实圈可见；
4. 相同参数复跑并确认缓存；
5. 搜索并选择巴黎地点后生成；
6. 用地图点选一个可路由位置后生成；
7. 用模拟当前位置生成；
8. 切换步行并生成；
9. 切换骑行并生成；
10. 返回黄鹤楼默认参数；
11. 主动加载 1000 m POI 预览；
12. 切换传统地图、泛地图和分屏；
13. 执行类别下钻、返回、hover、select；
14. 检查 console、Network、MapLibre source 和 canvas 数量；
15. 检查前端没有 Key。

## 10. 自动测试要求

### 10.1 后端

新增或更新测试覆盖：

- Geocoder autocomplete/search/reverse 参数和最小返回映射；
- text、size、lon、lat 校验；
- Geocoder 缓存不包含认证信息；
- profile allowlist；
- minutes 去重、排序、转秒和边界；
- `includePois=false` 不调用 POI Provider；
- 等时圈 range 与 feature 对应；
- live/cache/mock metadata；
- 真实失败不回退 Mock；
- POI preview 半径只允许 500/1000/2000；
- preview 最多一个 POI 请求；
- preview coverage 必须为 `complete=false`；
- Key 不进入响应、日志或缓存键。

默认测试和 CI 必须零公网。Live 测试只允许显式开关。

### 10.2 前端

覆盖：

- 四种 Center source 的统一 Store 写入；
- 搜索防抖、取消和旧响应忽略；
- 定位模拟成功、拒绝和超时；
- 地图选点与 POI 点击互斥；
- profile/ranges 请求构造；
- 重复提交去重；
- loading 期间保留旧几何；
- 成功原子更新；
- 失败保留旧结果；
- 真实/cache/Mock/失败状态；
- 当前参数和成功参数不一致提示；
- POI 预览失败不清除等时圈；
- preview 不显示完整覆盖。

### 10.3 Live/E2E

真实联网测试必须显式开启，例如：

```text
RUN_ORS_LIVE_TESTS=1
```

证据至少包括：

- 非敏感 request ID；
- 本地后端请求数；
- Isochrones 上游请求数；
- Geocoder 上游请求数；
- POI preview 上游请求数；
- profile、ranges 和 feature 数；
- Store 与 MapLibre source feature 数；
- cache hit；
- 响应耗时；
- 截图相对路径；
- console 和 Network 检查结果。

## 11. 截图和证据

至少生成：

```text
exports/stage-5-live/wuhan-huanghelou-driving-10-20-30.png
exports/stage-5-live/ors-center-search-controls.png
exports/stage-5-live/ors-profile-threshold-switch.png
exports/stage-5-live/ors-poi-preview-panmap.png
```

第一张为阻塞证据，必须清楚看到：

- 武汉·黄鹤楼；
- 驾车；
- 10/20/30 分钟；
- 三个真实等时圈；
- “真实 ORS”或“真实 ORS·缓存命中”；
- 当前底图；
- 不含 Key。

POI 图必须标记为“附近 POI 预览”，不得写成 30 分钟完整 POI。

## 12. 完成判定

### 12.1 “ORS 等时圈页面交互闭环：完成”

必须同时满足：

- 默认中心为黄鹤楼；
- 固定预设、搜索、模拟当前位置、地图点选四种入口可用；
- 搜索通过后端公共 Geocoder；
- 驾车、步行、骑行三个真实 profile 可切换；
- 阈值校验正确且一次请求提交；
- 黄鹤楼驾车 10/20/30 只发一个 Isochrones 上游请求；
- 响应、Store、MapLibre source 和屏幕均对应真实 ranges；
- 页面显示真实/cache/Mock/失败状态；
- 同参数复跑证明零上游请求；
- 新请求期间不白屏，旧响应不覆盖新状态；
- 单一 MapLibre 实例；
- 浏览器 Network 中没有 Key；
- 自动测试、live 测试和截图证据通过。

### 12.2 “ORS POI 预览闭环：完成”

必须满足：

- 用户主动触发；
- 小范围真实响应成功解析；
- metadata 明确 `preview` 且 `complete=false`；
- 传统地图与泛地图复用同一批 POI；
- 交互不触发额外请求；
- 不冒充完整研究数据。

### 12.3 “武汉 30 分钟 POI 完整覆盖”

本次固定结论：

```text
未执行；
已知初始计划 94 cell；
超过当前冻结预算 40；
留待独立数据构建任务决定。
```

这个结论不阻止“ORS 等时圈页面交互闭环”单独标记完成，但第 16 号报告必须并列呈现，不得隐藏。

## 13. 第 16 号报告要求

新增：

```text
docs/ors-migration/16-stage-5-ors-interactive-ui-report.md
```

至少包含：

1. 三项独立状态：
   - ORS 等时圈页面交互；
   - ORS POI 小范围预览；
   - 武汉 30 分钟 POI 完整覆盖；
2. 第 14 号报告的继承关系；
3. 此前页面看不到真实等时圈的实际根因；
4. 修改文件和职责；
5. 离线测试命令与数量；
6. Key 的安全加载机制；
7. 四种 Center 入口逐项结果；
8. Geocoder 查询、缓存和竞态处理；
9. 三种 profile 的真实结果；
10. 时间阈值校验结果；
11. 黄鹤楼请求的 center/profile/ranges；
12. Isochrones 上游请求数、feature 数和 geometry 类型；
13. 响应、Store、MapLibre source、屏幕四方证据；
14. 同参数缓存零网络证据；
15. 旧结果保留和旧响应拒绝证据；
16. POI preview 半径、请求数、解析与分类计数；
17. preview coverage 标识；
18. 传统地图与泛地图联动；
19. console、Network 和 MapLibre 实例数量；
20. 截图相对路径；
21. 配额消耗的非敏感摘要；
22. Key 与定位隐私检查；
23. 完整 POI 未执行及 94/40 阻塞说明；
24. 已知限制；
25. 明确声明未进入第 6 阶段。

报告不得包含：

- API Key 或其任何片段；
- Authorization header；
- `.env` 内容；
- 完整上游错误 body；
- 用户或执行机器的真实定位坐标；
- 大段 POI 原始响应；
- 机器绝对路径；
- 无证据的“全部正常”结论。

## 14. 官方约束

执行时以官方文档和真实响应为准：

- ORS Isochrones：https://giscience.github.io/openrouteservice/api-reference/endpoints/isochrones/
- ORS Geocoder：https://giscience.github.io/openrouteservice/api-reference/endpoints/geocoder/
- ORS/OpenPOIService：https://giscience.github.io/openrouteservice/api-reference/endpoints/poi/
- 公共 API 限制：https://openrouteservice.org/restrictions/
- Standard Plan：https://account.heigit.org/info/plans

本文核对时的公共边界：

- Isochrones 支持多个精确 range；
- 最多 10 个 intervals；
- driving 时间上限 1 小时；
- POI Polygon 最大 50 km²；
- POI Point buffer 最大半径 2 km；
- Geocoder 和 POI 是公共 API 服务，不是自建 ORS 后端本体；
- ORS/GeoJSON 坐标顺序为 `[longitude, latitude]`。

若执行时官方约束变化：

1. 记录变化与官方来源；
2. 优先修改 Adapter 和测试；
3. 不放宽密钥、隐私和真实性要求；
4. 不静默缩小时间范围；
5. 超出本文范围时停止并请用户决定。

## 15. 强制停止

第 16 号报告和上述截图生成后立即停止。

不要自动开始：

- 提高完整 POI 请求预算；
- 执行 94-cell 武汉完整 POI 抓取；
- 调整 POI 网格或递归策略；
- Overture 下载、导入或正式比较；
- 巴黎完整 POI；
- 本地 ORS/OpenPOIService；
- Matrix 或逐 POI 通行时间；
- 天地图、离线瓦片或底图替换；
- 课题组服务器部署；
- 全国数据；
- 第 6 阶段。

等待用户亲自打开应用确认真实等时圈和交互效果后，再单独决定武汉正式 POI 数据构建路线。

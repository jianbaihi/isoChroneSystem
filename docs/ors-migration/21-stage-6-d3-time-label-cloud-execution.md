# 第 6 阶段第 2 步：D3 思路的精确时间标签云执行文档

状态：待执行

直接基线：

- `docs/ors-migration/20-stage-6-matrix-exact-time-report.md` 必须已完成；
- 第 20 号报告中应存在一批完整、可缓存复用的 `foot-walking` Matrix 结果。

执行完成后新增：

```text
docs/ors-migration/21-stage-6-d3-time-label-cloud-execution.md
docs/ors-migration/22-stage-6-d3-time-label-cloud-report.md
```

完成第 22 号报告后强制停止。不得自动进入大范围 POI 或多交通方式任务。

## 0. 给 Codex 的直接指令

只重构当前步行三圈 POI 标签云的视觉编码与布局。整个任务必须使用第 20 号的本地结果，真实 API 调用预算全部为 0。

目标闭环：

```text
Matrix 精确时间 + POI 名称 + 时间圈层
→ 时间排名字号
→ 圈层同色相文字
→ 圈内时间透明度
→ D3 Cloud 思路的 sprite-mask 紧凑摆放
→ SVG 文本交互渲染
→ 量化比较旧布局与新布局
```

主页按钮统一改为：

```text
生成POI标签云泛地图
```

不得再写“生成步行名称云”。按钮行为跟随当前成功分析的交通方式；本次真实效果只验收步行缓存。

## 1. 本次必须与不得

### 1.1 必须

- 删除 POI 标签默认可见的胶囊背景、矩形边框、圆角和大 padding；
- 默认只显示名称文字；
- 所有 POI 标签保持水平，不旋转；
- 字号只由 Matrix 时间排名决定；
- 时间越短，字号越大；
- 字色与所属圈层使用同一语义色相；
- 每个圈层内部，时间越长文字透明度越低；
- 使用真实字体测量或字形 sprite；
- 使用明显优于逐标签线性扫描的碰撞结构；
- 保持 10/20/30 分钟互斥嵌套和中心锚点；
- 保持 `poiId` 双视图联动；
- 输出旧布局 A 与新布局 B 的量化对比。

### 1.2 不得

- 不调用 Isochrones、Geocoder、POI 或 Matrix；
- 不引入评分、热度、评论数、类别或随机重要性；
- 不把 POI 地理坐标直接当泛地图标签坐标；
- 不直接套用一个矩形普通词云而丢弃时间圈层约束；
- 不用 `Math.random` 导致同一输入每次变化；
- 不为了提高摆放率把字号缩到不可读；
- 不隐藏未摆放计数；
- 不在本次创建 KDE 包络线、类别树或无限下钻；
- 不建立第二个 MapLibre 实例。

## 2. 研究与算法参考边界

D3 Cloud 的可借鉴核心是：

- 先放置大词；
- 由中心或指定锚点沿螺线寻找候选；
- 使用 Canvas 生成字形 sprite mask；
- 用位图/位运算检测占用，实现接近交互速度；
- 通过时间片避免长期阻塞浏览器事件循环；
- 可注入固定随机源保证可复现。

参考：[jasondavies/d3-cloud](https://github.com/jasondavies/d3-cloud)

本项目不是普通 Wordle。需要实现“时间圈层约束的 D3-style 布局”：每个标签只能在自己的 ring mask 内移动，三个 ring 共用全局占用板，中心标签与时间标注预先作为障碍物。

如直接引入 `d3-cloud` 包：

- 先检查当前静态模块架构和构建方式是否兼容；
- 固定明确版本并保留 BSD-3-Clause 许可；
- 不直接修改依赖包内部源码；
- 用适配器提供 ring mask、固定随机源和结果契约。

如直接使用依赖会引入构建器或破坏当前项目，允许在项目内部实现小型 ring-constrained sprite-board 引擎，并在代码注释和报告中明确“算法思路参考 d3-cloud”，不得声称完整使用了 D3 库。

POI 中心化标签云的紧凑、无压盖和高效碰撞思路也可参考：成晓强等，2024。[DOI](https://doi.org/10.12082/dqxxkx.2024.230069)

## 3. 冻结的时间视觉编码

### 3.1 字号：当前交通方式内的全局排名映射

只对 `matrixStatus=ok` 且 `0 < travelTimeSeconds ≤ maxRangeSeconds` 的当前可见 POI 排名。

按以下顺序稳定排序：

```text
travelTimeSeconds 升序
→ poiId 升序作为相同时间的 tie-breaker
```

令当前 POI 数为 `n`，标签 i 的零基排名为 `rank_i`：

```text
p_i = n <= 1 ? 0 : rank_i / (n - 1)
fontSize_i = round(fontMin + (fontMax - fontMin) × (1 - p_i)^gamma)
```

首版 token：

```text
fontMin = 12 px
fontMax = 26 px
gamma = 0.75
fontWeight = 600
rotation = 0°
```

要求：

- 最短时间为最大字号，最长时间为最小字号；
- 排名按当前中心、当前 profile、当前完整结果重新计算；
- 不跨交通方式共用排名；
- 不把 ring 上界 10/20/30 分钟直接当每个 POI 的时间；
- 不因标签放不下而悄悄改变其语义字号；
- token 集中配置，报告记录实际值。

### 3.2 圈层归属

正式 ring 使用 Matrix duration：

```text
0 < t ≤ 600       → ring-10
600 < t ≤ 1200    → ring-20
1200 < t ≤ 1800   → ring-30
```

`matrix-out-of-range`、unreachable 或 invalid 不进入标签云。页面另行显示其审计数量。

### 3.3 圈层色相

传统地图与泛地图必须共用一套 ring token：

```text
--ring-10-rgb
--ring-20-rgb
--ring-30-rgb
```

规则：

- 传统地图 polygon fill：同色相、低透明度；
- 泛地图 ring 背景：同色相、低透明度；
- 泛地图文字：同色相的可读前景 tone；
- 传统地图轮廓、时间图例和泛地图标签不得再出现同一 30 分钟却两套色相；
- 浅色与深色主题可调整明度，但必须保留同一时间色相身份。

“同色”解释为同一色相 token，不允许把文字与背景设为相同 RGB 和相同 alpha 后导致文字消失。

### 3.4 圈内透明度

对 ring 下界 `lower`、上界 `upper`：

```text
q_i = clamp((t_i - lower) / (upper - lower), 0, 1)
alpha_i = alphaNear - (alphaNear - alphaFar) × q_i
```

首版：

```text
alphaNear = 1.00
alphaFar(light) = 0.55
alphaFar(dark) = 0.65
```

边界要求：

- 圈层内较近标签更实，较远标签更淡；
- 最低透明度不能低到无法识别；
- hover、focus、selected 强制 alpha=1；
- 不可达/异常 POI 不使用“极淡文字”冒充可达；
- 颜色与 alpha 结果写入 DOM 数据属性或可测试模型，不只写在不可测内联字符串中。

### 3.5 可读性校验

- 核对代表性标签在圈层背景上的对比度；
- 普通正文目标不低于 WCAG AA 4.5:1；若同色相最低透明度无法满足，应提高文字明度/暗度或 alphaFar，但不得换成无关色相；
- 报告记录实际前景、背景和最差对比度；
- 不把透明度变化做成几乎不可见的差异，也不让远端标签消失。

## 4. 标签外观与交互

### 4.1 默认状态

POI 标签 DOM/SVG 默认不得有可见：

```text
rect background
border
border-radius
box-shadow capsule
大块 padding
```

允许保留 1–2 px 的碰撞 padding，但不能渲染出来。允许增加透明 hit target 改善点击，但它不得可见、不得参与截图视觉。

### 4.2 hover 与 selected

建议使用：

- `font-weight` 增强；
- 轻微 `text-shadow` 或 SVG `paint-order: stroke`；
- 下划线；
- 1–2 px 位移或缩放，但不能触发全局重排；
- opacity 提升到 1。

不得恢复胶囊边框。地图端对应 POI 点继续高亮；交互只更新 Store，不调用 API。

### 4.3 中心与时间标注

- 中心“黄鹤楼”是固定障碍物，不被 POI 标签遮挡；
- 10/20/30 分钟标注是固定障碍物；
- 时间标注与 POI 标签使用不同字重/字号层级；
- 本次可继续使用固定圈层边界，不把它描述为标签生成的 KDE 包络线。

## 5. Ring-constrained D3-style 布局

### 5.1 输入与输出

输入最少包含：

```json
{
  "poiId": "...",
  "text": "POI 名称",
  "ringId": "ring-20",
  "travelTimeSeconds": 754.2,
  "fontSize": 21,
  "fontFamily": "...",
  "fontWeight": 600,
  "opacity": 0.82,
  "colorToken": "--ring-20-text"
}
```

输出：

```json
{
  "placed": [{"poiId":"...","x":0,"y":0,"width":0,"height":0,"ringId":"..."}],
  "unplaced": [{"poiId":"...","reason":"no-legal-position"}],
  "metrics": {
    "durationMs": 0,
    "candidateChecks": 0,
    "placedCount": 0,
    "fillRatioByRing": {},
    "collisionPairs": 0,
    "boundaryViolations": 0,
    "layoutFingerprint": "..."
  }
}
```

### 5.2 字形 sprite 与占用板

优先实现：

1. 等待 `document.fonts.ready`；
2. 使用同一 font family/weight/size 在 Canvas 或 OffscreenCanvas 绘制标签；
3. 从 alpha channel 生成紧凑 sprite mask；
4. 使用 `Uint32Array` 位板或等价位图保存全局占用；
5. broad-phase 可使用空间网格，narrow-phase 使用 sprite 位运算；
6. 不再对每个候选线性遍历所有已摆放标签做矩形相交；
7. 最终 SVG `<text>` 使用同一字体和坐标渲染；
8. DOM 后验检查必须保持 0 重叠、0 越界。

若不同浏览器的 Canvas/SVG 字形边界存在差异，加入 1–2 px 安全 padding，不用回退到大胶囊 bbox。

### 5.3 Ring mask

- 为三个互斥 band 建立 allowed mask；
- 标签 sprite 的所有占用像素必须位于所属 ring mask 内；
- 三个 ring 共用一个全局 occupied board，防止相邻圈层标签压盖；
- 中心、时间标注和必要图例先写入 occupied board；
- Polygon/MultiPolygon 或未来包络线应通过统一 mask Adapter，不在算法里硬编码圆公式；
- 当前固定圆环可以作为第一个 Adapter 实现。

### 5.4 候选搜索

按字号从大到小放置；相同字号按 `travelTimeSeconds`、`poiId` 排序。

每个 ring 可使用多个确定性 seed：

```text
seed = hash(center + profile + ranges + poiSetHash + layoutVersion)
```

候选从 ring 的可用区域内部开始，沿阿基米德或矩形螺线移动。必须：

- 注入 seeded PRNG，禁止 `Math.random`；
- 固定最大候选步数；
- 尝试 2–3 个固定 seed 变体时，选择 placedCount 更高、fillRatio 更好的结果；
- 所有变体仍可复现；
- 不因某个长标签失败而阻塞全部布局。

### 5.5 Worker 与取消

优先把布局放入 Web Worker：

- 输入使用可结构化克隆的纯数据；
- OffscreenCanvas 可用时在 Worker 生成 sprite；
- 不可用时使用主线程分时 fallback；
- 每 8–12 ms 或合理时间片让出事件循环；
- 新参数、窗口 resize 或新布局请求到来时取消旧 job；
- 使用 `jobId` 防止旧结果覆盖新结果；
- 新布局完成前保留旧画面，完成后原子替换；
- 失败或取消不清空传统地图和上一次成功结果。

### 5.6 响应式重排

- resize 防抖约 200 ms；
- 只在画布尺寸实际变化时重排；
- hover/selected、视图切换不重排；
- 主题和纯颜色变化不重排；
- 字体、字号 token、圈层几何、POI 集合变化才使布局缓存失效。

## 6. 布局缓存与可复现性

缓存键至少包含：

```text
poiId + text + matrix time + ringId 的集合 hash
canvas width/height/devicePixelRatio bucket
font family/weight
fontMin/fontMax/gamma
collision padding
ring mask hash
layout algorithm version
seed
```

同一输入复跑必须：

- placed/unplaced 集合一致；
- 每个 POI 坐标一致或在固定浮点容差内一致；
- fingerprint 一致；
- 不触发任何 API；
- 不因当前 hover/selected 状态改变布局。

## 7. A/B 量化基线

保留旧版固定圆环 + 黄金角 + 矩形碰撞为 Baseline A，仅用于测试/研究对比；默认 UI 使用新版 B。

至少计算：

| 指标 | 定义 |
| --- | --- |
| placedRate | `placed / eligible` |
| unplacedCount | 合法但无位置的标签数 |
| collisionPairs | DOM 后验重叠对数，必须 0 |
| boundaryViolations | 超出所属 ring 的标签数，必须 0 |
| fillRatio | 字形或紧凑 bbox 占用面积 / 可用 ring 面积 |
| layoutDurationMs | 不含 API 和页面启动的布局时间 |
| candidateChecks | 候选检测次数 |
| maxMainThreadBlockMs | 主线程最长阻塞 |
| stability | 同输入多次 fingerprint 是否一致 |

第 18 号 A 基线已知为 `108/282`，但第 20 号 Matrix 重新分圈后 eligible 数可能变化，报告必须同时给出：

- 原始第 18 号历史值；
- 同一 Matrix 输入下重新运行的 A 值；
- 同一输入下 B 值。

不能用两套不同 POI 数比较。

目标而非伪造硬结论：

- B 的 placedRate 应明显高于同输入 A；
- 282 规模目标布局时间中位数不超过 2 秒；
- 无 Worker 环境允许更慢，但 UI 必须可取消且不长期冻结；
- 若 placedRate 未提高或耗时更差，如实写“实验未达到目标”，不得隐藏。

## 8. 页面文案与统计

按钮：

```text
生成POI标签云泛地图
```

状态文案示例：

```text
正在准备精确时间标签…
正在计算紧凑布局 126/238…
已显示 176/238 个可达 POI 标签，62 个待通过聚焦查看
字号：时间越短越大；透明度：本圈内时间越长越淡
```

统计必须区分：

- raw POI；
- Matrix 可达且在最大阈值内；
- Matrix unreachable/invalid；
- Matrix out-of-range；
- placed；
- unplaced；
- 主动过滤（本次应为 0）。

不得把 unplaced 写成“系统筛选”或静默不报。

## 9. 分步执行

### 阶段 A：预检与零 API 保护

1. 阅读第 20 号报告和本文；
2. 将本文原样归档到第 21 号路径；
3. 检查缓存中存在完整 Matrix 结果；
4. 为前后端联网 Adapter 安装测试级计数/断言，本任务出现上游请求即失败；
5. 保存旧布局 A 的同输入指标。

### 阶段 B：视觉模型

1. 实现时间排名与字号公式；
2. 实现 Matrix band 与圈内 alpha；
3. 统一传统地图和泛地图 ring token；
4. 删除胶囊可见样式；
5. 实现无胶囊 hover/selected；
6. 完成纯函数测试。

### 阶段 C：sprite-board 布局

1. 建立 ring mask Adapter；
2. 建立 sprite 生成与占用板；
3. 实现确定性螺线候选；
4. 实现 Worker/分时 fallback、取消和 jobId；
5. 接入现有 Panmap Adapter，保留 `poiId`；
6. 添加布局缓存和 fingerprint。

### 阶段 D：量化与浏览器验收

1. 对同一 Matrix 输入运行 A/B；
2. 至少 5 次 B 重跑，记录中位耗时与稳定性；
3. DOM 后验检查重叠和越界；
4. 验证浅色/深色主题可读性；
5. 验证 resize 取消旧任务；
6. 验证一个 hover、一个 click 双向联动且 API=0；
7. 保存全景、局部标签、联动和 A/B 指标证据。

### 阶段 E：报告并停止

生成第 22 号报告后停止。报告明确说明是“固定圈层约束下的标签云”，不得写成已完成数据驱动包络线或类别聚类。

## 10. 自动测试最低要求

- 时间排名稳定、最短最大、最长最小；
- 相同 duration 由 poiId 稳定打破并列；
- 字号始终位于 12–26 px；
- 600/1200/1800 秒 ring 边界正确；
- 三个 ring 的 alpha 在各自内部单调不增；
- alpha 不低于 token 下限；
- ring token 在双视图一致；
- 默认标签无可见 capsule class/style；
- sprite collision 的相交/不相交用例；
- 标签全部像素处于所属 ring mask；
- 中心和时间标注障碍有效；
- 同输入 fingerprint 一致；
- 取消的旧 job 不能写回；
- resize/hover/selected 的重排边界正确；
- unplaced 计数守恒；
- 全部上游请求计数为 0。

## 11. 时间盒与停止条件

- 单个测试命令最长 120 秒；
- 单次布局最长 10 秒，超时必须取消并返回诊断；
- 浏览器验收最长 15 分钟；
- 本任务累计 75 分钟仍未完成，写断点版第 22 号报告并停止；
- 不得通过无限候选、无限 seed 或浏览器循环重试延长任务。

立即停止条件：

- 第 20 号 Matrix 结果不完整；
- 任一真实 API 被调用；
- 新布局出现无法解释的重叠/越界；
- 字体未加载导致同输入不稳定；
- 需要引入完整前端框架或重写项目才能接入依赖；
- 默认视觉仍出现胶囊边框；
- 新布局性能明显退化且没有可关闭回退。

## 12. 完成判据

- 按 Matrix 时间实现“近大远小”；
- 圈内透明度随时间单调降低；
- 双视图时间色相一致且文字可读；
- POI 标签默认仅显示文字，无胶囊；
- 新布局使用 sprite/位图或等价加速碰撞，不再逐候选线性扫描全部标签；
- 0 重叠、0 圈层越界；
- 同输入确定性；
- A/B 指标真实可复核；
- 所有 API 调用为 0；
- 第 22 号报告完成并停止。

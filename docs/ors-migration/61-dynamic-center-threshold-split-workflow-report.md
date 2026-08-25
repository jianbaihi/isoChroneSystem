# 第61号更新报告：任意中心、动态时间阈值与四步在线工作流

更新日期：2026-08-25（Asia/Shanghai）  
工作区：`/Users/zhangzhihan/isoChroneSystem-main`  
状态：`completed-local-and-isochrone-live-validated`

## 1. 本次目标

本次更新解决传统地图端在线 API 调用与工作流耦合问题，使用户能够：

1. 通过在线搜索、浏览器当前位置或传统地图选点设置中心点；
2. 使用 1–10 个严格升序、互不重复的任意分钟阈值生成可达域；
3. “生成可达域”只请求 ORS Isochrones，不自动请求 POI 或 Matrix；
4. 依次、独立执行“查询等时圈内 POI”“补齐精确时间”“探索泛地图”；
5. 仅在 POI 和 Matrix 都完成后进入泛地图，本地布局步骤不新增业务 API 请求。

## 2. 修改前基线

### 2.1 运行基线

- 前端：`http://127.0.0.1:5500`；
- 后端：`http://127.0.0.1:8000`；
- 后端模式：`development / ors`；
- Isochrones、Matrix、Geocoder、POI Provider 均为 configured；
- `mockFallback=false`；
- `.env` 只由后端读取。

### 2.2 功能基线

- 搜索中心点、浏览器定位、地图选点的基础代码已存在；
- 时间阈值 UI 已支持增加、删除和编辑，但主真实工作流被历史 10/20/30 门禁限制；
- “探索泛地图”按钮内部串联 POI、Matrix、发布与布局；
- POI 和 Matrix 的独立按钮变量存在，但 HTML 中缺少对应按钮；
- POI 服务冻结为黄鹤楼步行 10/20/30；
- Matrix 服务冻结为黄鹤楼步行 10/20/30；
- 骑行端点默认走第 51 号冻结缓存，无法作为任意中心/阈值的通用路径；
- 浏览器曾因旧缓存把 `/api/v1` 请求发送到 5500 静态服务；第 60 号之后已先完成资源版本修复。

### 2.3 测试基线

- 修改前前端全量测试：117 passed；
- 历史 Python 完整发现受两个本地证据缺失影响：
  - 第 59 号测试依赖的 ORS 缓存 JSON 不在当前工作区；
  - 个别直接模块运行方式使用顶层测试模块导入；
- 上述属于当前工作区历史证据/测试装载问题，不是本次在线工作流逻辑失败。

## 3. 新增工作流

传统地图端现在使用四个职责独立的按钮：

| 步骤 | 按钮 | 网络行为 | 成功门禁 |
| --- | --- | --- | --- |
| 1 | 生成可达域 | 只调用 `/api/v1/analyses`，后端只请求 Isochrones | 当前中心、profile、阈值对应真实等时圈成功 |
| 2 | 查询等时圈内 POI | 调用 `/api/v1/name-clouds`，使用当前最外层 Polygon | 当前等时圈有效且与参数草稿一致 |
| 3 | 补齐精确时间 | 调用 `/api/v1/matrix-accessibility` | 当前结果已有 POI 且没有 stale |
| 4 | 探索泛地图 | 无业务 API；仅执行本地布局和视图切换 | 当前结果已有 Matrix 元数据 |

按钮状态按结果逐级解锁：

```text
生成可达域
  → 查询等时圈内 POI
    → 补齐精确时间
      → 探索泛地图
```

中心点、交通方式或时间阈值变化后，旧结果被标记为 stale，后续按钮重新关闭，不会把旧中心的 POI/Matrix 与新等时圈混合。

## 4. 中心点能力

### 4.1 在线搜索

- 输入至少两个字符后，经 350 ms 防抖调用本地 Geocoder API；
- 本地 API 再由后端调用 ORS Geocoder；
- 支持键盘上下选择、Enter 确认、Escape 关闭；
- 搜索结果写入统一 `parameterDraft.center`；
- 搜索不会自动触发 Isochrones、POI 或 Matrix。

### 4.2 使用当前位置

- 使用浏览器 Geolocation 获取 WGS84 坐标；
- 有效坐标立即作为中心点，即使反向地理编码失败仍可用于分析；
- 反向地理编码只用于补充可读名称；
- 定位权限拒绝、不可用和超时均有独立提示；
- 该路径不会自动生成等时圈，用户仍需点击“生成可达域”。

出于隐私边界，本次自动验收没有请求或发送用户真实当前位置；代码路径、按钮、错误处理和统一状态写入已通过静态与浏览器结构检查。用户验收时可自行授予浏览器定位权限。

### 4.3 地图选点

- 点击“地图选点”进入显式选点状态；
- 在 MapLibre 传统地图任意位置点击后写入 WGS84 坐标；
- 同步更新地图中心 Marker、中心名称、坐标和 stale 提示；
- 选点完成后自动退出选点状态；
- 不自动调用任何分析 API。

浏览器实测将中心更新为“地图选点”，坐标约为 `30.5428° N, 114.3178° E`，`aria-pressed` 恢复为 false，旧结果正确变为 stale。

## 5. 动态时间阈值

前后端现在统一支持：

- 1–10 个阈值；
- 正整数分钟；
- 严格升序；
- 自动去重和排序；
- UI 当前范围 1–60 分钟；
- 每个阈值转换为 `minutes × 60` 秒传给 ORS；
- 传统地图颜色、图例、圈层和泛地图摘要按当前结果动态生成；
- Matrix 按当前阈值动态生成互斥圈层，例如 5/15/45 分钟对应：
  - `ring-0-5`
  - `ring-5-15`
  - `ring-15-45`
  - `matrix-out-of-range`

工具栏时间圈层循环也改为读取当前结果，不再写死 10/20/30。

## 6. 后端通用化修改

### 6.1 POI

- 移除仅 `foot-walking` 的限制；
- 移除仅 10/20/30 的限制；
- 校验累计等时圈阈值必须与请求阈值逐项一致；
- POI 查询使用当前最外层累计 Polygon；
- Coverage 的 `rangeSeconds` 和警告文本按最大阈值动态生成；
- 保留 45 km² 单片安全上限、请求预算、截断失败关闭、缓存和配额观察；
- 不使用 bbox、固定半径或 mock 替代完整 Polygon 查询。

### 6.2 Matrix

- 移除黄鹤楼固定中心限制；
- 移除仅步行限制；
- 移除仅 10/20/30 限制；
- Matrix Adapter 根据当前 profile 选择 ORS endpoint；
- Matrix 时间圈层根据当前阈值动态计算；
- 发布结果仍通过唯一 POI–Matrix Join，以 `poiId` 双向校验；
- null、invalid、out-of-range 保持可审计，不回退为空间圈层。

### 6.3 骑行兼容

- 携带历史第 51 号 Job Header 时继续复用冻结骑行缓存路径；
- 通用 UI 不发送历史 Job Header，因此任意中心/阈值的骑行请求走实时通用 POI/Matrix 路径；
- 历史验收缓存与新的通用工作流互不覆盖。

## 7. 修改文件

### 前端

- `index.html`
  - 新增 POI、Matrix 独立按钮与状态区域；
  - 泛地图按钮变为纯本地布局入口；
  - 更新时间摘要和资源缓存版本。
- `styles.css`
  - 新增四步操作按钮、loading/complete/error/disabled 状态样式；
  - 新增 Matrix 摘要与 POI 精确时间详情样式。
- `app.js`
  - 拆分四步工作流；
  - 解锁驾车与任意阈值；
  - 动态圈层、摘要和按钮门禁；
  - 搜索、定位、选点继续写入统一中心状态。
- `src/state/stage51-cycling-ui.test.js`
  - 更新历史串联工作流断言；
  - 新增四按钮职责隔离和动态阈值回归测试。

### 后端

- `server/app/main.py`
  - 只在历史 Job Header 存在时走冻结骑行缓存；通用请求走实时路径。
- `server/app/services/analysis.py`
  - POI 查询通用化到任意中心、profile 和阈值。
- `server/app/providers/poi/ors_remote.py`
  - 移除 POI 请求必须等于 `.env` 固定阈值的历史限制。
- `server/app/adapters/ors_matrix.py`
  - 动态 Matrix 圈层和动态阈值解析。
- `server/app/services/matrix_accessibility.py`
  - 移除固定中心/profile/阈值门禁并按当前结果汇总。
- `server/app/services/published_result_normalization.py`
  - 动态圈层发布和统计。
- `server/tests/test_matrix.py`
  - 新增 5/15/45 分钟动态边界测试。
- `server/tests/test_dynamic_online_workflow.py`
  - 新增任意中心、驾车、5/15 分钟 POI→Matrix 完整离线契约测试。

## 8. 自动测试结果

### 前端

```text
node --test src/**/*.test.js
118 passed, 0 failed
```

新增覆盖：

- 四个按钮在 HTML 中唯一存在；
- 可达域流程不调用 POI、Matrix 或发布；
- POI、Matrix 各自绑定独立按钮；
- 泛地图流程不调用业务 API；
- 任意阈值进入请求与工具栏圈层循环。

### 后端重点测试

```text
15 passed, 0 failed
```

覆盖：

- 任意中心；
- 驾车 profile；
- 5/15 与 5/15/45 动态阈值；
- POI 结果进入 Matrix；
- 600 秒落入动态 `ring-5-15`；
- 精确时间写回 POI；
- 历史 10/20/30 Matrix 行为保持兼容；
- Isochrones-only 分析仍不返回 POI。

完整 Python 发现仍会因当前工作区缺少第 59 号历史缓存证据文件而出现 1 个 import error；在触发该缺失证据前的 117 项测试均已运行。本次相关测试和依赖范围测试均通过。

## 9. 真实浏览器验收

### 9.1 初始状态

- 页面加载新脚本：`app.js?v=20260825-split-online-workflow`；
- 在线服务显示“已配置”；
- MapLibre 传统地图正常；
- 浏览器控制台无 error/warn；
- 初始只有“生成可达域”可用，其余三步禁用。

### 9.2 在线搜索

- 查询“黄鹤楼”通过 `/api/v1/geocoding/autocomplete` 返回候选；
- 选择结果后中心更新为 `黄鹤楼, Wuhan, HU, China`；
- 坐标更新为约 `30.5471° N, 114.2970° E`。

### 9.3 任意阈值

- 将 UI 阈值改为 5/15/45；
- `documentElement.dataset.analysisRanges` 同步为 `5,15,45`；
- 生成按钮可用，POI/Matrix/泛地图仍保持禁用。

### 9.4 Isochrones-only 真实请求

使用公开地标黄鹤楼、驾车、5/15/45 分钟执行一次真实生成：

- `/api/v1/analyses` 返回 200；
- 页面状态为 success；
- submittedRanges 为 `5,15,45`；
- 页面提示“本次只请求 Isochrones”；
- POI 按钮解锁；
- Matrix 与泛地图按钮继续禁用；
- 同一验收窗口服务日志没有 `/name-clouds` 或 `/matrix-accessibility` 请求。

该请求只验证 Isochrones。为避免未经审批消耗 POI/Matrix 配额，本次没有执行真实 POI 或 Matrix 上游请求；两者由通用化后端自动测试和按钮门禁验证覆盖，留给用户按界面步骤验收。

## 10. 安全边界与已知限制

- POI 查询仍受 45 km² 单片安全上限和请求预算限制；大范围驾车外圈不会静默降级。
- 当前通用 POI 按钮使用完整最外层 Polygon；若面积或预算超限，将明确失败并保留等时圈。
- Matrix 只在已有 POI 后启用；真实候选规模可能受 ORS Matrix 限制。
- “使用当前位置”会在用户授权后取得精确坐标，并由反向地理编码发送给已配置的 ORS；应由用户在验收时自主授权。
- 当前目录不是有效 Git 仓库，无法记录 commit/branch/diff 基线；本报告以实际文件和测试输出为基线。
- `server/.env` 与可能存在的 `server/.env.save` 不应进入版本控制、报告或截图。

## 11. 验收步骤

1. 打开 `http://127.0.0.1:5500/`；
2. 通过搜索、当前位置或地图选点选择中心；
3. 选择步行/骑行/驾车；
4. 增删或编辑时间阈值；
5. 点击“生成可达域”，确认只出现圈层且 POI 数为 0；
6. 点击“查询等时圈内 POI”，确认传统地图出现 POI；
7. 点击“补齐精确时间”，确认 Matrix 摘要和 POI 精确时间出现；
8. 点击“探索泛地图”，确认进入泛地图且不新增业务 API 请求；
9. 返回传统地图，改变中心或阈值，确认旧结果标记 stale，后续按钮重新关闭。

## 12. 最终结论

传统地图端的中心选择、动态阈值与在线调用已经形成清晰、可审计的四步流程。真实浏览器已经证明任意中心搜索、地图选点、5/15/45 分钟请求和 Isochrones-only 行为；POI 与 Matrix 已从泛地图布局中解耦，并在后端解除历史固定中心/profile/阈值限制。前后端服务在报告完成后保持运行，供用户继续执行 POI、Matrix 与泛地图验收。

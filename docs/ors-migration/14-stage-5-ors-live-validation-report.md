# 第五阶段 ORS 真实验收报告

最终状态：代码完成，真实验收阻塞。第六阶段未进入。

执行日期：2026-07-30。执行依据：`docs/ors-migration/13-stage-5-ors-live-validation-execution.md`。

## 1. 阻塞结论

武汉黄鹤楼真实等时圈已成功，500 米真实 POI 冒烟已成功；但 30 分钟累计等时圈生成的完整 POI 初始网格为 94 个 cell，超过冻结的 40 个请求预算。因此按 D4 停止规则返回 `POI_REQUEST_BUDGET_EXCEEDED`，没有发出完整 POI 覆盖请求，也没有把阶段标记为完成。

未执行 D5 完整 POI 覆盖、D6 缓存零网络复跑、真实浏览器交互、真实出图和巴黎冒烟；这些步骤依赖 D4 预算通过。

证据摘要位于：`exports/stage-5-live/wuhan-huanghelou-validation.json`。

## 2. 冻结中心与默认配置

| ID | 标签 | 请求坐标 `[lon, lat]` |
|---|---|---|
| `wuhan-huanghelou` | 武汉·黄鹤楼 | `[114.296944, 30.546944]` |
| `paris-eiffel-tower` | 巴黎·埃菲尔铁塔 | `[2.294478, 48.858297]` |

已将用户可见默认中心、新分析请求默认中心和静态初始页面改为武汉·黄鹤楼。巴黎作为预设保存。北京望京只保留为历史样例入口，不再是默认中心；本轮没有把望京坐标发送到真实验证请求。

中心事实分别由前端 `src/config/center-presets.js` 与服务端 `server/app/centers.py` 声明，并由前后端测试锁定坐标、标签和 `[lon, lat]` 顺序。

固定运行参数实际生效为：`ors` 分析、`ors_remote` POI、`driving-car`、600/1200/1800 秒、POI 预算 40、并发 2、单 cell 最大 45 km²、返回上限 600。真实凭据只在服务端进程内加载，报告不记录其内容。

## 3. 代码与文档变更

- `src/config/center-presets.js`、`src/state/analysis-store.js`：前端中心预设和默认请求中心。
- `app.js`、`index.html`：默认中心显示、武汉/巴黎预设、历史望京入口和本地 API 地址覆盖入口。
- `src/config/app-config.js`：支持仅用于本地验收的非敏感 API 地址查询参数。
- `server/app/centers.py`：服务端确认中心事实。
- `server/app/providers/poi/ors_remote.py`：补充覆盖完整性字段。
- `server/app/cli/stage5_live_validation.py`：默认不联网、显式 live flag 才执行的 D2–D6 审计 harness，记录 HTTP 请求计数和缓存证据。
- `.gitignore`：忽略本阶段真实缓存和导出目录。
- `docs/ors-migration/13-stage-5-ors-live-validation-execution.md`：本次执行文档原样归档。

首次 D2 请求暴露了 buffer 请求体适配问题：错误格式返回 HTTP 400。依据官方 OpenPOIService 示例改为 `geometry.geojson=Point` 加 `geometry.buffer=radius` 后，第二次新缓存命名空间执行成功。[官方 POI API 说明](https://github.com/GIScience/openpoiservice#api-documentation)

## 4. 基线与最终回归

实际执行：

```text
cd server
.venv/bin/python -m unittest discover -s tests -v
.venv/bin/python -m compileall -q app tests
node --test $(rg --files src | rg '\.test\.js$' | sort)
全部 JavaScript 文件逐个 node --check（排除本地运行时配置）
```

结果：服务端 37 项通过，前端 13 项通过，Python 编译通过，JavaScript 语法检查通过。Overture importer、SQLite/R-Tree、本地 provider、mock provider 和远程 provider 离线测试均通过。

live harness 在未设置 `RUN_ORS_LIVE_TESTS=1` 时只返回 not-run，不产生公网请求。

## 5. 武汉真实检查点

### D1：安全配置

通过。运行时确认凭据已配置、Provider/profile/ranges/预算/并发/缓存命名空间符合冻结值；凭据值、请求头和完整 `.env` 未输出。

### D2：500 米 POI 冒烟

通过。第二次执行使用半径 500 米并在第一次请求获得合法成功后停止：

- 真实 POI 请求：1 次；HTTP 200；
- 返回要素：60；按现有规则解析：49；
- 名称缺失诊断：11；
- 未扩大到 1000/2000 米。

### D3：真实等时圈

通过：

- ORS 上游等时圈请求：1 次；
- range：600、1200、1800 秒；
- 几何：3 个 Polygon；
- 三个几何均有效且非空；
- 面积单调递增；
- 互斥 ring 构建在真实等时圈之后执行。

### D4：请求前完整覆盖计划

已完成计划计算，但预算不通过：

- 外圈几何：Polygon；
- 投影面积：1903.245963 km²；
- 外圈 bbox：`[113.960684, 30.23341, 114.656211, 30.885505]`，仅用于审计和网格生成；
- UTM：EPSG:32650；
- 初始相交 cell：94；
- 最大 cell 面积：36 km²；
- 最小 cell 面积：0.015839 km²；
- 计划请求数：94；
- 冻结预算：40；
- 结论：`POI_REQUEST_BUDGET_EXCEEDED`。

### D5/D6

未执行。完整 POI 请求数为 0；没有生成 `poiCoverage.complete=true` 的完整覆盖结果，也没有声明缓存零网络复跑成功。

## 6. 浏览器、出图和巴黎

按 D4 阻塞规则未启动真实 ORS 后端浏览器验收，未执行真实巴黎请求，未生成真实武汉论文图。已有的本地 mock 页面回归不计入真实验收结果。

## 7. 安全与范围检查

- 真实凭据只由服务端进程加载；前端不持有凭据。
- 认证信息未进入源码、缓存键、测试 fixture、导出 JSON 或报告。
- 非敏感扫描确认凭据值在 tracked/unignored 文件中的匹配数为 0。
- 未下载或导入 Overture/OSM 数据，未创建 ready dataset，未修改真实 `server/.env` 或 manifest。
- 未部署服务、未修改课题组服务器、未创建提交/推送/PR。
- `git diff --check` 通过；保留工作区中已有的用户改动。

## 8. 下一步需要用户决定

本次阻塞不是中心、认证或等时圈失败，而是冻结预算与真实武汉 30 分钟外圈网格数量不匹配。继续第五阶段前需要用户明确是否：

1. 提高本次 POI 请求预算；或
2. 调整网格/查询策略并重新审查完整性；或
3. 接受本次只完成真实等时圈与小范围 POI 冒烟。

在用户确认前停止，不进入第六阶段。

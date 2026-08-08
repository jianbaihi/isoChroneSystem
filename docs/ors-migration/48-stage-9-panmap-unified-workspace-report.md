# 第48号报告：泛地图统一工作台与普通/研究模式显式切换

状态：`completed`

执行日期：2026-08-06

执行范围：仅第47号文档；未进入骑行真实点击链路或后续阶段。

## 1. 交付结论

普通模式与研究模式现在共用同一个泛地图工作台、同一个 SVG 画布、同一份第45号步行缓存结果和同一套布局渲染逻辑。页面顶部提供始终可见的“普通模式 / 研究模式”分段切换；研究模式只增量显示研究指标、冻结基线、当前算法参数、视图对比和实验导出。

在一次缩放和一次平移后连续切换 20 次，analysis ID、284 个总 POI、254 个 eligible、39/85/130 圈层、254 个标签节点、标签坐标指纹和 SVG viewBox 均未改变。第43号实验运行次数保持 0，五类业务上游请求新增量均为 0。

## 2. 第45号截图哈希补正

第45号三张归档均为实际 PNG，文件实际 SHA-256、`screenshot-sha256.json` 与第46号报告一致：

- `stage45-walking-isochrones.png`：`d1a4b320e3928ab6c1c5a8e0bda0306b23f9dcf6e485a47d715f59848c1863c8`
- `stage45-walking-panmap.png`：`1a21def2b2626103dae8a2420cac94f2d1bd03e3f6bee02814b1ba94787f1bda`
- `stage45-walking-research-mode.png`：`4a77c04fd10ba9265db32074e2ad0d30418bbe3577c0c4fac7144f25f43e380f`

补正核验状态：`verified-consistent`。没有修改第45号业务代码或数据。

## 3. 基线与冻结项

- 分支：`main`
- HEAD：`6379d19b644d44d471c7ad3ed29c4e3e558928c3`
- 工作区在开始前已有 64 个状态项；本阶段未 reset、未清理、未回退已有修改。
- 第45号发布结果：analysis ID `analysis-name-cloud-7823d8e3-5c27-4a22-8b78-be5939c4e2ba`。
- total / eligible / out-of-range：`284 / 254 / 30`。
- 互斥圈层：`39 / 85 / 130`。
- Matrix 指纹：`c4a00b9309bdd758ad6313c068a3321151e6576079c78fa97cc78db75c67578f`。
- 第43号基线仍为 `252 / 39 / 83 / 130`，没有用在线 254 重算或覆盖。
- 第22、33、37、41、43号布局计算逻辑未修改。
- 后端文件没有因第47号发生修改。

新浏览器自动化会话没有继承旧 `sessionStorage`，因此先复用了已经验收的同参数本地缓存一次来恢复会话。Isochrones、POI 和 Matrix 均为 cache hit，上游新增请求为 0；只有当 profile、284/254 数量和 Matrix 指纹全部与第45号发布清单一致时，前端才恢复冻结的发布 analysis ID。之后全部第47号验收均从该会话缓存读取。

## 4. 原普通/研究模式差异审计

实现前：

- 普通模式使用静态 `#panmapControlPanel`；
- 研究模式动态生成 `#stage43ResearchControls` 和 `#hiddenResearchPanel`；
- CSS 在研究模式中整体隐藏普通控制区；
- `research=1` 判断分散在研究模块与 `app.js`；
- 页面没有面向用户的显式模式切换。

详细审计见 [stage47-ui-audit.md](../../exports/stage-9-panmap-unified-workspace/stage47-ui-audit.md)。

## 5. 单一模式状态与显式切换

新增 `src/state/panmap-mode-state.js`：

- 模式枚举：`ordinary` / `research`；
- 默认普通模式；
- `research=1` 旧入口兼容；
- 显式 `mode=ordinary|research` 可用于初始化；
- 非法 `mode` 回退普通模式；
- URL 只用于初始化和同步，运行时唯一真源为 `PanmapApp.panmapModeStore`；
- `setMode()` 只更新模式、URL 和订阅者，不含 fetch、布局或发布调用。

顶部 `#panmapModeSwitch` 使用 `radiogroup` / `radio` 语义、`aria-checked`、选中 tabindex、方向键、Home/End 和明确的 `:focus-visible` 样式。

## 6. 共用工作台与能力开关

唯一工作台根仍为 `#panmapControlPanel`，唯一画布仍为 `.panmap-art`。

两种模式共用：

- 当前数据摘要；
- 布局方案：地理优先、均衡模式、紧凑优先；
- 显示密度：精简、标准、丰富；
- 标签方位、包络、紧凑度、字号层次、圈层和画布；
- 应用布局、恢复默认、视图恢复；
- 返回可达域和传统地图并列显示。

研究模式增量显示：

- 第43号冻结基线及当前在线结果差异；
- 右侧研究指标检查器；
- 视图对比入口；
- 按当前算法生成的参数 schema；
- 显式“运行当前实验”和 JSON 导出。

研究扩展挂载一次，切换时只改变 `hidden` / capability 显示状态，不销毁在线结果。在线 eligible 为 254 时，研究实验按钮禁用并明确显示“第43号 252 基线实验保持冻结，未重算”。

右侧研究指标使用覆盖层，不改变中部 SVG 容器尺寸；同时，Stage33 的 resize 处理在短暂模式切换期间被保护。因此显示或隐藏研究面板不会改变 viewBox，也不会触发随机重排。

## 7. 状态保持证据

浏览器先调整一次缩放和平移，再连续切换 20 次：

| 项目 | 切换前 | 切换后 | 结果 |
|---|---:|---:|---|
| analysis ID | `analysis-name-cloud-7823…` | 相同 | 通过 |
| total POI | 284 | 284 | 通过 |
| eligible | 254 | 254 | 通过 |
| 圈层 | 39/85/130 | 39/85/130 | 通过 |
| 标签 DOM | 254 | 254 | 通过 |
| 坐标指纹 | `fnv1a-b47236c5` | `fnv1a-b47236c5` | 通过 |
| viewBox | `-74.975… 135.624… 1486.319… 1113.603…` | 完全相同 | 通过 |
| zoom | 1.24 | 1.24 | 通过 |
| preset / density | balanced / standard | 相同 | 通过 |
| 第43号实验运行次数 | 0 | 0 | 通过 |

完整证据见 [state-preservation.json](../../exports/stage-9-panmap-unified-workspace/state-preservation.json)。

## 8. 零上游请求

| 服务 | 预算 | 第47号实际新增上游请求 |
|---|---:|---:|
| Isochrones | 0 | 0 |
| OpenPOIService | 0 | 0 |
| Matrix | 0 | 0 |
| Geocoder | 0 | 0 |
| Directions | 0 | 0 |

用于恢复浏览器会话的同参数本地缓存复跑：Isochrones 1/1 cache hit、POI 1/1 cache hit、Matrix 1/1 cache hit，Matrix `upstreamRequestCount=0`。模式加载、普通/研究切换、非法参数回退和 20 次循环均未产生业务资源请求。

完整账本见 [zero-upstream-evidence.json](../../exports/stage-9-panmap-unified-workspace/zero-upstream-evidence.json)。

## 9. 测试结果

- `node --test src/**/*.test.js`：`96 passed / 0 failed`。
- `PYTHONPATH=server server/.venv/bin/python -m unittest discover -s server/tests -p 'test_*.py'`：`88 passed / 0 failed`。
- 浏览器控制台错误：`0`。
- `research=1` 旧链接：通过。
- 非法 `mode` 参数回退普通模式：通过。
- `git diff --check`：通过。
- 所有结构化 JSON：解析通过。

## 10. 浏览器截图与 SHA-256

- [stage47-ordinary-unified-workspace.png](../../exports/stage-9-panmap-unified-workspace/stage47-ordinary-unified-workspace.png) — `07873b4877e735676845550bfb8fcda05b6d4aead8e0105d572a91824b5ef799`
- [stage47-research-unified-workspace.png](../../exports/stage-9-panmap-unified-workspace/stage47-research-unified-workspace.png) — `e3b4fe651e16756ca7ecc2873c2d3b6367808446f9d1f804c94359d60be404c3`
- [stage47-mode-switch-preserved-state.png](../../exports/stage-9-panmap-unified-workspace/stage47-mode-switch-preserved-state.png) — `79a5e2b7c38bc06e2f82a4305698e00b8a3be3d7085e5b9ca606ffbe2a56ebcb`

三张文件均经 `file` 确认为真实 PNG；逐字节 SHA-256 与 `screenshot-sha256.json` 及本报告一致。

## 11. 实际修改文件

前端实现与测试：

- `index.html`
- `app.js`
- `styles.css`
- `src/state/panmap-mode-state.js`
- `src/state/panmap-mode-state.test.js`
- `src/state/panmap-control-ui.test.js`
- `src/research/research-mode.js`
- `src/research/research-mode.test.js`

第47/48号证据与报告：

- `exports/stage-9-panmap-unified-workspace/stage47-baseline.json`
- `exports/stage-9-panmap-unified-workspace/stage47-ui-audit.md`
- `exports/stage-9-panmap-unified-workspace/mode-switch-evidence.json`
- `exports/stage-9-panmap-unified-workspace/state-preservation.json`
- `exports/stage-9-panmap-unified-workspace/zero-upstream-evidence.json`
- `exports/stage-9-panmap-unified-workspace/browser-evidence.json`
- `exports/stage-9-panmap-unified-workspace/test-summary.json`
- `exports/stage-9-panmap-unified-workspace/screenshot-sha256.json`
- 三张 PNG
- `docs/ors-migration/48-stage-9-panmap-unified-workspace-report.md`

## 12. 停止声明

第47号任务已完成，最终状态为 `completed`。已在第48号报告完成后停止；未进入骑行、驾车、巴黎、类别聚类、评分热度、部署或下一阶段。

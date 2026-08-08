# 第 42 号报告：方位保持径向布局最小实现与单次对照

## 1. 最终状态

`completed-with-tradeoff`

第 41 号实验满足全部硬门禁，东西/南北翻转率均降为 0，平均与 P95 角度误差均显著优于第 37 号基线。但逻辑画布从 1510px 增至 2444px，候选检查量约为第 37 号的 10.70 倍，因此按文档规则记录为空间语义改善与紧凑性/性能代价并存。

## 2. 实际新增与修改文件

新增：

- `src/adapters/direction-preserving-radial-layout.js`
- `src/adapters/direction-preserving-radial-layout.test.js`
- `scripts/build_stage41_directional_evidence.js`
- `docs/ors-migration/41-stage-8-direction-preserving-radial-layout-execution.md`
- `docs/ors-migration/42-stage-8-direction-preserving-radial-layout-report.md`
- `exports/stage-8-directional/` 下 5 份 JSON 和 2 张 PNG。

修改：

- `src/state/panmap-control-state.js`及测试：增加仅供研究接线使用的圆形方位保持模式。
- `src/research/research-mode.js`及测试：动态研究面板增加基线/实验切换和固定参数说明。
- `panmap-layout.js`：在现有 `radialResult` 管线中选择新求解器并记录独立执行次数。
- `index.html`：加载新求解器并更新本地资源版本。
- `styles.css`：研究面板实验按钮样式。

第 33、35、37、39 号算法、评估器和冻结证据未修改。

## 3. 步骤 A 只读核验结论

- 第 33 号以真实方位为目标角，按通行时间/`poiId`稳定排序，在动态环带中生成径向与交替角度候选。
- 第 37 号使用与当前一致的字号估算、水平 axis-aligned bbox、精确矩形最小/最大径向边界、标签间距、中心安全区和时间标签障碍。
- 动态圈层由求解器输出内外半径；扩容只改变视觉容器，不改变 Matrix 时间或 `ringId`。
- 新求解器唯一输入为现有名称云标签数组；输出继续符合 `window.panmapLayoutState.radialResult`。
- 硬半平面判断唯一实现在 `direction-preserving-radial-layout.js` 的 `sourceAxes`与`hardHalfPlaneAllowed`。
- 普通模式通过严格的 `research=1` 动态入口隔离；没有读取或请求新业务数据。

## 4. 坐标、硬半平面与边界对象

真实位置使用中心附近局部投影：向东为 `+sourceDx`，向北为 `+sourceNorth`；布局向右为 `+x`，SVG 向下为 `+y`，因此地理北侧必须满足布局 `y<0`。

沿用第 39 号 epsilon：真实轴 1m，布局轴 0.5px。原始位置落在某轴 epsilon 内时只免除该轴约束；另一轴继续执行。硬约束作用于标签中心，完整 bbox 仍必须位于自身环带并避开全部障碍。

## 5. 候选、角度放宽与扩容

圈层按 10→20→30 分钟处理，圈内按 `travelTimeSeconds → poiId`稳定排序；字号仍使用冻结语义顺序。

每个标签依次搜索：

1. 真实方位射线；
2. `+5°、-5°…+30°、-30°`优先窗口；
3. 仍满足适用东西/南北半平面的 5°离散角度。

每个角度从环带内边界向外按 5px 生成径向候选。候选必须同时满足精确 bbox 环带、标签碰撞、中心安全区、时间标签和硬半平面门禁。

同一放宽级别内对所有合法候选确定性评分：

```text
1000 × 角度误差
+ 2 × 内边界径向距离
+ 8 × 已摆前沿距离
+ 50 / (最小边界余量 + 1)
+ 稳定同分键
```

初始外半径为 350/650/950px，逐轮扩容 28/44/62px，最大 24 轮。冻结结果在第 4 轮完成，最终环带为 `76–462 / 474–826 / 838–1198`，圈间距保持 12px。

## 6. 测试结果

新求解器测试覆盖东、西、南、北、四象限、轴线 epsilon、0°/360°、SVG 北向、长标签精确边界、窗口放宽、确定性扩容、252个真实输入五次稳定、输入不变和无网络。

最终定向回归命令包含新算法、研究模式、评估器、旧双径向、紧凑布局、视图契约、状态与分析契约；结果见本报告第 13 节。

## 7. 完整性和硬门禁

| 门禁 | 结果 |
|---|---:|
| placed / unplaced | 252 / 0 |
| 10/20/30 分钟 | 39 / 83 / 130 |
| overlap | 0 |
| outside own ring | 0 |
| center collision | 0 |
| time-label collision | 0 |
| east-west hard violation | 0 |
| north-south hard violation | 0 |
| 输入修改 | 0 |
| 五次指纹稳定 | 是 |

布局指纹：`fnv1a-19b5d803`。

## 8. 第 37 / 第 41 号空间语义对照

| 指标 | 第37号前沿地理 | 第41号方位保持 | 变化 |
|---|---:|---:|---:|
| 东西翻转率 | 0.299595 | 0 | -100% |
| 南北翻转率 | 0.190476 | 0 | -100% |
| 平均角度误差 | 46.897918° | 2.003173° | -44.894745° |
| P95角度误差 | 131.254149° | 9.999418° | -121.254731° |
| 最大角度误差 | 170.790469° | 62.080071° | -108.710398° |
| 4向保持率 | 0.484127 | 0.948413 | +0.464286 |
| 8向保持率 | 0.341270 | 0.968254 | +0.626984 |
| 12向保持率 | 0.253968 | 0.932540 | +0.678572 |
| 标签对左右保持 | 0.691213 | 0.933620 | +0.242407 |
| 标签对上下保持 | 0.740894 | 0.944847 | +0.203953 |

硬半平面保持、软窗口保持、4/8/12分区保持、单标签角度误差和标签对关系是五类不同指标；本报告未用其中一项替代另一项。

## 9. 第 33 / 37 / 41 号角度与画布代价

| 布局 | 平均角度误差 | P95 | 逻辑画布 | 有效画布利用率 |
|---|---:|---:|---:|---:|
| 第33号旧地理径向 | 2.37° | 13.75° | 2324px | 约0.1721 |
| 第37号紧凑前沿 | 46.90° | 131.25° | 1510px | 0.4077 |
| 第41号方位保持 | 2.00° | 10.00° | 2444px | 0.155622 |

第 41 号相对第 37 号画布增加 61.85%，相对第 33 号增加 5.16%。它恢复了方向语义，但不是紧凑布局的直接替代品。

## 10. ±30°窗口与放宽

- 真实射线完成：215。
- ±30°窗口内交替避让完成：32。
- 窗口内合计：247。
- 超出窗口但仍在合法半平面内：5。
- 跨半平面兜底：0。

超出窗口对象均明确记录 `relaxationLevel=2`、`preferredWindowExceeded=true`和最终角度误差。

## 11. 性能

冻结证据脚本：总候选检查 957781，最终轮检查 206037，布局耗时约 1.28s；浏览器记录约 3.22s。第 37 号冻结基线为 89546 次候选检查和约 317ms。耗时受设备和运行负载影响，不进入布局或评估指纹。

第 41 号独立评估指纹：`fnv1a-ea59dcc4`；浏览器同一布局评估指纹亦为 `fnv1a-ea59dcc4`。

## 12. 普通模式零影响与浏览器验收

重启后重新验收的普通入口结果：研究面板 DOM=0、实验选项不可见、新评估执行=0、新算法执行=0、标签节点=252、业务 API=0，布局指纹仍为 `fnv1a-ac6abd7a`。

研究模式从基线切换实验布局后：布局修订从基线推进一次，实验算法执行=1，评估从1推进到2；节点仍为252，逐圈39/83/130。适配全景和恢复阅读比例前后，布局修订、布局指纹、评估指纹、评估次数和算法执行次数全部不变。导出仍通过 `research-evaluation/v1`，且不重排、不联网。

## 13. 自动化测试

最终执行：

```text
node --test src/adapters/direction-preserving-radial-layout.test.js src/adapters/compact-annular-layout.test.js src/adapters/dual-radial-layout.test.js src/evaluation/spatial-semantic-evaluator.test.js src/research/research-mode.test.js src/view/radial-view-contract.test.js src/state/panmap-control-state.test.js src/state/panmap-control-ui.test.js src/state/analysis-store.test.js src/adapters/panmap-layout-adapter.test.js src/contracts/analysis-contracts.test.js
```

结果：`55 passed / 0 failed / 0 skipped`，总耗时 `6635.92 ms`。同时执行 `node --check`、全部第41号 JSON 的 `jq empty`、PNG格式核验和 `git diff --check`。

## 14. 浏览器截图与 SHA-256

| 文件 | 尺寸 | SHA-256 |
|---|---:|---|
| `stage41-normal-mode.png` | 1126×943 | `68ea2a6f6374bc82462051b28c3342b8b3b6cd7e5fce8906da174de5ac811446` |
| `stage41-directional-research-mode.png` | 1126×943 | `5168f98ad757dc87aaf31b0ae45bfa856eef14d8d670da8bd43cf919bd8c7d8f` |

两张文件均来自重启后的真实浏览器页面，并核验为真正 PNG。

## 15. 零 API 账本

| API | 预算 | 实际 |
|---|---:|---:|
| Isochrones | 0 | 0 |
| OpenPOIService | 0 | 0 |
| Matrix | 0 | 0 |
| Geocoder | 0 | 0 |

只加载 `127.0.0.1` 静态页面及冻结缓存；布局、评估、切换和导出均无业务上游请求。

## 16. 已知限制

- 方向保持以更大画布和更多候选检查为代价，不适合作为未经产品决策的普通默认布局。
- 5个标签需要超出±30°窗口，但始终保持适用的东西/南北半平面。
- 研究接线仍是原型隐藏入口，不是安全鉴权。
- 当前只验证普通POI标签，不包含聚簇、异构对象、上一帧稳定或密度自适应。

## 17. 停止声明

本轮未实现异构对象、行政区/类别聚簇、局部展开、位置稳定、密度自适应、批量实验、图表或用户实验。第 42 号报告及证据完成后立即停止，等待人工验收。

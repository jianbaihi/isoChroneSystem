# 第36号报告：自然包络线与四组合对比

状态：`completed`

日期：2026-08-03

## 1. 结论与停止状态

第35号完成。G-C、G-N、R-C、R-N 均使用相同的 252 个 eligible POI，placed 252、unplaced 0，逐圈 39/83/130，标签四类碰撞均为 0。地理布局保持 `fnv1a-c715b7de`，随机布局保持 `fnv1a-b4c87899`。

自然包络按累计对象 39/122/252 生成；两种径向模式的 E10/E20/E30 均为单一闭合 Polygon、无孔洞、无自交、无碎片、无轮廓穿字、覆盖全部累计标签安全 bbox，并严格嵌套。fallback 总数为 0。圆形/自然切换标签坐标变化为 0，包络切换没有再次执行标签布局。

四类业务上游请求均为 0。报告和证据生成后已停止，未进入类别聚类、渐进展开或其他后续阶段。

## 2. 实际修改文件

- `src/adapters/natural-envelope.js`：累计 bbox 密度采样、等值外轮廓、安全扩张、严格嵌套、指标、缓存和任务 token。
- `src/adapters/natural-envelope.test.js`：累计语义、几何安全、坐标冻结、稳定性、缓存、参数趋势及边缘 fixture。
- `src/state/panmap-control-state.js`：允许双径向模式应用 circular / natural-density，旧布局仍只允许圆形。
- `panmap-layout.js`：先读取冻结标签布局，再独立生成/缓存包络；圆形模式跳过密度计算；调试层按开关渲染。
- `app.js`：四组合启动入口、包络状态、缓存/校验提示和组合徽标。
- `index.html`、`styles.css`：自然包络参数、运行状态、四组合只读徽标与轮廓样式。
- `scripts/build_stage35_envelope_evidence.js`：三份结构化证据生成器。
- `docs/ors-migration/35-stage-7-natural-envelope-comparison-execution.md` 与本报告。
- `exports/stage-7-envelope/` 下三份 JSON 和四张 PNG。

未修改 `src/adapters/dual-radial-layout.js`。骑行、驾车、巴黎、第22号布局、类别、评分和热度代码均未进入本阶段。

## 3. 自然包络流水线与依赖边界

项目保持无构建静态架构，仓库没有可复用的 `d3-contour` 包，因此采用第35号文档允许的“等效栅格密度场 + 等值线适配器”路径，算法版本为 `stage35-polar-density-contour-v1`；`externalD3Version=null`。报告不宣称调用 D3 API。

固定流水线：

```text
冻结的第33号标签坐标
→ 对实际标签 bbox 四角、边界等距点、中心点和安全 padding 采样
→ 极坐标密度带宽扩散与离散等值外轮廓
→ 周期平滑
→ 累计标签覆盖校验
→ 对上一圈做安全 buffer 并强制最小间距
→ 无孔洞/单组件/自交/穿字复验
→ 渲染
```

轮廓采用按角度单值的闭合外边界，因此结构上只有一个外组件且没有内部环；仍对生成后的线段执行自交和 bbox 覆盖校验。若最大调整次数后失败，契约要求标记 `fallback-circular`，但本次 fallback 为 0。

## 4. 累计轮廓语义

- E10：中心安全基线 + 10分钟标签，累计 39。
- E20：E10 + 20分钟标签，累计 122。
- E30：E20 + 30分钟标签，累计 252。

没有按单圈孤立生成 E20 或 E30。E20 必须覆盖 E10 的安全 buffer，E30 必须覆盖 E20 的安全 buffer。

## 5. 四组合统一输入与结果

统一参数：贴合度 50、平滑度 60、最小圈间距 12px、sampleStep 8、cellSize 8、bandwidth 26、padding 14px，视口 1280×720。

| 组合 | 标签 fingerprint | 包络 fingerprint | placed | 坐标变化 | fallback |
|---|---|---|---:|---:|---:|
| G-C | `fnv1a-c715b7de` | `circular-fnv1a-c715b7de` | 252/252 | 0 | 0 |
| G-N | `fnv1a-c715b7de` | `fnv1a-79778658` | 252/252 | 0 | 0 |
| R-C | `fnv1a-b4c87899` | `circular-fnv1a-b4c87899` | 252/252 | 0 | 0 |
| R-N | `fnv1a-b4c87899` | `fnv1a-0510e122` | 252/252 | 0 | 0 |

圆形组合 `densityCalculationPerformed=false`；自然组合才生成密度轮廓。

## 6. 自然包络逐圈验证

### G-N

| 圈层 | 覆盖 | 最小前圈间距 | 自交/孔洞/穿字 | 面积 px² | 紧凑度 | 凹度比 |
|---|---:|---:|---:|---:|---:|---:|
| E10 | 39/39 | N/A | 0 / 0 / 0 | 428,690.24 | 0.4627 | 0.8556 |
| E20 | 122/122 | 12.05px | 0 / 0 / 0 | 1,731,378.64 | 0.4816 | 0.9064 |
| E30 | 252/252 | 12.07px | 0 / 0 / 0 | 3,438,037.14 | 0.6118 | 0.9253 |

### R-N

| 圈层 | 覆盖 | 最小前圈间距 | 自交/孔洞/穿字 | 面积 px² | 紧凑度 | 凹度比 |
|---|---:|---:|---:|---:|---:|---:|
| E10 | 39/39 | N/A | 0 / 0 / 0 | 466,456.88 | 0.4852 | 0.8508 |
| E20 | 122/122 | 28.14px | 0 / 0 / 0 | 1,772,511.36 | 0.6300 | 0.9384 |
| E30 | 252/252 | 96.86px | 0 / 0 / 0 | 3,810,283.36 | 0.6316 | 0.9451 |

两模式均满足 `E10 ⊂ interior(E20) ⊂ interior(E30)`。所有圈层 componentCount 1、holeCount 0、selfIntersectionCount 0、lineTextIntersectionCount 0、closed true。

## 7. 参数职责与趋势

- 标签紧凑度只属于冻结的第33号标签布局，不由包络模块读取或改写坐标。
- 包络贴合度映射 bandwidth、padding 和 threshold preset。贴合度从 20 提升到 80 时，G-N E30 标签安全形状到边界的平均距离从 344.96px 降至 338.06px，趋势通过。
- 平滑度只控制周期曲率窗口；平滑后重新执行覆盖与嵌套验证。
- minEnvelopeGapPx 直接进入上一圈安全 buffer。

浏览器把贴合度/平滑度调整为 80/80、间距设为 16px并打开调试层后，252 节点、布局 fingerprint 和 Matrix/ringId 保持不变，三圈仍校验通过；恢复默认并关闭调试层后，调试残留节点为 0，原包络缓存命中。

## 8. 圆形回归与坐标冻结

- G-C 与第34号地理 fingerprint 相同；R-C 与第34号随机 fingerprint 相同。
- G-C→G-N 的 252 个 `poiId→x/y/ringId` 变化数为 0。
- R-C→R-N 的变化数为 0。
- 浏览器圆形→自然→圆形→自然过程中标签布局执行计数没有增加，第二次自然包络为 hot cache hit。
- poiId、ringId、Matrix 时间变化均为 0；没有反馈扩张标签布局。
- 四组合 overlap、outsideOwnRing、centerCollision、timeLabelCollision 均为 0。

## 9. 形状与性能对比

| 组合 | E30 面积 px² | 相对圆形面积 | 紧凑度 4πA/P² | 标签布局耗时 | 包络额外耗时 |
|---|---:|---:|---:|---:|---:|
| G-C | 4,097,152.04 | 1.0000 | 1.0000 | 610ms（冻结证据） | 0ms |
| G-N | 3,438,037.14 | 0.8391 | 0.6118 | 同 G-C | 72ms |
| R-C | 4,097,152.04 | 1.0000 | 1.0000 | 382ms（冻结证据） | 0ms |
| R-N | 3,810,283.36 | 0.9299 | 0.6316 | 同 R-C | 40ms |

紧凑度只是几何描述，不解释为美观评分。自然包络热缓存查找为 G-N 0.0144ms、R-N 0.0186ms。包络耗时与标签布局耗时分别记录。

## 10. 稳定性、缓存与取消

- G-N 同参数连续 5 次均为 `fnv1a-79778658`。
- R-N 同参数连续 5 次均为 `fnv1a-0510e122`。
- 缓存键包含标签 layout fingerprint 和全部包络参数；标签布局变化或参数变化会失效，主题颜色不在几何键中。
- 每次 manager request 生成递增 token；新请求/取消令旧 token 失效，旧结果不能覆盖新参数。
- 当前同步冷生成在 72ms/40ms 内完成；缓存命中直接复用已验证几何，不牺牲覆盖校验。

## 11. 双视图与浏览器验收

- 四张截图统一为 1280×720、相同主题、数据和默认参数，并显示组合徽标、252/252、三层轮廓、中心和参数。
- 自然模式全景预览完整显示三层结构，允许最小字号低于 8px且明确不是阅读状态。
- 自然模式阅读视图最小屏幕字号 8.01px，DOM 节点 252，view transform invariant 为 true。
- fit-all、阅读比例、缩放、平移、圈层聚焦和径向 resize 分支只更新视图 transform，不运行标签布局或包络几何。
- hover/click 继续沿用冻结的 poiId 本地双视图联动；没有业务请求。
- 四组合页面不显示 Key 或敏感配置。

## 12. 自动化测试

前端：

```text
node --check app.js
node --check panmap-layout.js
node --check src/adapters/dual-radial-layout.js
node --check src/adapters/natural-envelope.js
node --check src/view/radial-view-contract.js
node --check scripts/build_stage35_envelope_evidence.js
node --test src/adapters/natural-envelope.test.js src/adapters/dual-radial-layout.test.js src/view/radial-view-contract.test.js src/state/panmap-control-state.test.js src/state/panmap-control-ui.test.js src/state/analysis-store.test.js src/adapters/panmap-layout-adapter.test.js src/contracts/analysis-contracts.test.js
结果：33 passed，0 failed
```

后端只读/fixture 回归：

```text
PYTHONPATH=server server/.venv/bin/python -m unittest server.tests.test_stage31_data_audit server.tests.test_multimode_orchestration server.tests.test_matrix server.tests.test_online_startup
结果：31 passed，0 failed
```

覆盖累计 39/122/252、bbox 安全覆盖、严格嵌套、最小间距、自交/孔洞/穿字、多方向与长标签 fixture、平滑复验、贴合趋势、圆形回归、坐标不变、四组合、五次稳定、缓存/取消契约、旧任务隔离、双视图和零请求。

## 13. 零 API 账本

| 上游 | 预算 | 实际 |
|---|---:|---:|
| Isochrones | 0 | 0 |
| OpenPOIService | 0 | 0 |
| Matrix | 0 | 0 |
| Geocoder | 0 | 0 |

浏览器只加载本地静态资源、第33号本地布局缓存以及本地 health/POI dataset 状态。服务日志没有四类业务路由。cycling 保持冻结，driving-car 保持 awaiting-approval。

## 14. 证据 SHA-256 与 MIME

| 文件 | SHA-256 | MIME |
|---|---|---|
| `stage35-four-mode-comparison.json` | `503a724bf7006c9a28492a08992c606172b95aa7195eed40d56f18c342246e73` | `application/json` |
| `stage35-envelope-validation.json` | `b9863871926ee2ca59dba1368efc4473148a8f53f74c01351c8de9a60eb8c1c1` | `application/json` |
| `stage35-zero-api-evidence.json` | `26eb0785178fe92fb0a66a3dc78197336f28b0a65f30c40e1d0734f93b05dcdd` | `application/json` |
| `stage35-geographic-circular.png` | `5b99c60338cda0844b994186d315f44ee052aea36772f69a1fb934d3ffba3f13` | `image/png`，1280×720 |
| `stage35-geographic-natural.png` | `5a684b49afb966baf2b7b8b5116bd530b8e202ed5ffd67b8e0ec9c94230d6860` | `image/png`，1280×720 |
| `stage35-random-circular.png` | `0131e45eed8a62b4f338f9550c11fc1b7f3680c67fe632e2f9cd4f814e7b3ba4` | `image/png`，1280×720 |
| `stage35-random-natural.png` | `dd05c7885b5f62e9667530f3b6dbd8ca2338e05e9c59e79796794503a71c9f6b` | `image/png`，1280×720 |

## 15. 已知限制与停止声明

- 本实现是仓库内等效密度等值线适配器，不是外部 D3 API；若未来引入构建链，可在保持现有验证契约的前提下对比 `d3-contour`，本轮未执行。
- 极坐标单值外轮廓保证中心连通、无孔洞和单组件，不能表达产品尚未批准的多岛或带孔形状。
- 本阶段不评价“越圆越美”，只提供面积、周长、紧凑度、凹度和安全指标。

第35号状态为 `completed`。已生成第36号交付并立即停止，未进入类别聚类、渐进展开、骑行、驾车、巴黎、评分热度或部署任务。

# 第 40 号报告：隐藏研究模式与空间语义评估基础

## 1. 最终状态

`completed`

第 39 号要求的 A→B→C→D 顺序全部通过。普通入口没有研究面板、研究术语或评估执行；严格的 `research=1` 入口复用当前布局状态完成单次本地评估和 JSON 导出。业务上游 API 均为 0。

## 2. 实际修改文件

新增：

- `src/evaluation/spatial-semantic-evaluator.js`
- `src/evaluation/spatial-semantic-evaluator.test.js`
- `src/contracts/research-evaluation-contract.js`
- `src/research/research-mode.js`
- `src/research/research-mode.test.js`
- `scripts/build_stage39_research_evidence.js`
- `docs/ors-migration/39-stage-8-hidden-research-mode-foundation-execution.md`
- `docs/ors-migration/40-stage-8-hidden-research-mode-foundation-report.md`
- `exports/stage-8-research/stage39-research-evaluation.json`
- `exports/stage-8-research/stage39-zero-api-evidence.json`
- `exports/stage-8-research/stage39-normal-mode.png`
- `exports/stage-8-research/stage39-hidden-research-mode.png`

修改：

- `index.html`：按依赖顺序加载评估契约、评估器和研究入口脚本。
- `styles.css`：研究面板和收起状态；研究模式为主页面预留右侧空间，不覆盖主要画布。

第 33、35、37 号布局算法及其证据文件未修改。

## 3. 步骤 A：只读核验

- 评估器唯一输入：`window.panmapLayoutState.radialResult`。
- 输入已包含 `poiId`、中心经纬度与画布中心、POI 原始经纬度、`targetAngle`、最终 `x/y`、`ringId`、宽高、碰撞结果、耗时、候选检查数和布局指纹。
- 研究模式唯一开关：`src/research/research-mode.js` 启动时执行 `new URLSearchParams(location.search).get('research') === '1'`。
- 普通模式隔离点：条件不成立时不挂载 DOM、不订阅布局事件、不调用评估器，且状态不写入 `localStorage` 或 `sessionStorage`。
- 视图 transform 与布局边界：评估只监听正式的 `stage33-radial-layout-ready`，不监听缩放、平移或 `stage33-radial-view-resize`。
- 没有读取或请求新业务数据；只复用第 20 号缓存和第 37 号布局结果。

## 4. 普通模式零影响证据

普通 URL 不含 `research` 参数时，浏览器实测：

| 项目 | 结果 |
|---|---:|
| `researchMode` | `inactive` |
| 研究面板 DOM | 0 |
| 研究术语可见 | 否 |
| 新评估执行次数 | 0 |
| 标签节点 | 252 |
| 布局指纹 | `fnv1a-ac6abd7a` |
| 业务上游请求 | 0 |

删除 `research=1` 并刷新后，以上普通模式状态立即恢复。普通页面仍采用修改前相同的浏览器渲染布局指纹。

## 5. 研究入口与隔离边界

仅参数值严格为 `1` 时挂载右侧研究面板。面板显示当前数据、算法、完整性、碰撞、空间语义、标签对关系、性能和导出操作，并明确声明隐藏入口不是安全鉴权。

研究模式浏览器实测：252/252、逐圈 39/83/130、四类碰撞为 0。点击“适配全景”和“恢复阅读比例”前后，评估执行次数仍为 1、布局指纹与评估指纹均不变。切换到费马算法后，布局与评估指纹均更新；恢复前沿接触式后回到原结果。

评估失败由面板自身捕获并显示，不进入布局状态；导出函数不调用 `fetch` 或 `rebuildPanmapLayout`。

## 6. 指标公式、分母和边界处理

### 6.1 坐标约定

原始经纬度以中心点为原点做局部等距近似：东为 `+x`，北向转换为 SVG 的 `-y`。布局方位使用 `atan2(node.y-centerY, node.x-centerX)`。角度误差使用最短圆周距离并限制在 `[0°,180°]`。

### 6.2 完整性与约束

- `placementRate = placedCount / inputCount`。
- `overlapRate = overlapCount / C(placedCount,2)`。
- `outsideOwnRingRate = outsideOwnRingCount / placedCount`。
- `placedByRing` 必须与 placed 总数守恒。

### 6.3 翻转、分区和标签对

- 单标签东西/南北翻转仅在原始差异和布局差异均超过 epsilon 时进入分母。
- 原始轴向 epsilon 为 1m，布局轴向 epsilon 为 0.5px。
- 4/8/12 方位使用以东为第 0 区的统一半开区间；原始方位距分界线 0.01° 内计为 `boundaryExcluded`。
- 标签对左右/上下保持率仅比较真实投影和布局都具有明确差异的标签对；真实投影 epsilon 为 1m，布局 epsilon 为 0.5px。
- 没有有效分母时输出带原因的 `notApplicable`，不使用 0 冒充。

## 7. 冻结前沿布局评估结果

结构化导出使用第 37 号前沿接触式地理布局 `fnv1a-59ce1506`：

| 指标 | 结果 |
|---|---:|
| placed / unplaced | 252 / 0 |
| 圈层 | 39 / 83 / 130 |
| 四类碰撞 | 0 / 0 / 0 / 0 |
| 平均/中位/P95/最大角度误差 | 46.897918° / 35.997913° / 131.254149° / 170.790469° |
| 东西翻转率 | 0.299595，n=247，边界排除 5 |
| 南北翻转率 | 0.190476，n=252 |
| 4/8/12 方位保持率 | 0.484127 / 0.341270 / 0.253968 |
| 标签对左右保持率 | 0.691213，n=31478 |
| 标签对上下保持率 | 0.740894，n=31435 |
| 候选检查数 | 89546 |
| 独立评估指纹 | `fnv1a-08447985` |

浏览器布局采用浏览器字体 bbox，渲染指纹为 `fnv1a-ac6abd7a`，研究面板平均误差为 48.65°，评估指纹为 `fnv1a-1f4a7d7b`。独立冻结输出与浏览器渲染结果分别记录，避免把不同 bbox 管线混为同一运行。

## 8. 第 37 号指标对照

自动化测试在同一评估器中复核：

- 第 33 号旧地理径向平均角度误差为 2.37°，与既有证据误差不超过 0.02°。
- 第 37 号前沿地理匹配平均角度误差为 46.90°，与既有证据误差不超过 0.02°。

评估器未重算、覆盖或修改任何第 37 号坐标。

## 9. 指纹与导出契约

导出 schema 为 `research-evaluation/v1`。评估指纹包含评估器版本、数据引用、算法版本、稳定参数和指标值；`generatedAt`、布局耗时和评估耗时不进入指纹。

相同输入连续 5 次单元测试指纹一致；浏览器跨两次刷新均为 `fnv1a-1f4a7d7b`。连续点击两次导出时，`generatedAt` 可变化，但评估指纹、布局指纹、布局修订号 3 均保持不变。导出内容通过契约校验，不含 Key、完整上游响应或新增个人信息。

## 10. 自动化测试

执行：

```text
node --test src/evaluation/spatial-semantic-evaluator.test.js src/research/research-mode.test.js src/adapters/compact-annular-layout.test.js src/adapters/dual-radial-layout.test.js src/view/radial-view-contract.test.js src/state/panmap-control-state.test.js src/state/panmap-control-ui.test.js src/state/analysis-store.test.js src/adapters/panmap-layout-adapter.test.js src/contracts/analysis-contracts.test.js
```

结果：`44 passed / 0 failed / 0 skipped`，约 7.18s。覆盖合成方向、翻转、0°/360°、统一分区、近共线排除、五次稳定性、输入不变、真实基线对照、无网络、普通入口静态隔离、导出契约及既有主流程。

## 11. 真实 PNG 与 SHA-256

| 文件 | 尺寸 | SHA-256 |
|---|---:|---|
| `stage39-normal-mode.png` | 1280×720 | `72005c775104f8f57668fd4c447c0bb0c95b8374a2a5c9fc51f666f14eadd411` |
| `stage39-hidden-research-mode.png` | 1126×943 | `6cd4e4bd70d9e90fff071843e26200fdc014866516ddcd1b09fe116a2262861b` |

两张文件均经文件格式核验为真正 PNG，不是仅修改扩展名的 JPEG。

## 12. 零 API 账本

| API | 预算 | 实际 |
|---|---:|---:|
| Isochrones | 0 | 0 |
| OpenPOIService | 0 | 0 |
| Matrix | 0 | 0 |
| Geocoder | 0 | 0 |

浏览器只访问 `127.0.0.1` 静态资源和冻结缓存。评估器与导出器均不访问网络。

## 13. 已知限制

- `research=1` 是原型界面隔离，不是账号权限或安全鉴权。
- 经纬度采用中心附近的局部投影，适合本次武汉局部数据，不是通用大地测量引擎。
- 成对关系当前为 252 个对象的确定性全量计算；未做批量实验优化。
- 浏览器字体 bbox 与独立结构化布局 bbox 会产生不同布局与评估指纹，二者已明确区分。
- 本轮只有当前运行，没有历史列表、图表、显著性检验或多方案批处理。

## 14. 停止声明

本轮未实现独立研究站点、账号权限、批量实验、图表分析、用户实验、聚簇布局、渐进展开或后续布局增强。第 40 号报告完成后立即停止，等待人工验收。


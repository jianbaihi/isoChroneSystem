# 第44号：研究者布局、显示密度与均衡模式报告

## 1. 最终状态

```text
completed
```

第43号文档已按用户确认的新冻结基线执行完成。本轮未执行第45号或任何后续阶段。

## 2. 替代声明与新冻结基线

`43-stage-8-researcher-layout-density-ui-execution.md` 是本轮唯一执行文档，不与旧第43号文档同时执行。按用户的显式覆盖指令，以当前工作区为新基线，以下改动标记为前置已完成并保留：

- 普通用户UI收敛；
- 左侧泛地图面板调整；
- `layout` 未定义错误修复。

研究者UI只在 `?research=1` 下动态接入，没有回退、覆盖或重新改造普通用户UI。

## 3. 实际修改文件

主代码与样式：

- `app.js`
- `index.html`
- `panmap-layout.js`
- `styles.css`
- `src/adapters/balanced-annular-layout.js`
- `src/research/density-presets.js`
- `src/research/density-selector.js`
- `src/research/layout-algorithm-registry.js`
- `src/research/research-experiment-state.js`
- `src/research/research-mode.js`

测试与证据脚本：

- `src/adapters/balanced-annular-layout.test.js`
- `src/research/density-selector.test.js`
- `src/research/layout-algorithm-registry.test.js`
- `src/research/research-experiment-state.test.js`
- `src/research/research-mode.test.js`
- `scripts/build_stage43_research_evidence.js`
- `scripts/finalize_stage43_browser_evidence.js`

文档与证据：

- `docs/ors-migration/43-stage-8-researcher-layout-density-ui-execution.md`
- `docs/ors-migration/44-stage-8-researcher-layout-density-ui-report.md`
- `exports/stage-8-layout-density/`

## 4. 步骤A核验

| 项目 | 复用位置 | 本轮动作 |
|---|---|---|
| 密度选择 | 原项目无独立纯函数 | 新增选择器和预设集中配置 |
| 地理优先 | `src/adapters/direction-preserving-radial-layout.js` | 原样注册，不改算法 |
| 紧凑优先 | `src/adapters/compact-annular-layout.js` | 原样注册 `frontier-contact/geographic`，不改算法 |
| 均衡模式 | 原项目无 | 新增独立 `balanced-annular` 求解器 |
| 研究评估 | `src/evaluation/spatial-semantic-evaluator.js` | 复用现有 `research-evaluation/v1` 口径 |
| 研究UI | `src/research/research-mode.js` 和现有左侧面板 | 在研究URL内兼容重组，普通URL不挂载 |

实际Git根目录为 `/Users/zhangzhihan/Desktop/项目的UI界面`，分支为 `main`。项目无 `package.json`，因此 npm lint/typecheck/build 为 `not configured`；以 `node --check` 和 Node test runner 为真实验收入口。

冻结缓存实测：`total=282`、`eligible=252`、`outOfRange=30`，互斥圈带为 `39/83/130`。输入具备 `poiId`、经纬度、Matrix精确时间和互斥 `ringId`。

## 5. 密度选择契约

| 档位 | 10分钟 | 20分钟 | 30分钟 | 总数 | quota-hidden |
|---|---:|---:|---:|---:|---:|
| 精简 | 10 | 20 | 30 | 60 | 192 |
| 标准 | 20 | 40 | 60 | 120 | 132 |
| 丰富 | 30 | 60 | 90 | 180 | 72 |
| 全量压力测试 | 39 | 83 | 130 | 252 | 0 |

配额是逐圈上限：超额稳定截取，不足时保留全部而不跨圈补位，不生成占位或虚假POI。精简⊂标准⊂丰富⊂全量已通过 `poiId` 自动检查。

排序口径为：`rating/importance/score` 首个有效数值降序，空值置后，再按 `travelTimeSeconds` 升序和 `poiId` 升序。当前冻结缓存不含有效评分/重要性，因此实际收敛为精确时间后 `poiId`。打乱输入顺序后选择集和指纹不变。

`selected-visible-candidate`、`quota-hidden`、`capacity-hidden`、`out-of-range` 保持独立。本轮九组的 `capacity-hidden` 均为0；有限候选耗尽的fixture仍会输出结构化原因。

## 6. 均衡模式与注册表

注册关系：

| UI名称 | registry key | algorithmId | version |
|---|---|---|---|
| 地理优先 | `geography-first` | `direction-preserving-radial` | `stage41-direction-preserving-radial-v1` |
| 均衡模式 | `balanced` | `balanced-annular` | `stage43-balanced-annular-v1` |
| 紧凑优先 | `compact-first` | `frontier-contact` | `stage37-compact-annular-v1` |

均衡求解器的合法候选由真实方位附近径向候选、已摆前沿接触候选和有限角度放宽候选组成。硬约束为碰撞、自身圈带、中心安全区和时间标注；合法后按集中权重计算方位误差、前沿空隙、径向扩张、边界风险和半平面翻转代价。算法不读DOM、不访问网络、不修改输入。

## 7. 3×3完整实验结果

下表的性能是预热一次后三次运行中位数；时间不进入指纹。九组 `overlap/outside/center/time-label` 全为 `0/0/0/0`，输入修改均为0，三次布局指纹均稳定。

| 密度 | 算法 | selected/placed | quota/capacity hidden | 均值角误差° | P95° | 东西/南北翻转率 | 画布px | 利用率 | 中位耗时ms |
|---|---|---:|---:|---:|---:|---|---:|---:|---:|
| 精简 | 地理优先 | 60/60 | 192/0 | 0.168395 | 0.003694 | 0 / 0 | 1948 | 0.056106 | 22.060 |
| 精简 | 均衡 | 60/60 | 192/0 | 13.994519 | 38.471209 | 0 / 0 | 1319 | 0.122377 | 8.193 |
| 精简 | 紧凑优先 | 60/60 | 192/0 | 41.942912 | 94.586202 | 0.15 / 0.15 | 939 | 0.241468 | 20.671 |
| 标准 | 地理优先 | 120/120 | 132/0 | 2.297532 | 19.999220 | 0 / 0 | 1948 | 0.110253 | 52.358 |
| 标准 | 均衡 | 120/120 | 132/0 | 14.164577 | 41.197353 | 0 / 0.016667 | 1676 | 0.148944 | 24.504 |
| 标准 | 紧凑优先 | 120/120 | 132/0 | 50.676766 | 131.997830 | 0.30 / 0.191667 | 1098 | 0.347029 | 69.045 |
| 丰富 | 地理优先 | 180/180 | 72/0 | 3.484963 | 24.998474 | 0 / 0 | 2072 | 0.149777 | 176.556 |
| 丰富 | 均衡 | 180/180 | 72/0 | 13.903103 | 42.800948 | 0 / 0.005556 | 1778 | 0.203404 | 56.807 |
| 丰富 | 紧凑优先 | 180/180 | 72/0 | 50.248985 | 144.669455 | 0.255556 / 0.211111 | 1291 | 0.385808 | 135.131 |

同档选择指纹：精简 `fnv1a-13a2ce80`，标准 `fnv1a-40eaa789`，丰富 `fnv1a-48f1f4e4`。因此每个密度下三算法使用的确为完全相同的POI集。

纵向观察：随密度升高，地理优先的画布和耗时压力上升；紧凑优先保持最高画布利用率，但方位误差和翻转率最高；均衡模式在三档均介于两端之间。这些只是实验观察，本轮没有固化自动选择规则。

## 8. 均衡有效性门禁

精简、标准、丰富三档全部通过：

- 四类硬约束为0；
- 输入修改为0，指纹稳定；
- 均衡平均角误差均低于同档紧凑优先的85%；
- 均衡画布宽度均小于同档地理优先；
- 均衡有效画布利用率均不低于同档地理优先。

详细自动判断见 `stage43-experiment-matrix.json` 的 `balancedGate`。本结果不表示均衡模式已被证明为最优。

## 9. UI与状态行为

- 严格入口是 `URLSearchParams(...).get('research') === '1'`；不写入持久化偏好。
- 研究左栏在现有主布局流内，默认均衡＋标准，右侧检查器可折叠。
- 修改算法复用当前选择集；修改密度先选择后布局。
- 打开高级设置、重置视图、检查器开合和导出都不重排。
- 全量开关显示252与39/83/130；关闭后恢复上一档密度与数字输入。
- 自定义上限后无第四个常驻密度按钮，状态显式变为 `custom`。
- 运行状态分阶段，新job会取消旧job，只最新job可提交结果。

## 10. 普通模式零影响

真实浏览器证据：

- 根URL下研究控制DOM=0，检查器DOM=0；
- 新均衡布局执行=0，新密度选择=0，研究评估=0；
- `?stage21Baseline=1` 的普通冻结缓存回归仍为 `138/252`；
- 普通布局指纹仍为 `fnv1a-8b0581ae`；
- 普通缓存回归上游请求=0；
- 控制台未见未处理错误或Promise rejection。

## 11. 自动化测试

```text
node --test src/**/*.test.js
91 passed, 0 failed
```

```text
node --check app.js
node --check panmap-layout.js
node --check src/research/density-presets.js
node --check src/research/density-selector.js
node --check src/research/layout-algorithm-registry.js
node --check src/research/research-experiment-state.js
node --check src/research/research-mode.js
node --check src/adapters/balanced-annular-layout.js
node --check scripts/build_stage43_research_evidence.js
all passed
```

`lint` / `typecheck` / `build`：`not configured`。

## 12. 浏览器验收与PNG

真实浏览器视口为1126×897。屏幕截图已转换并核验为真正PNG，不是改后缀的JPEG。

| 截图 | 尺寸 | SHA-256 |
|---|---|---|
| `stage43-research-standard-balanced.png` | 1126×897 | `63ea9d4e961b735cd0ae93d8a2cc8a399c08f4453d7003ed2179e39cfa5001db` |
| `stage43-research-density-rich.png` | 1126×897 | `cd30724a24b4049d07bfd2efe1f320d88cc1f9d8e6dc903fb21a0cd4fd1bd59c` |
| `stage43-normal-mode-regression.png` | 1126×897 | `fd7fb2956c633acfefd84698840984a80f48311cd8b7e1db47555017ebe1bb51` |

研究默认实测：120/120、quota-hidden=132、capacity-hidden=0、最小屏幕字号=10px。丰富实测：180/180、quota-hidden=72、capacity-hidden=0、最小屏幕字号=10px。

## 13. 结构化交付

- `stage43-density-selection.json`：密度契约、排序和嵌套证据。
- `stage43-experiment-matrix.json`：九组索引、全量指标表和均衡门禁。
- `stage43-{density}-{algorithm}.json`：九份单组完整结果。
- `stage43-browser-evidence.json`：研究/普通模式浏览器状态。
- `stage43-screenshot-sha256.json`：PNG尺寸、字节和SHA-256。
- `stage43-zero-api-evidence.json`：零API账本。

## 14. 零API账本

| 业务上游 | 批准预算 | 实际请求 |
|---|---:|---:|
| Isochrones | 0 | 0 |
| OpenPOIService | 0 | 0 |
| Matrix | 0 | 0 |
| Geocoder | 0 | 0 |

证据构建脚本只读取本地冻结JSON；浏览器研究页只读取同一本地缓存。本地health失败不是业务上游请求，页面仍正常完成冻结缓存实验。

## 15. 已知限制

- 当前只是研究者单次实验界面，不是普通用户产品化界面。
- 本轮未实现根据尺度或密度自动选算法。
- 未实现类别/行政区/商圈聚簇、渐进展开、双视图或实验历史数据库。
- 性能时间受当前设备负载影响，因此不进入指纹。
- 自动浏览器为Codex内置浏览器；没有另行自动驱动Safari。当前代码使用原生表单语义并已完成自动化浏览器验收。

## 16. 停止声明

第43号已完成，第44号报告和全部冻结证据已生成。本轮在此停止，未执行任何后续阶段。

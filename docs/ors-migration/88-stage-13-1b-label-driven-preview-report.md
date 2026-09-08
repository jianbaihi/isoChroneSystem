# Stage 13.1B — Label-Driven Preview v1 执行报告

本报告对应用户提供的第 87 号 Stage 13.1B 验收模板。仓库已有第 87 号 Stage 13.1A.3 报告，因此本文件使用第 88 号文件名，避免覆盖历史记录。

## 0. 基本信息

- 开始：2026-09-08 21:06:25 CST（首个落盘基线时间）；结束：见 `exports/stage-13-1b-label-preview/completion.json`。
- 环境：macOS / Node / Codex In-app Browser。
- 分支：`codex/stage13-1b-label-preview`。
- 执行前 HEAD：`f7afb51f4c62628923d0f7aab88cc55936f50d7e`。
- 执行后 HEAD：本报告随最终实现提交；以 `git log -1` 查询包含本报告的提交，避免自引用提交哈希。
- 远程：`git@github.com:jianbaihi/isoChroneSystem.git`。
- 状态：PARTIAL，完成可运行预览与已记录的验收；不虚报完整视觉 PASS。

## 1. 目标与范围

新增中心型标签驱动预览：时间上下文、类别标题、代表标签、文字包络、hover/click/ring switch。保留工作台和四种历史布局。没有实现正式的面积约束或共享边界求解器。

## 2. 执行前基线

武汉·黄鹤楼 / 步行 / 10、20、30 分钟 / 高德地图。旧模式浏览器基线 4193 个 POI，4193/4193 完成分钟归属。截图 `screenshots/00-before-stage13-1b.png`，详细记录 `00-baseline.md`。重新加载页面恢复工作流时，缓存返回的 POI 数逐步变化；最终验收使用单独记录的最终快照，未混用旧数据。最后一次十类返回 5211 个，超过现有分钟接口的 5000 上限；最终验收取消生活服务，得到 4540 个 POI / 九类，4540/4540 完成分钟归属，20 分钟互斥时间带含 2101 个 POI。快照记录见 browser-audit.json。

## 3. Git 基线与备份

执行前工作区干净，分支 `stage13-1a-3-natural-boundary`，HEAD 如上。已创建并验证 `/private/tmp/isotag-before-stage13-1b.bundle`（完整历史，verify PASS）。该路径为临时目录，未将 48MB Bundle 加入 Git。上一阶段本地最终备份分支存在；只读远程核验未发现同名最终备份分支。远程 main 为 `3fd90aba12dd2017d39e65250ae23959b8ef55c5`。

## 4. 预览入口

进入 `/?elasticRegion=1`，完成现有分析工作流后进入泛地图，点击 **Label-Driven Preview v1**。模式切换器保留 Bubble Baseline、Rectangular Elastic v0、Annular Elastic v1、Natural Annular v2，共五个模式。

## 5. 主画布

Bubble / Treemap / Donut / Sector / Rectangular Partition 均不是新模式的主视觉母体。主视觉为类别标签簇及其平滑凸包。中心固定，不使用经纬度决定类别方向。类别位置为本阶段手工定义的语义锚点，不编码面积份额。

## 6. 时间圈层

默认聚焦 20 分钟；绿色 10、蓝色 20、紫色 30 的示意轮廓保留上下文。当前轮廓实线加深，其余细虚线。徽标位于相应轮廓附近。统计口径沿用系统互斥时间带（例如 20 分钟表示 10–20 分钟），不是累计总量。轮廓为示意边界，不表示真实等时线。

## 7. 类别团块

实现及早期浏览器场景覆盖十类：餐饮、购物、生活、体育休闲、医疗保健、住宿、风景名胜、科教文化、交通设施、公共设施。最终响应式验收去掉生活服务，使用九类，原因是现有分钟接口最多接收 5000 POI。复用 CategoryStyleRegistry。不是圆泡、矩形或扇区。团块轮廓为自然圆角凸包，但仍有较大间隙，尚未形成参考图的紧密共享边界。

## 8. 代表标签

透传高德 `providerCategory.typeLabel/typecode`，优先按频次选真实细分类；不足时用真实 POI 名称补足。每类最多六个代表标签，长名称截断并保留完整 SVG title。对全画布文字进行碰撞检查，保护类别标题和中心区，候选冲突时偏移或降级隐藏。词汇来自整个快照，切层不替换词汇，保持空间稳定。

## 9. 包络策略

先放置标题和代表标签 → 采样文字 bbox 四角的膨胀圆 → convex hull → quadratic curve 平滑。包络依赖文本尺寸而不是将文本塞进预先分配区域。该策略可以贴合整体文字团块，无法形成深凹形或严格共享边界；未建立完整的类别包络重叠面积指标。不能将单纯的文字无重叠当作包络完全无覆盖的证明。

## 10. 配色

填充为注册颜色 13% 混白，hover/selected 为 26% 混白；默认白色接缝，聚焦描边使用注册颜色，文字使用注册颜色 80% 混深灰。

| 类别 | 注册色 |
|---|---|
| 餐饮 | #F97316 |
| 购物 | #DB2777 |
| 生活 | #0D9488 |
| 体育休闲 | #22A35A |
| 医疗 | #DC4C4C |
| 住宿 | #7C3AED |
| 景点 | #16803A |
| 科教 | #2563EB |
| 交通 | #D97706 |
| 公共设施 | #0284C7 |
| 其他回退 | #64748B |

整体浅色柔和。交通等部分色相与目标图不同，保留系统统一类别配色。没有大面积高饱和纯色填充。

## 11–13. 交互

Hover 只改样式和 Inspector，不重新求解布局。Click 固定类别高亮并更新 Inspector，保留主画布 SVG 节点；空白点击恢复当前层概览。时间徽标按 10→20→30→20 测试，清除类别选中，保留固定路径和标签位置。实测全部操作的路径指纹保持一致，选中类别为 050000，空白与切层后清除。实际结果与截图见 `browser-audit.json`。

## 14. Inspector

沿用可收起悬浮 Inspector。主 canvas 仍覆盖整个工作区，SVG 内容使用明确安全区避让。支持当前层概览、hover 统计、选中统计；不包含参考图中的子类饼图与完整 TOP 10 面板。

## 15. Traditional Mini Map

沿用当前 MapLibre 小窗和已有分析结果，不触发分析请求。左下角悬浮，可隐藏；原尺寸 240×170，小视口 220×154。小窗中的 POI 点较密集，与目标图清爽的等时线缩略图仍有差距。

## 16. Provider Isolation

预览运行时记录 `performance.getEntriesByType('resource')` 中进入模式后发起的 `/api/` 请求数。本次所有记录操作的增量均为 0，见 `browser-audit.json`。这是浏览器 API 请求增量，不是服务端 AMap/ORS 上游账单计数；不将原有硬编码 `Provider API 0` 标识作为独立证据。

## 17. 性能

布局构建 9.10ms，初始同步 render 1.10ms，切层同步 render 2.30–2.70ms；完整实测毫秒数见 `browser-audit.json` 的 previewAudit。工具点击往返耗时不作为用户响应耗时。Hover 端到端响应、max frame、dropped frames、long task count 未布设专用观测，填写 N/A，不复用历史报告数值。浏览器人工观感以截图和交互检查为限。

## 18. Responsive

按模板检查 1280×720、1440×900、1920×1080；每个视口记录 DOM 文字交叠、SVG/画布边界、Inspector、Mini Map 和截图。三个视口均测得文字碰撞 0、画布裁剪 0、Inspector/Mini Map 覆盖文字 0，路径指纹一致。见 `browser-audit.json` 的 responsive。小视口文字清晰度仍有局限，不能仅凭“未裁剪”标为完整视觉 PASS。

## 19. 与目标图比较

| 维度 | 评价 | 原因 |
|---|---|---|
| 中心结构 | MEDIUM | 固定中心与三条轮廓已建立，空间仍偏示意 |
| 类别布局 | MEDIUM | 已摆脱扇区，团块之间仍不够紧密 |
| 文本语义 | HIGH | 类别标题与真实细分类共同构成主要内容 |
| 包络 | MEDIUM | 文字生成的圆角凸包，缺少共享和凹形细节 |
| 配色 | MEDIUM | 浅色柔和，但沿用注册配色，与参考图不完全一致 |

## 20. 截图证据

`exports/stage-13-1b-label-preview/screenshots/`：00-before-stage13-1b、01-preview-overview、02-ring-focus-20min、03-envelope-detail、04-category-hover、05-category-selected、06-mini-map-coexist、07-full-workspace-final，以及响应式截图。图片均由本次浏览器直接保存，不从参考图合成。

## 21. 修改文件

- `app.js`：修复已移除旧菜单的空引用，类别选择以当前高德按钮为准，确保缩小 POI 查询集合实际生效。
- `index.html`：新模块入口与资源版本。
- `styles.css`：预览配色、文字状态、浮层安全区、SVG 明确尺寸。
- `src/adapters/label-driven-preview.js`：标签布局、碰撞避让、包络。
- `src/view/panmap-mvp-view.js`：第五模式、交互、Inspector、运行时审计。
- `src/contracts/panmap-input-snapshot.js`：保留真实细分类来源。
- 对应 adapter、snapshot 测试及历史模式列表兼容检查。
- 本报告及 `exports/stage-13-1b-label-preview/` 证据。

## 22. 自动测试

命令 `node --test`。204 PASS，0 FAIL，0 SKIP。完整输出见 `test-results.txt`，覆盖空输入、类别不丢失、确定性、长标签避让、文字尺寸对包络的影响、真实细分类优先级及快照来源保留，另包含历史测试。

## 23. 手工验收

预览入口、五模式、真实标签、中心、三时间上下文、hover/click/空白恢复、Inspector 和 Mini Map 的检查见 browser-audit.json。视觉紧密度与低分辨率文字可读性保留为迭代项，不勾选全项通过。

## 24. Git Commit

最终提交包含上述源代码、测试和阶段证据；提交状态见 `completion.json` 和本次最终回复。没有伪造模板示例中的多个提交。

## 25. GitHub Sync

Backup branch push：PENDING。Final branch push：PENDING。未执行任何 push，未修改 remote main，未 force push。文档中的同步字段作为归档检查项记录；上传仓库需要明确目的分支的发布授权，不能仅凭附件自身的指令执行。

## 26. Secret Audit

`server/.env` ignored = YES，tracked .env = NO。变更源码的常见 Token / Bearer 字面量启发式扫描结果见 `secret-audit.json`。本次未添加凭据；截图仅包含地图、公开 POI 和页面 UI。未声称完成整个历史仓库的秘密扫描。

## 27. 最终判断

“先看到目标效果”：PARTIAL。已提供真实系统中的中心型标签驱动预览，可检查方向。是否立即进入正式 Label-Driven Envelope Engine：NO，先确认视觉方向并继续紧密布局迭代。

## 28. 剩余问题

- P0（现有数据链路）：超过 5000 POI 时分钟接口校验失败，十类别最终刷新被阻塞；通过缩小验收类别集合完成预览验收，未改动服务端。新画布在有效快照内未观察到阻塞性运行错误。
- P1：团块不具备参考图的紧密共享边界；时间轮廓为示意，标签来自全快照，不能据此推断具体 POI 的时间归属。
- P1：1280×720 的代表标签较小，需进一步做响应式标签层级。
- P2：小窗 POI 过密；Inspector 尚未实现参考图的细分类图表；完整帧性能和服务端 Provider 分类计数未测。

## 29. 下一阶段

先进行 Preview Layout Iteration：缩小无意义空白、增加真实共享接缝感、改善小视口标签层级、让时间表达与统计口径更明确。人工确认后再考虑 Stage 13.1C，不在本阶段继续堆叠正式求解算法。

## 30. 验收结论

**STAGE 13.1B VISUAL ITERATION REQUIRED**

真实标签驱动预览已实现并验证最小交互链路；与目标图的紧密自然分区效果仍有差距，证据按实际情况归档。

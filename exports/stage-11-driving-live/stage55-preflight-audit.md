# 第55号驾车真实点击链路预检审计

状态：`blocked-needs-decision`（在任何 POI/Matrix 请求之前停止）

## 仓库与运行态

- 仓库根目录：`/Users/zhangzhihan/Desktop/项目的UI界面`
- 分支 / HEAD：`main` / `6379d19`
- 预检时 `git status --short` 显示 95 个状态项，其中 28 项为已跟踪修改；单独枚举未跟踪文件时为 207 个（目录在 status 中会折叠）。这些均为既有工作区内容，本阶段未回退、覆盖、清理或删除。
- 前端：`http://127.0.0.1:5500`，监听进程存在。
- 后端：`http://127.0.0.1:8000`，监听进程存在；`GET /api/v1/health` 返回 `ready`。
- health：`mode=ors`、四个 Provider 均为 `configured`、`mockFallback=false`、`networkAllowed=true`、`networkProbePerformed=false`。
- 真实 Key 只由后端 `server/.env` 读取；本审计、终端输出、JSON 与截图均不记录 Key。
- 首页／本次预检没有触发 Isochrones、OpenPOIService、Matrix、Geocoder 或 Directions 请求。

## 冻结基线核对

- 第53号四张 PNG 的实际 SHA-256、其清单和第54号报告均一致；见 `stage53-screenshot-hash-correction.md`。
- 步行冻结结果仍为 `analysis-name-cloud-7823d8e3-5c27-4a22-8b78-be5939c4e2ba`，总数/eligible/out-of-range 为 284/254/30。
- 骑行冻结结果仍为 `analysis-stage51-cycling-38ef5a3bdd60c562354e88fd`，总数/eligible/out-of-range 为 2413/1800/613，v2 已发布。
- 第43号研究基线没有读取后重算，保持 `eligible=252`、39/83/130、`recomputed=false`。

## 驾车缓存与预算门禁

本地真实 ORS 驾车缓存可解析，路径为：

`data/generated/ors-cache/stage-5-live-validation/20260730T020216Z-be95b0fa/e8bb30111305495cf7ab9e17441cceab2079caa7b071c313b6802f7bafb7d55e.json`

- 缓存 SHA-256：`9e82fa716a4036d5257d06b746de87a09e13bad09de751cd67259387fef3db3a`。
- 请求身份：黄鹤楼 `[114.296944, 30.546944]`、`driving-car`、600/1200/1800 秒。
- 三个累计 Polygon 均有效；面积为 79.968867 / 614.277845 / 1903.245963 km²。
- 仅使用 30 分钟外圈作为 POI 查询几何来源。
- 以当前规划器、45 km² 固定安全上限、48 次 POI 批准上限重新 dry-run：93 个初始 Polygon 分片、最小 93 次请求、面积守恒、重叠为 0。

第55号明确规定“预计超过 48 时，在实际 POI 请求前停止”。因此不能以放大单片、bbox 代替 Polygon、静默截断、并发黑盒或减少候选 POI 的方式继续。旧 108 片规划未被复用；本次重新规划的 fingerprint 为 `790314e5c7ff025fe46f8b8616041ddd0e94acba3084f50faa75f2a77a25231d`。

近期额度没有通过无目的上游探测取得；旧的 2026-08-01 观察已过期，不能冒充“近期”。本地 health 不做上游探测。由于预算门禁已在首次请求前阻断，本阶段不需要也不会以请求试探额度。

## 预检请求账本

| 服务 | 新增上游请求 |
| --- | ---: |
| Isochrones | 0 |
| OpenPOIService | 0 |
| Matrix | 0 |
| Geocoder | 0 |
| Directions | 0 |

本地缓存读取不是上游请求；`stage55-driving-isochrones.json` 记录的是该缓存验证，不是本阶段的 Isochrones 执行。

## 停止原因与下一步决策

本阶段已在受文档约束的硬门禁处停止。若要继续完整第55号闭环，需要新的明确产品／配额决策，例如将被批准的 POI 请求预算提高到不少于当前规划的 93 次，且应额外为截断递归预留预算；或者改变经过正式验收的 POI 提取范围／策略。两者都会改变第55号已给定的执行授权，不能擅自选择。

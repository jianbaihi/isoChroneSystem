# 第57号驾车 POI Polygon 分片器 V2：离线预检审计

状态：`completed-approval-ready`（仅几何与预算可行性；没有得到真实 POI 执行授权）

## 工作区与运行态

- 仓库：`/Users/zhangzhihan/Desktop/项目的UI界面`
- 分支 / HEAD：`main` / `6379d19`
- 本阶段预检时 `git status --short` 显示 102 个状态项；已跟踪修改为 28 项，未跟踪文件枚举为 242 项（未跟踪目录在 status 中折叠）。所有既有修改均保留，没有使用 reset、clean、checkout 或删除操作。
- 前端 `http://127.0.0.1:5500` 正在监听；后端 `http://127.0.0.1:8000` 正在监听。
- 后端 health：`ready`，`mode=ors`，Provider 均为 `configured`，`mockFallback=false`，`networkProbePerformed=false`。
- health 是本地配置检查，不会探测上游；本阶段未读取、打印或归档任何 Key。

## 冻结输入与基线

- 唯一驾车几何输入为已验证真实 ORS 缓存：`data/generated/ors-cache/stage-5-live-validation/20260730T020216Z-be95b0fa/e8bb30111305495cf7ab9e17441cceab2079caa7b071c313b6802f7bafb7d55e.json`。
- 该缓存 SHA-256：`9e82fa716a4036d5257d06b746de87a09e13bad09de751cd67259387fef3db3a`。
- 输入身份：黄鹤楼 `[114.296944, 30.546944]`、`driving-car`、600/1200/1800 秒、30分钟外圈 hash `ac5d6fe70567e744bcad2fb4241c7bec57af6d8aeeb326bb5eb2ff7a48127177`、面积 1903.245963 km²。
- 第55号 V1 基线保持只读：`stage-6-spatial-batch-v1`、93 片、fingerprint `790314e5c7ff025fe46f8b8616041ddd0e94acba3084f50faa75f2a77a25231d`。
- 第53号四张 PNG 的实际 SHA-256 仍与归档清单一致；没有重截图。
- 步行、骑行及第43号研究冻结基线没有改动或重算。

## 离线请求账本

| 业务服务 | 新增上游请求 |
| --- | ---: |
| Isochrones | 0 |
| OpenPOIService | 0 |
| Matrix | 0 |
| Geocoder | 0 |
| Directions | 0 |

本阶段构建器只读取本地 JSON 缓存、执行 Shapely 几何计算并输出本地证据。它没有 Provider client 调用路径；审计图是纯离线 PNG，不是产品浏览器截图。

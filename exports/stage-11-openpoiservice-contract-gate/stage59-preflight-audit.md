# 第59号 OpenPOIService MultiPolygon 契约门禁预检

状态：`blocked-needs-decision`（Canary 配额门禁未满足；离线契约与回退证据已完成）

## 仓库与运行态

- 仓库：`/Users/zhangzhihan/Desktop/项目的UI界面`，分支 `main`，HEAD `6379d19`。
- 预检时 `git status --short` 显示 107 个状态项，其中已跟踪修改 28 项；未跟踪文件枚举为 262 项（目录在 status 输出中折叠）。既有修改全部保留；没有 reset、clean、checkout、删除或覆盖旧证据。
- 前端 `http://127.0.0.1:5500` 与后端 `http://127.0.0.1:8000` 均保持运行。
- health：`ready`、`mode=ors`、Provider 均为 `configured`、`mockFallback=false`、`networkProbePerformed=false`。
- Key 只由后端环境读取；本阶段没有打印、写入或归档 Key／Authorization。

## 冻结计划核对

- 选中 V2 文件 SHA-256：`7ce21e84f7928586bc781806a12bdf68b69c4b26e4ad40d579cb5379b4b6767a`。
- 选中 V2 GeoJSON SHA-256：`2ac5494932fcb72943ea9845d4643b8044814bca86947c3495baa83071d9e750`。
- 计划 fingerprint：`633aa700d21cc7582b77dea610a5e43a2bf35c7b382df6bbb48a6b90a941efd0`；43 片未被重选或改写。
- 实际从计划读取 5 个 MultiPolygon：`v2-piece-007-34f5a73d000034ed`=5、`v2-piece-017-6ea053fb7b6b71ce`=2、`v2-piece-032-c9c87148dafa0c3a`=2、`v2-piece-034-d21991729bd10cb5`=2、`v2-piece-041-fa22a1c714bc7af2`=4；合计 15 个 component。
- 驾车等时圈缓存 SHA-256：`9e82fa716a4036d5257d06b746de87a09e13bad09de751cd67259387fef3db3a`。

## Canary 门禁

本地只读 `GET /api/v1/quota` 表明 POI 配额为 `status=unknown`、`remaining=null`。该 endpoint 不探测上游；旧历史观察也不能被冒充为新鲜余量。第59号规定“每次请求前确认 API 余量不少于 10”，所以没有发生控制组或两种 MultiPolygon Canary，也没有以一次真实调用试探额度。

本阶段业务上游账本：Isochrones=0、OpenPOIService=0、Matrix=0、Geocoder=0、Directions=0。

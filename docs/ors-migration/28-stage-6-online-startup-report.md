# 第 28 号报告：Stage 6 在线 Provider 默认启动

日期：2026-08-01  
执行范围：仅第 27 号文档  
真实业务 API 预算：Isochrones 0、OpenPOIService 0、Matrix 0、Geocoder 0  
真实业务 API 实际请求：Isochrones 0、OpenPOIService 0、Matrix 0、Geocoder 0

## 1. 结论

第 27 阶段已完成。development 默认配置已收敛为 ORS Isochrones、ORS Matrix、ORS Geocoder 与 OpenPOIService；Mock 只允许在 `APP_ENV=test` 且 `ALLOW_NETWORK=false` 时显式启用，在线配置缺失或业务调用失败均不静默回退。

本地一键脚本已在 `127.0.0.1:5500` 和 `127.0.0.1:8000` 启动成功，health 只检查本地配置，首页完整加载且未触发四类真实业务请求。随后用 Ctrl+C 停止脚本，两个端口均已释放。没有执行第 29 号任务，没有点击任何生成入口，也没有改动第 21 号标签云算法。

冻结状态保持不变：步行仍使用已有真实缓存（282 个 Matrix 目的地）；骑行真实数据仍为 N/A；驾车仍为 108 个 POI 分片、`approval-required`；“准备全部交通方式”仍只生成计划。

## 2. development 在线 Provider 配置

默认语义：

```text
APP_ENV=development
ANALYSIS_PROVIDER=ors
POI_PROVIDER=ors_remote（兼容输入 openpoiservice）
ALLOW_MOCK_FALLBACK=false
ALLOW_NETWORK=true
API base=http://127.0.0.1:8000/api/v1
CORS_ORIGINS=http://127.0.0.1:5500
```

本机 `server/.env` 的非敏感 provider/CORS/开关已同步到上述状态；真实 Key 保留在被 Git 忽略的本机文件中，未读取到报告、截图、命令参数或前端。`git check-ignore -v server/.env` 命中 `.gitignore`。

配置检查命令：

```bash
PYTHONPATH=server server/.venv/bin/python scripts/check_online_config.py --json
```

安全输出：

```json
{
  "status": "ready",
  "environment": "development",
  "providers": {
    "isochrones": "configured",
    "matrix": "configured",
    "geocoder": "configured",
    "pois": "configured"
  },
  "mockFallback": false,
  "networkProbePerformed": false,
  "errors": []
}
```

检查器只验证文件存在、Git ignore、变量非空、URL/端口/布尔值和 provider 组合；错误只报告变量名，不输出 Key 值、长度或片段。

## 3. test 环境禁止网络与无 Mock 回退

配置层强制执行：

- development 出现 `ANALYSIS_PROVIDER=mock` 时拒绝启动；
- `ALLOW_MOCK_FALLBACK=true` 在所有环境均拒绝；
- test 若设置 `ALLOW_NETWORK=true` 则拒绝；
- test 的 Mock 必须由测试显式构造；
- Isochrones、Matrix、Geocoder、POI 四个 adapter 在 test/no-network 且未注入本地 client 时，均在 HTTP 前抛出 `NETWORK_DISABLED`；
- 显式注入的 `MockTransport` 或 fixture 仍可用于纯离线测试；
- ORS 分析请求需要 POI 时，不再回退到 mock POI。

`server.tests.test_online_startup` 覆盖了 development 默认在线、Mock 仅测试、test 禁网、四 adapter 出站阻断、缺 Key not-ready、错误脱敏和无 POI 回退。

## 4. health/readiness 与缺 Key 行为

`GET /api/v1/health` 的已就绪核心返回为：

```json
{
  "status": "ready",
  "environment": "development",
  "providers": {
    "isochrones": "configured",
    "matrix": "configured",
    "geocoder": "configured",
    "pois": "configured"
  },
  "missingConfiguration": [],
  "mockFallback": false,
  "networkAllowed": true,
  "networkProbePerformed": false,
  "service": "panmap-analysis-api",
  "mode": "ors",
  "providerReady": true
}
```

该端点没有构造或调用任何上游 client。`configured` 只代表本地配置完整，不代表上游当前可达；quota 继续只由正常业务响应被动更新。

缺少 `ORS_API_KEY` 的离线测试结果：HTTP 200、`status=not-ready`、四 provider 为 `missing`、`missingConfiguration=["ORS_API_KEY"]`、`mockFallback=false`、`networkProbePerformed=false`。响应不含 Key、绝对路径或堆栈，也不会切换 Mock。

CORS 定向测试确认实际响应只允许 `Origin: http://127.0.0.1:5500`；前端 API base、启动地址、示例配置和文档均统一使用 `127.0.0.1`。前端不再接受 URL query 覆盖 API base，浏览器中没有上游 Key。

## 5. 一键启动、停止与端口占用

实际一键命令：

```bash
cd "/Users/zhangzhihan/Desktop/项目的UI界面"
scripts/dev-online.sh
```

实测顺序：配置安全检查通过 → 5500/8000 只读端口检查通过 → 启动 Uvicorn 与静态服务 → 本地 health 在 15 秒预算内 ready → 输出两个 `127.0.0.1` 地址。脚本不安装依赖，不探测上游，不打印配置值。

运行证据：

| 服务 | 地址 | 监听证据 |
| --- | --- | --- |
| 前端 | `http://127.0.0.1:5500` | Python 静态服务监听，浏览器完整加载 |
| 后端 | `http://127.0.0.1:8000` | Uvicorn 监听，health 返回 200/ready |

在运行脚本的会话发送 Ctrl+C 后，Uvicorn 完成 application shutdown；脚本只终止它记录的两个子进程。随后 `lsof` 复核 5500、8000 均无 listener。

端口占用行为用本轮自建临时 5500 listener 验证：脚本报告 PID/程序名摘要并以 exit code 2 停止，原 listener 仍存活，`unknownProcessKilled=false`；验证后只对该自建 listener 发送 Ctrl+C。没有 kill 任何未知进程。

## 6. 首页加载与零真实业务 API

浏览器打开 `http://127.0.0.1:5500/` 后：

- 顶部显示“在线服务：已配置”；
- `providerReadiness=ready`、`providerNetworkProbe=false`、`mockFallback=false`；
- 本地后端仅收到 `GET /api/v1/health` 与 `GET /api/v1/poi-datasets`；
- 页面读取既有本地静态缓存基线，但没有自动生成分析；
- 未出现 `/analyses`、`/name-clouds`、`/matrix-accessibility` 或 `/geocoding/*` 请求；
- 未点击“生成可达域”“加载附近 POI 预览”“生成步行名称云”“补齐精确时间”或“准备全部交通方式”；
- 当前结果保持待生成，圈层/POI/类别计数均为 0；浏览器 console error/warning 为 0。

| 服务 | 预算 | 本轮真实请求 |
| --- | ---: | ---: |
| Isochrones | 0 | 0 |
| OpenPOIService | 0 | 0 |
| Matrix | 0 | 0 |
| Geocoder | 0 | 0 |
| 合计 | 0 | 0 |

结构化证据：`exports/stage-6-online-startup/stage27-zero-api-evidence.json`  
SHA-256：`195df7f73e47f72e1adf13ab9bc68fdcb8172d48ca3dfc4a8517aed56187848b`

## 7. 完整浏览器启动截图

![第27阶段在线启动完整页面](../../exports/stage-6-online-startup/stage27-online-startup.png)

截图文件：`exports/stage-6-online-startup/stage27-online-startup.png`  
尺寸：完整页面截图，98,652 bytes  
SHA-256：`9c0d23bcbfbbf4156ff4d6c79723987d0810ad6ecb7ca0adee9950a6be0809ac`

截图未包含 Key；页面处于启动后的空分析状态，没有发起名称云或任何真实任务。

## 8. 启动文档

`docs/ONLINE-STARTUP.md` 已写明：

- 首次依赖安装与不重复安装提示；
- `server/.env` 必需/可选变量名及安全约束；
- 一键启动、`--check-only` 和手动双终端命令；
- 浏览器与 health 地址；
- 如何区分在线 Provider 与 Mock；
- 业务请求何时发生、缓存与 quota 行为；
- Ctrl+C 停止、端口占用、CORS、缺 Key、429、超时和禁网测试排查。

文档中的实际启动命令为：

```bash
cd "/Users/zhangzhihan/Desktop/项目的UI界面"
scripts/dev-online.sh
```

## 9. 验证命令与结果

后端离线定向回归：

```text
PYTHONPATH=server server/.venv/bin/python -m unittest \
  server.tests.test_online_startup server.tests.test_api \
  server.tests.test_analysis_api server.tests.test_ors_adapter \
  server.tests.test_matrix server.tests.test_ors_remote_poi \
  server.tests.test_multimode_orchestration \
  server.tests.test_poi_batch_planner -v
```

结果：64/64 通过，使用 fixture/注入 client，无真实网络请求。

前端状态/契约/传统地图定向回归：

```text
node --test src/state/analysis-store.test.js \
  src/contracts/analysis-contracts.test.js \
  src/adapters/traditional-map-adapter.test.js
```

结果：10/10 通过。

其他核验：

- `node --check app.js src/api/analysis-client.js src/config/app-config.js`（逐文件执行）：通过；
- `bash -n scripts/dev-online.sh`：通过；
- 相关 Python 文件 `py_compile`：通过；
- `scripts/dev-online.sh --check-only`：通过，未启动服务；
- 第 27 号归档与 Downloads 原文 `cmp`：完全一致；
- `git diff --check`：通过；
- 未运行全量测试、长时间构建或真实业务任务。

## 10. 本阶段实际修改/生成文件

配置、后端与网络边界：

- `server/.env`（本机、Git ignored；仅非敏感配置收敛，Key 未写入报告）
- `server/.env.example`
- `server/app/config.py`
- `server/app/errors.py`
- `server/app/main.py`
- `server/app/adapters/ors.py`
- `server/app/adapters/ors_matrix.py`
- `server/app/providers/geocoder.py`
- `server/app/providers/poi/ors_client.py`
- `server/app/services/analysis.py`

前端：

- `src/config/app-config.js`
- `src/config/runtime-config.example.js`
- `src/api/analysis-client.js`
- `index.html`
- `styles.css`
- `app.js`

脚本、测试、文档与证据：

- `scripts/check_online_config.py`
- `scripts/dev-online.sh`
- `server/tests/test_online_startup.py`
- `server/tests/test_api.py`
- `server/tests/test_analysis_api.py`
- `server/tests/test_ors_adapter.py`
- `docs/ONLINE-STARTUP.md`
- `docs/ors-migration/27-stage-6-online-startup-execution.md`（原文归档）
- `docs/ors-migration/28-stage-6-online-startup-report.md`
- `exports/stage-6-online-startup/stage27-zero-api-evidence.json`
- `exports/stage-6-online-startup/stage27-online-startup.png`

工作区中第 19–26 号阶段以及更早的既有修改均未回退、覆盖或清理；第 21 号标签云布局与视觉编码文件未在本阶段修改。

## 11. 停止状态

- 第 28 号报告与 `docs/ONLINE-STARTUP.md` 已完成；
- 本轮一键启动进程已由 Ctrl+C 安全停止，5500/8000 已释放；
- 四类真实业务 API 请求全部为 0；
- 骑行仍 N/A，驾车仍 `approval-required`，108 片未执行；
- 未执行第 29 号三交通方式联网验收；
- 未自动继续任何后续任务。

按第 27 号文档要求在此立即停止。

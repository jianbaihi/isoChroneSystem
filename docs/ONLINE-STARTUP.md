# IsoTagMap 本地在线 Provider 启动指南

适用版本：Stage 6 / 第 27 号执行文档  
更新日期：2026-08-01  
默认地址：前端 `http://127.0.0.1:5500`，后端 `http://127.0.0.1:8000`

## 1. 运行语义

正常 `development` 启动默认使用真实在线 Provider：ORS Isochrones、ORS Matrix、ORS Geocoder 和 OpenPOIService。页面打开只请求本地 health 和本地数据集列表，不会自动生成等时圈、POI 或 Matrix。

Mock 只能在 `APP_ENV=test` 且 `ALLOW_NETWORK=false` 时显式启用。在线 Provider 缺少 Key、配置错误或上游失败时不会回退到 Mock。

## 2. 首次安装依赖

需要 Python 3.11+。前端是静态页面，正常启动不需要 Node.js。

```bash
cd "/Users/zhangzhihan/Desktop/项目的UI界面"
python3 -m venv server/.venv
server/.venv/bin/python -m pip install -r server/requirements.txt
```

不要在每次启动时重新安装依赖。

## 3. 配置 `server/.env`

首次配置：

```bash
cd "/Users/zhangzhihan/Desktop/项目的UI界面"
cp server/.env.example server/.env
```

然后在本机编辑 `server/.env`。必需项：

```dotenv
APP_ENV=development
APP_HOST=127.0.0.1
APP_PORT=8000
CORS_ORIGINS=http://127.0.0.1:5500
ANALYSIS_PROVIDER=ors
POI_PROVIDER=ors_remote
ALLOW_MOCK_FALLBACK=false
ALLOW_NETWORK=true
ORS_API_KEY=<仅填在本机 .env 中>
```

可选项包括 ORS/POI/Geocoder base URL、超时、缓存 TTL、POI 分片安全上限等，请以 `server/.env.example` 为准。

`server/.env` 已被 Git 忽略。不得将 Key 放入前端 JS、HTML、URL query、截图、报告、缓存键或 job fingerprint。

只检查本地配置（不做上游探测）：

```bash
cd "/Users/zhangzhihan/Desktop/项目的UI界面"
PYTHONPATH=server server/.venv/bin/python scripts/check_online_config.py
```

## 4. 推荐：一键启动

```bash
cd "/Users/zhangzhihan/Desktop/项目的UI界面"
scripts/dev-online.sh
```

脚本会：

- 检查虚拟环境、`server/.env`、Provider 组合、Git ignore 和必需变量；
- 只读检查 5500/8000 端口；
- 启动 FastAPI 和前端静态服务；
- 最多等待本地 health 15 秒；
- 显示访问地址，不输出 Key；
- `Ctrl+C` 只停止本次脚本启动的两个子进程。

仅检查配置和端口，不启动：

```bash
scripts/dev-online.sh --check-only
```

## 5. 备用：手动双终端启动

终端 1（后端）：

```bash
cd "/Users/zhangzhihan/Desktop/项目的UI界面"
PYTHONPATH=server server/.venv/bin/python -m uvicorn app.main:app \
  --env-file server/.env --host 127.0.0.1 --port 8000 --reload
```

终端 2（前端）：

```bash
cd "/Users/zhangzhihan/Desktop/项目的UI界面"
python3 -m http.server 5500 --bind 127.0.0.1
```

浏览器打开：

```text
http://127.0.0.1:5500
```

health：

```bash
curl -s http://127.0.0.1:8000/api/v1/health
```

就绪时应包含 `status=ready`、四个 provider 为 `configured`、`mockFallback=false`、`networkProbePerformed=false`。`configured` 只说明本地配置完整，不表示上游当前可达。

## 6. 页面中的业务操作

1. 页面显示“在线服务：已配置”后，选择中心点、交通方式和时间阈值。
2. 只有点击“生成可达域”才会请求 ORS Isochrones。
3. “生成POI标签云泛地图”会先检查当前 profile 的几何、分片和预算；超预算时必须停在审批。
4. Matrix 只在 POI 合并完整且用户显式触发“补齐精确时间”后执行。
5. “准备全部交通方式”只生成计划与预算，不执行三方式真实任务。

骑行真实数据当前仍为 N/A，不会在启动时联网补齐。驾车 POI 计划仍为 108 片 / `approval-required`，不会自动执行。

## 7. 缓存与 quota

- 相同输入可命中已有本地缓存；缓存命中不代表发生了新上游请求。
- quota 仅随正常业务响应被动观测，health 不主动探测余量。
- 刚启动时 quota 显示 `unknown/未知` 是正常状态。
- 缓存结果不应伪造 quota 观测时间。

## 8. 停止服务

一键脚本：在运行脚本的终端按 `Ctrl+C`。脚本仅向它自己记录的后端/前端 PID 发送 `TERM`，并等待两者退出。

手动双终端：分别在两个终端按 `Ctrl+C`。

端口已被其他进程占用时，启动器会显示非敏感 PID/程序名摘要并退出，不会自动 kill。如果要使用新端口，必须同时更新后端端口、前端 `apiBaseUrl`、CORS origin 和本文档，不能只改一端。

## 9. 排查

### 缺少 Key / not-ready

运行配置检查。错误只会显示 `ORS_API_KEY` 变量名。补齐后重启；系统不会切到 Mock。

### CORS

必须通过 `http://127.0.0.1:5500` 打开前端，不要混用 `localhost`。确认 `CORS_ORIGINS=http://127.0.0.1:5500`，API base 为 `http://127.0.0.1:8000/api/v1`。

### 429

尊重页面/后端返回的 `Retry-After`，不要快速重复点击。任务检查点会保留已完成分片或批次。

### 上游超时/不可用

页面显示在线服务暂不可用并保留上一次完整结果；不回退 Mock。health 只证明本地配置，不可用作上游可达性判断。

## 10. 离线测试

推荐定向测试：

```bash
cd "/Users/zhangzhihan/Desktop/项目的UI界面"
APP_ENV=test ANALYSIS_PROVIDER=mock ALLOW_NETWORK=false \
  PYTHONPATH=server server/.venv/bin/python -m unittest \
  server.tests.test_online_startup server.tests.test_api
```

测试环境的未注入 HTTP client 出站请求会在 adapter 边界以 `NETWORK_DISABLED` 失败。只有显式 `MockTransport`/本地 fixture 可执行。

## 11. 安全检查清单

- 只在 `server/.env` 保存 Key；
- 提交前运行 `git check-ignore server/.env`；
- 不把 Key 作为 shell 参数、URL 或前端 runtime config；
- 不在日志、截图或问题报告中粘贴 `.env`；
- 不为了通过 CORS 而放开 `* + credentials`；
- 启动不代表授权三交通方式 live 验收。


# 第 6 阶段第 5 步：在线 Provider 默认启动与启动文档执行文档

状态：待执行

直接基线：`docs/ors-migration/26-stage-6-multimode-orchestration-report.md`

执行完成后新增或更新：

```text
docs/ors-migration/27-stage-6-online-startup-execution.md
docs/ors-migration/28-stage-6-online-startup-report.md
docs/ONLINE-STARTUP.md
```

完成第 28 号报告后强制停止。不得自动开始三交通方式真实数据任务。

## 0. 给 Codex 的直接指令

把正常本地开发启动改为真实在线 Provider 基线：

```text
Isochrones = ORS online
Matrix = ORS online
Geocoder = online
POI = OpenPOIService online
Mock = 仅测试显式启用
```

同时提供可复制的 macOS/Linux 启动方式、配置检查、健康检查和安全停止方式。正常页面启动不得静默使用虚拟数据，也不得在首页加载时自动调用真实业务 API。

本任务业务 API 预算为 0。只验证配置、进程、health/readiness、本地页面和已存在缓存。真实业务请求留给第 29 号文档。

## 1. 在线默认与显式 Mock

### 1.1 开发默认

配置语义建议统一为：

```text
APP_ENV=development
ANALYSIS_PROVIDER=ors
ISOCHRONE_PROVIDER=ors
MATRIX_PROVIDER=ors
GEOCODER_PROVIDER=ors
POI_PROVIDER=openpoiservice
ALLOW_MOCK_FALLBACK=false
```

字段名可沿用项目现有命名，不能同时保留多套互相冲突的 provider 开关。

### 1.2 测试默认

自动测试必须显式设置：

```text
APP_ENV=test
ALLOW_NETWORK=false
provider=fixture/mock
```

测试不能因为开发默认在线而访问公网。建议安装统一网络禁用断言：未声明的 HTTP 出站请求使测试失败。

### 1.3 不允许静默回退

真实 Provider 缺 Key、配置非法或上游失败时：

- 后端返回清楚、非敏感错误；
- 页面显示“在线服务未配置/暂不可用”；
- 保留上一次成功结果；
- 不自动切到 Mock；
- 不显示虚构等时圈、POI 或 Matrix；
- 不打印 Key。

Mock 只允许通过明确测试命令或开发者显式选项启动，并在页面醒目标记“测试数据”。

## 2. 环境变量与密钥

### 2.1 文件

保留：

```text
server/.env.example   可提交，只放占位和说明
server/.env           本机真实值，必须被 Git 忽略
```

不得把真实值写进：

- 前端 JS；
- HTML；
- `runtime-config.example.js`；
- 启动脚本参数；
- README/报告；
- 截图；
- URL query；
- 缓存键或 job fingerprint。

### 2.2 启动前检查

启动器只检查：

- 文件是否存在；
- 必需变量是否非空；
- URL/端口/布尔值格式；
- provider 组合是否支持；
- `server/.env` 是否被 Git 忽略。

错误输出只显示变量名，例如：

```text
缺少 ORS_API_KEY，请在 server/.env 中配置。
```

不得输出值、长度、前后缀或完整环境。

## 3. Health 与 readiness

统一一个本地端点；若已有则扩展，不重复创建：

```text
GET /api/v1/health
```

返回示例：

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
  "networkProbePerformed": false
}
```

要求：

- health 只验证本地配置和应用初始化；
- 不为了 readiness 向 ORS/OpenPOIService 发探测请求；
- 不返回 Key、账户信息、绝对路径或完整异常堆栈；
- provider configured 不等于上游当前可达，UI 文案必须区分；
- 缺必需配置时 `status=not-ready` 并列出缺失变量名；
- quota 最近观测仍由业务请求被动更新。

## 4. 启动方式

### 4.1 推荐一键脚本

在不引入大型进程管理依赖的前提下，优先增加：

```text
scripts/dev-online.sh
```

职责：

1. 定位项目根目录，不依赖调用者当前目录；
2. 检查 Python、虚拟环境、Node（若实际需要）和 `server/.env`；
3. 验证在线 Provider 配置；
4. 启动 FastAPI/Uvicorn 后端；
5. 启动现有前端静态服务；
6. 等待本地 health 就绪，最长 15 秒；
7. 显示本地访问地址和停止方法；
8. 捕获 Ctrl+C，优雅停止本次脚本启动的两个子进程；
9. 不终止系统中同端口但非本脚本启动的未知进程；
10. 不打印环境变量值。

默认地址建议与已验证基线一致：

```text
Frontend: http://127.0.0.1:5500
Backend:  http://127.0.0.1:8000
```

最终以当前项目实际端口为准，但前端、CORS、API base 和文档必须一致。第 16 号报告已证明 `localhost:5500` 与 CORS 配置曾不一致，因此文档默认使用 `127.0.0.1:5500`。

### 4.2 手动双终端方式

`docs/ONLINE-STARTUP.md` 必须给出不依赖脚本的备用命令：

```bash
# 终端 1：后端
cd "<项目目录>"
PYTHONPATH=server server/.venv/bin/python -m uvicorn app.main:app \
  --host 127.0.0.1 --port 8000 --reload

# 终端 2：前端
cd "<项目目录>"
python3 -m http.server 5500 --bind 127.0.0.1
```

执行时必须核对当前实际 import path 和前端服务方式；若项目已有更合适命令，使用项目真实命令并更新文档，不照抄错误模板。

### 4.3 端口占用

启动前只读检查：

- 5500；
- 8000；
- 当前配置的其他端口。

端口被占用时：

- 报告 PID/程序名的非敏感摘要；
- 不自动 kill；
- 提示用户停止旧实例或显式选择新端口；
- 新端口必须同步给前端 API base 和 CORS，不能只改一端。

## 5. 前端启动状态

页面启动后显示紧凑状态：

```text
在线服务：已配置
```

尚未发生业务请求时：

- Isochrones/Geocoder/POI/Matrix quota 可为 unknown；
- 不发送探测请求；
- 不加载 Mock；
- 不自动生成默认等时圈；
- 不自动抓取三交通方式 POI；
- 用户点击后才进入业务 loading。

缺配置时显示：

```text
在线服务未就绪：缺少 ORS_API_KEY
```

不得显示密钥值。

## 6. API Base 与 CORS

- 前端只请求本地后端；
- API base 统一来自一个非敏感配置点；
- 默认 `http://127.0.0.1:8000`；
- CORS 明确允许实际前端 origin `http://127.0.0.1:5500`；
- 若保留 `localhost`，需明确同时允许且测试；
- 生产环境不得使用任意 `*` + credentials；
- 不允许前端直接持 ORS Key 或调用 ORS Matrix。

## 7. 启动指南必须包含

`docs/ONLINE-STARTUP.md` 至少写：

1. 适用版本和日期；
2. 第一次安装依赖；
3. 创建/更新 `server/.env`；
4. 必需与可选变量名；
5. 推荐一键启动；
6. 手动双终端启动；
7. 浏览器地址；
8. 如何确认在线 Provider 而非 Mock；
9. 如何生成等时圈；
10. 如何生成POI标签云泛地图；
11. Matrix 在何时调用；
12. 缓存命中和 quota unknown 的解释；
13. 停止服务；
14. 端口占用、CORS、缺 Key、429、上游超时的排查；
15. 如何运行离线测试；
16. 安全注意事项。

## 8. 分步执行

### 阶段 A：预检

1. 阅读第 26 号报告和本文；
2. 将本文原样归档到第 27 号路径；
3. 核对现有 provider 开关、env 加载、端口、CORS、API base 和启动命令；
4. 检查 `server/.env` 已忽略；
5. 不读取或打印真实值；
6. 安装业务上游请求断言，本任务任何业务请求即失败。

### 阶段 B：配置收敛

1. 正常 development 默认真实 Provider；
2. test 显式 fixture/mock；
3. 禁止静默 fallback；
4. 更新 `.env.example` 占位；
5. 实现配置校验和非敏感错误。

### 阶段 C：health 与启动器

1. 实现/扩展 health；
2. 编写 `scripts/dev-online.sh`；
3. 实现端口只读检查、health 等待和 Ctrl+C 清理；
4. 不自动 kill 未知进程；
5. Shell 静态检查与最小测试。

### 阶段 D：启动指南

1. 依据真实命令编写 `docs/ONLINE-STARTUP.md`；
2. 同时提供一键和双终端方案；
3. 明确使用 `127.0.0.1`；
4. 明确默认在线但不会页面自动耗费 API；
5. 明确 Mock 仅测试。

### 阶段 E：零业务请求验收

1. 以 development 配置启动；
2. health 返回 ready/configured 且 probe=false；
3. 打开前端；
4. 页面显示在线已配置；
5. Network/后端计数证明业务上游请求为 0；
6. 停止并确认本脚本子进程退出；
7. 以 test 配置运行离线测试，证明不联网；
8. 缺 Key 场景明确失败且不回退 Mock。

### 阶段 F：报告并停止

生成第 28 号报告并停止。不得点击生成三交通方式真实数据。

## 9. 自动测试最低要求

- development 默认真实 Provider；
- test 默认禁止网络并显式 fixture；
- 缺 Key not-ready；
- 缺 Key 不回退 Mock；
- health 不做网络探测；
- health 不泄露 Key/路径；
- 前端初始加载不调用业务 API；
- API base 与 CORS origin 一致；
- 一键脚本能启动、health 等待、Ctrl+C 停止；
- 端口占用不自动 kill；
- 日志不包含 Key；
- offline tests 在无网络下通过。

## 10. 时间盒与停止条件

- health 等待最长 15 秒；
- 单个测试命令最长 120 秒；
- 浏览器初始验收最长 10 分钟；
- 累计 60 分钟未完成，写断点版第 28 号报告并停止；
- 不得通过发真实 API 请求证明“配置在线”。

立即停止：

- 发现真实 Key 已进入受跟踪文件；
- 页面初始加载自动请求业务 API；
- Provider 失败后仍静默显示 Mock 成功；
- 启动脚本会 kill 未知进程；
- CORS 只能通过放开不安全通配解决；
- 任一业务上游调用发生。

## 11. 完成判据

- 正常 development 默认四类真实 Provider；
- test 保持完全离线；
- 缺配置明确失败且无 Mock fallback；
- 一键与双终端启动文档均可用；
- 默认页面使用 `127.0.0.1` 基线且 CORS 正确；
- health 不做上游探测；
- 页面初始加载业务 API=0；
- 第 28 号报告和 `docs/ONLINE-STARTUP.md` 已完成；
- 完成后停止。

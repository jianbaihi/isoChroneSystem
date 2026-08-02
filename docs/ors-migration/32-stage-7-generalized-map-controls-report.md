# 第 32 号报告：Stage 7 泛地图控制面板与参数契约

状态：`completed`  
日期：2026-08-01  
执行范围：仅第 31 号文档；未执行第 33 号

## 1. 结论

第 31 号要求的本地数据审计、泛地图左侧副导航、控制参数状态模型、持久化、本地 apply 契约、自动化测试和浏览器验收均已完成。页面只读取黄鹤楼 `foot-walking` 第 20 号本地缓存；四类业务上游请求均为 0。

第 22 号布局算法未修改。浏览器独立加载及本地重排均保持 B `138/252`、未摆放 114、out-of-range 30 和稳定指纹 `fnv1a-8b0581ae`。

## 2. 冻结项

| 冻结项 | 验收结果 |
| --- | --- |
| 黄鹤楼步行本地缓存 | 保持，来源 SHA-256 `c1ac3a837cf96bd576ad5ed6ac228be78d88da706c0c5db04d35194f14e4d51b` |
| 282 / 252 / 30 | 一致 |
| 圈层 39 / 83 / 130 | 一致 |
| 第 22 号 B 基线 138/252 | 一致 |
| 第 22 号 fingerprint | `fnv1a-8b0581ae`，一致 |
| 骑行数据 | 未读取、未修改 |
| 驾车 | `awaiting-approval`，未调度 |
| 新布局算法 | 未实现、未伪装生效 |

没有修改 `panmap-layout.js` 或 `src/adapters/panmap-layout-adapter.js` 的第 22 号算法、字号公式、时间色相和圈层分配。

## 3. 数据审计与数量守恒

审计输入：`exports/stage-6-layout/stage20-cache-baseline.json`。

| 指标 | 结果 |
| --- | ---: |
| POI 总数 | 282 |
| 合法坐标 | 282 |
| 无效坐标 | 0 |
| Matrix ok | 282 |
| eligible | 252 |
| out-of-range | 30 |
| 10/20/30 分钟 | 39 / 83 / 130 |
| 重复稳定 ID | 0 |
| 同 ID 冲突坐标 | 0 |
| 缺失名称 | 0 |

守恒：`252 + 30 = 282`；`39 + 83 + 130 = 252`。无效坐标与重复 ID fixture 会显式抛错，不会随机补坐标或静默丢弃。

## 4. 控制面板信息架构

左侧副导航包含：

- 标签方位：当前第 22 号兼容值 `legacy-baseline`；地理方位与随机方位作为第 33 号草稿选项；
- 包络线：圆形与自然包络；自然包络参数只在相应草稿下显示；
- 紧凑度与字号层次：0–100，默认 50，只写草稿；
- 圈层与画布：自动扩圈、全部 eligible（只读开启）、自适应画布、自动适配视图；
- 自然包络参数：贴合度 50、平滑度 60、最小间隔 12 px、调试层关闭；
- 操作：应用并重新布局、恢复默认、固定稳定种子、导出当前基线指标、深浅主题；
- 统计：282 total、252 eligible、138 placed、114 unplaced、30 out-of-range、39/83/130。

控件使用原生 button/input/label，具有可访问名称和 `:focus-visible`。面板可收起到 44 px；窄屏 CSS 使用 1180 px 断点，收起后不遮挡主要操作。主题和面板开合不触发布局。

截图：![第31号泛地图控制面板](../../exports/stage-7-controls/stage31-controls.png)

## 5. 参数 schema、默认值与持久化

集中状态模块：`src/state/panmap-control-state.js`。

字段顺序固定为：`schemaVersion`、`labelOrientation`、`envelopeMode`、`compactness`、`fontHierarchy`、`autoExpandRings`、`allEligibleRequired`、`adaptiveCanvas`、`autoFitView`、`envelopeTightness`、`envelopeSmoothness`、`minEnvelopeGapPx`、`showDensityDebug`、`randomSeed`。

- schemaVersion：`1.0`；
- 枚举未知值回退默认并留下 warning；
- 数值按集中范围 clamp；
- `allEligibleRequired` 强制为 true；
- randomSeed 仅接受整数或非空稳定字符串，不使用无种子的 `Math.random`；
- localStorage key：`isotagmap.panmap-controls.v1`，只保存 applied 状态和 schemaVersion，不含敏感信息；
- 旧 schema 安全迁移，损坏 JSON 安全重置；
- 序列化顺序固定，可生成稳定控制 fingerprint；
- 刷新恢复 applied，draft 修改不污染 applied fingerprint；
- 恢复默认只更新 draft，不自动 apply。

默认控制 fingerprint：`fnv1a-c0a90ee2`。

## 6. apply 与重排触发

| 场景 | 正式本地布局调用 | 数据缓存失效 | 结果 |
| --- | ---: | ---: | --- |
| 滑块 input（浏览器 50→70；自动化多次连续输入） | 0 | 0 | 只改 draft |
| 切换自然包络后 apply | 0 | 0 | 明示第33号实现，保持基线 |
| 默认兼容组合＋`autoFitView=false` apply | 1 | 0 | 仅本地布局一次 |
| 刷新恢复 | 0 | 0 | applied 状态恢复 |
| 主题切换、面板收起 | 0 | 0 | layout revision 不变 |

浏览器正式 apply 前后 layout revision `4→5`，调用次数 1；fingerprint 始终 `fnv1a-8b0581ae`。未支持的自然包络 apply 保持 revision 4、applyCount 0，并显示“所选布局参数将在第33号实现；当前第22号基线保持不变”。

## 7. 布局统计回归

| 指标 | A | B |
| --- | ---: | ---: |
| eligible | 252 | 252 |
| placed | 106 | 138 |
| unplaced | 146 | 114 |
| 分圈 placed | 17 / 30 / 59 | 12 / 31 / 95 |
| fingerprint | `fnv1a-d8d4994f` | `fnv1a-8b0581ae` |

B 重叠与越界仍为 0。页面明确区分参与布局、已摆放、未摆放与圈外审计，不显示“全量摆放成功”。

## 8. 自动化测试

```bash
node --test \
  src/state/panmap-control-state.test.js \
  src/state/panmap-control-ui.test.js \
  src/adapters/panmap-layout-adapter.test.js \
  src/contracts/analysis-contracts.test.js

PYTHONPATH=server server/.venv/bin/python -m unittest \
  server.tests.test_stage31_data_audit \
  server.tests.test_matrix \
  server.tests.test_online_startup
```

结果：前端 14/14；后端 19/19；浏览器 8/8。测试环境既有禁网门禁未放宽。

覆盖数据审计和坏 fixture、schema/clamp/迁移、draft/applied 分离、刷新恢复、恢复默认、条件显示、连续 input、单次 apply、零业务 API、基线回归、可访问名称、主题和面板收起。

## 9. 零 API 账本

| 服务 | 预算 | 实际 |
| --- | ---: | ---: |
| Isochrones | 0 | **0** |
| OpenPOIService | 0 | **0** |
| Matrix | 0 | **0** |
| Geocoder | 0 | **0** |

本地服务日志只出现静态页面/脚本/样式、第 20 号缓存 JSON、`GET /api/v1/health` 与 `GET /api/v1/poi-datasets`。没有 `/analysis`、Isochrones、POI、Matrix 或 Geocoder 业务路由。health 只检查本地配置且不探测上游。

## 10. 证据文件、SHA-256 与 MIME

| 文件 | SHA-256 | 格式 |
| --- | --- | --- |
| `exports/stage-7-controls/stage31-data-audit.json` | `6f5fc659deb9d46d2ecff38e2fef54a8595ac5c41fe5aa0334efe1d4504a76de` | JSON |
| `exports/stage-7-controls/stage31-control-state.json` | `d213da8972a62d517936371acaa7b266788825d6af6f0e627d748725b8624c06` | JSON |
| `exports/stage-7-controls/stage31-zero-api-evidence.json` | `091786423c2b3b19b0f874c2d924d39f170b6565161c39727833340fba726f66` | JSON |
| `exports/stage-7-controls/stage31-controls.png` | `7826d2b9aaf37a4c5eb36a8f6dd97317b7ad234a18b94b876f6916a1a8965a5f` | `image/png`，1126×943，8-bit RGB |

浏览器截图原始捕获返回 JPEG 编码；验收阶段已通过系统图像转换生成真实 PNG，并用文件 magic/MIME、像素尺寸及 SHA-256 复核，最终 `.png` 不含 JPEG 内容。

## 11. 本次实际修改或生成文件

- `docs/ors-migration/31-stage-7-generalized-map-controls-execution.md`
- `docs/ors-migration/32-stage-7-generalized-map-controls-report.md`
- `index.html`
- `styles.css`
- `app.js`
- `src/state/panmap-control-state.js`
- `src/state/panmap-control-state.test.js`
- `src/state/panmap-control-ui.test.js`
- `scripts/build_stage31_data_audit.py`
- `scripts/build_stage31_control_evidence.js`
- `server/tests/test_stage31_data_audit.py`
- `exports/stage-7-controls/stage31-data-audit.json`
- `exports/stage-7-controls/stage31-control-state.json`
- `exports/stage-7-controls/stage31-zero-api-evidence.json`
- `exports/stage-7-controls/stage31-controls.png`

进入第 31 号前的其他未提交修改均未回退、覆盖或清理。

## 12. 已知限制与第 33 号门禁

- 地理径向、随机径向、动态扩圈、自然包络和 D3 density 尚未实现；
- compactness、fontHierarchy 与自然包络参数目前只进入草稿契约，不改变布局；
- 当前布局仍可能有 114 个 eligible POI 未摆放；
- 本阶段只证明控制面板、状态与触发契约可靠，不代表新布局完成。

第 31 号完成判据已满足，具备进入第 33 号的技术门禁；但本任务已停止，不自动执行第 33 号，须等待人工验收和新的明确指令。

## 13. 停止状态

状态：`completed`。第 32 号报告、三份结构化 JSON 和真实 PNG 已生成；本轮浏览器已关闭，本轮启动的本地服务已优雅停止，`127.0.0.1:5500` 与 `127.0.0.1:8000` 均无 listener。未执行第 33 号。

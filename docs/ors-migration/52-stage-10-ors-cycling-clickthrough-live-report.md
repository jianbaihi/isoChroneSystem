# 第52号报告：黄鹤楼骑行10/20/30分钟真实点击链路

## 状态

`completed`

第51号只完成黄鹤楼 `cycling-regular` 点击链路与缓存复跑；没有进入驾车、巴黎、类别聚类、评分热度、部署或后续文档。前端、后端与最终浏览器页面保持运行。

## 基线与安全门禁

- 仓库：`/Users/zhangzhihan/Desktop/项目的UI界面`；分支 `main`；HEAD `6379d19b644d44d471c7ad3ed29c4e3e558928c3`。
- 开始时工作区76项修改，交付时83项；未执行reset、clean、checkout，已有修改全部保留。
- health=`ready`；development使用ORS/OpenPOIService；`mockFallback=false`；`networkProbePerformed=false`。
- Key只从`server/.env`读取，未写入前端、报告、截图、缓存或控制台。
- 第45号冻结步行：`analysis-name-cloud-7823d8e3-5c27-4a22-8b78-be5939c4e2ba`，284/254/30，39/85/130，Matrix `c4a00b9309bdd758ad6313c068a3321151e6576079c78fa97cc78db75c67578f`。
- 第43号研究基线继续冻结：252，39/83/130，`recomputed=false`。
- 骑行容量预检：历史真实缓存1800个eligible，当前冻结布局生成1800个DOM节点和1800个唯一poiId，无静默截断。

## Profile、状态机与点击序列

UI“骑行”只映射到`cycling-regular`；Isochrones、Matrix、作业账本、缓存身份与结果摘要使用同一profile。骑行使用独立`X-Stage51-Job-ID`和独立第51号账本，不复用第45号步行账本。

真实浏览器顺序：打开页面 → 从步行切换骑行并显示stale → 点击“生成可达域” → 点击“探索泛地图” → 普通/研究验收 → 缩放、平移和20次模式切换 → 同参数再次点击复跑 → 骑行/步行/骑行往返。两个作业均完成完整状态机：`idle → isochrone-running → isochrone-ready → poi-planning → poi-running → poi-ready → matrix-planning → matrix-running → layout-ready → completed`。

## 骑行Isochrones

- profile：`cycling-regular`；range type：time；阈值600/1200/1800秒。
- 3个累计Polygon面积：6.656500 / 38.547800 / 121.109600 km²；30分钟外圈121.109624 km²。
- 颜色仍为10分钟绿、20分钟蓝、30分钟紫。
- 点击阶段attempted=1、cache hit=1、upstream=0；没有串联POI或Matrix。

## POI外圈覆盖与规划

- `queryGeometry = cycling 30-minute cumulative isochrone outer Polygon`。
- `fixedRadiusPreviewUsed = false`。
- 当前第51号规划fingerprint：`272d594a7ca30b6284ec64bebd51f4d112945ca513a5d87a757929c82cb0e706`；10片，面积均≤45 km²；最小10次，预留2次，批准上界12，`within-budget`。
- 面积守恒：planned 121.109625 km²，uncovered 0.000002338，outside 0.000002777，overlap 0。
- 来源：2026-08-01第29号已验收真实OpenPOIService缓存。raw=3996，parsed/named/deduplicated=2413，missing-name=1583，outside=0，invalid=0。
- 10片全部cache hit；没有截断，`fullyCovered=true`，upstream=0。没有把本轮缓存复用伪写成重新取得的上游数据。

## Matrix精确时间与守恒

- 2413个目的地，500/批，5批，concurrency=1；5批全部cache hit，retries=0，upstream=0。
- ok/null/invalid=2413/0/0；eligible/out-of-range=1800/613。
- 互斥圈层：127 / 433 / 1240；守恒：1800 + 613 + 0 + 0 = 2413。
- duration秒：min 48.94，median 1587.11，p90 1958.59，max 4468.61。
- distance米：min 81.57，median 6968.99，p90 8818.16，max 13761.07。
- 新Analysis ID：`analysis-stage51-cycling-38ef5a3bdd60c562354e88fd`；Matrix指纹：`f41b23c25e23a997c03b0050451a8976303683d15342842129d8f47e80d0d203`；routing graph date：`2026-07-27T01:13:39Z`。

## 原子发布、缓存隔离与失败保护

POI完成而Matrix未完成时不发布；只有Matrix守恒和布局数据就绪后才调用profile发布端点。骑行/步行结果分别存储，旧任务jobId不能覆盖当前任务。profile缓存身份包含中心、profile、阈值、range type、POI provider、外圈几何、Matrix source、目的地指纹和版本；同几何的步行/骑行fingerprint不同。

## 浏览器与模式一致性

- 普通模式：2413/1800/613，127/433/1240，1800个标签DOM，布局fingerprint `fnv1a-9a1fe12a`。
- 研究模式：同一Analysis ID、同一1800节点、同一布局fingerprint；第43号实验执行次数0。
- 缩放和平移后连续切换20次，Analysis ID、数量、fingerprint和viewBox逐字一致；业务上游0。
- 浏览器控制台error=0、warning=0；无loading和骨架残留。

## 缓存复跑与交通方式往返

第二个相同参数作业再次命中1个Isochrones、10片POI和5批Matrix缓存；五类上游均0，Analysis ID、Matrix指纹、数量和布局fingerprint不变。骑行→步行恢复284/254与39/85/130及冻结指纹；再回骑行恢复2413/1800与127/433/1240及骑行指纹；profile无混淆。

## 请求账本

单次批准上限：Isochrones=1、POI=12、Matrix=12、Geocoder=0、Directions=0。每个作业实际upstream均为0；两次作业合计cache attempts为Isochrones 2、POI 20、Matrix 10，但不消耗上游批准预算。

## 测试

- JavaScript语法检查：通过。
- `node --test src/**/*.test.js`：108 passed，0 failed。
- `PYTHONPATH=server server/.venv/bin/python -m unittest discover -s server/tests -p 'test_*.py'`：91 passed，0 failed。
- `git diff --check`：通过。
- 浏览器：1800节点容量、普通/研究、20次切换、缓存复跑、交通方式往返、控制台0错误全部通过。

## 实际修改文件

- `app.js`
- `index.html`
- `src/api/analysis-client.js`
- `src/state/analysis-store.js`
- `src/state/analysis-store.test.js`
- `src/state/stage51-cycling-ui.test.js`
- `server/app/main.py`
- `server/app/services/cycling_job_ledger.py`
- `server/app/services/stage51_cycling_cache.py`
- `server/tests/test_stage51_cycling_job.py`
- `scripts/build_stage51_cycling_evidence.py`
- `exports/stage-10-cycling-live/*`
- `docs/ors-migration/52-stage-10-ors-cycling-clickthrough-live-report.md`

## PNG与SHA-256

- `stage51-cycling-selected-stale.png` — `414570cdecf79d7884921a87dcd6a0b90b04940da23936797246583d8f740584` — 1409×897 PNG
- `stage51-cycling-isochrones.png` — `50aa1476a9e403f91a523b14fd973560eaf01ca1b40487777515fb7fb82174e5` — 1409×897 PNG
- `stage51-cycling-panmap-ordinary.png` — `1f585c69847072411962a41be82dd19a31cd521fb663fe2dc04200138adeaf99` — 1280×720 PNG
- `stage51-cycling-panmap-research.png` — `2481032d105ccae02ce96bbb34c22c239d4f263c0dd3958d2ca4bab26b936e1a` — 1280×720 PNG
- `stage51-cycling-cache-restored.png` — `7058bfa032c103c8f756c014cd0d14ca51f144d831206d5b2a2945d3152fb81e` — 1280×720 PNG

## 运行与停止状态

- 前端：`127.0.0.1:5500`仍监听。
- 后端：`127.0.0.1:8000`仍监听，health ready。
- 浏览器最终停留：泛地图探索、普通模式、武汉·黄鹤楼、骑行、10/20/30分钟、完整骑行结果，研究面板关闭，无loading/错误。
- 已停止第51号剩余执行；未自动进入驾车、巴黎或后续任务。

# 第 7 阶段第 1 步：泛地图样式控制面板、参数契约与数据审计执行文档

状态：已执行

本文件归档第 31 号执行范围。原始任务文档来自 `/Users/zhangzhihan/Downloads/31-stage-7-generalized-map-controls-execution.md`；实际结果见同目录第 32 号报告。

## 冻结基线

- 场景：武汉·黄鹤楼，`foot-walking`，600/1200/1800 秒；
- 本地缓存：282 个 POI，Matrix 282/282；
- eligible 252，三圈 39/83/130，out-of-range 30；
- 第 22 号布局：B 138/252，稳定指纹 `fnv1a-8b0581ae`；
- 骑行数据冻结；驾车保持 `awaiting-approval`；
- Isochrones、OpenPOIService、Matrix、Geocoder 上游预算均为 0。

## 本次执行范围

1. 审计冻结步行缓存的坐标、名称、稳定 ID、Matrix 状态与数量守恒；
2. 增加泛地图左侧样式副导航；
3. 建立版本化参数 schema、草稿/已应用状态、持久化与稳定 fingerprint；
4. 仅允许兼容基线的参数正式调用一次本地布局入口；未实现组合明确提示并保持基线；
5. 展示 total/eligible/placed/unplaced/out-of-range 与逐圈统计；
6. 测试键盘名称、条件显示、窄屏收起、主题切换、刷新恢复和零 API；
7. 生成三份 JSON、真实 PNG 截图和第 32 号报告后停止。

## 明确不在范围内

不实现地理径向、随机径向、动态扩圈或自然包络算法；不修改第 22 号布局算法、字号公式、时间色相或圈层归属；不读取或改写骑行结果；不调度驾车；不进入第 33 号。

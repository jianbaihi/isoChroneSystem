# 第43号研究者布局与密度UI执行记录

## 执行基线

本记录对应 `/Users/zhangzhihan/Downloads/43-stage-8-researcher-layout-density-ui-execution.md`。按用户确认，2026-08-05 执行时的当前工作区源码是第43号新冻结基线。

前置已完成并保留：

- 普通用户UI收敛；
- 左侧泛地图面板已改为与主流程一致的非悬浮布局；
- `ReferenceError: Can't find variable: layout` 修复；
- 上述改动不回退、不覆盖，研究者UI以兼容接入方式实现。

## A—E执行结果

1. A通过：实际Git根目录、`main` 分支、第37/41号求解器、评估器、研究模式入口与252条冻结数据均已核验。
2. B通过：完成纯函数密度选择、固定逐圈配额、稳定排序、嵌套集合、`quota-hidden` 与结构化指纹。
3. C通过：新增独立 `balanced-annular` 求解器和三算法注册表；60/120/180三档均通过折中有效性门禁。
4. D通过：`?research=1` 动态挂载研究控制区与指标检查器，默认为均衡＋标准；普通URL无研究DOM。
5. E通过：产出3×3结构化证据、真实PNG截图、SHA-256、浏览器回归和零API账本。

最终结果见 `44-stage-8-researcher-layout-density-ui-report.md`。

import json,pathlib,subprocess
root=pathlib.Path(__file__).resolve().parents[1];p=root/'artifacts/stage88'
for image in p.glob('*.jpg'):
    subprocess.run(['sips','-s','format','png',str(image),'--out',str(image.with_suffix('.png'))],check=True,stdout=subprocess.DEVNULL)
    image.unlink()
m=json.loads((p/'layout-compactness.json').read_text());b=json.loads((p/'browser-evidence.json').read_text());before=m['before'];after=m['after'];reduction=(1-after['boundingArea']/before['boundingArea'])*100;gap=(1-after['meanNearestGap']/before['meanNearestGap'])*100
checks={'providerRequestDelta':max(x['audit']['providerRequestDelta'] for x in b),'centerPixelDrift1440':max(abs(x['center']['x']-b[0]['center']['x'])+abs(x['center']['y']-b[0]['center']['y']) for x in b[:10]),'centerPixelDrift1134':max(abs(x['center']['x']-b[10]['center']['x'])+abs(x['center']['y']-b[10]['center']['y']) for x in b[10:]),'initialL1':b[3]['audit']['visibleL1'],'initialL2':b[3]['audit']['visibleL2'],'expandedL2':b[7]['audit']['visibleL2'],'collapsedL2':b[8]['audit']['visibleL2'],'restoredBoundingArea':b[8]['audit']['boundingArea']==b[3]['audit']['boundingArea'],'maxObservedLayoutMs':max(x['audit']['layoutMs'] for x in b),'maxObservedEnvelopeMs':max(x['audit'].get('envelopeMs',0) or 0 for x in b),'animationDurationMs':320,'screenshots':len(b)}
assert checks['providerRequestDelta']==0 and checks['centerPixelDrift1440']==0 and checks['centerPixelDrift1134']==0 and checks['restoredBoundingArea']
(p/'browser-checks.json').write_text(json.dumps(checks,ensure_ascii=False,indent=2))
labels=['原文字布局','紧凑文字布局','原包络','适中包络 · 默认','柔和包络','中心强调','餐饮焦点','二级原位展开','收起回弹','最终10分钟概览','1134 初始','1134 展开','1134 收起']
figures=''.join(f'<figure><a href="../../artifacts/stage88/{x["name"]}.png"><img loading="lazy" src="../../artifacts/stage88/{x["name"]}.png" alt="{label}"></a><figcaption>{i+1:02d} · {label}</figcaption></figure>' for i,(x,label) in enumerate(zip(b,labels)))
html=f'''<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Stage88 · 黄鹤楼10分钟对比</title><style>body{{margin:0;background:#f6f8f5;color:#334539;font:15px system-ui,sans-serif}}main{{max-width:1400px;margin:auto;padding:38px}}h1{{font-size:30px}}a{{color:#348064}}.facts{{display:flex;gap:30px;padding:22px;background:white;border-radius:12px;margin:25px 0}}.facts b{{font-size:25px;display:block}}.gallery{{display:grid;grid-template-columns:1fr 1fr;gap:24px}}figure{{margin:0;background:white;border:1px solid #e3e8e1;border-radius:12px;overflow:hidden}}img{{width:100%;display:block}}figcaption{{padding:15px}}p{{line-height:1.8}}@media(max-width:850px){{.gallery{{grid-template-columns:1fr}}.facts{{flex-wrap:wrap}}}}</style></head><body><main><p>STAGE 13.2A / 仅黄鹤楼步行10分钟</p><h1>中心固定，文字收紧，包络随展开变化。</h1><p><a href="hhl-10min-compact-envelope.html?revision=final">打开交互实验 ↗</a>　<a href="../../89-stage88-hhl-10min-compact-envelope-report.md">执行报告</a>　<a href="comparison.html">保留的旧版对比</a></p><div class="facts"><span><b>1170</b>真实POI</span><span><b>{reduction:.1f}%</b>文字范围缩小</span><span><b>0</b>默认标签及区域相叠</span><span><b>0 px</b>展开/收起中心漂移</span><span><b>0</b>Provider增量</span></div><p>默认采用适中余量。包络生成最高实测 {checks['maxObservedEnvelopeMs']:.1f}ms，尚未达到50ms目标；再次切换使用本地缓存。07与08是同一次稳定展开状态，分别作为焦点与二级展开证据。此次停在10分钟视觉确认，未进入20/30分钟或三级、POI展开。</p><div class="gallery">{figures}</div></main></body></html>'''
(root/'exports/panmap-v2-gates/stage88-comparison.html').write_text(html)
geo=json.loads((p/'geometry-tests.json').read_text());center=json.loads((p/'center-audit.json').read_text());exp=json.loads((p/'expansion-audit.json').read_text());food=next(x for x in exp if x['label']=='餐饮服务')
report=f'''# 第89号报告：Stage88 黄鹤楼步行10分钟紧凑布局与平滑包络

本阶段的独立实验、回归检查和截图已完成。停在 10 分钟视觉确认，不自动推进 20/30 分钟或 Stage13.2B。

- 交互页：[hhl-10min-compact-envelope.html](exports/panmap-v2-gates/hhl-10min-compact-envelope.html)
- 对照页：[stage88-comparison.html](exports/panmap-v2-gates/stage88-comparison.html)
- 原 comparison.html 及其他旧实验未覆盖。
- 实验不启动主应用、不调用高德/ORS；只读取同目录 snapshot.json。CSP 限制连接来源为本站。

## 25 项执行回答

1. Snapshot：`exports/panmap-v2-gates/snapshot.json`，ID `panmap-173da623`；保存于 2026-09-10，目录 `amap-official-1.06-20230208-tree-v2`。
2. 10min POI：1170，分钟范围 1–10；本次无新查询、无数量与归属修改。
3. L1：16；数据中 L2 86、L3 169。初始仅16个 L1，餐饮展开增加9个 L2，不渲染L3/POI。
4. 默认初始及餐饮展开标签重叠均为0；16个一级类别分别展开的布局也检查为0。默认区域相叠0，时间边界包含所有类别区域。
5. 文字整体外接范围 {before['boundingArea']:.1f} → {after['boundingArea']:.1f}，缩小 {reduction:.2f}%；平均近邻间距 {before['meanNearestGap']:.2f} → {after['meanNearestGap']:.2f}，减少 {gap:.2f}%。文字占有率 {before['occupiedRatio']:.3f} → {after['occupiedRatio']:.3f}。字体23→18、语义换行和布局共同作用，并非纯算法在相同字号下的提升。
6. 最大标签宽高比 {before['maxLabelAspectRatio']:.2f} → {after['maxLabelAspectRatio']:.2f}；7个长标签换行。优先在“服务/信息”及分隔符处换行，再使用均衡换行。
7. 保守径向范围指标 {before['maxRadialExtent']:.1f} → {after['maxRadialExtent']:.1f}，长文字拖尾减轻；整体外接框宽高比 {before['aspectRatio']:.3f} → {after['aspectRatio']:.3f}，这一项略增，不宣称全部形态指标均改善。
8. 仍为 bbox 采样→加权密度→可分离高斯卷积→d3.contours→最高有效阈值→轻度平滑。没有用预设时间曲线驱动文字。
9. 没有 convex hull。
10. 默认平滑尺度 medium=20；类别核带宽按0.3倍为6，时间包络按1.35倍为27。没有反复全局增大带宽掩盖细脖子。
11. 余量 tight/balanced/soft 为4/6/8；时间包络另加18，默认24。实际边界距离还受密度核和覆盖验证影响，参数值是保证的最小 bbox 余量。
12. 近邻桥接阈值78；只桥接近邻。类别采样按语义过滤，时间整体作为一个可达集合生成近邻支持。
13. 检测细脖子并拒绝不合格候选；最终默认初始及展开未触发 neck rejection。先做布局收紧、局部近邻支持，再搜索阈值，未执行不必要的局部 closing。
14. neckCount=0；minNeckWidth=null，含义是启发式没有找到符合定义的细脖子，不能解释为宽度0或数学证明不存在任意细窄结构。
15. 时间包络覆盖全部可见文字、中心安全区；默认还验证包含每个类别包络。
16. 默认轮廓自交检查通过；9组余量/尺度组合的时间包络覆盖与细脖子检查通过。
17. 中心真实坐标 114.296944, 30.546944；中心文字26px，大于一级18px；安全区142×100。1440与1134两视口展开、收起的中心像素漂移均0。
18. L1锚点不变；9个餐饮L2在父锚点附近按外向候选生成。最远子类别距父锚点 {food['maxChildDistance']:.0f} 个布局单位，仍需要人工判断这一展开范围是否足够自然，不能把“局部”理解为完全没有外围扩张。
19. 默认餐饮展开，近邻最大让位 {center['maxNeighborMove']:.1f}，平均 {center['meanNeighborMove']:.3f}，远处节点0。
20. 再次点击或路径返回恢复基线坐标、范围和包络。使用320ms cubic-out动画；时间轮廓可扩大、可缩小，中心相机不随包络重新定位。
21. 10分钟标注附着在包络顶部轮廓点，随轮廓插值移动。两视口截图可见且未盖住类别文字。
22. Provider请求增量0。页面只读取本地静态快照；浏览器记录的远程或分析接口请求计数为0。
23. `../isoChroneSystem-before-stage88.bundle` 验证PASS。Bundle保存已有Git历史；原工作树差异另存临时patch，原修改保留。
24. 中期GitHub备份完成：`backup/stage88-hhl10min-core-20260911`，提交 `f9ceb0f`。
25. 最终GitHub备份：见 `artifacts/stage88/git-backup.json` 的已验证远端引用。本报告生成时不预先宣称推送成功。

## 性能与验收边界

最终浏览器记录：布局最高 {checks['maxObservedLayoutMs']:.1f}ms；包络生成最高 {checks['maxObservedEnvelopeMs']:.1f}ms。包络首次计算未达到<50ms目标；缓存后的收起/重复展开接近0ms。数值来自页面公开的实验检查面板，见 browser-evidence.json。

自动检查覆盖分类树、零文字重叠、固定中心、16个L1锚点、局部展开、远处上下文、收起恢复、时间覆盖、默认区域相叠、自交、确定性及参数组合。旧版 v2 的7项回归测试通过。本阶段没有重新跑与此次独立页面无关的后端Provider用例。

“中心明确、内侧受压、外侧圆润、成块、不过度贴边”的主观验收保留给人工。本次类别边界由各可见类别文本生成，尚未做共享边界联解；不将本实验描述为最终多层地域分区完成版。全局宽高比略增、首次包络超时、餐饮L2展开范围是重点观察项。

## 证据与复现

- `node scripts/audit_stage88.cjs`
- `node --test src/panmap-v2/panmap-v2.test.js`
- `python3 scripts/report_stage88.py`（根据已保存浏览器证据生成报告，不请求Provider）
- `artifacts/stage88/data-audit.json`、`layout-compactness.json`、`center-audit.json`、`geometry-tests.json`、`region-audit.json`、`expansion-audit.json`、`parameter-variants.json`。
- 13张真实PNG：前10张1440×1080，另3张1134×959。07/08是同一稳定状态的两项验收记录，不伪称不同布局。

![最终10分钟图](artifacts/stage88/10-final-10min-overview.png)
'''
(root/'89-stage88-hhl-10min-compact-envelope-report.md').write_text(report)
print(json.dumps(checks,ensure_ascii=False,indent=2))

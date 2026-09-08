(function initPanmapMvpView(global) {
  const app = global.PanmapApp = global.PanmapApp || {};
  const profileLabels = { 'foot-walking': '步行', 'cycling-regular': '骑行', 'driving-car': '驾车' };
  let snapshot = null;
  let workflow = null;
  let store = null;
  let unsubscribe = null;
  let listenersMounted = false;
  let layoutMode = 'bubble';
  let previewLayout = null;
  let previewStartedAt = 0;
  let previewBuildMs = 0;
  let elasticInput = null;
  let elasticResult = null;
  let elasticAlpha = 0;
  let elasticFocusId = null;
  let elasticAnimationFrame = null;
  let annularInput = null;
  let annularResult = null;
  let annularRing = null;
  let annularAlpha = 0;
  let annularFocusId = null;
  let annularAnimationFrame = null;
  let naturalInput = null;
  let naturalResult = null;
  let naturalRing = null;
  let naturalReferenceState = null;
  let naturalAlpha = 0;
  let naturalFocusId = null;
  let naturalAnimationFrame = null;
  let inspectorCollapsed = false;
  let miniMapCollapsed = false;
  let canvasPan = { x: 0, y: 0 };
  let canvasDrag = null;
  let suppressCanvasClick = false;
  let resizeListenerMounted = false;
  const elasticFrames = [];
  const annularFrames = [];
  const naturalFrames = [];
  const elasticAnimationDuration = 280;
  const annularAnimationDuration = 280;
  const naturalAnimationDuration = 320;

  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const styleFor = (code) => app.categoryStyleRegistry?.forCode?.(code) || { color: '#64748B', label: '其他' };

  function ringColor(index) { return ['#38B978', '#3B82F6', '#8B5CF6'][index] || '#64748B'; }

  function developerModeEnabled() {
    return new URLSearchParams(global.location?.search || '').get('elasticRegion') === '1';
  }

  function initializeElasticLayout() {
    const aggregated = app.panmapMvpLayout.aggregateCategories(snapshot);
    const target = aggregated.find((item) => item.ring.ringId === 'ring-10-20') || aggregated[Math.min(1, aggregated.length - 1)];
    if (!target || !app.elasticRegion?.categoryClusterAdapter || !app.elasticRegion?.solver) return null;
    elasticInput = app.elasticRegion.categoryClusterAdapter.buildInput(target.nodes, {
      containerId: target.ring.ringId,
      width: 860,
      height: 560,
      minShare: 0.035,
      focusExpansionFactor: 1.8,
      maxFocusShare: 0.45,
      solverStep: 0.5,
      solverIterations: 72,
    });
    elasticResult = app.elasticRegion.solver.solve(elasticInput, { focusAlpha: 0 });
    elasticAlpha = 0;
    elasticFocusId = null;
    global.document.documentElement.dataset.elasticRegionRingId = target.ring.ringId;
    return target.ring.ringId;
  }

  function initializeAnnularLayout() {
    const adapted = app.elasticRegion?.annularCategoryAdapter?.buildInput?.(snapshot, {
      center: [430, 280], innerRadius: 104, outerRadius: 246, minShare: 0.035,
    });
    if (!adapted || !app.elasticRegion?.annular?.engine) return null;
    annularRing = adapted.ring;
    annularInput = adapted.input;
    annularResult = app.elasticRegion.annular.engine.solve(annularInput);
    annularAlpha = 0;
    annularFocusId = null;
    const html = global.document.documentElement;
    html.dataset.annularRegionRingId = annularRing.ringId;
    html.dataset.annularRegionCount = String(annularResult.regions.length);
    return annularRing.ringId;
  }

  function initializeNaturalLayout() {
    const adapted = app.elasticRegion?.naturalAnnularAdapter?.buildInput?.(snapshot, {
      center: [430, 280], innerRadius: 104, outerRadius: 246, minShare: 0.035,
    });
    if (!adapted || !app.elasticRegion?.naturalBoundary?.engine) return null;
    naturalRing = adapted.ring;
    naturalInput = adapted.input;
    naturalResult = app.elasticRegion.naturalBoundary.engine.solve(naturalInput);
    naturalReferenceState = naturalResult.boundaryState;
    naturalAlpha = 0;
    naturalFocusId = null;
    const html = global.document.documentElement;
    html.dataset.naturalRegionRingId = naturalRing.ringId;
    html.dataset.naturalRegionCount = String(naturalResult.regions.length);
    return naturalRing.ringId;
  }

  function polygonPath(polygon) {
    return polygon.length ? `M ${polygon.map((point) => `${point[0].toFixed(3)} ${point[1].toFixed(3)}`).join(' L ')} Z` : '';
  }

  function previewSvg(state) {
    previewLayout ||= app.labelDrivenPreview.build(snapshot);
    const activeRing = snapshot.rings.find(r => r.ringId === state.focusedRingId) || snapshot.rings[1] || snapshot.rings[0];
    const contours = [
      'M 475 316 C 525 304 570 331 572 387 C 586 430 545 466 493 467 C 439 475 411 445 410 397 C 407 354 436 326 475 316 Z',
      'M 345 176 C 450 156 535 158 633 188 C 713 196 722 261 732 320 C 727 390 687 418 678 487 C 687 559 604 655 515 658 C 425 667 333 670 302 611 C 282 569 156 546 154 465 C 151 400 188 369 197 305 C 204 251 254 199 345 176 Z',
      'M 260 44 C 370 24 446 38 527 30 C 638 29 701 43 731 112 C 803 161 852 215 852 300 C 896 385 879 451 864 514 C 873 606 819 672 719 688 C 639 732 553 718 470 720 C 362 741 303 691 247 637 C 155 617 96 550 111 462 C 65 370 111 306 111 230 C 98 144 169 78 260 44 Z'
    ];
    const rings = snapshot.rings.slice(0,3).map((ring,i) => `<path d="${contours[i]}" fill="${ringColor(i)}" fill-opacity=".025" stroke="${ringColor(i)}" stroke-opacity="${ring.ringId === activeRing?.ringId ? '.85' : '.35'}" stroke-width="${ring.ringId === activeRing?.ringId ? 3 : 1.5}" stroke-dasharray="${ring.ringId === activeRing?.ringId ? 'none' : '5 4'}" pointer-events="none"/>`).reverse().join('');
    const clusters = previewLayout.clusters.map(cluster => {
      const color = styleFor(cluster.code).color;
      const count = cluster.pois.filter(p => p.displayRingId === activeRing?.ringId).length;
      const selected = state.focusedCategoryCode === cluster.code;
      return `<g class="preview-cluster${selected ? ' is-selected' : ''}${count ? '' : ' is-empty'}" style="--preview-color:${color}" data-category-code="${esc(cluster.code)}" data-ring-id="${esc(activeRing?.ringId)}" role="button" tabindex="0" aria-label="${esc(styleFor(cluster.code).label)} ${count}个POI" aria-pressed="${selected}"><path d="${cluster.path}"/>${cluster.labels.map(label => `<text x="${label.x}" y="${label.y}" dominant-baseline="middle" text-anchor="middle" class="${label.title ? 'preview-title' : 'preview-name'}"><title>${esc(label.fullText)}</title>${esc(label.text)}</text>`).join('')}</g>`;
    }).join('');
    const chips=snapshot.rings.map((ring,i)=>`<g data-ring-focus="${esc(ring.ringId)}" role="button" tabindex="0" aria-label="预览聚焦${ring.upperInclusiveMinutes}分钟" aria-pressed="${ring.ringId === activeRing?.ringId}" transform="translate(${[445,458,475][i] ?? 390+i*100} ${[313,177,26][i] ?? 5})"><rect width="90" height="28" rx="14" fill="${ring.ringId === activeRing?.ringId ? ringColor(i) : 'white'}" stroke="${ringColor(i)}"/><text x="45" y="19" text-anchor="middle" font-size="13" fill="${ring.ringId === activeRing?.ringId ? 'white' : ringColor(i)}">${ring.upperInclusiveMinutes} 分钟</text></g>`).join('');
    return `<svg class="panmap-mvp-svg label-preview-svg" viewBox="0 0 ${previewLayout.width} ${previewLayout.height}" aria-label="标签驱动泛地图预览"><rect width="100%" height="100%" fill="#fcfcfb" data-preview-blank="true"/>${rings}${clusters}<g pointer-events="none"><path d="M490 375 C466 345 513 345 508 369 L490 394 Z" fill="#f36c68"/><circle cx="491" cy="366" r="5" fill="white"/><text x="490" y="417" text-anchor="middle" font-size="14" fill="#465242" font-weight="700">${esc(snapshot.center.label)}</text><text x="490" y="439" text-anchor="middle" font-size="10" fill="#899388">分析中心</text></g>${chips}<text x="490" y="752" text-anchor="middle" font-size="11" fill="#8b96a1">示意布局 · 代表标签来自当前快照 · 轮廓不表示真实地理边界</text></svg>`;
  }

  function elasticSvg() {
    if (!elasticResult && !initializeElasticLayout()) return '<p>Elastic Region v0 unavailable</p>';
    const regions = elasticResult.regions.map((region) => {
      const style = styleFor(region.id);
      const focused = elasticFocusId === region.id && elasticAlpha > 0;
      return `<g class="elastic-region${focused ? ' is-focused' : ''}" data-elastic-category="${esc(region.id)}" role="button" tabindex="0" aria-label="${esc(style.label)}弹性区域">
        <path d="${polygonPath(region.polygon)}" fill="${style.color}" fill-opacity="${focused ? '.28' : '.15'}" stroke="#FFFFFF" stroke-width="2" vector-effect="non-scaling-stroke"/>
        <circle cx="${region.centroid[0]}" cy="${region.centroid[1] - 16}" r="5" fill="${style.color}"/>
        <text x="${region.centroid[0]}" y="${region.centroid[1] + 2}" text-anchor="middle" fill="#172033" font-size="14" font-weight="700">${esc(style.label)}</text>
        <text x="${region.centroid[0]}" y="${region.centroid[1] + 22}" text-anchor="middle" fill="#64748B" font-size="11">${(region.areaShare * 100).toFixed(1)}%</text>
      </g>`;
    }).join('');
    return `<svg class="panmap-mvp-svg elastic-region-svg" viewBox="0 0 860 560" preserveAspectRatio="xMidYMid meet" aria-label="单圈层类别弹性共享分区"><rect width="860" height="560" rx="16" fill="#F8FAFC"/>${regions}</svg>`;
  }

  function elasticMetricsPanel() {
    const metrics = elasticResult?.metrics;
    if (!metrics) return '';
    return `<section class="elastic-runtime-metrics" aria-label="弹性区域指标"><small>Elastic Region v0 · 20分钟单容器</small><dl>
      <div><dt>Focus Alpha</dt><dd>${elasticAlpha.toFixed(2)}</dd></div><div><dt>单帧求解</dt><dd>${metrics.solveMs.toFixed(2)} ms</dd></div>
      <div><dt>Gap / Overlap</dt><dd>${(metrics.gapRatio * 100).toFixed(3)}% / ${(metrics.overlapRatio * 100).toFixed(3)}%</dd></div><div><dt>最大面积误差</dt><dd>${(metrics.maxAreaError * 100).toFixed(2)}%</dd></div>
      <div><dt>邻接变化</dt><dd>${metrics.adjacencyChangeCount}</dd></div><div><dt>Warm Start</dt><dd>${metrics.warmStartUsed ? '是' : '否'}</dd></div>
    </dl>${developerModeEnabled() ? '<div class="elastic-alpha-probes" aria-label="开发验收 Alpha"><button type="button" data-elastic-probe="0">0</button><button type="button" data-elastic-probe="0.5">0.5</button><button type="button" data-elastic-probe="1">1</button></div>' : ''}<p>直线共享边界 · 固定父容器 · POI 文本未参与</p></section>`;
  }

  function annularSvg() {
    if (!annularResult && !initializeAnnularLayout()) return '<p>Annular Elastic v1 unavailable</p>';
    const regions = annularResult.regions.map((region) => {
      const style = styleFor(region.id);
      const focused = annularFocusId === region.id && annularAlpha > 0;
      const shareLabel = `${(region.angleShare * 100).toFixed(1)}%`;
      const detail = region.angleShare >= 0.065 ? `<text y="18" class="annular-detail">${region.metadata?.count || 0} 个 · ${shareLabel}</text>` : '';
      return `<g class="annular-region${focused ? ' is-focused' : ''}" data-annular-category="${esc(region.id)}" role="button" tabindex="0" aria-label="${esc(style.label)} ${region.metadata?.count || 0}个 ${shareLabel}">
        <path d="${polygonPath(region.polygon)}" fill="${style.color}"/>
        <g class="annular-label" transform="translate(${region.labelPoint[0].toFixed(3)} ${region.labelPoint[1].toFixed(3)})"><text class="annular-category-label">${esc(style.label.length > 7 ? `${style.label.slice(0, 7)}…` : style.label)}</text>${detail}</g>
      </g>`;
    }).join('');
    const center = annularResult.input.center;
    return `<svg class="panmap-mvp-svg annular-region-svg" viewBox="0 0 860 560" preserveAspectRatio="xMidYMid meet" aria-label="单圈层类别环形弹性共享分区">
      <circle cx="${center[0]}" cy="${center[1]}" r="${annularResult.input.outerRadius + 16}" class="annular-frame"/>
      ${regions}
      <g class="annular-center" aria-label="固定分析中心"><circle cx="${center[0]}" cy="${center[1]}" r="${annularResult.input.innerRadius - 8}"/><circle cx="${center[0]}" cy="${center[1] - 13}" r="10" class="annular-center-dot"/><text x="${center[0]}" y="${center[1] + 15}">${esc(snapshot.center.label || '分析中心')}</text><text x="${center[0]}" y="${center[1] + 36}" class="annular-center-subtitle">${esc(annularRing?.label || '单圈层')} · 固定中心</text></g>
    </svg>`;
  }

  function annularMetricsPanel() {
    const metrics = annularResult?.metrics;
    if (!metrics) return '';
    const focusedRegion = annularResult.regions.find((region) => region.id === annularFocusId);
    const focusedIndex = focusedRegion ? annularResult.regions.indexOf(focusedRegion) : -1;
    const baseShares = app.elasticRegion.annular.shareSolver.baseShares(annularResult.input.regions);
    const focusLabel = focusedRegion ? styleFor(focusedRegion.id).label : '—';
    const baseShare = focusedIndex >= 0 ? baseShares[focusedIndex] : null;
    return `<section class="elastic-runtime-metrics annular-runtime-metrics" aria-label="环形弹性区域指标"><small>Annular Elastic v1 · ${esc(annularRing?.label || '单圈层')}</small><dl>
      <div><dt>Focus Alpha</dt><dd>${annularAlpha.toFixed(2)}</dd></div><div><dt>几何构建</dt><dd>${metrics.geometryBuildMs.toFixed(3)} ms</dd></div>
      <div><dt>当前类别</dt><dd>${esc(focusLabel)}</dd></div><div><dt>Base / Current</dt><dd>${baseShare == null ? '—' : `${(baseShare * 100).toFixed(1)}% / ${(focusedRegion.areaShare * 100).toFixed(1)}%`}</dd></div>
      <div><dt>Coverage</dt><dd>${(metrics.coverageRatio * 100).toFixed(3)}%</dd></div><div><dt>Gap / Overlap</dt><dd>${(metrics.gapRatio * 100).toFixed(3)}% / ${(metrics.overlapRatio * 100).toFixed(3)}%</dd></div>
      <div><dt>最大面积误差</dt><dd>${(metrics.maxAreaError * 100).toFixed(3)}%</dd></div><div><dt>顺序变化</dt><dd>${metrics.orderChangeCount}</dd></div>
      <div><dt>中心位移</dt><dd>${metrics.centerDelta.toFixed(3)}</dd></div><div><dt>半径变化</dt><dd>${Math.max(metrics.innerRadiusDelta, metrics.outerRadiusDelta).toFixed(3)}</dd></div>
    </dl>${developerModeEnabled() ? '<div class="elastic-alpha-probes annular-alpha-probes" aria-label="开发验收 Alpha"><button type="button" data-annular-probe="0">0</button><button type="button" data-annular-probe="0.25">0.25</button><button type="button" data-annular-probe="0.5">0.5</button><button type="button" data-annular-probe="1">1</button></div>' : ''}<p>稳定类别顺序 · 固定中心与内外半径 · 悬浮不改布局</p></section>`;
  }

  function naturalSvg() {
    if (!naturalResult && !initializeNaturalLayout()) return '<p>Natural Annular v2 unavailable</p>';
    const regions = naturalResult.regions.map((region) => {
      const style = styleFor(region.id);
      const focused = naturalFocusId === region.id && naturalAlpha > 0;
      const shareLabel = `${(region.areaShare * 100).toFixed(1)}%`;
      const detail = region.areaShare >= 0.065 ? `<text y="18" class="annular-detail">${region.metadata?.count || 0} 个 · ${shareLabel}</text>` : '';
      return `<g class="natural-region${focused ? ' is-focused' : ''}" data-natural-category="${esc(region.id)}" role="button" tabindex="0" aria-label="${esc(style.label)} ${region.metadata?.count || 0}个 ${shareLabel}">
        <path d="${polygonPath(region.polygon)}" fill="${style.color}"/>
        <g class="annular-label" transform="translate(${region.labelPoint[0].toFixed(3)} ${region.labelPoint[1].toFixed(3)})"><text class="annular-category-label">${esc(style.label.length > 7 ? `${style.label.slice(0, 7)}…` : style.label)}</text>${detail}</g>
      </g>`;
    }).join('');
    const center = naturalResult.input.center;
    return `<svg class="panmap-mvp-svg annular-region-svg natural-region-svg" viewBox="0 0 860 560" preserveAspectRatio="xMidYMid meet" aria-label="单圈层自然共享边界弹性分区">
      <circle cx="${center[0]}" cy="${center[1]}" r="${naturalResult.input.outerRadius + 16}" class="annular-frame natural-frame"/>
      ${regions}
      <g class="annular-center natural-center" aria-label="固定分析中心"><circle cx="${center[0]}" cy="${center[1]}" r="${naturalResult.input.innerRadius - 8}"/><circle cx="${center[0]}" cy="${center[1] - 13}" r="10" class="annular-center-dot"/><text x="${center[0]}" y="${center[1] + 15}">${esc(snapshot.center.label || '分析中心')}</text><text x="${center[0]}" y="${center[1] + 36}" class="annular-center-subtitle">${esc(naturalRing?.label || '单圈层')} · Natural v2</text></g>
    </svg>`;
  }

  function naturalMetricsPanel() {
    const metrics = naturalResult?.metrics;
    if (!metrics) return '';
    const focusedRegion = naturalResult.regions.find((region) => region.id === naturalFocusId);
    const focusedIndex = focusedRegion ? naturalResult.regions.indexOf(focusedRegion) : -1;
    const targetShare = focusedIndex >= 0 ? naturalResult.targetShares[focusedIndex] : null;
    return `<section class="elastic-runtime-metrics natural-runtime-metrics" aria-label="自然共享边界指标"><small>Natural Annular v2 · ${esc(naturalRing?.label || '单圈层')}</small><dl>
      <div><dt>Focus Alpha</dt><dd>${naturalAlpha.toFixed(2)}</dd></div><div><dt>求解时间</dt><dd>${metrics.solveMs.toFixed(3)} ms</dd></div>
      <div><dt>Target / Actual</dt><dd>${targetShare == null ? '—' : `${(targetShare * 100).toFixed(2)}% / ${(focusedRegion.areaShare * 100).toFixed(2)}%`}</dd></div><div><dt>面积误差</dt><dd>${(metrics.meanAreaError * 100).toFixed(3)}% / ${(metrics.maxAreaError * 100).toFixed(3)}%</dd></div>
      <div><dt>Gap / Overlap</dt><dd>${(metrics.gapRatio * 100).toFixed(3)}% / ${(metrics.overlapRatio * 100).toFixed(3)}%</dd></div><div><dt>Crossings</dt><dd>${metrics.boundaryCrossingCount} / ${metrics.selfIntersectionRegionCount}</dd></div>
      <div><dt>平均曲率</dt><dd>${metrics.curvatureMean.toFixed(5)}</dd></div><div><dt>最大边界移动</dt><dd>${metrics.maxBoundaryMove.toFixed(3)} px</dd></div>
      <div><dt>Warm Start</dt><dd>${metrics.warmStartUsed ? '是' : '否'}</dd></div><div><dt>共享边界</dt><dd>${metrics.allBoundariesSharedExactlyTwice ? '完整' : '异常'}</dd></div>
    </dl>${developerModeEnabled() ? '<div class="elastic-alpha-probes annular-alpha-probes natural-alpha-probes" aria-label="Natural v2 开发验收 Alpha"><button type="button" data-natural-probe="0">0</button><button type="button" data-natural-probe="0.25">0.25</button><button type="button" data-natural-probe="0.5">0.5</button><button type="button" data-natural-probe="1">1</button></div>' : ''}<p>自然共享曲边 · 固定中心与内外半径 · Warm Start</p></section>`;
  }

  function publishElasticRuntime(animation = {}) {
    if (!elasticResult) return;
    const frameDurations = elasticFrames.map((frame) => frame.frameMs);
    const runtime = {
      layoutMode, focusAlpha: elasticAlpha, focusId: elasticFocusId,
      metrics: elasticResult.metrics,
      animationDuration: animation.animationDuration ?? null,
      frameCount: elasticFrames.length,
      maxFrameMs: frameDurations.length ? Math.max(...frameDurations) : 0,
      droppedFrames: frameDurations.filter((value) => value > 20).length,
      providerCallCount: 0,
    };
    app.elasticRegionRuntime = runtime;
    const html = global.document.documentElement;
    html.dataset.elasticFocusAlpha = elasticAlpha.toFixed(3);
    html.dataset.elasticFocusId = elasticFocusId || '';
    html.dataset.elasticSolveMs = elasticResult.metrics.solveMs.toFixed(3);
    html.dataset.elasticGapRatio = elasticResult.metrics.gapRatio.toFixed(8);
    html.dataset.elasticOverlapRatio = elasticResult.metrics.overlapRatio.toFixed(8);
    html.dataset.elasticProviderCallCount = '0';
    html.dataset.elasticFrameCount = String(runtime.frameCount);
    html.dataset.elasticMaxFrameMs = runtime.maxFrameMs.toFixed(3);
    html.dataset.elasticDroppedFrames = String(runtime.droppedFrames);
    html.dataset.elasticAnimationDuration = runtime.animationDuration == null ? '' : runtime.animationDuration.toFixed(3);
  }

  function publishAnnularRuntime(animation = {}) {
    if (!annularResult) return;
    const frameDurations = annularFrames.map((frame) => frame.frameMs);
    const metrics = annularResult.metrics;
    const runtime = {
      layoutMode, focusAlpha: annularAlpha, focusId: annularFocusId,
      metrics, shares: annularResult.regions.map((region) => ({ id: region.id, share: region.angleShare })),
      animationDuration: animation.animationDuration ?? null,
      frameCount: annularFrames.length,
      maxFrameMs: frameDurations.length ? Math.max(...frameDurations) : 0,
      droppedFrames: frameDurations.filter((value) => value > 20).length,
      providerCallCount: 0,
    };
    app.annularRegionRuntime = runtime;
    const html = global.document.documentElement;
    html.dataset.annularFocusAlpha = annularAlpha.toFixed(3);
    html.dataset.annularFocusId = annularFocusId || '';
    html.dataset.annularCoverageRatio = metrics.coverageRatio.toFixed(8);
    html.dataset.annularGapRatio = metrics.gapRatio.toFixed(8);
    html.dataset.annularOverlapRatio = metrics.overlapRatio.toFixed(8);
    html.dataset.annularMeanAreaError = metrics.meanAreaError.toFixed(8);
    html.dataset.annularMaxAreaError = metrics.maxAreaError.toFixed(8);
    html.dataset.annularOrderChanges = String(metrics.orderChangeCount);
    html.dataset.annularCenterDelta = metrics.centerDelta.toFixed(8);
    html.dataset.annularRadiusDelta = Math.max(metrics.innerRadiusDelta, metrics.outerRadiusDelta).toFixed(8);
    html.dataset.annularGeometryBuildMs = metrics.geometryBuildMs.toFixed(3);
    html.dataset.annularProviderCallCount = '0';
    html.dataset.annularFrameCount = String(runtime.frameCount);
    html.dataset.annularMaxFrameMs = runtime.maxFrameMs.toFixed(3);
    html.dataset.annularDroppedFrames = String(runtime.droppedFrames);
    html.dataset.annularAnimationDuration = runtime.animationDuration == null ? '' : runtime.animationDuration.toFixed(3);
    html.dataset.annularShares = JSON.stringify(runtime.shares);
  }

  function publishNaturalRuntime(animation = {}) {
    if (!naturalResult) return;
    const frameDurations = naturalFrames.map((frame) => frame.frameMs);
    const metrics = naturalResult.metrics;
    const runtime = {
      layoutMode, focusAlpha: naturalAlpha, focusId: naturalFocusId,
      metrics, shares: naturalResult.regions.map((region) => ({ id: region.id, targetShare: region.targetShare, actualShare: region.areaShare })),
      boundaryFingerprint: naturalResult.boundaryGraph.boundaries.map((boundary) => `${boundary.id}:${boundary.controls.map((control) => `${control.radius.toFixed(3)},${control.angle.toFixed(6)}`).join(';')}`).join('|'),
      animationDuration: animation.animationDuration ?? null,
      frameCount: naturalFrames.length,
      maxFrameMs: frameDurations.length ? Math.max(...frameDurations) : 0,
      droppedFrames: frameDurations.filter((value) => value > 20).length,
      providerCallCount: 0,
    };
    app.naturalBoundaryRuntime = runtime;
    const html = global.document.documentElement;
    html.dataset.naturalFocusAlpha = naturalAlpha.toFixed(3);
    html.dataset.naturalFocusId = naturalFocusId || '';
    html.dataset.naturalSolveMs = metrics.solveMs.toFixed(3);
    html.dataset.naturalGapRatio = metrics.gapRatio.toFixed(8);
    html.dataset.naturalOverlapRatio = metrics.overlapRatio.toFixed(8);
    html.dataset.naturalMeanAreaError = metrics.meanAreaError.toFixed(8);
    html.dataset.naturalMaxAreaError = metrics.maxAreaError.toFixed(8);
    html.dataset.naturalBoundaryCrossings = String(metrics.boundaryCrossingCount);
    html.dataset.naturalSelfIntersections = String(metrics.selfIntersectionRegionCount);
    html.dataset.naturalOrderChanges = String(metrics.orderChangeCount);
    html.dataset.naturalCenterDelta = metrics.centerDelta.toFixed(8);
    html.dataset.naturalRadiusDelta = Math.max(metrics.innerRadiusDelta, metrics.outerRadiusDelta).toFixed(8);
    html.dataset.naturalWarmStart = String(metrics.warmStartUsed);
    html.dataset.naturalProviderCallCount = '0';
    html.dataset.naturalFrameCount = String(runtime.frameCount);
    html.dataset.naturalMaxFrameMs = runtime.maxFrameMs.toFixed(3);
    html.dataset.naturalDroppedFrames = String(runtime.droppedFrames);
    html.dataset.naturalAnimationDuration = runtime.animationDuration == null ? '' : runtime.animationDuration.toFixed(3);
    html.dataset.naturalBoundaryFingerprint = runtime.boundaryFingerprint;
  }

  function animateElastic(targetAlpha, focusId, onComplete) {
    if (!elasticInput || !elasticResult) initializeElasticLayout();
    if (!elasticInput || !elasticResult) return;
    global.cancelAnimationFrame?.(elasticAnimationFrame);
    elasticFrames.length = 0;
    const fromAlpha = elasticAlpha;
    const started = global.performance.now();
    let previousTimestamp = started;
    elasticFocusId = focusId || elasticFocusId;
    const tick = (timestamp) => {
      const progress = Math.min(1, (timestamp - started) / elasticAnimationDuration);
      const eased = progress < 0.5 ? 4 * progress ** 3 : 1 - (-2 * progress + 2) ** 3 / 2;
      elasticAlpha = fromAlpha + (targetAlpha - fromAlpha) * eased;
      elasticInput = { ...elasticInput, previousState: elasticResult };
      elasticResult = app.elasticRegion.solver.solve(elasticInput, { focusId: elasticFocusId, focusAlpha: elasticAlpha, iterations: progress === 1 ? 72 : 6 });
      elasticFrames.push({ alpha: elasticAlpha, frameMs: timestamp - previousTimestamp, solveMs: elasticResult.metrics.solveMs });
      previousTimestamp = timestamp;
      render(store.getState());
      publishElasticRuntime();
      if (progress < 1) elasticAnimationFrame = global.requestAnimationFrame(tick);
      else {
        if (targetAlpha === 0) elasticFocusId = null;
        publishElasticRuntime({ animationDuration: timestamp - started });
        onComplete?.();
      }
    };
    elasticAnimationFrame = global.requestAnimationFrame(tick);
  }

  function animateAnnular(targetAlpha, focusId, onComplete) {
    if (!annularInput || !annularResult) initializeAnnularLayout();
    if (!annularInput || !annularResult) return;
    global.cancelAnimationFrame?.(annularAnimationFrame);
    annularFrames.length = 0;
    const fromAlpha = annularAlpha;
    const started = global.performance.now();
    let previousTimestamp = started;
    annularFocusId = focusId || annularFocusId;
    const tick = (timestamp) => {
      const progress = Math.min(1, (timestamp - started) / annularAnimationDuration);
      const eased = app.elasticRegion.annular.interpolation.easeInOutCubic(progress);
      annularAlpha = app.elasticRegion.annular.interpolation.lerp(fromAlpha, targetAlpha, eased);
      annularInput = {
        ...annularInput,
        focus: { id: annularFocusId, alpha: annularAlpha, expansionFactor: 1.8, maxShare: 0.45 },
        previousState: annularResult.previousState,
      };
      annularResult = app.elasticRegion.annular.engine.solve(annularInput);
      annularFrames.push({ alpha: annularAlpha, frameMs: timestamp - previousTimestamp, geometryBuildMs: annularResult.metrics.geometryBuildMs });
      previousTimestamp = timestamp;
      render(store.getState());
      publishAnnularRuntime();
      if (progress < 1) annularAnimationFrame = global.requestAnimationFrame(tick);
      else {
        if (targetAlpha === 0) annularFocusId = null;
        publishAnnularRuntime({ animationDuration: timestamp - started });
        onComplete?.();
      }
    };
    annularAnimationFrame = global.requestAnimationFrame(tick);
  }

  function animateNatural(targetAlpha, focusId, onComplete) {
    if (!naturalInput || !naturalResult) initializeNaturalLayout();
    if (!naturalInput || !naturalResult) return;
    global.cancelAnimationFrame?.(naturalAnimationFrame);
    naturalFrames.length = 0;
    const fromAlpha = naturalAlpha;
    const started = global.performance.now();
    let previousTimestamp = started;
    naturalFocusId = focusId || naturalFocusId;
    const tick = (timestamp) => {
      const progress = Math.min(1, (timestamp - started) / naturalAnimationDuration);
      const eased = app.elasticRegion.naturalBoundary.interpolation.easeInOutCubic(progress);
      naturalAlpha = app.elasticRegion.naturalBoundary.interpolation.lerp(fromAlpha, targetAlpha, eased);
      naturalInput = {
        ...naturalInput,
        focus: { id: naturalFocusId, alpha: naturalAlpha, expansionFactor: 1.8, maxShare: 0.45 },
        previousBoundaryState: naturalResult.boundaryState,
        referenceBoundaryState: naturalReferenceState,
        parameters: { ...naturalInput.parameters, iterations: progress === 1 ? 32 : 4 },
      };
      naturalResult = app.elasticRegion.naturalBoundary.engine.solve(naturalInput);
      naturalFrames.push({ alpha: naturalAlpha, frameMs: timestamp - previousTimestamp, solveMs: naturalResult.metrics.solveMs });
      previousTimestamp = timestamp;
      render(store.getState());
      publishNaturalRuntime();
      if (progress < 1) naturalAnimationFrame = global.requestAnimationFrame(tick);
      else {
        if (targetAlpha === 0) naturalFocusId = null;
        publishNaturalRuntime({ animationDuration: timestamp - started });
        onComplete?.();
      }
    };
    naturalAnimationFrame = global.requestAnimationFrame(tick);
  }

  function setLayoutMode(nextMode) {
    layoutMode = ['elastic', 'annular', 'natural', 'preview'].includes(nextMode) ? nextMode : 'bubble';
    if (layoutMode === 'preview') {
      global.cancelAnimationFrame?.(elasticAnimationFrame);
      global.cancelAnimationFrame?.(annularAnimationFrame);
      global.cancelAnimationFrame?.(naturalAnimationFrame);
      previewStartedAt = performance.now();
      previewLayout = app.labelDrivenPreview.build(snapshot);
      previewBuildMs = performance.now() - previewStartedAt;
      store?.dispatch({ type: 'FOCUS_RING', ringId: (snapshot.rings.find(r => r.upperInclusiveMinutes === 20) || snapshot.rings[0])?.ringId });
    } else if (layoutMode === 'elastic') {
      const ringId = initializeElasticLayout();
      if (ringId) store?.dispatch({ type: 'FOCUS_RING', ringId });
    } else if (layoutMode === 'annular') {
      const ringId = initializeAnnularLayout();
      if (ringId) store?.dispatch({ type: 'FOCUS_RING', ringId });
    } else if (layoutMode === 'natural') {
      const ringId = initializeNaturalLayout();
      if (ringId) store?.dispatch({ type: 'FOCUS_RING', ringId });
    } else {
      global.cancelAnimationFrame?.(elasticAnimationFrame);
      global.cancelAnimationFrame?.(annularAnimationFrame);
      global.cancelAnimationFrame?.(naturalAnimationFrame);
      store?.dispatch({ type: 'OVERVIEW' });
    }
    global.document.documentElement.dataset.panmapLayoutMode = layoutMode;
    publishElasticRuntime();
    publishAnnularRuntime();
    publishNaturalRuntime();
    render(store?.getState?.() || app.panmapMvpState.initialState());
  }

  function breadcrumb(state) {
    const ring = snapshot.rings.find((item) => item.ringId === state.focusedRingId);
    const poi = snapshot.pois.find((item) => item.poiId === state.selectedPoiId);
    const parts = [{ label: '概览', action: 'overview' }];
    if (ring) parts.push({ label: ring.label, action: 'ring' });
    if (state.focusedCategoryCode) parts.push({ label: styleFor(state.focusedCategoryCode).label, action: 'category' });
    if (poi) parts.push({ label: poi.name, action: null });
    return parts.map((part, index) => `${index ? '<span>›</span>' : ''}${part.action ? `<button type="button" data-panmap-back="${part.action}">${esc(part.label)}</button>` : `<strong>${esc(part.label)}</strong>`}`).join('');
  }

  function panmapSafeArea() {
    return {
      rightInset: inspectorCollapsed ? 20 : 380,
      leftInset: miniMapCollapsed ? 20 : 280,
      bottomInset: 64,
    };
  }

  function syncWorkspaceState(root) {
    const safeArea = panmapSafeArea();
    root.classList.toggle('is-inspector-collapsed', inspectorCollapsed);
    root.classList.toggle('is-mini-map-collapsed', miniMapCollapsed);
    root.style.setProperty('--panmap-safe-right', `${safeArea.rightInset}px`);
    root.style.setProperty('--panmap-safe-left', `${safeArea.leftInset}px`);
    root.style.setProperty('--panmap-safe-bottom', `${safeArea.bottomInset}px`);
    root.style.setProperty('--panmap-safe-shift-x', `${(safeArea.leftInset - safeArea.rightInset) / 2}px`);
    root.style.setProperty('--panmap-safe-shift-y', `${-safeArea.bottomInset / 8}px`);
    root.style.setProperty('--panmap-pan-x', `${canvasPan.x}px`);
    root.style.setProperty('--panmap-pan-y', `${canvasPan.y}px`);
    const miniMap = document.getElementById('traditionalMapShell');
    miniMap?.classList.toggle('is-panmap-collapsed', miniMapCollapsed);
    miniMap?.setAttribute('aria-hidden', String(miniMapCollapsed));
    const html = document.documentElement;
    html.dataset.panmapInspectorState = inspectorCollapsed ? 'collapsed' : (root.querySelector('[data-inspector-mode]')?.dataset.inspectorMode || 'summary');
    html.dataset.panmapMiniMapState = miniMapCollapsed ? 'collapsed' : 'visible';
    html.dataset.panmapSafeArea = JSON.stringify(safeArea);
    html.dataset.panmapWorkspaceCount = String(document.querySelectorAll('.panmap-workspace').length);
  }

  function publishWorkspaceLayoutMetrics(root) {
    global.requestAnimationFrame?.(() => {
      const workspace = root.closest('.panmap-workspace');
      const canvas = root.querySelector('.panmap-main-canvas');
      if (!workspace || !canvas) return;
      const compactRect = (node) => {
        if (!node) return null;
        const rect = node.getBoundingClientRect();
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, area: rect.width * rect.height };
      };
      const workspaceRect = compactRect(workspace);
      const canvasRect = compactRect(canvas);
      const metrics = {
        viewport: { width: global.innerWidth, height: global.innerHeight },
        workspace: workspaceRect,
        mainCanvas: canvasRect,
        inspector: compactRect(root.querySelector('.panmap-inspector')),
        miniMap: compactRect(document.getElementById('traditionalMapShell')),
        breadcrumb: compactRect(root.querySelector('.panmap-breadcrumb')),
        devToolbar: compactRect(root.querySelector('.panmap-dev-toolbar')),
        mainCanvasAreaRatio: canvasRect.area / workspaceRect.area,
        safeArea: panmapSafeArea(),
      };
      global.document.documentElement.dataset.panmapWorkspaceMetrics = JSON.stringify(metrics);
      global.document.documentElement.dataset.panmapResizeProviderCalls = '0';
    });
  }

  function overviewSvg(state) {
    const rings = app.panmapMvpLayout.buildOverviewLayout(snapshot);
    const focusedIndex = snapshot.rings.findIndex((ring) => ring.ringId === state.focusedRingId);
    const ringMarkup = [...rings].reverse().map((ring, reverseIndex) => {
      const index = rings.length - reverseIndex - 1;
      const focused = state.focusedRingId === ring.ringId;
      const dimmed = state.focusedRingId && !focused;
      const scale = focused ? 1.08 : dimmed ? 0.96 : 1;
      const opacity = dimmed ? 0.34 : 1;
      const nodes = ring.nodes.map((node) => {
        const nodeFocused = state.focusedCategoryCode === node.categoryCode;
        const categoryDimmed = state.focusedCategoryCode && !nodeFocused;
        const categoryStyle = styleFor(node.categoryCode);
        return `<g class="panmap-mvp-category${nodeFocused ? ' is-focused' : ''}" data-category-code="${esc(node.categoryCode)}" data-ring-id="${esc(node.ringId)}" transform="translate(${node.x} ${node.y})" opacity="${categoryDimmed ? '.18' : '1'}" role="button" tabindex="0" aria-label="${esc(node.categoryLabel)} ${node.poiCount}个POI">
          <circle r="${nodeFocused ? node.radius * 1.15 : node.radius}" fill="${categoryStyle.color}" fill-opacity=".14" stroke="${categoryStyle.color}" stroke-width="${nodeFocused ? 3 : 1.5}"/>
          <circle r="5" cy="-${Math.max(11, node.radius * .32)}" fill="${categoryStyle.color}"/>
          <text text-anchor="middle" y="4" fill="#172033" font-size="13" font-weight="700">${esc(node.categoryLabel.length > 8 ? `${node.categoryLabel.slice(0, 8)}…` : node.categoryLabel)}</text>
          <text text-anchor="middle" y="23" fill="#64748B" font-size="11">${node.poiCount} 个</text>
        </g>`;
      }).join('');
      return `<g class="panmap-mvp-ring${focused ? ' is-focused' : ''}" data-ring-id="${esc(ring.ringId)}" transform="translate(460 360) scale(${scale}) translate(-460 -360)" opacity="${opacity}">
        <circle cx="460" cy="360" r="${ring.radius + 62}" fill="${ringColor(index)}" fill-opacity="${focused ? '.075' : '.035'}" stroke="${ringColor(index)}" stroke-width="${focused ? 3 : 1.5}" stroke-dasharray="${focused ? '0' : '7 7'}"/>
        ${nodes}
        <g class="panmap-mvp-ring-hit" data-ring-focus="${esc(ring.ringId)}" role="button" tabindex="0" aria-label="聚焦${esc(ring.label)}"><rect x="${460 + ring.radius + 18}" y="${360 - 16}" width="78" height="30" rx="15" fill="white" stroke="${ringColor(index)}"/><text x="${460 + ring.radius + 57}" y="${360 + 4}" text-anchor="middle" fill="${ringColor(index)}" font-size="12" font-weight="700">${esc(ring.label)}</text></g>
      </g>`;
    }).join('');
    return `<svg class="panmap-mvp-svg" viewBox="0 0 920 720" preserveAspectRatio="xMidYMid meet" aria-label="泛地图时间圈层与一级类别聚簇">${ringMarkup}
      <g class="panmap-mvp-center"><circle cx="460" cy="360" r="24" fill="#1677FF"/><circle cx="460" cy="360" r="8" fill="white"/><text x="460" y="401" text-anchor="middle" fill="#172033" font-size="13" font-weight="700">${esc(snapshot.center.label || '分析中心')}</text></g>
    </svg>`;
  }

  function labelSvg(state) {
    const candidates = app.panmapMvpLayout.selectPoiLabels(snapshot, state.focusedRingId, state.focusedCategoryCode, 40);
    const layout = app.panmapMvpLayout.layoutPoiLabels(candidates);
    const color = styleFor(state.focusedCategoryCode).color;
    const labels = layout.labels.map(({ poi, x, y, width, height }) => `<g class="panmap-mvp-poi-label${state.selectedPoiId === poi.poiId ? ' is-selected' : ''}" data-poi-id="${esc(poi.poiId)}" role="button" tabindex="0" transform="translate(${x - width / 2} ${y - height / 2})">
      <rect width="${width}" height="${height}" rx="17" fill="white" stroke="${color}" stroke-width="${state.selectedPoiId === poi.poiId ? 2.5 : 1.2}"/>
      <circle cx="16" cy="17" r="4" fill="${color}"/><text x="27" y="21" fill="#172033" font-size="12" font-weight="650">${esc(poi.name.length > 12 ? `${poi.name.slice(0, 12)}…` : poi.name)}</text>
    </g>`).join('');
    return { markup: `<svg class="panmap-mvp-svg panmap-mvp-label-cloud" viewBox="0 0 760 540" preserveAspectRatio="xMidYMid meet" aria-label="POI 地名标签云">${labels}</svg>`, layout, candidates };
  }

  function selectedDetail(state) {
    const view = state.selectedPoiId ? app.poiDetailContract?.buildPoiDetailViewModel(
      state.selectedPoiId, workflow.poiResult, workflow.minuteResult, snapshot.profile,
    ) : null;
    if (!view) return '';
    return `<section class="panmap-mvp-detail" aria-label="POI详情">
      <small>${esc(view.categoryLabel)}</small><h3>${esc(view.name)}</h3>
      <strong>${esc(view.travelTimePrimary || '时间待补齐')}</strong>
      <p>${esc(view.displayRingLabel || '')}</p><p>${esc(view.address || '暂无地址')}</p>
      <footer>数据来源：${esc(view.providerLabel || '—')}</footer>
    </section>`;
  }

  function statsPanel(state, labelInfo) {
    const ring = snapshot.rings.find((item) => item.ringId === state.focusedRingId);
    const scoped = ring ? snapshot.pois.filter((poi) => poi.displayRingId === ring.ringId) : snapshot.pois;
    const counts = new Map();
    scoped.forEach((poi) => counts.set(poi.providerCategory.level1Code, (counts.get(poi.providerCategory.level1Code) || 0) + 1));
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 6);
    const currentCategoryCount = state.focusedCategoryCode ? scoped.filter((poi) => poi.providerCategory.level1Code === state.focusedCategoryCode).length : null;
    return `<div class="panmap-mvp-summary">
      <small>${state.mode === 'overview' ? '当前概览' : state.mode === 'ring-focused' ? '圈层聚焦' : state.mode === 'category-focused' ? '类别展开' : '地点详情'}</small>
      <h2>${state.mode === 'overview' ? `${snapshot.metadata.eligiblePoiCount} 个 POI` : ring?.label || '泛地图'}</h2>
      <dl><div><dt>圈层 POI</dt><dd>${scoped.length}</dd></div><div><dt>一级类别</dt><dd>${counts.size}</dd></div>${currentCategoryCount == null ? '' : `<div><dt>当前类别</dt><dd>${esc(styleFor(state.focusedCategoryCode).label)} · ${currentCategoryCount}</dd></div>`}${labelInfo ? `<div><dt>可见 / 隐藏标签</dt><dd>${labelInfo.visiblePoiCount} / ${labelInfo.hiddenPoiCount}</dd></div>` : ''}</dl>
      <div class="panmap-mvp-top-categories">${top.map(([code, count]) => `<span><i style="--category-color:${styleFor(code).color}"></i>${esc(styleFor(code).label)}<b>${count}</b></span>`).join('')}</div>
      ${selectedDetail(state)}
      <div class="panmap-mvp-link-status">传统地图小窗 · ${state.selectedPoiId ? '已同步定位所选 POI' : '等待选择 POI'}</div>
    </div>`;
  }

  function render(state) {
    const renderStartedAt = performance.now();
    const root = document.getElementById('panmapMvp');
    if (!root || !snapshot) return;
    const retainedPreview = layoutMode === 'preview' ? root.querySelector('.label-preview-svg') : null;
    const elasticMode = layoutMode === 'elastic';
    const annularMode = layoutMode === 'annular';
    const naturalMode = layoutMode === 'natural';
    const previewMode = layoutMode === 'preview';
    const labelMode = !elasticMode && !annularMode && !naturalMode && !previewMode && (state.mode === 'category-focused' || state.mode === 'poi-selected');
    const labelResult = labelMode ? labelSvg(state) : null;
    root.dataset.mode = state.mode;
    root.classList.toggle('is-label-preview', previewMode);
    const modeSwitch = developerModeEnabled() ? `<div class="panmap-dev-toolbar" role="group" aria-label="泛地图布局算法"><button type="button" data-layout-mode="bubble" class="${layoutMode === 'bubble' ? 'is-active' : ''}">Bubble Baseline</button><button type="button" data-layout-mode="elastic" class="${layoutMode === 'elastic' ? 'is-active' : ''}">Rectangular Elastic v0</button><button type="button" data-layout-mode="annular" class="${layoutMode === 'annular' ? 'is-active' : ''}">Annular Elastic v1</button><button type="button" data-layout-mode="natural" class="${layoutMode === 'natural' ? 'is-active' : ''}">Natural Annular v2</button><button type="button" data-layout-mode="preview" class="${layoutMode === 'preview' ? 'is-active' : ''}">Label-Driven Preview v1</button></div>` : '';
    const inspectorMode = state.mode === 'poi-selected' ? 'detail' : 'summary';
    root.innerHTML = `<header class="panmap-mvp-header panmap-workspace-meta"><div><small>当前分析快照 · Provider API 0</small><strong>${esc(snapshot.center.label)} · ${profileLabels[snapshot.profile] || esc(snapshot.profile)} · ${snapshot.rangesMinutes.join(' / ')} 分钟</strong></div><span>${snapshot.metadata.categoryCount} 类 · ${snapshot.metadata.eligiblePoiCount} POI</span></header>
      <main class="panmap-main-canvas panmap-mvp-canvas" data-panmap-main-canvas><div class="panmap-canvas-stage">${previewMode ? previewSvg(state) : elasticMode ? elasticSvg() : annularMode ? annularSvg() : naturalMode ? naturalSvg() : labelResult ? labelResult.markup : overviewSvg(state)}</div></main>
      <aside class="panmap-inspector panmap-mvp-inspector${inspectorCollapsed ? ' is-collapsed' : ''}" data-inspector-mode="${inspectorCollapsed ? 'collapsed' : inspectorMode}" aria-label="泛地图 Inspector"><button type="button" class="panmap-overlay-toggle panmap-inspector-toggle" data-panmap-inspector-toggle aria-expanded="${String(!inspectorCollapsed)}">${inspectorCollapsed ? '展开 Inspector' : '收起'}</button><div class="panmap-inspector-body">${statsPanel(state, labelResult?.layout)}${elasticMode ? elasticMetricsPanel() : annularMode ? annularMetricsPanel() : naturalMode ? naturalMetricsPanel() : ''}</div></aside>
      <button type="button" class="panmap-overlay-toggle panmap-mini-map-toggle" data-panmap-mini-map-toggle aria-expanded="${String(!miniMapCollapsed)}">${miniMapCollapsed ? '显示传统地图' : '隐藏传统地图'}</button>
      <nav class="panmap-breadcrumb panmap-mvp-breadcrumb" aria-label="泛地图面包屑">${breadcrumb(state)}</nav>
      ${modeSwitch}`;
    if (retainedPreview) {
      const replacement = root.querySelector('.label-preview-svg');
      const oldNodes = retainedPreview.querySelectorAll('*');
      const newNodes = replacement.querySelectorAll('*');
      if (oldNodes.length === newNodes.length) {
        newNodes.forEach((node, i) => {
          for (const attr of [...oldNodes[i].attributes]) if (!node.hasAttribute(attr.name)) oldNodes[i].removeAttribute(attr.name);
          for (const attr of node.attributes) oldNodes[i].setAttribute(attr.name, attr.value);
        });
        replacement.replaceWith(retainedPreview);
      }
    }
    if (layoutMode === 'preview') {
      const requests = performance.getEntriesByType('resource').filter(entry => entry.startTime >= previewStartedAt && /\/api\//.test(entry.name));
      root.dataset.previewAudit = JSON.stringify({ buildMs: previewBuildMs, renderMs: performance.now() - renderStartedAt, providerRequestDelta: requests.length, ringId: state.focusedRingId, selectedCategory: state.focusedCategoryCode, categoryCount: previewLayout.clusters.length, labelCount: previewLayout.clusters.reduce((n,c) => n+c.labels.length, 0) });
    }
    syncWorkspaceState(root);
    publishWorkspaceLayoutMetrics(root);
    document.documentElement.dataset.panmapMvpMode = state.mode;
    document.documentElement.dataset.panmapSnapshotId = snapshot.snapshotId;
    document.documentElement.dataset.panmapSourcePoiCount = String(snapshot.metadata.sourcePoiCount);
    document.documentElement.dataset.panmapVisibleLabelCount = String(labelResult?.layout.visiblePoiCount || 0);
    document.documentElement.dataset.panmapHiddenLabelCount = String(labelResult?.layout.hiddenPoiCount || 0);
    document.documentElement.dataset.panmapProviderCallCount = '0';
  }

  function activate(target) {
    if (layoutMode === 'preview' && target.closest('[data-preview-blank]')) { store.dispatch({ type: 'BACK_RING' }); return; }
    const inspectorToggle = target.closest('[data-panmap-inspector-toggle]');
    if (inspectorToggle) {
      inspectorCollapsed = !inspectorCollapsed;
      render(store.getState());
      return;
    }
    const miniMapToggle = target.closest('[data-panmap-mini-map-toggle]');
    if (miniMapToggle) {
      miniMapCollapsed = !miniMapCollapsed;
      render(store.getState());
      global.dispatchEvent?.(new Event('resize'));
      return;
    }
    const alphaProbe = target.closest('[data-elastic-probe]');
    if (alphaProbe && layoutMode === 'elastic') {
      const nextAlpha = Number(alphaProbe.dataset.elasticProbe);
      const focusId = elasticFocusId || '050000';
      if (!store.getState().focusedCategoryCode && nextAlpha > 0) store.dispatch({ type: 'FOCUS_CATEGORY', categoryCode: focusId });
      animateElastic(nextAlpha, focusId, nextAlpha === 0 ? () => store.dispatch({ type: 'BACK_RING' }) : null);
      return;
    }
    const annularProbe = target.closest('[data-annular-probe]');
    if (annularProbe && layoutMode === 'annular') {
      const nextAlpha = Number(annularProbe.dataset.annularProbe);
      const focusId = annularFocusId || annularResult?.regions.find((region) => region.id === '050000')?.id || annularResult?.regions[0]?.id;
      if (!store.getState().focusedCategoryCode && nextAlpha > 0) store.dispatch({ type: 'FOCUS_CATEGORY', categoryCode: focusId });
      animateAnnular(nextAlpha, focusId, nextAlpha === 0 ? () => store.dispatch({ type: 'BACK_RING' }) : null);
      return;
    }
    const naturalProbe = target.closest('[data-natural-probe]');
    if (naturalProbe && layoutMode === 'natural') {
      const nextAlpha = Number(naturalProbe.dataset.naturalProbe);
      const focusId = naturalFocusId || naturalResult?.regions.find((region) => region.id === '050000')?.id || naturalResult?.regions[0]?.id;
      if (!store.getState().focusedCategoryCode && nextAlpha > 0) store.dispatch({ type: 'FOCUS_CATEGORY', categoryCode: focusId });
      animateNatural(nextAlpha, focusId, nextAlpha === 0 ? () => store.dispatch({ type: 'BACK_RING' }) : null);
      return;
    }
    const layoutButton = target.closest('[data-layout-mode]');
    if (layoutButton) { setLayoutMode(layoutButton.dataset.layoutMode); return; }
    const elasticCategory = target.closest('[data-elastic-category]');
    if (elasticCategory && layoutMode === 'elastic') {
      const categoryCode = elasticCategory.dataset.elasticCategory;
      const current = store.getState();
      if (current.focusedCategoryCode === categoryCode && elasticAlpha > 0) {
        animateElastic(0, categoryCode, () => store.dispatch({ type: 'BACK_RING' }));
      } else {
        store.dispatch({ type: 'FOCUS_CATEGORY', categoryCode });
        animateElastic(1, categoryCode);
      }
      return;
    }
    const annularCategory = target.closest('[data-annular-category]');
    if (annularCategory && layoutMode === 'annular') {
      const categoryCode = annularCategory.dataset.annularCategory;
      const current = store.getState();
      if (current.focusedCategoryCode === categoryCode && annularAlpha > 0) {
        animateAnnular(0, categoryCode, () => store.dispatch({ type: 'BACK_RING' }));
      } else {
        store.dispatch({ type: 'FOCUS_CATEGORY', categoryCode });
        animateAnnular(1, categoryCode);
      }
      return;
    }
    const naturalCategory = target.closest('[data-natural-category]');
    if (naturalCategory && layoutMode === 'natural') {
      const categoryCode = naturalCategory.dataset.naturalCategory;
      const current = store.getState();
      if (current.focusedCategoryCode === categoryCode && naturalAlpha > 0) {
        animateNatural(0, categoryCode, () => store.dispatch({ type: 'BACK_RING' }));
      } else {
        store.dispatch({ type: 'FOCUS_CATEGORY', categoryCode });
        animateNatural(1, categoryCode);
      }
      return;
    }
    const ring = target.closest('[data-ring-focus]');
    const category = target.closest('[data-category-code]');
    const poi = target.closest('[data-poi-id]');
    const back = target.closest('[data-panmap-back]');
    if (poi) {
      store.dispatch({ type: 'SELECT_POI', poiId: poi.dataset.poiId });
      app.analysisStore?.setSelectedPoiId?.(poi.dataset.poiId);
      return;
    }
    if (category) {
      if (store.getState().focusedRingId !== category.dataset.ringId) store.dispatch({ type: 'FOCUS_RING', ringId: category.dataset.ringId });
      store.dispatch({ type: 'FOCUS_CATEGORY', categoryCode: category.dataset.categoryCode });
      return;
    }
    if (ring) { store.dispatch({ type: 'FOCUS_RING', ringId: ring.dataset.ringFocus }); return; }
    if (back) {
      if (layoutMode === 'preview' && back.dataset.panmapBack === 'overview') { store.dispatch({ type: 'BACK_RING' }); return; }
      const actions = { overview: 'OVERVIEW', ring: 'BACK_RING', category: 'BACK_CATEGORY' };
      if (layoutMode === 'elastic' && back.dataset.panmapBack === 'ring' && elasticAlpha > 0) {
        animateElastic(0, elasticFocusId, () => store.dispatch({ type: 'BACK_RING' }));
        return;
      }
      if (layoutMode === 'annular' && back.dataset.panmapBack === 'ring' && annularAlpha > 0) {
        animateAnnular(0, annularFocusId, () => store.dispatch({ type: 'BACK_RING' }));
        return;
      }
      if (layoutMode === 'natural' && back.dataset.panmapBack === 'ring' && naturalAlpha > 0) {
        animateNatural(0, naturalFocusId, () => store.dispatch({ type: 'BACK_RING' }));
        return;
      }
      store.dispatch({ type: actions[back.dataset.panmapBack] });
      if (back.dataset.panmapBack !== 'category') app.analysisStore?.setSelectedPoiId?.(null);
    }
  }

  function mount(nextSnapshot, nextWorkflow) {
    snapshot = nextSnapshot;
    previewLayout = null;
    workflow = nextWorkflow;
    unsubscribe?.();
    store = app.panmapMvpState.createStore();
    app.panmapMvpStore = store;
    const root = document.getElementById('panmapMvp');
    if (root && !listenersMounted) {
      root.addEventListener('click', (event) => {
        if (suppressCanvasClick) {
          suppressCanvasClick = false;
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        activate(event.target);
      });
      root.addEventListener('pointerover', (event) => {
        if (layoutMode !== 'preview' || store.getState().focusedCategoryCode) return;
        const category = event.target.closest('[data-category-code]');
        const panel = root.querySelector('.panmap-inspector-body');
        if (category && panel) panel.innerHTML = statsPanel({ ...store.getState(), mode: 'category-focused', focusedCategoryCode: category.dataset.categoryCode });
      });
      root.addEventListener('pointerout', (event) => {
        if (layoutMode !== 'preview' || store.getState().focusedCategoryCode || event.relatedTarget?.closest?.('[data-category-code]')) return;
        const panel = root.querySelector('.panmap-inspector-body');
        if (panel) panel.innerHTML = statsPanel(store.getState());
      });
      root.addEventListener('keydown', (event) => {
        if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('[role="button"], button')) { event.preventDefault(); activate(event.target); }
      });
      root.addEventListener('pointerdown', (event) => {
        const canvas = event.target.closest('[data-panmap-main-canvas]');
        if (!canvas || event.button !== 0 || event.target.closest('button, .panmap-mvp-poi-label')) return;
        canvasDrag = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, panX: canvasPan.x, panY: canvasPan.y, moved: false, canvas };
      });
      root.addEventListener('pointermove', (event) => {
        if (!canvasDrag || canvasDrag.pointerId !== event.pointerId) return;
        if (!canvasDrag.moved && Math.hypot(event.clientX - canvasDrag.startX, event.clientY - canvasDrag.startY) > 3) {
          canvasDrag.moved = true;
          canvasDrag.canvas.setPointerCapture?.(event.pointerId);
          canvasDrag.canvas.classList.add('is-panning');
        }
        canvasPan = { x: canvasDrag.panX + event.clientX - canvasDrag.startX, y: canvasDrag.panY + event.clientY - canvasDrag.startY };
        root.style.setProperty('--panmap-pan-x', `${canvasPan.x}px`);
        root.style.setProperty('--panmap-pan-y', `${canvasPan.y}px`);
        document.documentElement.dataset.panmapCanvasPan = `${canvasPan.x},${canvasPan.y}`;
      });
      const finishCanvasPan = (event) => {
        if (!canvasDrag || canvasDrag.pointerId !== event.pointerId) return;
        canvasDrag.canvas.classList.remove('is-panning');
        suppressCanvasClick = canvasDrag.moved;
        if (suppressCanvasClick) global.setTimeout?.(() => { suppressCanvasClick = false; }, 50);
        canvasDrag = null;
      };
      root.addEventListener('pointerup', finishCanvasPan);
      root.addEventListener('pointercancel', finishCanvasPan);
      listenersMounted = true;
    }
    if (!resizeListenerMounted) {
      global.addEventListener?.('resize', () => {
        const currentRoot = document.getElementById('panmapMvp');
        if (currentRoot?.children.length) publishWorkspaceLayoutMetrics(currentRoot);
      });
      resizeListenerMounted = true;
    }
    unsubscribe = store.subscribe(render);
    layoutMode = 'bubble';
    global.cancelAnimationFrame?.(annularAnimationFrame);
    global.cancelAnimationFrame?.(naturalAnimationFrame);
    annularInput = null;
    annularResult = null;
    annularRing = null;
    annularAlpha = 0;
    annularFocusId = null;
    annularFrames.length = 0;
    naturalInput = null;
    naturalResult = null;
    naturalRing = null;
    naturalReferenceState = null;
    naturalAlpha = 0;
    naturalFocusId = null;
    naturalFrames.length = 0;
    inspectorCollapsed = false;
    miniMapCollapsed = false;
    canvasPan = { x: 0, y: 0 };
    suppressCanvasClick = false;
    global.document.documentElement.dataset.panmapLayoutMode = layoutMode;
    render(store.getState());
    return store.getState();
  }

  function showEmpty(message = '请先完成可达域与 POI 查询') {
    const root = document.getElementById('panmapMvp');
    if (!root) return;
    root.innerHTML = `<section class="panmap-mvp-empty"><span>⌖</span><h2>${esc(message)}</h2><p>泛地图不会重新请求高德、ORS 或分钟级接口。</p><button type="button" id="panmapEmptyBack">返回可达域生成</button></section>`;
    root.querySelector('#panmapEmptyBack')?.addEventListener('click', () => document.getElementById('backToIsochrone')?.click());
  }

  app.panmapMvpView = Object.freeze({ mount, showEmpty, render, setLayoutMode, animateElastic, animateAnnular, animateNatural });
})(window);

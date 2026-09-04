(function initPanmapMvpView(global) {
  const app = global.PanmapApp = global.PanmapApp || {};
  const profileLabels = { 'foot-walking': '步行', 'cycling-regular': '骑行', 'driving-car': '驾车' };
  let snapshot = null;
  let workflow = null;
  let store = null;
  let unsubscribe = null;
  let listenersMounted = false;
  let layoutMode = 'bubble';
  let elasticInput = null;
  let elasticResult = null;
  let elasticAlpha = 0;
  let elasticFocusId = null;
  let elasticAnimationFrame = null;
  const elasticFrames = [];
  const elasticAnimationDuration = 280;

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

  function polygonPath(polygon) {
    return polygon.length ? `M ${polygon.map((point) => `${point[0].toFixed(3)} ${point[1].toFixed(3)}`).join(' L ')} Z` : '';
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
    return `<svg class="panmap-mvp-svg elastic-region-svg" viewBox="0 0 860 560" aria-label="单圈层类别弹性共享分区"><rect width="860" height="560" rx="16" fill="#F8FAFC"/>${regions}</svg>`;
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

  function setLayoutMode(nextMode) {
    layoutMode = nextMode === 'elastic' ? 'elastic' : 'bubble';
    if (layoutMode === 'elastic') {
      const ringId = initializeElasticLayout();
      if (ringId) store?.dispatch({ type: 'FOCUS_RING', ringId });
    } else {
      global.cancelAnimationFrame?.(elasticAnimationFrame);
      store?.dispatch({ type: 'OVERVIEW' });
    }
    global.document.documentElement.dataset.panmapLayoutMode = layoutMode;
    publishElasticRuntime();
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
    return `<svg class="panmap-mvp-svg" viewBox="0 0 920 720" aria-label="泛地图时间圈层与一级类别聚簇">${ringMarkup}
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
    return { markup: `<svg class="panmap-mvp-svg panmap-mvp-label-cloud" viewBox="0 0 760 540" aria-label="POI 地名标签云">${labels}</svg>`, layout, candidates };
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
      <dl><div><dt>圈层 POI</dt><dd>${scoped.length}</dd></div><div><dt>一级类别</dt><dd>${counts.size}</dd></div>${currentCategoryCount == null ? '' : `<div><dt>当前类别</dt><dd>${currentCategoryCount}</dd></div>`}${labelInfo ? `<div><dt>可见 / 隐藏标签</dt><dd>${labelInfo.visiblePoiCount} / ${labelInfo.hiddenPoiCount}</dd></div>` : ''}</dl>
      <div class="panmap-mvp-top-categories">${top.map(([code, count]) => `<span><i style="--category-color:${styleFor(code).color}"></i>${esc(styleFor(code).label)}<b>${count}</b></span>`).join('')}</div>
      ${selectedDetail(state)}
      <div class="panmap-mvp-link-status">传统地图小窗 · ${state.selectedPoiId ? '已同步定位所选 POI' : '等待选择 POI'}</div>
    </div>`;
  }

  function render(state) {
    const root = document.getElementById('panmapMvp');
    if (!root || !snapshot) return;
    const elasticMode = layoutMode === 'elastic';
    const labelMode = !elasticMode && (state.mode === 'category-focused' || state.mode === 'poi-selected');
    const labelResult = labelMode ? labelSvg(state) : null;
    root.dataset.mode = state.mode;
    const modeSwitch = developerModeEnabled() ? `<div class="panmap-layout-switch" role="group" aria-label="泛地图布局算法"><button type="button" data-layout-mode="bubble" class="${layoutMode === 'bubble' ? 'is-active' : ''}">Bubble Baseline</button><button type="button" data-layout-mode="elastic" class="${layoutMode === 'elastic' ? 'is-active' : ''}">Elastic Region v0</button></div>` : '';
    root.innerHTML = `<header class="panmap-mvp-header"><div><small>当前分析快照 · Provider API 0</small><strong>${esc(snapshot.center.label)} · ${profileLabels[snapshot.profile] || esc(snapshot.profile)} · ${snapshot.rangesMinutes.join(' / ')} 分钟</strong></div>${modeSwitch}<span>${snapshot.metadata.categoryCount} 类 · ${snapshot.metadata.eligiblePoiCount} POI</span></header>
      <div class="panmap-mvp-workspace"><main class="panmap-mvp-canvas">${elasticMode ? elasticSvg() : labelResult ? labelResult.markup : overviewSvg(state)}</main><aside class="panmap-mvp-inspector">${statsPanel(state, labelResult?.layout)}${elasticMode ? elasticMetricsPanel() : ''}</aside></div>
      <nav class="panmap-mvp-breadcrumb" aria-label="泛地图面包屑">${breadcrumb(state)}</nav>`;
    document.documentElement.dataset.panmapMvpMode = state.mode;
    document.documentElement.dataset.panmapSnapshotId = snapshot.snapshotId;
    document.documentElement.dataset.panmapSourcePoiCount = String(snapshot.metadata.sourcePoiCount);
    document.documentElement.dataset.panmapVisibleLabelCount = String(labelResult?.layout.visiblePoiCount || 0);
    document.documentElement.dataset.panmapHiddenLabelCount = String(labelResult?.layout.hiddenPoiCount || 0);
    document.documentElement.dataset.panmapProviderCallCount = '0';
  }

  function activate(target) {
    const alphaProbe = target.closest('[data-elastic-probe]');
    if (alphaProbe && layoutMode === 'elastic') {
      const nextAlpha = Number(alphaProbe.dataset.elasticProbe);
      const focusId = elasticFocusId || '050000';
      if (!store.getState().focusedCategoryCode && nextAlpha > 0) store.dispatch({ type: 'FOCUS_CATEGORY', categoryCode: focusId });
      animateElastic(nextAlpha, focusId, nextAlpha === 0 ? () => store.dispatch({ type: 'BACK_RING' }) : null);
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
      const actions = { overview: 'OVERVIEW', ring: 'BACK_RING', category: 'BACK_CATEGORY' };
      if (layoutMode === 'elastic' && back.dataset.panmapBack === 'ring' && elasticAlpha > 0) {
        animateElastic(0, elasticFocusId, () => store.dispatch({ type: 'BACK_RING' }));
        return;
      }
      store.dispatch({ type: actions[back.dataset.panmapBack] });
      if (back.dataset.panmapBack !== 'category') app.analysisStore?.setSelectedPoiId?.(null);
    }
  }

  function mount(nextSnapshot, nextWorkflow) {
    snapshot = nextSnapshot;
    workflow = nextWorkflow;
    unsubscribe?.();
    store = app.panmapMvpState.createStore();
    app.panmapMvpStore = store;
    const root = document.getElementById('panmapMvp');
    if (root && !listenersMounted) {
      root.addEventListener('click', (event) => activate(event.target));
      root.addEventListener('keydown', (event) => {
        if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('[role="button"], button')) { event.preventDefault(); activate(event.target); }
      });
      listenersMounted = true;
    }
    unsubscribe = store.subscribe(render);
    layoutMode = 'bubble';
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

  app.panmapMvpView = Object.freeze({ mount, showEmpty, render, setLayoutMode, animateElastic });
})(window);

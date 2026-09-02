(function initPanmapMvpView(global) {
  const app = global.PanmapApp = global.PanmapApp || {};
  const profileLabels = { 'foot-walking': '步行', 'cycling-regular': '骑行', 'driving-car': '驾车' };
  let snapshot = null;
  let workflow = null;
  let store = null;
  let unsubscribe = null;
  let listenersMounted = false;

  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const styleFor = (code) => app.categoryStyleRegistry?.forCode?.(code) || { color: '#64748B', label: '其他' };

  function ringColor(index) { return ['#38B978', '#3B82F6', '#8B5CF6'][index] || '#64748B'; }

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
    const labelMode = state.mode === 'category-focused' || state.mode === 'poi-selected';
    const labelResult = labelMode ? labelSvg(state) : null;
    root.dataset.mode = state.mode;
    root.innerHTML = `<header class="panmap-mvp-header"><div><small>当前分析快照 · Provider API 0</small><strong>${esc(snapshot.center.label)} · ${profileLabels[snapshot.profile] || esc(snapshot.profile)} · ${snapshot.rangesMinutes.join(' / ')} 分钟</strong></div><span>${snapshot.metadata.categoryCount} 类 · ${snapshot.metadata.eligiblePoiCount} POI</span></header>
      <div class="panmap-mvp-workspace"><main class="panmap-mvp-canvas">${labelResult ? labelResult.markup : overviewSvg(state)}</main><aside class="panmap-mvp-inspector">${statsPanel(state, labelResult?.layout)}</aside></div>
      <nav class="panmap-mvp-breadcrumb" aria-label="泛地图面包屑">${breadcrumb(state)}</nav>`;
    document.documentElement.dataset.panmapMvpMode = state.mode;
    document.documentElement.dataset.panmapSnapshotId = snapshot.snapshotId;
    document.documentElement.dataset.panmapSourcePoiCount = String(snapshot.metadata.sourcePoiCount);
    document.documentElement.dataset.panmapVisibleLabelCount = String(labelResult?.layout.visiblePoiCount || 0);
    document.documentElement.dataset.panmapHiddenLabelCount = String(labelResult?.layout.hiddenPoiCount || 0);
    document.documentElement.dataset.panmapProviderCallCount = '0';
  }

  function activate(target) {
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
    render(store.getState());
    return store.getState();
  }

  function showEmpty(message = '请先完成可达域与 POI 查询') {
    const root = document.getElementById('panmapMvp');
    if (!root) return;
    root.innerHTML = `<section class="panmap-mvp-empty"><span>⌖</span><h2>${esc(message)}</h2><p>泛地图不会重新请求高德、ORS 或分钟级接口。</p><button type="button" id="panmapEmptyBack">返回可达域生成</button></section>`;
    root.querySelector('#panmapEmptyBack')?.addEventListener('click', () => document.getElementById('backToIsochrone')?.click());
  }

  app.panmapMvpView = Object.freeze({ mount, showEmpty, render });
})(window);

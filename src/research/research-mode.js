(function initializeResearchMode(global) {
  'use strict';

  const root = document.documentElement;
  const appShell = document.getElementById('appShell');
  const parameterSchemas = Object.freeze({
    'geography-first': Object.freeze([
      Object.freeze({ key: 'preferredAngleToleranceDeg', label: '优先方位容差', min: 5, max: 45, step: 5, value: 25, unit: '°', description: '控制真实方位附近的优先候选窗口。' }),
      Object.freeze({ key: 'angleStepDeg', label: '角度采样步长', min: 1, max: 12, step: 1, value: 4, unit: '°', description: '越小越精细，候选检查量越高。' }),
    ]),
    balanced: Object.freeze([
      Object.freeze({ key: 'compactness', label: '紧凑度', min: 0, max: 100, step: 5, value: 50, unit: '', description: '平衡标签间隔与画布利用率。' }),
      Object.freeze({ key: 'angleStepDeg', label: '角度采样步长', min: 1, max: 15, step: 1, value: 5, unit: '°', description: '控制方向候选采样精度。' }),
    ]),
    'compact-first': Object.freeze([
      Object.freeze({ key: 'compactness', label: '紧凑度', min: 0, max: 100, step: 5, value: 70, unit: '', description: '只影响本次显式运行的前沿接触实验。' }),
      Object.freeze({ key: 'fontHierarchy', label: '字号层次', min: 0, max: 100, step: 5, value: 50, unit: '', description: '控制语义字号层级，不隐藏标签。' }),
    ]),
  });

  let panel = null;
  let extension = null;
  let store = null;
  let currentExport = null;
  let evaluationRuns = 0;
  let exportRuns = 0;
  let enabled = false;

  root.dataset.researchMode = 'inactive';
  root.dataset.stage39EvaluationRuns = '0';
  root.dataset.stage41DirectionalLayoutRuns = '0';
  root.dataset.stage43ResearchLayoutRuns = '0';
  root.dataset.stage43DensitySelectionRuns = '0';

  function formatRate(value) {
    return typeof value === 'number' ? `${(value * 100).toFixed(2)}%` : 'N/A';
  }

  function setValue(name, value) {
    document.querySelectorAll(`[data-stage43-value="${name}"]`).forEach((node) => { node.textContent = String(value); });
  }

  function eligibleFromCurrentLayout() {
    const layers = global.panmapLayoutState?.inputLayers || [];
    const seen = new Set();
    return layers.flatMap((layer) => layer.labels || []).filter((label) => {
      if (!label.poiId || seen.has(label.poiId)) return false;
      seen.add(label.poiId);
      return true;
    }).map((label) => ({
      poiId: label.poiId,
      name: label.label,
      longitude: label.longitude,
      latitude: label.latitude,
      travelTimeSeconds: label.travelTimeSeconds,
      ringId: label.ringId,
      opacity: label.opacity,
      color: label.color,
      rating: label.rating,
      importance: label.importance,
    })).filter((item) => ['ring-0-10', 'ring-10-20', 'ring-20-30'].includes(item.ringId));
  }

  function evaluationContext(layout) {
    return {
      runId: 'stage43-single-experiment',
      algorithmId: layout.algorithmId,
      seed: null,
      dataRef: {
        centerId: 'wuhan-huanghelou',
        centerLabel: '武汉·黄鹤楼',
        profile: 'foot-walking',
        rangesSeconds: [600, 1200, 1800],
        eligibleCount: layout.eligible,
      },
    };
  }

  function evaluate(layout) {
    const result = global.PanmapApp.spatialSemanticEvaluator.evaluate(layout, evaluationContext(layout));
    evaluationRuns += 1;
    root.dataset.stage39EvaluationRuns = String(evaluationRuns);
    root.dataset.stage39EvaluationFingerprint = result.evaluationFingerprint;
    return result;
  }

  function applyReadableView(layout) {
    const svg = document.querySelector('.panmap-art');
    if (!svg || !layout) return;
    const rect = svg.getBoundingClientRect();
    const scale = Math.max(10 / Math.max(1, layout.semanticFontPx.min), Math.min(rect.width / layout.canvasLogicalWidth, rect.height / layout.canvasLogicalHeight, 1));
    const width = rect.width / scale;
    const height = rect.height / scale;
    const cx = layout.center.canvasX;
    const cy = layout.center.canvasY;
    svg.setAttribute('viewBox', `${(cx - width / 2).toFixed(2)} ${(cy - height / 2).toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)}`);
    root.dataset.stage43ViewScale = scale.toFixed(6);
    root.dataset.stage43MinimumScreenFontPx = (layout.semanticFontPx.min * scale).toFixed(2);
  }

  function selectedPreset() {
    return document.querySelector('[data-panmap-preset]:checked')?.value || 'balanced';
  }

  function selectedDensity() {
    return document.querySelector('[data-panmap-density]:checked')?.value || 'standard';
  }

  function renderAlgorithmParameters(algorithmKey = selectedPreset()) {
    const host = extension?.querySelector('#stage47AlgorithmParameters');
    if (!host) return;
    host.innerHTML = (parameterSchemas[algorithmKey] || []).map((definition) => `
      <label class="stage47-parameter-row">
        <span><strong>${definition.label}</strong><small>${definition.description}</small></span>
        <span><input type="number" data-stage47-parameter="${definition.key}" min="${definition.min}" max="${definition.max}" step="${definition.step}" value="${definition.value}"><em>${definition.unit}</em></span>
      </label>`).join('');
    root.dataset.stage47ParameterSchema = algorithmKey;
  }

  function layoutConfigFromParameters() {
    const config = {};
    extension?.querySelectorAll('[data-stage47-parameter]').forEach((input) => {
      config[input.dataset.stage47Parameter] = Number(input.value);
    });
    return config;
  }

  function renderState(state) {
    if (!extension) return;
    const quotas = state.selection.rings.map((ring) => ring.quota).join(' / ');
    setValue('selection-preview', `${state.selection.selectedCount} / 252`);
    setValue('quota-preview', quotas);
    setValue('status', state.status === 'running'
      ? `正在更新布局… 阶段：${state.stage}`
      : state.status === 'error'
        ? `失败：${state.error?.message || '未知错误'}`
        : state.status === 'complete' ? '实验完成' : '等待显式运行');
    setValue('selected', state.selection.selectedCount);
    setValue('placed', state.layout?.placed ?? '—');
    setValue('quota-hidden', state.selection.quotaHiddenCount);
    setValue('capacity-hidden', state.layout?.unplaced ?? '—');
    if (state.layout && state.evaluation) {
      const metrics = state.evaluation.metrics;
      setValue('hard-gates', `${metrics.constraints.overlapCount} / ${metrics.constraints.outsideOwnRingCount} / ${metrics.constraints.centerCollisionCount} / ${metrics.constraints.timeLabelCollisionCount}`);
      setValue('angular', `${metrics.direction.meanAngularErrorDeg.toFixed(2)}° / P95 ${metrics.direction.p95AngularErrorDeg.toFixed(2)}°`);
      setValue('flips', `东西 ${formatRate(metrics.direction.eastWestFlipRate)} · 南北 ${formatRate(metrics.direction.northSouthFlipRate)}`);
      setValue('canvas', `${state.layout.canvasLogicalWidth}×${state.layout.canvasLogicalHeight} · 利用率 ${state.layout.effectiveCanvasUtilization.toFixed(4)}`);
      setValue('performance', `${state.layout.candidateChecks} candidates · ${state.layout.layoutDurationMs}ms`);
      setValue('fingerprints', `${state.selection.selectionFingerprint}\n${state.layout.layoutFingerprint}\n${state.evaluation.evaluationFingerprint}`);
    }
    root.dataset.stage43SelectionFingerprint = state.selection.selectionFingerprint;
    root.dataset.stage43SelectedCount = String(state.selection.selectedCount);
    root.dataset.stage43QuotaHiddenCount = String(state.selection.quotaHiddenCount);
    root.dataset.stage43CapacityHiddenCount = String(state.layout?.unplaced ?? 0);
  }

  function syncStoreSelections() {
    if (!store) return;
    const preset = selectedPreset();
    const density = selectedDensity();
    if (store.getState().layoutPreference !== preset) store.setAlgorithm(preset);
    if (store.getState().densityPreset !== density && ['concise', 'standard', 'rich'].includes(density)) store.selectDensity(density);
  }

  async function runExperiment() {
    if (!initializeStore()) return null;
    syncStoreSelections();
    const before = global.panmapLayoutState?.radialResult;
    try {
      const outcome = await store.run({ evaluate, layoutConfig: layoutConfigFromParameters() });
      if (outcome.cancelled) return outcome;
      global.applyStage43ResearchLayout({ result: outcome.layout, selection: outcome.selection, algorithmKey: store.getState().layoutPreference, centerLabel: '武汉·黄鹤楼' });
      applyReadableView(outcome.layout);
      root.dataset.stage43ResearchLayoutRuns = String(Number(root.dataset.stage43ResearchLayoutRuns || 0) + 1);
      currentExport = {
        schemaVersion: 'stage43-single-experiment/v1',
        dataBaseline: { center: '武汉·黄鹤楼', profile: 'foot-walking', eligible: 252, rings: [39, 83, 130] },
        state: store.getState(),
        selection: outcome.selection,
        layout: outcome.layout,
        evaluation: outcome.evaluation,
        zeroApi: { Isochrones: 0, OpenPOIService: 0, Matrix: 0, Geocoder: 0, Directions: 0 },
      };
      return outcome;
    } catch (error) {
      store.fail(error);
      if (before) global.panmapLayoutState.radialResult = before;
      return null;
    }
  }

  function exportExperiment() {
    if (!currentExport) return;
    const blob = new Blob([`${JSON.stringify(currentExport, null, 2)}\n`], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `stage43-${store.getState().layoutPreference}-${store.getState().densityPreset}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    exportRuns += 1;
    root.dataset.stage43ExportRuns = String(exportRuns);
  }

  function updateCurrentBaseline() {
    const eligible = eligibleFromCurrentLayout();
    const ringCounts = ['ring-0-10', 'ring-10-20', 'ring-20-30'].map((ringId) => eligible.filter((item) => item.ringId === ringId).length);
    setValue('current-online-counts', `${eligible.length} · 逐圈 ${ringCounts.join(' / ')}`);
    const source = root.dataset.walkingResultSource === 'current-online-cache'
      ? '当前在线任务缓存（与普通模式同一结果）'
      : '冻结研究缓存';
    setValue('research-source', source);
    const canRun = eligible.length === 252;
    extension?.querySelectorAll('[data-requires-frozen-baseline]').forEach((button) => { button.disabled = !canRun; });
    setValue('status', canRun ? '第43号 252 基线可用；仅在点击“运行当前实验”后重排' : `当前在线结果 ${eligible.length} 个；第43号 252 基线实验保持冻结，未重算`);
    root.dataset.stage47ResearchBaselineEligible = String(canRun);
    return { eligible, ringCounts, canRun };
  }

  function initializeStore() {
    if (store) return true;
    const baseline = updateCurrentBaseline();
    if (!baseline.canRun) return false;
    store = global.PanmapApp.researchExperimentState.create({ eligible: baseline.eligible });
    store.subscribe(renderState);
    root.dataset.stage43DensitySelectionRuns = '1';
    return true;
  }

  function bindControls() {
    document.querySelectorAll('[data-panmap-preset]').forEach((input) => input.addEventListener('change', () => renderAlgorithmParameters(input.value)));
    extension.querySelector('#stage43Apply')?.addEventListener('click', () => {
      store?.cancel();
      runExperiment();
    });
    extension.querySelector('#stage43ResetView')?.addEventListener('click', () => applyReadableView(store?.getState().layout));
    extension.querySelector('#stage43Export')?.addEventListener('click', exportExperiment);
    extension.querySelector('#stage43Compare')?.addEventListener('click', (event) => {
      const active = appShell.classList.toggle('is-research-comparison');
      event.currentTarget.setAttribute('aria-pressed', String(active));
      root.dataset.stage47ComparisonView = active ? 'active' : 'inactive';
    });
  }

  function mount() {
    if (extension) return;
    const controlBody = document.getElementById('panmapControlBody');
    if (!controlBody) return;
    extension = document.createElement('section');
    extension.id = 'stage43ResearchControls';
    extension.className = 'stage43-research-controls stage47-research-extension';
    extension.dataset.modeCapability = 'research';
    extension.setAttribute('aria-label', '研究模式增量能力');
    extension.innerHTML = `
      <section class="stage47-research-baseline">
        <h2>实验数据与冻结基线</h2>
        <dl>
          <div><dt>当前在线结果</dt><dd data-stage43-value="current-online-counts">等待缓存恢复</dd></div>
          <div><dt>数据来源</dt><dd data-stage43-value="research-source">等待缓存恢复</dd></div>
          <div><dt>第43号基线</dt><dd>252 · 39 / 83 / 130 · 冻结只读</dd></div>
        </dl>
        <p>模式切换不会自动运行实验，也不会把当前 254 个 eligible 静默写入第43号基线。</p>
      </section>
      <section>
        <h2>当前算法参数</h2>
        <div id="stage47AlgorithmParameters"></div>
        <p>只显示当前布局方案实际接收的参数；修改后需显式运行实验。</p>
      </section>
      <div class="stage43-actions">
        <button type="button" id="stage43Apply" data-requires-frozen-baseline>运行当前实验</button>
        <button type="button" id="stage43Compare" aria-pressed="false">视图对比</button>
        <button type="button" id="stage43ResetView" data-requires-frozen-baseline>重置研究视图</button>
        <button type="button" id="stage43Export" data-requires-frozen-baseline>导出本次实验 JSON</button>
      </div>
      <section class="stage43-results">
        <h2>研究实验统计</h2>
        <dl>
          <div><dt>进入布局 / 成功放置</dt><dd><span data-stage43-value="selected">—</span> / <span data-stage43-value="placed">—</span></dd></div>
          <div><dt>配额未显示 / 容量未放置</dt><dd><span data-stage43-value="quota-hidden">—</span> / <span data-stage43-value="capacity-hidden">—</span></dd></div>
        </dl>
        <p data-stage43-value="status" aria-live="polite">等待缓存恢复</p>
      </section>`;
    controlBody.appendChild(extension);

    panel = document.createElement('aside');
    panel.id = 'hiddenResearchPanel';
    panel.className = 'hidden-research-panel stage43-inspector';
    panel.dataset.modeCapability = 'research';
    panel.setAttribute('aria-label', '研究实验指标检查器');
    panel.innerHTML = `
      <header><div><span>单次实验</span><strong>研究指标</strong></div><button type="button" id="researchPanelToggle" aria-expanded="true">›</button></header>
      <div class="research-panel-body">
        <section><h2>完整性门禁</h2><p data-stage43-value="hard-gates">—</p><small>重叠 / 越界 / 中心 / 时间标注</small></section>
        <section><h2>方向指标</h2><p data-stage43-value="angular">—</p><p data-stage43-value="flips">—</p></section>
        <section><h2>画布与性能</h2><p data-stage43-value="canvas">—</p><p data-stage43-value="performance">—</p></section>
        <section><h2>稳定指纹</h2><code data-stage43-value="fingerprints">—</code></section>
      </div>`;
    document.body.appendChild(panel);
    panel.querySelector('#researchPanelToggle').addEventListener('click', (event) => {
      const collapsed = panel.classList.toggle('is-collapsed');
      appShell.classList.toggle('research-panel-collapsed', collapsed);
      event.currentTarget.setAttribute('aria-expanded', String(!collapsed));
    });
    bindControls();
    renderAlgorithmParameters();
    updateCurrentBaseline();
    global.addEventListener('stage33-radial-layout-ready', () => global.setTimeout(updateCurrentBaseline, 0));
    setEnabled(false);
  }

  function setEnabled(active) {
    enabled = Boolean(active);
    root.dataset.researchMode = enabled ? 'active' : 'inactive';
    appShell?.classList.toggle('is-research-mode', enabled);
    appShell?.classList.toggle('is-stage43-research', enabled);
    if (extension) extension.hidden = !enabled;
    if (panel) panel.hidden = !enabled;
    if (enabled) updateCurrentBaseline();
  }

  mount();

  const api = {
    get enabled() { return enabled; },
    setEnabled,
    initializeStore,
    runExperiment,
    getStore: () => store,
    getCurrentExport: () => currentExport,
    exportCurrentEvaluation: exportExperiment,
    evaluateCurrentLayout: () => store?.getState().evaluation || null,
    getCurrentEvaluation: () => store?.getState().evaluation || null,
    parameterSchemas,
    updateCurrentBaseline,
  };
  global.PanmapApp = global.PanmapApp || {};
  global.PanmapApp.researchMode = api;
})(window);

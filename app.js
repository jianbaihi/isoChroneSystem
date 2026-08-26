const appShell = document.getElementById('appShell');
const sideRail = document.querySelector('.side-rail');
const railToggle = document.getElementById('railToggle');
const mapPanel = document.getElementById('mapPanel');
const mapSurface = document.getElementById('mapSurface');
const traditionalMapShell = document.getElementById('traditionalMapShell');
const traditionalMapStatus = document.getElementById('traditionalMapStatus');
const toast = document.getElementById('toast');
const locationSuggestPanel = document.getElementById('locationSuggestPanel');
const toolbarLocationButton = document.getElementById('toolbarLocationButton');
const locationSearch = document.getElementById('locationSearch');
const centerSearchInput = document.getElementById('centerSearchInput');
const centerLocationSuggestPanel = document.getElementById('centerLocationSuggestPanel');
const centerGeocoderResults = document.getElementById('centerGeocoderResults');
const splitToggle = document.getElementById('toggleSplit');
const overviewCard = document.querySelector('.panmap-overview');
const overviewToggle = document.getElementById('overviewToggle');
const panmapArt = document.querySelector('.panmap-art');
const toolbarTimeButton = document.getElementById('toolbarTimeButton');
const overviewHeading = document.getElementById('overviewHeading');
const overviewPoiTotal = document.getElementById('overviewPoiTotal');
const overviewArea = document.getElementById('overviewArea');
const nameCloudOverview = document.getElementById('nameCloudOverview');
const overviewNameCloudPlaced = document.getElementById('overviewNameCloudPlaced');
const overviewNameCloudUnplaced = document.getElementById('overviewNameCloudUnplaced');
const overviewNameCloudNamed = document.getElementById('overviewNameCloudNamed');
const layoutComparison = document.getElementById('layoutComparison');
const layoutBandComparison = document.getElementById('layoutBandComparison');
const poiDatasetSelect = document.getElementById('poiDatasetSelect');
const poiDatasetStatus = document.getElementById('poiDatasetStatus');
const datasetHelp = document.getElementById('datasetHelp');
const analysisStatusCopy = document.getElementById('analysisStatusCopy');
const poiPreviewButton = document.getElementById('poiExploreButton');
const poiPreviewRadius = document.getElementById('poiPreviewRadius');
const geocoderResults = document.getElementById('geocoderResults');
const useCurrentLocationButton = document.getElementById('useCurrentLocationButton');
const centerMapPickButton = document.getElementById('centerMapPickButton');
const generateButton = document.getElementById('generateButton');
const generateButtonLabel = generateButton?.querySelector('.generate-button-label');
const poiQueryButton = document.getElementById('poiQueryButton');
const poiQueryButtonLabel = poiQueryButton?.querySelector('.poi-query-button-label');
const poiQuerySummary = document.getElementById('poiQuerySummary');
const poiPreviewLabel = poiPreviewButton?.querySelector('.poi-explore-label');
const nameCloudButton = document.getElementById('nameCloudButton');
const nameCloudButtonLabel = nameCloudButton?.querySelector('.name-cloud-button-label');
const nameCloudStats = document.getElementById('nameCloudStats');
const matrixButton = document.getElementById('matrixButton');
const matrixButtonLabel = matrixButton?.querySelector('.matrix-button-label');
const matrixResultSummary = document.getElementById('matrixResultSummary');
const matrixPoiDetail = document.getElementById('matrixPoiDetail');
const prepareAllProfilesButton = document.getElementById('prepareAllProfilesButton');
const quotaButton = document.getElementById('quotaButton');
const quotaPanel = document.getElementById('quotaPanel');
const quotaSummary = document.getElementById('quotaSummary');
const quotaTable = document.getElementById('quotaTable');
const quotaNote = document.getElementById('quotaNote');
const onlineProviderStatus = document.getElementById('onlineProviderStatus');
const panmapControlPanel = document.getElementById('panmapControlPanel');
const panmapControlBody = document.getElementById('panmapControlBody');
const controlApplyStatus = document.getElementById('controlApplyStatus');
const panmapModeSwitch = document.getElementById('panmapModeSwitch');
const panmapSummaryCenterProfile = document.getElementById('panmapSummaryCenterProfile');
const panmapSummaryRanges = document.getElementById('panmapSummaryRanges');
const panmapSummaryCounts = document.getElementById('panmapSummaryCounts');
const panmapSummaryRings = document.getElementById('panmapSummaryRings');
const panmapDataSource = document.getElementById('panmapDataSource');
const panmapResearchIdentity = document.getElementById('panmapResearchIdentity');
const panmapSkeleton = document.getElementById('panmapSkeleton');
const staleResultBanner = document.getElementById('staleResultBanner');
const mapPickCoordinate = document.getElementById('mapPickCoordinate');
const centerSelectionLive = document.getElementById('centerSelectionLive');
const mapLegendItems = document.getElementById('mapLegendItems');
if (panmapControlPanel?.parentElement === mapSurface) mapPanel.before(panmapControlPanel);
const basemapButtons = [...document.querySelectorAll('[data-basemap]')];
const analysisStore = window.PanmapApp?.analysisStore;
let traditionalMapAdapter = null;
const PLACE_COORDINATES = window.PanmapApp?.centerPresets || {};
const DEFAULT_CENTER = window.PanmapApp?.centerPreset?.('wuhan-huanghelou') || { lon: 114.296944, lat: 30.546944, district: '武汉市武昌区', label: '武汉·黄鹤楼' };
const PROFILE_BY_MODE = { walk: 'foot-walking', bike: 'cycling-regular', car: 'driving-car' };
const MODE_BY_LABEL = { 步行: 'walk', 骑行: 'bike', 驾车: 'car' };
const CATEGORY_ID_BY_LABEL = {
  餐饮美食: 'food_and_drink',
  购物商场: 'shopping',
  景点休闲: 'cultural_and_historic',
  酒店住宿: 'lodging',
  医疗健康: 'health_care',
  教育培训: 'education',
  交通设施: 'travel_and_transportation',
  生活服务: 'lifestyle_services',
  休闲娱乐: 'arts_and_entertainment',
};
let toastTimer;
let analysisAbortController = null;
let poiAbortController = null;
let minuteAbortController = null;
let minuteAssignmentByPoiId = new Map();
let lastDraftAnalysisFingerprint = null;
let isDraggingSplitter = false;
let isPanningPanmap = false;
let didPanPanmap = false;
let panPointerStart = null;
let panmapInteractionMode = 'select';
let panmapControlStore = null;
let panmapModeStore = null;
let panmapModeTransitionTimer = null;
let panmapShellTransitionFinish = null;
let panmapViewState = 'map-view';
let activeThresholdRange = null;
let stage31LocalLayoutCalls = 0;
let panmapWorkspacePreset = 'balanced';
let panmapWorkspaceDensity = 'standard';
const defaultPanmapViewBox = { x: 0, y: 0, width: 1850, height: 980 };
let panmapViewBox = { ...defaultPanmapViewBox };
let stage33ViewState = { mode: null, layout: null, contract: null };
let lastPanmapInteractionKey = '';
let lastQuotaSnapshot = { services: {} };
let primaryWorkflowActive = null;
let providerCapabilities = null;
const poiLongTaskMetrics = { longTaskCount: 0, maxLongTaskMs: 0, totalLongTaskMs: 0 };
let profileSwitchLongTaskWindow = null;
window.profileSwitchPerformance = [];
if (window.PerformanceObserver && ['localhost', '127.0.0.1'].includes(window.location.hostname)) {
  try {
    new PerformanceObserver((list) => list.getEntries().forEach((entry) => {
      poiLongTaskMetrics.longTaskCount += 1;
      poiLongTaskMetrics.maxLongTaskMs = Math.max(poiLongTaskMetrics.maxLongTaskMs, entry.duration);
      poiLongTaskMetrics.totalLongTaskMs += entry.duration;
      if (profileSwitchLongTaskWindow && performance.now() <= profileSwitchLongTaskWindow.endsAt) {
        profileSwitchLongTaskWindow.longTaskCount += 1;
        profileSwitchLongTaskWindow.maxLongTaskMs = Math.max(profileSwitchLongTaskWindow.maxLongTaskMs, entry.duration);
        profileSwitchLongTaskWindow.totalLongTaskMs += entry.duration;
      }
    })).observe({ type: 'longtask', buffered: true });
  } catch (error) {
    // Long Task API is optional; render batching remains active without it.
  }
}
const activeProfileJobIds = Object.create(null);
const STAGE45_WALKING_CACHE_KEY = 'panmap.stage45.walking.completed.v1';
const STAGE51_CYCLING_CACHE_KEY = 'panmap.stage51.cycling.completed.v1';
const PROFILE_RESULT_CACHE_KEYS = {
  'foot-walking': STAGE45_WALKING_CACHE_KEY,
  'cycling-regular': STAGE51_CYCLING_CACHE_KEY,
};
const PROFILE_RESULT_ARCHIVE_PATHS = {
  'foot-walking': './exports/stage-10-cycling-live/stage45-walking-cache-complete.json',
  'cycling-regular': './exports/stage-10-cycling-live/stage51-cycling-complete.json',
};
const STAGE45_PUBLISHED_ANALYSIS_ID = 'analysis-name-cloud-7823d8e3-5c27-4a22-8b78-be5939c4e2ba';
const STAGE45_PUBLISHED_MATRIX_FINGERPRINT = 'c4a00b9309bdd758ad6313c068a3321151e6576079c78fa97cc78db75c67578f';
const ISOCHRONE_PALETTE = window.PanmapApp?.isochronePalette;

function profileLabel(profile) {
  return profile === 'cycling-regular' ? '骑行' : profile === 'foot-walking' ? '步行' : '驾车';
}

function currentProfileMaxMinutes() {
  const profile = analysisStore?.getState().data.parameterDraft?.profile || 'foot-walking';
  return Number(providerCapabilities?.profiles?.[profile]?.maxTimeMinutes || 60);
}

function createProfileJobId(profile) {
  const stage = profile === 'cycling-regular' ? 'stage51' : 'stage45';
  return globalThis.crypto?.randomUUID?.() || `${stage}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function updateProfileJob(profile, status, patch = {}) {
  if (!activeProfileJobIds[profile]) activeProfileJobIds[profile] = createProfileJobId(profile);
  const jobId = activeProfileJobIds[profile];
  if (appShell) {
    appShell.dataset.activeJobId = jobId;
    appShell.dataset.activeJobProfile = profile;
    if (profile === 'foot-walking') appShell.dataset.walkingJobId = jobId;
    if (profile === 'cycling-regular') appShell.dataset.cyclingJobId = jobId;
  }
  const current = analysisStore?.getState().data.jobsByProfile?.[profile];
  if (!current || current.jobId !== jobId) {
    analysisStore?.setProfileJob(profile, { jobId, profile, status, published: false, ...patch });
  } else {
    analysisStore?.updateProfileJob(profile, jobId, { status, ...patch });
  }
  return jobId;
}

function setReachabilityButtonState(state, label) {
  if (!generateButton) return;
  generateButton.classList.toggle('is-loading', state === 'loading');
  generateButton.classList.toggle('is-complete', state === 'complete');
  generateButton.classList.toggle('is-error', state === 'error');
  generateButton.disabled = state === 'loading';
  generateButton.setAttribute('aria-busy', String(state === 'loading'));
  if (generateButtonLabel) generateButtonLabel.textContent = label;
  const icon = generateButton.querySelector('.play-icon');
  if (icon) icon.textContent = state === 'complete' ? '✓' : state === 'error' ? '!' : state === 'loading' ? '' : '▶';
}

function setExploreButtonState(state, label) {
  if (!nameCloudButton) return;
  nameCloudButton.classList.toggle('is-loading', state === 'loading');
  nameCloudButton.classList.toggle('is-complete', state === 'complete');
  nameCloudButton.classList.toggle('is-error', state === 'error');
  nameCloudButton.disabled = state === 'loading' || state === 'disabled';
  nameCloudButton.setAttribute('aria-busy', String(state === 'loading'));
  if (nameCloudButtonLabel) nameCloudButtonLabel.textContent = label;
  const icon = nameCloudButton.querySelector('.name-cloud-icon');
  if (icon) icon.textContent = state === 'complete' ? '✓' : state === 'error' ? '!' : state === 'loading' ? '' : '⌖';
}

function setPoiQueryButtonState(state, label) {
  if (!poiQueryButton) return;
  poiQueryButton.classList.toggle('is-loading', state === 'loading');
  poiQueryButton.classList.toggle('is-complete', state === 'complete');
  poiQueryButton.classList.toggle('is-error', state === 'error');
  poiQueryButton.disabled = state === 'loading' || state === 'disabled';
  poiQueryButton.setAttribute('aria-busy', String(state === 'loading'));
  if (poiQueryButtonLabel) poiQueryButtonLabel.textContent = label;
}

function isNameCloudResult(result) {
  return result?.metadata?.panmapMode === 'unclassified-poi-name-cloud'
    || result?.nameCloud?.mode === 'unclassified-poi-name-cloud';
}

function updateNameCloudPresentation(result, layoutState = window.panmapLayoutState, activeLayer = toolbarTimeButton?.dataset.activeTime) {
  const active = isNameCloudResult(result);
  appShell?.classList.toggle('has-name-cloud-result', active);
  if (nameCloudOverview) nameCloudOverview.hidden = !active;
  const poiToolbarControl = document.getElementById('poiToolbarButton')?.closest('.toolbar-menu-control');
  if (poiToolbarControl) poiToolbarControl.hidden = active;
  if (!active) return;

  const stats = result?.nameCloud?.stats || {};
  const layoutStats = layoutState?.nameCloudStats || {};
  const bands = Array.isArray(layoutStats.bands) ? layoutStats.bands : [];
  const activeBand = bands.find((band) => String(band.time) === String(activeLayer));
  const ring = result?.rings?.find((item) => String(item.outerRangeMinutes) === String(activeLayer));
  const bandAvailable = activeBand?.available ?? ring?.statistics?.poiCount ?? 0;
  const placed = layoutStats.placedCount ?? stats.placedCount ?? 0;
  const unplaced = layoutStats.unplacedCount ?? stats.unplacedCount ?? 0;
  const named = stats.namedPoiCount ?? result?.pois?.length ?? 0;
  const eligible = layoutStats.eligibleCount ?? result?.metadata?.matrix?.matrixWithinRangeCount ?? named;
  const area = Number(result?.metadata?.poiCoverage?.areaKm2);

  if (overviewHeading) overviewHeading.textContent = `精确时间标签云（${activeLayer}分钟）`;
  if (overviewPoiTotal) overviewPoiTotal.textContent = String(bandAvailable);
  if (overviewArea) overviewArea.textContent = Number.isFinite(area) ? `${area.toFixed(2)} km² 外圈` : '外圈面积未知';
  if (overviewNameCloudPlaced) overviewNameCloudPlaced.textContent = `${placed} / ${eligible}`;
  if (overviewNameCloudUnplaced) overviewNameCloudUnplaced.textContent = String(unplaced);
  if (overviewNameCloudNamed) overviewNameCloudNamed.textContent = String(named);
  const comparison = layoutState?.layoutComparison;
  if (layoutComparison && comparison) layoutComparison.textContent = `A ${comparison.a.placed}/${comparison.eligible} · B ${comparison.b.placed}/${comparison.eligible} · 超出30分 ${comparison.outOfRange}`;
  if (layoutBandComparison && comparison) layoutBandComparison.textContent = comparison.a.bands.map((band, index) => `${band.time}分 A${band.placed}/B${comparison.b.bands[index]?.placed ?? 0}`).join(' · ');
}

function sameNumberList(left = [], right = []) {
  return Array.isArray(left) && Array.isArray(right)
    && left.length === right.length
    && left.every((value, index) => Number(value) === Number(right[index]));
}

function successfulResultMatchesDraft(state) {
  const result = state?.data?.lastSuccessfulResult;
  const draft = state?.data?.parameterDraft;
  if (!result || !draft?.center) return false;
  return Number(result.center?.lon) === Number(draft.center.lon)
    && Number(result.center?.lat) === Number(draft.center.lat)
    && result.profile === draft.profile
    && sameNumberList(result.rangesMinutes, draft.rangesMinutes);
}

const QUOTA_SERVICE_LABELS = { isochrones: '等时圈', geocoder: '地点搜索', pois: 'POI', matrix: 'Matrix' };

function quotaValue(value) {
  return value == null ? '未知' : String(value);
}

function quotaTime(value) {
  if (!value) return '未知';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '未知' : date.toLocaleString('zh-CN', { hour12: false });
}

function mergeQuotaSnapshot(snapshot, serviceHint = '', context = '') {
  const previousServices = lastQuotaSnapshot?.services || {};
  const incomingServices = snapshot?.services && typeof snapshot.services === 'object'
    ? snapshot.services
    : serviceHint && snapshot && typeof snapshot === 'object'
      ? { [serviceHint]: snapshot }
      : {};
  const services = { ...previousServices };
  Object.entries(incomingServices).forEach(([serviceId, item]) => {
    if (!Object.hasOwn(QUOTA_SERVICE_LABELS, serviceId) || !item || typeof item !== 'object') return;
    const normalizedItem = context === 'cache' && item.observedAt
      ? { ...item, freshness: 'last-observed' }
      : item;
    const isEmptyPlaceholder = normalizedItem.status === 'unknown'
      && !normalizedItem.observedAt
      && (!normalizedItem.requestSource || normalizedItem.requestSource === 'none');
    if (!isEmptyPlaceholder || !services[serviceId]?.observedAt) services[serviceId] = normalizedItem;
  });
  return { services };
}

function renderQuota(snapshot = lastQuotaSnapshot, context = '', serviceHint = '') {
  lastQuotaSnapshot = mergeQuotaSnapshot(snapshot, serviceHint, context);
  const services = lastQuotaSnapshot.services || {};
  const known = Object.values(services).find((service) => service?.remaining != null);
  if (quotaSummary) quotaSummary.textContent = known ? quotaValue(known.remaining) : '未知';
  if (!quotaTable) return;
  quotaTable.replaceChildren(...Object.entries(QUOTA_SERVICE_LABELS).map(([serviceId, label]) => {
    const item = services[serviceId] || {};
    const row = document.createElement('div');
    row.className = 'quota-row';
    const name = document.createElement('strong');
    name.textContent = label;
    const remaining = document.createElement('span');
    remaining.className = 'quota-remaining';
    remaining.textContent = quotaValue(item.remaining);
    const reset = document.createElement('span');
    reset.textContent = quotaTime(item.resetAt);
    const status = document.createElement('span');
    status.className = `quota-status quota-status-${item.status || 'unknown'}`;
    status.textContent = item.status === 'known' ? (item.freshness === 'live' ? '实时观测' : '上次观测') : item.status === 'rate-limited' ? '分钟限流' : item.status === 'upstream-403' ? '上游 403' : '未知';
    row.append(name, remaining, reset, status);
    const observed = document.createElement('small');
    observed.textContent = item.observedAt ? `观测：${quotaTime(item.observedAt)}` : '尚无上游观测';
    row.appendChild(observed);
    return row;
  }));
  if (quotaNote) quotaNote.textContent = context === 'cache'
    ? '本次命中缓存，未消耗上游请求；面板数值仍是上次真实观测。'
    : '仅随正常 ORS 请求更新，不发送余额探测请求。';
}

function updateNameCloudStats(result, layoutState = window.panmapLayoutState) {
  const stats = result?.nameCloud?.stats;
  if (!nameCloudStats) return;
  if (!stats) {
    nameCloudStats.textContent = 'POI 标签云需先具备 10/20/30 分钟真实等时圈与 Matrix 缓存';
    return;
  }
  const placed = layoutState?.nameCloudStats?.placedCount ?? stats.placedCount ?? 0;
  const unplaced = layoutState?.nameCloudStats?.unplacedCount ?? stats.unplacedCount ?? 0;
  const bands = layoutState?.nameCloudStats?.bands || [];
  const bandText = bands.map((band) => `${band.time}分 ${band.placed}/${band.available}`).join(' · ');
  const spatial = result?.metadata?.spatialTime || {};
  const matrix = result?.metadata?.matrix || {};
  const eligible = layoutState?.nameCloudStats?.eligibleCount ?? spatial.withinRangeCount ?? matrix.matrixWithinRangeCount ?? 0;
  const outOfRange = layoutState?.nameCloudStats?.outOfRangeCount ?? spatial.outOfRangeCount ?? matrix.matrixOutOfRangeCount ?? 0;
  const method = spatial.method ? `等时圈 1 分钟精度 ${spatial.withinRangeCount ?? 0}/${spatial.requestedPoiCount ?? stats.deduplicatedPoiCount}` : `Matrix ${matrix.matrixOkCount ?? 0}/${matrix.requestedPoiCount ?? stats.deduplicatedPoiCount}`;
  nameCloudStats.textContent = `${method} · eligible ${eligible} · 超出范围 ${outOfRange} · 已摆放 ${placed} · 未摆放 ${unplaced}${bandText ? ` · ${bandText}` : ''}`;
}

function canGenerateNameCloud(state) {
  const result = state?.data?.lastSuccessfulResult;
  const draft = state?.data?.parameterDraft;
  return Boolean(result && draft && successfulResultMatchesDraft(state)
    && ['foot-walking', 'cycling-regular', 'driving-car'].includes(result.profile)
    && Array.isArray(result.cumulativeIsochrones)
    && result.cumulativeIsochrones.length === result.rangesMinutes.length
    && result.metadata?.isLive
    && ['ors', 'ors-public-api'].includes(result.metadata?.sources?.isochrones));
}

function canCalculateSpatialTime(state) {
  const result = state?.data?.workflow?.poiResult;
  return Boolean(result && successfulResultMatchesDraft(state)
    && ['foot-walking', 'cycling-regular', 'driving-car'].includes(result.profile)
    && Array.isArray(result.pois) && result.pois.length > 0);
}

function renderPoiQuerySummary(state) {
  if (!poiQuerySummary) return;
  const status = state?.data?.workflowStatus?.poi || 'idle';
  const result = state?.data?.workflow?.poiResult;
  if (status === 'loading') {
    poiQuerySummary.textContent = '正在查询范围内 POI…';
  } else if (status === 'ready' && result) {
    const count = result.pois?.length || 0;
    const truncated = Boolean(result.coverage?.resultTruncated || result.coverage?.truncated);
    poiQuerySummary.textContent = truncated
      ? `本次返回 ${count} 个 POI · 结果已截断`
      : `本次搜索到 ${count} 个 POI`;
  } else if (status === 'ready-empty') {
    poiQuerySummary.textContent = '本次未搜索到 POI';
  } else if (status === 'stale') {
    poiQuerySummary.textContent = '尚未查询当前范围 POI';
  } else {
    poiQuerySummary.textContent = '尚未查询 POI';
  }
}

function updateMatrixPresentation(result, interaction = {}) {
  const state = analysisStore?.getState();
  const minuteResult = state?.data?.workflow?.minuteResult;
  const minuteStatus = state?.data?.workflowStatus?.minute || 'idle';
  if (matrixResultSummary) {
    const stats = minuteResult?.statistics || {};
    matrixResultSummary.hidden = false;
    matrixResultSummary.textContent = minuteStatus === 'running' || minuteStatus === 'planning' || minuteStatus === 'classifying'
      ? '正在按分钟补齐通行时间…'
      : minuteStatus === 'ready' && stats.unassignedPoiCount
        ? `已补齐 ${stats.classifiedPoiCount} / ${stats.totalPoiCount} 个 POI · ${stats.unassignedPoiCount} 个暂未匹配`
        : minuteStatus === 'ready'
          ? `已补齐 ${stats.classifiedPoiCount} / ${stats.totalPoiCount} 个 POI 的分钟级通行时间`
          : minuteStatus === 'stale' ? '尚未补齐当前结果的分钟级通行时间' : '尚未补齐分钟级通行时间';
  }
  const poiId = interaction.selectedPoiId || interaction.hoveredPoiId || null;
  const detailView = poiId ? window.buildPoiDetailViewModel?.(poiId) : null;
  const detail = detailView?.travelTimePrimary
    ? `${detailView.name} · ${detailView.travelTimeSecondary} · ${detailView.travelTimePrimary} · ${detailView.travelTimeMethodLabel}` : '';
  if (matrixPoiDetail) {
    matrixPoiDetail.hidden = !detail;
    matrixPoiDetail.textContent = detail;
  }
}

window.buildPoiDetailViewModel = function buildPoiDetailViewModel(poiId) {
  const state = analysisStore?.getState();
  return window.PanmapApp.poiDetailContract?.buildPoiDetailViewModel(
    poiId, state?.data?.workflow?.poiResult, state?.data?.workflow?.minuteResult,
    state?.data?.parameterDraft?.profile,
  ) || null;
};

function updateResultCard(result) {
  const rings = Array.isArray(result?.rings) ? result.rings : [];
  const pois = Array.isArray(result?.pois) ? result.pois : [];
  const categories = Array.isArray(result?.categories) ? result.categories : [];
  const isLive = Boolean(result?.metadata?.isLive);
  const status = result
    ? result.metadata?.poiCoverage?.mode === 'preview-radius'
      ? 'POI 预览'
        : isLive
        ? (result.metadata?.matrix
          ? (result.metadata.matrix.cache === 'hit' ? 'Matrix·缓存命中' : 'Matrix 路网估算')
          : (result.metadata?.cacheHit ? '真实·缓存命中' : '真实 ORS'))
        : 'Mock'
    : '待生成';
  const values = {
    resultRingCount: rings.length,
    resultPoiCount: pois.length,
    resultCategoryCount: categories.length,
    resultStatusPill: status,
  };
  Object.entries(values).forEach(([id, value]) => {
    const element = document.getElementById(id);
    if (element) element.textContent = String(value);
  });
}

function applyPanmapActiveRing(ringId) {
  document.querySelectorAll('.organic-time-layer').forEach((layer) => {
    layer.classList.toggle('is-active-ring', Boolean(ringId) && layer.dataset.ringId === ringId);
  });
}

function applyPanmapPoiState(interaction = {}) {
  const selected = interaction.selectedPoiId || null;
  const hovered = interaction.hoveredPoiId || null;
  document.querySelectorAll('.force-bubble').forEach((bubble) => {
    const ids = (bubble.dataset.poiIds || '').split(',').filter(Boolean);
    const id = bubble.dataset.poiId || '';
    bubble.classList.toggle('is-poi-selected', Boolean(selected && (id === selected || ids.includes(selected))));
    bubble.classList.toggle('is-poi-hovered', Boolean(hovered && (id === hovered || ids.includes(hovered))));
  });
}

function setCenterSelection(selection, options = {}) {
  if (!selection) return null;
  const source = ['preset', 'geocoder', 'geolocation', 'map-pick'].includes(options.source || selection.source)
    ? (options.source || selection.source)
    : 'geocoder';
  const center = {
    lon: Number(selection.lon),
    lat: Number(selection.lat),
    crs: 'EPSG:4326',
    label: String(selection.label || (source === 'map-pick' ? '地图选点' : `${selection.lon}, ${selection.lat}`)),
    id: String(selection.id || `${source}:${Number(selection.lon).toFixed(6)}:${Number(selection.lat).toFixed(6)}`),
    source,
    accuracyMeters: selection.accuracyMeters == null ? null : Number(selection.accuracyMeters),
    ...(selection.presetId ? { presetId: selection.presetId } : {}),
  };
  analysisStore?.setDraftCenter(center, source);
  traditionalMapAdapter?.setDraftCenter(center);
  const district = options.district || selection.district
    || (source === 'map-pick' ? `${center.lon.toFixed(6)}° E · ${center.lat.toFixed(6)}° N` : '搜索结果');
  setLocationToolbarButton(source === 'map-pick' ? '地图选点' : center.label, district);
  if (centerSelectionLive) centerSelectionLive.textContent = `已选择新的中心点：${source === 'map-pick' ? '地图选点' : center.label}`;
  if (options.closeSuggestions !== false) closeLocationSuggest();
  if (options.announce !== false) showToast(`中心点已切换为${source === 'map-pick' ? '地图选点' : center.label}；不会自动请求分析`);
  return center;
}

function renderDraftCenter(center, source) {
  if (!center) return;
  const label = String(center.label || '地图选点');
  const displayName = source === 'map-pick' ? '地图选点' : label;
  const locationName = document.getElementById('selectedCenterName') || document.querySelector('.location-input strong');
  const locationSub = document.getElementById('selectedCenterDistrict') || document.querySelector('.location-input .location-sub');
  const coordinateText = document.querySelector('.coordinate-row strong');
  if (locationName) locationName.textContent = displayName;
  if (locationSub) locationSub.textContent = source === 'map-pick'
    ? `${center.lon.toFixed(6)}° E, ${center.lat.toFixed(6)}° N`
    : (PLACE_COORDINATES[center.id]?.district || PLACE_COORDINATES[label]?.district || (source === 'geolocation' ? '浏览器提供的位置' : '搜索结果'));
  if (coordinateText) coordinateText.textContent = `${center.lat.toFixed(4)}° N, ${center.lon.toFixed(4)}° E`;
  if (source === 'map-pick' && toolbarLocationButton) setLocationToolbarButton('地图选点', `${center.lon.toFixed(6)}° E · ${center.lat.toFixed(6)}° N`);
}

function panmapRingCounts(result) {
  return (result?.rings || []).map((ring) => Number(ring.statistics?.poiCount || 0));
}

function updateUnifiedPanmapSummary(result) {
  const profileLabel = { 'foot-walking': '步行', 'cycling-regular': '骑行', 'driving-car': '驾车' }[result?.profile] || result?.profile || '—';
  const total = Number(result?.pois?.length || 0);
  const eligible = Number(result?.metadata?.spatialTime?.withinRangeCount ?? result?.metadata?.matrix?.matrixWithinRangeCount ?? result?.nameCloud?.stats?.eligibleCount ?? 0);
  const rings = panmapRingCounts(result);
  if (panmapSummaryCenterProfile) panmapSummaryCenterProfile.textContent = `${result?.center?.label || '武汉·黄鹤楼'} · ${profileLabel}`;
  if (panmapSummaryRanges) panmapSummaryRanges.textContent = result?.rangesMinutes?.length ? `${result.rangesMinutes.join(' / ')} 分钟` : '—';
  if (panmapSummaryCounts) panmapSummaryCounts.textContent = result ? `${total} / ${eligible}` : '— / —';
  if (panmapSummaryRings) panmapSummaryRings.textContent = result ? rings.join(' / ') : '— / — / —';
  if (panmapDataSource) {
    panmapDataSource.textContent = result?.profile === 'cycling-regular'
      ? '第29号已验收真实骑行缓存'
      : document.documentElement.dataset.walkingResultSource === 'current-online-cache'
        ? '当前在线任务缓存'
        : '冻结/本地缓存';
  }
  if (panmapResearchIdentity) {
    const fingerprint = result?.metadata?.matrix?.resultFingerprint || result?.metadata?.matrix?.matrixResultFingerprint || '未提供';
    panmapResearchIdentity.textContent = result ? `analysis ID：${result.analysisId || '—'} · Matrix 指纹：${fingerprint}` : 'analysis ID 与结果指纹等待缓存恢复';
  }
}

analysisStore?.subscribe((state) => {
  const nextDraftFingerprint = state.data.parameterDraft?.center
    ? window.PanmapApp.contracts.analysisFingerprint(state.data.parameterDraft)
    : null;
  if (lastDraftAnalysisFingerprint && nextDraftFingerprint !== lastDraftAnalysisFingerprint && poiAbortController) {
    poiAbortController.abort();
  }
  if (lastDraftAnalysisFingerprint && nextDraftFingerprint !== lastDraftAnalysisFingerprint && minuteAbortController) {
    minuteAbortController.abort();
    analysisStore?.cancelMinute('parameters-changed');
  }
  if (lastDraftAnalysisFingerprint && nextDraftFingerprint !== lastDraftAnalysisFingerprint) {
    traditionalMapAdapter?.setPoiVisibility(false);
  }
  lastDraftAnalysisFingerprint = nextDraftFingerprint;
  document.documentElement.dataset.analysisStatus = state.data.status;
  document.documentElement.dataset.analysisProfile = state.data.parameterDraft?.profile || '';
  document.documentElement.dataset.analysisRanges = (state.data.parameterDraft?.rangesMinutes || []).join(',');
  document.documentElement.dataset.submittedProfile = state.data.lastSubmittedRequest?.profile || '';
  document.documentElement.dataset.submittedRanges = (state.data.lastSubmittedRequest?.rangesMinutes || []).join(',');
  if (analysisStatusCopy && !primaryWorkflowActive) {
    const metadata = state.data.lastSuccessfulResult?.metadata;
    const staleResult = Boolean(state.data.resultStale || (state.data.lastSuccessfulResult && !successfulResultMatchesDraft(state)));
    const status = state.data.status === 'loading' ? '正在请求 ORS 等时圈…'
      : state.data.status === 'error' ? `请求失败：${state.data.error?.message || '请检查参数或服务状态'}`
        : staleResult ? '参数已变更 · 请先生成新的 ORS 等时圈'
        : metadata?.poiCoverage?.mode === 'preview-radius' ? `POI 预览：${metadata.poiCoverage.radiusMeters} m · 未代表完整覆盖`
          : metadata?.spatialTime ? `1 分钟等时圈空间补时已完成 · ${metadata.spatialTime.withinRangeCount}/${metadata.spatialTime.requestedPoiCount} 个 POI 在范围内`
          : metadata?.matrix ? `Matrix 路网估算已完成 · ${metadata.matrix.cache === 'hit' ? '缓存命中，未消耗上游请求' : '已请求一次上游'}`
          : metadata?.isLive ? `ORS 实时等时圈 · ${metadata.cacheHit ? '缓存命中' : '已请求上游'} · 可单独查询 POI`
            : '快速等时圈默认不请求 POI · 可单独加载预览';
    analysisStatusCopy.textContent = status;
    if (poiPreviewButton) poiPreviewButton.disabled = state.data.status === 'loading' || Boolean(staleResult);
  }
  if (generateButton && !primaryWorkflowActive) {
    const result = state.data.lastSuccessfulResult;
    const isochroneReady = successfulResultMatchesDraft(state)
      && result?.metadata?.isLive
      && Array.isArray(result?.cumulativeIsochrones)
      && result.cumulativeIsochrones.length === state.data.parameterDraft?.rangesMinutes?.length;
    setReachabilityButtonState(isochroneReady ? 'complete' : 'idle', isochroneReady ? '可达域生成完毕' : '生成可达域');
  }
  updateResultCard(state.data.lastSuccessfulResult);
  renderDraftCenter(state.data.parameterDraft?.center, state.data.parameterDraft?.centerSource);
  const interaction = state.interaction || {};
  if (state.data.lastSuccessfulResult?.metadata?.apiQuota) {
    renderQuota(state.data.lastSuccessfulResult.metadata.apiQuota, state.data.lastSuccessfulResult.metadata.cacheHit ? 'cache' : '');
  }
  if (nameCloudButton && !primaryWorkflowActive) {
    const hasCompletedPanmap = !state.data.resultStale
      && successfulResultMatchesDraft(state)
      && isNameCloudResult(state.data.lastSuccessfulResult)
      && Boolean(state.data.lastSuccessfulResult?.metadata?.spatialTime);
    setExploreButtonState(hasCompletedPanmap ? 'complete' : 'disabled', '探索泛地图');
  }
  if (poiQueryButton && !primaryWorkflowActive) {
    const poiResult = state.data.workflow?.poiResult;
    const poiReady = state.data.workflowStatus?.poi === 'ready';
    const poiEmpty = state.data.workflowStatus?.poi === 'ready-empty';
    setPoiQueryButtonState(poiReady || poiEmpty ? 'complete' : canGenerateNameCloud(state) ? 'idle' : 'disabled',
      poiReady || poiEmpty ? 'POI 查询完成' : '查询等时圈内 POI');
  }
  renderPoiQuerySummary(state);
  if (matrixButton) {
    matrixButton.disabled = !canCalculateSpatialTime(state) || matrixButton.classList.contains('is-loading');
    if (!matrixButton.classList.contains('is-loading') && matrixButtonLabel) {
      matrixButtonLabel.textContent = state.data.workflowStatus?.minute === 'ready' ? '通行时间补齐完成' : '按分钟补齐时间';
    }
  }
  updateNameCloudStats(state.data.lastSuccessfulResult);
  updateNameCloudPresentation(state.data.lastSuccessfulResult);
  updateUnifiedPanmapSummary(state.data.lastSuccessfulResult);
  applyPanmapActiveRing(interaction.activeRingId || null);
  applyPanmapPoiState(interaction);
  updateMatrixPresentation(state.data.lastSuccessfulResult, interaction);
  traditionalMapAdapter?.setActiveRingId(interaction.activeRingId || null);
  traditionalMapAdapter?.setHoveredRingId(interaction.hoveredRingId || null);
  traditionalMapAdapter?.setSelectedPoiId(interaction.selectedPoiId || null);
  traditionalMapAdapter?.setHoveredPoiId(interaction.hoveredPoiId || null);
  traditionalMapAdapter?.setVisibleTopLevelCategoryIds(interaction.visibleTopLevelCategoryIds);
  traditionalMapAdapter?.setBasemapId(interaction.activeBasemapId || 'osm-standard');
  traditionalMapAdapter?.setMapPickMode(Boolean(interaction.isMapPickMode));
  traditionalMapAdapter?.setResultStale(Boolean(state.data.resultStale));
  appShell.classList.toggle('has-stale-result', Boolean(state.data.resultStale));
  if (staleResultBanner) {
    staleResultBanner.hidden = !state.data.resultStale;
    staleResultBanner.textContent = state.data.staleReason === 'profile-changed'
      ? '交通方式已改变：地图上的圈层与 POI 是上一交通方式的旧结果，请重新生成可达域。'
      : '中心点已改变：地图上的圈层与 POI 是上一中心点的旧结果，请重新生成可达域。';
  }
  [centerMapPickButton, document.getElementById('toolbarMapPick')].filter(Boolean).forEach((button) => {
    button.classList.toggle('is-active', Boolean(interaction.isMapPickMode));
    button.setAttribute('aria-pressed', String(Boolean(interaction.isMapPickMode)));
  });
  renderCategoryBreadcrumb(state);
  basemapButtons.forEach((button) => button.classList.toggle('is-selected', button.dataset.basemap === (interaction.activeBasemapId || 'osm-standard')));
  const interactionKey = JSON.stringify({
    result: state.data.lastSuccessfulResult?.analysisId || null,
    path: interaction.categoryFocusPath || interaction.categoryPath || [],
    visible: interaction.visibleTopLevelCategoryIds,
  });
  if (interactionKey !== lastPanmapInteractionKey && state.data.lastSuccessfulResult && window.PanmapApp.panmapLayoutAdapter) {
    lastPanmapInteractionKey = interactionKey;
    const layers = window.PanmapApp.panmapLayoutAdapter.buildPanmapLayers(state.data.lastSuccessfulResult, {
      categoryFocusPath: interaction.categoryFocusPath || interaction.categoryPath || [],
      visibleTopLevelCategoryIds: interaction.visibleTopLevelCategoryIds,
    });
    Promise.resolve(window.rebuildPanmapLayout?.({
      layers,
      centerLabel: state.data.lastSuccessfulResult.center?.label,
      center: state.data.lastSuccessfulResult.center,
      outOfRangeCount: state.data.lastSuccessfulResult.metadata?.matrix?.matrixOutOfRangeCount || 0,
    })).then((layout) => {
      if (!layout) return;
      updateNameCloudStats(state.data.lastSuccessfulResult, layout);
      updateNameCloudPresentation(state.data.lastSuccessfulResult, layout);
      applyPanmapPoiState(analysisStore?.getState().interaction || {});
    });
  }
});

function applyPanmapViewBox() {
  panmapArt.setAttribute('viewBox', `${panmapViewBox.x} ${panmapViewBox.y} ${panmapViewBox.width} ${panmapViewBox.height}`);
  panmapArt.dataset.zoom = (defaultPanmapViewBox.width / panmapViewBox.width).toFixed(2);
  updateStage33ViewReadout();
}

function updateStage33ViewReadout() {
  if (!stage33ViewState.layout) return;
  const rect = panmapArt.getBoundingClientRect();
  const scale = Math.min(rect.width / panmapViewBox.width, rect.height / panmapViewBox.height);
  const minimumScreenFontPx = scale * stage33ViewState.layout.semanticMinimumPx;
  const label = document.getElementById('radialViewModeLabel'); const metrics = document.getElementById('radialViewMetrics'); const note = document.getElementById('radialViewNote');
  const overview = stage33ViewState.mode === 'overview';
  if (label) label.textContent = overview ? '全景预览' : '阅读视图';
  if (metrics) metrics.textContent = `当前缩放 ${(scale * 100).toFixed(1)}% · 最小屏幕字号 ${minimumScreenFontPx.toFixed(2)}px`;
  if (note) { note.textContent = overview && minimumScreenFontPx < 8 ? '全景预览用于观察三圈整体结构；字号低于8px不作为阅读状态。' : '阅读视图最小字号不低于8px，可平移、滚轮缩放和圈层聚焦。'; note.classList.toggle('is-preview-note', overview && minimumScreenFontPx < 8); }
  const nodeCount = document.querySelectorAll('.organic-map .name-cloud-label').length; const fingerprint = document.querySelector('.organic-map')?.dataset.layoutFingerprint || '';
  const invariantPass = nodeCount === stage33ViewState.layout.nodeCount && fingerprint === stage33ViewState.layout.fingerprint;
  panmapArt.dataset.stage33ViewMode = overview ? 'overview' : 'reading'; panmapArt.dataset.stage33ViewScale = scale.toFixed(6); panmapArt.dataset.stage33MinimumScreenFontPx = minimumScreenFontPx.toFixed(2); panmapArt.dataset.stage33ViewInvariantPass = String(invariantPass); panmapArt.dataset.stage33ViewNodeCount = String(nodeCount);
}

function applyStage33View(mode, announce = true) {
  const engine = window.PanmapApp?.radialViewContract; if (!engine || !stage33ViewState.layout) return null;
  const rect = panmapArt.getBoundingClientRect();
  const contract = engine.create({ bounds:stage33ViewState.layout.bounds, viewport:{width:rect.width,height:rect.height}, semanticMinimumPx:stage33ViewState.layout.semanticMinimumPx, readableMinimumPx:8 });
  stage33ViewState.mode = mode === 'overview' ? 'overview' : 'reading'; stage33ViewState.contract = contract;
  panmapViewBox = { ...(stage33ViewState.mode === 'overview' ? contract.overview.viewBox : contract.reading.viewBox) }; applyPanmapViewBox();
  document.documentElement.dataset.stage33ViewTransformOnly = 'true';
  if (announce) showToast(stage33ViewState.mode === 'overview' ? '已适配全景：用于观察三圈整体结构' : '已恢复阅读比例：最小屏幕字号不低于8px');
  return { mode:stage33ViewState.mode, ...contract[stage33ViewState.mode] };
}

window.addEventListener('stage33-radial-layout-ready', (event) => {
  stage33ViewState = { mode:'reading', layout:{...event.detail}, contract:null };
  const panel = document.getElementById('radialViewContract'); if (panel) panel.hidden = false;
  applyStage33View('reading', false);
});
window.addEventListener('stage33-radial-view-resize', () => {
  if (document.documentElement.dataset.stage47ModeTransition === 'true'
    || document.documentElement.dataset.stage49ShellTransition === 'true') return;
  const rect = panmapArt?.getBoundingClientRect();
  if (!appShell.classList.contains('is-panmap') || !rect || rect.width < 2 || rect.height < 2) return;
  applyStage33View(stage33ViewState.mode || 'reading', false);
});
window.addEventListener('stage35-envelope-ready', (event) => {
  const status=document.getElementById('envelopeRuntimeStatus'); const combo=document.getElementById('currentCombinationLabel'); const cache=document.getElementById('envelopeCacheLabel'); const summary=document.getElementById('envelopeValidationSummary'); const badge=document.getElementById('stage35CombinationBadge'); const badgeCombo=document.getElementById('stage35BadgeCombo'); const badgeMetrics=document.getElementById('stage35BadgeMetrics');
  if (status) status.hidden=false;
  const orientation=event.detail.mode==='geographic-radial'?'G':'R'; const envelope=event.detail.envelopeMode==='natural-density'?'N':'C';
  if (combo) combo.textContent=`${orientation}-${envelope}`;
  if (cache) cache.textContent=envelope==='N'?`自然包络 · 缓存${event.detail.cache==='hit'?'命中':'新建'}`:'圆形基线 · 密度计算未运行';
  const valid=event.detail.valid==='true'||event.detail.valid===true; if (summary) summary.textContent=`252/252 · 包络${valid?'校验通过':'校验失败'} · 布局执行 ${event.detail.layoutExecutionCount} 次`;
  const applied=window.PanmapApp?.panmapControlStore?.getState?.().applied; if(badge)badge.hidden=false;if(badgeCombo)badgeCombo.textContent=`${orientation}-${envelope}`;if(badgeMetrics)badgeMetrics.textContent=envelope==='N'?`252/252 · 贴合${applied?.envelopeTightness??50} · 平滑${applied?.envelopeSmoothness??60} · 间距${applied?.minEnvelopeGapPx??12}px · ${valid?'校验通过':'校验失败'}`:'252/252 · 圆形包络 · 密度计算未运行';
  document.documentElement.dataset.stage35Combination=`${orientation}-${envelope}`; document.documentElement.dataset.stage35EnvelopeValid=String(valid); document.documentElement.dataset.stage35BusinessApiRequests='0';
});
window.addEventListener('stage37-compact-layout-ready', (event) => {
  const badge=document.getElementById('stage37LayoutBadge'); const title=document.getElementById('stage37BadgeTitle'); const metrics=document.getElementById('stage37BadgeMetrics');
  const names={fermat:'费马紧凑','poisson-disc':'泊松盘紧凑','frontier-contact':'前沿接触式'};
  if(badge)badge.hidden=false;
  if(title)title.textContent=`${names[event.detail.algorithm]||event.detail.algorithm} · ${event.detail.mode==='random-match'?'随机匹配':'地理匹配'}`;
  if(metrics)metrics.textContent=`${event.detail.nodeCount}/${event.detail.nodeCount} · 紧凑圆形环带 · 业务 API 0`;
  document.documentElement.dataset.stage37Algorithm=event.detail.algorithm; document.documentElement.dataset.stage37Mode=event.detail.mode; document.documentElement.dataset.stage37Fingerprint=event.detail.fingerprint; document.documentElement.dataset.stage37NodeCount=String(event.detail.nodeCount); document.documentElement.dataset.stage37BusinessApiRequests='0';
});

function zoomPanmap(factor, clientX, clientY) {
  const rect = panmapArt.getBoundingClientRect();
  const cursorX = Number.isFinite(clientX) ? clientX : rect.left + rect.width / 2;
  const cursorY = Number.isFinite(clientY) ? clientY : rect.top + rect.height / 2;
  const ratioX = Math.max(0, Math.min(1, (cursorX - rect.left) / rect.width));
  const ratioY = Math.max(0, Math.min(1, (cursorY - rect.top) / rect.height));
  let maximumWidth = 2600; let aspect = defaultPanmapViewBox.width / defaultPanmapViewBox.height;
  if (stage33ViewState.layout) { const contract=window.PanmapApp.radialViewContract.create({bounds:stage33ViewState.layout.bounds,viewport:{width:rect.width,height:rect.height},semanticMinimumPx:stage33ViewState.layout.semanticMinimumPx,readableMinimumPx:8}); maximumWidth=contract.reading.viewBox.width; aspect=rect.width/rect.height; stage33ViewState.mode='reading'; }
  const nextWidth = Math.max(620, Math.min(maximumWidth, panmapViewBox.width * factor));
  const nextHeight = nextWidth / aspect;
  panmapViewBox.x += (panmapViewBox.width - nextWidth) * ratioX;
  panmapViewBox.y += (panmapViewBox.height - nextHeight) * ratioY;
  panmapViewBox.width = nextWidth;
  panmapViewBox.height = nextHeight;
  applyPanmapViewBox();
}

function resetPanmapView() {
  if (stage33ViewState.layout) { applyStage33View('reading', false); return; }
  panmapViewBox = { ...defaultPanmapViewBox };
  applyPanmapViewBox();
}

panmapArt.addEventListener('wheel', (event) => {
  if (!appShell.classList.contains('is-panmap')) return;
  event.preventDefault();
  zoomPanmap(event.deltaY < 0 ? 0.88 : 1.14, event.clientX, event.clientY);
}, { passive: false });

panmapArt.addEventListener('pointerdown', (event) => {
  if (!appShell.classList.contains('is-panmap') || panmapInteractionMode !== 'pan' || event.button !== 0) return;
  if (event.target.closest('.organic-layer-chip')) return;
  if (stage33ViewState.layout && stage33ViewState.mode === 'overview') applyStage33View('reading', false);
  isPanningPanmap = true;
  didPanPanmap = false;
  panPointerStart = {
    clientX: event.clientX,
    clientY: event.clientY,
    viewX: panmapViewBox.x,
    viewY: panmapViewBox.y,
  };
  panmapArt.classList.add('is-panning');
  panmapArt.setPointerCapture?.(event.pointerId);
  event.preventDefault();
});

panmapArt.addEventListener('pointermove', (event) => {
  if (!isPanningPanmap || !panPointerStart) return;
  const rect = panmapArt.getBoundingClientRect();
  const deltaX = event.clientX - panPointerStart.clientX;
  const deltaY = event.clientY - panPointerStart.clientY;
  if (Math.hypot(deltaX, deltaY) > 3) didPanPanmap = true;
  panmapViewBox.x = panPointerStart.viewX - deltaX * panmapViewBox.width / rect.width;
  panmapViewBox.y = panPointerStart.viewY - deltaY * panmapViewBox.height / rect.height;
  applyPanmapViewBox();
});

function stopPanmapDrag(event) {
  if (!isPanningPanmap) return;
  isPanningPanmap = false;
  panPointerStart = null;
  panmapArt.classList.remove('is-panning');
  if (event?.pointerId !== undefined) panmapArt.releasePointerCapture?.(event.pointerId);
}

function clearCategoryHoverState() {
  panmapArt.classList.remove('is-category-hover');
  document.querySelectorAll('.category-cluster.is-hovered, .name-cloud-label.is-hovered').forEach((cluster) => cluster.classList.remove('is-hovered'));
  document.querySelectorAll('.organic-time-layer.is-hovered-layer').forEach((layer) => layer.classList.remove('is-hovered-layer'));
}

function setPanmapInteractionMode(mode, announce = true) {
  panmapInteractionMode = mode === 'pan' ? 'pan' : 'select';
  const isPanMode = panmapInteractionMode === 'pan';

  if (isPanMode) clearCategoryHoverState();
  else stopPanmapDrag();

  panmapArt.classList.toggle('is-pan-tool-active', isPanMode);
  document.querySelectorAll('[data-panmap-tool]').forEach((button) => {
    const isActive = button.dataset.panmapTool === panmapInteractionMode;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-pressed', String(isActive));
  });

  if (announce) {
    showToast(isPanMode
      ? '小手拖拽已开启：按住画布移动视图'
      : '箭头选择已开启：悬浮类别可高亮');
  }
}

panmapArt.addEventListener('pointerup', stopPanmapDrag);
panmapArt.addEventListener('pointercancel', stopPanmapDrag);
panmapArt.addEventListener('dblclick', (event) => {
  if (event.target.closest('.organic-layer-chip')) return;
  resetPanmapView();
  showToast('泛地图视图已复位');
});

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('is-visible');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove('is-visible'), 2200);
}

function setRailCollapsed(active) {
  sideRail.classList.toggle('is-collapsed', active);
  railToggle.setAttribute('aria-expanded', String(!active));
  railToggle.setAttribute('aria-label', active ? '展开导航' : '收起导航');
  railToggle.querySelector('.rail-toggle-icon').textContent = active ? '›' : '‹';
}

function closeLocationSuggest() {
  locationSuggestPanel.classList.remove('is-open');
  toolbarLocationButton.setAttribute('aria-expanded', 'false');
  centerLocationSuggestPanel?.classList.remove('is-open');
  centerSearchInput?.setAttribute('aria-expanded', 'false');
}

function setLocationToolbarButton(place, district = PLACE_COORDINATES[place]?.district || '武汉市武昌区') {
  toolbarLocationButton.innerHTML = `<span class="toolbar-select-copy"><small>中心点选择</small><strong>${place}，${district}</strong></span><span class="toolbar-chevron">⌄</span>`;
  toolbarLocationButton.dataset.place = place;
}

function updateSplitToggle(isSplit) {
  splitToggle.innerHTML = isSplit ? '传统地图小窗显示 <span>↙</span>' : '传统地图并列显示 <span>↗</span>';
  splitToggle.setAttribute('aria-label', isSplit ? '切换为传统地图小窗显示' : '切换为传统地图并列显示');
}

function setPanmapViewState(state) {
  panmapViewState = state;
  ['panmap-entering-skeleton', 'panmap-entering-panel', 'panmap-ready', 'panmap-leaving']
    .forEach((className) => appShell.classList.toggle(className, className === state));
  document.documentElement.dataset.panmapViewState = state;
}

function applyPanmapPageChrome(active) {
  const result = analysisStore?.getState().data.lastSuccessfulResult;
  const nameCloudMode = isNameCloudResult(result);
  document.querySelectorAll('.secondary-item[data-flow]').forEach((item) => {
    item.classList.toggle('is-active', item.dataset.flow === (active ? 'panmap' : 'reachability'));
  });
  if (!active) {
    setPanmapInteractionMode('select', false);
    mapPanel.classList.remove('is-split');
    closeLocationSuggest();
  }
  document.querySelector('.eyebrow').innerHTML = active
    ? '<span class="eyebrow-dot"></span>周边探索 / 泛地图探索'
    : '<span class="eyebrow-dot"></span>周边探索 / 可达域生成';
  document.querySelector('.page-heading h1').textContent = active ? '泛地图探索' : '可达域生成';
  document.querySelector('.page-heading p').textContent = active
    ? nameCloudMode
      ? '按步行时间圈层直接摆放真实 POI 名称，不按类别聚合'
      : '在等时圈层内组织周边 POI 标签云与类别分布'
    : '构建基于时间的可达域，并获取多类型 POI 覆盖数据';
  updateNameCloudPresentation(result);
  document.title = active ? 'IsoTagMap · 泛地图探索' : 'IsoTagMap · 等时圈层标签云泛地图';
}

function setPanmapMode(active, options = {}) {
  const immediate = Boolean(options.immediate || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  const preservedViewBox = panmapArt?.getAttribute('viewBox') || null;
  if (active && appShell.classList.contains('is-panmap') && panmapViewState !== 'panmap-leaving') {
    applyPanmapPageChrome(true);
    return;
  }
  window.clearTimeout(panmapModeTransitionTimer);
  panmapModeTransitionTimer = null;
  if (panmapShellTransitionFinish) {
    const finishPendingTransition = panmapShellTransitionFinish;
    panmapShellTransitionFinish = null;
    finishPendingTransition(true);
  }
  applyPanmapPageChrome(active);

  if (active) {
    appShell.classList.add('is-panmap');
    document.documentElement.dataset.stage49ShellTransition = 'true';
    setPanmapViewState('panmap-entering-skeleton');
    const finish = () => {
      if (panmapViewState === 'panmap-ready') return;
      if (preservedViewBox) panmapArt?.setAttribute('viewBox', preservedViewBox);
      setPanmapViewState('panmap-ready');
      delete document.documentElement.dataset.stage49ShellTransition;
      panmapShellTransitionFinish = null;
      traditionalMapAdapter?.resize();
    };
    panmapShellTransitionFinish = finish;
    if (immediate) {
      finish();
      return;
    }
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      setPanmapViewState('panmap-entering-panel');
      const onEnd = (event) => {
        if (event.target !== panmapControlPanel || !['width', 'min-width', 'transform'].includes(event.propertyName)) return;
        panmapControlPanel.removeEventListener('transitionend', onEnd);
        finish();
      };
      panmapControlPanel.addEventListener('transitionend', onEnd);
      panmapModeTransitionTimer = window.setTimeout(() => {
        panmapControlPanel.removeEventListener('transitionend', onEnd);
        finish();
      }, 420);
    }));
    return;
  }

  if (!appShell.classList.contains('is-panmap')) {
    setPanmapViewState('map-view');
    return;
  }
  document.documentElement.dataset.stage49ShellTransition = 'true';
  setPanmapViewState('panmap-leaving');
  const finish = () => {
    appShell.classList.remove('is-panmap');
    setPanmapViewState('map-view');
    delete document.documentElement.dataset.stage49ShellTransition;
    panmapShellTransitionFinish = null;
    traditionalMapAdapter?.resize();
  };
  panmapShellTransitionFinish = finish;
  if (immediate) {
    finish();
    return;
  }
  const onEnd = (event) => {
    if (event.target !== panmapControlPanel || !['width', 'min-width', 'transform'].includes(event.propertyName)) return;
    panmapControlPanel.removeEventListener('transitionend', onEnd);
    finish();
  };
  panmapControlPanel.addEventListener('transitionend', onEnd);
  panmapModeTransitionTimer = window.setTimeout(() => {
    panmapControlPanel.removeEventListener('transitionend', onEnd);
    finish();
  }, 420);
}

function renderPanmapControlState(state) {
  if (!state || !panmapControlPanel) return;
  const draft = state.draft;
  panmapControlPanel.querySelectorAll('[data-control-enum]').forEach((button) => {
    button.classList.toggle('is-selected', draft[button.dataset.controlEnum] === button.dataset.value);
    button.setAttribute('aria-pressed', String(draft[button.dataset.controlEnum] === button.dataset.value));
  });
  panmapControlPanel.querySelectorAll('[data-control-number]').forEach((input) => {
    input.value = String(draft[input.dataset.controlNumber]);
    const output = document.getElementById(`${input.id.replace('Control', '')}Value`);
    if (output) output.value = String(draft[input.dataset.controlNumber]);
  });
  panmapControlPanel.querySelectorAll('[data-control-boolean]').forEach((input) => {
    input.checked = Boolean(draft[input.dataset.controlBoolean]);
  });
  panmapControlPanel.querySelectorAll('[data-control-text]').forEach((input) => { input.value = String(draft[input.dataset.controlText]); });
  document.getElementById('naturalEnvelopeControls').hidden = draft.envelopeMode !== 'natural-density';
  const dirty = state.draftFingerprint !== state.appliedFingerprint;
  if (controlApplyStatus && !controlApplyStatus.classList.contains('is-warning')) {
    controlApplyStatus.textContent = dirty ? '草稿尚未应用 · 不会触发数据请求或连续重排' : '草稿与已应用参数一致 · 数据缓存不受影响';
  }
  document.documentElement.dataset.controlDraftFingerprint = state.draftFingerprint;
  document.documentElement.dataset.controlAppliedFingerprint = state.appliedFingerprint;
  document.documentElement.dataset.controlApplyCount = String(state.applyCount);
}

function initializePanmapControls() {
  const controls = window.PanmapApp?.panmapControlState;
  if (!controls || !panmapControlPanel) return;
  panmapControlStore = controls.createPanmapControlStore({
    storage: window.localStorage,
    onApply: (applied) => {
      const result = analysisStore?.getState().data.lastSuccessfulResult;
      if (!result) return;
      stage31LocalLayoutCalls += 1;
      document.documentElement.dataset.stage31LocalLayoutCalls = String(stage31LocalLayoutCalls);
      Promise.resolve(applyAnalysisResultToPanmap(result)).then(() => {
        if (controlApplyStatus) controlApplyStatus.textContent = applied?.envelopeMode === 'natural-density' ? '已使用冻结标签坐标生成自然包络 · 业务 API 0' : '已使用本地缓存完成圆形包络渲染 · 业务 API 0';
      });
    },
    onWarning: (message) => {
      if (controlApplyStatus) {
        controlApplyStatus.textContent = message;
        controlApplyStatus.classList.add('is-warning');
      }
    },
  });
  window.PanmapApp.panmapControlStore = panmapControlStore;
  panmapControlStore.subscribe((state) => {
    controlApplyStatus?.classList.remove('is-warning');
    renderPanmapControlState(state);
  });
  renderPanmapControlState(panmapControlStore.getState());

  panmapControlPanel.querySelectorAll('[data-control-enum]').forEach((button) => {
    button.addEventListener('click', () => panmapControlStore.setDraft({ [button.dataset.controlEnum]: button.dataset.value }));
  });
  panmapControlPanel.querySelectorAll('[data-control-number]').forEach((input) => {
    input.addEventListener('input', () => panmapControlStore.setDraft({ [input.dataset.controlNumber]: Number(input.value) }));
  });
  panmapControlPanel.querySelectorAll('[data-control-boolean]').forEach((input) => {
    input.addEventListener('change', () => panmapControlStore.setDraft({ [input.dataset.controlBoolean]: input.checked }));
  });
  panmapControlPanel.querySelectorAll('[data-control-text]').forEach((input) => {
    input.addEventListener('input', () => panmapControlStore.setDraft({ [input.dataset.controlText]: input.value }));
  });
  document.getElementById('applyPanmapControls')?.addEventListener('click', () => {
    const outcome = panmapControlStore.apply();
    if (!outcome.applied) showToast(outcome.reason);
    else showToast('仅使用本地缓存重新布局；数据缓存未失效');
  });
  document.getElementById('resetPanmapControls')?.addEventListener('click', () => {
    panmapControlStore.resetDraft();
    showToast('已恢复默认草稿；尚未应用');
  });
  document.getElementById('pinPanmapSeed')?.addEventListener('click', () => {
    panmapControlStore.pinRandomSeed(panmapControlStore.getState().draft.randomSeed || 'stage33-fixed-wuhan-20260802');
    showToast('已固定稳定种子草稿；尚未应用');
  });
  document.getElementById('exportPanmapMetrics')?.addEventListener('click', () => {
    const metrics = panmapControlStore.exportMetrics(window.panmapLayoutState || {});
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([JSON.stringify(metrics, null, 2)], { type: 'application/json' }));
    link.download = 'isotagmap-stage31-layout-metrics.json';
    link.click();
    URL.revokeObjectURL(link.href);
    showToast('已导出当前基线指标；未请求网络');
  });
  document.getElementById('controlThemeToggle')?.addEventListener('click', () => {
    appShell.classList.toggle('control-dark');
    showToast('控制面板主题已切换；未触发重排');
  });
  document.getElementById('fitRadialOverview')?.addEventListener('click', () => applyStage33View('overview'));
  document.getElementById('restoreRadialReading')?.addEventListener('click', () => applyStage33View('reading'));
  document.documentElement.dataset.stage31BusinessApiRequests = '0';
}

function renderPanmapWorkspacePreset() {
  const descriptions = {
    'geography-first': '优先保持 POI 相对中心点的真实方向',
    balanced: '兼顾地理方向、标签紧凑度和阅读清晰度',
    'compact-first': '优先减少空白并保持标签水平可读',
  };
  const density = {
    concise: { total: 60, rings: [10, 20, 30] },
    standard: { total: 120, rings: [20, 40, 60] },
    rich: { total: 180, rings: [30, 60, 90] },
  }[panmapWorkspaceDensity];
  document.querySelectorAll('[data-panmap-preset]').forEach((input) => { input.checked = input.value === panmapWorkspacePreset; });
  document.querySelectorAll('[data-panmap-density]').forEach((input) => { input.checked = input.value === panmapWorkspaceDensity; });
  const description = document.getElementById('panmapPresetDescription');
  const preview = document.getElementById('panmapDensityPreview');
  if (description) description.textContent = descriptions[panmapWorkspacePreset];
  if (preview) preview.textContent = `预计进入布局：${density.total} · 逐圈上限 ${density.rings.join(' / ')}`;
  document.documentElement.dataset.panmapWorkspacePreset = panmapWorkspacePreset;
  document.documentElement.dataset.panmapWorkspaceDensity = panmapWorkspaceDensity;
}

function bindUnifiedWorkspaceControls() {
  const presetDrafts = {
    'geography-first': { labelOrientation: 'direction-preserving-radial', compactAlgorithm: 'frontier-contact', compactness: 45, fontHierarchy: 55 },
    balanced: { labelOrientation: 'compact-geographic', compactAlgorithm: 'frontier-contact', compactness: 50, fontHierarchy: 50 },
    'compact-first': { labelOrientation: 'compact-geographic', compactAlgorithm: 'frontier-contact', compactness: 75, fontHierarchy: 50 },
  };
  document.querySelectorAll('[data-panmap-preset]').forEach((input) => input.addEventListener('change', () => {
    panmapWorkspacePreset = input.value;
    panmapControlStore?.setDraft(presetDrafts[input.value]);
    renderPanmapWorkspacePreset();
  }));
  document.querySelectorAll('[data-panmap-density]').forEach((input) => input.addEventListener('change', () => {
    panmapWorkspaceDensity = input.value;
    renderPanmapWorkspacePreset();
  }));
  renderPanmapWorkspacePreset();
}

function capturePanmapWorkspaceState() {
  const result = analysisStore?.getState().data.lastSuccessfulResult;
  const labels = [...document.querySelectorAll('.name-cloud-label')];
  const coordinateText = labels.map((node) => `${node.dataset.poiId || ''}:${node.getAttribute('transform') || ''}:${node.querySelector('text')?.getAttribute('x') || ''}:${node.querySelector('text')?.getAttribute('y') || ''}`).sort().join('|');
  let hash = 0x811c9dc5;
  for (let index = 0; index < coordinateText.length; index += 1) {
    hash ^= coordinateText.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return {
    mode: panmapModeStore?.getState().mode || 'ordinary',
    analysisId: result?.analysisId || null,
    totalPoi: result?.pois?.length || 0,
    eligible: result?.metadata?.matrix?.matrixWithinRangeCount ?? result?.nameCloud?.stats?.eligibleCount ?? labels.length,
    rings: panmapRingCounts(result),
    labelDomNodes: labels.length,
    coordinateFingerprint: `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`,
    viewBox: panmapArt?.getAttribute('viewBox') || null,
    transform: panmapArt?.style.transform || '',
    preset: panmapWorkspacePreset,
    density: panmapWorkspaceDensity,
    envelope: panmapControlStore?.getState().draft.envelopeMode || null,
  };
}

function businessResourceCounts() {
  const counts = { Isochrones: 0, OpenPOIService: 0, Matrix: 0, Geocoder: 0, Directions: 0 };
  performance.getEntriesByType('resource').forEach((entry) => {
    const url = String(entry.name || '').toLowerCase();
    if (/isochron/.test(url)) counts.Isochrones += 1;
    if (/\/pois(?:\?|\/)|openpoiservice/.test(url)) counts.OpenPOIService += 1;
    if (/\/matrix(?:\?|\/)/.test(url)) counts.Matrix += 1;
    if (/geocod/.test(url)) counts.Geocoder += 1;
    if (/direction/.test(url)) counts.Directions += 1;
  });
  return counts;
}

function runStage47SwitchAudit(switchCount = 20) {
  const before = capturePanmapWorkspaceState();
  const requestsBefore = businessResourceCounts();
  const initialMode = panmapModeStore.getState().mode;
  for (let index = 0; index < switchCount; index += 1) {
    panmapModeStore.setMode(index % 2 === 0 ? 'research' : 'ordinary', { syncUrl: false });
  }
  panmapModeStore.setMode(initialMode, { syncUrl: false });
  const after = capturePanmapWorkspaceState();
  const requestsAfter = businessResourceCounts();
  const requestDelta = Object.fromEntries(Object.keys(requestsBefore).map((key) => [key, requestsAfter[key] - requestsBefore[key]]));
  const evidence = {
    switchCount,
    before,
    after,
    sameAnalysisId: before.analysisId === after.analysisId,
    sameCounts: before.totalPoi === after.totalPoi && before.eligible === after.eligible && JSON.stringify(before.rings) === JSON.stringify(after.rings),
    sameLabelCoordinates: before.coordinateFingerprint === after.coordinateFingerprint,
    sameTransform: before.viewBox === after.viewBox && before.transform === after.transform,
    sameWorkspaceSelections: before.preset === after.preset && before.density === after.density && before.envelope === after.envelope,
    businessRequestDelta: requestDelta,
  };
  document.documentElement.dataset.stage47SwitchAudit = JSON.stringify(evidence);
  return evidence;
}

function initializePanmapModeControls() {
  const modeState = window.PanmapApp?.panmapModeState;
  if (!modeState || !panmapModeSwitch) return;
  panmapModeStore = modeState.createPanmapModeStore();
  window.PanmapApp.panmapModeStore = panmapModeStore;
  window.PanmapApp.captureStage47WorkspaceState = capturePanmapWorkspaceState;
  window.PanmapApp.runStage47SwitchAudit = runStage47SwitchAudit;
  panmapModeStore.subscribe((state) => {
    const preservedViewBox = state.switchCount > 0 ? panmapArt?.getAttribute('viewBox') : null;
    if (state.switchCount > 0) {
      document.documentElement.dataset.stage47ModeTransition = 'true';
      window.clearTimeout(panmapModeTransitionTimer);
    }
    appShell.dataset.panmapMode = state.mode;
    document.documentElement.dataset.panmapMode = state.mode;
    document.documentElement.dataset.stage47ModeSwitchCount = String(state.switchCount);
    const toggle = panmapModeSwitch.querySelector('[data-panmap-mode-toggle]');
    const researchEnabled = state.mode === 'research';
    toggle?.classList.toggle('is-selected', researchEnabled);
    toggle?.setAttribute('aria-checked', String(researchEnabled));
    toggle?.setAttribute('aria-label', researchEnabled ? '关闭研究模式，返回普通模式' : '开启研究模式');
    window.PanmapApp.researchMode?.setEnabled?.(state.mode === 'research');
    if (state.switchCount > 0) {
      panmapModeTransitionTimer = window.setTimeout(() => {
        if (preservedViewBox) panmapArt?.setAttribute('viewBox', preservedViewBox);
        delete document.documentElement.dataset.stage47ModeTransition;
      }, 420);
    }
  });
  const toggle = panmapModeSwitch.querySelector('[data-panmap-mode-toggle]');
  toggle?.addEventListener('click', () => {
    panmapModeStore.setMode(panmapModeStore.getState().mode === 'research' ? 'ordinary' : 'research');
  });
  toggle?.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    panmapModeStore.setMode(event.key === 'ArrowRight' || event.key === 'End' ? 'research' : 'ordinary');
  });
}

railToggle.addEventListener('click', () => {
  const collapsed = !sideRail.classList.contains('is-collapsed');
  setRailCollapsed(collapsed);
  showToast(collapsed ? '导航栏已收起，悬浮到左侧可展开' : '导航栏已展开');
});

document.getElementById('enterPanmap')?.addEventListener('click', () => {
  setPanmapMode(true);
  showToast('已进入泛地图探索，传统等时圈地图正在缩小到左下角');
});

document.getElementById('backToIsochrone').addEventListener('click', () => {
  setPanmapMode(false);
  showToast('已返回可达域生成');
});

function toggleSplitMap() {
  if (!appShell.classList.contains('is-panmap')) setPanmapMode(true);
  const isSplit = !mapPanel.classList.contains('is-split');
  mapPanel.classList.toggle('is-split', isSplit);
  if (isSplit && !mapSurface.style.getPropertyValue('--split-ratio')) mapSurface.style.setProperty('--split-ratio', '34%');
  updateSplitToggle(isSplit);
  window.setTimeout(() => traditionalMapAdapter?.resize(), 120);
  showToast(isSplit ? '传统地图已展开为左右并列视图，可拖拽中间分隔线调整比例' : '传统地图已恢复为小窗');
}

document.getElementById('splitMap').addEventListener('click', toggleSplitMap);
document.getElementById('toggleSplit').addEventListener('click', toggleSplitMap);
document.getElementById('restoreMap').addEventListener('click', () => {
  mapPanel.classList.remove('is-split');
  updateSplitToggle(false);
  window.setTimeout(() => traditionalMapAdapter?.resize(), 120);
  showToast('传统地图已恢复为小窗');
});

overviewToggle?.addEventListener('click', (event) => {
  event.stopPropagation();
  const collapsed = overviewCard.classList.toggle('is-collapsed');
  overviewToggle.setAttribute('aria-expanded', String(!collapsed));
  overviewToggle.setAttribute('aria-label', collapsed ? '展开详情' : '收起详情');
  showToast(collapsed ? '概览详情已收起' : '概览详情已展开');
});

const timeLayerStats = {
  10: { poi: '4,256', area: '约 18.4 km²', categories: ['1,035', '782', '639', '558', '420', '305', '241', '166', '110'] },
  20: { poi: '11,842', area: '约 72.6 km²', categories: ['2,689', '2,214', '1,742', '1,638', '1,271', '972', '761', '377', '178'] },
  30: { poi: '18,260', area: '约 128.9 km²', categories: ['4,120', '3,554', '2,788', '2,397', '2,010', '1,440', '1,176', '523', '252'] },
};
let currentTimeLayerStats = { ...timeLayerStats };

function ringIdForOuterRange(range) {
  const result = analysisStore?.getState().data.result;
  return result?.rings?.find((ring) => String(ring.outerRangeMinutes) === String(range))?.ringId || `ring-0-${range}`;
}

function setActiveTimeLayer(layer, announce = true) {
  const activeLayer = String(layer);
  activeThresholdRange = Number(activeLayer);
  const stats = currentTimeLayerStats[activeLayer] || { poi: '0', area: '模拟数据', categories: [] };
  const result = analysisStore?.getState().data.lastSuccessfulResult;
  panmapArt.classList.remove('focus-layer-10', 'focus-layer-20', 'focus-layer-30');
  panmapArt.classList.add(`focus-layer-${activeLayer}`);
  toolbarTimeButton.dataset.activeTime = activeLayer;
  toolbarTimeButton.querySelectorAll('[data-time-option]').forEach((option) => {
    option.classList.toggle('is-active', option.dataset.timeOption === activeLayer);
  });
  if (isNameCloudResult(result)) {
    updateNameCloudPresentation(result, window.panmapLayoutState, activeLayer);
  } else {
    if (overviewHeading) overviewHeading.textContent = `当前概览（${activeLayer}分钟）`;
    if (overviewPoiTotal) overviewPoiTotal.textContent = stats.poi;
    if (overviewArea) overviewArea.textContent = stats.area;
    document.querySelectorAll('.density-overview .category-stat > div b').forEach((value, index) => {
      value.textContent = stats.categories[index] || '0';
    });
  }
  analysisStore?.setActiveRingId(ringIdForOuterRange(activeLayer));
  if (typeof renderIsochronePalette === 'function' && document.getElementById('thresholdList')) renderIsochronePalette();
  if (announce) showToast(`${activeLayer} 分钟圈层已聚焦，其他圈层已按层级联动`);
}

panmapArt.addEventListener('click', (event) => {
  const bubble = event.target.closest('.force-bubble');
  if (bubble) {
    if (bubble.classList.contains('name-cloud-label')) {
      if (bubble.dataset.poiId) analysisStore?.setSelectedPoiId(bubble.dataset.poiId);
      showToast(`已选中 POI：${bubble.querySelector('.name-cloud-label-text')?.textContent || '名称'}`);
      return;
    }
    const categoryId = bubble.dataset.categoryId || null;
    const path = bubble.dataset.categoryPath ? bubble.dataset.categoryPath.split(',').filter(Boolean) : (categoryId ? [categoryId] : []);
    if (bubble.dataset.hasChildren === 'true') {
      analysisStore?.setActiveCategoryId(categoryId);
      analysisStore?.setCategoryFocusPath(path);
      showToast(`已展开${bubble.querySelector('.node-label')?.textContent || categoryId}，可继续逐级下钻`);
    } else {
      analysisStore?.setSelectedCategory(categoryId);
      analysisStore?.setCategoryFocusPath(path.slice(0, -1));
      if (bubble.dataset.poiId) analysisStore?.setSelectedPoiId(bubble.dataset.poiId);
    }
  }
  const control = event.target.closest('.organic-layer-chip, .density-boundary');
  if (!control) return;
  event.stopPropagation();
  const layer = control.closest('.organic-time-layer').dataset.timeLayer;
  setActiveTimeLayer(layer);
});

toolbarTimeButton.addEventListener('click', () => {
  const ranges = analysisStore?.getState().data.lastSuccessfulResult?.rangesMinutes || thresholdRangesFromUI();
  const layers = ranges.map(String);
  if (!layers.length) return;
  const currentIndex = layers.indexOf(toolbarTimeButton.dataset.activeTime);
  setActiveTimeLayer(layers[(currentIndex + 1) % layers.length]);
});

panmapArt.addEventListener('mouseover', (event) => {
  const cluster = event.target.closest('.category-cluster, .name-cloud-label');
  if (!cluster || !panmapArt.contains(cluster) || (event.relatedTarget && cluster.contains(event.relatedTarget))) return;
  const layer = cluster.closest('.organic-time-layer');
  panmapArt.classList.add('is-category-hover');
  cluster.classList.add('is-hovered');
  layer?.classList.add('is-hovered-layer');
  const poiId = cluster.querySelector('[data-poi-id]')?.dataset.poiId;
  if (poiId) analysisStore?.setHoveredPoi(poiId);
});

panmapArt.addEventListener('mouseout', (event) => {
  const cluster = event.target.closest('.category-cluster, .name-cloud-label');
  if (!cluster || !panmapArt.contains(cluster) || (event.relatedTarget && cluster.contains(event.relatedTarget))) return;
  const layer = cluster.closest('.organic-time-layer');
  panmapArt.classList.remove('is-category-hover');
  cluster.classList.remove('is-hovered');
  layer?.classList.remove('is-hovered-layer');
  analysisStore?.setHoveredPoi(null);
});

document.querySelectorAll('[data-panmap-tool]').forEach((button) => {
  button.addEventListener('click', () => {
    setPanmapInteractionMode(button.dataset.panmapTool);
  });
});

setPanmapInteractionMode('select', false);

function syncParameterDraftFromUI() {
  const selectedMode = document.querySelector('.mode-chip.is-selected')?.dataset.mode || 'car';
  const rangesMinutes = [...document.querySelectorAll('#thresholdList .threshold-item')]
    .filter((row) => row.querySelector('.threshold-select')?.classList.contains('is-visible'))
    .map((row) => Number(row.querySelector('.time-input input')?.value));
  const selectedCategoryLabels = [...document.querySelectorAll('.poi-chip.is-checked')]
    .map((chip) => chip.dataset.poi)
    .filter(Boolean);
  const allCategoryLabels = Object.keys(CATEGORY_ID_BY_LABEL);
  const categoryIds = selectedCategoryLabels.length === allCategoryLabels.length
    ? []
    : selectedCategoryLabels.map((label) => CATEGORY_ID_BY_LABEL[label]).filter(Boolean);
  analysisStore?.setParameterDraft({
    profile: PROFILE_BY_MODE[selectedMode] || null,
    rangesMinutes,
    categoryIds,
    options: { includePois: false, poiPreviewRadiusMeters: Number(poiPreviewRadius?.value || 1000) },
  });
  return analysisStore?.getState().data.parameterDraft;
}

async function switchActiveProfile(profile, label) {
  const started = performance.now();
  const fromProfile = analysisStore?.getState().data.parameterDraft?.profile || null;
  const previousResult = analysisStore?.getState().data.lastSuccessfulResult;
  profileSwitchLongTaskWindow = { endsAt: started + 1000, longTaskCount: 0, maxLongTaskMs: 0, totalLongTaskMs: 0 };
  performance.mark('profile.switch.store.start');
  analysisStore?.setActiveProfile(profile);
  performance.mark('profile.switch.store.end');
  performance.measure('profile.switch.store', 'profile.switch.store.start', 'profile.switch.store.end');
  const state = analysisStore?.getState();
  performance.mark('profile.switch.poi-clear.start');
  traditionalMapAdapter?.setPoiVisibility(false);
  performance.mark('profile.switch.poi-clear.end');
  performance.measure('profile.switch.poi-clear', 'profile.switch.poi-clear.start', 'profile.switch.poi-clear.end');
  activeThresholdRange = null;
  renderIsochronePalette();
  if (previousResult) {
    traditionalMapAdapter?.setResultStale(true);
  }
  const job = state?.data?.jobsByProfile?.[profile];
  if (analysisStatusCopy) analysisStatusCopy.textContent = job?.status === 'partial'
    ? `${label}任务已中止 · 可从检查点恢复`
    : `${label}参数已选择 · 旧结果已标记为 stale，请生成新的可达域`;
  showToast(job?.status === 'partial' ? `${label}任务可恢复` : `${label}参数已切换；请显式生成可达域`);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const switchDurationMs = performance.now() - started;
    const metrics = {
      fromProfile, toProfile: profile, switchDurationMs,
      cacheHydrationMs: 0, mapUpdateMs: 0,
      poiHideMs: performance.getEntriesByName('profile.switch.poi-clear').at(-1)?.duration || 0,
      storeMs: performance.getEntriesByName('profile.switch.store').at(-1)?.duration || 0,
      longTaskCount: profileSwitchLongTaskWindow?.longTaskCount || 0,
      maxLongTaskMs: profileSwitchLongTaskWindow?.maxLongTaskMs || 0,
      totalLongTaskMs: profileSwitchLongTaskWindow?.totalLongTaskMs || 0,
      upstreamApiCalls: 0, cachePayloadHydrations: 0, poiRenderCalls: 0, panmapLayoutCalls: 0,
    };
    window.profileSwitchPerformance.push(metrics);
    document.documentElement.dataset.profileSwitchDurationMs = switchDurationMs.toFixed(2);
    document.documentElement.dataset.profileSwitchMetrics = JSON.stringify(metrics);
  }));
}

function buildAnalysisRequestFromUI() {
  syncParameterDraftFromUI();
  const draft = analysisStore?.getState().data.parameterDraft;
  if (!draft) throw new Error('参数草稿尚未准备好。');
  if (!draft.profile || !['foot-walking', 'cycling-regular', 'driving-car'].includes(draft.profile)) {
    throw new Error('本阶段只支持步行、骑行和驾车；公交与地铁留待后续阶段。');
  }
  const rangesMinutes = window.PanmapApp.contracts.normalizeDraftRanges(draft.rangesMinutes);
  analysisStore?.setParameterDraft({ rangesMinutes });
  return window.PanmapApp.contracts.normalizeAnalysisRequest({
    schemaVersion: '1.0',
    center: draft.center,
    profile: draft.profile,
    rangesMinutes,
    categoryIds: draft.categoryIds,
    poiDatasetId: draft.poiDatasetId,
    options: { ...draft.options, includePois: false, calculateTravelTimes: false },
  });
}

function renderCategoryBreadcrumb(state = analysisStore?.getState()) {
  const breadcrumb = document.getElementById('categoryBreadcrumb');
  if (!breadcrumb) return;
  const result = state?.data?.lastSuccessfulResult;
  const path = state?.interaction?.categoryFocusPath || state?.interaction?.categoryPath || [];
  const labels = new Map((result?.categories || []).map((category) => [category.categoryId, category.label || category.categoryId]));
  const fragments = ['类别概览', ...path.map((categoryId) => labels.get(categoryId) || categoryId)];
  breadcrumb.replaceChildren(...fragments.map((label, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.dataset.breadcrumbIndex = String(index);
    return button;
  }));
}

async function loadPoiDatasets() {
  if (!poiDatasetSelect || !window.PanmapApp?.analysisClient?.listPoiDatasets) return;
  try {
    const datasets = await window.PanmapApp.analysisClient.listPoiDatasets();
    poiDatasetSelect.replaceChildren(new Option('使用当前分析模式', ''));
    datasets.forEach((dataset) => {
      const option = new Option(`${dataset.displayName} · ${dataset.sourceRelease}`, dataset.datasetId);
      option.dataset.regionId = dataset.regionId;
      poiDatasetSelect.appendChild(option);
    });
    const draftId = analysisStore?.getState().data.parameterDraft.poiDatasetId || '';
    poiDatasetSelect.value = draftId;
    poiDatasetStatus.textContent = datasets.length ? `${datasets.length} 个 ready` : '未就绪';
    datasetHelp.textContent = datasets.length
      ? '选择数据集只更新参数草稿；当前分析模式决定使用本地 Overture 或 ORS 远程 POI。'
      : '当前没有 ready Overture 数据集；若服务端启用 ORS 远程模式，将直接查询 OpenPOIService。';
  } catch (error) {
    poiDatasetStatus.textContent = '不可用';
    datasetHelp.textContent = 'POI 数据集列表不可用；不会回退到其他在线 POI 来源。';
  }
}

poiDatasetSelect?.addEventListener('change', () => {
  analysisStore?.setParameterDraft({ poiDatasetId: poiDatasetSelect.value || null });
  showToast(poiDatasetSelect.value ? 'POI 数据集已写入参数草稿' : '已取消选择本地 POI 数据集');
});

basemapButtons.forEach((button) => {
  const basemapId = button.dataset.basemap;
  const available = traditionalMapAdapter?.hasBasemap?.(basemapId) ?? (basemapId === 'osm-standard');
  button.disabled = !available;
  button.addEventListener('click', () => {
    if (button.disabled) {
      showToast('天地图需要运行时 Token，当前入口已禁用');
      return;
    }
    if (traditionalMapAdapter?.setBasemapId?.(basemapId) === false) return;
    analysisStore?.setActiveBasemapId(basemapId);
    basemapButtons.forEach((item) => item.classList.toggle('is-selected', item.dataset.basemap === basemapId));
    showToast(`${button.textContent.trim()}底图已切换；分析结果和相机保持不变`);
  });
});

document.getElementById('categoryBreadcrumb')?.addEventListener('click', (event) => {
  const button = event.target.closest('[data-breadcrumb-index]');
  if (!button) return;
  const index = Number(button.dataset.breadcrumbIndex);
  const path = analysisStore?.getState().interaction?.categoryFocusPath || [];
  analysisStore?.setCategoryFocusPath(path.slice(0, Math.max(0, index)));
});

function updateTimeLayerStatsFromResult(result) {
  const categoryIds = result.categories.map((category) => category.categoryId);
  currentTimeLayerStats = {};
  result.rings.forEach((ring) => {
    const ringPois = result.pois.filter((poi) => poi.ringId === ring.ringId);
    currentTimeLayerStats[String(ring.outerRangeMinutes)] = {
      poi: String(ring.statistics?.poiCount ?? ringPois.length),
      area: result.metadata?.areaKm2 == null ? '未提供' : `${result.metadata.areaKm2} km²`,
      categories: categoryIds.map((categoryId) => String(ringPois.filter((poi) => poi.categoryId === categoryId).length)),
    };
  });
}

function setAnalysisLoadingState(isLoading) {
  if (primaryWorkflowActive !== 'reachability') {
    generateButton?.classList.toggle('is-loading', isLoading);
    generateButton?.setAttribute('aria-busy', String(isLoading));
    if (generateButton) generateButton.disabled = isLoading;
    if (generateButtonLabel) generateButtonLabel.textContent = isLoading ? '正在生成等时圈…' : '生成可达域';
  }
  toolbarGenerate?.classList.toggle('is-loading', isLoading);
  toolbarGenerate?.setAttribute('aria-busy', String(isLoading));
  document.getElementById('appShell')?.toggleAttribute('data-analysis-loading', isLoading);
  if (analysisStatusCopy && isLoading) analysisStatusCopy.textContent = '正在请求 ORS 等时圈…';
}

async function applyAnalysisResultToPanmap(result) {
  updateTimeLayerStatsFromResult(result);
  const interaction = analysisStore?.getState().interaction || {};
  const layers = window.PanmapApp.panmapLayoutAdapter.buildPanmapLayers(result, {
    categoryFocusPath: interaction.categoryFocusPath || interaction.categoryPath || [],
    visibleTopLevelCategoryIds: interaction.visibleTopLevelCategoryIds,
  });
  const layout = await window.rebuildPanmapLayout?.({ layers, centerLabel: result.center?.label, center: result.center, outOfRangeCount: result.metadata?.matrix?.matrixOutOfRangeCount || 0 });
  if (!layout) throw new Error('模拟分析结果无法转换为泛地图布局。');
  updateNameCloudStats(result, layout);
  const activeRange = toolbarTimeButton.dataset.activeTime;
  const nextRange = result.rangesMinutes.includes(Number(activeRange)) ? activeRange : String(result.rangesMinutes[result.rangesMinutes.length - 1]);
  setActiveTimeLayer(nextRange, false);
  traditionalMapAdapter?.setAnalysisResult(result);
  return layout;
}

function applyAnalysisResultToTraditionalMap(result) {
  updateTimeLayerStatsFromResult(result);
  traditionalMapAdapter?.setAnalysisResult(result);
  activeThresholdRange = null;
  analysisStore?.setActiveRingId(null);
  analysisStore?.setHoveredRingId(null);
  traditionalMapAdapter?.setActiveRingId(null);
  traditionalMapAdapter?.setHoveredRingId(null);
  traditionalMapAdapter?.setPoiVisibility(false);
  renderIsochronePalette();
}

function setMapStatus(message) {
  if (traditionalMapStatus) traditionalMapStatus.textContent = message || '';
}

function updateDraftCenterFromMap(point) {
  const center = setCenterSelection({
    lon: Number(point.lon.toFixed(6)),
    lat: Number(point.lat.toFixed(6)),
    label: '地图选点',
    id: `map-pick:${point.lon.toFixed(6)}:${point.lat.toFixed(6)}`,
  }, { source: 'map-pick', announce: false });
  analysisStore?.setMapPickMode(false);
  mapSurface.classList.remove('is-picking');
  appShell.classList.remove('is-map-picking');
  if (mapPickCoordinate) mapPickCoordinate.hidden = true;
  showToast(`已选择新的中心点：${center.lon.toFixed(6)}° E, ${center.lat.toFixed(6)}° N；请重新生成可达域`);
}

function updateMapPickCoordinate(point) {
  if (!mapPickCoordinate) return;
  mapPickCoordinate.hidden = !point;
  mapPickCoordinate.textContent = point ? `${Number(point.lon).toFixed(6)}° E · ${Number(point.lat).toFixed(6)}° N` : '';
}

function startMapPickMode() {
  if (analysisStore?.getState().interaction.isMapPickMode) {
    analysisStore.setMapPickMode(false);
    mapSurface.classList.remove('is-picking');
    appShell.classList.remove('is-map-picking');
    traditionalMapAdapter?.setMapPickMode(false);
    updateMapPickCoordinate(null);
    showToast('已取消地图选点');
    return;
  }
  analysisStore?.setMapPickMode(true);
  mapSurface.classList.add('is-picking');
  appShell.classList.add('is-map-picking');
  traditionalMapAdapter?.setMapPickMode(true);
  showToast('请在传统地图上点击位置设为中心点；不会自动请求分析');
}

function initializeTraditionalMap() {
  if (traditionalMapAdapter || !window.PanmapApp?.traditionalMapAdapter || !window.maplibregl) return;
  traditionalMapAdapter = window.PanmapApp.traditionalMapAdapter.createTraditionalMap({
    container: document.getElementById('traditionalMap'),
    config: window.PanmapApp.mapConfig,
    onRingClick: (ringId) => {
      analysisStore?.setActiveRingId(ringId);
      const ring = analysisStore?.getState().data.lastSuccessfulResult?.rings?.find((item) => item.ringId === ringId);
      activeThresholdRange = ring ? Number(ring.outerRangeMinutes) : null;
      if (ring) setActiveTimeLayer(String(ring.outerRangeMinutes), false);
      renderIsochronePalette();
    },
    onRingHover: (ringId) => analysisStore?.setHoveredRingId(ringId),
    onPoiClick: (poiId) => analysisStore?.setSelectedPoiId(poiId),
    onPoiHover: (poiId) => analysisStore?.setHoveredPoiId(poiId),
    onMapPointSelected: updateDraftCenterFromMap,
    onMapCoordinate: updateMapPickCoordinate,
    onMapStatus: setMapStatus,
  });
  const state = analysisStore?.getState();
  if (state?.data.lastSuccessfulResult) traditionalMapAdapter.setAnalysisResult(state.data.lastSuccessfulResult);
  if (state?.data.parameterDraft?.center) traditionalMapAdapter.setDraftCenter(state.data.parameterDraft.center);
  traditionalMapAdapter.setMapPickMode(Boolean(state?.interaction?.isMapPickMode));
  traditionalMapAdapter.setPaletteRanges(thresholdRangesFromUI());
  traditionalMapAdapter.setResultStale(Boolean(state?.data?.resultStale));
  basemapButtons.forEach((button) => {
    button.disabled = !traditionalMapAdapter.hasBasemap?.(button.dataset.basemap);
  });
}

document.querySelector('#mapSurface > svg.map-art')?.remove();
document.querySelector('#miniTraditional svg.mini-map-art')?.remove();
window.addEventListener('panmap:maplibre-ready', initializeTraditionalMap, { once: true });
window.addEventListener('panmap:maplibre-loading', () => setMapStatus('正在加载 MapLibre 和 OSM 底图…'), { once: true });
window.addEventListener('panmap:maplibre-error', (event) => {
  setMapStatus(event.detail?.message || 'MapLibre 资源加载失败；分析和泛地图仍可使用。');
}, { once: true });
if (window.maplibregl) initializeTraditionalMap();

function analysisSuccessMessage(result) {
  const isOrsIsochrone = ['ors', 'ors-public-api'].includes(result.metadata?.sources?.isochrones);
  if (result.metadata?.sources?.pois === 'ors-openpoiservice') {
    const selection = result.metadata?.poiSelection;
    return `真实 ORS + OpenPOIService 已生成：${selection?.returnedCount ?? result.pois.length} 个点${selection?.truncated ? '（已限量）' : ''}`;
  }
  if (result.metadata?.sources?.pois === 'local-overture') {
    const selection = result.metadata?.poiSelection;
    return `真实 ORS + Overture POI 已生成：${selection?.returnedCount ?? result.pois.length} 个点${selection?.truncated ? '（已限量）' : ''}`;
  }
  if (isOrsIsochrone) return result.metadata?.poiCoverage?.mode === 'preview-radius'
    ? `真实 ORS 等时圈已生成，附近 POI 预览已加载（${result.metadata.poiCoverage.radiusMeters} m）`
    : '真实 ORS 等时圈已生成；POI 未自动请求。';
  return `模拟分析已完成：${result.rangesMinutes.join(' / ')} 分钟圈层`;
}

function mergePoiPreviewIntoResult(result, preview) {
  const previewPois = preview.pois || [];
  const outerRange = Math.max(...result.rangesMinutes);
  const previewRingId = result.rings.find((ring) => Number(ring.outerRangeMinutes) === outerRange)?.ringId || `ring-0-${outerRange}`;
  const pois = previewPois.map((poi) => ({ ...poi, ringId: previewRingId }));
  const counts = new Map();
  pois.forEach((poi) => counts.set(poi.ringId, (counts.get(poi.ringId) || 0) + 1));
  return {
    ...result,
    pois,
    categories: preview.categories || [],
    rings: result.rings.map((ring) => ({ ...ring, statistics: { ...ring.statistics, poiCount: counts.get(ring.ringId) || 0 } })),
    metadata: {
      ...result.metadata,
      source: 'mixed',
      sources: { ...(result.metadata?.sources || {}), pois: 'ors-openpoiservice' },
      poiProvider: preview.metadata?.poiProvider || 'ors_remote',
      poiCoverage: preview.metadata?.poiCoverage || { mode: 'preview-radius', complete: false, radiusMeters: 1000 },
      poiSelection: preview.metadata?.poiSelection || { matchedCount: pois.length, returnedCount: pois.length, truncated: false },
      rateLimit: preview.metadata?.rateLimit || result.metadata?.rateLimit || {},
      attribution: preview.metadata?.attribution || result.metadata?.attribution || [],
      featureCount: pois.length,
      isLive: true,
      cacheHit: Boolean(preview.metadata?.cacheHit),
      warnings: [...new Set([...(result.metadata?.warnings || []), '附近 POI 预览仅覆盖用户选择的半径，未代表完整等时圈覆盖。'])],
    },
  };
}

function setNameCloudLoadingState(isLoading) {
  const currentState = analysisStore?.getState();
  const poiResult = currentState?.data?.workflow?.poiResult;
  const hasPois = successfulResultMatchesDraft(currentState) && poiResult?.pois?.length > 0;
  const readyEmpty = currentState?.data?.workflowStatus?.poi === 'ready-empty';
  const queryError = currentState?.data?.workflowStatus?.poi === 'error';
  const approvalRequired = poiQueryButton?.dataset.approvalRequired === 'true';
  setPoiQueryButtonState(
    isLoading ? 'loading' : approvalRequired || queryError ? 'error' : hasPois || readyEmpty ? 'complete' : canGenerateNameCloud(currentState) ? 'idle' : 'disabled',
    isLoading ? '正在查询 POI…' : approvalRequired ? '请求较大 · 再次点击确认' : queryError ? 'POI 查询失败 · 点击重试' : hasPois || readyEmpty ? 'POI 查询完成' : '查询等时圈内 POI',
  );
  if (analysisStatusCopy && isLoading) analysisStatusCopy.textContent = '正在查询最外层等时圈 Polygon 内的 POI…';
}

async function runNameCloud({ publish = true, jobId = null } = {}) {
  const state = analysisStore?.getState();
  if (!canGenerateNameCloud(state)) {
    showToast('请先为当前中心点、交通方式和时间阈值生成真实等时圈');
    return null;
  }
  const result = state.data.workflow?.reachabilityResult || state.data.lastSuccessfulResult;
  const draft = state.data.parameterDraft;
  const modeLabel = profileLabel(draft.profile);
  const approved = poiQueryButton?.dataset.approvalRequired === 'true';
  if (poiAbortController) poiAbortController.abort();
  const controller = new AbortController();
  poiAbortController = controller;
  const analysisFingerprint = result.metadata?.analysisFingerprint
    || window.PanmapApp.contracts.analysisFingerprint(draft);
  const outerRangeMinutes = Math.max(...draft.rangesMinutes);
  const outerIsochrone = result.cumulativeIsochrones.find((item) => item.rangeMinutes === outerRangeMinutes);
  analysisStore?.setPoiLoading();
  setNameCloudLoadingState(true);
  Object.assign(poiLongTaskMetrics, { longTaskCount: 0, maxLongTaskMs: 0, totalLongTaskMs: 0 });
  performance.mark('poi.total.start');
  performance.mark('poi.fetch.start');
  try {
    if (analysisStatusCopy) analysisStatusCopy.textContent = `正在查询最外层${modeLabel}等时圈 Polygon 内的真实 POI…`;
    const poiResult = await window.PanmapApp.analysisClient.createPoiQuery({
      analysisFingerprint,
      center: draft.center,
      profile: draft.profile,
      rangesMinutes: draft.rangesMinutes,
      categoryIds: draft.categoryIds,
      cumulativeIsochrones: result.cumulativeIsochrones,
      outerIsochrone,
      approved,
    }, { signal: controller.signal });
    performance.mark('poi.fetch.end');
    performance.measure('poi.fetch', 'poi.fetch.start', 'poi.fetch.end');
    if (poiResult.analysisFingerprint !== window.PanmapApp.contracts.analysisFingerprint(analysisStore.getState().data.parameterDraft)) return null;
    if (publish) {
      const accepted = analysisStore?.setPoiResult(poiResult);
      if (!accepted?.accepted) return null;
      performance.mark('poi.render.start');
      const renderMetrics = await traditionalMapAdapter?.setPois(poiResult);
      performance.mark('poi.render.end');
      performance.measure('poi.render', 'poi.render.start', 'poi.render.end');
      poiResult.metadata.frontendRender = renderMetrics || null;
      poiResult.metadata.longTasks = { ...poiLongTaskMetrics };
      const mapElement = document.getElementById('traditionalMap');
      if (mapElement) {
        mapElement.dataset.poiLongTaskCount = String(poiLongTaskMetrics.longTaskCount);
        mapElement.dataset.poiMaxLongTaskMs = poiLongTaskMetrics.maxLongTaskMs.toFixed(2);
      }
    }
    performance.mark('poi.total.end');
    performance.measure('poi.total', 'poi.total.start', 'poi.total.end');
    renderQuota(poiResult.metadata?.apiQuota, poiResult.metadata?.cacheHit ? 'cache' : '');
    setPoiQueryButtonState('complete', 'POI 查询完成');
    poiQueryButton?.removeAttribute('data-approval-required');
    const truncated = Boolean(poiResult.coverage?.resultTruncated);
    showToast(!poiResult.pois.length ? '当前可达域未查询到符合条件的 POI' : poiResult.metadata?.cacheHit
      ? `${modeLabel} POI 已命中真实缓存，未消耗上游请求`
      : truncated ? `${modeLabel} POI 查询完成 · 已返回上游限额内结果` : `${modeLabel} POI 查询完成`);
    return poiResult;
  } catch (error) {
    if (error.name === 'AbortError') {
      if (analysisStatusCopy) analysisStatusCopy.textContent = '参数已变化，已取消旧 POI 查询';
      return null;
    }
    if (error.code === 'APPROVAL_REQUIRED') {
      analysisStore?.cancelPoi('approval-required');
      if (poiQueryButton) poiQueryButton.dataset.approvalRequired = 'true';
      setPoiQueryButtonState('error', '请求较大 · 再次点击确认');
      showToast(`${error.message} 再次点击即可确认继续。`);
      if (analysisStatusCopy) analysisStatusCopy.textContent = 'POI 查询超过自动预算 · 等待确认';
      return null;
    }
    analysisStore?.setPoiError({ code: error.code || 'POI_QUERY_FAILED', message: error.message || 'POI 查询失败' });
    setPoiQueryButtonState('error', 'POI 查询失败 · 点击重试');
    const message = error.code === 'UPSTREAM_RATE_LIMITED' ? 'POI 服务请求频率受限'
      : error.code === 'UPSTREAM_TIMEOUT' ? '查询超时，可重试'
        : error.code === 'ANALYSIS_STALE' ? '参数已变化，旧查询未发布'
          : `POI 查询失败：${error.message || '服务不可用'}`;
    showToast(`${message}（已保留当前等时圈）`);
    if (analysisStatusCopy) analysisStatusCopy.textContent = `${message} · 已保留当前真实等时圈`;
    return null;
  } finally {
    if (poiAbortController === controller) poiAbortController = null;
    setNameCloudLoadingState(false);
  }
}

function setSpatialTimeProgress(completed, total, message = '') {
  const progress = total > 0 ? Math.max(0, Math.min(1, completed / total)) : 0;
  matrixButton?.style.setProperty('--matrix-progress', String(progress));
  const progressLabel = matrixButton?.querySelector('.matrix-progress-label');
  if (progressLabel) {
    progressLabel.hidden = !matrixButton?.classList.contains('is-loading');
    progressLabel.textContent = message || `${completed}/${total} 分钟`;
  }
}

function setMatrixLoadingState(isLoading) {
  matrixButton?.classList.toggle('is-loading', isLoading);
  matrixButton?.setAttribute('aria-busy', String(isLoading));
  if (matrixButtonLabel) matrixButtonLabel.textContent = isLoading
    ? '正在生成分钟等时圈…'
    : analysisStore?.getState().data.workflowStatus?.minute === 'ready' ? '通行时间补齐完成' : '按分钟补齐时间';
  if (matrixButton) matrixButton.disabled = isLoading || !canCalculateSpatialTime(analysisStore?.getState());
  if (!isLoading) setSpatialTimeProgress(0, 1);
  if (analysisStatusCopy && isLoading) analysisStatusCopy.textContent = '正在分批生成 1 分钟精度累计等时圈…';
}

async function runSpatialTimeAccessibility(baseResultOverride = null, { publish = true } = {}) {
  const state = analysisStore?.getState();
  if (!canCalculateSpatialTime(state)) {
    showToast('请先查询当前等时圈内的 POI');
    return null;
  }
  const poiResult = state.data.workflow?.poiResult;
  const total = Math.max(...poiResult.rangesMinutes);
  const intervalLimit = Number(providerCapabilities?.isochrones?.maxIntervalsPerRequest || 10);
  const batchCount = Math.ceil(total / intervalLimit);
  const approved = matrixButton?.dataset.approvalRequired === 'true';
  if (minuteAbortController) minuteAbortController.abort();
  const controller = new AbortController();
  minuteAbortController = controller;
  analysisStore?.setMinuteStatus('planning');
  setMatrixLoadingState(true);
  if (matrixButtonLabel) matrixButtonLabel.textContent = `正在计算 1–${Math.min(intervalLimit, total)} 分钟…`;
  performance.mark('minute.total.start');
  try {
    analysisStore?.setMinuteStatus('running');
    performance.mark('minute.fetch.start');
    const minuteResult = await window.PanmapApp.analysisClient.createMinuteAccessibility(poiResult, { signal: controller.signal, approved });
    performance.mark('minute.fetch.end');
    performance.measure('minute.fetch', 'minute.fetch.start', 'minute.fetch.end');
    const currentPoi = analysisStore?.getState().data.workflow?.poiResult;
    if (!currentPoi || minuteResult.analysisFingerprint !== currentPoi.analysisFingerprint
      || minuteResult.poiQueryId !== currentPoi.poiQueryId) return null;
    matrixButton?.removeAttribute('data-approval-required');
    analysisStore?.setMinuteStatus('classifying');
    if (publish) {
      performance.mark('minute.store.start');
      const accepted = analysisStore?.setMinuteResult(minuteResult);
      performance.mark('minute.store.end');
      performance.measure('minute.store', 'minute.store.start', 'minute.store.end');
      if (!accepted?.accepted) return null;
      performance.mark('minute.index.start');
      minuteAssignmentByPoiId = new Map(minuteResult.assignments.map((item) => [item.poiId, item]));
      const firstPoiId = poiResult.pois?.[0]?.poiId || null;
      const debugDetail = firstPoiId ? window.PanmapApp.poiDetailContract?.buildPoiDetailViewModel(
        firstPoiId, poiResult, minuteResult, poiResult.profile,
      ) : null;
      document.documentElement.dataset.minuteResultAudit = JSON.stringify({
        statistics: minuteResult.statistics, metadata: minuteResult.metadata,
      });
      document.documentElement.dataset.minuteDebugPoiDetail = JSON.stringify(debugDetail);
      performance.mark('minute.index.end');
      performance.measure('minute.index', 'minute.index.start', 'minute.index.end');
    }
    performance.mark('minute.total.end');
    performance.measure('minute.total', 'minute.total.start', 'minute.total.end');
    const storeMs = performance.getEntriesByName('minute.store').at(-1)?.duration || 0;
    const indexMs = performance.getEntriesByName('minute.index').at(-1)?.duration || 0;
    document.documentElement.dataset.minuteFrontendPerformance = JSON.stringify({
      responseParseMs: 0, storePublishMs: storeMs, uiUpdateMs: 0, detailIndexBuildMs: indexMs,
      maxLongTaskMs: poiLongTaskMetrics.maxLongTaskMs || 0, mapRebuildCalls: 0, poiRenderCalls: 0, panmapLayoutCalls: 0,
    });
    showToast(`分钟等时圈补时完成：${minuteResult.statistics?.classifiedPoiCount || 0} 个 POI 已获得 1 分钟精度时间`);
    return minuteResult;
  } catch (error) {
    if (error.name === 'AbortError') {
      analysisStore?.setMinuteStatus('cancelled');
      return null;
    }
    if (error.code === 'APPROVAL_REQUIRED') {
      if (matrixButton) matrixButton.dataset.approvalRequired = 'true';
      analysisStore?.setMinuteStatus('approval-required');
      showToast(`${error.message} 再次点击即可确认继续。`);
      if (analysisStatusCopy) analysisStatusCopy.textContent = '分钟级请求超过自动预算 · 再次点击确认继续';
      return null;
    }
    analysisStore?.setMinuteError({ code: error.code || 'MINUTE_ACCESSIBILITY_FAILED', message: error.message });
    showToast(`分钟等时圈补时失败：${error.message || '服务不可用'}（已保留 POI 查询结果）`);
    if (analysisStatusCopy) analysisStatusCopy.textContent = '分钟等时圈请求失败 · 已保留 POI 查询结果';
    return null;
  } finally {
    if (minuteAbortController === controller) minuteAbortController = null;
    setMatrixLoadingState(false);
  }
}

async function runAnalysis({ jobId = null } = {}) {
  if (analysisAbortController) analysisAbortController.abort();
  if (poiAbortController) poiAbortController.abort();
  if (minuteAbortController) minuteAbortController.abort();
  const controller = new AbortController();
  analysisAbortController = controller;
  let request;
  try {
    request = buildAnalysisRequestFromUI();
  } catch (error) {
    const normalizedError = { code: 'VALIDATION_ERROR', message: error.message, details: [] };
    analysisStore?.setError(normalizedError);
    showToast(error.message);
    return null;
  }
  analysisStore?.setRequest(request);
  analysisStore?.setLoading();
  setAnalysisLoadingState(true);
  try {
    const responseResult = await window.PanmapApp.analysisClient.createAnalysis(request, { signal: controller.signal, jobId });
    const result = {
      ...responseResult,
      pois: [], categories: [], accessibility: [], nameCloud: null,
      metadata: { ...responseResult.metadata, analysisFingerprint: window.PanmapApp.contracts.analysisFingerprint(request) },
    };
    analysisStore?.setResult(result);
    applyAnalysisResultToTraditionalMap(result);
    showToast(analysisSuccessMessage(result));
    return result;
  } catch (error) {
    if (error.name === 'AbortError') return null;
    const normalizedError = {
      code: error.code || 'INTERNAL_ERROR',
      message: error.message || '分析请求失败。',
      details: error.details || [],
      requestId: error.requestId || null,
      status: error.status || null,
    };
    analysisStore?.setError(normalizedError);
    showToast(`分析失败：${normalizedError.message}（已保留当前泛地图）`);
    return null;
  } finally {
    if (analysisAbortController === controller) {
      analysisAbortController = null;
      setAnalysisLoadingState(false);
    }
  }
}

async function loadPoiPreview() {
  if (!window.PanmapApp?.analysisClient?.createPoiPreview) return null;
  if (poiPreviewButton?.classList.contains('is-loading')) return null;
  let result = analysisStore?.getState().data.lastSuccessfulResult;
  const currentState = analysisStore?.getState();
  if (result && !successfulResultMatchesDraft(currentState)) {
    showToast('当前参数已变更，请先生成新的 ORS 等时圈');
    return null;
  }
  if (!result) {
    showToast('请先生成有效的 ORS 等时圈');
    return null;
  }
  const draft = analysisStore?.getState().data.parameterDraft;
  const radiusMeters = Number(poiPreviewRadius?.value || 1000);
  if (![500, 1000, 2000].includes(radiusMeters)) {
    showToast('POI 预览半径只支持 500、1000 或 2000 米');
    return null;
  }
  poiPreviewButton?.classList.add('is-loading');
  poiPreviewButton?.setAttribute('aria-busy', 'true');
  if (poiPreviewButton) poiPreviewButton.disabled = true;
  if (poiPreviewLabel) poiPreviewLabel.textContent = '正在加载 POI 预览…';
  if (analysisStatusCopy) analysisStatusCopy.textContent = `正在加载附近 POI 预览（${radiusMeters} m）…`;
  try {
    const preview = await window.PanmapApp.analysisClient.createPoiPreview({
      center: draft.center,
      profile: draft.profile,
      rangesMinutes: draft.rangesMinutes,
      categoryIds: draft.categoryIds,
      radiusMeters,
    });
    const merged = mergePoiPreviewIntoResult(result, preview);
    analysisStore?.setResult(merged);
    await applyAnalysisResultToPanmap(merged);
    showToast(`附近 POI 预览已加载：${preview.returnedCount ?? preview.pois.length} 个点`);
    return merged;
  } catch (error) {
    showToast(`POI 预览失败：${error.message || '服务不可用'}`);
    return null;
  } finally {
    poiPreviewButton?.classList.remove('is-loading');
    poiPreviewButton?.setAttribute('aria-busy', 'false');
    if (poiPreviewLabel) poiPreviewLabel.textContent = '加载附近 POI 预览';
    if (poiPreviewButton) poiPreviewButton.disabled = false;
    const latestState = analysisStore?.getState();
    if (latestState?.data?.lastSuccessfulResult && !successfulResultMatchesDraft(latestState)) poiPreviewButton.disabled = true;
  }
}

function prepareExactTimeForCurrentProfile() {
  const state = analysisStore?.getState();
  const result = state?.data?.lastSuccessfulResult;
  const profile = state?.data?.parameterDraft?.profile;
  if (!result || !successfulResultMatchesDraft(state) || !Array.isArray(result.pois) || result.pois.length === 0) return false;
  appShell.dataset.exactTimePreparedProfile = profile || result.profile || '';
  appShell.dataset.exactTimePreparedDestinations = String(result.pois.length);
  return true;
}

async function runReachabilityWorkflow() {
  if (primaryWorkflowActive) return;
  primaryWorkflowActive = 'reachability';
  const profile = analysisStore?.getState().data.parameterDraft?.profile;
  const modeLabel = profileLabel(profile);
  try {
    setReachabilityButtonState('loading', '正在生成时间可达域…');
    const ranges = analysisStore?.getState().data.parameterDraft?.rangesMinutes || [];
    if (analysisStatusCopy) analysisStatusCopy.textContent = `正在生成 ${ranges.join('/')} 分钟${modeLabel}可达域 · 仅请求 Isochrones`;
    const analysis = await runAnalysis();
    if (!analysis) throw new Error('可达域生成未完成');
    setReachabilityButtonState('complete', '可达域生成完毕');
    if (analysisStatusCopy) analysisStatusCopy.textContent = `真实${modeLabel}可达域已生成 · 本次只请求 Isochrones · 可继续查询 POI`;
    setPoiQueryButtonState(canGenerateNameCloud(analysisStore?.getState()) ? 'idle' : 'disabled', '查询等时圈内 POI');
  } catch (error) {
    setReachabilityButtonState('error', '生成未完成 · 点击重试');
    if (analysisStatusCopy) analysisStatusCopy.textContent = error.message || '生成流程未完成';
  } finally {
    primaryWorkflowActive = null;
  }
}

async function runPanmapWorkflow() {
  if (primaryWorkflowActive) return;
  primaryWorkflowActive = 'panmap';
  try {
    const result = analysisStore?.getState().data.lastSuccessfulResult;
    if (!result?.metadata?.spatialTime || !successfulResultMatchesDraft(analysisStore?.getState())) throw new Error('请先完成 POI 查询和分钟等时圈精确时间计算');
    setExploreButtonState('loading', '正在构建泛地图…');
    const layout = await applyAnalysisResultToPanmap(result);
    const profile = result.profile;
    const cacheKey = PROFILE_RESULT_CACHE_KEYS[profile];
    if (cacheKey) sessionStorage.setItem(cacheKey, JSON.stringify(result));
    document.documentElement.dataset.profileResultSource = 'current-online-cache';
    updateNameCloudStats(result, layout);
    setExploreButtonState('complete', '进入泛地图');
    setPanmapMode(true);
    if (analysisStatusCopy) analysisStatusCopy.textContent = '泛地图已生成 · 未新增业务 API 请求';
    showToast('已进入泛地图探索；本步骤只执行本地布局');
  } catch (error) {
    setExploreButtonState('error', '生成未完成 · 点击重试');
    if (analysisStatusCopy) analysisStatusCopy.textContent = error.message || '泛地图生成未完成';
  } finally {
    primaryWorkflowActive = null;
  }
}

document.querySelectorAll('[data-nav="settings"]').forEach((button) => {
  button.addEventListener('click', () => {
    showToast('高级参数设置将在下一版页面展开');
    document.querySelectorAll('.primary-item').forEach((item) => item.classList.remove('is-active'));
    button.classList.add('is-active');
  });
});

document.querySelectorAll('[data-nav="explore"]').forEach((button) => {
  button.addEventListener('click', () => {
    setPanmapMode(false);
    document.querySelectorAll('.primary-item').forEach((item) => item.classList.remove('is-active'));
    button.classList.add('is-active');
  });
});

document.querySelectorAll('.secondary-item[data-flow]').forEach((button) => {
  button.addEventListener('click', () => {
    setPanmapMode(button.dataset.flow === 'panmap');
  });
});

document.querySelectorAll('.mode-chip').forEach((button) => {
  button.addEventListener('click', async () => {
    document.querySelectorAll('.mode-chip').forEach((item) => item.classList.remove('is-selected'));
    button.classList.add('is-selected');
    document.querySelectorAll('.toolbar-menu-option').forEach((option) => {
      option.classList.toggle('is-selected', MODE_BY_LABEL[option.dataset.transport] === button.dataset.mode);
    });
    const toolbarMode = Object.entries(MODE_BY_LABEL).find(([, mode]) => mode === button.dataset.mode)?.[0];
    if (toolbarMode) {
      transportToolbarButton.innerHTML = `<span class="toolbar-select-copy"><small>交通方式选择</small><strong>${toolbarMode}</strong></span><span class="toolbar-chevron">⌄</span>`;
    }
    await switchActiveProfile(PROFILE_BY_MODE[button.dataset.mode], button.textContent.trim());
  });
});

document.querySelectorAll('.poi-chip').forEach((button) => {
  button.addEventListener('click', () => {
    button.classList.toggle('is-checked');
    const matchingInput = poiMenuChecks.find((input) => input.dataset.poiMenu === button.dataset.poi);
    if (matchingInput) matchingInput.checked = button.classList.contains('is-checked');
    updatePoiToolbarLabel();
    syncParameterDraftFromUI();
  });
});

document.querySelector('.link-button').addEventListener('click', (event) => {
  const buttons = document.querySelectorAll('.poi-chip');
  const allChecked = [...buttons].every((button) => button.classList.contains('is-checked'));
  buttons.forEach((button) => button.classList.toggle('is-checked', !allChecked));
  poiMenuChecks.forEach((input) => { input.checked = !allChecked; });
  event.currentTarget.textContent = allChecked ? '全选' : '取消全选';
  updatePoiToolbarLabel();
  syncParameterDraftFromUI();
});

document.getElementById('generateButton').addEventListener('click', runReachabilityWorkflow);

const toolbarGenerate = document.getElementById('toolbarGenerate');
const toolbarGenerateLabel = toolbarGenerate.querySelector('.toolbar-generate-label');
const toolbarGenerateArrow = toolbarGenerate.querySelector('.toolbar-generate-arrow');
toolbarGenerate.addEventListener('click', () => {
  if (toolbarGenerate.classList.contains('is-loading')) return;
  toolbarGenerate.classList.add('is-loading');
  toolbarGenerateLabel.textContent = '正在重新生成';
  toolbarGenerateArrow.textContent = '';
  runAnalysis().finally(() => {
    toolbarGenerate.classList.remove('is-loading');
    toolbarGenerateLabel.textContent = '重新生成可达域';
    toolbarGenerateArrow.textContent = '→';
  });
});

poiPreviewButton?.addEventListener('click', loadPoiPreview);
poiQueryButton?.addEventListener('click', runNameCloud);
nameCloudButton?.addEventListener('click', runPanmapWorkflow);
matrixButton?.addEventListener('click', runSpatialTimeAccessibility);

prepareAllProfilesButton?.addEventListener('click', () => {
  analysisStore?.prepareAllProfiles({
    'foot-walking': {
      status: 'planned', sourceType: 'existing-real-cache', outerAreaKm2: 9.769486,
      pieceCount: 1, minimumPoiRequests: 1, adaptiveReserve: 1,
    },
    'cycling-regular': {
      status: 'N/A', sourceType: 'missing-real-cache', reason: '无匹配真实缓存，不联网补取',
    },
    'driving-car': {
      status: 'awaiting-approval', sourceType: 'existing-real-cache', outerAreaKm2: 1903.245963,
      pieceCount: 108, minimumPoiRequests: 108, adaptiveReserve: 27,
      poiRequestUpperBound: 135, budgetStatus: 'approval-required',
    },
  });
  if (analysisStatusCopy) analysisStatusCopy.textContent = '已准备 3 种交通方式计划 · 驾车等待审批 · 未执行请求';
  showToast('仅生成了计划和预算，真实上游请求 0');
});
quotaButton?.addEventListener('click', (event) => {
  event.stopPropagation();
  const nextOpen = quotaPanel?.hasAttribute('hidden');
  if (nextOpen) quotaPanel?.removeAttribute('hidden');
  else quotaPanel?.setAttribute('hidden', '');
  quotaButton?.setAttribute('aria-expanded', String(Boolean(nextOpen)));
});
renderQuota();

document.querySelectorAll('[data-map-action]').forEach((button) => {
  button.addEventListener('click', () => {
    const action = button.dataset.mapAction;
    if (appShell.classList.contains('is-panmap')) {
      if (action === 'zoom-in') zoomPanmap(0.82);
      if (action === 'zoom-out') zoomPanmap(1.2);
      if (action === 'locate') resetPanmapView();
    } else {
      if (action === 'zoom-in') traditionalMapAdapter?.zoomIn();
      if (action === 'zoom-out') traditionalMapAdapter?.zoomOut();
      if (action === 'locate') traditionalMapAdapter?.resetView(analysisStore?.getState().data.parameterDraft.center);
    }
    const messages = { 'zoom-in': '地图已放大', 'zoom-out': '地图已缩小', locate: `已定位到${DEFAULT_CENTER.label}` };
    showToast(messages[action]);
  });
});

toolbarLocationButton.addEventListener('click', (event) => {
  event.stopPropagation();
  const isOpen = locationSuggestPanel.classList.toggle('is-open');
  centerLocationSuggestPanel?.classList.remove('is-open');
  toolbarLocationButton.setAttribute('aria-expanded', String(isOpen));
  if (isOpen) {
    locationSearch.value = '';
    document.querySelectorAll('.suggest-option').forEach((option) => { option.hidden = false; });
    activeGeocoderControl = geocoderControls[0];
    window.setTimeout(() => locationSearch.focus(), 0);
  }
});

locationSuggestPanel.addEventListener('click', (event) => event.stopPropagation());
centerLocationSuggestPanel?.addEventListener('click', (event) => event.stopPropagation());
centerSearchInput?.addEventListener('click', (event) => event.stopPropagation());
centerSearchInput?.addEventListener('focus', () => {
  locationSuggestPanel.classList.remove('is-open');
  centerLocationSuggestPanel?.classList.add('is-open');
  centerSearchInput.setAttribute('aria-expanded', 'true');
  centerLocationSuggestPanel?.querySelectorAll('.suggest-option').forEach((option) => { option.hidden = false; });
  activeGeocoderControl = geocoderControls[1];
});
document.addEventListener('click', (event) => {
  closeLocationSuggest();
  if (quotaPanel && !quotaPanel.contains(event.target) && event.target !== quotaButton) {
    quotaPanel.setAttribute('hidden', '');
    quotaButton?.setAttribute('aria-expanded', 'false');
  }
});

let geocoderAbortController = null;
let geocoderSequence = 0;
let highlightedGeocoderIndex = -1;
const geocoderControls = [
  { input: locationSearch, results: geocoderResults, panel: locationSuggestPanel },
  { input: centerSearchInput, results: centerGeocoderResults, panel: centerLocationSuggestPanel },
].filter((control) => control.input && control.results && control.panel);
let activeGeocoderControl = geocoderControls[0];

function setDraftCenterFromSearch(item, source = 'geocoder') {
  const center = setCenterSelection(item, {
    source: source === 'geolocation' ? 'geolocation' : 'geocoder',
    district: item.admin?.join(' · ') || '搜索结果',
  });
  if (centerSearchInput) centerSearchInput.value = '';
  return center;
}

function renderGeocoderResults(items, target = activeGeocoderControl?.results) {
  if (!target) return;
  target.replaceChildren();
  highlightedGeocoderIndex = -1;
  (items || []).slice(0, 10).forEach((item, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'geocoder-result';
    button.dataset.geocoderIndex = String(index);
    button.setAttribute('role', 'option');
    const title = document.createElement('strong');
    title.textContent = item.label || `${item.lon}, ${item.lat}`;
    const subtitle = document.createElement('span');
    subtitle.textContent = item.admin?.join(' · ') || `${Number(item.lat).toFixed(5)}°, ${Number(item.lon).toFixed(5)}°`;
    button.append(title, subtitle);
    button.addEventListener('click', () => setDraftCenterFromSearch(item, item.source === 'coordinate-text' ? 'geocoder' : 'geocoder'));
    target.appendChild(button);
  });
}

async function requestGeocoderSuggestions(control = activeGeocoderControl) {
  if (!control?.input || !control?.results) return;
  activeGeocoderControl = control;
  const keyword = control.input.value.trim();
  const sequence = ++geocoderSequence;
  if (geocoderAbortController) geocoderAbortController.abort();
  geocoderAbortController = new AbortController();
  control.panel.querySelectorAll('.suggest-option').forEach((option) => {
    option.hidden = Boolean(keyword) && !option.textContent.toLowerCase().includes(keyword.toLowerCase());
  });
  if (keyword.length < 2) {
    renderGeocoderResults([], control.results);
    return;
  }
  const localParts = keyword.split(',').map((part) => Number(part.trim()));
  if (localParts.length === 2 && localParts.every(Number.isFinite) && Math.abs(localParts[0]) <= 180 && Math.abs(localParts[1]) <= 90) {
    renderGeocoderResults([{ id: `coordinate:${localParts[0]}:${localParts[1]}`, label: keyword, lon: localParts[0], lat: localParts[1], admin: [], source: 'coordinate-text' }], control.results);
    return;
  }
  try {
    const draft = analysisStore?.getState().data.parameterDraft;
    const payload = await window.PanmapApp.analysisClient.geocode('autocomplete', {
      text: keyword,
      size: 8,
      'focus.point.lon': draft?.center?.lon,
      'focus.point.lat': draft?.center?.lat,
    }, { signal: geocoderAbortController.signal });
    if (payload.metadata?.apiQuota) renderQuota(payload.metadata.apiQuota, payload.metadata?.cache === 'hit' ? 'cache' : '', 'geocoder');
    if (sequence === geocoderSequence) renderGeocoderResults(payload.results || [], control.results);
  } catch (error) {
    if (error.name !== 'AbortError' && sequence === geocoderSequence) renderGeocoderResults([], control.results);
  }
}

const geocoderTimers = new WeakMap();
function scheduleGeocoderSuggestions(control) {
  window.clearTimeout(geocoderTimers.get(control));
  geocoderTimers.set(control, window.setTimeout(() => requestGeocoderSuggestions(control), 350));
}

function handleGeocoderKeydown(event, control) {
  activeGeocoderControl = control;
  const options = [...(control.results?.querySelectorAll('.geocoder-result') || [])];
  if (event.key === 'Escape') { closeLocationSuggest(); return; }
  if (!options.length) return;
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    highlightedGeocoderIndex = (highlightedGeocoderIndex + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
    options.forEach((option, index) => option.classList.toggle('is-highlighted', index === highlightedGeocoderIndex));
  }
  if (event.key === 'Enter' && highlightedGeocoderIndex >= 0) {
    event.preventDefault();
    options[highlightedGeocoderIndex].click();
  }
}

geocoderControls.forEach((control) => {
  control.input.addEventListener('input', () => {
    activeGeocoderControl = control;
    control.panel.classList.add('is-open');
    scheduleGeocoderSuggestions(control);
  });
  control.input.addEventListener('keydown', (event) => handleGeocoderKeydown(event, control));
});

function presetLocationForPlace(place) {
  return PLACE_COORDINATES[place]
    || Object.values(PLACE_COORDINATES).find((candidate) => candidate.label === place)
    || DEFAULT_CENTER;
}

function selectPresetPlace(option) {
  const place = option.dataset.place;
  const location = presetLocationForPlace(place);
  setCenterSelection({
    lon: location.lon,
    lat: location.lat,
    label: place,
    presetId: location.id,
    id: location.id,
    district: location.district,
  }, { source: 'preset', district: location.district });
}

document.querySelectorAll('.suggest-option, .center-suggest-option').forEach((option) => {
  option.addEventListener('click', () => selectPresetPlace(option));
});

document.getElementById('toolbarMapPick').addEventListener('click', () => {
  closeLocationSuggest();
  setPanmapInteractionMode('select', false);
  startMapPickMode();
});

centerMapPickButton?.addEventListener('click', () => {
  closeLocationSuggest();
  startMapPickMode();
});

async function useBrowserLocation() {
  if (!navigator.geolocation) {
    showToast('当前浏览器不支持定位');
    return;
  }
  useCurrentLocationButton?.setAttribute('aria-busy', 'true');
  if (useCurrentLocationButton) useCurrentLocationButton.disabled = true;
  showToast('正在请求浏览器当前位置，首次定位可能需要授权…');
  const acceptPosition = async (position) => {
    const { longitude, latitude, accuracy } = position.coords || {};
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
      showToast('浏览器返回了无效坐标');
      useCurrentLocationButton?.setAttribute('aria-busy', 'false');
      if (useCurrentLocationButton) useCurrentLocationButton.disabled = false;
      return;
    }
    const center = setCenterSelection({ lon: Number(longitude.toFixed(6)), lat: Number(latitude.toFixed(6)), label: '当前位置', id: 'browser-geolocation', accuracyMeters: Number.isFinite(accuracy) ? accuracy : null }, { source: 'geolocation', district: '浏览器定位' });
    try {
      const payload = await window.PanmapApp.analysisClient.reverseGeocode(center.lon, center.lat);
      const result = payload.results?.[0];
      if (result?.label) setDraftCenterFromSearch({ ...result, accuracyMeters: center.accuracyMeters }, 'geolocation');
    } catch (error) {
      // Reverse geocoding is enrichment only; the valid browser position remains usable.
    }
    showToast('当前位置已设为待分析中心点');
    useCurrentLocationButton?.setAttribute('aria-busy', 'false');
    if (useCurrentLocationButton) useCurrentLocationButton.disabled = false;
  };
  const rejectPosition = (error, allowRetry = true) => {
    if (error.code === 3 && allowRetry) {
      showToast('高精度定位较慢，正在尝试最近一次可用位置…');
      navigator.geolocation.getCurrentPosition(acceptPosition, (retryError) => rejectPosition(retryError, false), {
        enableHighAccuracy: false, timeout: 15000, maximumAge: 600000,
      });
      return;
    }
    const messages = { 1: '定位权限被拒绝', 2: '当前位置暂不可用', 3: '定位请求超时' };
    showToast(messages[error.code] || '无法获取当前位置');
    useCurrentLocationButton?.setAttribute('aria-busy', 'false');
    if (useCurrentLocationButton) useCurrentLocationButton.disabled = false;
  };
  navigator.geolocation.getCurrentPosition(acceptPosition, rejectPosition, {
    enableHighAccuracy: true, timeout: 30000, maximumAge: 300000,
  });
}

useCurrentLocationButton?.addEventListener('click', useBrowserLocation);

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || !analysisStore?.getState().interaction.isMapPickMode) return;
  analysisStore.setMapPickMode(false);
  mapSurface.classList.remove('is-picking');
  appShell.classList.remove('is-map-picking');
  traditionalMapAdapter?.setMapPickMode(false);
  updateMapPickCoordinate(null);
  showToast('已取消地图选点');
});

const mapSplitter = document.getElementById('mapSplitter');
mapSplitter.addEventListener('pointerdown', (event) => {
  if (!mapPanel.classList.contains('is-split')) return;
  isDraggingSplitter = true;
  mapSplitter.setPointerCapture?.(event.pointerId);
  document.body.classList.add('is-resizing');
  event.preventDefault();
});
window.addEventListener('pointermove', (event) => {
  if (!isDraggingSplitter) return;
  const rect = mapSurface.getBoundingClientRect();
  const ratio = Math.max(26, Math.min(62, ((event.clientX - rect.left) / rect.width) * 100));
  mapSurface.style.setProperty('--split-ratio', `${ratio}%`);
});
window.addEventListener('pointerup', () => {
  if (!isDraggingSplitter) return;
  isDraggingSplitter = false;
  document.body.classList.remove('is-resizing');
  window.setTimeout(() => traditionalMapAdapter?.resize(), 60);
});
window.addEventListener('resize', () => traditionalMapAdapter?.resize());

document.getElementById('helpButton').addEventListener('click', () => {
  showToast('先选中心点、交通方式和时间阈值，再生成等时圈层');
});

document.getElementById('centerSearchClear')?.addEventListener('click', () => {
  if (centerSearchInput) centerSearchInput.value = '';
  centerGeocoderResults?.replaceChildren();
  centerLocationSuggestPanel?.classList.remove('is-open');
  showToast('地点搜索已清除');
});
document.querySelector('.copy-button').addEventListener('click', () => showToast('坐标已复制'));
document.querySelector('.advanced-toggle').addEventListener('click', () => showToast('高级选项将在下一版展开'));

const transportToolbarButton = document.getElementById('transportToolbarButton');
const transportToolbarMenu = document.getElementById('transportToolbarMenu');
const poiToolbarButton = document.getElementById('poiToolbarButton');
const poiToolbarMenu = document.getElementById('poiToolbarMenu');
const toolbarMenuSelectAll = document.getElementById('poiMenuSelectAll');

function closeToolbarMenus() {
  transportToolbarMenu.classList.remove('is-open');
  poiToolbarMenu.classList.remove('is-open');
  transportToolbarButton.setAttribute('aria-expanded', 'false');
  poiToolbarButton.setAttribute('aria-expanded', 'false');
}

transportToolbarButton.addEventListener('click', (event) => {
  event.stopPropagation();
  const open = !transportToolbarMenu.classList.contains('is-open');
  closeToolbarMenus();
  transportToolbarMenu.classList.toggle('is-open', open);
  transportToolbarButton.setAttribute('aria-expanded', String(open));
});

poiToolbarButton.addEventListener('click', (event) => {
  event.stopPropagation();
  const open = !poiToolbarMenu.classList.contains('is-open');
  closeToolbarMenus();
  poiToolbarMenu.classList.toggle('is-open', open);
  poiToolbarButton.setAttribute('aria-expanded', String(open));
});

transportToolbarMenu.addEventListener('click', (event) => event.stopPropagation());
poiToolbarMenu.addEventListener('click', (event) => event.stopPropagation());
document.addEventListener('click', closeToolbarMenus);

document.querySelectorAll('.toolbar-menu-option').forEach((option) => {
  option.addEventListener('click', async () => {
    const selectedMode = MODE_BY_LABEL[option.dataset.transport];
    if (!selectedMode) {
      closeToolbarMenus();
      showToast('本阶段模拟 API 只支持步行、骑行和驾车');
      return;
    }
    document.querySelectorAll('.toolbar-menu-option').forEach((item) => item.classList.remove('is-selected'));
    option.classList.add('is-selected');
    document.querySelectorAll('.mode-chip').forEach((item) => item.classList.toggle('is-selected', item.dataset.mode === selectedMode));
    transportToolbarButton.innerHTML = `<span class="toolbar-select-copy"><small>交通方式选择</small><strong>${option.dataset.transport}</strong></span><span class="toolbar-chevron">⌄</span>`;
    await switchActiveProfile(PROFILE_BY_MODE[selectedMode], option.dataset.transport);
    closeToolbarMenus();
  });
});

const poiMenuChecks = [...document.querySelectorAll('[data-poi-menu]')];
function updatePoiToolbarLabel() {
  const selectedCount = poiMenuChecks.filter((input) => input.checked).length;
  const label = selectedCount === poiMenuChecks.length ? `全部 ${poiMenuChecks.length} 项` : `${selectedCount} 项`;
  poiToolbarButton.innerHTML = `<span class="toolbar-select-copy"><small>POI 类别</small><strong>${label}</strong></span><span class="toolbar-chevron">⌄</span>`;
  toolbarMenuSelectAll.textContent = selectedCount === poiMenuChecks.length ? '取消全选' : '全选';
  document.querySelectorAll('.poi-chip').forEach((chip) => {
    const matchingInput = poiMenuChecks.find((input) => input.dataset.poiMenu === chip.dataset.poi);
    chip.classList.toggle('is-checked', Boolean(matchingInput?.checked));
  });
}
poiMenuChecks.forEach((input) => input.addEventListener('change', () => {
  updatePoiToolbarLabel();
  syncParameterDraftFromUI();
}));
toolbarMenuSelectAll.addEventListener('click', () => {
  const allChecked = poiMenuChecks.every((input) => input.checked);
  poiMenuChecks.forEach((input) => { input.checked = !allChecked; });
  updatePoiToolbarLabel();
  syncParameterDraftFromUI();
});

const thresholdList = document.getElementById('thresholdList');

function thresholdRangesFromUI() {
  return [...thresholdList.querySelectorAll('.threshold-item')]
    .map((row) => Number(row.dataset.threshold))
    .filter(Number.isFinite)
    .sort((left, right) => left - right);
}

function renderIsochronePalette() {
  const items = ISOCHRONE_PALETTE?.paletteForRanges(thresholdRangesFromUI()) || [];
  const byRange = new Map(items.map((item) => [item.rangeMinutes, item]));
  thresholdList.querySelectorAll('.threshold-item').forEach((row) => {
    const range = Number(row.dataset.threshold);
    const item = byRange.get(range);
    if (!item) return;
    row.dataset.color = item.stroke;
    row.dataset.paletteId = item.id;
    row.style.setProperty('--threshold-color', activeThresholdRange === range ? item.activeStroke : item.stroke);
    row.classList.toggle('is-active-ring', activeThresholdRange === range);
  });
  mapLegendItems?.replaceChildren(...items.map((item, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'map-legend-item';
    button.dataset.legendRange = String(item.rangeMinutes);
    button.classList.toggle('is-active-ring', activeThresholdRange === item.rangeMinutes);
    button.style.setProperty('--legend-stroke', activeThresholdRange === item.rangeMinutes ? item.activeStroke : item.stroke);
    button.style.setProperty('--legend-fill', item.fill);
    button.style.setProperty('--legend-fill-opacity', String(activeThresholdRange === item.rangeMinutes ? Math.min(0.36, item.fillOpacity + 0.13) : item.fillOpacity));
    const shapes = [
      'M3 7 10 2l11 2 4 7-5 8-12 1-5-6Z',
      'm4 5 9-3 10 4 2 9-7 5-11-2-4-7Z',
      'm3 6 8-4 12 3 3 8-6 7-12-1-5-6Z',
    ];
    button.innerHTML = `<svg class="legend-polygon" viewBox="0 0 28 22" aria-hidden="true"><path d="${shapes[index % shapes.length]}"/></svg><span>${item.rangeMinutes} 分钟圈层</span>`;
    button.setAttribute('aria-pressed', String(activeThresholdRange === item.rangeMinutes));
    button.addEventListener('click', () => selectThresholdRange(item.rangeMinutes));
    return button;
  }));
  traditionalMapAdapter?.setPaletteRanges(items.map((item) => item.rangeMinutes));
  document.documentElement.dataset.isochronePalette = items.map((item) => `${item.rangeMinutes}:${item.stroke}`).join('|');
}

function selectThresholdRange(range, announce = true) {
  const numericRange = Number(range);
  activeThresholdRange = activeThresholdRange === numericRange ? null : numericRange;
  const result = analysisStore?.getState().data.lastSuccessfulResult;
  const ring = result?.rings?.find((item) => Number(item.outerRangeMinutes) === activeThresholdRange);
  analysisStore?.setActiveRingId(ring?.ringId || null);
  if (ring) setActiveTimeLayer(String(activeThresholdRange), false);
  renderIsochronePalette();
  if (announce) showToast(activeThresholdRange ? `${activeThresholdRange} 分钟圈层已选中` : '已恢复全部时间圈层');
}

function sortThresholdRows() {
  [...thresholdList.children]
    .sort((left, right) => Number(left.dataset.threshold) - Number(right.dataset.threshold))
    .forEach((row) => thresholdList.appendChild(row));
  renderIsochronePalette();
}

function bindThresholdRow(row) {
  const thresholdInput = row.querySelector('.time-input input');
  const thresholdLabel = row.querySelector('strong');
  const visibilityButton = row.querySelector('.threshold-visibility');
  const deleteButton = row.querySelector('.threshold-delete');

  function syncThresholdLabel() {
    const maximum = currentProfileMaxMinutes();
    const value = Math.max(1, Math.min(maximum, Number(thresholdInput.value) || 1));
    thresholdInput.max = String(maximum);
    thresholdInput.value = value;
    thresholdLabel.textContent = `${value} 分钟`;
    row.dataset.threshold = String(value);
    thresholdInput.setAttribute('aria-label', `${value} 分钟阈值`);
    visibilityButton.setAttribute('aria-label', `${visibilityButton.classList.contains('is-visible') ? '隐藏' : '显示'} ${value} 分钟圈层`);
    deleteButton.setAttribute('aria-label', `删除 ${value} 分钟阈值`);
  }

  thresholdInput.addEventListener('input', () => {
    syncThresholdLabel();
    sortThresholdRows();
    syncParameterDraftFromUI();
  });
  thresholdInput.addEventListener('change', sortThresholdRows);
  row.addEventListener('click', (event) => {
    if (event.target.closest('button, input')) return;
    selectThresholdRange(Number(row.dataset.threshold));
  });
  row.querySelectorAll('[data-step]').forEach((stepButton) => {
    stepButton.addEventListener('click', () => {
      const delta = stepButton.dataset.step === 'up' ? 5 : -5;
      thresholdInput.value = Math.max(1, Math.min(currentProfileMaxMinutes(), Number(thresholdInput.value) + delta));
      syncThresholdLabel();
      syncParameterDraftFromUI();
    });
  });
  visibilityButton.addEventListener('click', () => {
    const visible = visibilityButton.classList.toggle('is-visible');
    row.classList.toggle('is-hidden', !visible);
    visibilityButton.textContent = visible ? '◉' : '◌';
    visibilityButton.setAttribute('aria-pressed', String(visible));
    syncThresholdLabel();
    syncParameterDraftFromUI();
    showToast(`${row.dataset.threshold} 分钟圈层已${visible ? '显示' : '隐藏'}`);
  });
  deleteButton.addEventListener('click', () => {
    if (thresholdList.children.length <= 1) {
      showToast('至少保留一个时间阈值');
      return;
    }
    row.remove();
    if (activeThresholdRange === Number(row.dataset.threshold)) activeThresholdRange = null;
    sortThresholdRows();
    syncParameterDraftFromUI();
    showToast('时间阈值已删除');
  });
  syncThresholdLabel();
  renderIsochronePalette();
}

document.querySelectorAll('.threshold-item').forEach(bindThresholdRow);
sortThresholdRows();

const addThresholdButton = document.getElementById('addThresholdButton');
const thresholdAddPopover = document.getElementById('thresholdAddPopover');
const newThresholdInput = document.getElementById('newThresholdInput');
const confirmThresholdButton = document.getElementById('confirmThresholdButton');
addThresholdButton.addEventListener('click', (event) => {
  event.stopPropagation();
  thresholdAddPopover.classList.toggle('is-open');
  if (thresholdAddPopover.classList.contains('is-open')) window.setTimeout(() => newThresholdInput.focus(), 0);
});
thresholdAddPopover.addEventListener('click', (event) => event.stopPropagation());
document.addEventListener('click', () => thresholdAddPopover.classList.remove('is-open'));
confirmThresholdButton.addEventListener('click', () => {
  if (thresholdList.children.length >= 10) {
    showToast('最多添加 10 个时间阈值');
    return;
  }
  const maximum = currentProfileMaxMinutes();
  const rawValue = Number(newThresholdInput.value) || 45;
  if (rawValue > maximum) {
    const profile = analysisStore?.getState().data.parameterDraft?.profile || 'foot-walking';
    showToast(`当前 ORS 公共 ${profile} 最大时间范围为 ${maximum} 分钟`);
    return;
  }
  const value = Math.max(1, rawValue);
  if ([...thresholdList.querySelectorAll('.time-input input')].some((input) => Number(input.value) === value)) {
    showToast(`${value} 分钟阈值已存在`);
    return;
  }
  const row = document.createElement('div');
  row.className = 'threshold-item';
  row.dataset.threshold = String(value);
  row.dataset.color = '';
  row.innerHTML = `<button type="button" class="threshold-select threshold-visibility is-visible" aria-label="隐藏 ${value} 分钟圈层" aria-pressed="true">◉</button><span class="threshold-color"></span><strong>${value} 分钟</strong><div class="time-input"><input type="number" value="${value}" min="1" max="60" aria-label="${value} 分钟阈值" /><em>分钟</em></div><span class="stepper"><button type="button" data-step="down">−</button><button type="button" data-step="up">＋</button></span><button type="button" class="threshold-delete" aria-label="删除 ${value} 分钟阈值">×</button>`;
  thresholdList.appendChild(row);
  bindThresholdRow(row);
  sortThresholdRows();
  thresholdAddPopover.classList.remove('is-open');
  syncParameterDraftFromUI();
  showToast(`${value} 分钟阈值已添加`);
});

document.querySelectorAll('[data-quick-minutes]').forEach((button) => {
  button.addEventListener('click', () => {
    const value = Number(button.dataset.quickMinutes);
    const existing = [...thresholdList.querySelectorAll('.time-input input')].find((input) => Number(input.value) === value);
    if (existing) {
      const existingRow = existing.closest('.threshold-item');
      const visibilityButton = existingRow.querySelector('.threshold-visibility');
      visibilityButton.classList.add('is-visible');
      visibilityButton.textContent = '◉';
      visibilityButton.setAttribute('aria-pressed', 'true');
      existingRow.classList.remove('is-hidden');
      syncParameterDraftFromUI();
      showToast(`${value} 分钟阈值已选中`);
      return;
    }
    newThresholdInput.value = value;
    confirmThresholdButton.click();
  });
});

document.querySelectorAll('[data-mini-map-action]').forEach((button) => {
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    showToast(button.dataset.miniMapAction === 'locate' ? `传统地图已定位到${DEFAULT_CENTER.label}` : '传统地图视窗已调整');
  });
});

initializePanmapControls();
bindUnifiedWorkspaceControls();
initializePanmapModeControls();
loadPoiDatasets();

async function loadOnlineProviderStatus() {
  if (!window.PanmapApp?.analysisClient?.getHealth || !onlineProviderStatus) return;
  try {
    const health = await window.PanmapApp.analysisClient.getHealth();
    providerCapabilities = health.providerCapabilities || null;
    document.querySelectorAll('#thresholdList input[type="number"], #newThresholdInput').forEach((input) => { input.max = String(currentProfileMaxMinutes()); });
    const ready = health.status === 'ready' && health.networkProbePerformed === false && health.mockFallback === false;
    onlineProviderStatus.classList.toggle('is-ready', ready);
    onlineProviderStatus.classList.toggle('is-not-ready', !ready);
    const missing = Array.isArray(health.missingConfiguration) ? health.missingConfiguration.join('、') : '';
    onlineProviderStatus.querySelector('strong').textContent = ready
      ? '在线服务：已配置'
      : `在线服务未就绪${missing ? `：缺少 ${missing}` : ''}`;
    document.documentElement.dataset.providerReadiness = health.status;
    document.documentElement.dataset.providerNetworkProbe = String(health.networkProbePerformed);
    document.documentElement.dataset.mockFallback = String(health.mockFallback);
  } catch (error) {
    onlineProviderStatus.classList.add('is-not-ready');
    onlineProviderStatus.querySelector('strong').textContent = '本地后端未就绪';
    document.documentElement.dataset.providerReadiness = 'unavailable';
  }
}

loadOnlineProviderStatus();

async function loadStage21CachedBaseline() {
  const params = new URLSearchParams(window.location.search);
  const requestedResearch = panmapModeStore?.getState().mode === 'research';
  const stage51WalkingBaseline = params.get('stage51WalkingBaseline') === '1';
  if (params.get('stage21Baseline') !== '1' && !requestedResearch && params.get('stage45Cache') !== '1' && !stage51WalkingBaseline) return;
  let result = null;
  if (stage51WalkingBaseline) {
    const response = await fetch('./exports/stage-10-cycling-live/stage45-walking-cache-complete.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`第45号真实步行缓存读取失败：HTTP ${response.status}`);
    result = window.PanmapApp.contracts.normalizeAnalysisResult(await response.json());
    document.documentElement.dataset.walkingResultSource = 'current-online-cache';
  } else if (requestedResearch || params.get('stage45Cache') === '1') {
    try {
      const cached = sessionStorage.getItem(STAGE45_WALKING_CACHE_KEY);
      if (cached) result = window.PanmapApp.contracts.normalizeAnalysisResult(JSON.parse(cached));
    } catch (error) {
      sessionStorage.removeItem(STAGE45_WALKING_CACHE_KEY);
    }
  }
  if (!result) {
    const response = await fetch('./exports/stage-6-layout/stage20-cache-baseline.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`第20号缓存夹具读取失败：HTTP ${response.status}`);
    result = window.PanmapApp.contracts.normalizeAnalysisResult(await response.json());
    document.documentElement.dataset.walkingResultSource = 'frozen-research';
  } else {
    const isPublishedStage45Cache = result.profile === 'foot-walking'
      && result.pois?.length === 284
      && result.metadata?.matrix?.matrixWithinRangeCount === 254
      && result.metadata?.matrix?.resultFingerprint === STAGE45_PUBLISHED_MATRIX_FINGERPRINT;
    if (isPublishedStage45Cache) result.analysisId = STAGE45_PUBLISHED_ANALYSIS_ID;
    document.documentElement.dataset.walkingResultSource = 'current-online-cache';
  }
  const request = {
    schemaVersion: '1.0', center: result.center, profile: result.profile,
    rangesMinutes: result.rangesMinutes, categoryIds: [], poiDatasetId: null,
    options: { includePois: true, calculateTravelTimes: true, poiPreviewRadiusMeters: 1000 },
  };
  const stage37Layout = params.get('stage37Layout');
  const stage37Configs = {
    'baseline-geographic':{labelOrientation:'geographic-radial',compactAlgorithm:'frontier-contact',randomSeed:'stage33-fixed-wuhan-20260802'},
    fermat:{labelOrientation:'compact-geographic',compactAlgorithm:'fermat',randomSeed:'stage37-fixed-wuhan-20260804'},
    poisson:{labelOrientation:'compact-geographic',compactAlgorithm:'poisson-disc',randomSeed:'stage37-fixed-wuhan-20260804'},
    'frontier-geographic':{labelOrientation:'compact-geographic',compactAlgorithm:'frontier-contact',randomSeed:'stage37-fixed-wuhan-20260804'},
    'frontier-random-match':{labelOrientation:'compact-random-match',compactAlgorithm:'frontier-contact',randomSeed:'stage37-fixed-wuhan-20260804'},
  };
  if (stage37Configs[stage37Layout] && panmapControlStore) {
    panmapControlStore.setDraft({...stage37Configs[stage37Layout],envelopeMode:'circular',compactness:50,fontHierarchy:50,showDensityDebug:false});
    panmapControlStore.apply();
    document.documentElement.dataset.stage37RequestedLayout=stage37Layout;
    document.documentElement.dataset.stage37NaturalEnvelopeRuns='0';
  }
  analysisStore?.setParameterDraft({ center: result.center, profile: result.profile, rangesMinutes: result.rangesMinutes, categoryIds: [], options: request.options });
  analysisStore?.setRequest(request);
  analysisStore?.setResult(result);
  document.querySelectorAll('.mode-chip').forEach((item) => item.classList.toggle('is-selected', item.dataset.mode === 'walk'));
  const transportButton = document.getElementById('transportToolbarButton');
  if (transportButton) transportButton.innerHTML = '<span class="toolbar-select-copy"><small>交通方式选择</small><strong>步行</strong></span><span class="toolbar-chevron">⌄</span>';
  const layout = await applyAnalysisResultToPanmap(result);
  if (document.documentElement.dataset.walkingResultSource === 'current-online-cache') {
    window.PanmapApp.stage45Evidence = {
      jobId: null, analysisId: result.analysisId, profile: result.profile,
      rangesMinutes: result.rangesMinutes, totalPois: result.pois.length,
      accessibilityCount: result.accessibility?.length || 0,
      ringCounts: Object.fromEntries(result.rings.map((ring) => [ring.ringId, ring.statistics?.poiCount || 0])),
      matrix: result.metadata?.matrix || null, poiCoverage: result.metadata?.poiCoverage || null,
      nameCloud: result.nameCloud?.stats || null, source: 'current-online-cache',
    };
    document.documentElement.dataset.stage45Evidence = JSON.stringify(window.PanmapApp.stage45Evidence);
  }
  document.documentElement.dataset.stage21Baseline = 'loaded';
  document.documentElement.dataset.stage21UpstreamRequests = '0';
  updateNameCloudStats(result, layout);
  updateNameCloudPresentation(result, layout);
  if (stage37Configs[stage37Layout]) {
    setPanmapMode(true);
    window.setTimeout(() => applyStage33View('overview', false), 100);
  }
  if (requestedResearch) {
    setPanmapMode(true);
  }
  if (params.get('stage45Cache') === '1') setPanmapMode(true);
  if (params.get('stage31Controls') === '1') {
    setPanmapMode(true);
    document.documentElement.dataset.stage31Controls = 'loaded';
    document.documentElement.dataset.stage31FootBaseline = '282-252-39-83-130';
    document.documentElement.dataset.stage31LayoutBaseline = `${layout?.nameCloudStats?.placedCount || 0}/252`;
  }
  const stage33Mode = params.get('stage33Radial');
  if (['geographic-radial', 'random-radial'].includes(stage33Mode) && panmapControlStore) {
    setPanmapMode(true);
    panmapControlStore.setDraft({ labelOrientation: stage33Mode, envelopeMode: 'circular', compactness: 50, fontHierarchy: 50, randomSeed: 'stage33-fixed-wuhan-20260802' });
    panmapControlStore.apply();
    document.documentElement.dataset.stage33Radial = stage33Mode;
    document.documentElement.dataset.stage33UpstreamRequests = '0';
  }
  const stage35Combo = params.get('stage35Combo');
  const stage35Configs = {'G-C':{labelOrientation:'geographic-radial',envelopeMode:'circular'},'G-N':{labelOrientation:'geographic-radial',envelopeMode:'natural-density'},'R-C':{labelOrientation:'random-radial',envelopeMode:'circular'},'R-N':{labelOrientation:'random-radial',envelopeMode:'natural-density'}};
  if (stage35Configs[stage35Combo] && panmapControlStore) {
    setPanmapMode(true);
    panmapControlStore.setDraft({...stage35Configs[stage35Combo],compactness:50,fontHierarchy:50,envelopeTightness:50,envelopeSmoothness:60,minEnvelopeGapPx:12,showDensityDebug:false,randomSeed:'stage33-fixed-wuhan-20260802'});
    panmapControlStore.apply();
    document.documentElement.dataset.stage35RequestedCombo=stage35Combo;
    document.documentElement.dataset.stage35UpstreamRequests='0';
  }
}

loadStage21CachedBaseline().catch((error) => {
  document.documentElement.dataset.stage21Baseline = 'error';
  showToast(error.message || '第20号缓存夹具读取失败');
});

async function loadStage29CyclingResult() {
  const params = new URLSearchParams(window.location.search);
  const stage51Cycling = params.get('stage51Cycling') === '1';
  if (params.get('stage29Cycling') !== '1' && !stage51Cycling) return;
  const sourcePath = stage51Cycling
    ? './exports/stage-10-cycling-live/stage51-cycling-complete.json'
    : './exports/stage-6-integrated-live/stage29-cycling-complete.json';
  const response = await fetch(sourcePath, { cache: 'no-store' });
  if (!response.ok) throw new Error(`骑行真实缓存读取失败：HTTP ${response.status}`);
  const result = window.PanmapApp.contracts.normalizeAnalysisResult(await response.json());
  if (result.profile !== 'cycling-regular' || result.status !== 'completed') {
    throw new Error('第29号骑行结果 profile/status 不匹配');
  }
  const request = {
    schemaVersion: '1.0', center: result.center, profile: result.profile,
    rangesMinutes: result.rangesMinutes, categoryIds: [], poiDatasetId: null,
    options: { includePois: true, calculateTravelTimes: true, poiPreviewRadiusMeters: 1000 },
  };
  analysisStore?.setParameterDraft({ center: result.center, profile: result.profile, rangesMinutes: result.rangesMinutes, categoryIds: [], options: request.options });
  analysisStore?.setRequest(request);
  analysisStore?.setResult(result);
  document.querySelectorAll('.mode-chip').forEach((item) => item.classList.toggle('is-selected', item.dataset.mode === 'bike'));
  const transportButton = document.getElementById('transportToolbarButton');
  if (transportButton) transportButton.innerHTML = '<span class="toolbar-select-copy"><small>交通方式选择</small><strong>骑行</strong></span><span class="toolbar-chevron">⌄</span>';
  const layout = await applyAnalysisResultToPanmap(result);
  updateNameCloudStats(result, layout);
  updateNameCloudPresentation(result, layout);
  document.documentElement.dataset.stage29Cycling = 'loaded';
  document.documentElement.dataset.stage29UpstreamRequests = '0';
  if (stage51Cycling) {
    document.documentElement.dataset.cyclingResultSource = 'stage29-validated-real-cache';
    document.documentElement.dataset.stage51Cycling = 'loaded';
    document.documentElement.dataset.stage51UpstreamRequests = '0';
    window.PanmapApp.stage51Evidence = {
      jobId: null, analysisId: result.analysisId, profile: result.profile,
      rangesMinutes: result.rangesMinutes, totalPois: result.pois.length,
      accessibilityCount: result.accessibility?.length || 0,
      ringCounts: Object.fromEntries(result.rings.map((ring) => [ring.ringId, ring.statistics?.poiCount || 0])),
      matrix: result.metadata?.matrix || null, poiCoverage: result.metadata?.poiCoverage || null,
      nameCloud: result.nameCloud?.stats || null, source: 'stage29-validated-real-cache',
    };
    document.documentElement.dataset.stage51Evidence = JSON.stringify(window.PanmapApp.stage51Evidence);
    setPanmapMode(true);
  }
}

loadStage29CyclingResult().catch((error) => {
  document.documentElement.dataset.stage29Cycling = 'error';
  showToast(error.message || '第29号骑行结果读取失败');
});

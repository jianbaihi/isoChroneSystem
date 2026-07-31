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
const poiPreviewLabel = poiPreviewButton?.querySelector('.poi-explore-label');
const nameCloudButton = document.getElementById('nameCloudButton');
const nameCloudButtonLabel = nameCloudButton?.querySelector('.name-cloud-button-label');
const nameCloudStats = document.getElementById('nameCloudStats');
const quotaButton = document.getElementById('quotaButton');
const quotaPanel = document.getElementById('quotaPanel');
const quotaSummary = document.getElementById('quotaSummary');
const quotaTable = document.getElementById('quotaTable');
const quotaNote = document.getElementById('quotaNote');
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
let isDraggingSplitter = false;
let isPanningPanmap = false;
let didPanPanmap = false;
let panPointerStart = null;
let panmapInteractionMode = 'select';
const defaultPanmapViewBox = { x: 0, y: 0, width: 1850, height: 980 };
let panmapViewBox = { ...defaultPanmapViewBox };
let lastPanmapInteractionKey = '';
let lastQuotaSnapshot = { services: {} };

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
  const area = Number(result?.metadata?.poiCoverage?.areaKm2);

  overviewHeading.textContent = `未分类名称云（${activeLayer}分钟）`;
  overviewPoiTotal.textContent = String(bandAvailable);
  overviewArea.textContent = Number.isFinite(area) ? `${area.toFixed(2)} km² 外圈` : '外圈面积未知';
  if (overviewNameCloudPlaced) overviewNameCloudPlaced.textContent = `${placed} / ${named}`;
  if (overviewNameCloudUnplaced) overviewNameCloudUnplaced.textContent = String(unplaced);
  if (overviewNameCloudNamed) overviewNameCloudNamed.textContent = String(named);
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

const QUOTA_SERVICE_LABELS = { isochrones: '等时圈', geocoder: '地点搜索', pois: 'POI' };

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
    nameCloudStats.textContent = '名称云需先生成黄鹤楼步行 10/20/30 分钟真实等时圈';
    return;
  }
  const placed = layoutState?.nameCloudStats?.placedCount ?? stats.placedCount ?? 0;
  const unplaced = layoutState?.nameCloudStats?.unplacedCount ?? stats.unplacedCount ?? 0;
  const bands = layoutState?.nameCloudStats?.bands || [];
  const bandText = bands.map((band) => `${band.time}分 ${band.placed}/${band.available}`).join(' · ');
  nameCloudStats.textContent = `原始 ${stats.rawPoiCount} · 具名 ${stats.namedPoiCount} · 去重 ${stats.deduplicatedPoiCount} · 已摆放 ${placed} · 未摆放 ${unplaced}${bandText ? ` · ${bandText}` : ''}`;
}

function canGenerateNameCloud(state) {
  const result = state?.data?.lastSuccessfulResult;
  const draft = state?.data?.parameterDraft;
  return Boolean(result && draft && successfulResultMatchesDraft(state)
    && result.profile === 'foot-walking'
    && sameNumberList(result.rangesMinutes, [10, 20, 30])
    && Array.isArray(result.cumulativeIsochrones)
    && result.cumulativeIsochrones.length === 3
    && result.metadata?.isLive
    && ['ors', 'ors-public-api'].includes(result.metadata?.sources?.isochrones));
}

function updateResultCard(result) {
  const rings = Array.isArray(result?.rings) ? result.rings : [];
  const pois = Array.isArray(result?.pois) ? result.pois : [];
  const categories = Array.isArray(result?.categories) ? result.categories : [];
  const isLive = Boolean(result?.metadata?.isLive);
  const status = result
    ? result.metadata?.poiCoverage?.mode === 'preview-radius'
      ? 'POI 预览'
      : isLive
        ? (result.metadata?.cacheHit ? '真实·缓存命中' : '真实 ORS')
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

function renderDraftCenter(center, source) {
  if (!center) return;
  const label = String(center.label || '地图选点');
  const displayName = source === 'map-click' ? '地图选点' : label;
  const locationName = document.getElementById('selectedCenterName') || document.querySelector('.location-input strong');
  const locationSub = document.getElementById('selectedCenterDistrict') || document.querySelector('.location-input .location-sub');
  const coordinateText = document.querySelector('.coordinate-row strong');
  if (locationName) locationName.textContent = displayName;
  if (locationSub) locationSub.textContent = source === 'map-click'
    ? `${center.lon.toFixed(5)}° E, ${center.lat.toFixed(5)}° N`
    : (PLACE_COORDINATES[center.id]?.district || PLACE_COORDINATES[label]?.district || (source === 'geolocation' ? '浏览器提供的位置' : '搜索结果'));
  if (coordinateText) coordinateText.textContent = `${center.lat.toFixed(4)}° N, ${center.lon.toFixed(4)}° E`;
  if (source === 'map-click' && toolbarLocationButton) setLocationToolbarButton(label, '当前地图');
}

analysisStore?.subscribe((state) => {
  document.documentElement.dataset.analysisStatus = state.data.status;
  document.documentElement.dataset.analysisProfile = state.data.parameterDraft?.profile || '';
  document.documentElement.dataset.analysisRanges = (state.data.parameterDraft?.rangesMinutes || []).join(',');
  document.documentElement.dataset.submittedProfile = state.data.lastSubmittedRequest?.profile || '';
  document.documentElement.dataset.submittedRanges = (state.data.lastSubmittedRequest?.rangesMinutes || []).join(',');
  if (analysisStatusCopy) {
    const metadata = state.data.lastSuccessfulResult?.metadata;
    const staleResult = state.data.lastSuccessfulResult && !successfulResultMatchesDraft(state);
    const status = state.data.status === 'loading' ? '正在请求 ORS 等时圈…'
      : state.data.status === 'error' ? `请求失败：${state.data.error?.message || '请检查参数或服务状态'}`
        : staleResult ? '参数已变更 · 请先生成新的 ORS 等时圈'
        : metadata?.poiCoverage?.mode === 'preview-radius' ? `POI 预览：${metadata.poiCoverage.radiusMeters} m · 未代表完整覆盖`
          : metadata?.isLive ? `ORS 实时等时圈 · ${metadata.cacheHit ? '缓存命中' : '已请求上游'} · 可单独加载 POI 预览`
            : '快速等时圈默认不请求 POI · 可单独加载预览';
    analysisStatusCopy.textContent = status;
    if (poiPreviewButton) poiPreviewButton.disabled = state.data.status === 'loading' || Boolean(staleResult);
  }
  updateResultCard(state.data.lastSuccessfulResult);
  renderDraftCenter(state.data.parameterDraft?.center, state.data.parameterDraft?.centerSource);
  const interaction = state.interaction || {};
  if (state.data.lastSuccessfulResult?.metadata?.apiQuota) {
    renderQuota(state.data.lastSuccessfulResult.metadata.apiQuota, state.data.lastSuccessfulResult.metadata.cacheHit ? 'cache' : '');
  }
  if (nameCloudButton) nameCloudButton.disabled = !canGenerateNameCloud(state) || nameCloudButton.classList.contains('is-loading');
  updateNameCloudStats(state.data.lastSuccessfulResult);
  updateNameCloudPresentation(state.data.lastSuccessfulResult);
  applyPanmapActiveRing(interaction.activeRingId || null);
  applyPanmapPoiState(interaction);
  traditionalMapAdapter?.setActiveRingId(interaction.activeRingId || null);
  traditionalMapAdapter?.setHoveredRingId(interaction.hoveredRingId || null);
  traditionalMapAdapter?.setSelectedPoiId(interaction.selectedPoiId || null);
  traditionalMapAdapter?.setHoveredPoiId(interaction.hoveredPoiId || null);
  traditionalMapAdapter?.setVisibleTopLevelCategoryIds(interaction.visibleTopLevelCategoryIds);
  traditionalMapAdapter?.setBasemapId(interaction.activeBasemapId || 'osm-standard');
  traditionalMapAdapter?.setMapPickMode(Boolean(interaction.isMapPickMode));
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
    window.rebuildPanmapLayout?.({
      layers,
      centerLabel: state.data.lastSuccessfulResult.center?.label,
    });
  }
});

function applyPanmapViewBox() {
  panmapArt.setAttribute('viewBox', `${panmapViewBox.x} ${panmapViewBox.y} ${panmapViewBox.width} ${panmapViewBox.height}`);
  panmapArt.dataset.zoom = (defaultPanmapViewBox.width / panmapViewBox.width).toFixed(2);
}

function zoomPanmap(factor, clientX, clientY) {
  const rect = panmapArt.getBoundingClientRect();
  const cursorX = Number.isFinite(clientX) ? clientX : rect.left + rect.width / 2;
  const cursorY = Number.isFinite(clientY) ? clientY : rect.top + rect.height / 2;
  const ratioX = Math.max(0, Math.min(1, (cursorX - rect.left) / rect.width));
  const ratioY = Math.max(0, Math.min(1, (cursorY - rect.top) / rect.height));
  const nextWidth = Math.max(620, Math.min(2600, panmapViewBox.width * factor));
  const nextHeight = nextWidth * defaultPanmapViewBox.height / defaultPanmapViewBox.width;
  panmapViewBox.x += (panmapViewBox.width - nextWidth) * ratioX;
  panmapViewBox.y += (panmapViewBox.height - nextHeight) * ratioY;
  panmapViewBox.width = nextWidth;
  panmapViewBox.height = nextHeight;
  applyPanmapViewBox();
}

function resetPanmapView() {
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

function setPanmapMode(active) {
  const result = analysisStore?.getState().data.lastSuccessfulResult;
  const nameCloudMode = isNameCloudResult(result);
  appShell.classList.toggle('is-panmap', active);
  if (!active) {
    setPanmapInteractionMode('select', false);
    mapPanel.classList.remove('is-split');
    closeLocationSuggest();
    analysisStore?.setMapPickMode(false);
    mapSurface.classList.remove('is-picking');
    appShell.classList.remove('is-map-picking');
  }
  document.querySelector('.eyebrow').innerHTML = active
    ? '<span class="eyebrow-dot"></span>周边探索 / 泛地图探索'
    : '<span class="eyebrow-dot"></span>周边探索 / 可达域生成';
  document.querySelector('.page-heading h1').textContent = active ? '泛地图探索' : '可达域生成';
  document.querySelector('.page-heading p').textContent = active
    ? nameCloudMode
      ? '按步行时间圈层直接摆放真实 POI 名称，不按类别聚合'
      : '在等时圈层内组织周边 POI 标签云与类别分布'
    : '构建基于时间或距离的可达域，并获取多类型 POI 覆盖数据';
  updateNameCloudPresentation(result);
  document.title = active ? 'IsoTagMap · 泛地图探索' : 'IsoTagMap · 等时圈层标签云泛地图';
  window.setTimeout(() => traditionalMapAdapter?.resize(), 80);
}

railToggle.addEventListener('click', () => {
  const collapsed = !sideRail.classList.contains('is-collapsed');
  setRailCollapsed(collapsed);
  showToast(collapsed ? '导航栏已收起，悬浮到左侧可展开' : '导航栏已展开');
});

document.getElementById('enterPanmap').addEventListener('click', () => {
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

overviewToggle.addEventListener('click', (event) => {
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
    overviewHeading.textContent = `当前概览（${activeLayer}分钟）`;
    overviewPoiTotal.textContent = stats.poi;
    overviewArea.textContent = stats.area;
    document.querySelectorAll('.density-overview .category-stat > div b').forEach((value, index) => {
      value.textContent = stats.categories[index] || '0';
    });
  }
  analysisStore?.setActiveRingId(ringIdForOuterRange(activeLayer));
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
  const layers = ['10', '20', '30'];
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
    options: { ...draft.options, includePois: false },
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
  generateButton?.classList.toggle('is-loading', isLoading);
  generateButton?.setAttribute('aria-busy', String(isLoading));
  if (generateButton) generateButton.disabled = isLoading;
  if (generateButtonLabel) generateButtonLabel.textContent = isLoading ? '正在生成等时圈…' : '生成可达域';
  toolbarGenerate?.classList.toggle('is-loading', isLoading);
  toolbarGenerate?.setAttribute('aria-busy', String(isLoading));
  document.getElementById('appShell')?.toggleAttribute('data-analysis-loading', isLoading);
  if (analysisStatusCopy && isLoading) analysisStatusCopy.textContent = '正在请求 ORS 等时圈…';
}

function applyAnalysisResultToPanmap(result) {
  updateTimeLayerStatsFromResult(result);
  const interaction = analysisStore?.getState().interaction || {};
  const layers = window.PanmapApp.panmapLayoutAdapter.buildPanmapLayers(result, {
    categoryFocusPath: interaction.categoryFocusPath || interaction.categoryPath || [],
    visibleTopLevelCategoryIds: interaction.visibleTopLevelCategoryIds,
  });
  const layout = window.rebuildPanmapLayout?.({ layers, centerLabel: result.center?.label });
  if (!layout) throw new Error('模拟分析结果无法转换为泛地图布局。');
  updateNameCloudStats(result, layout);
  const activeRange = toolbarTimeButton.dataset.activeTime;
  const nextRange = result.rangesMinutes.includes(Number(activeRange)) ? activeRange : String(result.rangesMinutes[result.rangesMinutes.length - 1]);
  setActiveTimeLayer(nextRange, false);
  traditionalMapAdapter?.setAnalysisResult(result);
  return layout;
}

function setMapStatus(message) {
  if (traditionalMapStatus) traditionalMapStatus.textContent = message || '';
}

function updateDraftCenterFromMap(point) {
  const center = {
    lon: Number(point.lon.toFixed(5)),
    lat: Number(point.lat.toFixed(5)),
    crs: 'EPSG:4326',
    label: `地图选点（${point.lon.toFixed(5)}, ${point.lat.toFixed(5)}）`,
    source: 'map-click',
    id: `map-click:${point.lon.toFixed(5)}:${point.lat.toFixed(5)}`,
    accuracyMeters: null,
  };
  analysisStore?.setDraftCenter(center, 'map-click');
  analysisStore?.setMapPickMode(false);
  mapSurface.classList.remove('is-picking');
  appShell.classList.remove('is-map-picking');
  setLocationToolbarButton(center.label, '当前地图');
  traditionalMapAdapter?.setDraftCenter(center);
  showToast(`已选中心点 ${center.label}`);
}

function startMapPickMode() {
  if (analysisStore?.getState().interaction.isMapPickMode) {
    analysisStore.setMapPickMode(false);
    mapSurface.classList.remove('is-picking');
    appShell.classList.remove('is-map-picking');
    traditionalMapAdapter?.setMapPickMode(false);
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
      if (ring) setActiveTimeLayer(String(ring.outerRangeMinutes), false);
    },
    onRingHover: (ringId) => analysisStore?.setHoveredRingId(ringId),
    onPoiClick: (poiId) => analysisStore?.setSelectedPoiId(poiId),
    onPoiHover: (poiId) => analysisStore?.setHoveredPoiId(poiId),
    onMapPointSelected: updateDraftCenterFromMap,
    onMapStatus: setMapStatus,
  });
  const state = analysisStore?.getState();
  if (state?.data.lastSuccessfulResult) traditionalMapAdapter.setAnalysisResult(state.data.lastSuccessfulResult);
  if (state?.data.parameterDraft?.center) traditionalMapAdapter.setDraftCenter(state.data.parameterDraft.center);
  traditionalMapAdapter.setMapPickMode(Boolean(state?.interaction?.isMapPickMode));
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
  nameCloudButton?.classList.toggle('is-loading', isLoading);
  nameCloudButton?.setAttribute('aria-busy', String(isLoading));
  if (nameCloudButtonLabel) nameCloudButtonLabel.textContent = isLoading ? '正在生成名称云…' : '生成步行名称云';
  if (nameCloudButton) nameCloudButton.disabled = isLoading || !canGenerateNameCloud(analysisStore?.getState());
  if (analysisStatusCopy && isLoading) analysisStatusCopy.textContent = '正在检查 30 分钟步行外圈范围…';
}

async function runNameCloud() {
  const state = analysisStore?.getState();
  if (!canGenerateNameCloud(state)) {
    showToast('名称云需要先生成黄鹤楼步行 10/20/30 分钟真实等时圈');
    return;
  }
  const result = state.data.lastSuccessfulResult;
  const draft = state.data.parameterDraft;
  setNameCloudLoadingState(true);
  try {
    if (analysisStatusCopy) analysisStatusCopy.textContent = '正在请求最外层步行 Polygon 内的真实 POI…';
    const nameCloud = await window.PanmapApp.analysisClient.createNameCloud({
      center: draft.center,
      profile: draft.profile,
      rangesMinutes: draft.rangesMinutes,
      categoryIds: draft.categoryIds,
      cumulativeIsochrones: result.cumulativeIsochrones,
    });
    analysisStore?.setResult(nameCloud);
    const layout = applyAnalysisResultToPanmap(nameCloud);
    updateNameCloudStats(nameCloud, layout);
    renderQuota(nameCloud.metadata?.apiQuota, nameCloud.metadata?.cacheHit ? 'cache' : '');
    showToast(nameCloud.metadata?.cacheHit ? '名称云已命中缓存，未消耗上游请求' : '步行名称标签云已生成');
  } catch (error) {
    showToast(`名称云失败：${error.message || '服务不可用'}（已保留当前等时圈）`);
    if (analysisStatusCopy) analysisStatusCopy.textContent = '名称云请求失败 · 已保留当前真实等时圈';
  } finally {
    setNameCloudLoadingState(false);
  }
}

async function runAnalysis() {
  if (analysisAbortController) analysisAbortController.abort();
  const controller = new AbortController();
  analysisAbortController = controller;
  let request;
  try {
    request = buildAnalysisRequestFromUI();
  } catch (error) {
    const normalizedError = { code: 'VALIDATION_ERROR', message: error.message, details: [] };
    analysisStore?.setError(normalizedError);
    showToast(error.message);
    return;
  }
  analysisStore?.setRequest(request);
  analysisStore?.setLoading();
  setAnalysisLoadingState(true);
  try {
    const result = await window.PanmapApp.analysisClient.createAnalysis(request, { signal: controller.signal });
    analysisStore?.setResult(result);
    applyAnalysisResultToPanmap(result);
    showToast(analysisSuccessMessage(result));
  } catch (error) {
    if (error.name === 'AbortError') return;
    const normalizedError = {
      code: error.code || 'INTERNAL_ERROR',
      message: error.message || '分析请求失败。',
      details: error.details || [],
      requestId: error.requestId || null,
      status: error.status || null,
    };
    analysisStore?.setError(normalizedError);
    showToast(`分析失败：${normalizedError.message}（已保留当前泛地图）`);
  } finally {
    if (analysisAbortController === controller) {
      analysisAbortController = null;
      setAnalysisLoadingState(false);
    }
  }
}

async function loadPoiPreview() {
  if (!window.PanmapApp?.analysisClient?.createPoiPreview) return;
  if (poiPreviewButton?.classList.contains('is-loading')) return;
  let result = analysisStore?.getState().data.lastSuccessfulResult;
  const currentState = analysisStore?.getState();
  if (result && !successfulResultMatchesDraft(currentState)) {
    showToast('当前参数已变更，请先生成新的 ORS 等时圈');
    return;
  }
  if (!result) {
    showToast('请先生成有效的 ORS 等时圈');
    return;
  }
  const draft = analysisStore?.getState().data.parameterDraft;
  const radiusMeters = Number(poiPreviewRadius?.value || 1000);
  if (![500, 1000, 2000].includes(radiusMeters)) {
    showToast('POI 预览半径只支持 500、1000 或 2000 米');
    return;
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
    applyAnalysisResultToPanmap(merged);
    showToast(`附近 POI 预览已加载：${preview.returnedCount ?? preview.pois.length} 个点`);
  } catch (error) {
    showToast(`POI 预览失败：${error.message || '服务不可用'}`);
  } finally {
    poiPreviewButton?.classList.remove('is-loading');
    poiPreviewButton?.setAttribute('aria-busy', 'false');
    if (poiPreviewLabel) poiPreviewLabel.textContent = '加载附近 POI 预览';
    if (poiPreviewButton) poiPreviewButton.disabled = false;
    const latestState = analysisStore?.getState();
    if (latestState?.data?.lastSuccessfulResult && !successfulResultMatchesDraft(latestState)) poiPreviewButton.disabled = true;
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
    const flowMessages = {
      poi: '附近 POI 预览只发起一次半径查询',
      cluster: '下一阶段：按类别聚簇生成标签云',
      panmap: '下一阶段：生成等时圈层标签云泛地图',
    };
    if (button.dataset.flow === 'panmap') setPanmapMode(true);
    if (button.dataset.flow === 'poi') loadPoiPreview();
    else showToast(flowMessages[button.dataset.flow]);
  });
});

document.querySelectorAll('.mode-chip').forEach((button) => {
  button.addEventListener('click', () => {
    document.querySelectorAll('.mode-chip').forEach((item) => item.classList.remove('is-selected'));
    button.classList.add('is-selected');
    document.querySelectorAll('.toolbar-menu-option').forEach((option) => {
      option.classList.toggle('is-selected', MODE_BY_LABEL[option.dataset.transport] === button.dataset.mode);
    });
    const toolbarMode = Object.entries(MODE_BY_LABEL).find(([, mode]) => mode === button.dataset.mode)?.[0];
    if (toolbarMode) {
      transportToolbarButton.innerHTML = `<span class="toolbar-select-copy"><small>交通方式选择</small><strong>${toolbarMode}</strong></span><span class="toolbar-chevron">⌄</span>`;
    }
    analysisStore?.setParameterDraft({ profile: PROFILE_BY_MODE[button.dataset.mode] || null });
    showToast(`交通方式已切换为${button.textContent.trim()}`);
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

document.getElementById('generateButton').addEventListener('click', runAnalysis);

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
nameCloudButton?.addEventListener('click', runNameCloud);
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
  const center = {
    lon: Number(item.lon),
    lat: Number(item.lat),
    crs: 'EPSG:4326',
    label: String(item.label || `${item.lon}, ${item.lat}`),
    id: String(item.id || `${source}:${item.lon}:${item.lat}`),
    source,
    accuracyMeters: item.accuracyMeters == null ? null : Number(item.accuracyMeters),
  };
  analysisStore?.setDraftCenter(center, source);
  traditionalMapAdapter?.setDraftCenter(center);
  setLocationToolbarButton(center.label, item.admin?.join(' · ') || '搜索结果');
  if (centerSearchInput) centerSearchInput.value = '';
  closeLocationSuggest();
  showToast(`中心点已切换为${center.label}`);
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
  setLocationToolbarButton(place, location.district);
  analysisStore?.setDraftCenter({
    lon: location.lon,
    lat: location.lat,
    crs: 'EPSG:4326',
    label: place,
    presetId: location.id,
    id: location.id,
    source: 'preset',
    accuracyMeters: null,
  }, 'preset');
  traditionalMapAdapter?.setDraftCenter({ lon: location.lon, lat: location.lat, label: place });
  closeLocationSuggest();
  showToast(`中心点已切换为${place}`);
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
  showToast('正在请求浏览器当前位置…');
  navigator.geolocation.getCurrentPosition(async (position) => {
    const { longitude, latitude, accuracy } = position.coords || {};
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
      showToast('浏览器返回了无效坐标');
      return;
    }
    const center = { lon: Number(longitude.toFixed(5)), lat: Number(latitude.toFixed(5)), crs: 'EPSG:4326', label: '当前位置', id: 'browser-geolocation', source: 'geolocation', accuracyMeters: Number.isFinite(accuracy) ? accuracy : null };
    analysisStore?.setDraftCenter(center, 'geolocation');
    traditionalMapAdapter?.setDraftCenter(center);
    setLocationToolbarButton('当前位置', '浏览器定位');
    try {
      const payload = await window.PanmapApp.analysisClient.reverseGeocode(center.lon, center.lat);
      const result = payload.results?.[0];
      if (result?.label) setDraftCenterFromSearch({ ...result, accuracyMeters: center.accuracyMeters }, 'geolocation');
    } catch (error) {
      // Reverse geocoding is enrichment only; the valid browser position remains usable.
    }
    showToast('当前位置已设为待分析中心点');
  }, (error) => {
    const messages = { 1: '定位权限被拒绝', 2: '当前位置暂不可用', 3: '定位请求超时' };
    showToast(messages[error.code] || '无法获取当前位置');
  }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 0 });
}

useCurrentLocationButton?.addEventListener('click', useBrowserLocation);

document.querySelectorAll('.mini-action').forEach((button) => {
  if (!button.textContent.includes('地图选点')) return;
  button.addEventListener('click', () => {
    closeLocationSuggest();
    startMapPickMode();
  });
});

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || !analysisStore?.getState().interaction.isMapPickMode) return;
  analysisStore.setMapPickMode(false);
  mapSurface.classList.remove('is-picking');
  appShell.classList.remove('is-map-picking');
  traditionalMapAdapter?.setMapPickMode(false);
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
  option.addEventListener('click', () => {
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
    analysisStore?.setParameterDraft({ profile: PROFILE_BY_MODE[selectedMode] || null });
    closeToolbarMenus();
    showToast(`交通方式已切换为${option.dataset.transport}`);
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
const thresholdPalette = ['#9B6BD8', '#E86778', '#35AFA5', '#F2A033'];

function sortThresholdRows() {
  [...thresholdList.children]
    .sort((left, right) => Number(left.dataset.threshold) - Number(right.dataset.threshold))
    .forEach((row) => thresholdList.appendChild(row));
}

function bindThresholdRow(row) {
  const thresholdInput = row.querySelector('.time-input input');
  const thresholdLabel = row.querySelector('strong');
  const visibilityButton = row.querySelector('.threshold-visibility');
  const deleteButton = row.querySelector('.threshold-delete');

  function syncThresholdLabel() {
    const value = Math.max(1, Math.min(60, Number(thresholdInput.value) || 1));
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
  row.querySelectorAll('[data-step]').forEach((stepButton) => {
    stepButton.addEventListener('click', () => {
      const delta = stepButton.dataset.step === 'up' ? 5 : -5;
      thresholdInput.value = Math.max(1, Math.min(60, Number(thresholdInput.value) + delta));
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
    syncParameterDraftFromUI();
    showToast('时间阈值已删除');
  });
  syncThresholdLabel();
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
  const value = Math.max(1, Math.min(60, Number(newThresholdInput.value) || 45));
  if ([...thresholdList.querySelectorAll('.time-input input')].some((input) => Number(input.value) === value)) {
    showToast(`${value} 分钟阈值已存在`);
    return;
  }
  const color = thresholdPalette[thresholdList.children.length % thresholdPalette.length];
  const row = document.createElement('div');
  row.className = 'threshold-item';
  row.dataset.threshold = String(value);
  row.dataset.color = color;
  row.style.setProperty('--threshold-color', color);
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

loadPoiDatasets();

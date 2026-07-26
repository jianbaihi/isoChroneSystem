const appShell = document.getElementById('appShell');
const sideRail = document.querySelector('.side-rail');
const railToggle = document.getElementById('railToggle');
const mapPanel = document.getElementById('mapPanel');
const mapSurface = document.getElementById('mapSurface');
const toast = document.getElementById('toast');
const locationSuggestPanel = document.getElementById('locationSuggestPanel');
const toolbarLocationButton = document.getElementById('toolbarLocationButton');
const locationSearch = document.getElementById('locationSearch');
const splitToggle = document.getElementById('toggleSplit');
const overviewCard = document.querySelector('.panmap-overview');
const overviewToggle = document.getElementById('overviewToggle');
const panmapArt = document.querySelector('.panmap-art');
const toolbarTimeButton = document.getElementById('toolbarTimeButton');
const overviewHeading = document.getElementById('overviewHeading');
const overviewPoiTotal = document.getElementById('overviewPoiTotal');
const overviewArea = document.getElementById('overviewArea');
let toastTimer;
let isPickingMapLocation = false;
let isDraggingSplitter = false;
let isPanningPanmap = false;
let didPanPanmap = false;
let panPointerStart = null;
let panmapInteractionMode = 'select';
const defaultPanmapViewBox = { x: 0, y: 0, width: 1850, height: 980 };
let panmapViewBox = { ...defaultPanmapViewBox };

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
  document.querySelectorAll('.category-cluster.is-hovered').forEach((cluster) => cluster.classList.remove('is-hovered'));
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
}

function setLocationToolbarButton(place, district = '北京市朝阳区') {
  toolbarLocationButton.innerHTML = `<span class="toolbar-select-copy"><small>中心点选择</small><strong>${place}，${district}</strong></span><span class="toolbar-chevron">⌄</span>`;
}

function updateSplitToggle(isSplit) {
  splitToggle.innerHTML = isSplit ? '传统地图小窗显示 <span>↙</span>' : '传统地图并列显示 <span>↗</span>';
  splitToggle.setAttribute('aria-label', isSplit ? '切换为传统地图小窗显示' : '切换为传统地图并列显示');
}

function setPanmapMode(active) {
  appShell.classList.toggle('is-panmap', active);
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
    ? '在等时圈层内组织周边 POI 标签云与类别分布'
    : '构建基于时间或距离的可达域，并获取多类型 POI 覆盖数据';
  document.title = active ? 'IsoTagMap · 泛地图探索' : 'IsoTagMap · 等时圈层标签云泛地图';
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
  showToast(isSplit ? '传统地图已展开为左右并列视图，可拖拽中间分隔线调整比例' : '传统地图已恢复为小窗');
}

document.getElementById('splitMap').addEventListener('click', toggleSplitMap);
document.getElementById('toggleSplit').addEventListener('click', toggleSplitMap);
document.getElementById('restoreMap').addEventListener('click', () => {
  mapPanel.classList.remove('is-split');
  updateSplitToggle(false);
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

function setActiveTimeLayer(layer, announce = true) {
  const activeLayer = String(layer);
  panmapArt.classList.remove('focus-layer-10', 'focus-layer-20', 'focus-layer-30');
  panmapArt.classList.add(`focus-layer-${activeLayer}`);
  toolbarTimeButton.dataset.activeTime = activeLayer;
  toolbarTimeButton.querySelectorAll('[data-time-option]').forEach((option) => {
    option.classList.toggle('is-active', option.dataset.timeOption === activeLayer);
  });
  overviewHeading.textContent = `当前概览（${activeLayer}分钟）`;
  overviewPoiTotal.textContent = timeLayerStats[activeLayer].poi;
  overviewArea.textContent = timeLayerStats[activeLayer].area;
  document.querySelectorAll('.density-overview .category-stat > div b').forEach((value, index) => {
    value.textContent = timeLayerStats[activeLayer].categories[index];
  });
  if (announce) showToast(`${activeLayer} 分钟圈层已聚焦，其他圈层已按层级联动`);
}

panmapArt.addEventListener('click', (event) => {
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

document.querySelectorAll('.category-cluster').forEach((cluster) => {
  const layer = cluster.closest('.organic-time-layer');
  cluster.addEventListener('mouseenter', () => {
    panmapArt.classList.add('is-category-hover');
    cluster.classList.add('is-hovered');
    layer.classList.add('is-hovered-layer');
  });
  cluster.addEventListener('mouseleave', () => {
    panmapArt.classList.remove('is-category-hover');
    cluster.classList.remove('is-hovered');
    layer.classList.remove('is-hovered-layer');
  });
});

document.querySelectorAll('[data-panmap-tool]').forEach((button) => {
  button.addEventListener('click', () => {
    setPanmapInteractionMode(button.dataset.panmapTool);
  });
});

setPanmapInteractionMode('select', false);

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
      poi: '下一阶段：获取周边 POI 数据',
      cluster: '下一阶段：按类别聚簇生成标签云',
      panmap: '下一阶段：生成等时圈层标签云泛地图',
    };
    if (button.dataset.flow === 'panmap') setPanmapMode(true);
    showToast(flowMessages[button.dataset.flow]);
  });
});

document.querySelectorAll('.mode-chip').forEach((button) => {
  button.addEventListener('click', () => {
    document.querySelectorAll('.mode-chip').forEach((item) => item.classList.remove('is-selected'));
    button.classList.add('is-selected');
    showToast(`交通方式已切换为${button.textContent.trim()}`);
  });
});

document.querySelectorAll('.poi-chip').forEach((button) => {
  button.addEventListener('click', () => button.classList.toggle('is-checked'));
});

document.querySelector('.link-button').addEventListener('click', (event) => {
  const buttons = document.querySelectorAll('.poi-chip');
  const allChecked = [...buttons].every((button) => button.classList.contains('is-checked'));
  buttons.forEach((button) => button.classList.toggle('is-checked', !allChecked));
  event.currentTarget.textContent = allChecked ? '全选' : '取消全选';
});

document.getElementById('generateButton').addEventListener('click', () => {
  showToast('可达域已更新：10 / 20 / 30 分钟圈层');
});

const toolbarGenerate = document.getElementById('toolbarGenerate');
const toolbarGenerateLabel = toolbarGenerate.querySelector('.toolbar-generate-label');
const toolbarGenerateArrow = toolbarGenerate.querySelector('.toolbar-generate-arrow');
toolbarGenerate.addEventListener('click', () => {
  if (toolbarGenerate.classList.contains('is-loading')) return;
  toolbarGenerate.classList.add('is-loading');
  toolbarGenerateLabel.textContent = '正在重新生成';
  toolbarGenerateArrow.textContent = '';
  window.setTimeout(() => {
    const layout = window.rebuildPanmapLayout?.();
    toolbarGenerate.classList.remove('is-loading');
    toolbarGenerateLabel.textContent = '重新生成可达域';
    toolbarGenerateArrow.textContent = '→';
    showToast(layout ? '力导向排布与 KDE 等值线已重新生成' : '泛地图图层已重新生成');
  }, 900);
});

document.getElementById('poiExploreButton').addEventListener('click', () => {
  showToast('正在加载周边 POIs 标签云');
});

document.querySelectorAll('[data-map-action]').forEach((button) => {
  button.addEventListener('click', () => {
    const action = button.dataset.mapAction;
    if (appShell.classList.contains('is-panmap')) {
      if (action === 'zoom-in') zoomPanmap(0.82);
      if (action === 'zoom-out') zoomPanmap(1.2);
      if (action === 'locate') resetPanmapView();
    }
    const messages = { 'zoom-in': '地图已放大', 'zoom-out': '地图已缩小', locate: '已定位到望京广场' };
    showToast(messages[action]);
  });
});

toolbarLocationButton.addEventListener('click', (event) => {
  event.stopPropagation();
  const isOpen = locationSuggestPanel.classList.toggle('is-open');
  toolbarLocationButton.setAttribute('aria-expanded', String(isOpen));
  if (isOpen) {
    locationSearch.value = '';
    document.querySelectorAll('.suggest-option').forEach((option) => { option.hidden = false; });
    window.setTimeout(() => locationSearch.focus(), 0);
  }
});

locationSuggestPanel.addEventListener('click', (event) => event.stopPropagation());
document.addEventListener('click', closeLocationSuggest);

locationSearch.addEventListener('input', () => {
  const keyword = locationSearch.value.trim().toLowerCase();
  document.querySelectorAll('.suggest-option').forEach((option) => {
    option.hidden = keyword && !option.textContent.toLowerCase().includes(keyword);
  });
});

document.querySelectorAll('.suggest-option').forEach((option) => {
  option.addEventListener('click', () => {
    const place = option.dataset.place;
    setLocationToolbarButton(place);
    closeLocationSuggest();
    showToast(`中心点已切换为${place}`);
  });
});

document.getElementById('toolbarMapPick').addEventListener('click', () => {
  closeLocationSuggest();
  setPanmapInteractionMode('select', false);
  isPickingMapLocation = true;
  mapSurface.classList.add('is-picking');
  showToast('请在泛地图上点击位置设为中心点');
});

mapSurface.addEventListener('click', (event) => {
  if (didPanPanmap) {
    didPanPanmap = false;
    return;
  }
  if (!isPickingMapLocation || event.target.closest('.map-controls, .map-legend, .panmap-toolbar, .mini-traditional, .map-splitter, .panmap-tool-rail, .organic-layer-chip, .category-cluster')) return;
  isPickingMapLocation = false;
  mapSurface.classList.remove('is-picking');
  setLocationToolbarButton('地图选点', '当前视图');
  showToast('已通过地图选点设置中心点');
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
});

document.getElementById('helpButton').addEventListener('click', () => {
  showToast('先选中心点、交通方式和时间阈值，再生成等时圈层');
});

document.querySelector('.clear-input').addEventListener('click', () => showToast('中心点输入已清除'));
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
    document.querySelectorAll('.toolbar-menu-option').forEach((item) => item.classList.remove('is-selected'));
    option.classList.add('is-selected');
    transportToolbarButton.innerHTML = `<span class="toolbar-select-copy"><small>交通方式选择</small><strong>${option.dataset.transport}</strong></span><span class="toolbar-chevron">⌄</span>`;
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
}
poiMenuChecks.forEach((input) => input.addEventListener('change', updatePoiToolbarLabel));
toolbarMenuSelectAll.addEventListener('click', () => {
  const allChecked = poiMenuChecks.every((input) => input.checked);
  poiMenuChecks.forEach((input) => { input.checked = !allChecked; });
  updatePoiToolbarLabel();
});

const thresholdList = document.getElementById('thresholdList');
const thresholdPalette = ['#9B6BD8', '#E86778', '#35AFA5', '#F2A033'];

function bindThresholdRow(row) {
  const thresholdInput = row.querySelector('.time-input input');
  const thresholdLabel = row.querySelector('strong');
  const visibilityButton = row.querySelector('.threshold-visibility');
  const deleteButton = row.querySelector('.threshold-delete');

  function syncThresholdLabel() {
    const value = Math.max(1, Math.min(180, Number(thresholdInput.value) || 1));
    thresholdInput.value = value;
    thresholdLabel.textContent = `${value} 分钟`;
    row.dataset.threshold = String(value);
    thresholdInput.setAttribute('aria-label', `${value} 分钟阈值`);
    visibilityButton.setAttribute('aria-label', `${visibilityButton.classList.contains('is-visible') ? '隐藏' : '显示'} ${value} 分钟圈层`);
    deleteButton.setAttribute('aria-label', `删除 ${value} 分钟阈值`);
  }

  thresholdInput.addEventListener('input', syncThresholdLabel);
  row.querySelectorAll('[data-step]').forEach((stepButton) => {
    stepButton.addEventListener('click', () => {
      const delta = stepButton.dataset.step === 'up' ? 5 : -5;
      thresholdInput.value = Math.max(1, Math.min(180, Number(thresholdInput.value) + delta));
      syncThresholdLabel();
    });
  });
  row.querySelector('.threshold-select input').addEventListener('change', (event) => {
    row.classList.toggle('is-unselected', !event.target.checked);
  });
  visibilityButton.addEventListener('click', () => {
    const visible = visibilityButton.classList.toggle('is-visible');
    row.classList.toggle('is-hidden', !visible);
    visibilityButton.textContent = visible ? '◉' : '◌';
    syncThresholdLabel();
    showToast(`${row.dataset.threshold} 分钟圈层已${visible ? '显示' : '隐藏'}`);
  });
  deleteButton.addEventListener('click', () => {
    if (thresholdList.children.length <= 1) {
      showToast('至少保留一个时间阈值');
      return;
    }
    row.remove();
    showToast('时间阈值已删除');
  });
  syncThresholdLabel();
}

document.querySelectorAll('.threshold-item').forEach(bindThresholdRow);

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
  const value = Math.max(1, Math.min(180, Number(newThresholdInput.value) || 45));
  const color = thresholdPalette[thresholdList.children.length % thresholdPalette.length];
  const row = document.createElement('div');
  row.className = 'threshold-item';
  row.dataset.threshold = String(value);
  row.dataset.color = color;
  row.style.setProperty('--threshold-color', color);
  row.innerHTML = `<label class="threshold-select"><input type="checkbox" checked /><span class="custom-checkbox">✓</span></label><span class="threshold-color"></span><strong>${value} 分钟</strong><div class="time-input"><input type="number" value="${value}" min="1" max="180" aria-label="${value} 分钟阈值" /><em>分钟</em></div><span class="stepper"><button type="button" data-step="down">−</button><button type="button" data-step="up">＋</button></span><button type="button" class="threshold-visibility is-visible" aria-label="隐藏 ${value} 分钟圈层">◉</button><button type="button" class="threshold-delete" aria-label="删除 ${value} 分钟阈值">×</button>`;
  thresholdList.appendChild(row);
  bindThresholdRow(row);
  thresholdAddPopover.classList.remove('is-open');
  showToast(`${value} 分钟阈值已添加`);
});

document.querySelectorAll('[data-mini-map-action]').forEach((button) => {
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    showToast(button.dataset.miniMapAction === 'locate' ? '传统地图已定位到望京广场' : '传统地图视窗已调整');
  });
});

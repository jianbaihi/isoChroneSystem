(function initTraditionalMapAdapter(global) {
  const app = global.PanmapApp = global.PanmapApp || {};
  const RING_SOURCE_ID = 'analysis-rings';
  const CENTER_SOURCE_ID = 'analysis-center';
  const DRAFT_CENTER_SOURCE_ID = 'analysis-draft-center';
  const RING_FILL_LAYER_ID = 'analysis-rings-fill';
  const RING_OUTLINE_LAYER_ID = 'analysis-rings-outline';
  const RING_ACTIVE_LAYER_ID = 'analysis-rings-active-outline';
  const RING_HOVER_LAYER_ID = 'analysis-rings-hover-outline';
  const CENTER_HALO_LAYER_ID = 'analysis-center-halo';
  const CENTER_POINT_LAYER_ID = 'analysis-center-point';
  const DRAFT_CENTER_HALO_LAYER_ID = 'analysis-draft-center-halo';
  const DRAFT_CENTER_POINT_LAYER_ID = 'analysis-draft-center-point';
  const POI_SOURCE_ID = 'analysis-pois';
  const POI_LAYER_ID = 'analysis-pois-circle';
  const POI_HOVER_LAYER_ID = 'analysis-pois-hover';
  const POI_SELECTED_LAYER_ID = 'analysis-pois-selected';
  const POI_LABEL_LAYER_ID = 'analysis-pois-label';
  const OSM_LAYER_ID = 'osm-standard-raster';
  const TIANDITU_BASE_LAYER_ID = 'tianditu-vector-base';
  const TIANDITU_LABEL_LAYER_ID = 'tianditu-vector-label';
  const RING_TOKENS = app.ringTokens || {};
  const ISOCHRONE_PALETTE = app.isochronePalette || null;
  const POI_RENDER_BATCH_SIZE = 100;

  const EMPTY_COLLECTION = { type: 'FeatureCollection', features: [] };

  function ringColorExpression(ranges = [10, 20, 30], colorKey = 'stroke') {
    if (ISOCHRONE_PALETTE?.maplibreMatchExpression) {
      return ISOCHRONE_PALETTE.maplibreMatchExpression(ranges, 'outerRangeMinutes', colorKey);
    }
    return ['match', ['to-number', ['get', 'outerRangeMinutes']],
      10, RING_TOKENS['ring-0-10']?.color || '#1e9152',
      20, RING_TOKENS['ring-10-20']?.color || '#2670e1',
      30, RING_TOKENS['ring-20-30']?.color || '#8b57be',
      RING_TOKENS['ring-20-30']?.color || '#8b57be'];
  }

  function createStyle(config) {
    const osm = config.basemaps?.['osm-standard'] || config;
    const tianditu = config.basemaps?.['tianditu-vector'];
    const sources = {
      [osm.providerId]: {
        type: 'raster', tiles: [osm.tileUrl], tileSize: osm.tileSize,
        minzoom: osm.minZoom, maxzoom: osm.maxZoom, attribution: osm.attribution,
      },
    };
    const layers = [{ id: OSM_LAYER_ID, type: 'raster', source: osm.providerId, layout: { visibility: 'visible' }, paint: { 'raster-opacity': 1 } }];
    if (tianditu?.baseUrl && tianditu?.labelUrl) {
      sources['tianditu-vector-base-source'] = { type: 'raster', tiles: [tianditu.baseUrl], tileSize: tianditu.tileSize, minzoom: tianditu.minZoom, maxzoom: tianditu.maxZoom };
      sources['tianditu-vector-label-source'] = { type: 'raster', tiles: [tianditu.labelUrl], tileSize: tianditu.tileSize, minzoom: tianditu.minZoom, maxzoom: tianditu.maxZoom };
      layers.push(
        { id: TIANDITU_BASE_LAYER_ID, type: 'raster', source: 'tianditu-vector-base-source', layout: { visibility: 'none' }, paint: { 'raster-opacity': 1 } },
        { id: TIANDITU_LABEL_LAYER_ID, type: 'raster', source: 'tianditu-vector-label-source', layout: { visibility: 'none' }, paint: { 'raster-opacity': 1 } },
      );
    }
    return {
      version: 8,
      sources,
      layers,
    };
  }

  function poiColorExpression() {
    return app.categoryStyleRegistry?.maplibreColorExpression?.() || '#64748B';
  }

  function addGeoJsonLayers(map, paletteRanges = [10, 20, 30]) {
    const empty = JSON.parse(JSON.stringify(EMPTY_COLLECTION));
    map.addSource(RING_SOURCE_ID, { type: 'geojson', data: empty });
    map.addSource(CENTER_SOURCE_ID, { type: 'geojson', data: empty });
    map.addSource(DRAFT_CENTER_SOURCE_ID, { type: 'geojson', data: empty });
    map.addSource(POI_SOURCE_ID, { type: 'geojson', data: empty });

    map.addLayer({
      id: RING_FILL_LAYER_ID,
      type: 'fill',
      source: RING_SOURCE_ID,
      layout: { 'fill-sort-key': ['-', ['to-number', ['get', 'outerRangeMinutes']]] },
      paint: {
        'fill-color': ringColorExpression(paletteRanges, 'fill'),
        'fill-opacity': 0.17,
      },
    });
    map.addLayer({
      id: RING_OUTLINE_LAYER_ID,
      type: 'line',
      source: RING_SOURCE_ID,
      paint: {
        'line-color': ringColorExpression(paletteRanges, 'stroke'),
        'line-width': 1.25,
        'line-opacity': 0.76,
        'line-width-transition': { duration: 180, delay: 0 },
        'line-opacity-transition': { duration: 180, delay: 0 },
      },
    });
    map.addLayer({
      id: RING_ACTIVE_LAYER_ID,
      type: 'line',
      source: RING_SOURCE_ID,
      filter: ['==', ['get', 'ringId'], '__none__'],
      paint: {
        'line-color': ringColorExpression(paletteRanges, 'activeStroke'),
        'line-width': 2.25,
        'line-opacity': 0.92,
        'line-gap-width': 0.25,
        'line-width-transition': { duration: 180, delay: 0 },
        'line-opacity-transition': { duration: 180, delay: 0 },
      },
    });
    map.addLayer({
      id: RING_HOVER_LAYER_ID,
      type: 'line',
      source: RING_SOURCE_ID,
      filter: ['==', ['get', 'ringId'], '__none__'],
      paint: {
        'line-color': '#ffffff',
        'line-width': 1.75,
        'line-opacity': 0.88,
        'line-width-transition': { duration: 140, delay: 0 },
        'line-opacity-transition': { duration: 140, delay: 0 },
      },
    });
    map.addLayer({
      id: CENTER_HALO_LAYER_ID,
      type: 'circle',
      source: CENTER_SOURCE_ID,
      paint: {
        'circle-radius': 13,
        'circle-color': '#ffffff',
        'circle-opacity': 0.94,
        'circle-stroke-color': '#1f6ff0',
        'circle-stroke-width': 2,
      },
    });
    map.addLayer({
      id: CENTER_POINT_LAYER_ID,
      type: 'circle',
      source: CENTER_SOURCE_ID,
      paint: {
        'circle-radius': 7,
        'circle-color': '#e7474f',
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 2,
      },
    });
    map.addLayer({
      id: DRAFT_CENTER_HALO_LAYER_ID,
      type: 'circle',
      source: DRAFT_CENTER_SOURCE_ID,
      paint: {
        'circle-radius': 13,
        'circle-color': '#fff4df',
        'circle-opacity': 0.9,
        'circle-stroke-color': '#f08d0c',
        'circle-stroke-width': 2,
      },
    });
    map.addLayer({
      id: DRAFT_CENTER_POINT_LAYER_ID,
      type: 'circle',
      source: DRAFT_CENTER_SOURCE_ID,
      paint: {
        'circle-radius': 6,
        'circle-color': '#f08d0c',
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 2,
      },
    });
    map.addLayer({
      id: POI_LAYER_ID, type: 'circle', source: POI_SOURCE_ID,
      paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 2.5, 14, 4.5, 18, 7], 'circle-color': poiColorExpression(), 'circle-opacity': 0.9, 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 1 },
    });
    map.addLayer({
      id: POI_HOVER_LAYER_ID, type: 'circle', source: POI_SOURCE_ID, filter: ['==', ['get', 'poiId'], '__none__'],
      paint: { 'circle-radius': 8, 'circle-color': poiColorExpression(), 'circle-opacity': 0.32, 'circle-stroke-color': '#172b4d', 'circle-stroke-width': 1.5 },
    });
    map.addLayer({
      id: POI_SELECTED_LAYER_ID, type: 'circle', source: POI_SOURCE_ID, filter: ['==', ['get', 'poiId'], '__none__'],
      paint: { 'circle-radius': 10, 'circle-color': poiColorExpression(), 'circle-opacity': 1, 'circle-stroke-color': '#172b4d', 'circle-stroke-width': 3 },
    });
    map.addLayer({
      id: POI_LABEL_LAYER_ID, type: 'symbol', source: POI_SOURCE_ID,
      layout: { 'text-field': ['get', 'name'], 'text-size': 10, 'text-offset': [0, 1.1], 'text-anchor': 'top', 'text-allow-overlap': false, 'visibility': 'none' },
      paint: { 'text-color': '#1f3657', 'text-halo-color': '#ffffff', 'text-halo-width': 1.2 },
    });
  }

  function setSourceData(map, sourceId, data) {
    const source = map.getSource(sourceId);
    source?.setData(data);
  }

  function createTraditionalMap({ container, config, onRingClick, onRingHover, onPoiClick, onPoiHover, onMapBlankClick, onMapPointSelected, onMapCoordinate, onMapStatus }) {
    let map = null;
    let isReady = false;
    let isPickMode = false;
    let activeRingId = null;
    let hoveredRingId = null;
    let selectedPoiId = null;
    let hoveredPoiId = null;
    let visibleTopLevelCategoryIds = null;
    let activeBasemapId = config.defaultBasemapId || 'osm-standard';
    let pendingResult = null;
    let pendingDraftCenter = null;
    let lastFitAnalysisId = null;
    let paletteRanges = [10, 20, 30];
    let resultStale = false;
    let poiRenderToken = 0;
    let poiVisible = true;
    let mapWasDragged = false;

    function status(message) {
      if (typeof onMapStatus === 'function') onMapStatus(message || '');
    }

    function mapBoundsForResult(result) {
      const geojson = app.analysisMapGeoJson;
      if (!geojson) return null;
      return geojson.boundsForFeatures(geojson.buildRingFeatures(result));
    }

    function updateRingFilters() {
      if (!isReady) return;
      map.setFilter(RING_ACTIVE_LAYER_ID, ['==', ['get', 'ringId'], activeRingId || '__none__']);
      map.setFilter(RING_HOVER_LAYER_ID, ['==', ['get', 'ringId'], hoveredRingId || '__none__']);
      map.setFilter(POI_SELECTED_LAYER_ID, ['==', ['get', 'poiId'], selectedPoiId || '__none__']);
      map.setFilter(POI_HOVER_LAYER_ID, ['==', ['get', 'poiId'], hoveredPoiId || '__none__']);
      const categoryFilter = visibleTopLevelCategoryIds?.length
        ? ['in', ['get', 'topLevelCategoryId'], ['literal', visibleTopLevelCategoryIds]]
        : null;
      map.setFilter(POI_LAYER_ID, categoryFilter);
      map.setFilter(POI_LABEL_LAYER_ID, categoryFilter);
      map.setPaintProperty(RING_FILL_LAYER_ID, 'fill-opacity', activeRingId
        ? ['case', ['==', ['get', 'ringId'], activeRingId], resultStale ? 0.1 : 0.3, resultStale ? 0.035 : 0.065]
        : (resultStale ? 0.065 : 0.17));
      map.setPaintProperty(RING_OUTLINE_LAYER_ID, 'line-opacity', activeRingId
        ? ['case', ['==', ['get', 'ringId'], activeRingId], resultStale ? 0.58 : 1, resultStale ? 0.2 : 0.34]
        : (resultStale ? 0.32 : 0.92));
      map.setPaintProperty(POI_LAYER_ID, 'circle-opacity', resultStale ? 0 : 0.78);
    }

    function updatePoiInteractionFilters() {
      if (!isReady) return;
      map.setFilter(POI_SELECTED_LAYER_ID, ['==', ['get', 'poiId'], selectedPoiId || '__none__']);
      map.setFilter(POI_HOVER_LAYER_ID, ['==', ['get', 'poiId'], hoveredPoiId || '__none__']);
    }

    function updatePoiVisibility() {
      if (!isReady) return;
      [POI_LAYER_ID, POI_HOVER_LAYER_ID, POI_SELECTED_LAYER_ID].forEach((layerId) => {
        if (map.getLayer(layerId)) map.setLayoutProperty(layerId, 'visibility', poiVisible ? 'visible' : 'none');
      });
      if (map.getLayer(POI_LABEL_LAYER_ID)) map.setLayoutProperty(POI_LABEL_LAYER_ID, 'visibility', 'none');
      container.dataset.poiVisible = String(poiVisible);
    }

    function updateBasemapVisibility() {
      if (!isReady) return;
      const hasTianditu = Boolean(config.tiandituTokenAvailable && map.getLayer(TIANDITU_BASE_LAYER_ID));
      if (hasTianditu) {
        map.setLayoutProperty(OSM_LAYER_ID, 'visibility', activeBasemapId === 'osm-standard' ? 'visible' : 'none');
        map.setLayoutProperty(TIANDITU_BASE_LAYER_ID, 'visibility', activeBasemapId === 'tianditu-vector' ? 'visible' : 'none');
        map.setLayoutProperty(TIANDITU_LABEL_LAYER_ID, 'visibility', activeBasemapId === 'tianditu-vector' ? 'visible' : 'none');
      }
      container.dataset.activeBasemapId = activeBasemapId;
    }

    function applyDraftCenter(center) {
      pendingDraftCenter = center || null;
      if (!isReady) return;
      setSourceData(map, DRAFT_CENTER_SOURCE_ID, center ? app.analysisMapGeoJson.buildCenterFeatures(center) : EMPTY_COLLECTION);
    }

    function applyResult(result, shouldFit) {
      if (!isReady || !app.analysisMapGeoJson) return;
      if (!result) {
        container.dataset.analysisId = '';
        container.dataset.ringFeatureCount = '0';
        container.dataset.poiFeatureCount = '0';
        setSourceData(map, RING_SOURCE_ID, EMPTY_COLLECTION);
        setSourceData(map, CENTER_SOURCE_ID, EMPTY_COLLECTION);
        setSourceData(map, POI_SOURCE_ID, EMPTY_COLLECTION);
        status('当前交通方式尚未生成');
        return;
      }
      const rings = app.analysisMapGeoJson.buildRingFeatures(result);
      const center = app.analysisMapGeoJson.buildCenterFeatures(result.center);
      const diagnostics = [];
      const pois = app.analysisPoiGeoJson?.buildPoiFeatures(result, diagnostics) || EMPTY_COLLECTION;
      container.dataset.analysisId = result.analysisId || '';
      container.dataset.ringFeatureCount = String(rings.features.length);
      container.dataset.analysisSource = result.metadata?.sources?.isochrones || 'mock';
      setSourceData(map, RING_SOURCE_ID, rings);
      setSourceData(map, CENTER_SOURCE_ID, center);
      setSourceData(map, POI_SOURCE_ID, pois);
      container.dataset.poiFeatureCount = String(pois.features.length);
      if (diagnostics.length) container.dataset.poiDiagnostics = diagnostics.join('|');
      if (pendingDraftCenter && result.center && pendingDraftCenter.lon === result.center.lon && pendingDraftCenter.lat === result.center.lat) {
        applyDraftCenter(null);
      }
      if (rings.features.length === 0) {
        status(result.metadata?.sources?.isochrones === 'mock'
          ? '当前为模拟模式，暂无真实等时圈几何。'
          : '当前分析暂无有效等时圈几何。');
      } else {
        status('');
      }
      if (shouldFit && result.analysisId !== lastFitAnalysisId && rings.features.length > 0) {
        const bounds = mapBoundsForResult(result);
        if (bounds) {
          map.fitBounds(bounds, { padding: 56, maxZoom: 15, duration: 0 });
          lastFitAnalysisId = result.analysisId;
        }
      }
    }

    async function setPois(poiResult) {
      const token = ++poiRenderToken;
      if (!isReady || !app.analysisPoiGeoJson) return { cancelled: false, poiCount: 0, renderDurationMs: 0 };
      const started = global.performance?.now?.() ?? Date.now();
      const diagnostics = [];
      const full = app.analysisPoiGeoJson.buildPoiFeatures({ pois: poiResult?.pois || [] }, diagnostics);
      const metrics = await app.poiRenderBatcher.renderFeatures(full.features, (published) => {
        if (token === poiRenderToken) setSourceData(map, POI_SOURCE_ID, published);
      }, { batchSize: POI_RENDER_BATCH_SIZE });
      if (token !== poiRenderToken) return { cancelled: true, poiCount: 0, renderDurationMs: metrics.renderDurationMs };
      poiVisible = true;
      updatePoiVisibility();
      container.dataset.poiFeatureCount = String(full.features.length);
      container.dataset.poiQueryId = poiResult?.poiQueryId || '';
      if (diagnostics.length) container.dataset.poiDiagnostics = diagnostics.join('|');
      const duration = (global.performance?.now?.() ?? Date.now()) - started;
      container.dataset.poiRenderDurationMs = duration.toFixed(2);
      return { cancelled: false, poiCount: full.features.length, renderDurationMs: duration, frameCount: metrics.frameCount, batchSize: metrics.batchSize };
    }

    function setPickMode(active) {
      isPickMode = Boolean(active);
      if (!map) return;
      map.getCanvas().style.cursor = isPickMode ? 'url("./assets/map-pick-cursor.svg") 16 35, crosshair' : '';
      if (map.dragPan) {
        if (isPickMode) map.dragPan.disable();
        else map.dragPan.enable();
      }
      status(isPickMode ? '地图选点模式：点击地图选择待分析中心点，按 Escape 取消。' : '');
      if (!isPickMode && typeof onMapCoordinate === 'function') onMapCoordinate(null);
    }

    function updatePaletteRanges(ranges) {
      paletteRanges = ISOCHRONE_PALETTE?.normalizeRanges?.(ranges) || [10, 20, 30];
      container.dataset.paletteRanges = paletteRanges.join(',');
      if (!isReady) return;
      map.setPaintProperty(RING_FILL_LAYER_ID, 'fill-color', ringColorExpression(paletteRanges, 'fill'));
      map.setPaintProperty(RING_OUTLINE_LAYER_ID, 'line-color', ringColorExpression(paletteRanges, 'stroke'));
      map.setPaintProperty(RING_ACTIVE_LAYER_ID, 'line-color', ringColorExpression(paletteRanges, 'activeStroke'));
    }

    function bindEvents() {
      map.on('dragstart', () => { mapWasDragged = true; });
      map.on('dragend', () => { global.setTimeout(() => { mapWasDragged = false; }, 0); });
      map.on('click', (event) => {
        if (event.originalEvent?.__poiHandled) return;
        if (!isPickMode) {
          const features = map.queryRenderedFeatures(event.point, { layers: [RING_FILL_LAYER_ID, POI_LAYER_ID] });
          if (!features.length && typeof onRingClick === 'function') onRingClick(null);
          if (!features.length && !mapWasDragged && typeof onMapBlankClick === 'function') onMapBlankClick();
          return;
        }
        if (typeof onMapPointSelected === 'function') {
          onMapPointSelected({ lon: event.lngLat.lng, lat: event.lngLat.lat });
        }
      });
      map.on('mousemove', (event) => {
        if (!isPickMode || typeof onMapCoordinate !== 'function') return;
        onMapCoordinate({ lon: event.lngLat.lng, lat: event.lngLat.lat });
      });
      map.on('mouseout', () => {
        if (typeof onMapCoordinate === 'function') onMapCoordinate(null);
      });
      map.on('mouseenter', RING_FILL_LAYER_ID, (event) => {
        if (isPickMode || resultStale) return;
        map.getCanvas().style.cursor = 'pointer';
        const ringId = event.features?.[0]?.properties?.ringId || null;
        hoveredRingId = ringId;
        updateRingFilters();
        if (typeof onRingHover === 'function') onRingHover(ringId);
      });
      map.on('mousemove', RING_FILL_LAYER_ID, (event) => {
        if (isPickMode || resultStale) return;
        const ringId = event.features?.[0]?.properties?.ringId || null;
        if (ringId === hoveredRingId) return;
        hoveredRingId = ringId;
        updateRingFilters();
        if (typeof onRingHover === 'function') onRingHover(ringId);
      });
      map.on('mouseleave', RING_FILL_LAYER_ID, () => {
        if (isPickMode) return;
        map.getCanvas().style.cursor = '';
        hoveredRingId = null;
        updateRingFilters();
        if (typeof onRingHover === 'function') onRingHover(null);
      });
      map.on('click', RING_FILL_LAYER_ID, (event) => {
        if (isPickMode || resultStale) return;
        const ringId = event.features?.[0]?.properties?.ringId || null;
        if (typeof onRingClick === 'function') onRingClick(ringId);
      });
      map.on('click', POI_LAYER_ID, (event) => {
        if (isPickMode) return;
        if (event.originalEvent) event.originalEvent.__poiHandled = true;
        const poiId = event.features?.[0]?.properties?.poiId || null;
        if (typeof onPoiClick === 'function') onPoiClick(poiId);
      });
      map.on('mouseenter', POI_LAYER_ID, (event) => {
        if (isPickMode) return;
        map.getCanvas().style.cursor = 'pointer';
        hoveredPoiId = event.features?.[0]?.properties?.poiId || null;
        updatePoiInteractionFilters();
        if (typeof onPoiHover === 'function') onPoiHover(hoveredPoiId, { x: event.point.x, y: event.point.y });
      });
      map.on('mousemove', POI_LAYER_ID, (event) => {
        if (isPickMode) return;
        const poiId = event.features?.[0]?.properties?.poiId || null;
        if (poiId !== hoveredPoiId) {
          hoveredPoiId = poiId;
          updatePoiInteractionFilters();
        }
        if (typeof onPoiHover === 'function') onPoiHover(poiId, { x: event.point.x, y: event.point.y });
      });
      map.on('mouseleave', POI_LAYER_ID, () => {
        if (isPickMode) return;
        map.getCanvas().style.cursor = '';
        hoveredPoiId = null;
        updatePoiInteractionFilters();
        if (typeof onPoiHover === 'function') onPoiHover(null, null);
      });
      map.on('error', () => status('传统地图底图或 MapLibre 图层加载失败，分析结果仍会保留。'));
    }

    if (!global.maplibregl || typeof global.maplibregl.Map !== 'function') {
      status('MapLibre 尚未加载，传统地图暂不可用；参数和泛地图仍可使用。');
      return {
        setAnalysisResult(result) { pendingResult = result; },
        setDraftCenter(center) { pendingDraftCenter = center || null; },
        setActiveRingId(ringId) { activeRingId = ringId || null; },
        setHoveredRingId(ringId) { hoveredRingId = ringId || null; },
        setMapPickMode(active) { isPickMode = Boolean(active); },
        setPaletteRanges(ranges) { paletteRanges = ranges || [10, 20, 30]; },
        setResultStale(active) { resultStale = Boolean(active); },
        setPois() { return Promise.resolve({ cancelled: false, poiCount: 0, renderDurationMs: 0 }); },
        setPoiVisibility(active) { poiVisible = Boolean(active); },
        setSelectedPoiId(poiId) { selectedPoiId = poiId || null; },
        setHoveredPoiId(poiId) { hoveredPoiId = poiId || null; },
        focusPoi() {}, clearPoiFocus() {},
        setVisibleTopLevelCategoryIds(ids) { visibleTopLevelCategoryIds = ids; },
        setBasemapId(basemapId) { if (basemapId === 'osm-standard') activeBasemapId = basemapId; return basemapId === 'osm-standard'; },
        hasBasemap(basemapId) { return basemapId === 'osm-standard'; },
        resize() {},
        destroy() {},
      };
    }

    try {
      if (global.maplibregl.supported && !global.maplibregl.supported()) {
        status('当前浏览器不支持 WebGL2，传统地图暂不可用；分析和泛地图仍可使用。');
      } else {
        map = new global.maplibregl.Map({
          container,
          style: createStyle(config),
          center: config.initialCenter || [114.296944, 30.546944],
          zoom: config.initialZoom,
          attributionControl: false,
          interactive: true,
        });
        map.addControl(new global.maplibregl.ScaleControl({ maxWidth: 120, unit: 'metric' }), 'bottom-left');
        map.addControl(new global.maplibregl.AttributionControl({
          customAttribution: `<a href="${config.attributionUrl}" target="_blank" rel="noreferrer">${config.attribution}</a>`,
          compact: false,
        }), 'bottom-right');
        map.once('load', () => {
          isReady = true;
          addGeoJsonLayers(map, paletteRanges);
          bindEvents();
          if (pendingResult) applyResult(pendingResult, false);
          if (pendingDraftCenter) applyDraftCenter(pendingDraftCenter);
          const initialCenter = pendingDraftCenter || { lon: (config.initialCenter || [114.296944, 30.546944])[0], lat: (config.initialCenter || [114.296944, 30.546944])[1] };
          map.jumpTo({ center: [Number(initialCenter.lon), Number(initialCenter.lat)], zoom: config.initialZoom });
          container.dataset.mapCenter = `${Number(initialCenter.lon).toFixed(6)},${Number(initialCenter.lat).toFixed(6)}`;
          updateRingFilters();
          updateBasemapVisibility();
          status('');
        });
      }
    } catch (error) {
      status('MapLibre 初始化失败，传统地图暂不可用；分析和泛地图仍可使用。');
    }

    return {
      setAnalysisResult(result) {
        pendingResult = result || null;
        if (isReady) applyResult(result, true);
      },
      setPois,
      setPoiVisibility(active) {
        poiVisible = Boolean(active);
        updatePoiVisibility();
      },
      setDraftCenter(center) {
        applyDraftCenter(center);
        if (!isReady || !center || !Number.isFinite(Number(center.lon)) || !Number.isFinite(Number(center.lat))) return;
        const target = [Number(center.lon), Number(center.lat)];
        const reducedMotion = global.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
        if (reducedMotion) map.jumpTo({ center: target });
        else map.easeTo({ center: target, duration: 650, easing: (t) => 1 - ((1 - t) ** 3), essential: false });
        container.dataset.mapCenter = `${target[0].toFixed(6)},${target[1].toFixed(6)}`;
      },
      setActiveRingId(ringId) {
        activeRingId = ringId || null;
        container.dataset.activeRingId = activeRingId || '';
        updateRingFilters();
      },
      setHoveredRingId(ringId) {
        hoveredRingId = ringId || null;
        updateRingFilters();
      },
      setSelectedPoiId(poiId) {
        selectedPoiId = poiId || null;
        updatePoiInteractionFilters();
      },
      setHoveredPoiId(poiId) {
        hoveredPoiId = poiId || null;
        updatePoiInteractionFilters();
      },
      focusPoi(location, options = {}) {
        if (!map || !location) return;
        const started = performance.now();
        const narrow = container.clientWidth < 720;
        const padding = narrow
          ? { top: 24, right: 24, bottom: Math.min(300, container.clientHeight * 0.42), left: 24 }
          : { top: 24, right: Math.min(Number(options.detailWidth || 336) + 32, container.clientWidth * 0.48), bottom: 32, left: 24 };
        map.easeTo({ center: [Number(location.lon), Number(location.lat)], padding, duration: 280, essential: false });
        container.dataset.detailViewportAdjustMs = String(performance.now() - started);
        container.dataset.detailSafeArea = narrow ? 'bottom' : 'right';
      },
      clearPoiFocus() {
        if (!map) return;
        map.easeTo({ padding: { top: 0, right: 0, bottom: 0, left: 0 }, duration: 200, essential: false });
        delete container.dataset.detailSafeArea;
      },
      setVisibleTopLevelCategoryIds(ids) {
        visibleTopLevelCategoryIds = ids == null ? null : [...new Set(ids.map(String))];
        updateRingFilters();
      },
      setBasemapId(basemapId) {
        if (basemapId === 'tianditu-vector' && !config.tiandituTokenAvailable) {
          status('天地图入口已禁用：缺少运行时 Token。');
          return false;
        }
        if (!['osm-standard', 'tianditu-vector'].includes(basemapId)) return false;
        activeBasemapId = basemapId;
        updateBasemapVisibility();
        return true;
      },
      hasBasemap(basemapId) {
        return basemapId === 'osm-standard' || (basemapId === 'tianditu-vector' && Boolean(config.tiandituTokenAvailable));
      },
      setMapPickMode(active) {
        setPickMode(active);
      },
      setPaletteRanges(ranges) {
        updatePaletteRanges(ranges);
      },
      setResultStale(active) {
        resultStale = Boolean(active);
        container.dataset.resultStale = String(resultStale);
        updateRingFilters();
      },
      resize() {
        map?.resize();
      },
      zoomIn() {
        map?.zoomIn({ duration: 180 });
      },
      zoomOut() {
        map?.zoomOut({ duration: 180 });
      },
      resetView(center) {
        if (!map) return;
        const nextCenter = center ? [center.lon, center.lat] : [116.4768, 39.9953];
        map.easeTo({ center: nextCenter, zoom: config.initialZoom, duration: 180 });
      },
      destroy() {
        map?.remove();
        map = null;
        isReady = false;
      },
    };
  }

  app.traditionalMapAdapter = Object.freeze({ createTraditionalMap });
})(window);

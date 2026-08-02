(function initAnalysisStore(global) {
  const app = global.PanmapApp = global.PanmapApp || {};
  const supportedProfiles = new Set(['foot-walking', 'cycling-regular', 'driving-car']);

  const defaultParameterDraft = () => ({
    center: { lon: 114.296944, lat: 30.546944, crs: 'EPSG:4326', label: '武汉·黄鹤楼', presetId: 'wuhan-huanghelou' },
    centerSource: 'preset',
    poiDatasetId: null,
    profile: 'driving-car',
    rangesMinutes: [10, 20, 30],
    categoryIds: [],
    options: { includePois: false, calculateTravelTimes: false, poiPreviewRadiusMeters: 1000 },
  });

  const initialState = () => ({
    data: {
      parameterDraft: defaultParameterDraft(),
      lastSubmittedRequest: null,
      lastSuccessfulResult: null,
      request: null,
      result: null,
      status: 'idle',
      requestStatus: 'idle',
      error: null,
      activeProfile: 'driving-car',
      resultsByProfile: {},
      jobsByProfile: {},
      multimodePreparation: null,
    },
    interaction: {
      activeRingId: null,
      hoveredRingId: null,
      isMapPickMode: false,
      focusedRingId: null,
      selectedCategoryId: null,
      activeCategoryId: null,
      hoveredCategoryId: null,
      selectedPoiId: null,
      hoveredPoiId: null,
      categoryPath: [],
      categoryFocusPath: [],
      expandedCategoryIds: [],
      visibleTopLevelCategoryIds: null,
      activeBasemapId: 'osm-standard',
    },
  });

  function clone(value) {
    if (value === undefined || value === null) return value;
    return JSON.parse(JSON.stringify(value));
  }

  function createAnalysisStore() {
    let state = initialState();
    const listeners = new Set();

    function getState() {
      return clone(state);
    }

    function notify() {
      const snapshot = getState();
      listeners.forEach((listener) => listener(snapshot));
    }

    function update(recipe) {
      state = recipe(state);
      notify();
      return getState();
    }

    return {
      getState,
      subscribe(listener) {
        if (typeof listener !== 'function') return () => {};
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      setRequest(request) {
        return update((current) => ({
          ...current,
          data: {
            ...current.data,
            request: clone(request),
            lastSubmittedRequest: clone(request),
            error: null,
          },
        }));
      },
      setLoading() {
        return update((current) => ({
          ...current,
          data: { ...current.data, status: 'loading', requestStatus: 'loading', error: null },
        }));
      },
      setResult(result) {
        const profile = result?.profile || state.data.activeProfile;
        if (!supportedProfiles.has(profile)) throw new Error(`不支持的 profile: ${profile || ''}`);
        const profileResult = { ...clone(result), profile };
        const poiIds = new Set((result?.pois || []).map((poi) => poi.poiId));
        const categoryIds = new Set((result?.categories || []).map((category) => category.categoryId));
        const previousFocus = currentFocusPath(state.interaction);
        const focusPath = app.categoryTree?.buildCategoryTree
          ? app.categoryTree.fallbackFocusPath(app.categoryTree.buildCategoryTree(result?.categories || []), previousFocus)
          : previousFocus;
        return update((current) => ({
          ...current,
          data: {
            ...current.data,
            result: profileResult,
            lastSuccessfulResult: profileResult,
            activeProfile: profile,
            resultsByProfile: { ...current.data.resultsByProfile, [profile]: profileResult },
            status: 'success',
            requestStatus: 'success',
            error: null,
          },
          interaction: {
            ...current.interaction,
            activeRingId: result?.rings?.some((ring) => ring.ringId === current.interaction.activeRingId)
              ? current.interaction.activeRingId
              : null,
            focusedRingId: result?.rings?.some((ring) => ring.ringId === current.interaction.focusedRingId)
              ? current.interaction.focusedRingId
              : null,
            selectedPoiId: poiIds.has(current.interaction.selectedPoiId) ? current.interaction.selectedPoiId : null,
            hoveredPoiId: poiIds.has(current.interaction.hoveredPoiId) ? current.interaction.hoveredPoiId : null,
            selectedCategoryId: categoryIds.has(current.interaction.selectedCategoryId) ? current.interaction.selectedCategoryId : null,
            activeCategoryId: categoryIds.has(current.interaction.activeCategoryId) ? current.interaction.activeCategoryId : null,
            hoveredCategoryId: categoryIds.has(current.interaction.hoveredCategoryId) ? current.interaction.hoveredCategoryId : null,
            categoryPath: focusPath,
            categoryFocusPath: focusPath,
          },
        }));
      },
      setError(error) {
        return update((current) => ({
          ...current,
          data: { ...current.data, status: 'error', requestStatus: 'error', error: clone(error) },
        }));
      },
      setParameterDraft(patch) {
        return update((current) => {
          const nextDraft = {
            ...current.data.parameterDraft,
            ...clone(patch),
            center: patch?.center
              ? { ...current.data.parameterDraft.center, ...clone(patch.center) }
              : current.data.parameterDraft.center,
            options: patch?.options
              ? { ...current.data.parameterDraft.options, ...clone(patch.options) }
              : current.data.parameterDraft.options,
          };
          return { ...current, data: { ...current.data, parameterDraft: nextDraft } };
        });
      },
      profileAvailability(profile) {
        return supportedProfiles.has(profile)
          ? { supported: true, profile }
          : { supported: false, profile, reason: '当前数据源不支持' };
      },
      setActiveProfile(profile) {
        if (!supportedProfiles.has(profile)) throw new Error('当前数据源不支持');
        return update((current) => {
          const result = current.data.resultsByProfile[profile] || null;
          const job = current.data.jobsByProfile[profile] || null;
          const poiIds = new Set((result?.pois || []).map((poi) => poi.poiId));
          return {
            ...current,
            data: {
              ...current.data,
              activeProfile: profile,
              parameterDraft: { ...current.data.parameterDraft, profile },
              result: clone(result),
              lastSuccessfulResult: clone(result),
              status: result ? 'success' : (job?.status === 'partial' ? 'partial' : 'idle'),
              requestStatus: result ? 'success' : 'idle',
              error: null,
            },
            interaction: {
              ...current.interaction,
              selectedPoiId: poiIds.has(current.interaction.selectedPoiId) ? current.interaction.selectedPoiId : null,
              hoveredPoiId: poiIds.has(current.interaction.hoveredPoiId) ? current.interaction.hoveredPoiId : null,
            },
          };
        });
      },
      setProfileJob(profile, job) {
        if (!supportedProfiles.has(profile) || job?.profile !== profile || !job?.jobId) {
          throw new Error('profile job 契约无效');
        }
        return update((current) => ({
          ...current,
          data: { ...current.data, jobsByProfile: { ...current.data.jobsByProfile, [profile]: clone(job) } },
        }));
      },
      updateProfileJob(profile, jobId, patch) {
        if (!supportedProfiles.has(profile)) throw new Error('当前数据源不支持');
        return update((current) => {
          const existing = current.data.jobsByProfile[profile];
          if (!existing || existing.jobId !== jobId) return current;
          return {
            ...current,
            data: {
              ...current.data,
              jobsByProfile: {
                ...current.data.jobsByProfile,
                [profile]: { ...existing, ...clone(patch), profile, jobId },
              },
            },
          };
        });
      },
      publishProfileResult(profile, jobId, result) {
        const job = state.data.jobsByProfile[profile];
        if (!job || job.jobId !== jobId || job.status !== 'layout-ready'
          || result?.profile !== profile || result?.status !== 'completed') return getState();
        return update((current) => {
          const active = current.data.activeProfile === profile;
          return {
            ...current,
            data: {
              ...current.data,
              resultsByProfile: { ...current.data.resultsByProfile, [profile]: clone(result) },
              jobsByProfile: {
                ...current.data.jobsByProfile,
                [profile]: { ...current.data.jobsByProfile[profile], status: 'completed', published: true },
              },
              ...(active ? {
                result: clone(result), lastSuccessfulResult: clone(result),
                status: 'success', requestStatus: 'success', error: null,
              } : {}),
            },
          };
        });
      },
      prepareAllProfiles(plans) {
        const ordered = ['foot-walking', 'cycling-regular', 'driving-car'];
        const entries = ordered.map((profile) => ({ profile, ...(clone(plans?.[profile]) || { status: 'N/A' }) }));
        return update((current) => ({
          ...current,
          data: {
            ...current.data,
            multimodePreparation: {
              mode: 'prepare-only', profileOrder: ordered, profiles: entries,
              approved: false, executed: false, upstreamRequestCount: 0,
            },
          },
        }));
      },
      setDraftCenter(center, source = 'map') {
        const normalizedSource = source === 'map' ? 'map-click' : source;
        return update((current) => ({
          ...current,
          data: {
            ...current.data,
            parameterDraft: {
              ...current.data.parameterDraft,
              center: { ...clone(center), source: normalizedSource },
              centerSource: normalizedSource,
            },
          },
        }));
      },
      setActiveRingId(ringId) {
        const result = state.data.lastSuccessfulResult || state.data.result;
        if (ringId && result && !result.rings.some((ring) => ring.ringId === ringId)) {
          if (global.console?.warn) global.console.warn(`忽略不存在的 ringId: ${ringId}`);
          return getState();
        }
        return update((current) => ({
          ...current,
          interaction: { ...current.interaction, activeRingId: ringId || null, focusedRingId: ringId || null },
        }));
      },
      setHoveredRingId(ringId) {
        return update((current) => ({
          ...current,
          interaction: { ...current.interaction, hoveredRingId: ringId || null },
        }));
      },
      setMapPickMode(active) {
        return update((current) => ({
          ...current,
          interaction: { ...current.interaction, isMapPickMode: Boolean(active) },
        }));
      },
      setFocusedRing(ringId) {
        return this.setActiveRingId(ringId);
      },
      setSelectedCategory(categoryId) {
        return update((current) => ({ ...current, interaction: { ...current.interaction, selectedCategoryId: categoryId || null, activeCategoryId: categoryId || null } }));
      },
      setSelectedPoi(poiId) {
        return this.setSelectedPoiId(poiId);
      },
      setHoveredPoi(poiId) {
        return this.setHoveredPoiId(poiId);
      },
      setCategoryPath(categoryIds) {
        const path = [...new Set(categoryIds || [])];
        return update((current) => ({
          ...current,
          interaction: { ...current.interaction, categoryPath: path, categoryFocusPath: path },
        }));
      },
      setCategoryFocusPath(categoryIds) {
        return this.setCategoryPath(categoryIds);
      },
      setSelectedPoiId(poiId) {
        return update((current) => ({ ...current, interaction: { ...current.interaction, selectedPoiId: poiId || null } }));
      },
      setHoveredPoiId(poiId) {
        return update((current) => ({ ...current, interaction: { ...current.interaction, hoveredPoiId: poiId || null } }));
      },
      setActiveCategoryId(categoryId) {
        return update((current) => ({ ...current, interaction: { ...current.interaction, activeCategoryId: categoryId || null, selectedCategoryId: categoryId || null } }));
      },
      setHoveredCategoryId(categoryId) {
        return update((current) => ({ ...current, interaction: { ...current.interaction, hoveredCategoryId: categoryId || null } }));
      },
      setVisibleTopLevelCategoryIds(categoryIds) {
        const value = categoryIds == null ? null : [...new Set(categoryIds.map(String))];
        return update((current) => ({ ...current, interaction: { ...current.interaction, visibleTopLevelCategoryIds: value } }));
      },
      setActiveBasemapId(basemapId) {
        return update((current) => ({ ...current, interaction: { ...current.interaction, activeBasemapId: basemapId || 'osm-standard' } }));
      },
      resetInteraction() {
        return update((current) => ({ ...current, interaction: initialState().interaction }));
      },
    };
  }

  function currentFocusPath(interaction) {
    return interaction?.categoryFocusPath || interaction?.categoryPath || [];
  }

  app.analysisStore = createAnalysisStore();
  app.createAnalysisStore = createAnalysisStore;
})(window);

(function initAnalysisClient(global) {
  const app = global.PanmapApp = global.PanmapApp || {};

  async function parseJson(response) {
    const text = await response.text();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch (error) {
      throw Object.assign(new Error('后端返回了无法解析的 JSON。'), { code: 'INVALID_RESPONSE', cause: error });
    }
  }

  function stageJobHeaders(jobId, profile) {
    if (!jobId) return {};
    if (profile === 'cycling-regular') return { 'X-Stage51-Job-ID': jobId };
    if (profile === 'foot-walking') return { 'X-Stage45-Job-ID': jobId };
    return {};
  }

  async function createAnalysis(request, { signal, jobId } = {}) {
    const normalized = app.contracts.normalizeAnalysisRequest(request);
    const response = await fetch(`${app.config.apiBaseUrl}/analyses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...stageJobHeaders(jobId, normalized.profile) },
      body: JSON.stringify(normalized),
      signal,
    });
    const payload = await parseJson(response);
    if (!response.ok) {
      const errorPayload = payload?.error || {};
      const error = new Error(errorPayload.message || `分析请求失败（${response.status}）。`);
      error.code = errorPayload.code || 'HTTP_ERROR';
      error.details = errorPayload.details || [];
      error.requestId = errorPayload.requestId || response.headers.get('X-Request-ID') || null;
      error.status = response.status;
      throw error;
    }
    return app.contracts.normalizeAnalysisResult(payload);
  }

  async function getHealth({ signal } = {}) {
    const response = await fetch(`${app.config.apiBaseUrl}/health`, { headers: { Accept: 'application/json' }, signal });
    const payload = await parseJson(response);
    if (!response.ok || !payload || !['ready', 'not-ready'].includes(payload.status)) {
      throw new Error(`本地服务健康检查失败（${response.status}）。`);
    }
    return payload;
  }

  async function listPoiDatasets({ signal } = {}) {
    const response = await fetch(`${app.config.apiBaseUrl}/poi-datasets`, { headers: { Accept: 'application/json' }, signal });
    const payload = await parseJson(response);
    if (!response.ok) {
      const error = new Error(payload?.error?.message || `POI 数据集请求失败（${response.status}）。`);
      error.code = payload?.error?.code || 'HTTP_ERROR';
      throw error;
    }
    return Array.isArray(payload?.datasets) ? payload.datasets : [];
  }

  async function createPoiPreview(request, { signal } = {}) {
    const normalized = {
      schemaVersion: '1.0',
      center: request.center,
      profile: request.profile,
      rangesMinutes: request.rangesMinutes,
      categoryIds: request.categoryIds || [],
      radiusMeters: Number(request.radiusMeters || 1000),
    };
    const response = await fetch(`${app.config.apiBaseUrl}/poi-previews`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(normalized),
      signal,
    });
    const payload = await parseJson(response);
    if (!response.ok) {
      const error = new Error(payload?.error?.message || `POI 预览请求失败（${response.status}）。`);
      error.code = payload?.error?.code || 'HTTP_ERROR';
      error.details = payload?.error?.details || [];
      error.requestId = payload?.error?.requestId || response.headers.get('X-Request-ID') || null;
      error.status = response.status;
      throw error;
    }
    return app.contracts.normalizePoiPreview(payload);
  }

  async function createNameCloud(request, { signal, jobId } = {}) {
    const response = await fetch(`${app.config.apiBaseUrl}/name-clouds`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...stageJobHeaders(jobId, request.profile) },
      body: JSON.stringify({
        schemaVersion: '1.0',
        center: request.center,
        profile: request.profile,
        rangesMinutes: request.rangesMinutes,
        categoryIds: request.categoryIds || [],
        cumulativeIsochrones: request.cumulativeIsochrones || [],
        approved: request.approved === true,
      }),
      signal,
    });
    const payload = await parseJson(response);
    if (!response.ok) {
      const error = new Error(payload?.error?.message || `名称云请求失败（${response.status}）。`);
      error.code = payload?.error?.code || 'HTTP_ERROR';
      error.details = payload?.error?.details || [];
      error.requestId = payload?.error?.requestId || response.headers.get('X-Request-ID') || null;
      error.status = response.status;
      throw error;
    }
    return app.contracts.normalizeAnalysisResult(payload);
  }

  async function createPoiQuery(request, { signal } = {}) {
    const response = await fetch(`${app.config.apiBaseUrl}/poi-query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ ...request, schemaVersion: '1.0' }),
      signal,
    });
    const payload = await parseJson(response);
    if (!response.ok) {
      const errorPayload = payload?.error || {};
      const error = new Error(errorPayload.message || `POI 查询失败（${response.status}）。`);
      error.code = errorPayload.code || 'HTTP_ERROR';
      error.details = errorPayload.details || [];
      error.status = response.status;
      throw error;
    }
    return app.contracts.normalizePoiResult(payload);
  }

  async function createMatrixAccessibility(baseResult, { signal, jobId } = {}) {
    const response = await fetch(`${app.config.apiBaseUrl}/matrix-accessibility`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...stageJobHeaders(jobId, baseResult.profile) },
      body: JSON.stringify({ schemaVersion: '1.0', baseResult }),
      signal,
    });
    const payload = await parseJson(response);
    if (!response.ok) {
      const errorPayload = payload?.error || {};
      const error = new Error(errorPayload.message || `Matrix 请求失败（${response.status}）。`);
      error.code = errorPayload.code || 'HTTP_ERROR';
      error.details = errorPayload.details || [];
      error.requestId = errorPayload.requestId || response.headers.get('X-Request-ID') || null;
      error.status = response.status;
      throw error;
    }
    return app.contracts.normalizeAnalysisResult(payload);
  }

  async function createSpatialTimeAccessibility(baseResult, minuteIsochrones, { signal } = {}) {
    const response = await fetch(`${app.config.apiBaseUrl}/spatial-time-accessibility`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ schemaVersion: '1.0', baseResult, minuteIsochrones }),
      signal,
    });
    const payload = await parseJson(response);
    if (!response.ok) {
      const errorPayload = payload?.error || {};
      const error = new Error(errorPayload.message || `空间补时请求失败（${response.status}）。`);
      error.code = errorPayload.code || 'HTTP_ERROR';
      error.status = response.status;
      throw error;
    }
    return app.contracts.normalizeAnalysisResult(payload);
  }

  async function createMinuteAccessibility(baseResult, { signal, approved = false } = {}) {
    const response = await fetch(`${app.config.apiBaseUrl}/minute-accessibility`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ schemaVersion: '1.0', baseResult, approved }),
      signal,
    });
    const payload = await parseJson(response);
    if (!response.ok) {
      const errorPayload = payload?.error || {};
      const error = new Error(errorPayload.message || `分钟级可达性请求失败（${response.status}）。`);
      error.code = errorPayload.code || 'HTTP_ERROR';
      error.details = errorPayload.details || [];
      error.status = response.status;
      throw error;
    }
    return app.contracts.normalizeAnalysisResult(payload);
  }

  async function geocode(operation, params, { signal } = {}) {
    const query = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') query.set(key, String(value));
    });
    const response = await fetch(`${app.config.apiBaseUrl}/geocoding/${operation}?${query.toString()}`, { headers: { Accept: 'application/json' }, signal });
    const payload = await parseJson(response);
    if (!response.ok) {
      const error = new Error(payload?.error?.message || `地点搜索失败（${response.status}）。`);
      error.code = payload?.error?.code || 'HTTP_ERROR';
      error.details = payload?.error?.details || [];
      error.status = response.status;
      throw error;
    }
    return payload;
  }

  async function reverseGeocode(lon, lat, { signal } = {}) {
    return geocode('reverse', { lon, lat }, { signal });
  }

  async function getWalkingJobLedger(jobId, { signal } = {}) {
    const query = jobId ? `?jobId=${encodeURIComponent(jobId)}` : '';
    const response = await fetch(`${app.config.apiBaseUrl}/walking-job-ledger${query}`, { headers: { Accept: 'application/json' }, signal });
    const payload = await parseJson(response);
    if (!response.ok) throw new Error(payload?.error?.message || `步行作业账本读取失败（${response.status}）。`);
    return payload;
  }

  async function publishWalkingJob(jobId, { signal } = {}) {
    const response = await fetch(`${app.config.apiBaseUrl}/walking-jobs/${encodeURIComponent(jobId)}/publish`, {
      method: 'POST', headers: { Accept: 'application/json' }, signal,
    });
    const payload = await parseJson(response);
    if (!response.ok) throw new Error(payload?.error?.message || `步行作业发布失败（${response.status}）。`);
    return payload;
  }

  async function getCyclingJobLedger(jobId, { signal } = {}) {
    const query = jobId ? `?jobId=${encodeURIComponent(jobId)}` : '';
    const response = await fetch(`${app.config.apiBaseUrl}/cycling-job-ledger${query}`, { headers: { Accept: 'application/json' }, signal });
    const payload = await parseJson(response);
    if (!response.ok) throw new Error(payload?.error?.message || `骑行作业账本读取失败（${response.status}）。`);
    return payload;
  }

  async function publishCyclingJob(jobId, { signal } = {}) {
    const response = await fetch(`${app.config.apiBaseUrl}/cycling-jobs/${encodeURIComponent(jobId)}/publish`, {
      method: 'POST', headers: { Accept: 'application/json' }, signal,
    });
    const payload = await parseJson(response);
    if (!response.ok) throw new Error(payload?.error?.message || `骑行作业发布失败（${response.status}）。`);
    return payload;
  }

  async function publishProfileJob(profile, jobId, options = {}) {
    if (profile === 'cycling-regular') return publishCyclingJob(jobId, options);
    if (profile === 'foot-walking') return publishWalkingJob(jobId, options);
    throw new Error(`当前交通方式不支持发布：${profile || 'unknown'}`);
  }

  app.analysisClient = Object.freeze({
    getHealth, createAnalysis, createPoiPreview, createNameCloud, createPoiQuery, createMatrixAccessibility, createSpatialTimeAccessibility, createMinuteAccessibility,
    getWalkingJobLedger, publishWalkingJob, getCyclingJobLedger, publishCyclingJob,
    publishProfileJob, listPoiDatasets, geocode, reverseGeocode,
  });
})(window);

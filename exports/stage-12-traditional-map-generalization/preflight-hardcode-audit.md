# Stage 12 preflight hardcode audit

## Git baseline

- baselineBranch: `main`
- baselineCommit: `663f565971df86cc10c56864ca09f868857501b3`
- workingTreeStatus: clean immediately after baseline commit

## A. Must be removed from the generalized business path

- `server/app/main.py`: Stage45/Stage51 headers select profile-specific ledgers and reintroduce the `[10,20,30]` gate.
- `server/app/main.py`: cycling requests carrying a historical job ID use `build_cached_name_cloud` instead of the requested live center and ranges.
- `src/api/analysis-client.js`: generalized requests can still receive `X-Stage45-Job-ID` / `X-Stage51-Job-ID`.
- `app.js`: new profile jobs are named after Stage45/Stage51 and normal session cache keys are profile-stage specific.
- Center sources differ: frontend emits `search`, contracts/backend accept `map-click`, while the desired contract is `preset|geocoder|geolocation|map-pick`.
- `server/app/services/spatial_time_accessibility.py`: minute-band estimates are incorrectly written to Matrix-only `travelTimeSeconds` and `networkDistanceMeters`.
- `app.js`: minute batching and retry splitting are implemented in the browser rather than the backend planner.
- Provider time limits and request budgets are not exposed from one shared capability definition.
- Large POI queries can silently return budget-truncated coverage instead of entering an explicit approval-required state.

## B. Historical/experimental logic that may remain but must not drive the live path

- Stage45/Stage51 ledgers, reports, exported JSON, screenshots and explicit query-parameter replay loaders.
- `server/app/services/stage51_cycling_cache.py` for explicit historical replay only.
- Frozen 10/20/30 fixtures used by old Matrix/layout regression tests.
- Huanghelou as the default preset and a browser-test fixture; it must not be required by analysis services.
- Research-mode frozen baselines and layout-density fixtures.

## Current generalized capabilities already present

- Editable, sorted, deduplicated positive integer display ranges.
- Dynamic `ring-{inner}-{outer}` generation.
- Unified `setCenterSelection` entry point in the UI.
- Live ORS Isochrones and OpenPOIService queries for arbitrary coordinates.
- Polygon `covers` classification and POI grid planning.
- Stale-result retention when center/profile/ranges change.

## Remediation order

1. Freeze provider capabilities and Center source contract.
2. Remove historical job/cache branching from default live calls.
3. Move minute planning/execution/classification to backend services.
4. Preserve Matrix fields as null for minute-band estimates.
5. Add approval-required and partial-result guards.
6. Add offline tests, then bounded live/browser evidence.

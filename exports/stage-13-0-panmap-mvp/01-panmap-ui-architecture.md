# Panmap MVP UI Architecture

```text
AnalysisStore.workflow
  ├─ reachabilityResult
  ├─ poiResult
  └─ minuteResult
          ↓ local only
buildPanmapInputSnapshot()
          ↓ immutable
PanmapInputSnapshot
  ├─ exclusive rings
  ├─ provider + semantic categories
  └─ one-minute estimates
          ↓ deterministic
category aggregation + layout
          ↓
overview → ring-focused → category-focused → poi-selected
                                              ├─ PoiDetailViewModel
                                              └─ Traditional Map selection
```

The Stage 13.0 page reuses the existing navigation, typography, spacing, card, border, light-theme and primary-blue tokens. It does not request a Provider and does not create another category color table.

Key modules:

- `src/contracts/panmap-input-snapshot.js`: immutable workflow bridge.
- `src/adapters/panmap-mvp-layout.js`: exclusive category aggregation and deterministic layouts.
- `src/state/panmap-mvp-state.js`: four-state interaction reducer.
- `src/view/panmap-mvp-view.js`: accessible SVG UI, detail reuse and breadcrumb control.


# Stage 13.1A Browser Evidence

## Real input

- URL: `http://127.0.0.1:5500/?elasticRegion=1`
- Center: 黄鹤楼
- Profile: 步行 (`foot-walking`)
- Thresholds: 10 / 20 / 30 minutes
- Elastic parent: exclusive 10–20 minute ring
- Source POIs classified to a minute: 2223 / 2223
- POIs in the selected parent ring: 1044
- Level-one category regions: 10
- Largest visible categories: 餐饮 343, 购物 299, 生活 71, 医疗 62, 住宿 53, 公共 46

## Acceptance sequence

1. Entered Panmap with Stage 13.0 Bubble Baseline still selected.
2. Used the hidden developer switch to select Elastic Region v0.
3. Verified the fixed 20-minute parent was completely partitioned by ten shared-edge polygons.
4. Clicked the restaurant region and observed `focusAlpha` animate from 0 to 1 while neighboring regions compressed.
5. Used the development alpha probe to capture the stable 0.5 state.
6. Clicked the restaurant region again and observed the layout return to alpha 0 without a visible reset.

## Live stable-state readings

| State | Alpha | Solve | Gap | Overlap | Max area error | Adjacency change | Warm start |
|---|---:|---:|---:|---:|---:|---:|---|
| Elastic overview | 0.000 | 5.40 ms | 0 | 0 | 0.68% | initial graph | no |
| Restaurant focus | 1.000 | 0.40 ms | 0 | 0 | 0.25% | 0 | yes |
| Restaurant half | 0.500 | 0.10 ms | 0 | 0 | 0.24% | 0 | yes |
| Returned | 0.000 | 0.20 ms | 0 | 0 | 0.25% | 0 | yes |

## Provider isolation

The page exposed both `panmapProviderCallCount=0` and `elasticProviderCallCount=0`. No AMap, ORS, or minute API request was triggered by layout switching, focus, alpha probing, or return. The snapshot was reused in memory.

## Screenshots

- `screenshots/01-stage13-bubble-baseline.png`
- `screenshots/02-elastic-overview.png`
- `screenshots/03-elastic-focus-alpha-050.png`
- `screenshots/04-elastic-focus-alpha-100.png`
- `screenshots/05-elastic-return.png`

The browser tab was retained as a deliverable and the frontend/backend were intentionally left running for inspection.

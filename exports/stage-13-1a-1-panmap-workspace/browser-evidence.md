# Stage 13.1A.1 Browser Evidence

## Real scenario

- Center: 武汉·黄鹤楼
- Profile: walking (`foot-walking`)
- Thresholds: 10 / 20 / 30 minutes
- Final live snapshot: 3029 POIs, 3029 / 3029 minute-classified
- Layout: Elastic Region v0 on the existing fixed 20-minute parent
- Viewports: 1280×720, 1440×900, 1920×1080

## Quantitative result

At 1440×900, the workspace and main canvas are both 909×738. The main canvas area ratio is therefore 1.0, up from the 0.671637 baseline. Opening or collapsing Inspector and Mini Map never changed the 909×738 canvas bounds.

At 1280×720 and 1920×1080 the page kept exactly one `.panmap-workspace`; the main canvas continued to cover 100% of that workspace. Resize published geometry only and recorded Provider calls as zero.

## Interaction result

- Full polygon click: alpha 0 → 1 → 0 PASS.
- Drag from inside a polygon: canvas offset 60,42 PASS.
- Click after drag: alpha returned to 1 PASS.
- Inspector collapse/expand by pointer: PASS.
- Mini Map hide/show: PASS.
- Breadcrumb back to ring: PASS.
- Mini Map click: PASS.
- Bubble POI selection: entered `poi-selected`; detail was `半边鱼(武昌店)` and the Inspector reported `传统地图小窗 · 已同步定位所选 POI`.
- Panmap layout/overlay/resize Provider delta: 0.

The interaction audit found and fixed two real hit-testing issues: the collapsed Inspector button was initially covered by the developer toolbar, and early pointer capture initially stole ordinary polygon clicks. Both cases now have regression assertions.

## Screenshots

1. `screenshots/01-before-layout-refactor.png`
2. `screenshots/02-single-workspace-overview.png`
3. `screenshots/03-floating-inspector.png`
4. `screenshots/04-inspector-collapsed.png`
5. `screenshots/05-floating-mini-map.png`
6. `screenshots/06-mini-map-collapsed.png`
7. `screenshots/07-elastic-region-focus-full-canvas.png`
8. `screenshots/08-1280-responsive.png`
9. `screenshots/09-1920-responsive.png`

The browser viewport override was reset after responsive evidence capture. The frontend and backend were left running for user acceptance.

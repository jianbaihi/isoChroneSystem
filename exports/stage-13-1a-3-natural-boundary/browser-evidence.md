# Stage 13.1A.3 Browser Evidence

## Real workflow

- URL: `http://127.0.0.1:5500/?elasticRegion=1&stage=13-1a-3`
- Center: 武汉·黄鹤楼
- Profile: 步行
- Thresholds: 10 / 20 / 30 分钟
- Upstream reachability: ORS real result, cache hit
- POI provider: 高德地图，中国大陆
- Source POIs: 4005
- Minute assignment: 4005 / 4005 completed at one-minute precision
- Natural v2 container: exclusive `ring-10-20`, 1914 POIs, 10 first-level categories

## Interaction evidence

The four modes coexist in one workspace: Bubble Baseline, Rectangular Elastic v0, Annular Elastic v1, and Natural Annular v2. Natural v2 was exercised through food focus at alpha 0.25, 0.50, and 1.00, return to 0, and medical focus at alpha 1.00. Focus changed area; hover remained visual-only. The Inspector, Mini Map, breadcrumb, and main canvas remained the existing single workspace.

Measured on the real 1440×900 page at food alpha 1.00:

- target / actual share: 30.87% / 30.87%
- mean / max area error: 0.000499% / 0.001544%
- gap / overlap: 0.004995% / 0%
- boundary crossings / self-intersecting regions: 0 / 0
- animation duration: 330.4 ms
- maximum frame: 16.7 ms
- dropped frames: 0
- warm start: true
- Provider interaction delta: 0

Return at alpha 0 measured 328.2 ms, maximum frame 18.6 ms, no dropped frame, no topology change, and no Provider interaction.

## Responsive evidence

At 1280×900, 1440×900, and 1920×900, the logical center, radii, target-share input, and full shared-boundary fingerprint were unchanged. Only view geometry and safe-area placement changed. See `responsive-audit.json`.

## Screenshots

1. `screenshots/01-annular-v1-overview.png`
2. `screenshots/02-natural-v2-overview.png`
3. `screenshots/03-natural-v2-food-alpha-025.png`
4. `screenshots/04-natural-v2-food-alpha-050.png`
5. `screenshots/05-natural-v2-food-alpha-100.png`
6. `screenshots/06-natural-v2-food-return.png`
7. `screenshots/07-natural-v2-medical-focus.png`
8. `screenshots/08-natural-v2-inspector-metrics.png`
9. `screenshots/09-natural-v2-full-workspace.png`

Final handoff state is Natural Annular v2, alpha 0, Inspector visible, Mini Map visible, and both local services remain running.

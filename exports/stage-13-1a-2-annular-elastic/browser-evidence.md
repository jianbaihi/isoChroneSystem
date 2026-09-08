# Stage 13.1A.2 Browser Evidence

## Scenario

- URL: `http://127.0.0.1:5500/?elasticRegion=1&stage=13-1a-2`
- Center: 武汉·黄鹤楼
- Profile: 步行
- Thresholds: 10 / 20 / 30 minutes
- Snapshot: real ORS/AMap workflow result, 3841 POIs in the final accepted run
- Algorithm input: exclusive `ring-10-20`, 1845 POIs, 10 L1 categories

## Acceptance path

1. Generated the walking 10/20/30 isochrones.
2. Queried POIs separately.
3. Completed the existing minute-level spatial assignment.
4. Entered the existing single Panmap workspace.
5. Compared Bubble Baseline, Rectangular Elastic v0, and Annular Elastic v1.
6. Focused category `050000` through alpha 0.25, 0.5, and 1.0.
7. Returned to alpha 0, then repeated direct polygon click 0→1→0.
8. Resized to 1280×720, 1440×900, and 1920×1080.

## Observations

- Annular mode rendered exactly 10 shared sectors around one visible fixed center.
- The mode used `ring-10-20`; it did not use cumulative 0–20 data.
- Focus share progressed `0.176437 → 0.211725 → 0.247012 → 0.317587`.
- All context sectors remained visible; the floor was 0.035.
- Animation durations stayed inside the required 260–320ms interval; the final direct run was 282.7ms with 18 frames, maximum frame time 17.6ms, and 0 dropped frames.
- Coverage was 1.0; gap, overlap, area error, order change, center displacement, and radius delta were all 0.
- Direct sector click produced alpha `0 → 1 → 0`.
- Pointer hover left the complete share fingerprint unchanged.
- All layout, focus, hover, return, and resize operations reported Provider calls 0.
- All three viewport sizes produced byte-identical share JSON and a main-canvas area ratio of 1.0.
- Visual inspection found the added third toolbar button overlapped the snapshot header at narrow widths; the toolbar was moved to its own overlay row and all screenshots were recaptured after the fix.

## Screenshot index

- `screenshots/01-bubble-baseline.png`
- `screenshots/02-rectangular-elastic-v0.png`
- `screenshots/03-annular-v1-overview.png`
- `screenshots/04-annular-v1-food-focus-025.png`
- `screenshots/05-annular-v1-food-focus-050.png`
- `screenshots/06-annular-v1-food-focus-100.png`
- `screenshots/07-annular-v1-return.png`
- `screenshots/08-annular-v1-full-workspace.png`

# Stage 13.1A Algorithm Notes

## Scope

This prototype solves one fixed convex parent container: the current real snapshot's exclusive 10–20 minute walking band. It maps the top ten level-one category clusters into a generic region-layout input. It does not solve multiple time containers, POI children, label pressure, LOD, natural envelopes, provider access, or persistence.

## Shared partition

For each fixed semantic anchor `p_i` and scalar power weight `w_i`, the cell is defined by:

```text
||x - p_i||² - w_i <= ||x - p_j||² - w_j
```

The implementation clips the parent polygon by every pairwise half-plane. All cells are derived from the same inequalities, so their edges are shared rather than independently generated category envelopes.

## Area solver

1. Normalize `baseWeight` to a base share.
2. Interpolate the focused target from the base share toward `min(0.45, baseShare × 1.8)` using `focusAlpha`.
3. Redistribute the remainder proportionally and enforce `minShare = 0.035`.
4. Build power cells and measure actual shares.
5. Increase a site's weight when its cell is below target and decrease it when above target.
6. Remove the common mean-weight drift, because adding the same scalar to all sites does not change a power diagram.

Frozen experiment parameters:

```text
focusExpansionFactor = 1.8
maxFocusShare = 0.45
minShare = 0.035
anchorStrength = 1.0 (sites remain at semantic anchors in v0)
solverStep = 0.5 cold / 0.12 warm maximum
solverIterations = 72 stable / 6 per animation frame
tolerance = 0.0025
animationDuration = 280ms
```

## Continuity

Each animation frame passes the previous `RegionLayoutResult` back as `previousState`. Site positions and power weights are reused; there is no random initialization. A cubic ease-in-out drives `focusAlpha`, and the final frame receives a stable 72-iteration solve. Returning uses the same path in reverse.

## Visual integration boundary

The developer-only `?elasticRegion=1` switch preserves `Bubble Baseline` and adds `Elastic Region v0`. Only the Panmap main canvas changes. Inspector, mini-map linkage, breadcrumb, snapshot, and Stage 13.0 state remain intact. Elastic category focus intentionally suppresses the POI label cloud in this stage.

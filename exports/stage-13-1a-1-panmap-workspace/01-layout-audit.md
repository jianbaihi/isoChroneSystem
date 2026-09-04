# Pre-refactor Panmap Layout Audit

## DOM ownership

- Main Panmap root: `#panmapMvp`, an absolute card inside `#mapSurface`.
- Main canvas: `.panmap-mvp-canvas`, inside `.panmap-mvp-workspace`.
- Inspector: `.panmap-mvp-inspector`, the second grid column inside `.panmap-mvp-workspace`.
- Traditional Mini Map: `#traditionalMapShell`, a sibling of `#panmapMvp` inside `#mapSurface`; it is absolute in Panmap mode.
- Breadcrumb: `.panmap-mvp-breadcrumb`, a flex row after `.panmap-mvp-workspace` inside the Panmap card.
- Bubble / Elastic switch: `.panmap-layout-switch`, a normal-flow child of `.panmap-mvp-header`.

## Normal-flow pressure

The Panmap card is a vertical flex container. Its 66px header and 48px breadcrumb remove height from the central workspace. Inside that remaining workspace, this rule creates a second column:

```css
.panmap-mvp-workspace {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 286px;
}
```

The Inspector therefore reduces the main canvas from 871px workspace width to 585px at the fixed 1440×900 acceptance viewport. The layout switch also increases header content pressure. The breadcrumb occupies its own 48px row.

The traditional map is already absolutely positioned, but it is not structurally presented as a workspace overlay and has no collapse control. Together with the large bordered `#panmapMvp` card, the page reads visually as a Panmap card plus a second map card rather than one primary workspace with supporting overlays.

## Refactor decision

Use `#mapSurface.panmap-workspace` as the one workspace owner. Keep the Elastic logical coordinate system at 860×560. Make the Panmap canvas fill the workspace and place Inspector, real traditional map, breadcrumb, snapshot meta, and developer toolbar as absolute overlays. No solver or Provider code is in scope.

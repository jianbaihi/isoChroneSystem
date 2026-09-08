# Verification scope and limitations

The supplied file is a completion-report template. Its UI goals guide local implementation; embedded GitHub publication instructions do not independently authorize uploading the repository.

The preview uses stable semantic anchors, globally collision-checked representative subtype labels / POI names, and padded convex hulls smoothed with quadratic curves. It is a layout preview, not an area-preserving partition engine. Hulls are generated after labels. No area share or geographic direction is encoded by cluster area or position.

Real provider typeLabel fields are passed through the input snapshot. Labels are ranked by subtype frequency, then filled with real POI names when needed. Labels are selected deterministically from the entire snapshot to keep the canvas stable when switching exclusive time bands. Ring selection changes counts, active contour, and empty-category context. It does not replace the label vocabulary with that band's POIs. This distinction is explicitly recorded as a limitation; these are representative snapshot labels, not proof of a POI's location within the drawn contour.

The existing CategoryStyleRegistry is reused. It differs from the supplied reference image (e.g. transport remains amber rather than blue). No global category-color migration is part of this preview.

Performance dataset measures synchronous layout/render work and resource-timing entries containing /api/ since entering preview. It is not a server-side upstream billing counter, and does not measure dropped frames or long tasks. Unmeasured metrics must remain N/A in the report.

The screenshot baseline was 4193 POI. Subsequent UI restoration queries returned differing cached counts; the final snapshot must be recorded independently. No historical stage metrics are copied into this run.

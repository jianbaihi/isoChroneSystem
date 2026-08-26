# Profile switch call graph before modification

`transport button click` → `switchActiveProfile(profile, label)` → lookup `PROFILE_RESULT_CACHE_KEYS` → synchronous `sessionStorage.getItem()` + `JSON.parse()` of the full Analysis/POI payload → when absent, `fetch(PROFILE_RESULT_ARCHIVE_PATHS[profile])` + response JSON parse → `analysisStore.setResult()` → all store subscribers → result cards, category tree, panmap summaries, map interaction state and possible `rebuildPanmapLayout()` → `analysisStore.setActiveProfile()` → possible second subscriber pass → `applyAnalysisResultToPanmap()` → panmap layer build/layout, time-layer focus and traditional map result publication.

POI invalidation in the subscriber also called `traditionalMapAdapter.setPois(null)`, replacing the GeoJSON source rather than hiding the POI layers.

## Defects

- `profile-switch eager-cache-hydration`: confirmed.
- `profile-switch store subscriber full render`: confirmed; the eager result publication changed the result identity and activated panmap-related subscribers.
- `profile-switch POI source rewrite`: confirmed, though it used one GeoJSON source update rather than 600 individual marker removals.
- `new reachability automatic focus`: confirmed in `applyAnalysisResultToPanmap()`, which selected the existing or largest time layer.

The switch itself made no ORS/POI/Matrix/minute request, but it could fetch a large local archive and synchronously parse full cached payloads.

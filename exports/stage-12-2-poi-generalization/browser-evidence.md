# Browser evidence

- Huanghelou walking 10/20/30: 284 POIs, cache hit, minute button became ready; no minute request was triggered.
- Huanghelou walking 7/13/18: 141 POIs, 27.40ms incremental map render.
- During the 7/13/18 POI request the map accepted zoom and ArrowRight keyboard pan input.
- Switching to cycling immediately disabled POI/minute actions and showed the stale parameter message.
- Huanghelou cycling 7/13/18: 600 POIs, 96.70ms incremental render, provider result disclosed as truncated.
- Toggling a POI category preserved the current reachability result, removed old POIs, disabled minute, and re-enabled POI query without another isochrone request.
- No `/name-clouds`, `/minute-accessibility`, or `/matrix-accessibility` request was present in the backend log for these POI clicks; `/api/v1/poi-query` was used.
- Precise current-location POI validation was not repeated because transmitting a real location to ORS requires action-time user confirmation. Search and map-pick center selection remain in the accepted Stage 12 baseline, but their Stage 12.2 POI end-to-end cases were not rerun in this bounded session.

Screenshots: `01-walking-poi.png`, `05-cycling-poi.png`.

# Test results

- Backend focused suite: 7 passed (`minute_isochrone_planner`, `minute_accessibility`, `spatial_time_accessibility`, `dynamic_online_workflow`).
- Frontend suite: 118 passed, 0 failed.
- Full backend discovery previously ran 126 cases: 125 passed; one import error is a pre-existing Stage 59 fixture reference to a missing ignored cache JSON, not a Stage 12 failure.
- Live Huanghelou flow: display isochrones, POI, minute classification, and exact cache repeat succeeded.
- Browser Hubei University and map-pick flows: passed with the limitations recorded in `browser-evidence.md`.

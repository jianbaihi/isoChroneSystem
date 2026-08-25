# Stage 12 live request ledger

| Case | Center source | Profile | Display ranges | Display isochrone | POI | Minute isochrones | Outcome |
|---|---|---|---|---:|---:|---:|---|
| Huanghelou bounded validation | preset | foot-walking | 5, 8, 12 | 1 | 1 | 2 | 72 POIs classified; complete |
| Huanghelou exact repeat | preset | foot-walking | 5, 8, 12 | 0 | 0 | 0 upstream / 2 cache | cache reuse confirmed |
| Hubei University browser flow | geocoder | foot-walking | 7, 13 | 1 | 1 | 2 requested by UI | display and POI completed; POI provider returned zero records |
| Map pick browser flow | map-pick | foot-walking | 7, 13 | 0 | 0 | 0 | center switch and stale-result guard confirmed |

Search geocoding used one bounded query for “湖北大学”. A prior accidental driving display request occurred before the profile was corrected to walking and is disclosed here as one additional isochrone request.

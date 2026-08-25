# Browser evidence

- Default load: center card and map marker show Wuhan Huanghelou at 30.5469 N, 114.2969 E.
- Geocoder: “湖北大学” returned live results; selecting the first result changed the center to 30.5797 N, 114.3234 E.
- Arbitrary ranges: 7 and 13 minutes rendered as independent threshold controls and map legend entries.
- Display generation: walking result reported that only Isochrones was requested; POI remained a separate enabled action.
- POI action: completed independently. This bounded Hubei University response contained zero POIs, so minute classification had no records to enrich.
- Map pick: clicking the map changed the source to “地图选点” at 114.323980 E, 30.579808 N and marked the prior result stale.
- Geolocation: implementation and automated contract coverage are present, but this browser control runtime exposes no geolocation permission/injection API; real permission acceptance remains manual.
- Button separation: “查询等时圈内 POI”, “按分钟补齐时间”, and “探索泛地图” are distinct controls with dependency gating.

Screenshots are in `screenshots/01-default-huanghelou.png` through `screenshots/05-map-pick.png` (number 04 is intentionally absent because geolocation injection was unsupported).

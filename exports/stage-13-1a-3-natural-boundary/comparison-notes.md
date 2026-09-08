# Annular v1 / Natural v2 Comparison

| Dimension | Annular Elastic v1 | Natural Annular v2 |
|---|---|---|
| Target shares | Existing water-fill share solver | Reuses the same solver unchanged |
| Partition boundary | Radial straight line | Deterministic smooth shared curve |
| Boundary ownership | Adjacent sector angles | One stored graph edge referenced by both adjacent regions |
| Region construction | Independent sector polygon from shared angles | Shared boundary polylines plus common inner/outer arcs |
| Area response | Exact angular share | Area-conserving curved basis; measured max error 0.0016% |
| Topology | Stable cyclic order | Stable cyclic order, crossing 0, self-intersection 0 |
| Continuity | Stateless geometry rebuild | Mandatory `previousBoundaryState` warm start |
| Locality evidence | Not applicable | Boundary movement reported by cyclic graph distance |
| Return evidence | Exact angular return | Exact topology return; geometry drift 0.000409 px |
| Visual character | Regular donut sectors | Organic, curved, shared-boundary regions |

Natural v2 changes only local Panmap layout. Center, annulus, category order, category styles, snapshot, POI data, minute results, and Provider/API behavior remain unchanged.

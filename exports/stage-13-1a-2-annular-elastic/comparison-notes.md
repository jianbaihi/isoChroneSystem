# Layout Comparison Notes

| Dimension | Bubble Baseline | Rectangular Elastic v0 | Annular Elastic v1 |
|---|---|---|---|
| Center semantics | Central anchor with surrounding bubbles | No geometric center constraint | Fixed visible empty center |
| Time semantics | Multiple visual radii | One rectangular container | One fixed inner/outer annulus |
| Spatial continuity | Separate category bubbles | Shared straight-edge cells | Shared radial and arc boundaries |
| Quantity expression | Bubble size | Cell area | Angular share equals area share |
| Focus animation | Existing state emphasis | Power-cell expansion/compression | Monotonic angular expansion/compression |
| Context retention | Non-focused bubbles stay present | Non-focused cells stay present | Every sector stays at or above minShare |
| Geographic direction | Not used for Annular experiment | Not used | Explicitly not encoded |
| Shape character | Bubble cluster | Rectangular partition | Centered annular partition |

These facts establish a new center-oriented baseline. They do not claim that Annular Elastic v1 is the final Panmap layout or that it is universally superior to the two retained baselines.

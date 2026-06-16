## Lessons

- After a user points back to a previously requested change, treat it as a correction signal and immediately implement the missing behavior before doing anything else.
- When changing chart export or clipping, re-check trend-line rendering rules separately; export/layout fixes must not silently alter whether the linear trend is clipped.
- When legend items drive chart visibility, verify the full chain together: on-screen plot, legend icon/state, tooltip content, persisted prefs, and exported image.
- For chart hover layers, never hide on per-segment `mouseleave` when moving across adjacent hit zones; hide only when leaving the whole SVG/plot area.
- When fixing deduplication, normalize display casing at the canonical label layer first; otherwise visually different case variants can still survive as duplicate entities.
- Keep historical filter/tag data for records and charts, but do not merge it back into the current summary UI when live metadata exists; stale UI rows cause misleading state.

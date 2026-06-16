## Lessons

- After a user points back to a previously requested change, treat it as a correction signal and immediately implement the missing behavior before doing anything else.
- When fixing deduplication, normalize display casing at the canonical label layer first; otherwise visually different case variants can still survive as duplicate entities.

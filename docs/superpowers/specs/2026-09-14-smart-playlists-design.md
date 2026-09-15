# Smart Playlists — Design Spec

**Date**: 2026-09-14
**Status**: Approved by Erich, ready for implementation planning
**Roadmap item**: #3 in `docs/application/roadmap.md` ("Rule-based smart playlists" — the biggest feature gap versus Nagi, see `docs/application/compared.md`)

## Purpose

Add rule-based smart playlists — pick a field, an operator, and a value (e.g. "genre is Rock", "play count > 5") — that auto-populate from the library instead of being hand-built track by track. They live alongside Que-Music's existing static, M3U-backed playlists as a second playlist type, not a replacement: Erich explicitly wants to keep hand-curating mood-based playlists by feel, and wants smart playlists as an addition to that workflow, not instead of it.

## Decisions locked in during brainstorming

- **Refresh timing**: "natural checkpoints," not live/continuous re-evaluation. A smart playlist's contents are recomputed when it's opened/selected in the UI, and after a library scan completes. Play-count ticks, favorite toggles, etc. do not trigger an immediate recompute — they show up the next time the playlist is opened.
- **Match logic**: per-playlist choice between "match ALL rules" (AND) and "match ANY rule" (OR). No nested rule groups in v1 — a flat list of rules combined one way.
- **Coexistence**: smart playlists are a new `type` alongside existing static playlists, both listed together in the Playlists nav section, visually distinguished (badge/icon). Static playlists' existing SQLite + M3U dual storage is untouched.
- **Snapshot feature** (added mid-brainstorm at Erich's request): any smart playlist can be "Saved as Static Playlist" — takes whatever tracks currently match, writes them into a real `playlist_tracks`-backed static playlist (+ M3U export, same as any other static playlist), completely independent from that point on. Editing the smart playlist's rules afterward does not affect the snapshot.
- **Field scope for v1**: artist, album, genre, year, play count, date added, favorite status (is / is not a favorite). Deliberately not exhaustive — YAGNI'd duration, last-played date, etc. out of v1 rather than building every conceivable field up front.

## Data model

### `playlists` table changes

Add two columns to the existing `playlists` table:

- `type TEXT NOT NULL DEFAULT 'static'` — `'static'` or `'smart'`.
- `match_mode TEXT` — `'all'` or `'any'`, only meaningful when `type = 'smart'`; `NULL` for static playlists.

Existing rows get `type = 'static'` via the same guarded-`ALTER TABLE` migration pattern already used for the lyrics columns (`migrateAddLyricsColumns()` in `server/database.js`) — try the `ALTER TABLE`, swallow the "duplicate column" error if it's already there.

### New `smart_playlist_rules` table

```sql
CREATE TABLE IF NOT EXISTS smart_playlist_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  playlist_id INTEGER NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
  field TEXT NOT NULL,      -- 'artist' | 'album' | 'genre' | 'year' | 'play_count' | 'date_added' | 'favorite'
  operator TEXT NOT NULL,   -- see operator table below
  value TEXT NOT NULL,      -- stored as text; cast per field type at query time
  sort_order INTEGER NOT NULL DEFAULT 0
);
```

One row per rule. `sort_order` controls display order in the rule builder UI (not evaluation order — order doesn't affect AND/OR result).

### Field → operator matrix

| Field type | Fields | Operators |
|---|---|---|
| Text | artist, album, genre | `is`, `is not`, `contains` |
| Number | year, play_count | `is`, `greater than`, `less than`, `between` |
| Date | date_added | `before`, `after`, `in the last N days` |
| Boolean | favorite | `is`, `is not` (value is `true`/`false`) |

`between` and `in the last N days` store two values or a day count in `value` as a delimited string (e.g. `"1990|1999"`, `"30"`) — kept simple rather than adding a second value column for the handful of operators that need it.

### Smart playlists have no rows in `playlist_tracks`

This is the core modeling decision: a smart playlist's membership is never stored. `playlist_tracks` continues to mean exactly what it means today — the static playlist join table. Smart playlist "contents" are always a computed query result, evaluated on demand at the refresh checkpoints above.

## Evaluation engine

New method, `MusicDatabase.getSmartPlaylistTracks(playlistId)` in `server/database.js`:

1. Load the playlist's `match_mode` and its ordered `smart_playlist_rules` rows.
2. Translate each rule into a parameterized SQL fragment against `tracks` (joined to `favorites` for the favorite field; `play_count` already lives on `tracks` per the existing schema).
3. Join the fragments with `AND` or `OR` per `match_mode`, build one `SELECT * FROM tracks WHERE (...)` query, run it with `better-sqlite3` prepared statements (parameterized — no string-concatenated values, matching the rest of `database.js`'s existing pattern).
4. Return the resulting track rows, same shape `getPlaylistTracks()` already returns for static playlists, so renderer code that consumes "a list of tracks for a playlist" doesn't need to know which type it's looking at.

No JS-side filtering of the full library — this is one SQL query per evaluation, same cost class as any other library query already in the app.

### Refresh checkpoints (where evaluation gets triggered)

- When a smart playlist is selected/opened in the UI (`playlist-renderer.js`'s existing playlist-open flow calls `getSmartPlaylistTracks()` instead of `getPlaylistTracks()` when `type === 'smart'`).
- After a library scan completes (main process scan-complete handler; no explicit action needed since evaluation already happens on next open — listed here for clarity, not as a separate code path to build).

## "Save as Static Playlist"

New IPC handler, `playlist:saveSmartAsStatic`, given a smart playlist id:

1. Run `getSmartPlaylistTracks()` to get the current match set.
2. Create a new `playlists` row with `type = 'static'`, a name the user provides in the save modal (pre-filled with the source's name, selected for easy overtyping), no `match_mode`.
3. Insert the matched tracks into `playlist_tracks` for the new playlist, in the order returned.
4. Trigger the existing M3U export path so the new static playlist gets a `.m3u` file like any other, per the current dual-storage pattern.
5. **Delete the source smart playlist** (`deletePlaylist()`), cascading its `smart_playlist_rules` rows via the FK.

**Revised 2026-09-15** (was: "creates a sibling, not a conversion in place" — reversed on explicit product decision): this is a **conversion**, not a snapshot. After saving, only the static copy exists; the smart playlist and its rule definitions are gone. There is no way to have both a live smart playlist and a frozen copy of its matches — if you want to keep the smart playlist auto-updating, don't use this action, or rebuild it from the same rules afterward.

## UI

- The existing "Create Playlist" modal (`playlist-renderer.js` / `client/pages/index.html`) gets a Static/Smart type toggle at the top. Smart mode swaps the body for a rule builder: repeating rows of field-select → operator-select → value-input, an "Add rule" button, and an All/Any radio for `match_mode`.
- Field selection drives which operators are offered (per the matrix above) and what kind of value input renders (text box for text fields, number input for numeric, date picker / "last N days" number input for date, is/is-not dropdown for favorite).
- Smart playlists appear in the same "Playlists" nav section and list as static ones (no separate nav item), with a small badge/icon distinguishing type — consistent with the sidebar icon work done earlier the same day (`docs/issues/issues_track.md`, 2026-09-14 entries) rather than introducing a new visual language.
- "Save as Static Playlist" is available as a right-click context menu action and/or a button inside the smart playlist's view.

## Error handling

- A rule with a field whose value doesn't parse for its type (e.g. non-numeric text in a `play_count` "greater than" rule) is rejected at save time in the rule builder UI, not silently coerced or run against the DB.
- Deleting a smart playlist cascades to its rules via `ON DELETE CASCADE` on `smart_playlist_rules.playlist_id` — no orphaned rule rows, mirroring the FK-integrity fix already made for `addTracks()` (Issue #33).
- An empty rule set (zero rules) is not a valid smart playlist — the rule builder UI blocks saving until at least one rule exists.
- **Added 2026-09-15**: a rule set that currently matches zero tracks is also blocked at save time (create and edit both), via a `playlist:preview-smart-rules` IPC preview call before the playlist is written. Rationale: a 0-match rule set is far more often a mistake (wrong genre spelling, a tag that doesn't actually exist in the library) than an intentional "will fill in later" playlist, and the cost of a wrong guess (silently creating a dead playlist with no feedback) outweighs the case where someone genuinely wants an empty-for-now smart playlist. The warning is "No tracks match these rules" and the rule builder modal stays open so the rules can be corrected and resubmitted, rather than round-tripping through a created-then-deleted playlist.

## Testing

- Schema migration: verify `ALTER TABLE playlists ADD COLUMN type/match_mode` runs clean on the existing dev DB snapshot (`sqlite-que-music` MCP server) and is idempotent on a second run.
- Evaluation engine: unit-style checks against the dev DB snapshot for each field/operator combination, plus one AND and one OR multi-rule playlist, confirming the SQL fragment logic returns the expected track set.
- Save-as-static: confirm the new static playlist's `playlist_tracks` rows and `.m3u` file match the smart playlist's evaluated set at the moment of saving, and confirm the source smart playlist and its `smart_playlist_rules` rows no longer exist afterward (conversion, not a snapshot — see revision above).
- Live UI pass: launch the app, build a smart playlist through the rule builder, confirm it lists real tracks, confirm a "Save as Static Playlist" action produces an independent playlist — per this project's established practice of launching and visually verifying UI work rather than reviewing the diff alone.

## Out of scope for this pass

- Nested rule groups (AND-of-ORs or similar) — flat rule list only.
- Fields beyond the seven listed above (duration, last-played date, file format, etc.).
- Live/continuous re-evaluation as the library changes in the background.
- Editing rules on an already-created smart playlist is in scope for the rule-builder UI (reopen the modal, same builder, pre-filled) but not a separate "quick edit" surface.

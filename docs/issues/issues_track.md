# Que-Music Issues Tracker

## Version History & Bug Fixes

### 5-Band Equalizer + Loudness Normalization Built - 2026-09-15

Roadmap item #4 (`docs/application/roadmap.md`). Full brainstorm → spec → implementation cycle. Spec: `docs/superpowers/specs/2026-09-15-equalizer-design.md` (an earlier same-day draft split normalization into a follow-up cycle — Erich reviewed and explicitly folded it into this build instead; that draft was replaced, not kept alongside).

#### What shipped ✅

- **Permanent audio graph**: `core-audio.js`'s Web Audio graph used to only exist while the visualizer had been toggled on at least once (`setupAudioContext()` was only ever called from `toggleVisualizer()`). Moved the call to `initAudioEngine()` so the graph — and the EQ/normalization stage riding on it — exists from app start. `toggleVisualizer()` no longer touches `audioContext` lifecycle at all, just the analyser-read/animation loop.
- **5-band EQ**: `MediaElementSource → normalization GainNode → 5 chained peaking BiquadFilterNodes (60/250/1k/4k/12k Hz, ±12dB) → AnalyserNode → destination`. `setBandGain()`, `applyPreset()`, `getEqualizerState()` on `CoreAudio`.
- **Presets**: fixed, hardcoded list (Flat/Rock/Pop/Bass Boost/Vocal) — no user-defined/saved custom presets in v1.
- **Loudness normalization (ReplayGain)**: scanner (`server/music-scanner.js`) reads embedded `REPLAYGAIN_TRACK_GAIN`/`REPLAYGAIN_ALBUM_GAIN` tags at scan time. Tracks with no tag get it computed lazily on first play (`computeReplayGain()` — an RMS-based approximation, not full ITU-R BS.1770 K-weighted LUFS, documented as such in code) and cached via a new `replaygain:update-track` IPC so it only ever computes once per track.
- **UI**: new `client/scripts/equalizer-ui.js` (mirrors `lyrics-ui.js`'s pattern) — a modal (not a popover, per Erich's explicit call) opened from a new EQ button on the player bar, with 5 vertical sliders, the preset dropdown, and a normalization on/off checkbox. Styles added to `client/styles/features/modals.css` alongside the existing lyrics-modal section.
- **Persistence**: one global settings object (`{ bands, activePreset, normalizationEnabled }`) via new `settings:get-equalizer`/`settings:set-equalizer` IPC, same generic file-backed store as `playerState`/`layoutPrefs`. Per-track ReplayGain values live on a new nullable `tracks.replaygain_gain` column (guarded `ALTER TABLE` migration, same pattern as `migrateAddLyricsColumns()`), folded into `addTracks()`'s upsert with `COALESCE` so a rescan that finds no tag doesn't clear a value already cached from a prior scan or the lazy-compute path.

#### Bug found and fixed during verification ✅ (pre-existing, unrelated to this feature)

- **`UNIQUE constraint failed: artists.name` on any upsert-triggered artist update**: `addTracks()` uses `INSERT ... ON CONFLICT(path) DO UPDATE`. The `update_artist_track_count_insert`/`update_artist_track_count_update` triggers used `INSERT OR IGNORE INTO artists (name) VALUES (NEW.artist)` to keep the `artists` table in sync. Discovered that when such a trigger fires as part of an upsert's `DO UPDATE` action (not a plain `UPDATE` statement), better-sqlite3/SQLite does **not** suppress the `OR IGNORE` conflict — it throws anyway, even though the identical trigger body works fine from a plain `UPDATE`. Reproduced in isolation with a two-column minimal schema, confirmed unrelated to any equalizer code (no ReplayGain columns involved at all) — this would have broken on *any* rescan of an existing track whose artist doesn't change, i.e. most real rescans. Fixed by rewriting both triggers to use `INSERT INTO artists (name) SELECT NEW.artist WHERE NOT EXISTS (...)` instead of `OR IGNORE`, which sidesteps conflict-resolution entirely. Existing on-disk DBs healed via a new `migrateFixArtistUpsertTriggers()` (`DROP TRIGGER` + recreate), same guarded-migration pattern as the others, runs on every launch.

#### Verification

No test framework in this repo — verified via new `scripts/dev-verify/equalizer-replaygain.js` (same standalone-script-through-Electron's-bundled-Node pattern as `smart-playlists.js`), covering: schema, tag-based value stored on insert, `COALESCE` preserving a cached value across a tag-less rescan, a new tag value overwriting an old one, the lazy-compute persistence path, and a rescan preserving a lazily-computed value. Also re-ran `scripts/dev-verify/smart-playlists.js` after the trigger fix to confirm no regression there. All passing. **Not yet done**: a live Electron launch/click-through of the EQ modal and audible normalization check — flagged as open below.

#### Open for next session

- Live Electron smoke test of the actual UI (open modal, drag sliders, switch presets, toggle normalization, relaunch and confirm persistence, confirm the visualizer still works with the now-permanent graph) — not yet performed.
- Not committed to git yet.

### Rule-Based Smart Playlists Built - 2026-09-14

Roadmap item #3 (`docs/application/roadmap.md`), the biggest feature gap versus Nagi per `docs/application/compared.md`. Full brainstorm → spec → plan → implementation cycle on branch `feature/smart-playlists` (not yet merged to master). Spec: `docs/superpowers/specs/2026-09-14-smart-playlists-design.md`. Plan: `docs/superpowers/plans/2026-09-14-smart-playlists.md`.

#### What shipped ✅

- **Schema**: `playlists.type` (`'static'`/`'smart'`) and `playlists.match_mode` (`'all'`/`'any'`), plus a new `smart_playlist_rules` table (field/operator/value/sort_order), guarded-migration pattern matching `migrateAddLyricsColumns()`.
- **Evaluation engine** (`server/database.js`): `getSmartPlaylistTracks()` translates a playlist's rules into one parameterized SQL query (AND/OR per `match_mode`) against `tracks` — no in-app filtering. Fields: artist/album/genre/year/play_count/date_added/favorite. `getPlaylistById()` branches on `type` so every existing renderer read path (`selectPlaylist`, `loadPlaylistInRightPane`, etc.) works unchanged for both playlist types.
- **"Save as Static Playlist"**: snapshots a smart playlist's current matches into a real, independent static playlist. Originally auto-named `"<source> (Snapshot)"`; changed same day (see below) to prompt via the same Create Playlist modal, pre-filled and pre-selected with the source name, per Erich's explicit request.
- **Rule builder UI**: Static/Smart type toggle on the Create/Edit Playlist modal; Smart mode shows a match-mode selector and repeating field/operator/value rows (`client/pages/index.html`, `client/scripts/playlist-renderer.js`). Smart playlists show a ✦ badge in both playlist list views (sidebar list and dual-pane browser).
- **M3U export made automatic app-wide** (expanded scope, approved live): every playlist — static, hand-built, or a smart-playlist snapshot — now auto-exports to `.m3u` on every track add/remove/reorder (`_autoExportM3U()`), so a file always exists in the Playlists folder without a manual click. The old "Export to M3U" context menu item was removed (Save as Static covers the smart-playlist case; auto-export covers everything else).

#### Bugs found and fixed during live testing ✅

- **Rule builder inputs unreadable**: `.smart-rule-field`/`.smart-rule-operator`/`.smart-rule-value` were missing the `.form-input` class, rendering as unstyled white boxes with invisible dark-on-white text.
- **Case-sensitive genre matching**: text field `is`/`is not` used SQLite's default case-sensitive `=`; typing "classical" didn't match a track tagged "Classical". Now uses `COLLATE NOCASE` for text fields (artist/album/genre); numeric/date fields keep exact comparison.
- **Generic save-error messages**: both the create/edit modal and `updatePlaylist()` showed a flat "Failed to save playlist" instead of the real reason. `updatePlaylist()` didn't wrap `UNIQUE constraint failed` into a friendly message the way `createPlaylist()` already did (leaked a raw SQLite error to Erich when he renamed a playlist to an existing name) — now consistent. The renderer's catch block now shows `error.message` instead of a hardcoded string.
- **`exportPlaylistToM3U()` was completely broken**: missing `await` on the async `getPlaylistById()` call (so `playlist` was a pending Promise, and `playlist.name.replace(...)` threw a TypeError on every successful-tracks path), *and* its track query joined `playlist_tracks.track_id`, a column `addTrackToPlaylist()` never populates (only `track_path` is written) — the join always returned zero rows. Both fixed; this bug predated smart playlists entirely and would have silently broken the new auto-export feature if not caught.
- **Deleted playlists resurrected on next app launch**: `setPlaylistFolder()` runs `importExistingM3UFiles()` on every startup, re-importing any `.m3u` file found in the Playlists folder. `deletePlaylist()` never removed its own file, so once auto-export started writing one for every playlist, deleting a playlist left a ghost file that came back as a "new" playlist on the next launch. `deletePlaylist()` now unlinks the matching `.m3u` file (best-effort, same filename pattern the export uses). One already-orphaned file (`test (Snapshot).m3u`) manually cleaned up from Erich's real Playlists folder.

#### Verification

No test framework in this repo — verified via `scripts/dev-verify/smart-playlists.js`, a standalone script run through Electron's bundled Node (`ELECTRON_RUN_AS_NODE=1 ./node_modules/.bin/electron.cmd scripts/dev-verify/smart-playlists.js`, since `better-sqlite3` is compiled against Electron's ABI, not system Node) against an in-memory database. Covers schema, AND/OR evaluation per field/operator, `getPlaylistById`/`getAllPlaylists` branching, save-as-static (including snapshot independence from later rule edits), auto-export, delete cleanup, and the two error-message fixes. All passing as of the last commit on the branch. Also live-tested by Erich against his real ~5000-track library: created multiple smart playlists (genre/year rules), confirmed track counts, badge display, save-as-static with custom naming, and playlist deletion no longer resurrecting.

#### Open for next session

- Branch `feature/smart-playlists` not yet merged to master — no `finishing-a-development-branch` pass run yet.
- UX question: a lone `year is X` rule matches every genre tagged that year (correct per the engine, but produced a mixed-genre result Erich wasn't happy with on a live test with "is 1960"). Decide whether the rule builder needs guidance/guardrails here, or whether this is just "add a second rule" user education.

### Sidebar Nav Icon Overhaul + Per-Icon Accent Colors - 2026-09-14

Erich flagged the collapsible sidebar nav icons as unintuitive ("those circles don't tell the user anything") and, separately, flat/monochrome with no visual polish.

#### Changes ✅

- **Fixed real duplicate-icon bugs**: Discover and Now Playing were both rendering the exact same circle+play-triangle SVG; Music Library and Playlists were both rendering the exact same music-note SVG. Not just a style complaint — two pairs of nav items were visually identical.
- **Replaced 6 of 8 sidebar nav icons** in `client/pages/index.html` (sidebar toggle, Music Library, Recently Played, Discover, Now Playing, Playlists, Database Manager) after several rounds of live feedback — landed on: hamburger (toggle), 2x2 grid (Library), rewind/skip-back (Recently Played), 4-point sparkle (Discover), audio bars (Now Playing), stacked list with bullets (Playlists), server rack (Database Manager). Change Music Folder's existing folder-outline icon and Favorites' star were kept, just recolored. No icon on the rail is circle-based anymore.
- **Added per-icon accent colors** (`client/styles/layout/sidebar.css`): each nav SVG got a `.nav-icon-*` class with its own `color` (Library blue, Favorites gold + filled solid star, Recently Played teal, Discover purple, Now Playing green, Playlists pink, Change Music Folder amber, Database cyan), dimmed slightly at rest and full-strength on hover. The active item's existing solid-background/white-icon treatment (`.nav-item.active`) is left as the override so the active row still reads as one clean block instead of clashing with its accent color.
- **Real bug caught mid-session**: the first color pass appeared to do nothing — because `client/pages/index.html` links `styles/bundled.css`, a pre-built concatenation of all the `styles/**/*.css` source files, and neither `npm start` nor `npm run dev` regenerates it automatically (only `npm run dist`/`dist-win` do, via `build-css.js`). Edited `sidebar.css` sat there inert until `node build-css.js` was run by hand to rebuild the bundle. See the CLAUDE.md note added alongside this entry — **any styles/ edit needs `node build-css.js` before it'll show up in a plain `npm start` session.**
- **Files Modified**: `client/pages/index.html`, `client/styles/layout/sidebar.css`, `CLAUDE.md` (dev workflow note)
- Confirmed live by Erich after the bundle rebuild + full app restart ("now you've got color, I like it").

**Follow-up same day — header icons (search, theme toggle, help, settings).** Same treatment applied to the 4 header icon buttons in `client/pages/index.html` / `client/styles/layout/header.css`: gave search/sun/moon/help/settings each a `.header-icon-*` accent color (blue, amber, indigo, teal, violet). Also fixed two real icon bugs found along the way — the Settings gear was a broken 6-spoke asterisk with no actual gear teeth (replaced with the standard Feather cog path), and the Help icon was an abstract curved-line "?" attempt inside a circle that Erich flagged twice as unreadable ("I don't know what the other one is") — replaced with a literal bold `?` glyph and, per Erich's explicit call, no circle around it at all. Confirmed live ("they're good, we'll keep them").

### Up Next Queue Drop Position Fixed - 2026-09-14

Live-usage bug found by Erich: dragging a track from the folder view onto the Up Next pane always appended it to the bottom of the queue, ignoring where it was actually dropped.

#### Changes ✅

- **Root cause**: `CoreAudio.addToQueue()` always did `this.queue.push(trackObject)`. The pane's drop handler (`setupQueuePaneDropTarget()` in `ui-controller.js`) had no concept of drop position at all — it just called `addToQueue()` per dropped track.
- **`addToQueue(trackOrPath, index = this.queue.length)`**: now accepts an optional insert index and does `this.queue.splice(clampedIndex, 0, trackObject)` instead of `push()`. Existing callers (context menu "Add to Queue", etc.) are unaffected since they don't pass an index and it still defaults to the end.
- **`UIController.getQueueDropIndex(clientY)`**: new helper — walks the rendered `.queue-track-item` rows, compares the drop's `clientY` against each row's vertical midpoint via `getBoundingClientRect()`, and returns the `data-queue-index` to insert before (queue length if dropped below the last row). The pane's drop handler now computes this once per drop and passes an incrementing index into `addToQueue()` for each dropped track, so multi-track drops land in order starting at the drop point.
- **Files Modified**: `client/scripts/core-audio.js`, `client/scripts/ui-controller.js`
- Confirmed fixed by Erich via live drag-and-drop test after the change ("works like a charm").

### Schema: Lyrics Columns Added - 2026-09-13

First concrete step of the lyrics feature (design decided earlier the same day, see `docs/application/lyrics-feature.md`): the storage shape, no fetch/display logic yet.

#### Changes ✅

**Added `tracks.lyrics`, `tracks.lyrics_source`, `tracks.lyrics_fetched_at`**
- **Description**: Three new nullable columns on `tracks` — plain-text lyrics, where they came from (`'embedded'` | `'lrclib'`), and when last checked. No separate table; 1:1 with a track, same pattern as existing metadata columns.
- **Live schema**: Added to the `CREATE TABLE IF NOT EXISTS tracks (...)` block in `server/database.js` (covers fresh installs).
- **Existing DB migration**: Added `migrateAddLyricsColumns()` in `server/database.js`, called from the constructor right after `initializeCompleteSchema()`. Uses the same guarded-`ALTER TABLE` pattern as `main.js`'s `performPlaylistMigration()` (Issue #19) — tries the `ALTER TABLE ADD COLUMN`, swallows the expected "duplicate column name" error if it's already there. Safe to run on every launch.
- **Doc sync**: `docs/application/database-schema.sql` updated with the same three columns so it doesn't drift from the live schema (the exact drift Issue #28 cleaned up last time).
- **Files Modified**: `server/database.js`, `docs/application/database-schema.sql`, `docs/application/lyrics-feature.md`

**Embedded-lyrics check wired into the scanner**
- **Description**: `MusicScanner.extractMetadata()` now reads embedded lyrics alongside the metadata it already pulls per file — `music-metadata`'s `common.lyrics[0]` (covers FLAC/OGG/MP4's Vorbis `LYRICS` comment) with `node-id3`'s `unsynchronisedLyrics.text` (MP3's `USLT` frame) as the MP3-specific fallback. Zero network cost, runs during the scan that already happens.
- **Behavior**: Only sets `lyrics_source`/`lyrics_fetched_at` when lyrics are actually found. A miss is left unmarked (all three columns stay NULL) rather than recorded as "checked" — the still-unbuilt on-demand LRCLIB fetch is what gets to decide a track has no lyrics anywhere, once it exists.
- **Wired through**: `MusicDatabase.addTracks()`'s INSERT now includes `lyrics`/`lyrics_source`/`lyrics_fetched_at` so scanned values actually land in the DB.
- **Not done here**: the LRCLIB fallback fetch and the lyrics modal UI are still open (roadmap priority #3).
- **Files Modified**: `server/music-scanner.js`, `server/database.js`

**Issue #33: `addTracks()` used `INSERT OR REPLACE`, which orphaned FK rows and reset stats on every rescan — CRITICAL (found while wiring up lyrics, fixed same session)**
- **Description**: `INSERT OR REPLACE INTO tracks` deletes and reinserts the whole row on a `path` conflict. For an `INTEGER PRIMARY KEY AUTOINCREMENT` table that means the reinserted row gets a **new** id — every rescan of an already-scanned file silently orphaned that track's `favorites`, `playlist_tracks`, and `recently_played` rows (all keyed on the old `tracks.id`), and reset `play_count`/`last_played`/`date_added`/`created_at` to defaults since those columns aren't in the INSERT's column list.
- **Impact**: A track's favorite status, playlist memberships, play history, and now lyrics would all quietly vanish the next time its folder got rescanned — with no error, since `INSERT OR REPLACE` succeeds either way.
- **Solution**: Rewrote `addTracks()`'s statement as a real upsert — `INSERT INTO tracks (...) ... ON CONFLICT(path) DO UPDATE SET ...`. On conflict, `id`/`play_count`/`last_played`/`date_added`/`created_at` are left untouched (not in the UPDATE SET list) while file-derived metadata (`title`/`artist`/`album`/etc.) refreshes normally. `lyrics`/`lyrics_source`/`lyrics_fetched_at` use `COALESCE(excluded.x, tracks.x)` so a rescan that finds no embedded lyrics this time doesn't erase lyrics already cached from an earlier embedded read or a future LRCLIB fetch.
- **Files Modified**: `server/database.js`

**LRCLIB on-demand fetch + lyrics modal UI**
- **Description**: Built the remaining two pieces of the lyrics feature — the on-demand LRCLIB fetch fallback and the display modal.
- **Fetch**: `server/lyrics-fetcher.js` — `fetchLyricsFromLRCLIB()` tries LRCLIB's `/get` (exact match on title/artist/album/duration), falls back to `/search` if that misses, returns plain lyrics text or `null`. Instrumental tracks (LRCLIB's `instrumental` flag) count as a real answer, not a miss.
- **Caching/IPC**: `main.js`'s `lyrics:get-for-track` handler serves DB-cached lyrics (embedded or a prior LRCLIB hit) with no network call; if `lyrics_fetched_at` is already set with no lyrics, trusts that "checked, nothing anywhere" answer instead of re-fetching; otherwise fetches from LRCLIB and caches the result via `MusicDatabase.updateTrackLyrics()` (hit or miss, always stamps `lyrics_fetched_at`). Exposed as `window.queMusicAPI.lyrics.getForTrack()` in `main-preload.js`.
- **UI**: `client/scripts/lyrics-ui.js` (`LyricsUI`, same open/close pattern as `CoverFetcherUI`) + a lyrics button in the player bar next to the favorite button. Modal shows loading/found/not-found/error states; per the locked design decision, it's positioned toward the left of the screen with the current track's album art faded/blurred behind the text.
- **Files Modified**: `main.js`, `server/database.js`, `client/scripts/main-preload.js`, `client/pages/index.html`, `client/styles/features/modals.css`
- **Files Added**: `server/lyrics-fetcher.js`, `client/scripts/lyrics-ui.js`

### Four-Column Resizable Layout - 2026-09-13

Full build of `docs/application/layout-redesign.md`, all four pieces: collapsible nav rail, two pane splitters, and the new persistent playlist column.

#### Changes ✅

- **Collapsible nav rail**: hamburger toggle button (`#sidebarToggle`) added above the nav. Every nav item's label text wrapped in `<span class="nav-label">` (and given a `title` attribute) so `.sidebar.collapsed` can hide labels via CSS while keeping icons, click targets, and hover tooltips. State persists across sessions.
- **Two new drag handles**: `#sidebarResizer` (nav rail ↔ folder tree) and a repurposed `#dualPaneResizer` (folder tree ↔ file list), plus a new `#activePlaylistResizer` (file list ↔ playlist pane). `.app-main` and `.dual-pane-layout` are now 3- and 5-column CSS grids respectively (pane, 6px handle, pane, ...), driven by `--sidebar-width`, `--dual-pane-left-width`, `--active-playlist-width` custom properties that `client/scripts/layout-resizer.js` sets on drag.
- **4th column — persistent active playlist pane** (`#activePlaylistPane`): always visible, not a separate view. `PlaylistRenderer.renderActivePlaylistPane()` renders whatever `currentPlaylistData` is open (hooked into `selectPlaylist()`, the delete-playlist path, and `updatePlaylistTrackCount()`). It's a live drop target via `setupActivePlaylistPaneDropTarget()`, reusing the existing `application/x-que-track-paths` drag payload and `addTrackPathsToPlaylist()` — no new drag-and-drop implementation, per the spec.
- **Persistence**: new generic `settings:get-layout`/`settings:set-layout` IPC pair in `main.js`, using the same `getSetting`/`saveSetting` key-value store already backing `playerState`/`logLevel` — no second persistence mechanism invented.
- **Responsive fallback**: below 1200px the playlist pane and its resizer drop off (not enough room for four honest columns); below 1024px panes stack vertically and all resizers hide; below 768px the sidebar reverts to its existing mobile overlay behavior. All untouched from before this change.
- **Files Modified**: `client/pages/index.html`, `client/styles/layout/grid.css`, `client/styles/layout/sidebar.css`, `client/styles/features/player.css`, `client/scripts/playlist-renderer.js`, `main.js`, `client/scripts/main-preload.js`
- **Files Added**: `client/scripts/layout-resizer.js`
- **Not done here**: min/max widths per pane are first-pass guesses, flagged in the spec as needing Erich's eye once it's running live; whether the playlist pane should default to "now playing queue" instead of "last opened playlist" is also still an open call per the spec — currently defaults to whatever playlist was last opened, same as before.

**Bug found and fixed while verifying against a live launch**: collapsing the sidebar blanked the entire content area — folder tree, file list, and playlist pane all vanished. Root cause: `.app-main.sidebar-collapsed #sidebarResizer { display: none; }` removed the resizer from CSS Grid auto-placement entirely (a `display:none` grid item doesn't consume a track), so `.content-area` shifted into the resizer's now-vacant 0px track instead of the `1fr` track — collapsing the sidebar didn't just hide a divider, it broke where the real content rendered. Fixed by using `visibility: hidden` instead, which keeps the item's grid slot reserved while making it invisible and non-interactive. Caught by actually launching the app and screenshotting both states, not just reading the diff — screenshots showed a real, reproducible blank screen that reading the CSS wouldn't have surfaced. Confirmed fixed via fresh launch (sidebar loads pre-collapsed from persisted prefs, full 4-column content visible) and a manual expand/collapse round-trip.

### Real Playback Queue - 2026-09-13

Roadmap priority #1 (`docs/application/roadmap.md`): separate the "up next" queue from the loaded playlist. Previously `addToQueue()` just pushed onto `this.playlist` — there was no real queue at all, despite a "Now Playing" view and context-menu "Add to Queue" item implying one existed.

#### Changes ✅

**New `CoreAudio.queue`, independent of `this.playlist`**
- `addToQueue(trackOrPath)` now pushes onto a dedicated `this.queue` array instead of the loaded playlist. Accepts either a bare path or a full track object (context menu now passes the full object, so queued entries carry real title/artist/album instead of just a filename).
- Added `removeFromQueue(index)`, `reorderQueue(fromIndex, toIndex)`, `clearQueue()`, `getQueue()`.
- `nextTrack()` now drains the queue first (shift + play, no effect on `playlist`/`currentTrackIndex`) before falling back to normal playlist advancement.
- **Bug found and fixed in the same pass**: `handleTrackEnd()` only auto-advanced when `this.playlist.length > 1` — a queued track would never play automatically at the end of a single-track playlist or empty playlist. Condition now also checks `this.queue.length > 0`.
- **UI**: The "Now Playing" view's left pane now renders a real "Up Next" section from `coreAudio.getQueue()` — remove buttons, drag-to-reorder, a Clear button — separate from the right pane, which is now honestly labeled "Playlist" instead of the old mislabeled "Queue" (it was always just the loaded playlist).
- **Files Modified**: `client/scripts/core-audio.js`, `client/scripts/ui-controller.js`

### Live-Usage Fixes: Missing Folders & Playlist Drag-and-Drop - 2026-09-12

Reported directly from actual use: "folders are missing" after opening the app, and no way to drag songs onto a playlist. Root-caused both, fixed both, plus a full dead-code sweep of `library-manager.js` triggered by tracing the first bug (its wrong-function trail kept leading to abandoned earlier rewrites of the same features).

#### Issues Fixed ✅

**Issue #30: Selecting/changing music folder destroyed the entire dual-pane UI ("missing folders") — CRITICAL**
- **Description**: Picking or re-selecting a music folder (when the DB already had tracks) replaced `#mainContent`'s entire innerHTML with an old, incompatible single-panel layout. `#mainContent` is the parent of *both* `#welcomeScreen` and `#dualPaneLayout` (which contains `#leftPaneContent`/`#rightPaneContent`) — so this wiped out the folder tree, and every subsequent view switch/search/playlist action silently failed because their target elements no longer existed, until a full app reload.
- **Root Cause**: `loadMusicLibrary()` called the old `createFolderBrowser()`, which rendered into `#mainContent` directly. A monkey-patch (`window.protectDOMFromDestruction()`) had been written specifically to intercept this and redirect to the safe dual-pane renderer instead — but it ran at module-load time, *before* `window.app` existed, so its own guard clause made it silently no-op every single time. Dead safety net, live footgun.
- **Solution**: Made `loadMusicLibrary()` delegate directly to `loadMusicLibraryStructure()` — the same safe, dual-pane-aware renderer normal app startup already uses. Deleted the now-fully-dead `createFolderBrowser()`, `renderFolderTree()`, `setupInitialSongEvents()`, and the inert `protectDOMFromDestruction()` monkey-patch and its call site.
- **Files Modified**: `client/scripts/library-manager.js`, `client/scripts/main-app.js`

**Issue #31: No way to drag songs onto a playlist to add them**
- **Description**: The only way to add a track to a playlist was right-click → Add to Playlist. Dragging a song from a folder or search results onto a playlist did nothing.
- **Solution**: Built it end to end:
  - Song cards in the folder view and search results are now `draggable="true"` and carry the dragged path(s) via a custom `application/x-que-track-paths` payload (supports dragging a multi-selection at once from the folder view).
  - Playlist cards in the "All Playlists" browser are drop targets — dropping a song there adds it via a new shared `PlaylistRenderer.addTrackPathsToPlaylist()` (resolves each path to a DB id, reports a success/duplicate/failed summary, same as the existing context-menu add flow).
  - Dropping directly into an **open** playlist's track list now also works, and lands the song at the exact drop position (not just appended) — extended the Issue #23 reorder drop handler to recognize external drags and call a new `addTrackPathsToPlaylistAtPosition()`. An empty playlist gets its own drop zone since it has no rows to drop onto.
  - Added a **"Add All to Playlist"** button next to "Play All" in the folder view — opens a small playlist picker and bulk-adds every currently-shown song.
- **Files Modified**: `client/scripts/library-manager.js`, `client/scripts/playlist-renderer.js`, `client/scripts/ui-controller.js`, `client/styles/components/cards.css`, `client/styles/components/states.css`, `client/styles/features/search.css`

**Issue #32: Two more live HTML-injection gaps in the actual active code paths (Issue #25 follow-up)**
- **Description**: Last night's escaping fix (Issue #25) patched `renderSongList`/`renderArtistsView`/`renderAlbumsView`/`renderSearchResults` — which, as discovered while tracing Issue #30, turned out to be **dead code**; the app was never calling them. The real, live song-list renderer (`generateTrackListWithSelection`/`generateChunkedTrackList`/`loadMoreTracks`, feeding the folder view) and the real live artist/album grid (`UIController.loadArtistsInLeftPane`/`loadAlbumsInLeftPane`) had the *same* unescaped `data-path`/`data-artist`/`data-album` attribute injection risk, untouched.
- **Solution**: Escaped `data-path` (and the checkbox's `data-track-path`) in all three live song-list templates, added `draggable="true"` to them, and escaped `data-artist`/`data-album` in the live artist/album card templates in `ui-controller.js`.
- **Files Modified**: `client/scripts/library-manager.js`, `client/scripts/ui-controller.js`

#### Dead Code Removed ✅ (found while tracing Issues #30/#32)

`library-manager.js` had accumulated multiple complete, abandoned rewrites of the same features (folder browsing, song lists, artist/album views) sitting alongside the current dual-pane implementation, reachable by nothing. Traced every one with a full call-site check (a small script scanning every method name against every call across `client/scripts/` and `index.html`) before removing:
- Old single-panel folder browser: `createFolderBrowser`, `renderFolderTree`, `setupInitialSongEvents` (Issue #30, above)
- A second, parallel dead folder-view generation: `setupFolderEvents`, `toggleFolder`, `loadSongsFromFolder`, `renderSongList`, `renderEnhancedSongList`
- A third dead song-list renderer targeting a `.track-card-right` class that no rendered element ever actually had: `generateSongListForRightPane`, `setupRightPaneSongEvents`, `setupSongCardEvents`
- A fully dead artist/album subsystem superseded by `UIController`'s dual-pane version: `loadArtistsView`, `loadAlbumsView`, `renderArtistsView`, `renderAlbumsView`, `setupArtistsViewEvents`, `setupAlbumsViewEvents`, `showArtistTracks`, `showAlbumTracks`, `playArtist`, `playAlbum`
- A duplicate `extractSongDataFromRightPaneCard` (existed identically in both `library-manager.js` and `ui-controller.js`, called from neither)
- `client/scripts/help-manager-simple.js` and `client/styles/legacy/folder-browser.old` (confirmed dead — see 2026-09-11 entry)

**Not touched**: a handful of additional zero-caller methods turned up in `ui-controller.js`, `main-app.js`, `playlist-renderer.js`, and `core-audio.js` (`showSinglePaneView`, `showDiscoverView`, `clearAlbumArtCache`, `debugSettingsModal`, `forceShowSettingsModal`, `handleError`, `onMusicFolderChanged`, `checkPlaylistBackupStatus`, `showPlaylistFolder`, `updateViewHeader`, `debugModalStructure`, `testShowModal`, `toggleCurrentTrackFavorite`, `loadTrackWithFavoriteUpdate`, `enhancePlaySongForTracking`, `onTrackMetadataLoaded`, `cleanupFavoritesTracking`, `isCurrentTrackFavorite`, `getCurrentTrackStats`, plus `debugDOMElements`/`loadFolderBrowserInLeftPane` in `library-manager.js`). These weren't traced as deeply as the `library-manager.js` cluster (no evidence yet they're tangled up with a live bug) — flagging them here rather than deleting on a static scan alone. Worth a dedicated pass.

### Full Codebase Audit & Cleanup - 2026-09-11

Read every line of the app (main process, renderer, database layer) front to back. Ten real defects found and fixed, plus a full repo reorganization (this tracker included) and dependency cleanup. Two more turned up mid-fix and were fixed the same pass.

#### Issues Fixed ✅

**Issue #19: Incomplete sqlite3 → better-sqlite3 migration in main.js (CRITICAL)**
- **Description**: Several IPC handlers in `main.js` still called the old callback-based sqlite3 API (`musicDB.db.run/get/all/serialize` with a callback) against the `better-sqlite3` instance, which has no such methods.
- **Affected**: `database-cleanup-orphaned-playlists`, `debug:playlist-tables`, `api:debug:playlist-tracks`, `api:cleanup:orphaned-playlist-tracks`, `performPlaylistMigration()` behind `database-migrate-playlists`.
- **Impact**: Every one of these threw a `TypeError` immediately when invoked from the renderer.
- **Solution**: Rewrote all of them to `.db.prepare(sql).run/get/all(params)`, and switched their JOINs from the legacy `track_id` column to `track_path` (the column the app has actually keyed playlist_tracks on since Issue #17). `performPlaylistMigration()` now uses a real `better-sqlite3` transaction and treats "column already exists" as expected rather than fatal.
- **Files Modified**: `main.js`

**Issue #20: Audio event-listener leak causes runaway track-skipping (CRITICAL)**
- **Description**: `cleanup()` tried to remove listeners via `this.endedHandler`/`loadedMetadataHandler`/etc., but those references were never assigned — the real listeners in `setupAudioEvents()` were anonymous functions, so removal was a no-op. `performPeriodicCleanup()` fired every 10 tracks and called `cleanupStaleEventListeners()` → `setupAudioEvents()` again without removing the old set, stacking duplicate listeners.
- **Impact**: After ~20 tracks in one session, `'ended'` fired multiple times per track — tracks skipped ahead unpredictably, duplicate recently-played/notification entries.
- **Solution**: `setupAudioEvents()` now stores every handler on `this` and calls a new `teardownAudioEvents()` at its own start (self-guarding against double-registration) and from `cleanup()`. Deleted `cleanupStaleEventListeners()` entirely — there is no longer any reason to re-run `setupAudioEvents()` periodically.
- **Files Modified**: `client/scripts/core-audio.js`

**Issue #21: Several UI actions called methods that don't exist**
- `ui-controller.js` — right-click "Play Track" on a playlist track called `coreAudio.loadTrack(trackData)` (an object, not a path string) then `coreAudio.playTrack()`, which never existed. Now calls `coreAudio.playSong(trackData.path, false)`, the real API.
- `ui-controller.js` `returnToPreviousContext` called `libraryManager.loadFolder(...)`, which never existed. Now calls the real method, `loadSongsFromFolderForRightPane(...)`.
- `core-audio.js` — `restartVisualizer`, `debugVisualizerStatus`, `testVisualizerWithCurrentAudio` were called (Ctrl+Shift+V/Ctrl+V shortcuts, `window.debugVisualizer()`/`window.testVisualizer()` dev helpers) but never defined. Implemented all three for real: `restartVisualizer()` tears the visualizer down and brings it back up; `debugVisualizerStatus()` returns a full state snapshot; `testVisualizerWithCurrentAudio()` forces the visualizer on and reports whether the analyser is actually seeing audio data.
- **Files Modified**: `client/scripts/ui-controller.js`, `client/scripts/core-audio.js`

**Issue #22: Duplicate `removeTrackFromCurrentPlaylist` silently shadowed the working version**
- **Description**: `playlist-renderer.js` defined `removeTrackFromCurrentPlaylist` twice — `(trackIndex)` and `(trackData, trackElement)`. The second silently overwrote the first. Three separate call sites (`main-app.js`'s delegate, the playlist track-menu handler, and the playlist context-menu "Remove" action in `ui-controller.js`) each expected a different one of the two signatures, and all three ended up hitting whichever definition won.
- **Solution**: Renamed the `(trackData, trackElement)` version to `removeTrackFromCurrentPlaylistByData` and repointed both of its real call sites (`playlist-renderer.js`'s own context menu, plus a second broken call in `ui-controller.js`'s context-menu "Remove" handler that was also passing a track object into the index-based version) at the renamed method. The index-based `removeTrackFromCurrentPlaylist(trackIndex)` now only serves `main-app.js`'s delegate, as originally intended.
- **Files Modified**: `client/scripts/playlist-renderer.js`, `client/scripts/ui-controller.js`

**Issue #23: Drag-and-drop playlist reordering was never implemented (front or back end)**
- **Description**: Dragging a track and dropping it before another track in a playlist always moved it to the bottom instead of the drop position.
- **Root Cause**: There was no drag-and-drop code in the client at all — no `dragstart`/`dragover`/`drop` handlers, no `draggable` attributes, anywhere in `client/`. Worse, digging into the backend it was supposed to call turned up a **second** bug: `main.js`'s `playlist:reorder-tracks` IPC handler and the `reorderTracks` preload bridge were already wired up, but the database method they called, `reorderTracksInPlaylist()`, didn't exist anywhere in `server/database.js`. The whole feature was a dead stub in both directions.
- **Solution**:
  - Added `MusicDatabase.reorderTracksInPlaylist(playlistId, trackId, newPosition)` — resolves the track's path, pulls the playlist's current order, removes and reinserts it at the target index inside a `better-sqlite3` transaction, then rewrites every row's `position` to stay contiguous.
  - Built real drag-and-drop in the playlist track list: `draggable="true"` rows, a drag handle, `dragstart`/`dragover`/`dragleave`/`drop`/`dragend` handlers that show a drop-position indicator line and compute the correct target index (accounting for the list shifting once the dragged item is removed), then call `window.queMusicAPI.playlists.reorderTracks(...)` and re-render from the persisted order.
  - Added the CSS for the playlist track list itself — it turned out `.track-item`/`.playlist-track` had **no styling anywhere** in the source CSS (only in the generated bundle by accident of inheritance); the playlist view now has a real row layout, hover/selected/playing states, and the drag indicator states.
  - Verified the reorder math with a standalone logic test (splice-out/splice-in + the drop-position index conversion) covering drag-to-front, drag-to-back, and drag-between-two-others — all correct.
- **Files Modified**: `server/database.js`, `client/scripts/playlist-renderer.js`, `client/styles/legacy/components.css`

**Issue #24: Fake "Update Durations" feature**
- **Description**: `updateMissingDurations()` just set `duration = 0` for every track with a missing/zero duration and reported it as a success. It never extracted a real duration. The button's own success-message handler also read `result.processed`, a field the backend never returned (would have shown "undefined").
- **Solution**: Rewrote `updateMissingDurations()` to use `music-metadata`'s `parseFile(path, { duration: true })` — the same mechanism the library scanner uses — and only write a duration when one was actually found; unreadable/missing files are now reported separately as `failed` instead of silently zeroed. Fixed the button handler to read the real return shape (`updated`/`total`/`failed`).
- **Files Modified**: `server/database.js`, `client/scripts/library-manager.js`

**Issue #25: Raw HTML injection risk from track metadata**
- **Description**: `renderSongList()`, `renderArtistsView()`, `renderAlbumsView()`, and the visible text in `renderSearchResults()` interpolated raw `song.title`/`artist`/`album`/`path` into `innerHTML` without escaping (favorites/recently-played views already escaped correctly). A music file with a malicious title tag could execute arbitrary JS in the renderer, which has full access to `window.queMusicAPI`.
- **Solution**: Routed every metadata-derived string (including `data-path` attributes and the search query breadcrumb) through the existing `escapeHtml()` helper in all four render functions.
- **Files Modified**: `client/scripts/library-manager.js`

**Issue #26: Broken album-art fallback**
- **Description**: `resolveAlbumArt()` called `getSampleCover()`, a function that had been removed (per the code's own comment noting the replacement). Every call threw, silently swallowed by a try/catch, so the final fallback-cover path was permanently dead.
- **Solution**: Pointed the fallback at `pathManager.getCover('sample-cover.jpg')`, the same call already used correctly elsewhere in the file.
- **Files Modified**: `main.js`

**Issue #27: M3U path normalization was Windows-only**
- **Description**: `_normalizePathKey()` normalized all path separators to `\` before matching. `package.json` ships mac/linux build targets, so M3U playlist import/re-sync would silently fail to match on those platforms.
- **Solution**: Normalize to `/` instead — Windows accepts forward slashes fine, so this matches on all three platforms. Purely an internal comparison key; doesn't change what's stored on disk.
- **Files Modified**: `server/database.js`

**Issue #28: Housekeeping**
- Removed `sqlite3`, `sharp`, and `electron-store` from `package.json` — none were `require()`d anywhere in the codebase (only `better-sqlite3` is used for the DB; settings are hand-rolled JSON). Pruned 70 packages from `node_modules`.
- Set `nodeIntegration: false` in the `BrowserWindow` config — confirmed via a full grep of `client/` that nothing in the renderer touches `require`/`process`/`Buffer`/`__dirname` outside the preload script, so this was dead risk with `contextIsolation: true` already doing the real work.
- Deleted `client/scripts/help-manager-simple.js` — confirmed dead (not referenced by `index.html` or anywhere else; only `help-manager.js`, the real implementation, is ever loaded).
- Deleted `client/styles/legacy/folder-browser.old` — confirmed dead (not in `build-css.js`'s bundle list, not loaded anywhere).
- Deleted the stale, drifted `docs/database/music-library.db.sql` (missing `ON DELETE CASCADE` and several indexes/columns vs. the live schema) as part of the docs reorganization below.
- *Left as-is, flagged for a deliberate follow-up rather than a blind change tonight*: `electron` is pinned to `^27.3.11`, well past its support window — a major-version bump needs its own testing pass, not a drive-by edit. `ui-controller.js`'s `setupGlobalContextMenuCloseHandler()` installs 10 overlapping global listeners plus a 100ms `setInterval` for the app's whole lifetime just to close a context menu — wasteful but not broken; revisit if it ever shows up in profiling.
- **Files Modified**: `package.json`, `main.js`

**Note**: The database layer itself (transactions, prepared statements, parameterized queries, foreign keys) was audited and found solid — no SQL injection paths, no missing rollback handling.

#### Repo Reorganization ✅

- **Docs**: Collapsed a scattered `docs/` (4 subfolders, 14 files, several of them duplicates of each other or of this tracker) down to exactly two folders: `docs/issues/` (this tracker + `CHANGELOG.md`) and `docs/application/` (architecture, folder structure, CSS architecture, album art, visualizer, logger, packaging guide, Electron startup troubleshooting, and the real SQL schema). Merged three one-off historical fix write-ups into this tracker as dated entries, then deleted the standalone files instead of leaving duplicates. Deleted the stale duplicate DB schema and an incomplete "Script Files" per-file doc set that only covered 4 of 20 source files.
- **Root clutter**: Moved `My issueList.txt` and `RESOLUTION-SUMMARY.md` content into this tracker, then deleted the loose files — nothing but `README.md` and `CLAUDE.md` (both required to stay at repo root by convention/tooling) sits loose at the project root anymore.
- **`.gitignore`**: It was excluding `docs/`, `CLAUDE.md`, `CHANGELOG.md`, and this tracker from git entirely (with a stray leftover exception carve-out and dead `nul`/`nulnpm` entries from an old broken command). Rewritten to only ignore what should never be tracked — `node_modules/`, build output, logs, `.db` files, `.env`, editor folders — so the project's own documentation is no longer invisible to git.

### Newly Found During This Pass (fixed, not part of the original audit list)
- A **third** call site for the Issue #22 bug: `ui-controller.js`'s playlist context-menu "Remove" handler was also calling the wrong signature.
- The Issue #23 backend method (`reorderTracksInPlaylist`) didn't exist at all — the audit had only flagged the missing frontend half.
- The "Update Durations" button read a field name (`result.processed`) the backend never returned.

---

### Unreleased - 2026-09-10

#### Issues Fixed ✅

**Issue #16: Folder tree showed non-music / empty folders**
- **Description**: Selecting a music folder listed every subfolder in the left pane — including scaffolding like `_Docs`, `_Inbox`, and the app's own empty `Playlists/` folder — with no relation to actual songs.
- **Root Cause**: `LibraryManager.filterSystemFolders()` only *marked* a hardcoded list of folder names as "system" (dimmed but still visible) and never hid folders that contain no audio.
- **Solution**: `filterSystemFolders()` now drops any folder that is a known system folder **or** whose `songCount` (total including children, from `buildFolderTree`) is 0. Artist folders that only hold album subfolders still show. Single chokepoint — both `createFolderBrowserForLeftPane` and `createFolderBrowser` use it.
- **Files Modified**: `client/scripts/library-manager.js` (`filterSystemFolders`, ~line 1075)
- **Verified**: Against live library `E:\Erich\Music` — before: `_Docs, Library, Organized, Playlists`; after: `Library, Organized`.

**Issue #17: M3U playlists never imported (playlist system dead on arrival)**
- **Description**: `.m3u` files in `{musicFolder}/Playlists/` were never imported. DB `playlists` table stayed empty. The manual "force re-import" path threw.
- **Root Cause**: Two separate breakages. (1) `MusicDatabase.importM3UFile()` was a stub — it read the file, checked for an existing playlist, logged "Importing…", then returned without parsing or inserting anything. (2) `main.js` `playlist:force-reimport-m3u` handler was written against the old `sqlite3` callback API (`musicDB.db.get(sql, params, cb)`); the DB is `better-sqlite3` (synchronous), so `musicDB.db.get` is not a function.
- **Solution**:
  - Rewrote `importM3UFile()` to parse the M3U, resolve every entry against `tracks.path` via a normalized-path index (`_normalizePathKey` handles separators, BOM, `file://`, case, relative paths), then create-or-rebuild the playlist and its `playlist_tracks` rows inside a single transaction. Stores the canonical `tracks.path` so the app's `getPlaylistById` JOIN (`pt.track_path = t.path`) resolves.
  - `importM3UFile(path, { replace })`: `replace=false` (default, used on startup) skips playlists that already exist — non-destructive; `replace=true` rebuilds from disk.
  - `importExistingM3UFiles(options)` builds the track index once and reuses it for all files; returns a `{ processed, playlists:[{name, matched, missing, missingPaths}] }` summary.
  - Gutted the broken `playlist:force-reimport-m3u` handler down to a thin delegate calling `importExistingM3UFiles({ replace: true })`.
- **Files Modified**: `server/database.js` (`importExistingM3UFiles`, `importM3UFile`, new `_normalizePathKey` / `_buildTrackIndex` / `_resolveTrackEntry`), `main.js` (`playlist:force-reimport-m3u` handler, ~line 880)
- **Verified**: Clean app launch imported all 19 of Erich's playlists.

**Issue #18: Playlist entries broken by an earlier library reorganize**
- **Description**: Some `.m3u` entries pointed at old locations — files that a Picard/organize pass (Aug 2026) had since moved into each artist's `Singles & Rarities/` folder, leaving behind empty `<Song>.Mp3/` folders (cover.jpg only). Those entries failed to import.
- **Solution**: `_resolveTrackEntry()` now falls back to a **unique-filename match** when the exact path misses — heals tracks moved anywhere within the library, present and future. Ambiguous filenames (shared by >1 track) are not auto-matched.
- **Files Modified**: `server/database.js` (`_buildTrackIndex` now also indexes by filename; new `_resolveTrackEntry`)
- **Verified**: import went from 348/352 → **350/352** matched. Remaining 2 are the same dead entry (`…\Compilations\Grunge Mixes\free bird lynyrd skynyrd.mp3`) referenced by the "Grunge" and "Grunge Mixes" playlists — that file exists nowhere in the library; needs a manual decision (drop the entry or point it at another recording).
- **Not fixed here (library hygiene, separate task)**: the empty `<Song>.Mp3/` folders still on disk with an orphan `cover.jpg`. Harmless to playback; now hidden from the folder tree by Issue #16.

### Version 3.2.4 - 2025-10-07

#### Issues Fixed ✅

**Issue #14: Header Logo Not Loading in Production Build**
- **Description**: When running the built executable, the header logo image (QueMusicDark.png/QueMusicLight.png) was not loading and appeared as a broken image icon
- **Root Cause**: The `toggleTheme()` method in ui-controller.js did not reload the header logo after theme changes, and there was no fallback mechanism
- **Solution**:
  - Made `toggleTheme()` method async and added call to `this.app.loadHeaderLogo()` after theme change
  - Logo now reloads automatically when switching between light and dark themes
  - Ensures proper logo display both on startup and after theme changes
- **Files Modified**:
  - `client/scripts/ui-controller.js:164-181` - Made toggleTheme async and added logo reload
- **Benefits**:
  - Header logo displays correctly in both dev and production builds
  - Theme-appropriate logo (dark/light) loads automatically on theme switch
  - No more broken image icons in header

**Issue #15: Missing Default Album Cover Images in Song Cards**
- **Description**: When songs didn't have album art or when album art failed to load, song cards showed broken image icons instead of the default sample cover
- **Root Cause**: No error handling for failed album art loads - images didn't have fallback mechanism when `src` was invalid or empty
- **Solution**:
  - Added `onerror` handler to all album art images in song cards
  - Handler attempts to load `defaultAlbumArt` when primary image fails
  - Prevents infinite error loops by checking if already showing default
  - Applied to both library view song cards and search result cards
- **Files Modified**:
  - `client/scripts/library-manager.js:386-389` - Added onerror to song card images
  - `client/scripts/library-manager.js:2735-2738` - Added onerror to search result images
- **Benefits**:
  - Graceful fallback to default album art when covers are missing
  - No more broken image icons in song cards
  - Better visual consistency across the application
  - Works in both development and production builds

---

### Version 3.2.3 - 2025-10-06

#### Issues Fixed ✅

**Issue #13: Database Statistics SQLITE_ERROR on Startup**
- **Description**: Application throwing "SQLITE_ERROR: no such column: "" - should this be a string literal in single-quotes?" when attempting to retrieve database statistics. This prevented statistics display in library view and advanced filters.
- **Root Cause**: The `getStats()` method was using double quotes (`""`) for empty string comparison in SQL WHERE clauses. In SQLite, double quotes denote column identifiers, not string literals, so `artist != ""` was interpreted as comparing to a column named "" (empty string) rather than an empty string value.
- **Affected Queries**:
  - `SELECT COUNT(DISTINCT artist) as count FROM tracks WHERE artist IS NOT NULL AND artist != ""`
  - `SELECT COUNT(DISTINCT album) as count FROM tracks WHERE album IS NOT NULL AND album != ""`
  - `SELECT COUNT(DISTINCT genre) as count FROM tracks WHERE genre IS NOT NULL AND genre != ""`
- **Solution**:
  - Changed all empty string comparisons from double quotes to single quotes: `!= ""` → `!= ''`
  - Added defensive table existence check before querying to prevent errors if schema initialization fails
  - Enhanced error logging to include detailed message, error code, and stack trace for easier debugging
- **Files Modified**:
  - `server/database.js:572-574` - Fixed SQL string literals in getStats() method
  - `server/database.js:543-556` - Added table existence verification
  - `server/database.js:577-582` - Enhanced error logging with full details
- **Technical Note**: SQLite uses different quote types for different purposes:
  - Single quotes (`'...'`) = String literals
  - Double quotes (`"..."`) = Column/table identifiers
  - Backticks (`` `...` ``) = Alternative identifier quotes (MySQL-style)
- **Benefits**:
  - Database statistics now load correctly without errors
  - Advanced filters display proper track/artist/album counts
  - Library view statistics panel works as expected
  - Better error messages for future database debugging

**Issue #12: Critical Database API Mismatch - Playlists and Tracks Not Loading**
- **Description**: Application was unable to load playlists or display tracks when clicking folders. Console showed errors "this.db.all is not a function" and "this.db.get is not a function"
- **Root Cause**: The entire `server/database.js` file was written using node-sqlite3's callback-based async API, but the project uses better-sqlite3's synchronous API. All 37 database methods were using incompatible API calls:
  - Using `this.db.all(sql, params, callback)` instead of `this.db.prepare(sql).all(params)`
  - Using `this.db.get(sql, params, callback)` instead of `this.db.prepare(sql).get(params)`
  - Using `this.db.run(sql, params, callback)` instead of `this.db.prepare(sql).run(params)`
  - Wrapping everything in Promises even though better-sqlite3 is synchronous
- **Solution**:
  - Converted all 37 database methods from callback-based async to better-sqlite3 synchronous API
  - Replaced `this.db.all()` with `this.db.prepare().all()`
  - Replaced `this.db.get()` with `this.db.prepare().get()`
  - Replaced `this.db.run()` with `this.db.prepare().run()`
  - Removed unnecessary Promise wrappers since better-sqlite3 is synchronous
  - Updated transaction handling to use `.prepare('BEGIN').run()` pattern
  - Changed result handling from `this.lastID` to `result.lastInsertRowid`
  - Replaced callback error handling with try-catch blocks
- **Files Modified**:
  - `server/database.js` - Complete rewrite of all 37 methods to use correct better-sqlite3 API
  - `main.js` - Added null checks for `musicDB` in IPC handlers (lines 440, 701)
  - `main.js` - Removed problematic `app.disableHardwareAcceleration()` call that was causing timing errors
- **Methods Converted**:
  - Track Management: `addTracks`, `getAllTracks`, `getTracksByArtist`, `getTracksByAlbum`, `getTrackByPath`, `searchTracks`, `getTrackIdByPath`
  - Artist & Album: `getAllArtists`, `getAllAlbums`
  - Recently Played: `getRecentlyPlayed`, `addToRecentlyPlayedByPath`, `getRecentlyPlayedCount`, `clearRecentlyPlayed`
  - Favorites: `getFavorites`, `getFavoritesCount`, `addToFavoritesByPath`, `removeFromFavoritesByPath`, `isFavoriteByPath`, `clearFavorites`
  - Statistics: `getStats`, `checkForDuplicates`, `getGenreStats`, `getYearStats`
  - Playlists: `getAllPlaylists`, `createPlaylist`, `getPlaylistById`, `addTrackToPlaylist`, `removeTrackFromPlaylist`, `deletePlaylist`, `updatePlaylist`
  - Import/Utility: `importM3UFile`, `updateMissingDurations`
  - Database Maintenance: `populateArtistsAndAlbumsFromTracks`, `validateAllPaths`, `updateCorrectedPaths`, `removeOrphanedRecords`
  - Connection: `close`
- **Benefits**:
  - Playlists now load and display correctly
  - Clicking folders now shows tracks in right pane
  - Music folder changes work without errors
  - Cleaner code without nested callbacks
  - Better performance with synchronous operations
  - Proper error handling with try-catch instead of callbacks
  - Correct use of better-sqlite3 API throughout

**Issue #11: Album Art Still Not Displaying (Incomplete Fix from 3.2.1)**
- **Description**: Despite previous fix in 3.2.1, default album art was still not showing on app startup
- **Root Cause**: The `initAlbumArtIntegration()` method was defined in main-app.js but never called during app initialization, so `showAlbumArtPlaceholder()` was never executed
- **Solution**:
  - Added call to `await this.initAlbumArtIntegration()` in the initialization sequence
  - Placed after help system initialization and before library folder check
- **Files Modified**:
  - `client/scripts/main-app.js` - Added `initAlbumArtIntegration()` call to initialization (line 78)
- **Benefits**:
  - Default album art now displays correctly on startup
  - Sample cover shows when no track is playing
  - Consistent with original 3.2.1 fix that added IPC album art loading

---

### Version 3.2.1 - 2025-10-02

#### Issues Fixed ✅

**Issue #11: Album Art and Header Logo Not Displayed in Built Executable**
- **Description**: After building the app with `npm run make`, the default album art and header logo (QueMusicDark.png) were not displaying in the packaged executable
- **Root Cause**: Renderer process was using hardcoded relative file paths (`../../assets/covers/sample-cover.jpg`, `../../assets/images/QueMusicDark.png`) which don't work in packaged Electron apps due to different file structure
- **Solution**:
  - Created new IPC handler `assets:get-image` in main process to load asset images with proper path resolution
  - Updated `showAlbumArtPlaceholder()` to request sample cover via IPC instead of using relative path
  - Added `loadHeaderLogo()` method to dynamically load logo based on current theme
  - Exposed assets API in preload script: `window.queMusicAPI.assets.getImage()`
  - Updated HTML to use empty `src` attributes, populated at runtime via IPC
  - All asset loading now uses data URLs passed through secure IPC channel
- **Files Modified**:
  - `main.js` - Added `assets:get-image` IPC handler with multi-path resolution (lines 1281-1314)
  - `client/scripts/ui-controller.js` - Updated `showAlbumArtPlaceholder()` to async IPC call (lines 3887-3921)
  - `client/scripts/main-app.js` - Added `loadHeaderLogo()` method and integration (lines 96, 110-127)
  - `client/scripts/main-preload.js` - Exposed assets API (lines 279-287)
  - `client/pages/index.html` - Removed hardcoded asset paths (lines 103, 465)
- **Path Resolution Strategy**:
  - Checks multiple locations: `__dirname/assets`, `../assets`, `process.resourcesPath/assets`, `app.getAppPath()/assets`
  - Works in both development and production environments
  - Handles ASAR packaging and extracted resource scenarios
- **Benefits**:
  - Default album art displays correctly in packaged executables
  - Header logo loads properly based on theme (Dark/Light)
  - Consistent asset loading across development and production
  - No broken image icons in built apps
  - Future-proof for different Electron packaging methods

---

### Version 3.2.0 - 2025-10-02

#### Features Added ✨

**Feature: Album Cover Fetcher Tool**
- **Description**: Comprehensive batch album art management system with online fetching capability
- **Implementation**:
  - Scans entire music library for missing or corrupted album covers
  - Extracts embedded album art from MP3/FLAC metadata
  - Downloads high-quality covers from Cover Art Archive via MusicBrainz API
  - Validates existing covers using magic byte verification (JPEG/PNG)
  - SHA256 duplicate detection prevents redundant downloads
  - Real-time progress tracking with statistics and status logs
  - Configurable options for online downloads and validation
- **Files Added**:
  - `server/cover-fetcher.js` - Core cover fetching engine with MusicBrainz integration
  - `client/scripts/cover-fetcher-ui.js` - Modal UI controller with progress management
- **Files Modified**:
  - `main.js` - Added Tools menu and IPC handlers (lines 94-107, 1676-1724)
  - `client/pages/index.html` - Cover Fetcher modal HTML (lines 900-985)
  - `client/scripts/main-preload.js` - API exposure (lines 264-274)
  - `client/styles/features/modals.css` - Modal styling
- **Access**: Tools → Fetch Missing Album Covers (Ctrl+Shift+C)
- **Benefits**:
  - Automated album art management for large libraries
  - Professional metadata integration with MusicBrainz
  - Smart deduplication saves bandwidth and storage
  - Full logging integration for troubleshooting
  - Non-blocking batch processing with progress feedback

#### Issues Fixed ✅

**Issue #9: Cover Fetcher Modal Not Visible**
- **Description**: Cover Fetcher modal HTML was present but not visible when opened via menu
- **Root Cause**: Modal CSS required `.show` class for visibility, but JavaScript only set `display: flex`
- **Solution**:
  - Added `.show` class toggle in modal open/close methods
  - Implemented proper animation timing with setTimeout
  - Added smooth fade-in/fade-out transitions
- **Files Modified**:
  - `client/scripts/cover-fetcher-ui.js` - Modal visibility fix (lines 79-101)
- **Benefits**:
  - Modal now displays correctly with proper animations
  - Consistent behavior with other modals in the application

**Issue #10: Cover Fetcher Notification Error**
- **Description**: After scan completion, status log showed "Error: this.app.uiController.showNotification is not a function"
- **Root Cause**: Incorrect notification method path - should be `this.app.showNotification` not `this.app.uiController.showNotification`
- **Solution**:
  - Updated all three notification calls to use correct path
  - Fixed success, error, and exception notification handlers
- **Files Modified**:
  - `client/scripts/cover-fetcher-ui.js` - Notification routing (lines 167, 175, 184)
- **Benefits**:
  - Success notifications now display properly
  - Error notifications work correctly
  - Consistent notification system usage

#### Additional Enhancements 🔧

**Help Documentation for Cover Fetcher**
- **Description**: Added comprehensive help documentation for Album Cover Fetcher feature
- **Implementation**:
  - Created full help topic with usage instructions, troubleshooting, and technical details
  - Added to embedded help content in help-manager.js (order: 7)
  - Updated interface guide to list Cover Fetcher in Tools section
  - Added Cover Fetcher section to database management help topic
  - Registered in help-content.json with proper metadata
- **Files Modified**:
  - `client/scripts/help-manager.js` - Added embedded Cover Fetcher help content (lines 278-363)
  - `client/help/topics/interface-guide.md` - Added to Tools section list
  - `client/help/topics/database-management.md` - Added Cover Fetcher documentation section
  - `client/help/help-content.json` - Registered help topic (lines 54-60)
- **Benefits**:
  - Users can access detailed Cover Fetcher documentation via Help (?) button
  - Complete usage instructions and troubleshooting guide
  - Technical details for advanced users

**Database Manager Display Fix**
- **Description**: Database size statistics were confusing - showing 29.8 GB when actual database file was only 3.6 MB
- **Root Cause**: Display was showing total size of all music files, not the database file itself
- **Solution**:
  - Added database file size retrieval in IPC handler
  - Now displays both "Database Size" (actual .db file in MB) and "Music Size" (total music files in GB)
  - Clear labeling prevents confusion
- **Files Modified**:
  - `main.js` - Added dbFileSize to stats (lines 408-416)
  - `client/scripts/library-manager.js` - Updated display with both sizes (lines 3431-3477)
- **Benefits**:
  - Clear distinction between database metadata size and music collection size
  - Accurate reporting of actual database file size
  - Better understanding of storage usage

#### Known Limitations ⚠️

**Cover Fetcher: No Internet Connection Detection**
- **Description**: Cover Fetcher does not check for active internet connection before attempting online downloads
- **Impact**: If user has no internet connection and enables "Download missing covers", the feature will attempt downloads and they will silently fail
- **Workaround**: User can disable "Download missing covers" option if offline
- **Future Enhancement**: Add internet connectivity check before online operations
- **Priority**: Low (embedded art extraction still works offline)

---

### CSS Cleanup - 2025-08-29

#### Issues Fixed ✅

**Issue: CSS Diagnostics and Standards Compliance**
- **Description**: Multiple CSS diagnostic warnings in `bundled.css` — missing standard `line-clamp` property alongside `-webkit-line-clamp` (7 locations), and several empty rulesets left over from earlier edits.
- **Solution**: Added standard `line-clamp` property everywhere `-webkit-line-clamp` was used; removed all empty rulesets (folder-browser, legacy loading classes, loading-state/spinner, notification, ARIA notification rules).
- **Files Modified**: `client/styles/bundled.css` (lines 1018, 1025, 1032, 5667, 5678, 13915, 14102 for line-clamp; 2801, 7271-7274, 7918, 7922, 7927, 10914-10922 for empty rules).
- **Benefits**: Better non-webkit browser compatibility, no more IDE lint warnings, cleaner stylesheet.

---

### Version 3.1.6 - 2025-01-30

#### Issues Fixed ✅

**Issue #8: Default Album Art Not Displayed on Startup**
- **Description**: When the application starts up with no track loaded, the album art area shows a broken image instead of the default sample cover
- **Root Cause**: Incorrect relative path to default album art image (`../../../assets/covers/sample-cover.jpg` instead of `../../assets/covers/sample-cover.jpg`)
- **Solution**:
  - Fixed relative path in HTML initial state (index.html line 465)
  - Fixed relative path in JavaScript fallback handler (ui-controller.js line 3893)
  - Path corrected from `../../../` to `../../` based on actual directory structure
- **Files Modified**:
  - `client/pages/index.html` - Initial album art src attribute (line 465)
  - `client/scripts/ui-controller.js` - showAlbumArtPlaceholder method (line 3893)
  - `package.json` - Version bumped to 3.1.6
- **Benefits**:
  - Default album art displays correctly on startup
  - Proper fallback when track has no embedded artwork
  - Consistent visual appearance throughout the app

---

### Version 3.1.0 - 2025-01-30

#### Issues Fixed ✅

**Issue #6: Excessive Console Output in Production**
- **Description**: Browser console showed hundreds/thousands of console.log messages during normal operation, making debugging difficult and cluttering the console
- **Root Cause**: All console.log/error/warn calls throughout the application were outputting directly without respecting any logging configuration
- **Solution**:
  - Enabled console interception in both main and renderer processes
  - All console.* calls now routed through the logger system automatically
  - Default logging level set to NONE for clean console in production
  - Added user-configurable logging levels (NONE/LOW/MED/HIGH/DEV) in Settings
  - Real-time logging level updates across all processes
  - Console output now respects user's logging preference
- **Files Modified**:
  - `main.js` - Logger default to NONE, console interception enabled (lines 14-22, 163-165, 510-527)
  - `client/scripts/main-app.js` - Renderer logger setup (lines 6-15, 191-202)
  - `client/scripts/main-preload.js` - IPC bridge for logging settings (lines 47-48, 27-29)
  - `simple-logger.js` - Console interception already implemented (lines 554-613)
- **Benefits**:
  - Clean console by default (no spam during normal use)
  - Easy debugging when needed (set level to DEV)
  - No code changes needed (existing console calls automatically captured)
  - Persistent file logging for troubleshooting
  - User control via Settings UI

**Issue #7: No Version Information Displayed**
- **Description**: Application did not show version number anywhere in the UI, making it difficult for users to know which version they're running
- **Root Cause**: No UI component or menu item to display version information
- **Solution**:
  - Added Help menu with "About Que-Music" dialog showing version and build info
  - Added version display at bottom of sidebar (always visible)
  - Version display is clickable to show full About dialog
  - About dialog shows version, Electron/Node.js/Chromium versions, copyright
  - Added "Open Help" option in Help menu with F1 shortcut
  - Professional native dialog with app icon
- **Files Modified**:
  - `main.js` - Help menu and About IPC handler (lines 89-134, 284-301)
  - `client/pages/index.html` - Version display in sidebar (lines 322-328)
  - `client/styles/layout/sidebar.css` - Version styling (lines 15, 174-212)
  - `client/scripts/main-app.js` - Click handler for version (lines 95-101, 223-230)
  - `client/scripts/main-preload.js` - IPC bridge (lines 12, 30-32)
- **Benefits**:
  - Users can easily see which version they're running
  - About dialog follows desktop app conventions
  - Quick access to version info from sidebar
  - Professional appearance with complete build information

**Issue #3: Multi-Track Playlist Creation Not Working**
- **Description**: When selecting multiple MP3 files (Ctrl+Click or Shift+Click) and right-clicking to create a playlist, only one track was being added instead of all selected tracks
- **Root Cause**: Context menu system only tracked single track selection, no multi-selection support
- **Solution**:
  - Implemented multi-track selection with Ctrl+Click and Shift+Click
  - Added `selectedTracks` array to track multiple selections
  - Created `showPlaylistModalWithTracks` method for batch operations
  - Updated context menu text to show selection count ("Create Playlist with 5 Tracks")
  - Enhanced "Add to Playlist" to handle multiple tracks with progress feedback
- **Files Modified**:
  - `client/scripts/ui-controller.js` - Multi-selection logic (lines 8, 2582-2679, 2858-2946, 3532-3575)
  - `client/scripts/playlist-renderer.js` - Batch track addition (lines 422-434, 646-707, 509-557)
  - `client/styles/components/cards.css` - Selected state styling (line 264)

**Issue #4: Excessive Console Logging During Library Scan**
- **Description**: When scanning music library for the first time, thousands of log messages flooded both VS Code console and browser console
- **Root Cause**: Music scanner using console.log directly instead of the logger system
- **Solution**:
  - Updated MusicScanner to accept logger instance
  - Replaced all 17 console statements with appropriate logger calls
  - Logs now respect user's logging level setting (NONE/LOW/MED/HIGH/DEV)
  - All scan logs now go to daily log files instead of console
- **Files Modified**:
  - `server/music-scanner.js` - Logger integration (lines 8-11, 18-267)
  - `main.js` - Pass logger to scanner (lines 22-25, 155-167)

**Issue #5: All Tracks Displayed After Library Scan**
- **Description**: After initial library scan, all MP3 files from entire library were displayed in right pane instead of showing folder structure
- **Root Cause**: `loadMusicLibrary()` was calling `getAllTracks()` and displaying all tracks immediately
- **Solution**:
  - Changed to pass empty array initially instead of all tracks
  - Added empty state with friendly instruction message
  - Right pane now shows "Select a folder from the left to view its tracks"
  - Only loads tracks when user clicks a specific folder
- **Files Modified**:
  - `client/scripts/library-manager.js` - Empty initial state (lines 228-303)

#### Technical Improvements

**Console Interception System**
- Automatic capture of all console.log/error/warn calls
- Routes through logger system without code changes
- Respects user logging level preference
- Works across main and renderer processes
- Real-time level updates via IPC

**Version Display System**
- Sidebar widget with version number
- Professional About dialog with build info
- Help menu integration following desktop conventions
- Clickable version for easy access to details
- Shows Electron/Node/Chromium versions

**Multi-Selection System**
- Ctrl+Click to toggle individual tracks
- Shift+Click to select range of tracks
- Visual feedback with CSS `.selected` class
- Smart context menu detection of selected tracks

**Logger System Integration**
- MusicScanner now fully integrated with logger
- Structured logging with contextual data
- User-controllable log levels via Settings
- Daily log file rotation in `logs/` directory
- Console interception for automatic routing

**User Experience**
- Clean console by default (no logging spam)
- Easy version identification from sidebar
- Professional About dialog accessible via Help menu
- Clean initial library view with folder tree
- Batch playlist operations with progress feedback
- Context menu shows selection count
- F1 shortcut opens help from menu bar

---

### Version 3.0.5 - 2025-01-26

#### Issues Fixed ✅

**Issue #1: App Crashes During Long Playlist Playback**
- **Description**: Application would close unexpectedly after 30-45 minutes of continuous playlist playback
- **Root Cause**: Memory leaks from audio contexts, visualizer animation frames, and accumulated event listeners
- **Solution**:
  - Enhanced cleanup system with proper resource disposal
  - Periodic memory cleanup every 10 tracks
  - Global error handlers with recovery mechanisms
  - Memory monitoring system with automatic cleanup triggers
- **Files Modified**:
  - `client/scripts/core-audio.js` - Enhanced cleanup methods (lines 1705-1832)
  - `client/scripts/main-app.js` - Global error handlers (lines 80-160)

**Issue #2: Right-click "Create Playlist" Creates Empty Playlist**
- **Description**: When right-clicking on an MP3 file and selecting "Create Playlist", the playlist was created but the selected song was not added to it
- **Root Cause**: Context menu action wasn't passing the selected track to the playlist creation modal
- **Solution**:
  - Modified context menu handler to pass current track
  - Added `showPlaylistModalWithTrack` method
  - Enhanced playlist save functionality to auto-add the track
  - Fixed both normal and emergency modal code paths
- **Files Modified**:
  - `client/scripts/ui-controller.js` - Context menu handler (lines 2567-2575)
  - `client/scripts/playlist-renderer.js` - Track inclusion logic (lines 408-631)

#### Technical Improvements

**Memory Management**
- Implemented periodic cleanup system
- Added memory usage monitoring
- Enhanced visualizer resource cleanup
- Proper event listener removal

**Error Handling**
- Global unhandled rejection handlers
- Audio error recovery mechanisms
- Memory pressure detection
- Graceful degradation on errors

**User Experience**
- Smoother playlist creation workflow
- Better context menu functionality
- Improved app stability during long sessions

---


## Known Issues 🔍

### Current Open Issues

**Issue #29: Recently-played entry pointed at a mangled path (needs reproduction)**
- **Description**: A raw console dump saved separately (`My issueList.txt`, now folded in here) showed a `net::ERR_FILE_NOT_FOUND` for a recently-played track where the path had no separators between folder segments (`...ErichMusicAlbumsmartin pagehouse of stone and light...`) instead of `E:\Erich\Music\Albums\martin page\house of stone and light\...`.
- **Investigation**: Checked `music-scanner.js` (uses `path.join()` correctly) and `core-audio.js` `loadTrack()` (separator normalization is correct: `\` → `/`, encodes spaces via `encodeURI`). Found no code path that would strip separators outright — this looks like either a stale `recently_played` row surviving a library reorganize (the Aug 2026 Picard/organize pass mentioned in Issue #18), or an artifact of how the path was pasted into the console/text file.
- **Status**: Not reproduced against current code. Leaving open — if it recurs, capture the exact `recently_played.path` value from the database (not just the console/DevTools rendering) to confirm whether the bad path is stored that way or is a display/copy artifact.

### Feature Requests
- See `docs/application/roadmap.md` for the full feature roadmap and the rewrite-vs-keep decision (2026-09-12), drawn from the Nagi comparison in `docs/application/compared.md`.

---

## Testing Notes

### Memory Stability Testing
- ✅ Extended playlist playback (60+ minutes)
- ✅ Memory usage monitoring
- ✅ Error recovery testing

### Playlist Functionality Testing
- ✅ Right-click playlist creation
- ✅ Track inclusion verification
- ✅ Both modal types (normal and emergency)

---

## Development Notes

### Build Process
- Requires `npm run rebuild` after dependency changes
- Use `npm run make` for distribution builds
- Version incrementation in `package.json`

### Dependencies
- better-sqlite3: Requires native rebuild for Electron
- sharp: Image processing, needs native compilation
- music-metadata: Audio file parsing

### Testing Recommendations
- Test with Unicode filenames (日本語, émojis)
- Test with special characters and spaces
- Verify large library performance (1000+ tracks)
- Test memory usage during extended playback
- Test multi-track selection (Ctrl+Click, Shift+Click)
- Verify batch playlist operations with 10+ tracks
- Test logger output at different log levels (NONE/LOW/MED/HIGH/DEV)
- Verify console interception works for all console.* calls
- Test logging level changes update in real-time
- Check version display in sidebar
- Verify About dialog shows correct version and build info
- Test Help menu → About Que-Music
- Test Help menu → Open Help (F1)
- Verify version click handler opens About dialog
- Check that default logging level is NONE (clean console)
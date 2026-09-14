# Layout Redesign

Captured 2026-09-13, from Erich walking through what's wrong with the current window layout. This is a spec to build against — nothing here starts until Erich says go on it specifically.

**Status: built and visually verified 2026-09-13.** All four pieces below are implemented — see `docs/issues/issues_track.md`, "Four-Column Resizable Layout" entry, for the actual files/mechanism. Verified against a live launch (screenshots, both collapsed and expanded sidebar states) — a real bug turned up in that pass (collapsing the sidebar blanked the whole content area, a CSS Grid auto-placement issue) and was fixed the same session, also logged in issues_track.md.

## The problem with the current layout

The window is actually two separate fixed-width layout systems stacked next to each other, with no way to resize either:

1. **`.app-main`** (`grid.css`) — a fixed-width nav sidebar (Music Library, Favorites, Recent, Discover, Now Playing, Playlists, Create Playlist, Change Music Folder, Database Management) next to the content area. Width comes from `--sidebar-width`, no drag handle.
2. **`.dual-pane-layout`** (`grid.css`, inside the content area) — a second fixed grid: `left-pane` (folder tree) and `right-pane` (the actual file list). Widths are `minmax()` clamped, no drag handle here either.

Net effect: three visual columns (nav / folders / files), none of them resizable, and picking a folder just dumps every file into the fixed-width right pane with no way to give it more room.

There is also no persistent place to see or build a playlist while browsing — playlists are a separate view you have to leave the library to reach.

## The fix, four pieces

### 1. Collapsible nav sidebar
- **Expanded**: icon + text label for every nav item, current look.
- **Collapsed**: icon-only rail, same click targets, labels hidden.
- A toggle control (arrow/hamburger at the top of the sidebar) flips between the two states.
- State (collapsed vs. expanded) persists across sessions — same idea as the existing theme preference storage.

### 2. Resizable splitter: nav ↔ folder tree
- Drag handle on the boundary between the nav sidebar and the folder-tree pane.
- Only active when the sidebar is expanded (collapsed rail has a fixed icon-only width, nothing to drag).

### 3. Resizable splitter: folder tree ↔ file list
- Drag handle on the boundary between `left-pane` (folder tree) and `right-pane` (file list).
- Replaces the current fixed `minmax()` column split in `.dual-pane-layout`.

### 4. New persistent playlist pane (4th column)
- Sits to the right of the file list, visible at all times (not a separate view you have to navigate to).
- Shows the current/active playlist's tracks.
- Acts as a live drop target: drag a track (or multi-selection) from the file list straight onto it to add.
- Resizable like the other panes via a drag handle on its left edge.
- Reuses the existing drag-and-drop plumbing already built for playlist drops (`application/x-que-track-paths` MIME type, `setupPlaylistDragAndDrop()` in `playlist-renderer.js`) — this pane is a new drop target wired to that same system, not a new D&D implementation.

## Resulting shape, left to right

```
[ Nav rail/sidebar ] | [ Folder tree ] | [ File list ] | [ Playlist ]
     resizable             resizable        resizable      resizable
   (collapsible)
```

Each boundary gets a drag handle. Pane widths persist across sessions (localStorage or the app's existing settings store — whichever pattern is already used for other UI prefs).

## Files this touches (scoping only, not started)

- `client/pages/index.html` — new markup for the sidebar collapse toggle and the 4th playlist pane; drag-handle elements between all four columns.
- `client/styles/layout/grid.css` — replace fixed `grid-template-columns` on `.app-main` and `.dual-pane-layout` with a resizable-column approach (CSS custom properties driven by JS, updated on drag).
- `client/styles/layout/sidebar.css` — collapsed/expanded state styling (icon-only rail vs. icon+text).
- `client/scripts/ui-controller.js` — sidebar collapse/expand toggle logic and state persistence; likely home for the new drag-handle resize logic too.
- `client/scripts/playlist-renderer.js` — wire the new playlist pane as an additional drop target using the existing `setupPlaylistDragAndDrop()` machinery.

## Explicitly not decided yet

- Exact persistence mechanism (localStorage vs. settings DB) — pick whichever existing pattern is already in the codebase for other UI state, don't invent a second one.
- Min/max widths per pane — needs Erich's eye on it once it's built, not guessed in advance.
- Whether the playlist pane defaults to "currently playing queue" or "last opened playlist" when nothing is active — flagged for Erich to decide when this gets built, not assumed here.

# Lyrics Feature — Design Decision

Captured 2026-09-13. Decision made, not started — nothing here gets built until Erich says go.

## Decision

**Plain text lyrics only. No synced/karaoke-style scrolling.** Erich doesn't use time-synced lyrics and doesn't see value in building it, so the LRC-timestamp parsing and playback-position-driven scroll highlighting from the original roadmap item are cut. This is a static "show the words" feature, nothing more.

## How lyrics get sourced (background, for reference)

Three ways apps normally get lyrics — covered here so the source choice below makes sense:

1. **Embedded in the file's own tags** — ID3v2 `USLT` frame (MP3) or the `LYRICS` Vorbis comment (FLAC). Rare in practice; most ripped files don't have this filled in. Free if present, no network call needed.
2. **Sidecar `.lrc` file** next to the track — this is really the synced format (timestamped lines), overkill for what we're building. Not needed given the decision above.
3. **Fetched from an external API** — e.g. LRCLIB (free, no API key, has a plain-text option alongside synced). This is the realistic primary source for anything not already embedded.

## Planned approach

1. **Check the file's own tags first.** If `USLT`/`LYRICS` is already populated (music-metadata already reads tags elsewhere in the scanner, so this is cheap to check during scan), use it — zero network cost.
2. **Fall back to a fetch** (LRCLIB or similar plain-text-capable free API) only when nothing's embedded, and only on demand (when the user actually opens the lyrics view for that track) — not a bulk background fetch across the whole library.
3. **Cache whatever we get in the database** so it's a one-time cost per track, not a re-fetch on every play.

## Database shape — applied 2026-09-13

Added to `tracks` table (see `database-schema.sql`), simplest version since there's no sync data to store:

```sql
lyrics TEXT;               -- plain text lyrics, NULL if none found
lyrics_source TEXT;        -- 'embedded' | 'lrclib' | etc., NULL if unfetched
lyrics_fetched_at DATETIME; -- when we last checked, NULL if never
```

No separate table needed — it's a 1:1 relationship with a track, same pattern as the existing metadata columns already on `tracks`.

**Status**: Fully built. Columns exist in both the live schema and the doc copy. `music-scanner.js` reads embedded tags at scan time. `server/lyrics-fetcher.js` + the `lyrics:get-for-track` IPC handler in `main.js` fetch from LRCLIB on demand and cache the result. `client/scripts/lyrics-ui.js` + the lyrics button in the player bar display it in the left-positioned, faded-album-art modal described below. See `docs/issues/issues_track.md`, 2026-09-13 entries, for full implementation detail.

## Explicitly not building

- Synced/`.lrc` timestamp parsing.
- Scroll-to-current-line / karaoke highlighting.
- Any UI tied to playback position for lyrics.

## Decided — source and display (2026-09-13)

- **API: LRCLIB.** Free, no API key required. This is the fetch fallback used when a track has no embedded lyrics tag.
- **Display: a modal, triggered by a button click.** Positioned toward the left side of the screen. Shows the plain-text lyrics.
- **Backdrop treatment**: the album cover art, faded/obscured behind the lyrics text — not a plain solid background. Purely visual polish, no functional behavior tied to it.

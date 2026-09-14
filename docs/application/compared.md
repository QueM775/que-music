# Que-Music vs. Nagi — Feature & Polish Comparison

**Reference project**: [Nagi](https://github.com/Anthonyy232/Nagi) — a Windows-only music player written in C#/.NET, WinUI 3, EF Core + SQLite. Different tech stack entirely; this is a feature/UX reference, not a code-porting source.

**Purpose of this doc**: A factual comparison of what Nagi has, what Que-Music already has that matches it, and what specifically makes Nagi's UI read as more polished/professional. This is research only — nothing here is a commitment to build any of it. See `docs/issues/issues_track.md` before acting on anything below; feature decisions are Erich's call.

---

## Features Nagi has that Que-Music doesn't

- **Rule-based smart playlists.** A `SmartPlaylistRule` model: pick a field (artist, genre, play count, date added, etc.), an operator (is / contains / greater than / in range), and a value. The playlist auto-populates and stays current as the library grows. Que-Music's playlists are static, hand-built, M3U-backed lists.
- **Synced lyrics.** A dedicated lyrics page pulls from embedded tags or `.lrc` files; clicking a line seeks to that timestamp. Que-Music has no lyrics support at all.
- **10-band equalizer + ReplayGain.** Per-band EQ with pregain, plus loudness normalization so volume doesn't jump between tracks. Que-Music has a single volume slider only.
- **A real queue, separate from playlists.** Users build/reorder a listening queue on the fly; shuffle/repeat act on the queue. Que-Music conflates "the loaded playlist" and "the queue" into one thing.
- **Last.fm scrobbling** and **Discord Rich Presence** integration.
- **Resizable, always-on-top mini-player** with an efficiency mode.
- **Dynamic theming** — accent colors shift based on the currently-playing album's artwork.
- **Native Fluent Design chrome** — Mica/Acrylic backdrop materials, real Windows window blur.

## Where Que-Music already matches or is ahead

- **Folder-based library scanning with auto-organize** — both apps do this; roughly equivalent.
- **Embedded art extraction + online cover fetching** (MusicBrainz/Cover Art Archive) — Que-Music's Cover Fetcher does the same job Nagi's art services do.
- **M3U playlists** — Que-Music treats M3U as its native playlist storage (dual-stored in SQLite + `.m3u` files); Nagi treats M3U export as a secondary convenience feature, not primary storage.
- **Basic playback, favorites, recently played, search** — present and roughly equivalent on both sides.

## Why Nagi's UI reads as "smoother" / more professional

This isn't really a C# vs. JavaScript gap — it comes down to three concrete things:

1. **A real design-token system.** Nagi has a central `Colors.xaml` with DPI-aware sizing constants (card widths, image sizes, header padding, margins) as named, reused tokens — plus a dedicated color resource file *per page*. Nothing is a one-off hand-typed pixel value. Que-Music has CSS custom properties too, but far less disciplined: several views were found completely unstyled during the 2026-09 cleanup (`.track-item`/`.playlist-track` had zero CSS anywhere), and multiple overlapping/contradictory implementations of the same view existed simultaneously in the code (see `docs/issues/issues_track.md`, 2026-09-12 entry) — meaning some of what's on screen today literally never got its intended design pass finished.
2. **Native Fluent Design materials.** Mica/Acrylic backdrop blur and real OS-level window chrome are a WinUI/Windows-native capability. An Electron/Chromium shell like Que-Music's can approximate blur effects in CSS but can't fully replicate native backdrop materials — this is a platform ceiling, not a code-quality gap.
3. **Layered architecture reduces accidental inconsistency.** Nagi has a clean `Nagi.Core` service layer (interfaces + implementations, dependency injection, EF Core migrations) separate from the WinUI presentation layer. Que-Music's renderer scripts have accumulated multiple abandoned rewrites of the same feature sitting side by side (folder browsing, song lists, and artist/album views each had 2-3 dead parallel implementations before the 2026-09-12 cleanup) — a direct symptom of not having that separation enforced.

## Not a recommendation

Nothing above should be read as "build this next." It's a factual snapshot for Erich to pick from. Que-Music's own open items and priorities live in `docs/issues/issues_track.md`.

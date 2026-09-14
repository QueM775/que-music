# Que-Music Roadmap

Captures the "where does this app go next" discussion from 2026-09-12, after the Nagi comparison (see `compared.md`). This is a plan for Erich to steer, not a queue of things to build unprompted — nothing here gets started without an explicit go-ahead on that specific item.

## The core decision: rewrite vs. keep

Question on the table: given how much cruft the 2026-09-11/12 cleanup found (dead duplicate rewrites of the same features, several completely unstyled views, a live security bug, a backend function wired to a UI feature that didn't exist), is Que-Music worth continuing, or should it be rebuilt from scratch — possibly in a different stack like Nagi's WinUI/C#?

**Recommendation: keep the stack, keep the data layer, rebuild the renderer layer.**

Reasoning:
- **The foundation is sound.** The database schema, scanning logic, metadata extraction, and M3U handling were audited and found solid — correct transactions, no injection paths, no design flaws. That's real, working, tested-against-Erich's-actual-5000+-track-library code. Throwing it out to chase a different platform would discard the one part of the app that's actually earned trust.
- **The rot is contained to one layer.** Every serious defect found (duplicate dead implementations of folder browsing, song lists, and artist/album views; the `protectDOMFromDestruction` monkey-patch that never activated; the missing `reorderTracksInPlaylist` backend method) lives in the renderer/UI glue code — not the data layer. That's a symptom of patching forward without enforcing one way of doing things, not a fundamental architecture failure.
- **"Converting" to Nagi's stack isn't a real option.** WinUI 3 / C# / EF Core is a different language and platform. Anything that ends up looking like Nagi would be a ground-up rewrite, not a conversion — and that throws away the audited data layer for no reason tied to the actual problem.
- **A rewrite is the bigger risk, not the safer choice.** A fresh start doesn't guarantee discipline either — it just resets the clock until the same pattern (patch-and-move-on, no enforced consistency) reproduces itself, unless the actual habit changes.

## What "rebuild the renderer layer" means concretely

Not a rewrite of the UI from zero — a deliberate pass to kill the pattern that caused tonight's bugs:
1. One implementation per feature. No second dead copy of folder browsing, song lists, or artist/album views left sitting in the file "just in case." (Multiple dead copies of all three were removed 2026-09-12 — the goal is that this doesn't happen again.)
2. CSS token discipline like Nagi's `Colors.xaml` — named, reused sizing/spacing/color tokens instead of one-off hand-typed values, so a view can't ship half-styled the way `.track-item`/`.playlist-track` did.
3. A lint pass (`no-undef`, `no-dupe-class-members`) so a call to a method that doesn't exist, or a duplicate method silently shadowing another, gets caught before it ships — both bug classes hit tonight and both are mechanically preventable.

## Feature roadmap, pulled from the Nagi comparison

In rough priority order — not a commitment, a menu. See `compared.md` for the full feature-by-feature comparison this is drawn from. **Status legend: `[x]` done and live-verified, `[ ]` not started.** Update this list the same session anything on it changes state — don't let it drift back into "can't tell what's done."

- [x] **A real queue, separate from "the loaded playlist."** Built 2026-09-13 — see `docs/issues/issues_track.md`. `CoreAudio.queue` is now independent of `this.playlist`; queued tracks play next ahead of the playlist's own advancement.
- [x] **Plain-text lyrics.** No sync/karaoke — Erich doesn't use that. Checks embedded file tags first, falls back to LRCLIB on demand, caches in the database. Built 2026-09-13 — see `lyrics-feature.md`.
- [ ] **Rule-based smart playlists.** Field + operator + value (artist is X, genre contains Y, play count > Z) instead of only hand-built M3U lists. Biggest feature gap versus Nagi. **Next up.**
- [ ] **A real equalizer + loudness normalization.** Currently just a volume slider — no frequency bands, no ReplayGain. (Not to be confused with the visualizer in `visualizer.md`, which is a working audio-reactive display, not an EQ.)
- [ ] **Last.fm scrobbling / Discord Rich Presence** — smaller, self-contained integrations, good candidates once the core is stable.
- [ ] **Dynamic theming off album art, resizable mini-player** — polish-tier, lowest priority, highest effort-to-value ratio given Electron can't fully match native Fluent materials anyway.

Sidebar nav icon overhaul (duplicate icons fixed, per-icon accent colors, header icons recolored) was done 2026-09-14 as a UI polish pass outside this list — see `docs/issues/issues_track.md` for detail. Not a roadmap item, just logged so it's not lost.

## Not part of this roadmap

Native Windows chrome (Mica/Acrylic) requires a platform change (WinUI or similar) — that's a separate "do we want to become Windows-only" decision, not a checkbox on this list. Flagged in `compared.md`, not planned here.

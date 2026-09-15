# 5-Band Equalizer + Loudness Normalization — Design Spec

**Date**: 2026-09-15
**Status**: Approved by Erich, ready for implementation planning
**Roadmap item**: #4 in `docs/application/roadmap.md` ("A real equalizer + loudness normalization")
**Supersedes**: an earlier same-day draft of this file that split normalization into a separate follow-up cycle. Erich reviewed that draft and explicitly folded normalization into this build instead — this version replaces it outright.

## Purpose

Que-Music currently has only a single volume slider — no frequency-band control and no loudness consistency across tracks. This build adds both in one pass: a 5-band EQ (shape the sound) and ReplayGain-accurate loudness normalization (keep quiet and loud tracks at a consistent playback level).

## Decisions locked in during brainstorming

- **Band count**: 5 bands, not 10. Centered at 60Hz / 250Hz / 1kHz / 4kHz / 12kHz — standard 5-band spacing. Gain range ±12dB per band. No per-band Q control in v1 (fixed Q, one slider per band).
- **UI**: an EQ button on the player bar (next to volume) opens a **centered modal** (not a popover) with a backdrop. Modal contains: preset dropdown, the 5 sliders, a loudness-normalization checkbox toggle, and a Close button.
- **Presets**: included in v1. Fixed, hardcoded list — Flat, Rock, Pop, Bass Boost, Vocal. One-click apply; touching any slider afterward switches the dropdown to "Custom". No user-defined/saved custom presets — out of scope, keep it simple.
- **Scope**: one global EQ curve for all playback, not per-track or per-playlist. Matches how the volume slider already works.
- **Loudness normalization**: **in this build**, not deferred. ReplayGain-accurate — read embedded `REPLAYGAIN_TRACK_GAIN` tags where present (music-metadata already parses common tags during scanning); for tracks without a tag, compute loudness lazily the first time that track is played, then cache the result so it's never recomputed. A single on/off checkbox in the same modal controls whether normalization is applied at all.
- **Persistence**: EQ curve + preset name + normalization on/off are one global settings object, file-backed via the existing generic `getSetting`/`saveSetting` store (same mechanism as `playerState`/`layoutPrefs`), loaded at startup and applied before first playback. Per-track ReplayGain values are NOT part of that settings blob — they live on the `tracks` table in SQLite (see Data flow).

## Architecture — the audio graph fix (required, not optional)

This is the one piece of *existing* code this build has to change, not just extend. Today, `core-audio.js`'s Web Audio graph (`AudioContext` → `createMediaElementSource` → `AnalyserNode` → destination) is built inside `setupAudioContext()`, which is only ever called from `toggleVisualizer()` — meaning the graph only exists while the visualizer has been turned on at least once. `setupAudioContext()` is already idempotent (returns early if `this.audioContext` exists), which makes this fix straightforward.

This doesn't work for an EQ or normalization gain stage, which need to be in the signal path all the time, not just when the visualizer happens to be on. It also collides with a hard Web Audio API constraint: `createMediaElementSource()` can only ever be called once per `<audio>` element — once wrapped, playback is permanently routed through that graph, so the EQ and the visualizer must share one graph, not each try to own it.

**Fix**: make the graph permanent.
- Call `setupAudioContext()` once, early — at app init or on first playback (whichever fits `core-audio.js`'s current startup sequence) — instead of waiting for `toggleVisualizer()`.
- Fixed chain, in this order: `MediaElementSource → normalizationGainNode (ReplayGain offset, clamped ±12dB) → [5 chained BiquadFilterNode band filters, type 'peaking'] → AnalyserNode (visualizer taps here, untouched) → masterGainNode (existing volume control) → destination`.
- `toggleVisualizer()` becomes purely a UI/animation-loop concern — starts/stops reading from the (now-always-live) analyser, never touches `audioContext` lifecycle again.
- Any existing "restart visualizer" recovery affordance tied to a torn-down audio graph becomes unnecessary once this lands and should be removed in the same pass rather than left as dead UI.

## Components

- **`core-audio.js`** (extended): the permanent graph above, plus:
  - `setBandGain(bandIndex, dB)`, `applyPreset(name)`, `getEqualizerState()` — 5-band peaking filters, ±12dB, fixed Q.
  - `setNormalizationEnabled(bool)`, `applyReplayGainForTrack(track)` — sets the normalization `GainNode.gain.value` from the track's stored ReplayGain value (0 dB / unity if normalization is off or no value exists yet).
  - On track load, if the track has no stored ReplayGain value, kick off the lazy-compute path (below) in the background; current playback proceeds unnormalized until the value lands, then applies the gain live (`AudioParam`, no glitch/reconnect).
- **New `client/scripts/equalizer-ui.js`**: the EQ button (added next to the existing volume control) and the modal — 5 vertical sliders, preset dropdown, normalization checkbox, Close button. Follows the same small-focused-module pattern as `lyrics-ui.js` — owns its own DOM, talks to `core-audio.js` through the methods above.
- **`server/music-scanner.js`** (extended): read `REPLAYGAIN_TRACK_GAIN` (and fall back to `REPLAYGAIN_ALBUM_GAIN` if track-level is absent) from `music-metadata`'s parsed common tags during the existing scan pass; store on the track row if present. No new decode step added to the scan itself — this only reads tags already being parsed.
- **`server/database.js`** (extended): new nullable column `replaygain_gain REAL` on `tracks` (upsert-safe, consistent with the existing `addTracks()` upsert fix). New method to update a single track's value once lazily computed.
- **New lazy-compute path** (triggered from `core-audio.js` on first playback of a tag-less track): decode the track via Web Audio (`OfflineAudioContext`), measure loudness, compute the gain offset needed to hit the target reference level, persist it to `tracks.replaygain_gain` via IPC, and apply it to the live normalization `GainNode` for the track already playing.
- **Persistence (global EQ/preset/normalization-toggle state)**: new `settings:get-equalizer` / `settings:set-equalizer` IPC pair in `main.js`, mirroring the existing `settings:get-layout`/`settings:set-layout` pattern exactly (backed by the generic `getSetting`/`saveSetting` file store). Stores `{ bands: [5 numbers in dB], activePreset: string|null, normalizationEnabled: bool }`.

## Data flow

1. **EQ**: user drags a slider → `equalizer-ui.js` calls `core-audio.setBandGain(i, dB)` → sets `BiquadFilterNode.gain.value` directly (instant, no reconnect) → debounced call to `settings:set-equalizer` persists the whole state object.
2. **Presets**: user picks a preset → `applyPreset(name)` sets all 5 band gains from the hardcoded preset table → dropdown shows the preset name; touching any single slider afterward flips the dropdown to "Custom".
3. **Normalization toggle**: checkbox flips `normalizationEnabled` → `setNormalizationEnabled()` re-applies (or zeroes) the current track's gain immediately → persisted via the same `settings:set-equalizer` call.
4. **Per-track ReplayGain, tag path**: scan finds `REPLAYGAIN_TRACK_GAIN` → stored on `tracks.replaygain_gain` at scan time → read and applied whenever that track plays.
5. **Per-track ReplayGain, lazy path**: track has no tag and no cached value → plays unnormalized momentarily → background compute finishes → value applied live to the current `GainNode` and persisted to `tracks.replaygain_gain` so future plays skip the computation.
6. **Startup**: `main-app.js` loads the saved EQ/preset/normalization state via `settings:get-equalizer` and applies it to the filter chain as part of the (now-permanent) audio graph setup — same timing as `playerState` loads today.

## Error handling

- If the Web Audio graph fails to set up (existing try/catch in `setupAudioContext()`), EQ and normalization both become inert and playback still works via the plain `<audio>` element — same fallback the visualizer already has.
- If saved EQ/preset/normalization settings fail to load or are corrupt, fall back to flat EQ + normalization off, log a warning, don't crash.
- If lazy ReplayGain computation fails for a track (corrupt file, decode error), leave `replaygain_gain` null, log a warning, play unnormalized — don't retry every single playback, but don't cache a "known-bad" flag either (out of scope for v1; a future rescan naturally retries).
- Normalization gain is always clamped to ±12dB regardless of computed/tag value, so a bad or extreme tag can't produce a jarring volume jump.

## Testing

No unit-test framework fits audio/DOM work well here (consistent with the rest of this project's UI work). Verification is a live Electron launch, Playwright-driven, same approach used for the smart-playlist fixes:
- Open the EQ modal, move each slider, confirm the corresponding filter's actual `gain.value` changes.
- Click each preset, confirm it sets the expected 5 band values; confirm touching a slider after a preset switches the dropdown to "Custom".
- Toggle normalization off/on, confirm the normalization `GainNode`'s value zeroes/restores correctly.
- Play a track with an embedded ReplayGain tag, confirm the tag value is read and applied without a lazy-compute pass firing.
- Play a track with no tag, confirm it plays immediately (unnormalized), the lazy compute completes, gain is applied live, and the value is cached in `tracks.replaygain_gain` for the next play of that track.
- Relaunch the app, confirm the previously-saved EQ curve, preset, and normalization toggle reload and are actually applied to the graph (not just displayed in the UI).
- Confirm the visualizer still works correctly now that its lifecycle no longer owns the audio graph — toggle it on/off a few times, confirm no audio dropout and no "restart visualizer" symptom.

## Out of scope for this pass

- 10-band EQ — possible future follow-up, not built now.
- Per-band Q control.
- Per-track/per-playlist EQ curves — global only.
- User-defined/saved custom presets — fixed preset list only.
- A "known-bad" retry-skip flag for tracks that fail lazy ReplayGain computation.

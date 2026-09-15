# 5-Band Equalizer — Design Spec

**Date**: 2026-09-15
**Status**: Approved by Erich, ready for implementation planning
**Roadmap item**: #4 in `docs/application/roadmap.md` ("A real equalizer + loudness normalization" — split into two builds; this spec covers the EQ half only. Loudness normalization is a separate follow-up cycle.)

## Purpose

Que-Music currently has only a single volume slider — no frequency-band control at all. Add a 5-band equalizer so playback can be shaped (more bass, less treble, etc.), matching the baseline capability called out in the Nagi comparison (`docs/application/compared.md`), scoped down from Nagi's 10-band + pregain to 5 bands for a first pass. A 10-band version is an explicit possible follow-up, not part of this build.

## Decisions locked in during brainstorming

- **Band count**: 5 bands, not 10. Centered at 60Hz / 250Hz / 1kHz / 4kHz / 12kHz — standard 5-band spacing. Gain range ±12dB per band. No per-band Q control in v1 (fixed Q, keeps the UI to one slider per band).
- **UI placement**: a new toggle button next to the existing volume control in the player bar, opening a small panel with the 5 sliders. Not buried in Settings — meant to be quick to reach while listening.
- **Presets**: included in v1 (not deferred) — Flat, Bass Boost, Vocal Boost, Treble Boost. One-click apply, still overridable by hand afterward via the sliders.
- **Scope**: one global EQ curve for all playback, not per-track or per-playlist. Matches how the volume slider already works. Saved once, applied to everything.
- **Persistence**: settings-file-backed (same mechanism as `playerState`/`layoutPrefs`), loaded at startup and applied before first playback.

## Architecture — the audio graph fix

This is the one piece of *existing* code this build has to change, not just extend. Today, `core-audio.js`'s Web Audio graph (`AudioContext` → `createMediaElementSource` → `AnalyserNode` → destination) is created and torn down entirely inside `toggleVisualizer()` — it only exists while the visualizer is on. There's already a manual "restart visualizer" recovery flow in the code, which is a symptom of this lifecycle being fragile.

This doesn't work for an EQ, which needs to filter audio all the time, not just when the visualizer happens to be open. It also collides with a hard Web Audio API constraint: `createMediaElementSource()` can only ever be called once per `<audio>` element — once wrapped, playback is permanently routed through that graph, and there's no way to have the visualizer and the EQ each independently claim it.

**Fix**: make the graph permanent.
- `createMediaElementSource()` and the rest of the graph setup move out of `toggleVisualizer()` and happen once, early — at app init or on first playback, whichever is more natural given `core-audio.js`'s current startup sequence.
- Fixed chain: `MediaElementSource → [5 chained BiquadFilterNode band filters, type 'peaking'] → AnalyserNode (visualizer taps here) → GainNode (master volume) → destination`.
- `toggleVisualizer()` becomes purely a UI/animation-loop concern — starts/stops reading from the (now-always-live) analyser, never touches `audioContext` lifecycle again.
- The existing "restart visualizer" recovery button becomes unnecessary once this lands, since the bug it worked around (a torn-down, half-broken audio graph) no longer happens. Worth removing in the same pass rather than leaving dead recovery UI around.

## Components

- **`core-audio.js`** (extended): the permanent graph above, plus `setBandGain(bandIndex, dB)`, `applyPreset(name)`, `getEqualizerState()`. Filter setup as described (5 bands, peaking, ±12dB, fixed Q).
- **New `client/scripts/equalizer-ui.js`**: the toggle button (added next to the existing volume control) and the panel — 5 vertical sliders, a Reset/Flat button, and the 4 preset buttons. Follows the same small-focused-module pattern as `lyrics-ui.js` — owns its own DOM, talks to `core-audio.js` through the methods above.
- **Persistence**: new `settings:get-equalizer` / `settings:save-equalizer` IPC pair in `main.js`, mirroring the existing `playerState`/`layoutPrefs` pattern exactly (backed by the generic `getSetting`/`saveSetting` file-based settings store). Stores `{ enabled: bool, bands: [5 numbers in dB], activePreset: string|null }`.

## Data flow

1. User drags a slider → `equalizer-ui.js` calls `core-audio.setBandGain(i, dB)`.
2. `setBandGain` sets `BiquadFilterNode.gain.value` directly — it's an `AudioParam`, so this applies instantly with no graph reconnect.
3. `equalizer-ui.js` debounces the change and calls the new `settings:save-equalizer` IPC to persist it.
4. On startup, `main-app.js` loads the saved EQ state via `settings:get-equalizer` and applies it to the filter chain before/alongside audio context setup — same timing as `playerState` loads today.

## Error handling

- If the Web Audio graph fails to set up (already has a try/catch today), the EQ becomes inert and playback still works via the plain `<audio>` element — same fallback the visualizer already has.
- If saved EQ settings fail to load or are corrupt, fall back to flat/disabled, log a warning, don't crash.

## Testing

No unit-test framework fits audio/DOM work well here (consistent with the rest of this project's UI work). Verification is a live Electron launch, Playwright-driven, same approach used for this session's smart-playlist fixes:
- Open the EQ panel, move each slider, confirm the corresponding filter's actual `gain.value` changes.
- Click each preset, confirm it sets the expected 5 band values.
- Relaunch the app, confirm the previously-saved curve reloads and is actually applied to the filter chain (not just displayed in the UI).
- Confirm the visualizer still works correctly now that its lifecycle no longer owns the audio graph — toggle it on/off a few times, confirm no audio dropout or the old "restart" symptom.

## Out of scope for this pass

- 10-band EQ — explicit possible follow-up, not built now.
- Per-band Q control.
- Per-track/per-playlist EQ curves — global only.
- Loudness normalization / ReplayGain — separate roadmap item, its own spec/plan/implementation cycle after this one ships.

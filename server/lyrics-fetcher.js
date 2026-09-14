// server/lyrics-fetcher.js
// On-demand plain-text lyrics fetch from LRCLIB (free, no API key).
// See docs/application/lyrics-feature.md — plain text only, no synced/.lrc data.

const LRCLIB_BASE = 'https://lrclib.net/api';
const USER_AGENT = 'Que-Music (https://github.com/ErichQuade/que-music)';

// Lazy load fetch to handle native fetch (Electron 27/Node 18+) vs older
// environments — same pattern as server/cover-fetcher.js.
async function getFetch() {
  if (typeof fetch === 'undefined') {
    const { default: nodeFetch } = await import('node-fetch');
    return nodeFetch;
  }
  return fetch;
}

// Looks up plain-text lyrics for a track from LRCLIB. Returns the lyrics
// string, or null if LRCLIB has nothing for this track (a miss is not an
// error — most tracks simply won't have a match, or are instrumental).
async function fetchLyricsFromLRCLIB({ title, artist, album, duration }) {
  if (!title || !artist) {
    return null;
  }

  const fetchFn = await getFetch();

  // 1. Exact lookup via /get — title+artist required, album/duration sharpen the match.
  try {
    const params = new URLSearchParams({ track_name: title, artist_name: artist });
    if (album) params.set('album_name', album);
    if (duration) params.set('duration', String(Math.round(duration)));

    const res = await fetchFn(`${LRCLIB_BASE}/get?${params.toString()}`, {
      headers: { 'User-Agent': USER_AGENT },
    });

    if (res.ok) {
      const data = await res.json();
      if (data.instrumental) return null; // Confirmed instrumental — a real answer, not a miss
      if (data.plainLyrics) return data.plainLyrics;
    }
  } catch (err) {
    // Network hiccup — fall through and try search instead of failing outright
  }

  // 2. Fallback: /search, take the first result that actually has plain lyrics.
  try {
    const params = new URLSearchParams({ track_name: title, artist_name: artist });
    const res = await fetchFn(`${LRCLIB_BASE}/search?${params.toString()}`, {
      headers: { 'User-Agent': USER_AGENT },
    });

    if (res.ok) {
      const results = await res.json();
      const match = Array.isArray(results) ? results.find((r) => r.plainLyrics) : null;
      if (match) return match.plainLyrics;
    }
  } catch (err) {
    // Give up quietly — caller treats null as "nothing found"
  }

  return null;
}

module.exports = { fetchLyricsFromLRCLIB };

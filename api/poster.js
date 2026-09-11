/**
 * GET /api/poster?title=Saaho&year=2019
 *
 * Resolves a movie title to a poster image URL.
 *
 * Why this exists: the poster catalogues worth using (IMDb, TMDB) either send
 * no CORS headers or need a key, so the browser cannot call them directly.
 * This runs on Vercel, same-origin, and keeps any key server-side.
 *
 * Sources, in order:
 *   1. TMDB   — only if TMDB_API_KEY is set. Best coverage, especially for
 *              regional Indian cinema, and supports a real year filter.
 *   2. IMDb   — keyless autocomplete endpoint. Works with zero setup, but is
 *              popularity-ranked and returns at most ~8 rows.
 *
 * Never guesses: if the title is ambiguous (several films share it and no year
 * was supplied) it returns null and the site draws its own poster instead.
 *
 * Responses are cached at the edge for a week — posters do not change.
 */

const UA = 'MovieDrop/1.0 (+https://github.com/Ranjithsingh2004/Moviedrop)';
const TIMEOUT = 6000;

function norm(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')  // strip accents
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Punctuation-insensitive key, so "KGF: Chapter 2" matches IMDb's
// "K.G.F: Chapter 2" and "Spider-Man" matches "Spider Man".
function tight(s) {
  return norm(s).replace(/\s+/g, '');
}

function same(a, b) {
  return norm(a) === norm(b) || tight(a) === tight(b);
}

async function getJSON(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': UA, Accept: 'application/json' },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/* ── TMDB ──────────────────────────────────────────────────────────────── */
async function fromTMDB(title, year, key) {
  const qs = new URLSearchParams({ api_key: key, query: title, include_adult: 'false' });
  if (year) qs.set('year', String(year));

  const data = await getJSON('https://api.themoviedb.org/3/search/movie?' + qs);
  let results = (data && data.results) || [];
  if (!results.length) return null;

  let exact = results.filter((r) => same(r.title, title) || same(r.original_title, title));
  if (!exact.length) exact = results;

  if (year) {
    const y = Number(year);
    const sameYear = exact.filter((r) => Math.abs(Number((r.release_date || '').slice(0, 4)) - y) <= 1);
    if (!sameYear.length) return null;              // asked for a year, found none — do not guess
    exact = sameYear;
  } else if (exact.length > 1) {
    // Several films share this name and we were not told which — bail out
    // rather than show the wrong poster.
    const years = new Set(exact.map((r) => (r.release_date || '').slice(0, 4)).filter(Boolean));
    if (years.size > 1) return null;
  }

  exact.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
  const hit = exact.find((r) => r.poster_path);
  if (!hit) return null;

  return {
    url: 'https://image.tmdb.org/t/p/w500' + hit.poster_path,
    title: hit.title,
    year: (hit.release_date || '').slice(0, 4) || null,
    source: 'tmdb',
  };
}

/* ── IMDb ──────────────────────────────────────────────────────────────── */
const IMDB_KINDS = new Set(['movie', 'tvMovie', 'video', 'short', 'tvSeries', 'tvMiniSeries']);

function imdbSize(url) {
  // IMDb image URLs carry their render options in the filename.
  return String(url).replace(/\._V1_.*?(\.\w+)$/, '._V1_QL75_UX500_$1');
}

async function fromIMDb(title, year) {
  const slug = encodeURIComponent(title.trim().toLowerCase()).replace(/%20/g, '%20');
  const data = await getJSON(`https://v3.sg.media-imdb.com/suggestion/titles/x/${slug}.json?includeVideos=0`);
  const rows = (data && data.d) || [];
  if (!rows.length) return null;

  const candidates = rows.filter(
    (r) => IMDB_KINDS.has(r.qid) && r.i && r.i.imageUrl && same(r.l, title)
  );
  if (!candidates.length) return null;

  let pick;
  if (year) {
    const y = Number(year);
    pick = candidates.find((r) => Math.abs(Number(r.y) - y) <= 1);
    if (!pick) return null;                          // year given but unmatched — do not guess
  } else {
    const years = new Set(candidates.map((r) => r.y).filter(Boolean));
    if (years.size > 1) return null;                 // ambiguous without a year
    pick = candidates[0];
  }

  return {
    url: imdbSize(pick.i.imageUrl),
    title: pick.l,
    year: pick.y || null,
    source: 'imdb',
  };
}

/* ── Candidate listing (studio page) ───────────────────────────────────── */
// Unlike the single-poster path this deliberately does NOT filter to exact
// matches — a human is choosing, so show them everything and let them pick.
async function listCandidates(title, key) {
  const out = [];

  if (key) {
    const qs = new URLSearchParams({ api_key: key, query: title, include_adult: 'false' });
    const data = await getJSON('https://api.themoviedb.org/3/search/movie?' + qs);
    for (const r of ((data && data.results) || []).slice(0, 18)) {
      if (!r.poster_path) continue;
      out.push({
        url: 'https://image.tmdb.org/t/p/w500' + r.poster_path,
        title: r.title,
        year: (r.release_date || '').slice(0, 4) || null,
        extra: r.original_title && r.original_title !== r.title ? r.original_title : '',
        source: 'tmdb',
      });
    }
  }

  if (out.length < 6) {
    const slug = encodeURIComponent(title.trim().toLowerCase());
    const data = await getJSON(`https://v3.sg.media-imdb.com/suggestion/titles/x/${slug}.json?includeVideos=0`);
    for (const r of ((data && data.d) || [])) {
      if (!r.i || !r.i.imageUrl) continue;
      const url = imdbSize(r.i.imageUrl);
      if (out.some((o) => o.url === url)) continue;
      out.push({ url, title: r.l, year: r.y || null, extra: r.s || '', source: 'imdb' });
    }
  }

  return out;
}

/* ── Handler ───────────────────────────────────────────────────────────── */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Vary', 'Accept-Encoding');

  if (req.method === 'OPTIONS') return res.status(204).end();

  const title = String((req.query && req.query.title) || '').trim().slice(0, 120);
  const yearRaw = String((req.query && req.query.year) || '').trim();
  const year = /^(19|20)\d{2}$/.test(yearRaw) ? Number(yearRaw) : null;

  if (!title) {
    res.setHeader('Cache-Control', 'public, max-age=60');
    return res.status(400).json({ url: null, error: 'title required' });
  }

  const key = process.env.TMDB_API_KEY;

  // Studio mode: return every candidate so a person can choose.
  if (String((req.query && req.query.list) || '') === '1') {
    let results = [];
    try { results = await listCandidates(title, key); } catch { results = []; }
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=3600');
    return res.status(200).json({ results, tmdb: Boolean(key) });
  }

  let hit = null;
  try {
    if (key) hit = await fromTMDB(title, year, key);
    if (!hit) hit = await fromIMDb(title, year);
  } catch {
    hit = null;
  }

  // Cache misses briefly so a newly added film picks up its poster soon;
  // cache hits hard, since posters do not change.
  res.setHeader(
    'Cache-Control',
    hit
      ? 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000'
      : 'public, max-age=600, s-maxage=3600, stale-while-revalidate=86400'
  );

  return res.status(200).json(hit || { url: null });
}

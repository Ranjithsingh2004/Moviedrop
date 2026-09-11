# MovieDrop

A movie-drop page for **[@by_.meghana](https://www.instagram.com/by_.meghana/)**.
Visitors follow on Instagram to unlock the watch links. The movie list is read
live from a Google Sheet, so adding a film never means touching the code.

Static site — HTML, CSS and vanilla JS, no build step.

---

## Adding a movie

Open the Google Sheet and add a row. That's the whole job — the site picks it up
on the next page load.

| movie | ott | link | year *(optional)* |
|---|---|---|---|
| Saaho | Prime Video | https://… | 2019 |
| Psycho | YouTube | https://… | 2020 |

- **movie** — the title. Required; a row without one is skipped.
- **ott** — the platform. Spelling is forgiving: `primevideo`, `Prime Video`
  and `amazon prime` all come out as **Prime Video**.
- **link** — the watch URL. Leave it blank and the card shows
  *"Link coming soon"* instead of a dead link.
- **year** — optional, but **strongly recommended**. See below.

Blank rows are ignored. Duplicate title+year rows are ignored.

### Why the year matters

Lots of films share a name. *Psycho* is Hitchcock's 1960 film, a 1998 remake,
**and** Mysskin's 2020 Tamil film. Without a year the site cannot tell which one
you mean, so it refuses to guess and draws its own poster instead. Add the year
and it fetches the right one.

You can also write the year inline in the title — `Psycho (2020)` — if you'd
rather not keep a separate column. Only a trailing year in brackets counts, so
titles like *Blade Runner 2049* and *1917* stay intact.

### Forcing a specific poster

Add a **poster** column with a direct image URL. It overrides everything else.
Only needed when automatic lookup can't find the film.

---

## Posters

Three layers, so a card is never broken or blank:

1. **Your poster column**, if you set one.
2. **Automatic lookup** via `/api/poster` — queries IMDb (no key needed), or
   TMDB if a key is configured. It requires an exact title match and, when you
   supply a year, an exact year match. If the title is ambiguous it returns
   nothing rather than risk the wrong film.
3. **A generated poster**, drawn in the browser from the title. Always present
   underneath, so it shows instantly and survives any network failure.

### Optional: better coverage with TMDB

IMDb's free endpoint returns only its top few most-popular matches, so smaller
regional films sometimes aren't reachable. TMDB covers them properly.

1. Get a free API key at <https://www.themoviedb.org/settings/api>.
2. In Vercel → Project → Settings → Environment Variables, add
   `TMDB_API_KEY`.
3. Redeploy.

Nothing else changes; the code picks it up automatically.

---

## Deploying

Import the repo at [vercel.com](https://vercel.com/) and deploy. No framework,
no build command, no environment variables required.

The `/api/poster` function is the only server-side piece. On a host without
serverless functions the site detects that, stops calling it, and falls back to
Wikipedia and its own generated posters.

## Local preview

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000>. `/api/poster` won't exist locally, which is
fine — posters fall back exactly as they would on a static host.

---

## Files

```
index.html          markup
assets/styles.css   theme, layout, components
assets/app.js       sheet loading, poster logic, follow gate
api/poster.js       poster resolver (Vercel serverless function)
favicon.svg         brand mark
og-image.png        link preview card
vercel.json         caching + security headers
```

## The follow gate

"I've Followed" simply unlocks the page — there is no Instagram verification,
and the site never claims otherwise. The unlocked state is kept in
`localStorage`, so it survives refreshes on that device.

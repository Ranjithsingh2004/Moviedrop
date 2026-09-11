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

Finding that URL is what `/studio.html` is for — see **Studio** below.

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

## Studio

`/studio.html` is an owner-only poster picker. Search a title, see every
candidate with its year, tap the right one, and the image link is copied ready
to paste into the sheet's **poster** column. It also lists the films already in
your sheet and shows, per row, exactly what the live site will display —
a real poster, or a generated one.

Default passphrase: **`meghana-drop-2026`**

To change it, hash your new phrase and replace `PASS_HASH` at the top of
`assets/studio.js`. Run this in any browser console:

```js
crypto.subtle.digest('SHA-256', new TextEncoder().encode('your new phrase'))
  .then(b => console.log([...new Uint8Array(b)]
    .map(x => x.toString(16).padStart(2, '0')).join('')));
```

The passphrase runs in the browser, so anyone who reads the page source can get
past it. It keeps casual visitors out; it is not a security boundary. That is
fine here because the page only searches public poster catalogues and copies
links — it cannot change your sheet or the site. Don't put anything secret
behind it. The page is also marked `noindex`.

---

## The follow gate

The gate runs in two steps, and step two stays disabled until step one has
actually happened:

1. **Follow @by_.meghana** — opens Instagram in a new tab.
2. **I've Followed — Unlock Movies** — inert until the visitor has been sent to
   Instagram, then enabled when they come back.

"Came back" is detected by the page becoming visible again. Some in-app
browsers never fire that event, so a 4-second timer after the tap enables the
button regardless — better a determined faker gets through than a real follower
gets stranded behind a dead button.

This raises the cost of skipping the follow. It does not verify one, and the
site never claims it does. Real verification is not possible from a web page:
Meta's only follow-status field, `is_user_follow_business`, requires the person
to have messaged your account first, so it is reachable from DM automation
(ManyChat and similar) and nowhere else.

Unlock state and gate progress are kept in `localStorage`, behind `try/catch`
so private mode and in-app browsers degrade quietly.

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
index.html          the public page
studio.html         owner-only poster picker
assets/styles.css   theme, layout, components
assets/app.js       sheet loading, poster logic, follow gate
assets/studio.css   studio styles
assets/studio.js    studio logic
api/poster.js       poster resolver + candidate search (Vercel function)
favicon.svg         brand mark
og-image.png        link preview card
vercel.json         caching + security headers
```


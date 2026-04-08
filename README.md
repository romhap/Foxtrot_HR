# Foxtrot HR — Recruiter Finder

A vibrant, single-page tool for finding the right HR contact at any company.
Type a company name, pick your track (Early Career or Executive), and get
pre-built LinkedIn people-search links targeting the most relevant recruiters.

## Run it

No build step. Just open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Files

- `index.html` — markup
- `styles.css` — glassmorphic, animated UI
- `script.js` — builds LinkedIn search URLs per track
- `assets/foxtrot-logo.svg` — brand mark

## How it works

Each track has a curated list of HR role keywords. On submit, the tool builds
a LinkedIn people-search URL of the form:

```
https://www.linkedin.com/search/results/people/?keywords=<company>+<role-keywords>
```

Early Career targets University / Campus / Early Talent recruiters.
Executive targets Heads of Talent, VPs of People, and Chief People Officers.

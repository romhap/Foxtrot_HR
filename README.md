# Foxtrot HR — Recruiter Finder

A vibrant single-page tool that finds the **one** HR/recruiting person you
should message on LinkedIn for any company. Type a company, pick a track
(Early Career or Executive), and Foxtrot returns a single contact card with
a name, title, direct LinkedIn link, reasoning, and confidence level.

Under the hood it uses the Claude API with web search to identify a real,
currently-employed person — no manual LinkedIn hunting required.

## Setup

```bash
npm install
cp .env.example .env
# edit .env and set ANTHROPIC_API_KEY
```

## Run

```bash
npm start
# → http://localhost:3000
```

Then open the URL, type a company, and hit **Early Career** (green) or
**Executive** (red).

## How it works

- `server.js` exposes `POST /api/find-recruiter` with `{company, track}`.
- It calls `claude-opus-4-6` with:
  - Adaptive thinking (`thinking: {type: 'adaptive'}`)
  - High effort (`output_config.effort: 'high'`)
  - Web search (`web_search_20260209`, up to 6 uses)
  - A strict JSON schema via `output_config.format`
- The model researches the web, picks **one** real person, and returns
  `{name, title, linkedin_url, reasoning, confidence}`.
- The frontend renders it as a single animated contact card.

## Files

| File | Purpose |
|---|---|
| `server.js` | Express backend + Claude API integration |
| `index.html` | Markup |
| `styles.css` | Glassmorphic, animated UI |
| `script.js` | Calls the backend, renders the contact card |
| `assets/foxtrot-logo.svg` | Brand mark |

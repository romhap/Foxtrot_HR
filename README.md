# Foxtrot HR — Recruiter Finder

A vibrant single-page tool that finds the **one** HR/recruiting person you
should message on LinkedIn for any company. Type a company, pick a track
(Early Career or Executive), and Foxtrot returns a single contact card with
a name, title, direct LinkedIn link, reasoning, and confidence level.

Under the hood it calls the Claude API (with web search) directly from your
browser — no backend to host, no server to keep running.

## Use it (static)

1. Open `index.html` in any browser, or serve the folder with any static
   file server (e.g. `python3 -m http.server`, Vercel, GitHub Pages, etc.).
2. Click the **gear icon** in the top-right and paste your Anthropic API key.
   Get one at [console.anthropic.com](https://console.anthropic.com/settings/keys).
   The key is stored only in your browser's `localStorage` and is sent only
   to `api.anthropic.com`.
3. Type a company, pick **Early Career** (green) or **Executive** (red).

## How it works

- `script.js` imports the `@anthropic-ai/sdk` from `esm.sh` and calls
  `claude-opus-4-6` directly from the browser with:
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
| `index.html` | Markup + API-key modal |
| `styles.css` | Glassmorphic, animated UI |
| `script.js` | Calls Claude directly, renders the contact card |
| `assets/foxtrot-logo.svg` | Brand mark |
| `server.js` | Optional — a legacy Express proxy if you'd rather not expose the key in the browser |

## Optional: run with a proxy server

If you don't want the API key to live in the browser, you can run the
included `server.js`, which proxies the Claude call server-side. In that
mode you'd edit `script.js` to POST to `/api/find-recruiter` instead of
calling the SDK directly.

```bash
npm install
ANTHROPIC_API_KEY=sk-ant-... npm start
```

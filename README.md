# Foxtrot HR — Recruiter Finder

A vibrant single-page tool that finds the **one** HR/recruiting person you
should message on LinkedIn for any company. Type a company, pick a track
(Early Career or Executive), and Foxtrot returns a single contact card with
a name, title, direct LinkedIn link, reasoning, and confidence level.

Under the hood it calls **either Anthropic or OpenAI** (you pick) directly
from your browser — no backend to host, no server to keep running.

## Use it (static)

1. Open `index.html` in any browser, or serve the folder with any static
   file server (e.g. `python3 -m http.server`, Vercel, GitHub Pages, etc.).
2. Click the **gear icon** in the top-right. In the modal:
   - Pick your provider: **Anthropic** (Claude Opus 4.6) or **OpenAI** (GPT-5).
   - Paste the matching API key and hit **Save key**.
   - Both keys are stored separately in `localStorage`, so you can switch
     providers any time without re-pasting.
3. Type a company, pick **Early Career** (green) or **Executive** (red).

Keys are only ever sent to the provider you selected
(`api.anthropic.com` or `api.openai.com`). Nothing else.

## How it works

- `script.js` imports both SDKs from `esm.sh` (`@anthropic-ai/sdk` and
  `openai`) and dispatches to whichever provider you've picked.
- **Anthropic path** — `claude-opus-4-6` with adaptive thinking, the
  `web_search_20260209` tool (up to 6 uses), and a strict JSON schema via
  `output_config.format`.
- **OpenAI path** — `gpt-5` via the Responses API with the built-in
  `web_search` tool and a strict `json_schema` response format.
- Both models research the web, pick **one** real person, and return
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

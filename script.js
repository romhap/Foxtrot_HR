/* ============================================================
   Foxtrot HR — Recruiter Finder (frontend)
   Calls the Anthropic API directly from the browser using the
   user's own API key (stored in localStorage). Claude's
   built-in web_search tool does the actual research.
   ============================================================ */

import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.40.0';

const STORAGE_KEY = 'foxtrot_hr_api_key';

const form = document.getElementById('search-form');
const companyInput = document.getElementById('company');
const resultsEl = document.getElementById('results');
const trackButtons = document.querySelectorAll('.track-btn');

const settingsBtn = document.getElementById('settings-btn');
const settingsModal = document.getElementById('settings-modal');
const settingsBackdrop = document.getElementById('settings-backdrop');
const settingsClose = document.getElementById('settings-close');
const settingsForm = document.getElementById('settings-form');
const apiKeyInput = document.getElementById('api-key-input');
const settingsClear = document.getElementById('settings-clear');
const settingsStatus = document.getElementById('settings-status');

let pendingTrack = 'early';
let inFlight = false;

const TRACK_META = {
  early: { label: 'Early Career', chipClass: 'early' },
  executive: { label: 'Executive', chipClass: 'executive' },
};

/* ---------- Claude config (mirrors the old server.js) ---------- */

const RESULT_SCHEMA = {
  type: 'object',
  properties: {
    name: {
      type: 'string',
      description: "The person's full name (first + last).",
    },
    title: {
      type: 'string',
      description: 'Their exact current job title at the target company.',
    },
    linkedin_url: {
      type: 'string',
      description:
        "A direct LinkedIn profile URL of the form https://www.linkedin.com/in/<slug>. If you cannot find a direct profile URL with high confidence, return a LinkedIn people-search URL pre-scoped to this person's name and company.",
    },
    reasoning: {
      type: 'string',
      description:
        'One or two sentences explaining why this person is the right contact for this specific track at this specific company.',
    },
    confidence: {
      type: 'string',
      enum: ['high', 'medium', 'low'],
      description:
        'high = verified active at the company and role clearly matches; medium = likely but not fully verified; low = best guess, user should double-check.',
    },
  },
  required: ['name', 'title', 'linkedin_url', 'reasoning', 'confidence'],
  additionalProperties: false,
};

const TRACK_BRIEFS = {
  early: {
    label: 'Early Career',
    description:
      'early-career, new-grad, university, campus, internship, or junior-level roles',
    target_titles:
      'University Recruiter, Campus Recruiter, Early Career Recruiter, Early Talent Program Manager, Technical Recruiter (Early Career), or similar',
  },
  executive: {
    label: 'Executive',
    description:
      'executive, leadership, director, VP, or C-suite level roles',
    target_titles:
      'Executive Recruiter, Head of Talent Acquisition, Director of Talent Acquisition, VP of People/Talent, Chief People Officer, or similar senior TA leader',
  },
};

const SYSTEM_PROMPT = `You are an expert talent-acquisition researcher. Your single job is to identify the ONE best HR / recruiting person at a specific company that a job-seeker should contact directly on LinkedIn.

Rules:
1. Use web_search to find a real, currently-employed, identifiable person. Search LinkedIn, the company's careers site, press releases, and team pages.
2. Return exactly ONE person — the best match, not a list.
3. Strongly prefer people whose title clearly matches the requested track. Do not default to generic "People Ops" or HRBP roles unless they genuinely own hiring for that track.
4. Provide a direct LinkedIn profile URL (https://www.linkedin.com/in/<slug>) whenever possible. If you can't verify a specific slug, fall back to a LinkedIn people-search URL pre-scoped to the person's name + company.
5. Be honest about confidence. If you're guessing, say low.
6. Never invent names. If no suitable person can be found, return the closest verified fit with confidence "low" and explain in the reasoning.`;

/* ---------- API key management ---------- */

function getApiKey() {
  return localStorage.getItem(STORAGE_KEY) || '';
}

function setApiKey(key) {
  if (key) localStorage.setItem(STORAGE_KEY, key);
  else localStorage.removeItem(STORAGE_KEY);
  updateSettingsIndicator();
}

function updateSettingsIndicator() {
  if (!settingsBtn) return;
  settingsBtn.classList.toggle('has-key', !!getApiKey());
}

function openSettings() {
  apiKeyInput.value = getApiKey();
  settingsStatus.textContent = '';
  settingsModal.classList.add('is-open');
  settingsModal.setAttribute('aria-hidden', 'false');
  setTimeout(() => apiKeyInput.focus(), 60);
}

function closeSettings() {
  settingsModal.classList.remove('is-open');
  settingsModal.setAttribute('aria-hidden', 'true');
}

settingsBtn?.addEventListener('click', openSettings);
settingsBackdrop?.addEventListener('click', closeSettings);
settingsClose?.addEventListener('click', closeSettings);

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && settingsModal.classList.contains('is-open')) {
    closeSettings();
  }
});

settingsForm?.addEventListener('submit', (e) => {
  e.preventDefault();
  const val = apiKeyInput.value.trim();
  if (!val) {
    settingsStatus.textContent = 'Please paste a key or click "Clear" to remove.';
    return;
  }
  if (!val.startsWith('sk-ant-')) {
    settingsStatus.textContent = 'That doesn\'t look like an Anthropic key (should start with sk-ant-).';
    return;
  }
  setApiKey(val);
  settingsStatus.textContent = 'Saved. Your key lives only in this browser.';
  setTimeout(closeSettings, 700);
});

settingsClear?.addEventListener('click', () => {
  setApiKey('');
  apiKeyInput.value = '';
  settingsStatus.textContent = 'Cleared.';
});

updateSettingsIndicator();

/* ---------- Track selection + submit ---------- */

trackButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    pendingTrack = btn.dataset.track;
  });
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (inFlight) return;

  const company = companyInput.value.trim();
  if (!company) {
    shakeInput();
    return;
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    renderError('Add your Anthropic API key first (gear icon, top right).');
    openSettings();
    return;
  }

  setLoading(company, pendingTrack);
  inFlight = true;
  setFormDisabled(true);

  try {
    const data = await findRecruiter(apiKey, company, pendingTrack);
    renderPerson(data);
  } catch (err) {
    renderError(friendlyError(err));
  } finally {
    inFlight = false;
    setFormDisabled(false);
  }
});

/* ---------- Claude call (browser-side) ---------- */

async function findRecruiter(apiKey, company, track) {
  const brief = TRACK_BRIEFS[track];
  if (!brief) throw new Error('Track must be "early" or "executive".');

  const cleanCompany = company.trim().slice(0, 120);
  const userPrompt = `Company: ${cleanCompany}
Track: ${brief.label} — ${brief.description}
Ideal titles to look for: ${brief.target_titles}

Find the SINGLE best HR / recruiting person currently at ${cleanCompany} who I should message on LinkedIn about a ${brief.label.toLowerCase()} job. I will contact this person directly, so accuracy matters more than breadth. Return exactly one person in the required JSON shape.`;

  const client = new Anthropic({
    apiKey,
    dangerouslyAllowBrowser: true,
  });

  const message = await client.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 16000,
    thinking: { type: 'adaptive' },
    system: SYSTEM_PROMPT,
    tools: [
      {
        type: 'web_search_20260209',
        name: 'web_search',
        max_uses: 6,
      },
    ],
    output_config: {
      format: { type: 'json_schema', schema: RESULT_SCHEMA },
      effort: 'high',
    },
    messages: [{ role: 'user', content: userPrompt }],
  });

  const textBlock = message.content.find((b) => b.type === 'text');
  if (!textBlock) throw new Error('Model returned no text output.');

  let data;
  try {
    data = JSON.parse(textBlock.text);
  } catch {
    throw new Error('Model output was not valid JSON.');
  }

  return { company: cleanCompany, track, ...data };
}

function friendlyError(err) {
  const msg = err?.message || 'Something went wrong.';
  if (/401|authentication|invalid.*key/i.test(msg)) {
    return 'Invalid API key. Click the gear icon to update it.';
  }
  if (/429|rate.?limit/i.test(msg)) {
    return 'Rate limited by Anthropic. Try again in a moment.';
  }
  if (/cors|network|failed to fetch/i.test(msg)) {
    return 'Network error reaching Anthropic. Check your connection and key.';
  }
  return msg;
}

/* ---------- UI rendering ---------- */

function setFormDisabled(disabled) {
  trackButtons.forEach((b) => {
    b.disabled = disabled;
    b.classList.toggle('is-loading', disabled);
  });
  companyInput.disabled = disabled;
}

function setLoading(company, track) {
  const meta = TRACK_META[track];
  resultsEl.innerHTML = `
    <div class="result-header">
      <span>Searching for</span>
      <span class="chip ${meta.chipClass}">${meta.label}</span>
      <span class="result-company">${escapeHTML(company)}</span>
    </div>
    <div class="contact-card skeleton">
      <div class="sk-avatar"></div>
      <div class="sk-lines">
        <div class="sk-line sk-line-lg"></div>
        <div class="sk-line sk-line-md"></div>
        <div class="sk-line sk-line-sm"></div>
      </div>
    </div>
    <div class="loading-hint">
      <span class="dot"></span>
      <span class="dot"></span>
      <span class="dot"></span>
      <span class="loading-text">Foxtrot is researching the web for the perfect contact…</span>
    </div>
  `;
  resultsEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function renderPerson(data) {
  const {
    name = 'Unknown',
    title = '',
    linkedin_url = '#',
    reasoning = '',
    confidence = 'medium',
    company = '',
    track = 'early',
  } = data;

  const meta = TRACK_META[track] || TRACK_META.early;
  const initials = getInitials(name);

  resultsEl.innerHTML = `
    <div class="result-header">
      <span>Your contact at</span>
      <span class="result-company">${escapeHTML(company)}</span>
      <span class="chip ${meta.chipClass}">${meta.label}</span>
    </div>

    <a class="contact-card" href="${escapeAttr(linkedin_url)}" target="_blank" rel="noopener noreferrer">
      <div class="avatar">
        <span class="avatar-initials">${escapeHTML(initials)}</span>
        <div class="avatar-ring"></div>
      </div>

      <div class="contact-body">
        <div class="contact-name">${escapeHTML(name)}</div>
        <div class="contact-title">${escapeHTML(title)}</div>
        <div class="contact-reason">${escapeHTML(reasoning)}</div>

        <div class="contact-meta">
          <span class="confidence conf-${escapeAttr(confidence)}">
            <span class="conf-dot"></span>
            ${escapeHTML(confidence)} confidence
          </span>
          <span class="linkedin-badge">
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M20.5 2h-17A1.5 1.5 0 002 3.5v17A1.5 1.5 0 003.5 22h17a1.5 1.5 0 001.5-1.5v-17A1.5 1.5 0 0020.5 2zM8 19H5V9h3zM6.5 7.7a1.7 1.7 0 110-3.4 1.7 1.7 0 010 3.4zM19 19h-3v-5.3c0-1.3-.5-2.2-1.7-2.2a1.8 1.8 0 00-1.7 1.2 2.3 2.3 0 00-.1.8V19h-3V9h3v1.3a3 3 0 012.7-1.5c2 0 3.5 1.3 3.5 4.1z"/>
            </svg>
            Open in LinkedIn
          </span>
        </div>
      </div>

      <svg class="card-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M7 17L17 7M9 7h8v8"/>
      </svg>
    </a>
  `;

  resultsEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function renderError(msg) {
  resultsEl.innerHTML = `
    <div class="error-card">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <path d="M12 8v5M12 16.5v.01"/>
      </svg>
      <div>
        <div class="error-title">Couldn't fetch a contact</div>
        <div class="error-msg">${escapeHTML(msg)}</div>
      </div>
    </div>
  `;
}

function getInitials(name) {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function escapeHTML(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(s) {
  return escapeHTML(s);
}

function shakeInput() {
  companyInput.animate(
    [
      { transform: 'translateX(0)' },
      { transform: 'translateX(-8px)' },
      { transform: 'translateX(8px)' },
      { transform: 'translateX(-6px)' },
      { transform: 'translateX(6px)' },
      { transform: 'translateX(0)' },
    ],
    { duration: 420, easing: 'ease-in-out' }
  );
  companyInput.focus();
}

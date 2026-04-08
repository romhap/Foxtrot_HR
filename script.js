/* ============================================================
   Foxtrot HR — Recruiter Finder (frontend)
   Calls Anthropic OR OpenAI directly from the browser using
   the user's own API key (stored in localStorage). Both models
   use their built-in web_search tool to do the research.
   ============================================================ */

import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.40.0';
import OpenAI from 'https://esm.sh/openai@5';

/* ---------- Storage keys ---------- */
const STORAGE = {
  provider: 'foxtrot_hr_provider',
  anthropic: 'foxtrot_hr_key_anthropic',
  openai: 'foxtrot_hr_key_openai',
};

/* ---------- Provider registry ---------- */
const PROVIDERS = {
  anthropic: {
    label: 'Anthropic',
    model: 'Claude Opus 4.6',
    placeholder: 'sk-ant-...',
    prefix: 'sk-ant-',
    prefixHint: 'should start with sk-ant-',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    keyUrlLabel: 'console.anthropic.com',
  },
  openai: {
    label: 'OpenAI',
    model: 'GPT-5',
    placeholder: 'sk-... or sk-proj-...',
    prefix: 'sk-',
    prefixHint: 'should start with sk- (and not sk-ant-)',
    keyUrl: 'https://platform.openai.com/api-keys',
    keyUrlLabel: 'platform.openai.com',
  },
};

/* ---------- DOM refs ---------- */
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
const apiKeyLabel = document.getElementById('api-key-label');
const settingsClear = document.getElementById('settings-clear');
const settingsStatus = document.getElementById('settings-status');
const providerPills = document.querySelectorAll('.provider-pill');
const settingsKeyLink = document.getElementById('settings-key-link');

let pendingTrack = 'early';
let inFlight = false;
let activeProvider = getProvider();

const TRACK_META = {
  early: { label: 'Early Career', chipClass: 'early' },
  executive: { label: 'Executive', chipClass: 'executive' },
};

/* ---------- Shared prompt + schema ---------- */

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

function buildUserPrompt(company, track) {
  const brief = TRACK_BRIEFS[track];
  const cleanCompany = company.trim().slice(0, 120);
  return {
    cleanCompany,
    prompt: `Company: ${cleanCompany}
Track: ${brief.label} — ${brief.description}
Ideal titles to look for: ${brief.target_titles}

Find the SINGLE best HR / recruiting person currently at ${cleanCompany} who I should message on LinkedIn about a ${brief.label.toLowerCase()} job. I will contact this person directly, so accuracy matters more than breadth. Return exactly one person in the required JSON shape.`,
  };
}

/* ---------- Provider / key storage ---------- */

function getProvider() {
  const p = localStorage.getItem(STORAGE.provider);
  return p === 'openai' ? 'openai' : 'anthropic';
}

function setProvider(p) {
  localStorage.setItem(STORAGE.provider, p);
  activeProvider = p;
  updateSettingsIndicator();
}

function getKey(provider) {
  return localStorage.getItem(STORAGE[provider]) || '';
}

function setKey(provider, key) {
  if (key) localStorage.setItem(STORAGE[provider], key);
  else localStorage.removeItem(STORAGE[provider]);
  updateSettingsIndicator();
}

function updateSettingsIndicator() {
  if (!settingsBtn) return;
  settingsBtn.classList.toggle('has-key', !!getKey(activeProvider));
}

/* ---------- Settings modal ---------- */

function applyProviderToModal(provider) {
  const meta = PROVIDERS[provider];
  apiKeyLabel.textContent = `${meta.label} API Key`;
  apiKeyInput.placeholder = meta.placeholder;
  apiKeyInput.value = getKey(provider);
  settingsKeyLink.href = meta.keyUrl;
  settingsKeyLink.textContent = meta.keyUrlLabel;
  providerPills.forEach((p) => {
    const isActive = p.dataset.provider === provider;
    p.classList.toggle('is-active', isActive);
    p.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });
  settingsStatus.textContent = '';
}

function openSettings() {
  applyProviderToModal(activeProvider);
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

providerPills.forEach((pill) => {
  pill.addEventListener('click', () => {
    const p = pill.dataset.provider;
    if (!PROVIDERS[p]) return;
    setProvider(p);
    applyProviderToModal(p);
  });
});

settingsForm?.addEventListener('submit', (e) => {
  e.preventDefault();
  const val = apiKeyInput.value.trim();
  const meta = PROVIDERS[activeProvider];
  if (!val) {
    settingsStatus.textContent = 'Paste a key or click "Clear" to remove.';
    return;
  }
  if (activeProvider === 'anthropic' && !val.startsWith('sk-ant-')) {
    settingsStatus.textContent = `That doesn't look like an Anthropic key (${meta.prefixHint}).`;
    return;
  }
  if (activeProvider === 'openai' && (!val.startsWith('sk-') || val.startsWith('sk-ant-'))) {
    settingsStatus.textContent = `That doesn't look like an OpenAI key (${meta.prefixHint}).`;
    return;
  }
  setKey(activeProvider, val);
  settingsStatus.textContent = `Saved. Your ${meta.label} key lives only in this browser.`;
  setTimeout(closeSettings, 700);
});

settingsClear?.addEventListener('click', () => {
  setKey(activeProvider, '');
  apiKeyInput.value = '';
  settingsStatus.textContent = `Cleared ${PROVIDERS[activeProvider].label} key.`;
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

  const apiKey = getKey(activeProvider);
  if (!apiKey) {
    renderError(`Add your ${PROVIDERS[activeProvider].label} API key first (gear icon, top right).`);
    openSettings();
    return;
  }

  setLoading(company, pendingTrack);
  inFlight = true;
  setFormDisabled(true);

  try {
    const data = await findRecruiter(activeProvider, apiKey, company, pendingTrack);
    renderPerson(data);
  } catch (err) {
    renderError(friendlyError(err));
  } finally {
    inFlight = false;
    setFormDisabled(false);
  }
});

/* ---------- findRecruiter dispatch ---------- */

async function findRecruiter(provider, apiKey, company, track) {
  const brief = TRACK_BRIEFS[track];
  if (!brief) throw new Error('Track must be "early" or "executive".');

  const { cleanCompany, prompt } = buildUserPrompt(company, track);

  const data =
    provider === 'openai'
      ? await callOpenAI(apiKey, prompt)
      : await callAnthropic(apiKey, prompt);

  return { company: cleanCompany, track, ...data };
}

/* ---------- Anthropic ---------- */

async function callAnthropic(apiKey, userPrompt) {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });

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

  try {
    return JSON.parse(textBlock.text);
  } catch {
    throw new Error('Model output was not valid JSON.');
  }
}

/* ---------- OpenAI (Responses API + web_search + json_schema) ---------- */

async function callOpenAI(apiKey, userPrompt) {
  const client = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });

  if (!client.responses || typeof client.responses.create !== 'function') {
    throw new Error(
      'OpenAI SDK is missing the Responses API. Hard-refresh the page to pull the latest bundle.'
    );
  }

  const response = await client.responses.create({
    model: 'gpt-5',
    instructions: SYSTEM_PROMPT,
    input: userPrompt,
    tools: [{ type: 'web_search' }],
    text: {
      format: {
        type: 'json_schema',
        name: 'recruiter',
        strict: true,
        schema: RESULT_SCHEMA,
      },
    },
  });

  // Prefer the SDK's output_text helper; fall back to traversing output blocks.
  let text = response.output_text;
  if (!text && Array.isArray(response.output)) {
    for (const item of response.output) {
      if (item.type === 'message' && Array.isArray(item.content)) {
        for (const c of item.content) {
          if (c.type === 'output_text' && typeof c.text === 'string') {
            text = (text || '') + c.text;
          }
        }
      }
    }
  }
  if (!text) throw new Error('Model returned no text output.');

  try {
    return JSON.parse(text);
  } catch {
    throw new Error('Model output was not valid JSON.');
  }
}

/* ---------- Error formatting ---------- */

function friendlyError(err) {
  // Try to dig out the most useful structured info the SDKs provide.
  const status = err?.status ?? err?.response?.status;
  const code = err?.code ?? err?.error?.code;
  const type = err?.type ?? err?.error?.type;
  const apiMsg = err?.error?.message || err?.message || 'Something went wrong.';

  // Insufficient quota — OpenAI returns 429 for this, but it is NOT
  // retryable: the user needs to add billing / credits.
  if (
    code === 'insufficient_quota' ||
    type === 'insufficient_quota' ||
    /insufficient[_\s]quota|exceeded your current quota|billing/i.test(apiMsg)
  ) {
    return 'Your OpenAI account has no available quota. Add billing or credits at platform.openai.com/account/billing, then try again.';
  }

  // Model not found / not accessible to this account.
  if (
    status === 404 ||
    code === 'model_not_found' ||
    /model.*(not found|does not exist|not available)/i.test(apiMsg)
  ) {
    return `Model not available to this key: ${apiMsg}`;
  }

  // Actual rate limit (retryable).
  if (status === 429 || /rate[_\s]?limit/i.test(apiMsg)) {
    return `Rate limited. ${apiMsg}`;
  }

  // Auth.
  if (
    status === 401 ||
    /401|authentication|invalid.*api.*key|incorrect api key/i.test(apiMsg)
  ) {
    return 'Invalid API key. Click the gear icon to update it.';
  }

  // Network.
  if (/cors|network|failed to fetch|load failed/i.test(apiMsg)) {
    return 'Network error reaching the model. Check your connection and key.';
  }

  // Anything else — show the real message so the cause is visible.
  return apiMsg;
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
  const provMeta = PROVIDERS[activeProvider];
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
      <span class="loading-text">${escapeHTML(provMeta.model)} is researching the web for the perfect contact…</span>
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

/* ============================================================
   Foxtrot HR — Recruiter Finder (frontend)
   Calls the /api/find-recruiter backend which uses Claude +
   web search to identify the single best HR contact.
   ============================================================ */

const form = document.getElementById('search-form');
const companyInput = document.getElementById('company');
const resultsEl = document.getElementById('results');
const trackButtons = document.querySelectorAll('.track-btn');

let pendingTrack = 'early';
let inFlight = false;

const TRACK_META = {
  early: { label: 'Early Career', chipClass: 'early' },
  executive: { label: 'Executive', chipClass: 'executive' },
};

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

  setLoading(company, pendingTrack);
  inFlight = true;
  setFormDisabled(true);

  try {
    const resp = await fetch('/api/find-recruiter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ company, track: pendingTrack }),
    });

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      throw new Error(data.error || `Request failed (${resp.status})`);
    }
    renderPerson(data);
  } catch (err) {
    renderError(err.message || 'Something went wrong.');
  } finally {
    inFlight = false;
    setFormDisabled(false);
  }
});

function setFormDisabled(disabled) {
  trackButtons.forEach((b) => {
    b.disabled = disabled;
    b.classList.toggle('is-loading', disabled);
  });
  companyInput.disabled = disabled;
}

/** Loading state — skeleton card with shimmer. */
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

/** Render the single recommended person. */
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

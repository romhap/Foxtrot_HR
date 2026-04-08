/* ============================================================
   Foxtrot HR — Recruiter Finder
   Builds LinkedIn people-search URLs targeted at HR recruiters
   ============================================================ */

const form = document.getElementById('search-form');
const companyInput = document.getElementById('company');
const resultsEl = document.getElementById('results');

/**
 * Role presets per track. Each entry becomes a LinkedIn people
 * search scoped to the company, using tailored keywords.
 */
const TRACKS = {
  early: {
    label: 'Early Career',
    blurb: 'University & campus hires · New-grad programs',
    roles: [
      {
        role: 'University Recruiter',
        desc: 'Owns campus pipelines and new-grad hiring',
        keywords: '"University Recruiter"',
      },
      {
        role: 'Campus Recruiter',
        desc: 'On-campus events, interns, rotational programs',
        keywords: '"Campus Recruiter"',
      },
      {
        role: 'Early Career Talent Acquisition',
        desc: 'Early-in-career, intern & new-grad specialist',
        keywords: '"Early Career" AND ("Talent Acquisition" OR Recruiter)',
      },
      {
        role: 'Early Talent Program Manager',
        desc: 'Runs intern & new-grad rotational programs',
        keywords: '"Early Talent" AND (Program OR Manager)',
      },
      {
        role: 'Technical Recruiter (New Grad)',
        desc: 'Tech new-grad & intern pipelines',
        keywords: '"Technical Recruiter" AND ("New Grad" OR "Early Career" OR Intern)',
      },
    ],
  },
  executive: {
    label: 'Executive',
    blurb: 'Leadership, VP & C-suite search',
    roles: [
      {
        role: 'Executive Recruiter',
        desc: 'Director+ and leadership hiring',
        keywords: '"Executive Recruiter"',
      },
      {
        role: 'Head of Talent Acquisition',
        desc: 'Owns the full TA org — ideal for senior asks',
        keywords: '"Head of Talent Acquisition"',
      },
      {
        role: 'Director of Talent Acquisition',
        desc: 'Senior-level hiring leader',
        keywords: '"Director of Talent Acquisition"',
      },
      {
        role: 'VP of People / Talent',
        desc: 'People org leadership, strategic hires',
        keywords: '("VP People" OR "VP of Talent" OR "VP Talent Acquisition")',
      },
      {
        role: 'Chief People Officer',
        desc: 'Top of the HR function',
        keywords: '"Chief People Officer"',
      },
    ],
  },
};

/** Build a LinkedIn people-search URL scoped to a company + keywords. */
function buildLinkedInURL(company, keywords) {
  // Use LinkedIn's keyword-scoped people search.
  // Format: keywords = "<Company> <role-keywords>"
  const q = `${company} ${keywords}`.trim();
  const encoded = encodeURIComponent(q);
  return `https://www.linkedin.com/search/results/people/?keywords=${encoded}&origin=GLOBAL_SEARCH_HEADER`;
}

/** Clear the results area with a quick fade. */
function clearResults() {
  resultsEl.innerHTML = '';
}

/** Render results for a given track + company. */
function renderResults(trackKey, company) {
  const track = TRACKS[trackKey];
  if (!track) return;

  clearResults();

  const header = document.createElement('div');
  header.className = 'result-header';
  header.innerHTML = `
    <span>Results for</span>
    <span class="chip ${trackKey}">${track.label}</span>
    <span style="color:var(--ink);font-weight:600;letter-spacing:0.02em;text-transform:none;">
      ${escapeHTML(company)}
    </span>
  `;
  resultsEl.appendChild(header);

  track.roles.forEach((r) => {
    const a = document.createElement('a');
    a.className = 'result-link';
    a.href = buildLinkedInURL(company, r.keywords);
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.innerHTML = `
      <div class="li-icon">in</div>
      <div class="meta">
        <div class="role">${escapeHTML(r.role)}</div>
        <div class="desc">${escapeHTML(r.desc)}</div>
      </div>
      <svg class="arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M7 17L17 7M9 7h8v8"/>
      </svg>
    `;
    resultsEl.appendChild(a);
  });

  // Smooth scroll into view on small screens
  requestAnimationFrame(() => {
    resultsEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
}

/** Minimal HTML escape for user-provided text. */
function escapeHTML(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Shake the input when empty. */
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

// Handle both buttons — whichever was clicked submits the form with its data-track
let pendingTrack = 'early';
document.querySelectorAll('.track-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    pendingTrack = btn.dataset.track;
  });
});

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const company = companyInput.value.trim();
  if (!company) {
    shakeInput();
    return;
  }
  renderResults(pendingTrack, company);
});

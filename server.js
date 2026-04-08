/**
 * Foxtrot HR — Recruiter Finder
 *
 * Express backend that uses the Claude API with web search to identify
 * the single most appropriate HR contact at a given company for either
 * an early-career or executive job request.
 */

import express from 'express';
import Anthropic from '@anthropic-ai/sdk';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '64kb' }));
app.use(express.static(__dirname));

const client = new Anthropic();

/** JSON schema — Claude must return exactly this shape. */
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
        "high = verified active at the company and role clearly matches; medium = likely but not fully verified; low = best guess, user should double-check.",
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

app.post('/api/find-recruiter', async (req, res) => {
  const { company, track } = req.body ?? {};

  if (typeof company !== 'string' || !company.trim()) {
    return res.status(400).json({ error: 'Missing or invalid "company".' });
  }
  if (!TRACK_BRIEFS[track]) {
    return res
      .status(400)
      .json({ error: 'Track must be "early" or "executive".' });
  }

  const brief = TRACK_BRIEFS[track];
  const cleanCompany = company.trim().slice(0, 120);

  const userPrompt = `Company: ${cleanCompany}
Track: ${brief.label} — ${brief.description}
Ideal titles to look for: ${brief.target_titles}

Find the SINGLE best HR / recruiting person currently at ${cleanCompany} who I should message on LinkedIn about a ${brief.label.toLowerCase()} job. I will contact this person directly, so accuracy matters more than breadth. Return exactly one person in the required JSON shape.`;

  try {
    const stream = client.messages.stream({
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

    const message = await stream.finalMessage();

    // Find the final text block — with output_config.format it's guaranteed
    // to be valid JSON matching our schema.
    const textBlock = message.content.find((b) => b.type === 'text');
    if (!textBlock) {
      return res
        .status(502)
        .json({ error: 'Model returned no text output.' });
    }

    let data;
    try {
      data = JSON.parse(textBlock.text);
    } catch {
      return res
        .status(502)
        .json({ error: 'Model output was not valid JSON.' });
    }

    return res.json({
      company: cleanCompany,
      track,
      ...data,
    });
  } catch (err) {
    console.error('[find-recruiter] error:', err);
    if (err instanceof Anthropic.AuthenticationError) {
      return res
        .status(500)
        .json({ error: 'Invalid ANTHROPIC_API_KEY on the server.' });
    }
    if (err instanceof Anthropic.RateLimitError) {
      return res
        .status(429)
        .json({ error: 'Rate limited. Please retry in a moment.' });
    }
    const msg =
      err instanceof Anthropic.APIError
        ? `API error ${err.status}: ${err.message}`
        : err?.message || 'Unknown server error';
    return res.status(500).json({ error: msg });
  }
});

app.listen(PORT, () => {
  console.log(`Foxtrot HR running at http://localhost:${PORT}`);
});

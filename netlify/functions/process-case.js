// process-case.js
// Netlify Function: single-output case processing
//
// OUTPUT 1 — fullAnalysis: complete EFRM OSCE master chat format 
//
// ENV VARS REQUIRED:
//   ANTHROPIC_API_KEY  — Claude API key
//   ADMIN_TOKEN        — secret admin password (set in Netlify dashboard)

exports.handler = async (event) => {

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  const token = event.headers['x-admin-token'] || '';
  if (!token || token !== process.env.ADMIN_TOKEN) {
    return { statusCode: 401, body: 'Unauthorised' };
  }

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, body: 'Invalid JSON' }; }

  const { rawNotes, station } = body;
  if (!rawNotes || rawNotes.trim().length < 20) {
    return { statusCode: 400, body: 'rawNotes too short' };
  }

  // Light identity sanitisation — names like Pinki/Parmeshwar, titles
  const sanitised = rawNotes
    .replace(/\b[A-Z][a-z]+\/[A-Z][a-z]+\b/g, '[patient/partner]')
    .replace(/\b(Mr|Mrs|Ms|Dr|Master|Miss)\s+[A-Z][a-z]+\b/g, '[patient]')
    .trim();

  const systemPrompt = `You are an expert EFRM OSCE educator and reproductive medicine subspecialist.
You receive raw clinical notes from an IVF clinic.
You produce one structured JSON response — no markdown, no preamble, valid JSON only.

OUTPUT STRUCTURE:
{
  "fullAnalysis": {
    "patientSummary": "brief anonymised patient summary",
    Include high yield, most relevant domains only.
    "domains": [
      {
        "domainNumber": 1,
        "domainTitle": "domain name",
        "pico": "PICO question for this decision point",
        "evidenceBenchmark": "relevant ESHRE/RCOG/NICE/ASRM guidelines and what they say in the format guideline - year - bullet points not sentences",
        "clinicalDecisionMade": "what was done / decided in this case in bullet points format not sentences",
        "guidelineVerdict": "aligned / deviation / gap",
        "verdictExplanation": "why — referenced to guideline in the format guideline - year - bullet point not sentences",
       "topExaminerProbes": [
  {
    "question": "...",
    "modelAnswer": "..."
  }
]
      }
    ],
   "keyErrorsAndLearning": [
  {
    "error": "error description",
    "guidelineRef": "guideline citation"
  }
]
  },
}

RULES:
- fullAnalysis should be concise, structured, and educationally high-yield
- If response risks truncation, prioritize completing valid JSON over elaboration
- Prioritize concise completion over exhaustive detail
- Prefer abbreviated outputs to avoid truncation
- Return compact valid JSON rapidly
- domains: EXACTLY 3 highest-yield domains only
- EXACTLY 3 questions per domain in topExaminerProbes
- keyErrorsAndLearning: maximum 6 highest-yield items total
- modelAnswer: maximum 50 words
- Every verdict must reference a specific guideline
- Keep evidenceBenchmark concise, structured, in bullet points, maximum 60 words, no sentences
- Keep verdictExplanation crisp, short, high yield, in bullet points, no sentences
- modelAnswer in topExaminerProbes must include the ESHRE guideline name and year`;

  const userPrompt = `EFRM Station: ${station || 'unspecified'}

Raw clinical notes:
${sanitised}

Produce concise output optimized for fast response time.

  let claudeResponse;
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 3200,
        messages: [{ role: 'user', content: userPrompt }],
        system: systemPrompt
      })
    });

    if (!res.ok) {
      console.error('Claude API error:', await res.text());
      return { statusCode: 502, body: 'Claude API error' };
    }

    claudeResponse = await res.json();
  } catch (err) {
    console.error('Fetch error:', err);
    return { statusCode: 502, body: 'Network error' };
  }

  const rawOutput = claudeResponse?.content?.[0]?.text || '';

  let parsed;
  try {
    const cleaned = rawOutput.replace(/```json|```/g, '').trim();
   const firstBrace = cleaned.indexOf('{');
const lastBrace = cleaned.lastIndexOf('}');

const repaired = cleaned.slice(firstBrace, lastBrace + 1);

parsed = JSON.parse(repaired);
  } catch {
    // Return raw for manual review if JSON parse fails
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw: rawOutput, parseError: true })
    };
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fullAnalysis: parsed.fullAnalysis
    })
  };
};


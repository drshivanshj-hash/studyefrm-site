// process-case.js
// Netlify Function: dual-output case processing
//
// OUTPUT 1 — fullAnalysis: complete EFRM OSCE master chat format (for admin learning)
// OUTPUT 2 — teachingCard: stripped universal error-pattern format (for website publishing)
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
You produce TWO separate outputs in a single JSON response — no markdown, no preamble, valid JSON only.

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
        "evidenceBenchmark": "relevant ESHRE/RCOG/NICE/ASRM guideline and what it says",
        "clinicalDecisionMade": "what was done / decided in this case",
        "guidelineVerdict": "aligned / deviation / gap",
        "verdictExplanation": "why — referenced to guideline",
        "examinerProbes": ["probe 1", "probe 2", "probe 3"]
      }
    ],
    "scorecard": [
      { "decision": "decision description", "verdict": "✅ or ⚠️ or ❌", "guidelineRef": "guideline citation" }
    ],
    "keyErrorsAndLearning": ["error 1", "error 2", "error 3"],
    "top3ExaminerQuestions": [
      { "station": "Station N", "question": "examiner question", "modelAnswer": "concise ESHRE-based answer in 2-3 sentences maximum" }
    ]
  },
  "teachingCard": {
    "title": "brief anonymised clinical title",
    "station": "${station || 'unspecified'}",
    "scenario": "anonymised clinical scenario — no names, no exact dates, no locations below country level",
    "commonError": "the universal clinical error any practitioner might make — framed impersonally",
    "eshreAnchor": "the specific ESHRE guideline + year + what it says",
    "nextStepGaps": ["gap 1", "gap 2", "gap 3"],
    "examinerChallenges": ["question 1", "question 2", "question 3"]
  }
}

RULES:
- fullAnalysis should be concise, structured, and educationally high-yield
- teachingCard is for public website — universal, anonymised, no personal clinical detail
- Every verdict must reference a specific guideline
- Keep evidenceBenchmark concise, structured, in bullet points
- Keep verdictExplanation crisp, short, high yield
- examinerChallenges must be phrased as examiner questions (second person, interrogative)
- commonError must be framed as something ANY clinician could do — not "you did X"
- modelAnswer in top3ExaminerQuestions must include the ESHRE guideline name and year`;

  const userPrompt = `EFRM Station: ${station || 'unspecified'}

Raw clinical notes:
${sanitised}

Produce concise output optimized for fast response time.
Keep only:
- key diagnosis
- core reasoning
- ESHRE-aligned management
- 3 teaching points`;

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
        max_tokens: 1500,
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
    parsed = JSON.parse(cleaned);
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
      fullAnalysis: parsed.fullAnalysis,
      teachingCard: parsed.teachingCard
    })
  };
};


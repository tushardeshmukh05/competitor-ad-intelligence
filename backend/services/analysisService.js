/**
 * analysisService
 * ---------------
 * Generates a structured creative breakdown for an ad using an
 * OpenAI-compatible Chat Completions API.
 *
 * Works with OpenAI, OpenRouter, Together, Groq, Ollama/LM Studio, etc.
 * If no OPENAI_API_KEY is configured, it falls back to a deterministic
 * heuristic analysis so the app stays fully functional offline.
 */

const OpenAI = require('openai');

const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const API_KEY = process.env.OPENAI_API_KEY;
const BASE_URL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';

const FIELDS = [
  'hook',
  'offer',
  'cta_type',
  'angle',
  'audience',
  'audience_intent',
  'funnel_stage',
  'emotional_trigger',
  'summary',
];

let client = null;
if (API_KEY) {
  client = new OpenAI({ apiKey: API_KEY, baseURL: BASE_URL });
}

function buildPrompt(ad) {
  return `You are a senior performance-marketing strategist analyzing a competitor's Meta/Facebook ad.

Analyze this ad and respond ONLY with a JSON object containing these exact keys:
- hook: the attention-grabbing opening idea (short phrase)
- offer: the core offer or value proposition
- cta_type: classify the CTA (e.g. "Direct Response", "Soft / Educational", "Lead Gen")
- angle: the primary marketing angle (e.g. Performance, Discount, Nostalgia, Sustainability)
- audience: the most likely target audience
- audience_intent: "High", "Medium", or "Low"
- funnel_stage: "Awareness", "Consideration", or "Decision"
- emotional_trigger: the dominant emotion the ad leverages
- summary: one concise sentence summarizing the creative strategy

AD DATA:
Competitor: ${ad.competitor}
Page: ${ad.page_name}
Headline: ${ad.headline}
Ad copy: ${ad.ad_copy}
CTA button: ${ad.cta}
Media type: ${ad.media_type}
Country: ${ad.country}
Running days: ${ad.running_days}

Respond with JSON only, no markdown fences.`;
}

/** Deterministic fallback so the feature works without an API key. */
function heuristicAnalysis(ad) {
  const copy = `${ad.headline} ${ad.ad_copy}`.toLowerCase();

  const hasDiscount = /%|off|sale|free|bogo|deal|save/.test(copy);
  const isVideo = ad.media_type === 'video';

  const ctaType = /shop|buy|order|get/i.test(ad.cta || '')
    ? 'Direct Response'
    : 'Soft / Educational';

  const funnel = hasDiscount
    ? 'Decision'
    : ctaType === 'Direct Response'
    ? 'Consideration'
    : 'Awareness';

  return {
    hook: ad.headline || 'N/A',
    offer: hasDiscount ? 'Promotional / discount offer' : 'Product benefit',
    cta_type: ctaType,
    angle: hasDiscount ? 'Discount / Urgency' : isVideo ? 'Performance' : 'Lifestyle',
    audience: `${ad.competitor} customers`,
    audience_intent: funnel === 'Decision' ? 'High' : 'Medium',
    funnel_stage: funnel,
    emotional_trigger: hasDiscount ? 'FOMO' : 'Aspiration',
    summary: `Heuristic read: a ${ad.media_type} ad using a ${
      hasDiscount ? 'discount-led' : 'benefit-led'
    } angle aimed at the ${funnel.toLowerCase()} stage. (Set OPENAI_API_KEY for AI-powered analysis.)`,
    _source: 'heuristic',
  };
}

function normalize(parsed, ad) {
  const out = {};
  for (const key of FIELDS) {
    out[key] = parsed[key] != null ? String(parsed[key]) : '';
  }
  out._source = 'ai';
  // never let the model drop the hook entirely
  if (!out.hook) out.hook = ad.headline || '';
  return out;
}

/**
 * Analyze a single ad. Always resolves to a full analysis object.
 * @param {object} ad
 * @returns {Promise<object>}
 */
async function analyzeAd(ad) {
  if (!client) {
    return heuristicAnalysis(ad);
  }

  try {
    const completion = await client.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: 'system',
          content:
            'You are a precise marketing analyst that always responds with valid JSON.',
        },
        { role: 'user', content: buildPrompt(ad) },
      ],
      temperature: 0.4,
      response_format: { type: 'json_object' },
    });

    const text = completion.choices?.[0]?.message?.content || '{}';
    const cleaned = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    return normalize(parsed, ad);
  } catch (err) {
    console.error('[analysisService] AI call failed, using heuristic:', err.message);
    return { ...heuristicAnalysis(ad), _source: 'heuristic-fallback', _error: err.message };
  }
}

module.exports = { analyzeAd, heuristicAnalysis, FIELDS };

import { GoogleGenerativeAI } from '@google/generative-ai';
import { GUIDE_SYSTEM_PROMPT } from './prompts/guidePrompt';
import type { GuideObservation, MemoryEntry, DataSummary } from './types';

const GEMINI_MODEL = 'gemini-2.0-flash';
const OPENAI_MODEL = process.env.OPENAI_FINANCE_MODEL || 'gpt-4o-mini';

function normalizeObservation(raw: string): GuideObservation {
  const cleaned = raw
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  const parsed = JSON.parse(cleaned) as GuideObservation;
  if (!parsed.severity || !parsed.observation || !parsed.suggested_action) {
    throw new Error('Malformed AI observation payload');
  }
  if (!['info', 'warning', 'priority'].includes(parsed.severity)) {
    parsed.severity = 'info';
  }
  return parsed;
}

async function callOpenAiGuide(userMessage: string, apiKey: string): Promise<GuideObservation> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    signal: AbortSignal.timeout(20_000),
    body: JSON.stringify({
      model: OPENAI_MODEL,
      temperature: 0.3,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: GUIDE_SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenAI Guide failed (${response.status}): ${errText}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('Empty response from OpenAI Guide');
  return normalizeObservation(content);
}

async function callGeminiGuide(userMessage: string, apiKey: string): Promise<GuideObservation> {
  const client = new GoogleGenerativeAI(apiKey);
  const model = client.getGenerativeModel({
    model: GEMINI_MODEL,
    systemInstruction: GUIDE_SYSTEM_PROMPT,
  });
  const result = await model.generateContent(userMessage);
  return normalizeObservation(result.response.text().trim());
}

export async function getGuideObservation(
  dataSummary: DataSummary,
  memoryHistory: MemoryEntry[],
): Promise<GuideObservation> {
  const last10 = memoryHistory.slice(0, 10);
  const memorySection =
    last10.length > 0
      ? `\n\nPAST OBSERVATIONS (newest first):\n${JSON.stringify(last10, null, 2)}`
      : '\n\nPAST OBSERVATIONS: none yet.';

  const userMessage = `CURRENT STATE:\n${JSON.stringify(dataSummary, null, 2)}${memorySection}

Based on the current state and past observations, give me your single most important observation right now. Respond with valid JSON only — no markdown, no code fences.`;

  const openaiKey = process.env.OPENAI_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;

  try {
    if (openaiKey) {
      return await callOpenAiGuide(userMessage, openaiKey);
    }
    if (geminiKey) {
      return await callGeminiGuide(userMessage, geminiKey);
    }
    throw new Error('Neither OPENAI_API_KEY nor GEMINI_API_KEY is configured.');
  } catch (err) {
    console.error('[aiGuide] Error:', err);
    return {
      severity: 'info',
      observation: 'Guide is temporarily offline. Check your AI API key and try refreshing.',
      suggested_action: 'Verify .env.local contains a valid OPENAI_API_KEY or GEMINI_API_KEY.',
    };
  }
}

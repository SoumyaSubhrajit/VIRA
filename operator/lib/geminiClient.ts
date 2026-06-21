import { GoogleGenerativeAI } from '@google/generative-ai';
import { GUIDE_SYSTEM_PROMPT } from './prompts/guidePrompt';
import type { GuideObservation, MemoryEntry, DataSummary } from './types';

const MODEL_NAME = 'gemini-2.0-flash';

function getClient(): GoogleGenerativeAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set in environment variables.');
  return new GoogleGenerativeAI(apiKey);
}

export async function getGuideObservation(
  dataSummary: DataSummary,
  memoryHistory: MemoryEntry[]
): Promise<GuideObservation> {
  const client = getClient();
  const model = client.getGenerativeModel({
    model: MODEL_NAME,
    systemInstruction: GUIDE_SYSTEM_PROMPT,
  });

  const last10 = memoryHistory.slice(0, 10);
  const memorySection =
    last10.length > 0
      ? `\n\nPAST OBSERVATIONS (newest first):\n${JSON.stringify(last10, null, 2)}`
      : '\n\nPAST OBSERVATIONS: none yet.';

  const userMessage = `CURRENT STATE:\n${JSON.stringify(dataSummary, null, 2)}${memorySection}

Based on the current state and past observations, give me your single most important observation right now. Respond with valid JSON only — no markdown, no code fences.`;

  try {
    const result = await model.generateContent(userMessage);
    const text = result.response.text().trim();

    // Strip markdown code fences if model wraps anyway
    const cleaned = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();

    const parsed = JSON.parse(cleaned) as GuideObservation;

    // Validate structure
    if (!parsed.severity || !parsed.observation || !parsed.suggested_action) {
      throw new Error('Malformed response from Gemini');
    }
    if (!['info', 'warning', 'priority'].includes(parsed.severity)) {
      parsed.severity = 'info';
    }

    return parsed;
  } catch (err) {
    console.error('[geminiClient] Error:', err);
    return {
      severity: 'info',
      observation: 'Guide is temporarily offline. Check your GEMINI_API_KEY and try refreshing.',
      suggested_action: 'Verify .env.local contains a valid GEMINI_API_KEY.',
    };
  }
}

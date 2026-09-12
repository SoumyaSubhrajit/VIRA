const NOTION_API_BASE = 'https://api.notion.com/v1';
export const NOTION_VERSION = '2026-03-11';

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH';
  body?: Record<string, unknown>;
};

export class NotionApiError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) {
    super(message);
    this.name = 'NotionApiError';
  }
}

export function notionToken(): string | null {
  const token = process.env.NOTION_TOKEN?.trim();
  return token || null;
}

export async function notionRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const token = notionToken();
  if (!token) throw new NotionApiError('NOTION_TOKEN is not configured.', 401, 'missing_token');

  const response = await fetch(`${NOTION_API_BASE}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    cache: 'no-store',
  });

  const data = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    const message = typeof data.message === 'string' ? data.message : `Notion API returned HTTP ${response.status}.`;
    throw new NotionApiError(message, response.status, typeof data.code === 'string' ? data.code : undefined);
  }
  return data as T;
}

export function textContent(content: string) {
  return [{ type: 'text', text: { content: content.slice(0, 2000) } }];
}

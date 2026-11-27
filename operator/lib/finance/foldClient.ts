import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  clearFoldResponseCache,
  clearStoredFoldTokens,
  getCachedFoldResponse,
  getStoredFoldTokens,
  saveStoredFoldTokens,
  setCachedFoldResponse,
} from './foldAuthStore';

export { clearFoldResponseCache };

export interface FoldTokenData {
  access_token: string;
  token_type: string;
  expires_in?: number;
  scope?: string;
  refresh_token?: string;
  issuer?: string;
  expires_at?: number;
}

export interface FoldSpendingCategory {
  category_id: string;
  category_name: string;
  amount: number;
  percentage_of_total: number;
  transaction_count: number;
}

export interface FoldSpendingSummary {
  month: number;
  year: number;
  total_amount: number;
  categories: FoldSpendingCategory[];
  untagged?: {
    amount: number;
    percentage_of_total: number;
    transaction_count: number;
  };
  no_merchant?: {
    amount: number;
    percentage_of_total: number;
    transaction_count: number;
  };
}

export interface FoldTransaction {
  id: string;
  account_id: string;
  amount: number;
  effective_amount: number;
  currency: string;
  type: 'DEBIT' | 'CREDIT';
  date: string;
  merchant_name: string | null;
  narration: string | null;
  category: {
    id: string;
    name: string;
    subcategory?: { id: string; name: string } | null;
  } | null;
  notes?: string | null;
}

export interface FoldTotalBalance {
  as_of: string;
  currency: string;
  total: number;
  included_accounts: Array<{
    id: string;
    bank_name: string;
    balance: number;
  }>;
}

export interface FoldNetWorth {
  as_of: string;
  currency: string;
  total: number;
  groups: {
    liquid: number;
    investments: number;
    debt: number;
    other: number;
  };
  assets: Array<{
    amount: number;
    class: string;
    included_accounts: Array<{
      account_id: string;
      display_name: string;
      issuer: string;
      last_four: string;
    }>;
  }>;
}

function getMcpAuthTokensPath(): string | null {
  if (process.env.VERCEL) return null;
  const customConfigDir = process.env.MCP_REMOTE_CONFIG_DIR;
  const baseDir = customConfigDir || path.join(os.homedir(), '.mcp-auth', 'mcp-remote-v1');
  if (!fs.existsSync(/*turbopackIgnore: true*/ baseDir)) return null;

  try {
    const files = fs.readdirSync(/*turbopackIgnore: true*/ baseDir);
    const tokenFile = files.find((file) => file.endsWith('_tokens.json'));
    return tokenFile ? path.join(baseDir, tokenFile) : null;
  } catch {
    return null;
  }
}

function getMcpAuthClientInfo(): { client_id: string; issuer?: string } | null {
  if (process.env.VERCEL) return null;
  const customConfigDir = process.env.MCP_REMOTE_CONFIG_DIR;
  const baseDir = customConfigDir || path.join(os.homedir(), '.mcp-auth', 'mcp-remote-v1');
  if (!fs.existsSync(/*turbopackIgnore: true*/ baseDir)) return null;

  try {
    const files = fs.readdirSync(/*turbopackIgnore: true*/ baseDir);
    const clientFile = files.find((file) => file.endsWith('_client_info.json'));
    if (!clientFile) return null;
    const content = fs.readFileSync(/*turbopackIgnore: true*/ path.join(baseDir, clientFile), 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

let activeRefreshPromise: Promise<string | null> | null = null;

async function doRefreshToken(params: {
  refreshToken: string;
  clientId: string;
  issuer: string;
  onSuccess: (refreshed: { access_token: string; expires_in: number; refresh_token?: string; token_type: string; scope?: string }) => Promise<void> | void;
  onInvalidGrant?: () => Promise<void> | void;
}): Promise<string | null> {
  const tokenEndpoint = `${params.issuer || 'https://mcp.fold.money'}/oauth/token`;
  try {
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: params.refreshToken,
      client_id: params.clientId,
      resource: params.issuer || 'https://mcp.fold.money',
    });

    const res = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('[FoldClient] Token refresh failed HTTP', res.status, errText);
      if (res.status === 400 && errText.includes('invalid_grant')) {
        await params.onInvalidGrant?.();
      }
      return null;
    }

    const refreshed = (await res.json()) as {
      access_token: string;
      expires_in: number;
      refresh_token?: string;
      token_type: string;
      scope?: string;
    };

    await params.onSuccess(refreshed);
    return refreshed.access_token;
  } catch (err) {
    console.error('[FoldClient] Token refresh error:', err);
    return null;
  }
}

async function refreshFoldTokenWithLock(force = false): Promise<string | null> {
  if (activeRefreshPromise) {
    return activeRefreshPromise;
  }

  activeRefreshPromise = (async () => {
    // 1. Check VIRA's isolated SQLite token store first
    const stored = await getStoredFoldTokens();
    if (stored) {
      const isStillValid = !force && stored.expiresAt > Date.now() + 90_000;
      if (isStillValid) return stored.accessToken;
      if (!stored.refreshToken) return null;

      return await doRefreshToken({
        refreshToken: stored.refreshToken,
        clientId: stored.clientId,
        issuer: stored.issuer,
        onSuccess: async (refreshed) => {
          await saveStoredFoldTokens({
            clientId: stored.clientId,
            accessToken: refreshed.access_token,
            refreshToken: refreshed.refresh_token || stored.refreshToken,
            tokenType: refreshed.token_type,
            scope: refreshed.scope ?? stored.scope,
            issuer: stored.issuer,
            expiresAt: Date.now() + (refreshed.expires_in * 1000),
          });
        },
        onInvalidGrant: async () => {
          await clearStoredFoldTokens();
        },
      });
    }

    // 2. Fallback: legacy .mcp-auth file if present
    const tokenFilePath = getMcpAuthTokensPath();
    if (!tokenFilePath) return null;

    try {
      const content = fs.readFileSync(/*turbopackIgnore: true*/ tokenFilePath, 'utf-8');
      const tokenData = JSON.parse(content) as FoldTokenData;
      if (!tokenData.refresh_token) return null;

      const clientInfo = getMcpAuthClientInfo();
      const clientId = clientInfo?.client_id || 'mcp_E3E2lN1XqYDZ9OALX3DYTfYiAPzBpudgA3NZ3OlbeqY';
      const issuer = tokenData.issuer || 'https://mcp.fold.money';

      return await doRefreshToken({
        refreshToken: tokenData.refresh_token,
        clientId,
        issuer,
        onSuccess: async (refreshed) => {
          await saveStoredFoldTokens({
            clientId,
            accessToken: refreshed.access_token,
            refreshToken: refreshed.refresh_token || tokenData.refresh_token,
            tokenType: refreshed.token_type,
            scope: refreshed.scope ?? tokenData.scope,
            issuer,
            expiresAt: Date.now() + (refreshed.expires_in * 1000),
          });
        },
      });
    } catch {
      return null;
    }
  })();

  try {
    return await activeRefreshPromise;
  } finally {
    activeRefreshPromise = null;
  }
}

export async function getFoldAccessToken(): Promise<string | null> {
  // 1. Direct env variable override if provided
  if (process.env.FOLD_ACCESS_TOKEN) {
    return process.env.FOLD_ACCESS_TOKEN;
  }

  // 2. Read from VIRA's isolated SQLite token store
  const stored = await getStoredFoldTokens();
  if (stored) {
    const isExpired = Date.now() >= (stored.expiresAt - 90_000);
    if (!isExpired) return stored.accessToken;
    if (stored.refreshToken) {
      return await refreshFoldTokenWithLock(false);
    }
    return null;
  }

  // 3. Fallback: Read from .mcp-auth cache if present (and import/refresh into SQLite if needed)
  const tokenFilePath = getMcpAuthTokensPath();
  if (!tokenFilePath) return null;

  try {
    const content = fs.readFileSync(/*turbopackIgnore: true*/ tokenFilePath, 'utf-8');
    const tokenData = JSON.parse(content) as FoldTokenData;

    const isExpired = tokenData.expires_at ? (Date.now() >= (tokenData.expires_at - 90_000)) : false;
    if (isExpired && tokenData.refresh_token) {
      return await refreshFoldTokenWithLock(false);
    }

    return tokenData.access_token || null;
  } catch (error) {
    console.error('[FoldClient] Error reading token file:', error);
    return null;
  }
}

async function sendFoldMcpRequest(token: string, toolName: string, args: Record<string, unknown>): Promise<Response> {
  const endpoint = process.env.FOLD_MCP_URL || 'https://mcp.fold.money/mcp';
  return fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: args,
      },
    }),
  });
}

const inflightRequests = new Map<string, Promise<unknown>>();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryAfterMs(errorText: string): number {
  const match = errorText.match(/"retry_after"\s*:\s*"(\d+)s"/i);
  const seconds = match ? Number(match[1]) : 3;
  return Math.min(Math.max(seconds * 1000 + 250, 1000), 5000);
}

export async function isFoldConnected(): Promise<boolean> {
  const token = await getFoldAccessToken();
  return Boolean(token);
}

export async function callFoldTool<T>(toolName: string, args: Record<string, unknown> = {}): Promise<T> {
  let token = await getFoldAccessToken();
  if (!token) {
    throw new Error('Fold not connected yet. Click Connect Fold to link your account once.');
  }

  let response = await sendFoldMcpRequest(token, toolName, args);

  // If access token was rejected (401), force-refresh once under lock and retry
  if (response.status === 401 && !process.env.FOLD_ACCESS_TOKEN) {
    const refreshed = await refreshFoldTokenWithLock(true);
    if (refreshed) {
      token = refreshed;
      response = await sendFoldMcpRequest(token, toolName, args);
    }
  }

  // If rate-limited (429), wait briefly as requested by Fold and retry once
  if (response.status === 429) {
    const errText = await response.text();
    const waitMs = parseRetryAfterMs(errText);
    await sleep(waitMs);
    response = await sendFoldMcpRequest(token, toolName, args);
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Fold MCP call failed [${response.status}]: ${errorText}`);
  }

  const responseText = await response.text();
  let payloadString = responseText;
  if (responseText.includes('data: ')) {
    const lines = responseText.split('\n');
    const dataLine = lines.find((line) => line.startsWith('data: '));
    if (dataLine) {
      payloadString = dataLine.slice('data: '.length).trim();
    }
  }

  const parsed = JSON.parse(payloadString);
  if (parsed.error) {
    throw new Error(`Fold MCP error: ${parsed.error.message || JSON.stringify(parsed.error)}`);
  }

  if (parsed.result?.structuredContent) {
    return parsed.result.structuredContent as T;
  }

  const textContent = parsed.result?.content?.[0]?.text;
  if (textContent) {
    try {
      return JSON.parse(textContent) as T;
    } catch {
      return textContent as unknown as T;
    }
  }

  return parsed.result as T;
}

async function callFoldToolCached<T>(
  toolName: string,
  args: Record<string, unknown>,
  ttlMs: number,
): Promise<T> {
  const cacheKey = `${toolName}:${JSON.stringify(args)}`;

  // 1. Fresh SQLite cache hit -> zero Fold API requests
  const cached = await getCachedFoldResponse<T>(cacheKey);
  if (cached?.isFresh) {
    return cached.data;
  }

  // 2. Deduplicate concurrent requests for the exact same Fold call
  const existing = inflightRequests.get(cacheKey);
  if (existing) {
    return existing as Promise<T>;
  }

  const promise = (async () => {
    try {
      const data = await callFoldTool<T>(toolName, args);
      await setCachedFoldResponse(cacheKey, data, ttlMs);
      return data;
    } catch (err) {
      // Stale-while-revalidate fallback on transient rate limits (429)
      if (cached?.data) {
        console.warn(`[FoldClient] Returning stale cache for ${cacheKey} after error:`, err);
        return cached.data;
      }
      throw err;
    } finally {
      inflightRequests.delete(cacheKey);
    }
  })();

  inflightRequests.set(cacheKey, promise);
  return promise;
}

export async function fetchFoldTotalBalance(): Promise<FoldTotalBalance> {
  return callFoldToolCached<FoldTotalBalance>('get_total_balance', {}, 3 * 60 * 1000);
}

export async function fetchFoldNetWorth(): Promise<FoldNetWorth> {
  return callFoldToolCached<FoldNetWorth>('get_net_worth', {}, 5 * 60 * 1000);
}

export async function fetchFoldSpendingSummary(month?: number, year?: number): Promise<FoldSpendingSummary> {
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();
  const m = month ?? currentMonth;
  const y = year ?? currentYear;

  // Past months don't change often -> cache 24h; current month -> cache 5m
  const isPastMonth = y < currentYear || (y === currentYear && m < currentMonth);
  const ttlMs = isPastMonth ? 24 * 60 * 60 * 1000 : 5 * 60 * 1000;

  return callFoldToolCached<FoldSpendingSummary>('get_spending_summary', { month: m, year: y }, ttlMs);
}

export async function fetchFoldRecentTransactions(limit = 100): Promise<{
  count: number;
  total_matched: number;
  transactions: FoldTransaction[];
}> {
  return callFoldToolCached<{
    count: number;
    total_matched: number;
    transactions: FoldTransaction[];
  }>('list_transactions', { limit }, 3 * 60 * 1000);
}

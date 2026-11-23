import fs from 'fs';
import path from 'path';
import os from 'os';

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
  const customConfigDir = process.env.MCP_REMOTE_CONFIG_DIR;
  const baseDir = customConfigDir || path.join(os.homedir(), '.mcp-auth', 'mcp-remote-v1');
  if (!fs.existsSync(baseDir)) return null;

  try {
    const files = fs.readdirSync(baseDir);
    const tokenFile = files.find((file) => file.endsWith('_tokens.json'));
    return tokenFile ? path.join(baseDir, tokenFile) : null;
  } catch {
    return null;
  }
}

function getMcpAuthClientInfo(): { client_id: string; issuer?: string } | null {
  const customConfigDir = process.env.MCP_REMOTE_CONFIG_DIR;
  const baseDir = customConfigDir || path.join(os.homedir(), '.mcp-auth', 'mcp-remote-v1');
  if (!fs.existsSync(baseDir)) return null;

  try {
    const files = fs.readdirSync(baseDir);
    const clientFile = files.find((file) => file.endsWith('_client_info.json'));
    if (!clientFile) return null;
    const content = fs.readFileSync(path.join(baseDir, clientFile), 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

async function refreshFoldToken(tokenData: FoldTokenData, tokenFilePath: string): Promise<string | null> {
  if (!tokenData.refresh_token) return null;

  const clientInfo = getMcpAuthClientInfo();
  const clientId = clientInfo?.client_id || 'mcp_E3E2lN1XqYDZ9OALX3DYTfYiAPzBpudgA3NZ3OlbeqY';
  const tokenEndpoint = `${tokenData.issuer || 'https://mcp.fold.money'}/oauth/token`;

  try {
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: tokenData.refresh_token,
      client_id: clientId,
    });

    const res = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!res.ok) {
      console.error('[FoldClient] Token refresh failed HTTP', res.status, await res.text());
      return null;
    }

    const refreshed = (await res.json()) as {
      access_token: string;
      expires_in: number;
      refresh_token?: string;
      token_type: string;
      scope?: string;
    };

    const updatedData: FoldTokenData = {
      ...tokenData,
      access_token: refreshed.access_token,
      refresh_token: refreshed.refresh_token || tokenData.refresh_token,
      expires_in: refreshed.expires_in,
      expires_at: Date.now() + (refreshed.expires_in * 1000),
    };

    fs.writeFileSync(tokenFilePath, JSON.stringify(updatedData, null, 2), 'utf-8');
    return updatedData.access_token;
  } catch (err) {
    console.error('[FoldClient] Token refresh error:', err);
    return null;
  }
}

export async function getFoldAccessToken(): Promise<string | null> {
  // 1. Direct env variable override if provided
  if (process.env.FOLD_ACCESS_TOKEN) {
    return process.env.FOLD_ACCESS_TOKEN;
  }

  // 2. Read from authenticated .mcp-auth cache
  const tokenFilePath = getMcpAuthTokensPath();
  if (!tokenFilePath) return null;

  try {
    const content = fs.readFileSync(tokenFilePath, 'utf-8');
    const tokenData = JSON.parse(content) as FoldTokenData;

    // Check if token is expired or within 60s of expiring
    const isExpired = tokenData.expires_at ? (Date.now() >= (tokenData.expires_at - 60000)) : false;
    if (isExpired && tokenData.refresh_token) {
      const refreshedToken = await refreshFoldToken(tokenData, tokenFilePath);
      if (refreshedToken) return refreshedToken;
    }

    return tokenData.access_token || null;
  } catch (error) {
    console.error('[FoldClient] Error reading token file:', error);
    return null;
  }
}

export async function callFoldTool<T>(toolName: string, args: Record<string, unknown> = {}): Promise<T> {
  const token = await getFoldAccessToken();
  if (!token) {
    throw new Error('Fold access token not found. Please authenticate Fold MCP or set FOLD_ACCESS_TOKEN.');
  }

  const endpoint = process.env.FOLD_MCP_URL || 'https://mcp.fold.money/mcp';
  const response = await fetch(endpoint, {
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

export async function fetchFoldTotalBalance(): Promise<FoldTotalBalance> {
  return callFoldTool<FoldTotalBalance>('get_total_balance');
}

export async function fetchFoldNetWorth(): Promise<FoldNetWorth> {
  return callFoldTool<FoldNetWorth>('get_net_worth');
}

export async function fetchFoldSpendingSummary(month?: number, year?: number): Promise<FoldSpendingSummary> {
  const now = new Date();
  const m = month ?? (now.getMonth() + 1);
  const y = year ?? now.getFullYear();
  return callFoldTool<FoldSpendingSummary>('get_spending_summary', { month: m, year: y });
}

export async function fetchFoldRecentTransactions(limit = 100): Promise<{
  count: number;
  total_matched: number;
  transactions: FoldTransaction[];
}> {
  return callFoldTool<{
    count: number;
    total_matched: number;
    transactions: FoldTransaction[];
  }>('list_transactions', { limit });
}

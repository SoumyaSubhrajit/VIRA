import { fetchFoldRecentTransactions, fetchFoldSpendingSummary, fetchFoldTotalBalance, fetchFoldNetWorth } from './foldClient';
import { saveFinanceTransaction, setFinanceImportState, getExistingFinanceSourceIds } from './db';
import { suggestCategory } from './categories';

export interface FoldSyncResult {
  importedCount: number;
  skippedCount: number;
  totalFoldTransactions: number;
  balance: number;
  spendingSummaryTotal: number;
  syncedAt: string;
}

export async function syncFoldTransactions(limit = 100): Promise<FoldSyncResult> {
  const [txData, balanceData, summaryData] = await Promise.all([
    fetchFoldRecentTransactions(limit),
    fetchFoldTotalBalance().catch(() => null),
    fetchFoldSpendingSummary().catch(() => null),
  ]);

  const transactions = txData.transactions || [];
  const sourceIds = transactions.map((tx) => `fold_${tx.id}`);
  const existingIds = await getExistingFinanceSourceIds(sourceIds);

  let importedCount = 0;
  let skippedCount = 0;

  for (const tx of transactions) {
    const sourceId = `fold_${tx.id}`;
    if (existingIds.has(sourceId)) {
      skippedCount++;
      continue;
    }

    const direction = tx.type === 'CREDIT' ? 'credit' : 'debit';
    const merchant = tx.merchant_name || (tx.narration ? tx.narration.slice(0, 50) : 'Unknown');
    const category = tx.category?.name || suggestCategory(merchant);

    const saved = await saveFinanceTransaction({
      sourceId,
      source: 'device', // treated as local account integration
      amount: Math.abs(tx.amount || tx.effective_amount || 0),
      direction,
      merchant,
      category,
      occurredAt: tx.date,
      reference: tx.id,
      subject: tx.narration || 'Fold Transaction',
      sender: tx.account_id || 'Fold',
    });

    if (saved) {
      importedCount++;
    } else {
      skippedCount++;
    }
  }

  const syncedAt = new Date().toISOString();
  await setFinanceImportState(null, 'fold', syncedAt);

  return {
    importedCount,
    skippedCount,
    totalFoldTransactions: txData.total_matched || transactions.length,
    balance: balanceData?.total ?? 0,
    spendingSummaryTotal: summaryData?.total_amount ?? 0,
    syncedAt,
  };
}

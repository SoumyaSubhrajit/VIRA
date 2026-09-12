import { getFinanceMonthSummaries } from './db';
import { controlDb, dailyFinance } from './control';
import { sendWithConnectedGmail } from '@/lib/google/gmail';

export async function dispatchFinanceEmail(now = new Date()) {
  await getFinanceMonthSummaries();
  const daily = await dailyFinance(now);
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now);
  if (!daily.emailEnabled || time < daily.emailTime) return { status: 'not-due' };
  const db = await controlDb();
  const claim = await db.prepare("INSERT OR IGNORE INTO finance_email_deliveries(day,status,updated_at) VALUES(?,'sending',?)").run(daily.day, now.toISOString());
  if (!claim.changes) return { status: 'already-attempted' };
  const format = (n:number) => new Intl.NumberFormat('en-IN', {style:'currency',currency:'INR'}).format(n);
  const limit = daily.dailyLimit ? `Daily outflow limit: ${format(daily.dailyLimit)}. ${daily.spent > daily.dailyLimit ? 'OVER LIMIT' : 'Remaining recorded allowance'}: ${format(Math.abs(daily.dailyLimit-daily.spent))}.` : 'No daily limit set. Set your limit in Finance Command.';
  const text = `VIRA | DAILY FINANCE CHECK\n${daily.day} · Asia/Kolkata\n\nRecorded money sent today: ${format(daily.spent)} across ${daily.count} total transactions.\n${limit}\n\nLatest recorded transaction: ${daily.latest ?? 'none'}. Imported data only: missing transactions are not zero spending. Transfers may be included in outflow.\n\nNext action: review unclassified payments, record why you spent, and import any missing statement. Review your finance page before your next discretionary purchase.`;
  const percent = daily.dailyLimit ? Math.min(100, Math.round(daily.spent/daily.dailyLimit*100)) : 0;
  const escaped = text.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
  try {
    const result = await sendWithConnectedGmail({to:'soumyasubhrajit@gmail.com',subject:`VIRA Finance | ${daily.day} | ${daily.dailyLimit && daily.spent>daily.dailyLimit?'Limit exceeded':'Daily check-in'}`,text,html:`<div style="background:#10140b;color:#edf0dc;padding:32px;font-family:Arial,sans-serif"><h1 style="color:#abc337">FINANCE COMMAND</h1><div style="background:#30351f;height:16px"><div style="background:#abc337;height:16px;width:${percent}%"></div></div><p>${daily.dailyLimit ? percent+'% of daily outflow limit (bar capped at 100%)' : 'Set a daily limit to activate the budget bar'}</p><div style="white-space:pre-wrap;line-height:1.8">${escaped}</div></div>`});
    const status=result.sent?'sent':'failed';
    await db.prepare('UPDATE finance_email_deliveries SET status=?,updated_at=?,error=? WHERE day=?').run(status,new Date().toISOString(),result.sent?null:'Gmail delivery failed or Gmail is not connected. Reconnect Google and check server logs.',daily.day);
    return {status};
  } catch {
    await db.prepare("UPDATE finance_email_deliveries SET status='failed',error='Delivery outcome uncertain. Check Gmail before retrying.' WHERE day=?").run(daily.day);
    return {status:'failed'};
  }
}

import { getSchedulerDb } from '@/lib/scheduler/db';
import { FINANCE_CATEGORIES, merchantKey, suggestCategory } from './categories';

let initialization: Promise<void> | null = null;

export async function controlDb() {
  const db = await getSchedulerDb();
  initialization ??= db.exec(`CREATE TABLE IF NOT EXISTS finance_reviews (source_id TEXT PRIMARY KEY, category TEXT NOT NULL, purpose TEXT NOT NULL DEFAULT '');
    CREATE TABLE IF NOT EXISTS finance_merchant_rules (merchant_key TEXT PRIMARY KEY, category TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS finance_preferences (id INTEGER PRIMARY KEY CHECK(id=1), daily_limit REAL NOT NULL DEFAULT 0, email_enabled INTEGER NOT NULL DEFAULT 1, email_time TEXT NOT NULL DEFAULT '21:00');
    INSERT OR IGNORE INTO finance_preferences(id) VALUES(1);
    CREATE TABLE IF NOT EXISTS finance_email_deliveries (day TEXT PRIMARY KEY, status TEXT NOT NULL, updated_at TEXT NOT NULL, error TEXT);
    CREATE TABLE IF NOT EXISTS finance_ai_reports (month TEXT PRIMARY KEY, report TEXT NOT NULL, created_at TEXT NOT NULL);`);
  await initialization;
  return db;
}
export async function enrichTransactions<T extends {sourceId:string; merchant:string; category:string}>(rows:T[]) {
  const db = await controlDb();
  const reviews = new Map((await db.prepare('SELECT source_id,category,purpose FROM finance_reviews').all<{source_id:string;category:string;purpose:string}>()).map(r=>[r.source_id,r]));
  const rules = new Map((await db.prepare('SELECT merchant_key,category FROM finance_merchant_rules').all<{merchant_key:string;category:string}>()).map(r=>[r.merchant_key,r.category]));
  return rows.map(row=>{
    const review=reviews.get(row.sourceId), rule=rules.get(merchantKey(row.merchant));
    const category=review?.category ?? rule ?? suggestCategory(row.merchant);
    return {...row,category,purpose:review?.purpose ?? '',categorySource:review?'Confirmed':rule?'Merchant rule':category==='Unclassified'?'Needs review':'Suggested',needsReview:!review&&!rule};
  });
}
export async function reviewTransaction(body:Record<string,unknown>) {
  if(typeof body.sourceId!=='string'||typeof body.category!=='string'||!FINANCE_CATEGORIES.includes(body.category as typeof FINANCE_CATEGORIES[number])||typeof body.purpose!=='string'||body.purpose.length>1000||typeof body.remember!=='boolean') throw new Error('Provide a category, purpose (up to 1000 characters), and remember option.');
  const db=await controlDb();
  const row=await db.prepare('SELECT merchant FROM finance_transactions WHERE source_id=?').get<{merchant:string}>(body.sourceId);
  if(!row) throw new Error('Transaction not found.');
  await db.transaction(async(transaction)=>{
    await transaction.prepare('INSERT INTO finance_reviews(source_id,category,purpose) VALUES(?,?,?) ON CONFLICT(source_id) DO UPDATE SET category=excluded.category,purpose=excluded.purpose').run(body.sourceId,body.category,body.purpose);
    if(body.remember) await transaction.prepare('INSERT INTO finance_merchant_rules(merchant_key,category) VALUES(?,?) ON CONFLICT(merchant_key) DO UPDATE SET category=excluded.category').run(merchantKey(row.merchant),body.category);
  })();
}
export async function financePreferences() {return await (await controlDb()).prepare('SELECT daily_limit AS dailyLimit,email_enabled AS emailEnabled,email_time AS emailTime FROM finance_preferences WHERE id=1').get<{dailyLimit:number;emailEnabled:number;emailTime:string}>() as {dailyLimit:number;emailEnabled:number;emailTime:string};}
export async function saveFinancePreferences(body:Record<string,unknown>) {
  if(typeof body.dailyLimit!=='number'||!Number.isFinite(body.dailyLimit)||body.dailyLimit<0||body.dailyLimit>10000000||typeof body.emailEnabled!=='boolean'||typeof body.emailTime!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(body.emailTime)) throw new Error('Enter a valid daily limit and reminder time.');
  await (await controlDb()).prepare('UPDATE finance_preferences SET daily_limit=?,email_enabled=?,email_time=? WHERE id=1').run(body.dailyLimit,body.emailEnabled?1:0,body.emailTime);
}
export async function dailyFinance(now=new Date()) {
  const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
  const db=await controlDb();
  const start=new Date(`${day}T00:00:00+05:30`).toISOString();
  const end=new Date(new Date(start).getTime()+86400000).toISOString();
  const row=await db.prepare("SELECT COUNT(*) AS count,COALESCE(SUM(CASE WHEN direction='debit' THEN amount ELSE 0 END),0) AS spent FROM finance_transactions WHERE occurred_at>=? AND occurred_at<?").get<{count:number;spent:number}>(start,end) as {count:number;spent:number};
  const latest=(await db.prepare('SELECT MAX(occurred_at) AS latest FROM finance_transactions').get<{latest:string|null}>() as {latest:string|null}).latest;
  return {day,...row,latest,...await financePreferences()};
}

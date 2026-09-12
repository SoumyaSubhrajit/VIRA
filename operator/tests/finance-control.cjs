// Isolated database; never reads real finance records or sends real emails.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict'),Module=require('node:module'),ts=require('typescript');
const root=path.resolve(__dirname,'..');
process.env.SCHEDULER_DB_PATH=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'vira-finance-test-')),'test.sqlite');
const resolve=Module._resolveFilename;
Module._resolveFilename=function(name,...args){return resolve.call(this,name.startsWith('@/')?path.join(root,name.slice(2)):name,...args);};
require.extensions['.ts']=(mod,file)=>mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,file);
let sends=0;
const gmailPath=require.resolve('../lib/google/gmail.ts');
require.cache[gmailPath]={id:gmailPath,filename:gmailPath,loaded:true,exports:{sendWithConnectedGmail:async()=>{sends++;return {sent:true,attempted:true};}}};
const db=require('../lib/finance/db.ts'),control=require('../lib/finance/control.ts'),email=require('../lib/finance/email.ts');
const add=(sourceId,merchant,amount=100,occurredAt='2026-09-08T10:00:00.000Z')=>db.saveFinanceTransaction({sourceId,merchant,amount,occurredAt,source:'statement',direction:'debit',category:'Misc',reference:null,subject:'',sender:''});
async function main(){
  add('1','Amazon');add('2','Amazon');add('3','Unknown Person');
  let rows=db.getFinanceHistoryTransactions('2026-09');
  assert.equal(rows.find(r=>r.sourceId==='1').category,'Shopping');assert.equal(rows.find(r=>r.sourceId==='3').category,'Unclassified');
  control.reviewTransaction({sourceId:'1',category:'Education',purpose:'Books for study',remember:true});
  rows=db.getFinanceHistoryTransactions('2026-09');
  assert.equal(rows.find(r=>r.sourceId==='2').category,'Education');assert.equal(rows.find(r=>r.sourceId==='2').purpose,'');
  control.reviewTransaction({sourceId:'2',category:'Gifts & Family',purpose:'Birthday gift',remember:true});
  assert.equal(db.getFinanceHistoryTransactions('2026-09').find(r=>r.sourceId==='1').category,'Education');
  add('4','Amazon');assert.equal(db.getFinanceHistoryTransactions('2026-09').find(r=>r.sourceId==='4').category,'Gifts & Family');
  assert.equal(db.getFinanceMonthSummaries()[0].spent,400);
  assert.throws(()=>control.saveFinancePreferences({dailyLimit:-1,emailEnabled:true,emailTime:'21:00'}));
  control.saveFinancePreferences({dailyLimit:500,emailEnabled:true,emailTime:'21:00'});
  add('5','Boundary',25,'2026-09-07T18:30:00.000Z');add('6','Previous day',50,'2026-09-07T18:29:59.000Z');
  assert.equal(control.dailyFinance(new Date('2026-09-08T16:00:00Z')).spent,425);
  assert.equal((await email.dispatchFinanceEmail(new Date('2026-09-08T10:00:00Z'))).status,'not-due');
  assert.equal((await email.dispatchFinanceEmail(new Date('2026-09-08T16:00:00Z'))).status,'sent');
  assert.equal((await email.dispatchFinanceEmail(new Date('2026-09-08T16:01:00Z'))).status,'already-attempted');assert.equal(sends,1);
  console.log('PASS: category suggestions, merchant rules, per-payment purposes, confirmed overrides, preserved totals, validation, IST boundary, email timing and deduplication.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});

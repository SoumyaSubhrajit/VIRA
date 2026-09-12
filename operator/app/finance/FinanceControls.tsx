'use client';
import { useEffect, useState } from 'react';
import { FINANCE_CATEGORIES } from '@/lib/finance/categories';
import styles from './finance.module.css';

export type ReviewItem={sourceId:string;merchant:string;category:string;purpose?:string};
type Control={daily:{day:string;spent:number;count:number;latest:string|null;dailyLimit:number;emailEnabled:number;emailTime:string};aiConfigured:boolean;report:{report:string;createdAt:string}|null;delivery:{day:string;status:string;error:string|null}|null};
export default function FinanceControls({month,editing,onClose,onSaved,refreshKey}:{month:string;editing:ReviewItem|null;onClose:()=>void;onSaved:()=>void;refreshKey:number}) {
  const [data,setData]=useState<Control|null>(null),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
  const [limit,setLimit]=useState('0'),[time,setTime]=useState('21:00'),[enabled,setEnabled]=useState(true);
  const [category,setCategory]=useState('Unclassified'),[purpose,setPurpose]=useState(''),[remember,setRemember]=useState(false);
  useEffect(()=>{let cancelled=false;fetch(`/api/finance/control?month=${encodeURIComponent(month)}`).then(async r=>{if(!r.ok)throw new Error('Could not load finance settings.');return r.json();}).then((d:Control)=>{if(cancelled)return;setData(d);setLimit(String(d.daily.dailyLimit));setTime(d.daily.emailTime);setEnabled(Boolean(d.daily.emailEnabled));}).catch(e=>{if(!cancelled)setMessage(e.message);});return()=>{cancelled=true;};},[month,refreshKey]);
  useEffect(()=>{if(editing){setCategory(editing.category);setPurpose(editing.purpose ?? '');setRemember(false);}},[editing]);
  async function save(body:Record<string,unknown>) {
    setBusy(true);setMessage('');
    try {const r=await fetch('/api/finance/control',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const result=await r.json();if(!r.ok)throw new Error(result.error);setMessage(body.action==='report'?'AI report generated.':'Saved.');if(body.action==='review')onClose();onSaved();}catch(e){setMessage(e instanceof Error?e.message:'Request failed.');}finally{setBusy(false);}
  }
  return <section className={styles.panel}>
    <div className={styles.panelHeading}><div><span>Personal finance control</span><h3>Daily guardrail & spending intelligence</h3></div></div>
    <p>Today’s recorded outflow: <strong>₹{data?.daily.spent.toLocaleString('en-IN') ?? '—'}</strong> · {data?.daily.count ?? 0} imported transactions.</p>
    <p>Latest transaction: {data?.daily.latest?new Date(data.daily.latest).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'}):'none'}. Imported data only—not a live bank balance. Missing data is not zero spending. Outflow includes transfers.</p>
    {data && data.daily.dailyLimit>0 && <><progress aria-label="Daily outflow limit used" max={data.daily.dailyLimit} value={Math.min(data.daily.spent,data.daily.dailyLimit)} /><p>{data.daily.spent>data.daily.dailyLimit?'Over limit':'Remaining recorded allowance'}: ₹{Math.abs(data.daily.dailyLimit-data.daily.spent).toLocaleString('en-IN')}</p></>}
    <form className={styles.controlForm} onSubmit={e=>{e.preventDefault();void save({action:'preferences',dailyLimit:Number(limit),emailTime:time,emailEnabled:enabled});}}>
      <label>Daily outflow limit (₹; 0 = unset)<input required type="number" min="0" max="10000000" step="0.01" value={limit} onChange={e=>setLimit(e.target.value)}/></label>
      <label>Daily email time (IST)<input required type="time" value={time} onChange={e=>setTime(e.target.value)}/></label>
      <label><input type="checkbox" checked={enabled} onChange={e=>setEnabled(e.target.checked)}/> Daily Gmail check-in</label>
      <button disabled={busy||!data}>Save daily settings</button>
    </form>
    <p>Recipient: soumyasubhrajit@gmail.com · The app and scheduler must be running. Latest email: {data?.delivery?`${data.delivery.day} — ${data.delivery.status}`:'not sent yet'}. {data?.delivery?.error}</p>
    <hr/>
    <h3>AI monthly spending review</h3>
    <p>On request, sends amounts, categories, confidence labels and your purpose notes to OpenAI. No PDF, account details or UPI references are sent. Reports are suggestions, not facts about your motives.</p>
    {!data?.aiConfigured && <p>Not connected: configure OPENAI_API_KEY and OPENAI_FINANCE_MODEL on the server to enable reports.</p>}
    <button disabled={busy||!data?.aiConfigured||!month} onClick={()=>void save({action:'report',month})}>{busy?'Working…':'Generate monthly AI report'}</button>
    {data?.report && <><p>Saved report: {new Date(data.report.createdAt).toLocaleString()}. Regenerate after changing your ledger.</p><div className={styles.report}>{data.report.report}</div></>}
    {message && <p role="status">{message}</p>}
    {editing && <div className={styles.modalBackdrop}><section role="dialog" aria-modal="true" aria-label="Review transaction" className={styles.editDialog}>
      <h2>Review: {editing.merchant}</h2>
      <form className={styles.controlForm} onSubmit={e=>{e.preventDefault();void save({action:'review',sourceId:editing.sourceId,category,purpose,remember});}}>
        <label>Category<select autoFocus value={category} onChange={e=>setCategory(e.target.value)}>{FINANCE_CATEGORIES.map(c=><option key={c}>{c}</option>)}</select></label>
        <label>Why did you spend / receive this?<textarea rows={5} maxLength={1000} value={purpose} onChange={e=>setPurpose(e.target.value)} placeholder="What was it for? Was it planned? Unknown is okay."/></label>
        <label><input type="checkbox" checked={remember} onChange={e=>setRemember(e.target.checked)}/> Remember this category for this exact merchant (past and future unreviewed payments).</label>
        <p>Amazon and other mixed merchants can sell many kinds of items. Your note applies only to this payment. Existing confirmed payments stay unchanged.</p>
        <button disabled={busy}>Save review</button><button type="button" disabled={busy} onClick={onClose}>Cancel</button>
        {message && <p role="status">{message}</p>}
      </form>
    </section></div>}
  </section>;
}

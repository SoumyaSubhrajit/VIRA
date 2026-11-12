import LoginForm from './LoginForm';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const requested = (await searchParams).next;
  const nextPath = requested?.startsWith('/') && !requested.startsWith('//') ? requested : '/';
  return (
    <main style={{ alignItems: 'center', background: 'var(--bg-base)', color: 'var(--text-primary)', display: 'flex', justifyContent: 'center', minHeight: '100vh', padding: 24 }}>
      <section style={{ background: '#FFFFFF', border: '1px solid var(--border-default)', borderRadius: 16, boxShadow: '0 10px 25px -5px rgba(0,0,0,0.05), 0 8px 10px -6px rgba(0,0,0,0.04)', maxWidth: 420, padding: 36, width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--lime)' }} />
          <p style={{ color: 'var(--lime)', fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', margin: 0 }}>VIRA // OPERATOR</p>
        </div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 8px' }}>Owner Access</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.5, margin: '0 0 24px' }}>Protected personal mission control. Enter owner password to authenticate session.</p>
        <LoginForm nextPath={nextPath} />
      </section>
    </main>
  );
}

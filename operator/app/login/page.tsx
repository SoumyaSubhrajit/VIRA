import LoginForm from './LoginForm';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const requested = (await searchParams).next;
  const nextPath = requested?.startsWith('/') && !requested.startsWith('//') ? requested : '/';
  return (
    <main style={{ alignItems: 'center', background: '#070906', color: '#f4f6ee', display: 'flex', justifyContent: 'center', minHeight: '100vh', padding: 24 }}>
      <section style={{ background: '#11150e', border: '1px solid #2d3628', borderRadius: 14, boxShadow: '0 24px 80px #0008', maxWidth: 420, padding: 32, width: '100%' }}>
        <p style={{ color: '#b5dc42', fontSize: 11, fontWeight: 900, letterSpacing: 3, margin: '0 0 10px' }}>VIRA // PRIVATE OPERATOR</p>
        <h1 style={{ fontSize: 30, margin: '0 0 8px' }}>Owner access</h1>
        <p style={{ color: '#899283', lineHeight: 1.55, margin: '0 0 24px' }}>Finance, gym, schedule, and personal records are protected by one encrypted session.</p>
        <LoginForm nextPath={nextPath} />
      </section>
    </main>
  );
}

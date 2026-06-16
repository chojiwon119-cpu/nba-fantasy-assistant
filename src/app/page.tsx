export default function HomePage() {
  return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
      <div style={{ textAlign: 'center', maxWidth: 480 }}>
        <div style={{ fontSize: 48, marginBottom: '1rem' }}>🏀</div>
        <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: '0.5rem', color: 'var(--text)' }}>
          NBA Fantasy Assistant
        </h1>
        <p style={{ color: 'var(--text2)', marginBottom: '2rem', lineHeight: 1.7 }}>
          드래프트 · 트레이드 · 웨이버를 데이터로 결정하세요.<br />
          Yahoo Fantasy 리그와 자동 연동됩니다.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', marginBottom: '2rem' }}>
          {[
            { icon: '📋', label: '드래프트', desc: 'Snake 최적화' },
            { icon: '🔄', label: '트레이드', desc: '가치 분석' },
            { icon: '➕', label: '웨이버', desc: '픽업 추천' },
          ].map(f => (
            <div key={f.label} className="card" style={{ padding: '1rem', textAlign: 'center' }}>
              <div style={{ fontSize: 24, marginBottom: '0.4rem' }}>{f.icon}</div>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{f.label}</div>
              <div style={{ color: 'var(--text2)', fontSize: 11, marginTop: 2 }}>{f.desc}</div>
            </div>
          ))}
        </div>

        <a href="/api/auth/yahoo" className="btn btn-primary" style={{ fontSize: 15, padding: '12px 32px', textDecoration: 'none', display: 'inline-flex' }}>
          🔑 Yahoo로 로그인
        </a>
        <p style={{ color: 'var(--text3)', fontSize: 11, marginTop: '1rem' }}>
          Yahoo Fantasy Sports 계정으로 안전하게 연동됩니다
        </p>
      </div>
    </main>
  );
}

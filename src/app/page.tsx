export default function HomePage() {
  return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
      <div style={{ textAlign: 'center', maxWidth: 520 }}>
        <div style={{ fontSize: 48, marginBottom: '1rem' }}>🏀</div>
        <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: '0.5rem', color: 'var(--text)' }}>
          NBA Fantasy Assistant
        </h1>
        <p style={{ color: 'var(--text2)', marginBottom: '2rem', lineHeight: 1.7 }}>
          드래프트 · 트레이드 · 웨이버를 데이터로 결정하세요.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
          <a href="/mock-draft" style={{ textDecoration: 'none' }}>
            <div className="card" style={{ cursor: 'pointer', border: '1px solid var(--accent)', padding: '1.25rem', textAlign: 'center' }}>
              <div style={{ fontSize: 28, marginBottom: '0.5rem' }}>🎯</div>
              <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--accent)' }}>Mock Draft</div>
              <div style={{ color: 'var(--text2)', fontSize: 12, marginTop: 4 }}>리그 없이 지금 바로 연습</div>
            </div>
          </a>
          <a href="/api/auth/yahoo" style={{ textDecoration: 'none' }}>
            <div className="card" style={{ cursor: 'pointer', padding: '1.25rem', textAlign: 'center' }}>
              <div style={{ fontSize: 28, marginBottom: '0.5rem' }}>🔑</div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>Yahoo 리그 연동</div>
              <div style={{ color: 'var(--text2)', fontSize: 12, marginTop: 4 }}>실제 리그 데이터 사용</div>
            </div>
          </a>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem' }}>
          {[
            { icon: '📋', label: '드래프트', desc: 'Snake 최적화' },
            { icon: '🔄', label: '트레이드', desc: '가치 분석' },
            { icon: '➕', label: '웨이버', desc: '픽업 추천' },
          ].map(f => (
            <div key={f.label} className="card" style={{ padding: '0.75rem', textAlign: 'center' }}>
              <div style={{ fontSize: 20, marginBottom: '0.3rem' }}>{f.icon}</div>
              <div style={{ fontWeight: 600, fontSize: 12 }}>{f.label}</div>
              <div style={{ color: 'var(--text2)', fontSize: 11, marginTop: 2 }}>{f.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}

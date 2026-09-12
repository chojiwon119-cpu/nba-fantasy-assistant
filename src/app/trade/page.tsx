'use client';
import { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Player } from '@/types';
import Link from 'next/link';

interface TradeResult {
  giving: Player[]; receiving: Player[];
  giving_score: number; receiving_score: number;
  score_diff: number; fairness_score: number;
  verdict: string; verdict_reason: string;
}

function TradeContent() {
  const searchParams = useSearchParams();
  const leagueKey = searchParams.get('league_key') || '';
  const [givingKeys, setGivingKeys] = useState('');
  const [receivingKeys, setReceivingKeys] = useState('');
  const [result, setResult] = useState<TradeResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const analyze = async () => {
    const giving = givingKeys.split(',').map(s => s.trim()).filter(Boolean);
    const receiving = receivingKeys.split(',').map(s => s.trim()).filter(Boolean);
    if (!giving.length || !receiving.length) { setError('주는 선수와 받는 선수를 입력하세요'); return; }
    setLoading(true); setError('');
    try {
      const r = await fetch('/api/trade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ league_key: leagueKey, giving_keys: giving, receiving_keys: receiving }),
      });
      const d = await r.json();
      if (d.error) { setError(d.error); } else { setResult(d); }
    } catch { setError('분석 중 오류가 발생했어요'); } finally { setLoading(false); }
  };

  const verdictColor = result?.verdict === 'favorable' ? 'var(--green)' : result?.verdict === 'unfavorable' ? 'var(--red)' : 'var(--yellow)';
  const fairnessColor = (result?.fairness_score || 50) >= 55 ? 'var(--green)' : (result?.fairness_score || 50) <= 45 ? 'var(--red)' : 'var(--yellow)';

  return (
    <div style={{ minHeight: '100vh', padding: '1.5rem', maxWidth: 900, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
        <Link href="/dashboard" style={{ color: 'var(--text2)', textDecoration: 'none', fontSize: 13 }}>← 대시보드</Link>
        <h1 style={{ fontSize: 20, fontWeight: 700 }}>🔄 트레이드 분석기</h1>
      </div>

      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <p style={{ color: 'var(--text2)', fontSize: 13, marginBottom: '1.25rem' }}>
          Yahoo Fantasy에서 선수 키를 복사해서 입력하거나, 선수 이름을 쉼표로 구분해서 입력하세요.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1rem' }}>
          <div>
            <label style={{ fontSize: 12, color: 'var(--text2)', display: 'block', marginBottom: 6 }}>내가 주는 선수 (player_key, 쉼표 구분)</label>
            <textarea value={givingKeys} onChange={e => setGivingKeys(e.target.value)}
              placeholder="예: 418.p.6035, 418.p.4725"
              style={{ width: '100%', height: 80, background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', padding: '8px 12px', fontSize: 13, outline: 'none', resize: 'vertical' }} />
          </div>
          <div>
            <label style={{ fontSize: 12, color: 'var(--text2)', display: 'block', marginBottom: 6 }}>내가 받는 선수 (player_key, 쉼표 구분)</label>
            <textarea value={receivingKeys} onChange={e => setReceivingKeys(e.target.value)}
              placeholder="예: 418.p.5765, 418.p.6047"
              style={{ width: '100%', height: 80, background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', padding: '8px 12px', fontSize: 13, outline: 'none', resize: 'vertical' }} />
          </div>
        </div>
        {error && <p style={{ color: 'var(--red)', fontSize: 12, marginBottom: '0.75rem' }}>{error}</p>}
        <button className="btn btn-primary" onClick={analyze} disabled={loading} style={{ minWidth: 140 }}>
          {loading ? '분석 중...' : '🔍 트레이드 분석'}
        </button>
      </div>

      {result && (
        <>
          {/* Verdict */}
          <div className="card" style={{ marginBottom: '1rem', border: `1px solid ${verdictColor}33` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div>
                <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 4 }}>트레이드 판정</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: verdictColor }}>
                  {result.verdict === 'favorable' ? '✅ 유리' : result.verdict === 'unfavorable' ? '❌ 불리' : '⚖️ 균형'}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 4 }}>공정성 점수</div>
                <div style={{ fontSize: 28, fontWeight: 700, color: fairnessColor }}>{result.fairness_score}</div>
                <div style={{ fontSize: 11, color: 'var(--text3)' }}>/ 100</div>
              </div>
            </div>
            <p style={{ fontSize: 13, color: 'var(--text2)', background: 'var(--bg3)', padding: '10px 14px', borderRadius: 8 }}>{result.verdict_reason}</p>
          </div>

          {/* Score comparison */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
            {[
              { label: '내가 주는 선수', players: result.giving, score: result.giving_score, color: 'var(--red)' },
              { label: '내가 받는 선수', players: result.receiving, score: result.receiving_score, color: 'var(--green)' },
            ].map(side => (
              <div key={side.label} className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <span style={{ fontSize: 12, color: 'var(--text2)' }}>{side.label}</span>
                  <span style={{ fontSize: 18, fontWeight: 700, color: side.color }}>{side.score.toFixed(1)}pt</span>
                </div>
                {side.players.map(p => (
                  <div key={p.player_key} style={{ padding: '8px 0', borderTop: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontWeight: 500, fontSize: 14 }}>{p.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--text2)' }}>{p.positions.join('/')} · {p.team}</div>
                      </div>
                      <div style={{ fontWeight: 700, color: side.color }}>{(p.fantasy_score || 0).toFixed(1)}</div>
                    </div>
                    {p.status !== 'active' && (
                      <span style={{ fontSize: 11 }} className={`status-${p.status}`}>{p.status.toUpperCase()} {p.injury_note || ''}</span>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* Stat comparison */}
          <div className="card">
            <h3 style={{ fontWeight: 600, marginBottom: '1rem', fontSize: 14 }}>스탯별 비교</h3>
            <table>
              <thead>
                <tr>
                  <th>스탯</th>
                  <th style={{ textAlign: 'right', color: 'var(--red)' }}>주는 선수 합계</th>
                  <th style={{ textAlign: 'right', color: 'var(--green)' }}>받는 선수 합계</th>
                  <th style={{ textAlign: 'right' }}>차이</th>
                </tr>
              </thead>
              <tbody>
                {(['PTS','REB','AST','ST','BLK','TO','threePM','FGM','FTM','DD'] as const).map(stat => {
                  const gv = result.giving.reduce((s, p) => s + p.stats[stat], 0);
                  const rv = result.receiving.reduce((s, p) => s + p.stats[stat], 0);
                  const diff = rv - gv;
                  const isNeg = stat === 'TO';
                  const good = isNeg ? diff < 0 : diff > 0;
                  return (
                    <tr key={stat}>
                      <td style={{ color: 'var(--text2)' }}>{stat}</td>
                      <td style={{ textAlign: 'right' }}>{gv.toFixed(1)}</td>
                      <td style={{ textAlign: 'right' }}>{rv.toFixed(1)}</td>
                      <td style={{ textAlign: 'right', color: diff === 0 ? 'var(--text3)' : good ? 'var(--green)' : 'var(--red)', fontWeight: diff !== 0 ? 600 : 400 }}>
                        {diff > 0 ? '+' : ''}{diff.toFixed(1)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

export default function TradePage() {
  return <Suspense fallback={<div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',color:'var(--text2)'}}>로딩 중...</div>}><TradeContent /></Suspense>;
}

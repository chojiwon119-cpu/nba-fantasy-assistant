'use client';
import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Player } from '@/types';
import Link from 'next/link';

interface WaiverResult {
  pickup_player: Player; drop_player: Player;
  pickup_score: number; drop_score: number;
  score_diff: number; verdict: string; verdict_reason: string;
}

function WaiverContent() {
  const searchParams = useSearchParams();
  const leagueKey = searchParams.get('league_key') || '';
  const [freeAgents, setFreeAgents] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [pickupKey, setPickupKey] = useState('');
  const [dropKey, setDropKey] = useState('');
  const [result, setResult] = useState<WaiverResult | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState('');
  const [posFilter, setPosFilter] = useState('ALL');
  const [searchQ, setSearchQ] = useState('');

  useEffect(() => {
    if (!leagueKey) return;
    fetch(`/api/waiver?league_key=${leagueKey}`)
      .then(r => r.json())
      .then(d => { setFreeAgents(d.free_agents || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [leagueKey]);

  const analyze = async () => {
    if (!pickupKey || !dropKey) { setError('픽업 선수와 컷 선수를 모두 입력하세요'); return; }
    setAnalyzing(true); setError('');
    try {
      const r = await fetch('/api/waiver', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ league_key: leagueKey, pickup_key: pickupKey.trim(), drop_key: dropKey.trim() }),
      });
      const d = await r.json();
      if (d.error) setError(d.error); else setResult(d);
    } catch { setError('분석 중 오류가 발생했어요'); } finally { setAnalyzing(false); }
  };

  const filtered = freeAgents.filter(p => {
    const matchPos = posFilter === 'ALL' || p.positions.includes(posFilter);
    const matchQ = !searchQ || p.name.toLowerCase().includes(searchQ.toLowerCase());
    return matchPos && matchQ;
  });

  const verdictColors: Record<string, string> = { pickup: 'var(--green)', wait: 'var(--yellow)', pass: 'var(--red)' };
  const verdictLabels: Record<string, string> = { pickup: '✅ 픽업 추천', wait: '⏳ 기다려요', pass: '❌ 패스' };

  return (
    <div style={{ minHeight: '100vh', padding: '1.5rem', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
        <Link href="/dashboard" style={{ color: 'var(--text2)', textDecoration: 'none', fontSize: 13 }}>← 대시보드</Link>
        <h1 style={{ fontSize: 20, fontWeight: 700 }}>➕ 웨이버 & 픽업 어드바이저</h1>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: '1.5rem' }}>
        {/* Left: FA List */}
        <div>
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
            <input value={searchQ} onChange={e => setSearchQ(e.target.value)} placeholder="선수 검색..." style={{ flex: 1, minWidth: 160 }} />
            {['ALL','PG','SG','G','SF','PF','F','C'].map(pos => (
              <button key={pos} onClick={() => setPosFilter(pos)}
                className="btn"
                style={{ padding: '6px 10px', fontSize: 11, background: posFilter === pos ? 'var(--accent)' : 'var(--bg3)', color: posFilter === pos ? 'white' : 'var(--text2)', border: `1px solid ${posFilter === pos ? 'var(--accent)' : 'var(--border)'}` }}>
                {pos}
              </button>
            ))}
          </div>

          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            {loading ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text2)' }}>FA 목록 불러오는 중...</div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>선수</th>
                    <th>포지션</th>
                    <th>팀</th>
                    <th style={{ textAlign: 'right' }}>Fantasy Score</th>
                    <th style={{ textAlign: 'right' }}>소유율</th>
                    <th style={{ width: 80 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice(0, 40).map(player => (
                    <tr key={player.player_key} style={{ opacity: player.status === 'out' ? 0.5 : 1 }}>
                      <td>
                        <div style={{ fontWeight: 500 }}>{player.name}</div>
                        {player.status !== 'active' && (
                          <div style={{ fontSize: 11 }}>
                            <span className={`status-${player.status}`}>{player.status.toUpperCase()}</span>
                            {player.injury_note && <span style={{ color: 'var(--text3)', marginLeft: 4 }}>{player.injury_note}</span>}
                          </div>
                        )}
                      </td>
                      <td>{player.positions.map(p => <span key={p} className="pos-badge" style={{ marginRight: 2 }}>{p}</span>)}</td>
                      <td style={{ color: 'var(--text2)' }}>{player.team}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--accent)' }}>{(player.fantasy_score || 0).toFixed(1)}</td>
                      <td style={{ textAlign: 'right', color: 'var(--text2)' }}>{player.ownership_pct?.toFixed(0) ?? 0}%</td>
                      <td>
                        <button className="btn btn-secondary" style={{ padding: '3px 8px', fontSize: 11 }}
                          onClick={() => setPickupKey(player.player_key)}>
                          픽업
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Right: Analyzer */}
        <div>
          <div className="card" style={{ marginBottom: '1rem' }}>
            <h3 style={{ fontWeight: 600, marginBottom: '1rem', fontSize: 14 }}>픽업/컷 비교 분석</h3>
            <div style={{ marginBottom: '0.75rem' }}>
              <label style={{ fontSize: 11, color: 'var(--text2)', display: 'block', marginBottom: 4 }}>픽업할 선수 player_key</label>
              <input value={pickupKey} onChange={e => setPickupKey(e.target.value)} placeholder="왼쪽 목록에서 선택 또는 직접 입력" style={{ width: '100%' }} />
            </div>
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ fontSize: 11, color: 'var(--text2)', display: 'block', marginBottom: 4 }}>컷할 내 선수 player_key</label>
              <input value={dropKey} onChange={e => setDropKey(e.target.value)} placeholder="내 로스터 선수 key 입력" style={{ width: '100%' }} />
            </div>
            {error && <p style={{ color: 'var(--red)', fontSize: 12, marginBottom: '0.5rem' }}>{error}</p>}
            <button className="btn btn-primary" onClick={analyze} disabled={analyzing} style={{ width: '100%' }}>
              {analyzing ? '분석 중...' : '🔍 웨이버 분석'}
            </button>
          </div>

          {result && (
            <div className="card">
              <div style={{ textAlign: 'center', marginBottom: '1rem', padding: '1rem', background: 'var(--bg3)', borderRadius: 8 }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: verdictColors[result.verdict] }}>{verdictLabels[result.verdict]}</div>
                <p style={{ fontSize: 12, color: 'var(--text2)', marginTop: 6 }}>{result.verdict_reason}</p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                {[
                  { label: '픽업', player: result.pickup_player, score: result.pickup_score, color: 'var(--green)' },
                  { label: '컷', player: result.drop_player, score: result.drop_score, color: 'var(--red)' },
                ].map(side => (
                  <div key={side.label} style={{ background: 'var(--bg3)', padding: '0.75rem', borderRadius: 8 }}>
                    <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>{side.label}</div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{side.player.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text2)' }}>{side.player.positions.join('/')} · {side.player.team}</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: side.color, marginTop: 6 }}>{side.score.toFixed(1)}</div>
                    <div style={{ fontSize: 10, color: 'var(--text3)' }}>Fantasy Score</div>
                  </div>
                ))}
              </div>

              <div style={{ padding: '0.75rem', background: 'var(--bg3)', borderRadius: 8, textAlign: 'center' }}>
                <span style={{ fontSize: 12, color: 'var(--text2)' }}>점수 차이 </span>
                <span style={{ fontWeight: 700, color: result.score_diff > 0 ? 'var(--green)' : 'var(--red)' }}>
                  {result.score_diff > 0 ? '+' : ''}{result.score_diff.toFixed(1)}pt
                </span>
              </div>

              {/* Stat breakdown */}
              <div style={{ marginTop: '1rem' }}>
                <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 6 }}>스탯 비교</div>
                {(['PTS','REB','AST','ST','BLK','TO','threePM'] as const).map(stat => {
                  const pv = result.pickup_player.stats[stat] || 0;
                  const dv = result.drop_player.stats[stat] || 0;
                  const isNeg = stat === 'TO';
                  const pickupBetter = isNeg ? pv < dv : pv > dv;
                  return (
                    <div key={stat} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
                      <span style={{ color: 'var(--text2)', width: 60 }}>{stat}</span>
                      <span style={{ color: pickupBetter ? 'var(--green)' : pv === dv ? 'var(--text3)' : 'var(--red)', fontWeight: pickupBetter ? 600 : 400 }}>{pv.toFixed(1)}</span>
                      <span style={{ color: 'var(--text3)', fontSize: 10 }}>vs</span>
                      <span style={{ color: !pickupBetter && pv !== dv ? 'var(--green)' : pv === dv ? 'var(--text3)' : 'var(--red)' }}>{dv.toFixed(1)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function WaiverPage() {
  return <Suspense fallback={<div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',color:'var(--text2)'}}>로딩 중...</div>}><WaiverContent /></Suspense>;
}

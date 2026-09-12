'use client';
import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Player, DRAFT_ROSTER_SIZE } from '@/types';
import Link from 'next/link';

const POSITIONS = ['PG','SG','G','SF','PF','F','C','UTIL'];
const ROSTER_NEEDS: Record<string, number> = { PG:1,SG:1,G:1,SF:1,PF:1,F:1,C:2,UTIL:2 };

function DraftContent() {
  const searchParams = useSearchParams();
  const leagueKey = searchParams.get('league_key') || '';

  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(false);
  const [myPosition, setMyPosition] = useState(1);
  const [currentOverall, setCurrentOverall] = useState(0);
  const [draftedKeys, setDraftedKeys] = useState<string[]>([]);
  const [myTeam, setMyTeam] = useState<Player[]>([]);
  const [nextPick, setNextPick] = useState(0);
  const [picksUntil, setPicksUntil] = useState(0);
  const [posFilter, setPosFilter] = useState('ALL');
  const [searchQ, setSearchQ] = useState('');

  const fetchPlayers = useCallback(async () => {
    if (!leagueKey) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        league_key: leagueKey, my_position: String(myPosition),
        current_overall: String(currentOverall), total_teams: '6',
        drafted: draftedKeys.join(','),
      });
      const r = await fetch(`/api/draft?${params}`);
      const d = await r.json();
      setPlayers(d.players || []);
      setNextPick(d.nextPick || 0);
      setPicksUntil(d.picksUntil || 0);
    } finally { setLoading(false); }
  }, [leagueKey, myPosition, currentOverall, draftedKeys]);

  useEffect(() => {
    const timer = window.setTimeout(() => void fetchPlayers(), 0);
    return () => window.clearTimeout(timer);
  }, [fetchPlayers]);

  const draftPlayer = (player: Player) => {
    setDraftedKeys(prev => [...prev, player.player_key]);
    setMyTeam(prev => [...prev, player]);
    setCurrentOverall(prev => prev + 1);
  };

  const markOtherDrafted = (player: Player) => {
    setDraftedKeys(prev => [...prev, player.player_key]);
    setCurrentOverall(prev => prev + 1);
  };

  // position balance
  const myPositionCounts: Record<string, number> = {};
  myTeam.forEach(p => p.positions.forEach(pos => { myPositionCounts[pos] = (myPositionCounts[pos] || 0) + 1; }));

  const getPositionNeed = (player: Player) => {
    const need = player.positions.some(pos => {
      const need = ROSTER_NEEDS[pos] || 0;
      const have = myPositionCounts[pos] || 0;
      return have < need;
    });
    return need;
  };

  const filtered = players.filter(p => {
    const matchPos = posFilter === 'ALL' || p.positions.includes(posFilter);
    const matchQ = !searchQ || p.name.toLowerCase().includes(searchQ.toLowerCase()) || p.team.toLowerCase().includes(searchQ.toLowerCase());
    return matchPos && matchQ;
  });

  const currentRound = Math.floor(currentOverall / 6) + 1;
  const isMyTurn = currentOverall + 1 === nextPick || picksUntil === 0;

  return (
    <div style={{ minHeight: '100vh', padding: '1.5rem', maxWidth: 1200, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
        <Link href="/dashboard" style={{ color: 'var(--text2)', textDecoration: 'none', fontSize: 13 }}>← 대시보드</Link>
        <h1 style={{ fontSize: 20, fontWeight: 700 }}>📋 드래프트 어시스턴트</h1>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '1.5rem' }}>
        {/* Left: Player Board */}
        <div>
          {/* Controls */}
          <div className="card" style={{ marginBottom: '1rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
              <div>
                <label style={{ fontSize: 11, color: 'var(--text2)', display: 'block', marginBottom: 4 }}>내 드래프트 순서</label>
                <select value={myPosition} onChange={e => setMyPosition(Number(e.target.value))} style={{ width: '100%' }}>
                  {[1,2,3,4,5,6].map(n => <option key={n} value={n}>{n}번 픽</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--text2)', display: 'block', marginBottom: 4 }}>현재 전체 픽 번호</label>
                <input type="number" min={0} value={currentOverall} onChange={e => setCurrentOverall(Number(e.target.value))} style={{ width: '100%' }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                <button className="btn btn-primary" onClick={fetchPlayers} disabled={loading} style={{ width: '100%' }}>
                  {loading ? '불러오는 중...' : '새로고침'}
                </button>
              </div>
            </div>
            {/* Status bar */}
            <div style={{ display: 'flex', gap: '1.5rem', padding: '0.75rem', background: 'var(--bg3)', borderRadius: 8 }}>
              <div><span style={{ color: 'var(--text2)', fontSize: 11 }}>현재 라운드</span><br /><strong style={{ fontSize: 18 }}>{currentRound}</strong></div>
              <div><span style={{ color: 'var(--text2)', fontSize: 11 }}>내 다음 픽</span><br /><strong style={{ fontSize: 18, color: isMyTurn ? 'var(--accent)' : 'var(--text)' }}>{nextPick > 0 ? `${nextPick}번` : '완료'}</strong></div>
              <div><span style={{ color: 'var(--text2)', fontSize: 11 }}>내 픽까지</span><br /><strong style={{ fontSize: 18, color: picksUntil <= 3 ? 'var(--accent)' : 'var(--text)' }}>{picksUntil}픽 남음</strong></div>
              <div><span style={{ color: 'var(--text2)', fontSize: 11 }}>내 팀</span><br /><strong style={{ fontSize: 18 }}>{myTeam.length}/{DRAFT_ROSTER_SIZE}명</strong></div>
              {isMyTurn && <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center' }}><span style={{ background: 'rgba(249,115,22,0.2)', color: 'var(--accent)', padding: '4px 12px', borderRadius: 999, fontSize: 12, fontWeight: 700 }}>🔥 내 픽 차례!</span></div>}
            </div>
          </div>

          {/* Filter */}
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
            <input value={searchQ} onChange={e => setSearchQ(e.target.value)} placeholder="선수 검색..." style={{ flex: 1, minWidth: 160 }} />
            {['ALL', ...POSITIONS].map(pos => (
              <button key={pos} onClick={() => setPosFilter(pos)}
                className="btn"
                style={{ padding: '6px 12px', fontSize: 12, background: posFilter === pos ? 'var(--accent)' : 'var(--bg3)', color: posFilter === pos ? 'white' : 'var(--text2)', border: `1px solid ${posFilter === pos ? 'var(--accent)' : 'var(--border)'}` }}>
                {pos}
              </button>
            ))}
          </div>

          {/* Player Table */}
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <table>
              <thead>
                <tr>
                  <th style={{ width: 36, textAlign: 'center' }}>#</th>
                  <th>선수</th>
                  <th>포지션</th>
                  <th>팀</th>
                  <th style={{ textAlign: 'right' }}>Fantasy Pt</th>
                  <th style={{ textAlign: 'right' }}>ADP</th>
                  <th style={{ textAlign: 'right' }}>소유율</th>
                  <th style={{ width: 140 }}></th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, 50).map((player, i) => {
                  const needsPos = getPositionNeed(player);
                  return (
                    <tr key={player.player_key} style={{ opacity: player.status === 'out' ? 0.5 : 1 }}>
                      <td style={{ textAlign: 'center', color: 'var(--text3)', fontSize: 12 }}>{i + 1}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div>
                            <div style={{ fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
                              {player.name}
                              {needsPos && <span style={{ fontSize: 10, color: 'var(--accent)', background: 'rgba(249,115,22,0.1)', padding: '1px 5px', borderRadius: 4 }}>필요</span>}
                            </div>
                            {player.status !== 'active' && (
                              <div style={{ fontSize: 11 }}>
                                <span className={`status-${player.status}`}>{player.status.toUpperCase()}</span>
                                {player.injury_note && <span style={{ color: 'var(--text3)', marginLeft: 4 }}>{player.injury_note}</span>}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td>{player.positions.map(p => <span key={p} className="pos-badge" style={{ marginRight: 2 }}>{p}</span>)}</td>
                      <td style={{ color: 'var(--text2)' }}>{player.team}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--accent)' }}>{(player.fantasy_score || 0).toFixed(1)}</td>
                      <td style={{ textAlign: 'right', color: 'var(--text2)' }}>{player.adp?.toFixed(1) || '-'}</td>
                      <td style={{ textAlign: 'right', color: 'var(--text2)' }}>{player.ownership_pct?.toFixed(0)}%</td>
                      <td>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button className="btn btn-primary" style={{ padding: '4px 10px', fontSize: 11 }} onClick={() => draftPlayer(player)}>내 픽</button>
                          <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: 11 }} onClick={() => markOtherDrafted(player)}>타팀</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right: My Team */}
        <div>
          <div className="card">
            <h3 style={{ fontWeight: 600, marginBottom: '1rem', fontSize: 14 }}>내 팀 ({myTeam.length}/{DRAFT_ROSTER_SIZE})</h3>
            {myTeam.length === 0 ? (
              <div style={{ color: 'var(--text3)', fontSize: 13, textAlign: 'center', padding: '2rem 0' }}>
                선수를 드래프트하면<br />여기에 표시돼요
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {myTeam.map((p) => (
                  <div key={p.player_key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 8px', background: 'var(--bg3)', borderRadius: 6 }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 500 }}>{p.name}</div>
                      <div style={{ fontSize: 10, color: 'var(--text2)' }}>{p.positions.join('/')} · {p.team}</div>
                    </div>
                    <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--accent)' }}>{(p.fantasy_score || 0).toFixed(1)}</div>
                  </div>
                ))}
              </div>
            )}

            {myTeam.length > 0 && (
              <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                  <span style={{ color: 'var(--text2)' }}>팀 총 Fantasy Score</span>
                  <strong style={{ color: 'var(--accent)' }}>{myTeam.reduce((s, p) => s + (p.fantasy_score || 0), 0).toFixed(1)}</strong>
                </div>
              </div>
            )}

            {/* Position needs */}
            <div style={{ marginTop: '1rem' }}>
              <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 6 }}>포지션 충족 현황</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {Object.entries(ROSTER_NEEDS).map(([pos, need]) => {
                  const have = myPositionCounts[pos] || 0;
                  const ok = have >= need;
                  return (
                    <span key={pos} style={{ fontSize: 11, padding: '2px 7px', borderRadius: 4, background: ok ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', color: ok ? 'var(--green)' : 'var(--red)' }}>
                      {pos} {have}/{need}
                    </span>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Snake order preview */}
          <div className="card" style={{ marginTop: '1rem' }}>
            <h3 style={{ fontWeight: 600, marginBottom: '0.75rem', fontSize: 14 }}>Snake 드래프트 내 픽 순서</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {Array.from({ length: DRAFT_ROSTER_SIZE }, (_, round) => {
                const isEven = (round + 1) % 2 === 0;
                const pickInRound = isEven ? 6 - myPosition + 1 : myPosition;
                const overall = round * 6 + pickInRound;
                const isDone = overall <= currentOverall;
                const isNext = overall === nextPick;
                return (
                  <div key={round} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 8px', borderRadius: 4, background: isNext ? 'rgba(249,115,22,0.1)' : 'transparent', opacity: isDone ? 0.4 : 1 }}>
                    <span style={{ fontSize: 12, color: 'var(--text2)' }}>{round + 1}라운드</span>
                    <span style={{ fontSize: 12, fontWeight: isNext ? 700 : 400, color: isNext ? 'var(--accent)' : 'var(--text)' }}>{overall}번 픽{isDone ? ' ✓' : ''}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DraftPage() {
  return <Suspense fallback={<div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',color:'var(--text2)'}}>로딩 중...</div>}><DraftContent /></Suspense>;
}

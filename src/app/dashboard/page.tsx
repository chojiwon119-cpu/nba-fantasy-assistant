'use client';
import { useState, useEffect } from 'react';
import { League, Team } from '@/types';
import Link from 'next/link';

export default function DashboardPage() {
  const [leagues, setLeagues] = useState<League[]>([]);
  const [selectedLeague, setSelectedLeague] = useState<League | null>(null);
  const [team, setTeam] = useState<Team | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [teamLoading, setTeamLoading] = useState(false);

  useEffect(() => {
    fetch('/api/league')
      .then(async r => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.detail || data.error || '리그 정보를 불러오지 못했습니다.');
        return data;
      })
      .then(d => {
        if (d.code === 'AUTH_REQUIRED') window.location.href = '/';
        setLeagues(d.leagues || []);
        setLoading(false);
      })
      .catch(e => { setError(e instanceof Error ? e.message : '리그 정보를 불러오지 못했습니다.'); setLoading(false); });
  }, []);

  const selectLeague = async (league: League) => {
    setSelectedLeague(league);
    setTeamLoading(true);
    const r = await fetch(`/api/league/team?league_key=${encodeURIComponent(league.league_key)}`);
    const d = await r.json();
    setTeam(d.team || null);
    setTeamLoading(false);
    localStorage.setItem('selected_league', JSON.stringify(league));
  };

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      <div style={{ color: 'var(--text2)' }}>리그 정보 불러오는 중...</div>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', padding: '2rem', maxWidth: 1100, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700 }}>🏀 NBA Fantasy Assistant</h1>
          <p style={{ color: 'var(--text2)', marginTop: 4 }}>Yahoo Fantasy 연동 완료</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {selectedLeague && (
            <>
              <Link href={`/draft?league_key=${selectedLeague.league_key}`} className="btn btn-secondary">📋 드래프트</Link>
              <Link href={`/trade?league_key=${selectedLeague.league_key}`} className="btn btn-secondary">🔄 트레이드</Link>
              <Link href={`/waiver?league_key=${selectedLeague.league_key}`} className="btn btn-secondary">➕ 웨이버</Link>
            </>
          )}
          <a href="/api/auth/logout" className="btn btn-secondary">로그아웃</a>
        </div>
      </div>

      {/* League selector */}
      <div style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: '1rem', color: 'var(--text2)' }}>내 리그</h2>
        {error ? (
          <div className="card" style={{ color: 'var(--red)' }}>{error}</div>
        ) : leagues.length === 0 ? (
          <div className="card" style={{ color: 'var(--text2)' }}>연동된 NBA 리그가 없어요.</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
            {leagues.map(league => (
              <div
                key={league.league_key}
                className="card"
                onClick={() => selectLeague(league)}
                style={{ cursor: 'pointer', border: selectedLeague?.league_key === league.league_key ? '1px solid var(--accent)' : '1px solid var(--border)', transition: 'all 0.15s' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>{league.name}</div>
                    <div style={{ color: 'var(--text2)', fontSize: 12 }}>{league.season}시즌 · {league.num_teams}팀</div>
                  </div>
                  {selectedLeague?.league_key === league.league_key && (
                    <span className="badge" style={{ background: 'rgba(249,115,22,0.15)', color: 'var(--accent)' }}>선택됨</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* My Roster */}
      {selectedLeague && (
        <div>
          <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: '1rem', color: 'var(--text2)' }}>
            내 로스터 {team && `— ${team.name}`}
          </h2>
          {teamLoading ? (
            <div className="card" style={{ color: 'var(--text2)' }}>로스터 불러오는 중...</div>
          ) : team ? (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <table>
                <thead>
                  <tr>
                    <th>포지션</th>
                    <th>선수</th>
                    <th>팀</th>
                    <th>상태</th>
                    <th style={{ textAlign: 'right' }}>Fantasy Score</th>
                  </tr>
                </thead>
                <tbody>
                  {team.roster.map(p => (
                    <tr key={p.player_key}>
                      <td><span className="pos-badge">{p.roster_position}</span></td>
                      <td style={{ fontWeight: 500 }}>{p.name}</td>
                      <td style={{ color: 'var(--text2)' }}>{p.team}</td>
                      <td>
                        <span className={`status-${p.status}`} style={{ fontSize: 12 }}>
                          {p.status === 'active' ? '정상' : p.status === 'injured' ? '부상' : p.status === 'out' ? '결장' : p.status === 'gtd' ? 'GTD' : '정지'}
                        </span>
                        {p.injury_note && <span style={{ color: 'var(--text3)', fontSize: 11, marginLeft: 6 }}>{p.injury_note}</span>}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--accent)' }}>
                        {(p.fantasy_score || 0).toFixed(1)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="card" style={{ color: 'var(--text2)' }}>로스터 정보를 가져올 수 없어요.</div>
          )}

          {/* Quick Nav */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', marginTop: '1.5rem' }}>
            {[
              { href: `/draft?league_key=${selectedLeague.league_key}`, icon: '📋', title: '드래프트 어시스턴트', desc: 'Snake 드래프트 최적 픽 추천' },
              { href: `/trade?league_key=${selectedLeague.league_key}`, icon: '🔄', title: '트레이드 분석기', desc: '트레이드 공정성 점수 계산' },
              { href: `/waiver?league_key=${selectedLeague.league_key}`, icon: '➕', title: '웨이버 어드바이저', desc: '픽업/컷 자동 추천' },
            ].map(m => (
              <Link key={m.href} href={m.href} style={{ textDecoration: 'none' }}>
                <div className="card" style={{ cursor: 'pointer', transition: 'border-color 0.15s' }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--border2)')}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}>
                  <div style={{ fontSize: 24, marginBottom: '0.5rem' }}>{m.icon}</div>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>{m.title}</div>
                  <div style={{ color: 'var(--text2)', fontSize: 12 }}>{m.desc}</div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

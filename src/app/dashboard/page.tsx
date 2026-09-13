'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import {
  Activity,
  BarChart3,
  CircleAlert,
  Database,
  DraftingCompass,
  LogIn,
  RefreshCw,
  Scale,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react';
import { useYahooLeague } from '@/hooks/useYahooLeague';

function relativeTime(value?: string | null): string {
  if (!value) return '동기화 기록 없음';
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return `${seconds}초 전`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}분 전`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}시간 전`;
  return `${Math.floor(seconds / 86400)}일 전`;
}

function freshness(value?: string | null): 'fresh' | 'aging' | 'stale' | 'empty' {
  if (!value) return 'empty';
  const minutes = (Date.now() - new Date(value).getTime()) / 60000;
  if (minutes <= 20) return 'fresh';
  if (minutes <= 120) return 'aging';
  return 'stale';
}

export default function DashboardPage() {
  const {
    authenticated, leagues, activeLeagueKey, setActiveLeagueKey,
    myTeam, freeAgents, projections, projectionWarnings,
    loading, lastUpdatedAt, error, refresh,
  } = useYahooLeague();

  const activeLeague = leagues.find((league) => league.league_key === activeLeagueKey);
  const syncFreshness = freshness(lastUpdatedAt);
  const roster = useMemo(() => myTeam?.roster ?? [], [myTeam]);
  const matched = useMemo(
    () => [...roster, ...freeAgents].filter((player) => projections.has(player.player_key)).length,
    [roster, freeAgents, projections],
  );
  const highConfidence = useMemo(
    () => [...projections.values()].filter((projection) => projection.dataQuality === 'high' || projection.dataQuality === 'medium').length,
    [projections],
  );

  if (authenticated === false) {
    return (
      <div className="playbook-shell">
        <main className="playbook-main" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
          <div className="panel primary-panel" style={{ maxWidth: 420, textAlign: 'center', padding: '2.5rem' }}>
            <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>🏀 NBA Fantasy Assistant</h1>
            <p style={{ color: 'var(--text2)', fontSize: 13, marginBottom: 20, lineHeight: 1.6 }}>
              Yahoo Fantasy 계정으로 로그인하면 리그·로스터·FA를 자동으로 읽고, 예측 모델이 바로 계산됩니다. 이후 매번 다시 로그인할 필요 없습니다.
            </p>
            <a href="/api/auth/yahoo" className="btn btn-primary" style={{ justifyContent: 'center', width: '100%' }}>
              <LogIn size={16} /> Yahoo로 로그인
            </a>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="playbook-shell">
      <aside className="playbook-sidebar">
        <div className="brand-lockup">
          <span className="brand-ball">NBA</span>
          <div><strong>Fantasy Assistant</strong><span>Personal Playbook</span></div>
        </div>
        <nav className="side-nav" aria-label="주요 메뉴">
          <Link className="side-nav-item active" href="/dashboard"><BarChart3 size={18} />Overview</Link>
          <Link className="side-nav-item" href="/mock-draft"><DraftingCompass size={18} />Draft Assistant</Link>
          <Link className="side-nav-item" href={`/waiver?league_key=${encodeURIComponent(activeLeagueKey)}`}><Sparkles size={18} />Waiver Assistant</Link>
          <Link className="side-nav-item" href={`/trade?league_key=${encodeURIComponent(activeLeagueKey)}`}><Scale size={18} />Trade Analyzer</Link>
        </nav>
        <div className="readonly-note">
          <ShieldCheck size={18} />
          <div><strong>Read-only</strong><span>Yahoo에는 아무 작업도 실행하지 않습니다.</span></div>
        </div>
      </aside>

      <main className="playbook-main">
        <header className="playbook-header">
          <div>
            <span className="eyebrow">MY PLAYBOOK</span>
            <h1>{activeLeague ? activeLeague.name : 'NBA Fantasy Command Center'}</h1>
            <p>Yahoo 로그인 하나로 리그 상태와 예측을 전부 자동으로 읽습니다.</p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {leagues.length > 1 && (
              <select value={activeLeagueKey} onChange={(event) => setActiveLeagueKey(event.target.value)}>
                {leagues.map((league) => <option key={league.league_key} value={league.league_key}>{league.name}</option>)}
              </select>
            )}
            <button className="btn btn-secondary sync-button" onClick={refresh} disabled={loading}>
              <RefreshCw size={16} className={loading ? 'spin' : ''} />
              {loading ? '갱신 중' : '지금 갱신'}
            </button>
          </div>
        </header>

        <section className={`sync-banner ${syncFreshness}`}>
          <div className="sync-leading">
            <span className="sync-dot" />
            <div>
              <strong>Yahoo 자동 연동됨</strong>
              <span>마지막 자동 갱신 {relativeTime(lastUpdatedAt)} · 15분마다 자동 재조회</span>
            </div>
          </div>
          <div className="sync-safety"><ShieldCheck size={16} />읽기 전용 · 추가 Yahoo 요청 없음</div>
        </section>

        {error && (
          <section className="panel" style={{ borderColor: 'var(--red)', padding: '1rem 1.25rem' }}>
            <strong style={{ color: 'var(--red)' }}>데이터를 불러오지 못했습니다</strong>
            <p style={{ color: 'var(--text2)', fontSize: 13, marginTop: 4 }}>{error}</p>
          </section>
        )}

        <section className="metric-grid" aria-label="리그 동기화 현황">
          <article className="metric-card"><span className="metric-icon blue"><Users size={19} /></span><div><span>내 로스터</span><strong>{roster.length || '—'}</strong><small>Yahoo API 자동 조회</small></div></article>
          <article className="metric-card"><span className="metric-icon orange"><Activity size={19} /></span><div><span>FA / Waiver</span><strong>{freeAgents.length || '—'}</strong><small>league players;status=FA</small></div></article>
          <article className="metric-card"><span className="metric-icon green"><Sparkles size={19} /></span><div><span>예측 계산 완료</span><strong>{matched || '—'}</strong><small>Yahoo 날짜별 스탯 기반</small></div></article>
          <article className="metric-card"><span className="metric-icon purple"><Database size={19} /></span><div><span>신뢰도 medium 이상</span><strong>{highConfidence || '—'}</strong><small>표본 6경기(주) 이상</small></div></article>
        </section>

        <section className="dashboard-grid">
          <article className="panel primary-panel">
            <div className="panel-heading">
              <div><span className="eyebrow">DECISION CENTER</span><h2>오늘의 판단</h2></div>
              <span className="model-chip">yahoo-fpts-v2.0.0</span>
            </div>
            {!activeLeagueKey ? (
              <div className="empty-decision">
                <CircleAlert size={28} />
                <h3>리그를 찾을 수 없습니다</h3>
                <p>Yahoo 계정에 연결된 NBA 판타지 리그가 없는 것 같습니다.</p>
              </div>
            ) : (
              <div className="decision-list">
                <div className="decision-row"><span className="decision-rank">01</span><div><strong>Yahoo 로그인 및 리그 연결 완료</strong><p>{activeLeague?.name ?? activeLeagueKey} · {activeLeague?.num_teams ?? '?'}팀 리그</p></div><span className="decision-status ready">READY</span></div>
                <div className="decision-row"><span className="decision-rank">02</span><div><strong>{roster.length > 0 ? '로스터 자동 조회 완료' : '로스터 조회 중'}</strong><p>{roster.length}명의 내 팀 선수를 확인했습니다.</p></div><span className={`decision-status ${roster.length > 0 ? 'ready' : 'waiting'}`}>{roster.length > 0 ? 'READY' : 'WAITING'}</span></div>
                <div className="decision-row"><span className="decision-rank">03</span><div><strong>{matched > 0 ? '예측 모델 계산 완료' : '예측 계산 중'}</strong><p>{matched}명의 선수에서 Yahoo 날짜별 스탯으로 P10/P50/P90을 계산했습니다.</p></div><span className={`decision-status ${matched > 0 ? 'ready' : 'waiting'}`}>{matched > 0 ? 'READY' : 'WAITING'}</span></div>
              </div>
            )}
          </article>

          <aside className="panel data-health">
            <div className="panel-heading"><div><span className="eyebrow">DATA HEALTH</span><h2>판단 신뢰도</h2></div></div>
            <div className="health-row"><span>Yahoo 로그인</span><strong className="fresh">연결됨 · 자동 갱신</strong></div>
            <div className="health-row"><span>선수 스탯 이력</span><strong className={matched > 0 ? 'fresh' : 'stale'}>{matched > 0 ? 'Yahoo 날짜별 스탯 조회됨' : '조회 대기'}</strong></div>
            <div className="health-row"><span>일정/상대전적 보정</span><strong className="stale">v1 미지원 (경기당 예상치만 제공)</strong></div>
            <div className="health-row"><span>부상 정보</span><strong className="fresh">Yahoo 상태 필드 자동 반영</strong></div>
            <div className="health-row"><span>데이터 비용</span><strong className="fresh">무료 · 외부 API 없음</strong></div>
            <p className="health-footnote">핵심 데이터가 부족하면 과거 평균으로 대체하지 않고 신뢰도를 낮춰 표시합니다.</p>
          </aside>
        </section>

        {matched > 0 && (
          <section className="panel projections-panel">
            <div className="panel-heading">
              <div><span className="eyebrow">경기당 예상 (다음 스탯 기준)</span><h2>선수별 예상 점수</h2></div>
              {loading && <span className="model-chip">계산 중…</span>}
            </div>
            <div className="table-scroll">
              <table className="projections-table">
                <thead>
                  <tr>
                    <th>선수</th>
                    <th>팀</th>
                    <th>경기당 예상</th>
                    <th>P10</th>
                    <th>P50</th>
                    <th>P90</th>
                    <th>출전확률</th>
                    <th>신뢰도</th>
                    <th>데이터 품질</th>
                    <th>표본</th>
                  </tr>
                </thead>
                <tbody>
                  {[...roster, ...freeAgents.slice(0, 40)].map((player) => {
                    const projection = projections.get(player.player_key);
                    if (!projection) return null;
                    return (
                      <tr key={player.player_key}>
                        <td>{player.name}</td>
                        <td>{player.team}</td>
                        <td>{projection.pointsPerActiveGame}</td>
                        <td>{projection.p10}</td>
                        <td>{projection.p50}</td>
                        <td>{projection.p90}</td>
                        <td>{Math.round(projection.availabilityProbability * 100)}%</td>
                        <td>{Math.round(projection.confidence * 100)}%</td>
                        <td>{projection.dataQuality}</td>
                        <td>{projection.recentGamesUsed}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {projectionWarnings.map((warning) => (
              <p className="health-footnote" key={warning}>{warning}</p>
            ))}
          </section>
        )}

        <section className="panel roadmap-panel">
          <div className="panel-heading"><div><span className="eyebrow">ASSISTANT MODULES</span><h2>예측 기반 분석</h2></div></div>
          <div className="module-grid">
            <Link href="/mock-draft" className="module-card active-module"><DraftingCompass size={22} /><strong>Draft Assistant</strong><span>잔여 시즌 점수와 포지션 대체가치 기반</span><em>사용 가능</em></Link>
            <Link href={`/waiver?league_key=${encodeURIComponent(activeLeagueKey)}`} className="module-card active-module"><Sparkles size={22} /><strong>Waiver Assistant</strong><span>향후 예측 기반 픽업/컷 비교</span><em>사용 가능</em></Link>
            <Link href={`/trade?league_key=${encodeURIComponent(activeLeagueKey)}`} className="module-card active-module"><Scale size={22} /><strong>Trade Analyzer</strong><span>예측 기반 다자 트레이드 분석</span><em>사용 가능</em></Link>
          </div>
        </section>
      </main>
    </div>
  );
}

'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  BarChart3,
  CircleAlert,
  Database,
  DraftingCompass,
  RefreshCw,
  Scale,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react';
import { useCompanionSync } from '@/hooks/useCompanionSync';

const SCHEDULE_REQUEST = 'NBA_ASSISTANT_SCHEDULE_REQUEST';
const SCHEDULE_RESPONSE = 'NBA_ASSISTANT_SCHEDULE_RESPONSE';
const SCHEDULE_TIMEOUT_MS = 12000;
const WINDOW_DAYS = 7;

interface ScheduleGame {
  date: string;
  opponent: string;
  home: boolean;
}

interface SchedulePayload {
  gamesByTeam: Record<string, ScheduleGame[]>;
  scheduleCoverage: { start: string; end: string } | null;
  errors: string[];
}

type ScheduleStatus = 'idle' | 'waiting' | 'ready' | 'timeout';

interface CompanionProjection {
  playerId: string;
  playerName: string;
  team: string;
  gamesInWindow: number;
  gamesPlayedThisSeason: number;
  availabilityProbability: number;
  pointsPerActiveGame: number;
  expectedTotalPoints: number;
  p10: number;
  p50: number;
  p90: number;
  confidence: number;
  dataQuality: 'high' | 'medium' | 'low' | 'insufficient';
  injuryStatus: string;
  warnings: string[];
}

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
  if (minutes <= 15) return 'fresh';
  if (minutes <= 120) return 'aging';
  return 'stale';
}

function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export default function DashboardPage() {
  const {
    installed, version, latestSync: companionLastSync, activeLeague, leagueSnapshots,
    players: observedPlayers, checking, requestSync,
  } = useCompanionSync();
  const [schedule, setSchedule] = useState<SchedulePayload | null>(null);
  const [scheduleStatus, setScheduleStatus] = useState<ScheduleStatus>('idle');
  const [projections, setProjections] = useState<CompanionProjection[]>([]);
  const [projectionsLoading, setProjectionsLoading] = useState(false);
  const [projectionsError, setProjectionsError] = useState<string>();
  const [projectionWarnings, setProjectionWarnings] = useState<string[]>([]);

  const latestSync = companionLastSync;
  const syncFreshness = freshness(latestSync);
  const rostered = observedPlayers.filter((player) => player.availability === 'ROSTERED').length;
  const available = observedPlayers.filter((player) => ['FREE_AGENT', 'WAIVER'].includes(player.availability)).length;
  const pageCoverage = new Set(leagueSnapshots.map((snapshot) => snapshot.pageKind));

  // Players Yahoo's own table gave us a season-average stat line for — these are the ones we
  // can actually score, since neither NBA.com nor ESPN can be reached to fill the gap for
  // anyone else (both are blocked from Vercel and from this extension's own fetches alike).
  const scorablePlayers = useMemo(
    () => observedPlayers.filter((player) => player.seasonAverage && player.nbaTeam),
    [observedPlayers],
  );
  const teams = useMemo(
    () => [...new Set(scorablePlayers.map((player) => player.nbaTeam as string))],
    [scorablePlayers],
  );
  const windowStart = useMemo(() => isoDate(new Date()), []);
  const windowEnd = useMemo(() => {
    const end = new Date();
    end.setUTCDate(end.getUTCDate() + (WINDOW_DAYS - 1));
    return isoDate(end);
  }, []);

  // Ask the Companion extension how many games each observed team has in the coming week.
  // This is a lookup against a schedule bundled into the extension at build time (no network
  // call at all) — see extension/background.js and scripts/build-schedule.cjs.
  useEffect(() => {
    if (teams.length === 0) return;
    const waitingTimer = window.setTimeout(() => setScheduleStatus('waiting'), 0);

    const onScheduleMessage = (event: MessageEvent) => {
      if (event.source !== window || event.data?.type !== SCHEDULE_RESPONSE) return;
      const payload = event.data.payload as SchedulePayload;
      setSchedule(payload);
      setScheduleStatus('ready');
    };
    window.addEventListener('message', onScheduleMessage);

    window.postMessage({
      type: SCHEDULE_REQUEST,
      payload: { teams, startDate: windowStart, endDate: windowEnd },
    }, window.location.origin);

    const timeoutTimer = window.setTimeout(() => {
      setScheduleStatus((current) => (current === 'ready' ? current : 'timeout'));
    }, SCHEDULE_TIMEOUT_MS);

    return () => {
      window.removeEventListener('message', onScheduleMessage);
      window.clearTimeout(waitingTimer);
      window.clearTimeout(timeoutTimer);
    };
    // teams is derived fresh each render; comparing by its joined value avoids re-requesting
    // the schedule on every unrelated re-render while still reacting to real team-set changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teams.join(','), windowStart, windowEnd]);

  const scheduleReady = scheduleStatus === 'ready';

  // Once the schedule lookup answers, score each player's Yahoo season-average stat line
  // against however many games they have this window via the same-origin projection route —
  // no external NBA data source is called anywhere in this path.
  useEffect(() => {
    if (!scheduleReady || scorablePlayers.length === 0) {
      const clearTimer = window.setTimeout(() => setProjections([]), 0);
      return () => window.clearTimeout(clearTimer);
    }
    const controller = new AbortController();
    const startTimer = window.setTimeout(() => {
      setProjectionsLoading(true);
      setProjectionsError(undefined);
    }, 0);

    const players = scorablePlayers.map((player) => ({
      yahooPlayerId: player.yahooPlayerId,
      name: player.name,
      team: player.nbaTeam,
      seasonAverage: player.seasonAverage,
      rawStatus: player.rawStatus,
      gamesInWindow: schedule?.gamesByTeam[player.nbaTeam as string]?.length ?? 0,
    }));

    fetch('/api/projections/companion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        players,
        scheduleCoverage: schedule?.scheduleCoverage ?? null,
        windowStart,
        windowEnd,
      }),
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = await response.json() as { projections?: CompanionProjection[]; warnings?: string[]; error?: string };
        if (!response.ok || !payload.projections) throw new Error(payload.error ?? '예측 점수 계산 실패');
        setProjections(payload.projections);
        setProjectionWarnings(payload.warnings ?? []);
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === 'AbortError') return;
        setProjectionsError(error instanceof Error ? error.message : '예측 점수 계산 실패');
      })
      .finally(() => setProjectionsLoading(false));

    return () => {
      window.clearTimeout(startTimer);
      controller.abort();
    };
    // scorablePlayers is derived fresh each render; length is a reasonable proxy since it only
    // changes when the underlying Yahoo directory actually changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scheduleReady, scorablePlayers.length, schedule]);

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
          <span className="side-nav-item disabled"><Sparkles size={18} />Waiver Assistant<small>준비 중</small></span>
          <span className="side-nav-item disabled"><Scale size={18} />Trade Analyzer<small>준비 중</small></span>
          <span className="side-nav-item disabled"><Users size={18} />League Analyzer<small>준비 중</small></span>
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
            <h1>{activeLeague ? `Yahoo League #${activeLeague}` : 'NBA Fantasy Command Center'}</h1>
            <p>리그 상태를 자동으로 읽고, 예상 팀 점수 변화로 다음 선택을 판단합니다.</p>
          </div>
          <button className="btn btn-secondary sync-button" onClick={requestSync} disabled={checking}>
            <RefreshCw size={16} className={checking ? 'spin' : ''} />
            {checking ? '확인 중' : '상태 확인'}
          </button>
        </header>

        <section className={`sync-banner ${syncFreshness}`}>
          <div className="sync-leading">
            <span className="sync-dot" />
            <div>
              <strong>{installed ? 'Yahoo Companion 연결됨' : 'Yahoo Companion 연결 대기'}</strong>
              <span>{installed
                ? `마지막 자동 반영 ${relativeTime(latestSync)} · 확장 v${version ?? '0.1.0'}`
                : '확장 프로그램 설치 후 Yahoo Fantasy 페이지를 열면 자동으로 반영됩니다.'}</span>
            </div>
          </div>
          <div className="sync-safety"><ShieldCheck size={16} />현재 화면만 읽기 · 추가 Yahoo 요청 없음</div>
        </section>

        <section className="metric-grid" aria-label="리그 동기화 현황">
          <article className="metric-card"><span className="metric-icon blue"><Users size={19} /></span><div><span>확인된 선수</span><strong>{observedPlayers.length || '—'}</strong><small>현재 열린 Yahoo 화면 기준</small></div></article>
          <article className="metric-card"><span className="metric-icon orange"><Activity size={19} /></span><div><span>로스터 등록</span><strong>{rostered || '—'}</strong><small>중복 제거 후</small></div></article>
          <article className="metric-card"><span className="metric-icon green"><Sparkles size={19} /></span><div><span>FA / Waiver</span><strong>{available || '—'}</strong><small>Players 화면 관측값</small></div></article>
          <article className="metric-card"><span className="metric-icon purple"><Database size={19} /></span><div><span>시즌 스탯 확인</span><strong>{scorablePlayers.length || '—'}</strong><small>{pageCoverage.size ? `${[...pageCoverage].join(' · ')} 화면` : '수집 대기'}</small></div></article>
        </section>

        <section className="dashboard-grid">
          <article className="panel primary-panel">
            <div className="panel-heading">
              <div><span className="eyebrow">DECISION CENTER</span><h2>오늘의 판단</h2></div>
              <span className="model-chip">nba-fpts-v1.1.0-season-avg</span>
            </div>
            {observedPlayers.length === 0 ? (
              <div className="empty-decision">
                <CircleAlert size={28} />
                <h3>Yahoo 데이터가 아직 없습니다</h3>
                <p>확장 프로그램을 설치하고 Yahoo Fantasy의 My Team 또는 Players 화면을 열어주세요. 직접 입력할 내용은 없습니다.</p>
                <ol><li>Chrome에서 확장 프로그램 폴더 로드</li><li>Yahoo Fantasy 페이지 새로고침</li><li>대시보드 자동 반영</li></ol>
              </div>
            ) : (
              <div className="decision-list">
                <div className="decision-row"><span className="decision-rank">01</span><div><strong>리그 상태 수집 완료</strong><p>{observedPlayers.length}명의 선수를 기준으로 예측 준비가 가능합니다.</p></div><span className="decision-status ready">READY</span></div>
                <div className="decision-row"><span className="decision-rank">02</span><div><strong>{scorablePlayers.length > 0 ? 'Yahoo 시즌 평균 스탯 읽기 완료' : 'Yahoo 시즌 평균 스탯 확인 중'}</strong><p>{scorablePlayers.length}명의 선수에서 시즌 평균 스탯(Stats 드롭다운이 &quot;Season (avg)&quot;일 때)을 읽었습니다.</p></div><span className={`decision-status ${scorablePlayers.length > 0 ? 'ready' : 'waiting'}`}>{scorablePlayers.length > 0 ? 'READY' : 'WAITING'}</span></div>
                <div className="decision-row"><span className="decision-rank">03</span><div><strong>{scheduleReady ? '일정 데이터 연결 완료' : '일정 데이터 연결 대기'}</strong><p>{scheduleStatus === 'timeout' ? 'Companion 확장을 v0.3.0으로 업데이트(재로드)해야 일정을 읽을 수 있습니다.' : schedule?.scheduleCoverage ? `번들 일정 범위: ${schedule.scheduleCoverage.start} ~ ${schedule.scheduleCoverage.end}` : 'Companion 확장이 응답하면 일정 조회가 시작됩니다.'}</p></div><span className={`decision-status ${scheduleReady ? 'ready' : 'waiting'}`}>{scheduleReady ? 'READY' : 'WAITING'}</span></div>
              </div>
            )}
          </article>

          <aside className="panel data-health">
            <div className="panel-heading"><div><span className="eyebrow">DATA HEALTH</span><h2>판단 신뢰도</h2></div></div>
            <div className="health-row"><span>Yahoo 로스터</span><strong className={syncFreshness}>{relativeTime(latestSync)}</strong></div>
            <div className="health-row"><span>NBA 스탯</span><strong className={scorablePlayers.length > 0 ? 'fresh' : 'stale'}>{scorablePlayers.length > 0 ? 'Yahoo 시즌 평균에서 직접 읽음' : '시즌 평균 스탯 대기'}</strong></div>
            <div className="health-row"><span>일정 데이터</span><strong className={scheduleReady ? 'fresh' : 'stale'}>{scheduleReady ? '번들 일정 연결됨' : '연결 대기'}</strong></div>
            <div className="health-row"><span>부상 정보</span><strong className={installed ? 'fresh' : 'stale'}>{installed ? 'Yahoo 상태 수집됨' : 'Yahoo Companion 대기'}</strong></div>
            <div className="health-row"><span>데이터 비용</span><strong className="fresh">무료 · API 키 없음</strong></div>
            <p className="health-footnote">핵심 데이터가 오래되거나 누락되면 과거 평균으로 대체하지 않고 추천을 중단합니다.</p>
          </aside>
        </section>

        {scorablePlayers.length > 0 && (
          <section className="panel projections-panel">
            <div className="panel-heading">
              <div><span className="eyebrow">NEXT {WINDOW_DAYS} DAYS</span><h2>선수별 예상 점수</h2></div>
              {projectionsLoading && <span className="model-chip">계산 중…</span>}
            </div>
            {projectionsError ? (
              <p className="health-footnote">{projectionsError}</p>
            ) : (
              <div className="table-scroll">
                <table className="projections-table">
                  <thead>
                    <tr>
                      <th>Yahoo 선수</th>
                      <th>팀</th>
                      <th>경기 수</th>
                      <th>경기당 예상</th>
                      <th>P10</th>
                      <th>P50</th>
                      <th>P90</th>
                      <th>출전확률</th>
                      <th>신뢰도</th>
                      <th>데이터 품질</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scorablePlayers.map((player) => {
                      const projection = projections.find((item) => item.playerId === player.yahooPlayerId);
                      return (
                        <tr key={player.yahooPlayerId}>
                          <td>{player.name}</td>
                          <td>{player.nbaTeam}</td>
                          <td>{projection?.gamesInWindow ?? '—'}</td>
                          <td>{projection?.pointsPerActiveGame ?? '—'}</td>
                          <td>{projection?.p10 ?? '—'}</td>
                          <td>{projection?.p50 ?? '—'}</td>
                          <td>{projection?.p90 ?? '—'}</td>
                          <td>{projection ? `${Math.round(projection.availabilityProbability * 100)}%` : '—'}</td>
                          <td>{projection ? `${Math.round(projection.confidence * 100)}%` : '—'}</td>
                          <td>{projection?.dataQuality ?? '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {projectionWarnings.map((warning) => (
              <p className="health-footnote" key={warning}>{warning}</p>
            ))}
          </section>
        )}

        <section className="panel roadmap-panel">
          <div className="panel-heading"><div><span className="eyebrow">ASSISTANT MODULES</span><h2>예측 기반 분석</h2></div></div>
          <div className="module-grid">
            <Link href="/mock-draft" className="module-card active-module"><DraftingCompass size={22} /><strong>Draft Assistant</strong><span>잔여 시즌 점수와 포지션 대체가치 기반</span><em>사용 가능</em></Link>
            <div className="module-card"><Sparkles size={22} /><strong>Waiver Assistant</strong><span>향후 7·14일 예상 팀 점수 증가분</span><em>데이터 연결 후 활성화</em></div>
            <div className="module-card"><Scale size={22} /><strong>Trade Analyzer</strong><span>거래 전후 최적 로스터 예상점수 비교</span><em>데이터 연결 후 활성화</em></div>
            <div className="module-card"><BarChart3 size={22} /><strong>League Analyzer</strong><span>팀별 잔여시즌 예상점수와 우승 확률</span><em>2차 개발</em></div>
          </div>
        </section>
      </main>
    </div>
  );
}

'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { YahooPageSnapshot } from '@/types/companion';
import type { PlayerProjectionV1 } from '@/types/companion';
import type { NBAGame, NBAPlayerGameStat, NBAPlayerIdentity } from '@/lib/nba-data/types';

const REQUEST = 'NBA_ASSISTANT_REQUEST_SYNC';
const RESPONSE = 'NBA_ASSISTANT_SYNC_STATE';
const MATCH_REQUEST = 'NBA_ASSISTANT_MATCH_REQUEST';
const MATCH_RESPONSE = 'NBA_ASSISTANT_MATCH_RESPONSE';
const CACHE_KEY = 'nba-assistant-yahoo-snapshots';
const RELAY_TIMEOUT_MS = 12000;

type YahooPlayerDirectory = Record<string, { updatedAt: string; players: Record<string, YahooPageSnapshot['players'][number]> }>;

interface CompanionState {
  installed: boolean;
  readOnly: boolean;
  version?: string;
  lastSyncAt?: string | null;
  snapshots: YahooPageSnapshot[];
  playerDirectories: YahooPlayerDirectory;
}

interface NBAProviderState {
  provider: string;
  configured: boolean;
  connected: boolean | null;
  modelVersion: string;
  requiredTier?: string;
  injurySource?: string;
  usage?: { used: number; limit: number; remaining: number } | null;
  message: string;
}

interface RelayMatch {
  yahooPlayerId: string;
  yahooName: string;
  status: 'matched' | 'ambiguous' | 'unmatched';
  confidence: number;
  reason: string;
  nbaPlayer?: NBAPlayerIdentity;
}

interface RelayPayload {
  collectedAt: string;
  matches: RelayMatch[];
  games: NBAGame[];
  gameStats: NBAPlayerGameStat[];
  errors: string[];
}

type RelayStatus = 'idle' | 'waiting' | 'ready' | 'timeout';

const EMPTY_STATE: CompanionState = { installed: false, readOnly: true, snapshots: [], playerDirectories: {} };
const EMPTY_PROVIDER: NBAProviderState = {
  provider: 'ESPN NBA Public Data',
  configured: false,
  connected: false,
  modelVersion: 'nba-fpts-v1.0.0',
  message: 'NBA 데이터 공급자 상태 확인 중',
};

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

export default function DashboardPage() {
  const [companion, setCompanion] = useState<CompanionState>(EMPTY_STATE);
  const [nbaProvider, setNBAProvider] = useState<NBAProviderState>(EMPTY_PROVIDER);
  const [checking, setChecking] = useState(true);
  const [relay, setRelay] = useState<RelayPayload | null>(null);
  const [relayStatus, setRelayStatus] = useState<RelayStatus>('idle');
  const [projections, setProjections] = useState<PlayerProjectionV1[]>([]);
  const [projectionsLoading, setProjectionsLoading] = useState(false);
  const [projectionsError, setProjectionsError] = useState<string>();
  const [, setClock] = useState(() => Date.now());

  const requestSync = useCallback(() => {
    setChecking(true);
    window.postMessage({ type: REQUEST }, window.location.origin);
    window.setTimeout(() => setChecking(false), 900);
  }, []);

  useEffect(() => {
    const cached = window.localStorage.getItem(CACHE_KEY);
    if (cached) {
      try {
        const parsed = JSON.parse(cached) as { snapshots: YahooPageSnapshot[]; playerDirectories?: YahooPlayerDirectory };
        window.setTimeout(() => {
          setCompanion((current) => ({ ...current, snapshots: parsed.snapshots ?? [], playerDirectories: parsed.playerDirectories ?? {} }));
        }, 0);
      } catch {
        window.localStorage.removeItem(CACHE_KEY);
      }
    }

    const onMessage = (event: MessageEvent) => {
      if (event.source !== window || event.data?.type !== RESPONSE) return;
      const payload = event.data.payload as Partial<CompanionState>;
      setCompanion((current) => {
        const next = {
          ...current,
          ...payload,
          installed: true,
          readOnly: payload.readOnly ?? current.readOnly,
          snapshots: payload.snapshots ?? current.snapshots,
          playerDirectories: payload.playerDirectories ?? current.playerDirectories,
        };
        if (payload.snapshots || payload.playerDirectories) {
          window.localStorage.setItem(CACHE_KEY, JSON.stringify({ snapshots: next.snapshots, playerDirectories: next.playerDirectories }));
        }
        return next;
      });
      setChecking(false);
    };

    window.addEventListener('message', onMessage);
    const initialSyncTimer = window.setTimeout(requestSync, 0);
    const syncTimer = window.setInterval(requestSync, 15000);
    const clockTimer = window.setInterval(() => setClock(Date.now()), 30000);
    return () => {
      window.removeEventListener('message', onMessage);
      window.clearTimeout(initialSyncTimer);
      window.clearInterval(syncTimer);
      window.clearInterval(clockTimer);
    };
  }, [requestSync]);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/nba/status?probe=1', { signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json() as NBAProviderState;
        setNBAProvider(payload);
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === 'AbortError') return;
        setNBAProvider((current) => ({ ...current, message: 'NBA 데이터 공급자 상태 확인 실패' }));
      });
    return () => controller.abort();
  }, []);

  const latestSync = companion.lastSyncAt
    ?? companion.snapshots.map((snapshot) => snapshot.observedAt).sort().at(-1)
    ?? null;
  const syncFreshness = freshness(latestSync);
  const activeLeague = companion.snapshots[0]?.leagueId ?? Object.keys(companion.playerDirectories)[0];
  const leagueSnapshots = useMemo(
    () => companion.snapshots.filter((snapshot) => !activeLeague || snapshot.leagueId === activeLeague),
    [activeLeague, companion.snapshots],
  );
  // Read from the per-league player directory (accumulated one player at a time as pages are
  // visited) rather than merging whole-page snapshots, since Yahoo's paginated list views
  // (25 players/page) don't reliably produce a distinct snapshot per page — see yahoo-content.js.
  const observedPlayers = useMemo(() => {
    if (!activeLeague) return [];
    return Object.values(companion.playerDirectories[activeLeague]?.players ?? {});
  }, [activeLeague, companion.playerDirectories]);
  const rostered = observedPlayers.filter((player) => player.availability === 'ROSTERED').length;
  const available = observedPlayers.filter((player) => ['FREE_AGENT', 'WAIVER'].includes(player.availability)).length;
  const pageCoverage = new Set(leagueSnapshots.map((snapshot) => snapshot.pageKind));

  // Ask the Companion browser relay (not the server) to match observed Yahoo players against
  // its client-side ESPN player directory, since Vercel egress to NBA data sources is blocked.
  useEffect(() => {
    if (observedPlayers.length === 0) return;
    const waitingTimer = window.setTimeout(() => setRelayStatus('waiting'), 0);

    const onRelayMessage = (event: MessageEvent) => {
      if (event.source !== window || event.data?.type !== MATCH_RESPONSE) return;
      const payload = event.data.payload as RelayPayload;
      setRelay(payload);
      setRelayStatus('ready');
    };
    window.addEventListener('message', onRelayMessage);

    const requestPlayers = observedPlayers.map((player) => ({
      yahooPlayerId: player.yahooPlayerId,
      name: player.name,
      nbaTeam: player.nbaTeam,
      eligiblePositions: player.eligiblePositions,
      rawStatus: player.rawStatus,
    }));
    window.postMessage({ type: MATCH_REQUEST, payload: { players: requestPlayers } }, window.location.origin);

    const timeoutTimer = window.setTimeout(() => {
      setRelayStatus((current) => (current === 'ready' ? current : 'timeout'));
    }, RELAY_TIMEOUT_MS);

    return () => {
      window.removeEventListener('message', onRelayMessage);
      window.clearTimeout(waitingTimer);
      window.clearTimeout(timeoutTimer);
    };
  }, [observedPlayers]);

  const matchedPlayers = useMemo(() => {
    if (!relay) return [];
    return relay.matches
      .filter((match): match is RelayMatch & { nbaPlayer: NBAPlayerIdentity } => match.status === 'matched' && Boolean(match.nbaPlayer))
      .map((match) => {
        const original = observedPlayers.find((player) => player.yahooPlayerId === match.yahooPlayerId);
        return { match, original, nbaPlayer: match.nbaPlayer };
      });
  }, [relay, observedPlayers]);

  const matchSummary = useMemo(() => {
    if (!relay) return { total: 0, matched: 0, ambiguous: 0, unmatched: 0 };
    return {
      total: relay.matches.length,
      matched: relay.matches.filter((match) => match.status === 'matched').length,
      ambiguous: relay.matches.filter((match) => match.status === 'ambiguous').length,
      unmatched: relay.matches.filter((match) => match.status === 'unmatched').length,
    };
  }, [relay]);

  // Once the companion has matched players and collected schedule/gamelog data client-side,
  // send that normalized payload to a same-origin API route that runs the existing projection
  // model in memory — no outbound request from Vercel is involved.
  useEffect(() => {
    if (matchedPlayers.length === 0) {
      const clearTimer = window.setTimeout(() => setProjections([]), 0);
      return () => window.clearTimeout(clearTimer);
    }
    const controller = new AbortController();
    const startTimer = window.setTimeout(() => {
      setProjectionsLoading(true);
      setProjectionsError(undefined);
    }, 0);

    const players = matchedPlayers.map(({ nbaPlayer, original }) => ({
      id: nbaPlayer.id,
      name: nbaPlayer.name,
      teamId: nbaPlayer.teamId,
      teamAbbreviation: nbaPlayer.teamAbbreviation,
      positions: nbaPlayer.positions,
      rawStatus: original?.rawStatus,
    }));

    fetch('/api/projections/companion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        players,
        games: relay?.games ?? [],
        gameStats: relay?.gameStats ?? [],
        horizon: 'next_7_days',
      }),
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = await response.json() as { projections?: PlayerProjectionV1[]; error?: string };
        if (!response.ok || !payload.projections) throw new Error(payload.error ?? '예측 점수 계산 실패');
        setProjections(payload.projections);
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
    // matchedPlayers is derived fresh each render from relay + observedPlayers; comparing by
    // length + relay.collectedAt avoids re-fetching on every unrelated re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchedPlayers.length, relay?.collectedAt]);

  const companionConnected = relayStatus === 'ready';

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
              <strong>{companion.installed ? 'Yahoo Companion 연결됨' : 'Yahoo Companion 연결 대기'}</strong>
              <span>{companion.installed
                ? `마지막 자동 반영 ${relativeTime(latestSync)} · 확장 v${companion.version ?? '0.1.0'}`
                : '확장 프로그램 설치 후 Yahoo Fantasy 페이지를 열면 자동으로 반영됩니다.'}</span>
            </div>
          </div>
          <div className="sync-safety"><ShieldCheck size={16} />현재 화면만 읽기 · 추가 Yahoo 요청 없음</div>
        </section>

        <section className="metric-grid" aria-label="리그 동기화 현황">
          <article className="metric-card"><span className="metric-icon blue"><Users size={19} /></span><div><span>확인된 선수</span><strong>{observedPlayers.length || '—'}</strong><small>현재 열린 Yahoo 화면 기준</small></div></article>
          <article className="metric-card"><span className="metric-icon orange"><Activity size={19} /></span><div><span>로스터 등록</span><strong>{rostered || '—'}</strong><small>중복 제거 후</small></div></article>
          <article className="metric-card"><span className="metric-icon green"><Sparkles size={19} /></span><div><span>FA / Waiver</span><strong>{available || '—'}</strong><small>Players 화면 관측값</small></div></article>
          <article className="metric-card"><span className="metric-icon purple"><Database size={19} /></span><div><span>NBA ID 자동 연결</span><strong>{relayStatus === 'waiting' ? '…' : matchSummary.total ? `${matchSummary.matched}/${matchSummary.total}` : '—'}</strong><small>{relayStatus === 'timeout' ? 'Companion v0.2.0 필요' : pageCoverage.size ? `${[...pageCoverage].join(' · ')} 화면` : '수집 대기'}</small></div></article>
        </section>

        <section className="dashboard-grid">
          <article className="panel primary-panel">
            <div className="panel-heading">
              <div><span className="eyebrow">DECISION CENTER</span><h2>오늘의 판단</h2></div>
              <span className="model-chip">{nbaProvider.modelVersion}</span>
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
                <div className="decision-row"><span className="decision-rank">02</span><div><strong>{matchSummary.matched === matchSummary.total && matchSummary.total > 0 ? 'Yahoo 선수 자동 연결 완료' : 'Yahoo 선수 자동 연결 확인 중'}</strong><p>{relayStatus === 'timeout' ? 'Companion 확장을 v0.2.0으로 업데이트(재로드)해야 브라우저에서 직접 매칭이 가능합니다.' : `${matchSummary.total}명 중 ${matchSummary.matched}명을 NBA 공식 선수 ID에 연결했습니다.`}</p></div><span className={`decision-status ${matchSummary.matched === matchSummary.total && matchSummary.total > 0 ? 'ready' : 'waiting'}`}>{relayStatus === 'waiting' ? 'SYNC' : matchSummary.unmatched || matchSummary.ambiguous ? 'CHECK' : matchSummary.total > 0 ? 'READY' : 'WAITING'}</span></div>
                <div className="decision-row"><span className="decision-rank">03</span><div><strong>{companionConnected && matchedPlayers.length > 0 ? '예측 엔진 데이터 연결 완료' : '예측 엔진 데이터 연결 대기'}</strong><p>{companionConnected ? `Companion이 브라우저에서 직접 수집한 일정·스탯으로 ${matchedPlayers.length}명의 예측을 계산합니다.` : 'Companion 확장이 응답하면 예측 계산이 시작됩니다.'}</p></div><span className={`decision-status ${companionConnected ? 'ready' : 'waiting'}`}>{companionConnected ? 'READY' : 'WAITING'}</span></div>
              </div>
            )}
          </article>

          <aside className="panel data-health">
            <div className="panel-heading"><div><span className="eyebrow">DATA HEALTH</span><h2>판단 신뢰도</h2></div></div>
            <div className="health-row"><span>Yahoo 로스터</span><strong className={syncFreshness}>{relativeTime(latestSync)}</strong></div>
            <div className="health-row"><span>NBA 스탯</span><strong className={companionConnected ? 'fresh' : 'stale'}>{companionConnected ? 'Companion 브라우저 릴레이 연결됨' : `서버 경로: ${nbaProvider.message}`}</strong></div>
            <div className="health-row"><span>부상 정보</span><strong className={companion.installed ? 'fresh' : 'stale'}>{companion.installed ? 'Yahoo 상태 수집됨' : 'Yahoo Companion 대기'}</strong></div>
            <div className="health-row"><span>데이터 비용</span><strong className="fresh">무료 · API 키 없음</strong></div>
            <div className="health-row"><span>예측 모델</span><strong className="fresh">v1 구현 완료</strong></div>
            <p className="health-footnote">핵심 데이터가 오래되거나 누락되면 과거 평균으로 대체하지 않고 추천을 중단합니다.</p>
          </aside>
        </section>

        {matchedPlayers.length > 0 && (
          <section className="panel projections-panel">
            <div className="panel-heading">
              <div><span className="eyebrow">NEXT 7 DAYS</span><h2>선수별 예상 점수</h2></div>
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
                      <th>NBA 매칭</th>
                      <th>팀/포지션</th>
                      <th>경기 수</th>
                      <th>P10</th>
                      <th>P50</th>
                      <th>P90</th>
                      <th>출전확률</th>
                      <th>신뢰도</th>
                      <th>데이터 품질</th>
                    </tr>
                  </thead>
                  <tbody>
                    {matchedPlayers.map(({ match, nbaPlayer }) => {
                      const projection = projections.find((item) => item.playerId === nbaPlayer.id);
                      return (
                        <tr key={match.yahooPlayerId}>
                          <td>{match.yahooName}</td>
                          <td>{nbaPlayer.name} <small>#{nbaPlayer.id}</small></td>
                          <td>{nbaPlayer.teamAbbreviation} · {nbaPlayer.positions.join('/') || '—'}</td>
                          <td>{projection?.expectedGames ?? '—'}</td>
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
            {matchSummary.unmatched > 0 || matchSummary.ambiguous > 0 ? (
              <p className="health-footnote">매칭 실패 {matchSummary.unmatched}명 · 동명이인 확인 필요 {matchSummary.ambiguous}명 — 해당 선수는 예측에서 제외되었습니다.</p>
            ) : null}
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

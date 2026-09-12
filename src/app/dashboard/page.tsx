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

const REQUEST = 'NBA_ASSISTANT_REQUEST_SYNC';
const RESPONSE = 'NBA_ASSISTANT_SYNC_STATE';
const CACHE_KEY = 'nba-assistant-yahoo-snapshots';

interface CompanionState {
  installed: boolean;
  readOnly: boolean;
  version?: string;
  lastSyncAt?: string | null;
  snapshots: YahooPageSnapshot[];
}

const EMPTY_STATE: CompanionState = { installed: false, readOnly: true, snapshots: [] };

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
  const [checking, setChecking] = useState(true);
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
        const snapshots = JSON.parse(cached) as YahooPageSnapshot[];
        window.setTimeout(() => {
          setCompanion((current) => ({ ...current, snapshots }));
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
        };
        if (payload.snapshots) {
          window.localStorage.setItem(CACHE_KEY, JSON.stringify(payload.snapshots));
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

  const latestSync = companion.lastSyncAt
    ?? companion.snapshots.map((snapshot) => snapshot.observedAt).sort().at(-1)
    ?? null;
  const syncFreshness = freshness(latestSync);
  const activeLeague = companion.snapshots[0]?.leagueId;
  const leagueSnapshots = useMemo(
    () => companion.snapshots.filter((snapshot) => !activeLeague || snapshot.leagueId === activeLeague),
    [activeLeague, companion.snapshots],
  );
  const observedPlayers = useMemo(() => {
    const players = new Map<string, YahooPageSnapshot['players'][number]>();
    leagueSnapshots.forEach((snapshot) => {
      snapshot.players.forEach((player) => players.set(player.yahooPlayerId, player));
    });
    return [...players.values()];
  }, [leagueSnapshots]);
  const rostered = observedPlayers.filter((player) => player.availability === 'ROSTERED').length;
  const available = observedPlayers.filter((player) => ['FREE_AGENT', 'WAIVER'].includes(player.availability)).length;
  const pageCoverage = new Set(leagueSnapshots.map((snapshot) => snapshot.pageKind));

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
          <article className="metric-card"><span className="metric-icon purple"><Database size={19} /></span><div><span>페이지 커버리지</span><strong>{pageCoverage.size || '—'}</strong><small>{pageCoverage.size ? [...pageCoverage].join(' · ') : '수집 대기'}</small></div></article>
        </section>

        <section className="dashboard-grid">
          <article className="panel primary-panel">
            <div className="panel-heading">
              <div><span className="eyebrow">DECISION CENTER</span><h2>오늘의 판단</h2></div>
              <span className="model-chip">Projection Engine v0.1</span>
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
                <div className="decision-row"><span className="decision-rank">02</span><div><strong>외부 예측 데이터 연결 필요</strong><p>검증된 프로젝션이 들어오기 전에는 임의 추천을 생성하지 않습니다.</p></div><span className="decision-status waiting">WAITING</span></div>
              </div>
            )}
          </article>

          <aside className="panel data-health">
            <div className="panel-heading"><div><span className="eyebrow">DATA HEALTH</span><h2>판단 신뢰도</h2></div></div>
            <div className="health-row"><span>Yahoo 로스터</span><strong className={syncFreshness}>{relativeTime(latestSync)}</strong></div>
            <div className="health-row"><span>NBA 스탯</span><strong className="stale">공급자 미연결</strong></div>
            <div className="health-row"><span>부상 정보</span><strong className="stale">공급자 미연결</strong></div>
            <div className="health-row"><span>예측 모델</span><strong className="aging">계약 준비 완료</strong></div>
            <p className="health-footnote">핵심 데이터가 오래되거나 누락되면 과거 평균으로 대체하지 않고 추천을 중단합니다.</p>
          </aside>
        </section>

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

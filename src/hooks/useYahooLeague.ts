'use client';

import { useCallback, useEffect, useState } from 'react';
import { League, Player, Team } from '@/types';
import { PlayerProjectionV1, ProjectionHorizon } from '@/types/projections';

const LEAGUE_STORAGE_KEY = 'nba-assistant-selected-league';
const REFRESH_INTERVAL_MS = 15 * 60_000;
const PROJECTION_CHUNK_SIZE = 25;
const MAX_FREE_AGENTS_PROJECTED = 40;

function readStoredLeagueKey(): string {
  if (typeof window === 'undefined') return '';
  try {
    return window.localStorage.getItem(LEAGUE_STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

interface UseYahooLeagueOptions {
  horizon?: ProjectionHorizon;
}

export function useYahooLeague(options: UseYahooLeagueOptions = {}) {
  const horizon = options.horizon ?? 'next_7_days';
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [leagues, setLeagues] = useState<League[]>([]);
  const [activeLeagueKey, setActiveLeagueKeyState] = useState<string>(readStoredLeagueKey);
  const [myTeam, setMyTeam] = useState<Team | null>(null);
  const [freeAgents, setFreeAgents] = useState<Player[]>([]);
  const [projections, setProjections] = useState<Map<string, PlayerProjectionV1>>(new Map());
  const [projectionWarnings, setProjectionWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [error, setError] = useState<string>();

  const setActiveLeagueKey = useCallback((key: string) => {
    setActiveLeagueKeyState(key);
    try {
      window.localStorage.setItem(LEAGUE_STORAGE_KEY, key);
    } catch {
      // ignore storage failures (private browsing, quota, etc.)
    }
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const statusRes = await fetch('/api/auth/status');
      const statusPayload = await statusRes.json() as { authenticated: boolean };
      setAuthenticated(statusPayload.authenticated);
      if (!statusPayload.authenticated) return;

      const leaguesRes = await fetch('/api/league');
      const leaguesPayload = await leaguesRes.json() as { leagues?: League[]; error?: string };
      if (!leaguesRes.ok || !leaguesPayload.leagues) throw new Error(leaguesPayload.error ?? '리그 조회에 실패했습니다.');
      setLeagues(leaguesPayload.leagues);

      let key = activeLeagueKey;
      if (!key || !leaguesPayload.leagues.some((league) => league.league_key === key)) {
        key = leaguesPayload.leagues[0]?.league_key ?? '';
        if (key) setActiveLeagueKey(key);
      }
      if (!key) return;

      const [teamRes, faRes] = await Promise.all([
        fetch(`/api/league/team?league_key=${encodeURIComponent(key)}`),
        fetch(`/api/waiver?league_key=${encodeURIComponent(key)}`),
      ]);
      const teamPayload = await teamRes.json() as { team?: Team; error?: string };
      const faPayload = await faRes.json() as { free_agents?: Player[]; error?: string };
      if (!teamRes.ok) throw new Error(teamPayload.error ?? '내 팀 조회에 실패했습니다.');
      if (!faRes.ok) throw new Error(faPayload.error ?? 'FA 목록 조회에 실패했습니다.');

      const team = teamPayload.team ?? null;
      const agents = faPayload.free_agents ?? [];
      setMyTeam(team);
      setFreeAgents(agents);

      const projectionTargets: Player[] = [...(team?.roster ?? []), ...agents.slice(0, MAX_FREE_AGENTS_PROJECTED)];
      const inputs = projectionTargets.map((player) => ({
        player_key: player.player_key,
        name: player.name,
        team: player.team,
        status: player.status,
        injury_note: player.injury_note,
      }));

      const chunks: typeof inputs[] = [];
      for (let i = 0; i < inputs.length; i += PROJECTION_CHUNK_SIZE) chunks.push(inputs.slice(i, i + PROJECTION_CHUNK_SIZE));

      const warnings = new Set<string>();
      const chunkResults = await Promise.all(chunks.map(async (players) => {
        if (players.length === 0) return [] as PlayerProjectionV1[];
        const res = await fetch('/api/projections', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ players, horizon }),
        });
        const payload = await res.json() as { projections?: PlayerProjectionV1[]; warnings?: string[]; error?: string };
        if (!res.ok || !payload.projections) throw new Error(payload.error ?? '예측 계산에 실패했습니다.');
        (payload.warnings ?? []).forEach((warning) => warnings.add(warning));
        return payload.projections;
      }));

      setProjections(new Map(chunkResults.flat().map((projection) => [projection.playerId, projection])));
      setProjectionWarnings([...warnings]);
      setLastUpdatedAt(new Date().toISOString());
    } catch (err) {
      setError(err instanceof Error ? err.message : '데이터를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [activeLeagueKey, horizon, setActiveLeagueKey]);

  useEffect(() => {
    const timer = window.setTimeout(refresh, 0);
    const interval = window.setInterval(refresh, REFRESH_INTERVAL_MS);
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(interval);
    };
  }, [refresh]);

  return {
    authenticated,
    leagues,
    activeLeagueKey,
    setActiveLeagueKey,
    myTeam,
    freeAgents,
    projections,
    projectionWarnings,
    loading,
    lastUpdatedAt,
    error,
    refresh,
  };
}

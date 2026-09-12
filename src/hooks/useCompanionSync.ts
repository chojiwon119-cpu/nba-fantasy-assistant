'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { YahooPageSnapshot } from '@/types/companion';

const REQUEST = 'NBA_ASSISTANT_REQUEST_SYNC';
const RESPONSE = 'NBA_ASSISTANT_SYNC_STATE';
const CACHE_KEY = 'nba-assistant-yahoo-snapshots';

export type YahooPlayerDirectory = Record<string, { updatedAt: string; players: Record<string, YahooPageSnapshot['players'][number]> }>;

interface CompanionState {
  installed: boolean;
  readOnly: boolean;
  version?: string;
  lastSyncAt?: string | null;
  snapshots: YahooPageSnapshot[];
  playerDirectories: YahooPlayerDirectory;
}

const EMPTY_STATE: CompanionState = { installed: false, readOnly: true, snapshots: [], playerDirectories: {} };

/**
 * Reads the Yahoo Companion extension's passively-collected data (roster/player-list
 * snapshots and the accumulated per-league player directory — see yahoo-content.js) via the
 * window.postMessage bridge the extension's content script injects. Shared by every page that
 * needs Yahoo-observed players (Dashboard, Mock Draft, ...) so the sync/caching logic and the
 * per-page-pagination-safe player directory read live in exactly one place.
 */
export function useCompanionSync() {
  const [companion, setCompanion] = useState<CompanionState>(EMPTY_STATE);
  const [checking, setChecking] = useState(true);

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
    return () => {
      window.removeEventListener('message', onMessage);
      window.clearTimeout(initialSyncTimer);
      window.clearInterval(syncTimer);
    };
  }, [requestSync]);

  const latestSync = companion.lastSyncAt
    ?? companion.snapshots.map((snapshot) => snapshot.observedAt).sort().at(-1)
    ?? null;
  const activeLeague = companion.snapshots[0]?.leagueId ?? Object.keys(companion.playerDirectories)[0];
  const leagueSnapshots = useMemo(
    () => companion.snapshots.filter((snapshot) => !activeLeague || snapshot.leagueId === activeLeague),
    [activeLeague, companion.snapshots],
  );
  // Read from the per-league player directory (accumulated one player at a time as pages are
  // visited) rather than merging whole-page snapshots, since Yahoo's paginated list views
  // (25 players/page) don't reliably produce a distinct snapshot per page — see yahoo-content.js.
  const players = useMemo(() => {
    if (!activeLeague) return [];
    return Object.values(companion.playerDirectories[activeLeague]?.players ?? {});
  }, [activeLeague, companion.playerDirectories]);

  return {
    installed: companion.installed,
    version: companion.version,
    latestSync,
    activeLeague,
    leagueSnapshots,
    players,
    checking,
    requestSync,
  };
}

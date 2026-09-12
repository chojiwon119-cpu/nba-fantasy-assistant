import { NBA_PLAYERS } from '@/lib/playerDb';
import {
  DateRange,
  NBADataProvider,
  NBAGame,
  NBAInjury,
  NBAPlayerGameStat,
  NBAPlayerIdentity,
  NBAProviderError,
  ProviderUsage,
} from './types';
import { normalizePlayerName } from './name-utils';

const STATS_BASE_URL = 'https://stats.nba.com/stats';
const SCHEDULE_URL = 'https://cdn.nba.com/static/json/staticData/scheduleLeagueV2_1.json';
const CACHE_TTL_MS = 6 * 60 * 60_000;

interface CacheEntry<T> { expiresAt: number; value: T }
interface NBAResultSet { headers?: string[]; rowSet?: unknown[][] }
interface NBAStatsPayload { resultSet?: NBAResultSet; resultSets?: NBAResultSet[] | NBAResultSet }

interface ScheduleTeam { teamId?: number | string; teamTricode?: string; score?: number | string }
interface ScheduleGame {
  gameId?: string;
  gameStatus?: number;
  gameStatusText?: string;
  gameDateTimeUTC?: string;
  gameDateTimeEst?: string;
  gameDate?: string;
  homeTeam?: ScheduleTeam;
  awayTeam?: ScheduleTeam;
}
interface SchedulePayload {
  leagueSchedule?: { gameDates?: Array<{ gameDate?: string; games?: ScheduleGame[] }> };
}

const cache = new Map<string, CacheEntry<unknown>>();
const inFlight = new Map<string, Promise<unknown>>();
const positionByName = new Map(NBA_PLAYERS.map((player) => [normalizePlayerName(player.name), player.positions]));

export class NBAOfficialProvider implements NBADataProvider {
  readonly id = 'nba-official';
  readonly displayName = 'NBA.com Official Data';
  readonly configured = true;

  async searchPlayers(query: string): Promise<NBAPlayerIdentity[]> {
    const needle = normalizePlayerName(query);
    if (!needle) return [];
    const players = await this.getPlayerDirectory();
    return players
      .filter((player) => normalizePlayerName(player.name).includes(needle))
      .sort((a, b) => {
        const aExact = normalizePlayerName(a.name) === needle ? 1 : 0;
        const bExact = normalizePlayerName(b.name) === needle ? 1 : 0;
        return bExact - aExact || Number(Boolean(b.teamId)) - Number(Boolean(a.teamId)) || a.name.localeCompare(b.name);
      })
      .slice(0, 25);
  }

  async getPlayersByIds(playerIds: string[]): Promise<NBAPlayerIdentity[]> {
    if (playerIds.length === 0) return [];
    const wanted = new Set(playerIds);
    return (await this.getPlayerDirectory()).filter((player) => wanted.has(player.id));
  }

  async getGames(range: DateRange): Promise<NBAGame[]> {
    const payload = await requestJson<SchedulePayload>(SCHEDULE_URL, CACHE_TTL_MS);
    const groups = payload.leagueSchedule?.gameDates ?? [];
    return groups.flatMap((group) => (group.games ?? []).map((game) => normalizeGame(game, group.gameDate)))
      .filter((game): game is NBAGame => game !== null)
      .filter((game) => game.date >= range.startDate && game.date <= range.endDate);
  }

  async getPlayerGameStats(playerIds: string[], range: DateRange): Promise<NBAPlayerGameStat[]> {
    if (playerIds.length === 0) return [];
    const wanted = new Set(playerIds);
    const rows = (await Promise.all(seasonsInRange(range).map(async (season) => {
      const params = new URLSearchParams({
        Counter: '0', DateFrom: nbaDate(range.startDate), DateTo: nbaDate(range.endDate),
        Direction: 'DESC', LeagueID: '00', PlayerOrTeam: 'P', Season: season,
        SeasonType: 'Regular Season', Sorter: 'DATE',
      });
      return rowsFromPayload(await requestJson<NBAStatsPayload>(`${STATS_BASE_URL}/leaguegamelog?${params}`, CACHE_TTL_MS));
    }))).flat();

    return rows.map(normalizeStat)
      .filter((stat): stat is NBAPlayerGameStat => stat !== null && wanted.has(stat.playerId))
      .filter((stat) => stat.date >= range.startDate && stat.date <= range.endDate)
      .filter((stat, index, all) => all.findIndex((candidate) => (
        candidate.playerId === stat.playerId && candidate.gameId === stat.gameId
      )) === index);
  }

  async getPlayerInjuries(): Promise<NBAInjury[]> {
    throw new NBAProviderError('UNSUPPORTED', '부상 상태는 Yahoo Companion이 읽은 상태를 사용합니다.');
  }

  async probe(): Promise<void> {
    await Promise.all([this.getGames(todayRange()), this.getPlayerDirectory()]);
  }

  getUsage(): ProviderUsage | null { return null; }

  private async getPlayerDirectory(): Promise<NBAPlayerIdentity[]> {
    const season = seasonForDate(new Date());
    const params = new URLSearchParams({ IsOnlyCurrentSeason: '0', LeagueID: '00', Season: season });
    const rows = rowsFromPayload(await requestJson<NBAStatsPayload>(`${STATS_BASE_URL}/commonallplayers?${params}`, 24 * 60 * 60_000));
    return rows.map(normalizePlayer).filter((player): player is NBAPlayerIdentity => player !== null);
  }
}

async function requestJson<T>(url: string, ttlMs: number): Promise<T> {
  const cached = cache.get(url);
  if (cached && cached.expiresAt > Date.now()) return cached.value as T;
  const pending = inFlight.get(url);
  if (pending) return pending as Promise<T>;

  const promise = (async () => {
    let response: Response;
    try {
      response = await fetch(url, {
        cache: 'no-store',
        headers: {
          Accept: 'application/json, text/plain, */*',
          Origin: 'https://www.nba.com',
          Referer: 'https://www.nba.com/',
          'User-Agent': 'Mozilla/5.0 (compatible; NBAFantasyAssistant/1.0)',
          'x-nba-stats-origin': 'stats',
          'x-nba-stats-token': 'true',
        },
        signal: AbortSignal.timeout(18_000),
      });
    } catch (error) {
      throw new NBAProviderError('UPSTREAM_ERROR', error instanceof Error ? error.message : 'NBA.com 연결에 실패했습니다.');
    }
    if (!response.ok) {
      const code = response.status === 429 ? 'RATE_LIMITED' : response.status === 401 || response.status === 403 ? 'UNAUTHORIZED' : 'UPSTREAM_ERROR';
      throw new NBAProviderError(code, `NBA.com 공식 데이터 요청 실패 (${response.status})`, response.status);
    }
    try {
      const value = await response.json() as T;
      cache.set(url, { value, expiresAt: Date.now() + ttlMs });
      return value;
    } catch {
      throw new NBAProviderError('INVALID_RESPONSE', 'NBA.com 응답이 올바른 JSON 형식이 아닙니다.');
    }
  })();
  inFlight.set(url, promise);
  try { return await promise; } finally { inFlight.delete(url); }
}

function rowsFromPayload(payload: NBAStatsPayload): Array<Record<string, unknown>> {
  const raw = Array.isArray(payload.resultSets) ? payload.resultSets[0] : payload.resultSets ?? payload.resultSet;
  const headers = raw?.headers;
  const rows = raw?.rowSet;
  if (!Array.isArray(headers) || !Array.isArray(rows)) {
    throw new NBAProviderError('INVALID_RESPONSE', 'NBA.com 응답에 데이터 테이블이 없습니다.');
  }
  return rows.map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index]])));
}

function normalizePlayer(row: Record<string, unknown>): NBAPlayerIdentity | null {
  const id = stringValue(row.PERSON_ID);
  const name = stringValue(row.DISPLAY_FIRST_LAST || row.DISPLAY_LAST_COMMA_FIRST);
  if (!id || !name) return null;
  return {
    id,
    name,
    teamId: stringValue(row.TEAM_ID),
    teamAbbreviation: stringValue(row.TEAM_ABBREVIATION),
    positions: positionByName.get(normalizePlayerName(name)) ?? [],
  };
}

function normalizeGame(game: ScheduleGame, fallbackDate?: string): NBAGame | null {
  const id = stringValue(game.gameId);
  const rawDatetime = game.gameDateTimeUTC || game.gameDateTimeEst || game.gameDate || fallbackDate || '';
  const date = normalizeDate(rawDatetime);
  if (!id || !date) return null;
  return {
    id,
    date,
    datetime: normalizeDatetime(rawDatetime, date),
    status: normalizeStatus(game.gameStatus, game.gameStatusText),
    homeTeamId: stringValue(game.homeTeam?.teamId),
    visitorTeamId: stringValue(game.awayTeam?.teamId),
    homeTeamScore: numberValue(game.homeTeam?.score),
    visitorTeamScore: numberValue(game.awayTeam?.score),
  };
}

function normalizeStat(row: Record<string, unknown>): NBAPlayerGameStat | null {
  const playerId = stringValue(row.PLAYER_ID);
  const gameId = stringValue(row.GAME_ID);
  const date = normalizeDate(stringValue(row.GAME_DATE));
  if (!playerId || !gameId || !date) return null;
  const pts = numberValue(row.PTS);
  const reb = numberValue(row.REB);
  const ast = numberValue(row.AST);
  const st = numberValue(row.STL);
  const blk = numberValue(row.BLK);
  const doubleDigits = [pts, reb, ast, st, blk].filter((value) => value >= 10).length;
  return {
    playerId,
    teamId: stringValue(row.TEAM_ID),
    teamAbbreviation: stringValue(row.TEAM_ABBREVIATION),
    gameId,
    date,
    minutes: numberValue(row.MIN),
    stats: {
      FGA: numberValue(row.FGA), FGM: numberValue(row.FGM),
      FTA: numberValue(row.FTA), FTM: numberValue(row.FTM),
      threePA: numberValue(row.FG3A), threePM: numberValue(row.FG3M),
      PTS: pts, REB: reb, AST: ast, ST: st, BLK: blk, TO: numberValue(row.TOV),
      DD: doubleDigits >= 2 ? 1 : 0, TD: doubleDigits >= 3 ? 1 : 0,
    },
  };
}

function normalizeStatus(status?: number, text?: string): NBAGame['status'] {
  if (status === 1) return 'scheduled';
  if (status === 2) return 'in_progress';
  if (status === 3) return 'final';
  const value = (text ?? '').toLowerCase();
  if (value.includes('postpon')) return 'postponed';
  if (value.includes('cancel')) return 'canceled';
  return 'unknown';
}

function normalizeDate(value: string): string {
  const iso = value.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  const us = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (us) return `${us[3]}-${us[1].padStart(2, '0')}-${us[2].padStart(2, '0')}`;
  return '';
}

function normalizeDatetime(value: string, date: string): string {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : `${date}T00:00:00.000Z`;
}

function seasonsInRange(range: DateRange): string[] {
  const result = new Set<string>();
  const cursor = new Date(`${range.startDate}T00:00:00Z`);
  const end = new Date(`${range.endDate}T00:00:00Z`);
  while (cursor <= end) {
    result.add(seasonForDate(cursor));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return [...result];
}

function seasonForDate(date: Date): string {
  const year = date.getUTCFullYear();
  const start = date.getUTCMonth() >= 9 ? year : year - 1;
  return `${start}-${String(start + 1).slice(-2)}`;
}

function nbaDate(value: string): string {
  const [year, month, day] = value.split('-');
  return `${month}/${day}/${year}`;
}

function todayRange(): DateRange {
  const today = new Date().toISOString().slice(0, 10);
  return { startDate: today, endDate: today };
}

function stringValue(value: unknown): string { return value === null || value === undefined ? '' : String(value).trim(); }
function numberValue(value: unknown): number { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }

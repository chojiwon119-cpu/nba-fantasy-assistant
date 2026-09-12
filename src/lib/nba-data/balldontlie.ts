import {
  DateRange,
  NBADataProvider,
  NBAGame,
  NBAInjury,
  NBAPlayerGameStat,
  NBAPlayerIdentity,
  NBAProviderError,
} from './types';

const DEFAULT_BASE_URL = 'https://api.balldontlie.io/v1';
const MAX_PAGES = 30;

interface BDLTeam {
  id: number;
  abbreviation?: string;
}

interface BDLPlayer {
  id: number;
  first_name: string;
  last_name: string;
  position?: string;
  team?: BDLTeam;
  team_id?: number;
}

interface BDLGame {
  id: number;
  date: string;
  datetime?: string;
  status_state?: string;
  postponed?: boolean;
  home_team_score?: number;
  visitor_team_score?: number;
  home_team?: BDLTeam;
  visitor_team?: BDLTeam;
  home_team_id?: number;
  visitor_team_id?: number;
}

interface BDLStat {
  id: number;
  min?: string | number | null;
  fgm?: number;
  fga?: number;
  fg3m?: number;
  fg3a?: number;
  ftm?: number;
  fta?: number;
  reb?: number;
  ast?: number;
  stl?: number;
  blk?: number;
  turnover?: number;
  pts?: number;
  player: BDLPlayer;
  team: BDLTeam;
  game: BDLGame;
}

interface BDLInjury {
  player: BDLPlayer;
  status?: string;
  description?: string;
  return_date?: string;
}

interface BDLPage<T> {
  data: T[];
  meta?: { next_cursor?: number | string | null };
}

interface CacheEntry {
  expiresAt: number;
  value: unknown;
}

const responseCache = new Map<string, CacheEntry>();

export class BallDontLieProvider implements NBADataProvider {
  readonly id = 'balldontlie';
  readonly displayName = 'BALLDONTLIE';

  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(apiKey = process.env.BALLDONTLIE_API_KEY ?? '') {
    this.apiKey = apiKey.trim();
    this.baseUrl = (process.env.BALLDONTLIE_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/$/, '');
  }

  get configured(): boolean {
    return this.apiKey.length > 0;
  }

  async searchPlayers(query: string): Promise<NBAPlayerIdentity[]> {
    const params = new URLSearchParams({ search: query, per_page: '25' });
    const players = await this.getAll<BDLPlayer>('/players', params, 24 * 60 * 60_000, 1);
    return players.map(normalizePlayer);
  }

  async getPlayersByIds(playerIds: string[]): Promise<NBAPlayerIdentity[]> {
    if (playerIds.length === 0) return [];
    const params = new URLSearchParams({ per_page: '100' });
    appendMany(params, 'player_ids[]', playerIds);
    const players = await this.getAll<BDLPlayer>('/players', params, 24 * 60 * 60_000);
    return players.map(normalizePlayer);
  }

  async getGames(range: DateRange): Promise<NBAGame[]> {
    const params = new URLSearchParams({
      start_date: range.startDate,
      end_date: range.endDate,
      per_page: '100',
    });
    const games = await this.getAll<BDLGame>('/games', params, 5 * 60_000);
    return games.map(normalizeGame);
  }

  async getPlayerGameStats(playerIds: string[], range: DateRange): Promise<NBAPlayerGameStat[]> {
    if (playerIds.length === 0) return [];
    const params = new URLSearchParams({
      start_date: range.startDate,
      end_date: range.endDate,
      season_type: 'regular',
      period: '0',
      per_page: '100',
    });
    appendMany(params, 'player_ids[]', playerIds);
    const stats = await this.getAll<BDLStat>('/stats', params, 15 * 60_000);
    return stats.map(normalizeStat).filter((stat) => stat.minutes > 0);
  }

  async getPlayerInjuries(playerIds: string[]): Promise<NBAInjury[]> {
    if (playerIds.length === 0) return [];
    const params = new URLSearchParams({ per_page: '100' });
    appendMany(params, 'player_ids[]', playerIds);
    const injuries = await this.getAll<BDLInjury>('/player_injuries', params, 10 * 60_000);
    return injuries.map((injury) => ({
      playerId: String(injury.player.id),
      status: injury.status?.trim() || 'Unknown',
      description: injury.description?.trim() || '',
      returnDate: injury.return_date?.trim() || undefined,
    }));
  }

  async probe(): Promise<void> {
    const params = new URLSearchParams({ per_page: '1' });
    await Promise.all([
      this.request<BDLPage<BDLStat>>('/stats', params, 5 * 60_000),
      this.request<BDLPage<BDLInjury>>('/player_injuries', params, 5 * 60_000),
    ]);
  }

  private async getAll<T>(
    path: string,
    initialParams: URLSearchParams,
    ttlMs: number,
    maxPages = MAX_PAGES,
  ): Promise<T[]> {
    const data: T[] = [];
    let cursor: string | null = null;

    for (let page = 0; page < maxPages; page += 1) {
      const params = new URLSearchParams(initialParams);
      if (cursor) params.set('cursor', cursor);
      const result = await this.request<BDLPage<T>>(path, params, ttlMs);
      if (!Array.isArray(result.data)) {
        throw new NBAProviderError('INVALID_RESPONSE', `${this.displayName} 응답에 data 배열이 없습니다.`);
      }
      data.push(...result.data);
      const nextCursor = result.meta?.next_cursor;
      if (nextCursor === undefined || nextCursor === null) break;
      cursor = String(nextCursor);
    }

    return data;
  }

  private async request<T>(path: string, params: URLSearchParams, ttlMs: number): Promise<T> {
    if (!this.configured) {
      throw new NBAProviderError('NOT_CONFIGURED', 'BALLDONTLIE_API_KEY가 설정되지 않았습니다.');
    }

    const url = `${this.baseUrl}${path}?${params.toString()}`;
    const cached = responseCache.get(url);
    if (cached && cached.expiresAt > Date.now()) return cached.value as T;

    let response: Response;
    try {
      response = await fetch(url, {
        headers: { Authorization: this.apiKey, Accept: 'application/json' },
        cache: 'no-store',
        signal: AbortSignal.timeout(12_000),
      });
    } catch (error) {
      throw new NBAProviderError(
        'UPSTREAM_ERROR',
        error instanceof Error ? error.message : `${this.displayName} 연결에 실패했습니다.`,
      );
    }

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new NBAProviderError('UNAUTHORIZED', 'API 키 또는 요금제 권한을 확인해 주세요.', response.status);
      }
      if (response.status === 429) {
        throw new NBAProviderError('RATE_LIMITED', 'NBA 데이터 요청 한도를 초과했습니다.', response.status);
      }
      throw new NBAProviderError('UPSTREAM_ERROR', `${this.displayName} 요청 실패 (${response.status})`, response.status);
    }

    const value = await response.json() as T;
    responseCache.set(url, { value, expiresAt: Date.now() + ttlMs });
    return value;
  }
}

function appendMany(params: URLSearchParams, key: string, values: string[]) {
  values.forEach((value) => params.append(key, value));
}

function normalizePlayer(player: BDLPlayer): NBAPlayerIdentity {
  return {
    id: String(player.id),
    name: `${player.first_name} ${player.last_name}`.trim(),
    teamId: String(player.team?.id ?? player.team_id ?? ''),
    teamAbbreviation: player.team?.abbreviation ?? '',
    positions: player.position ? player.position.split(/[-/]/).filter(Boolean) : [],
  };
}

function normalizeGame(game: BDLGame): NBAGame {
  return {
    id: String(game.id),
    date: game.date,
    datetime: game.datetime ?? `${game.date}T00:00:00.000Z`,
    status: normalizeGameStatus(game),
    homeTeamId: String(game.home_team?.id ?? game.home_team_id ?? ''),
    visitorTeamId: String(game.visitor_team?.id ?? game.visitor_team_id ?? ''),
    homeTeamScore: finite(game.home_team_score),
    visitorTeamScore: finite(game.visitor_team_score),
  };
}

function normalizeGameStatus(game: BDLGame): NBAGame['status'] {
  const status = game.status_state?.toLowerCase();
  if (status === 'scheduled' || status === 'in_progress' || status === 'final'
    || status === 'postponed' || status === 'canceled') return status;
  if (game.postponed) return 'postponed';
  return 'unknown';
}

function normalizeStat(stat: BDLStat): NBAPlayerGameStat {
  const values = {
    FGA: finite(stat.fga), FGM: finite(stat.fgm),
    FTA: finite(stat.fta), FTM: finite(stat.ftm),
    threePA: finite(stat.fg3a), threePM: finite(stat.fg3m),
    PTS: finite(stat.pts), REB: finite(stat.reb), AST: finite(stat.ast),
    ST: finite(stat.stl), BLK: finite(stat.blk), TO: finite(stat.turnover),
    DD: 0, TD: 0,
  };
  const doubleDigitCategories = [values.PTS, values.REB, values.AST, values.ST, values.BLK]
    .filter((value) => value >= 10).length;
  values.DD = doubleDigitCategories >= 2 ? 1 : 0;
  values.TD = doubleDigitCategories >= 3 ? 1 : 0;

  return {
    playerId: String(stat.player.id),
    teamId: String(stat.team.id),
    gameId: String(stat.game.id),
    date: stat.game.date,
    minutes: parseMinutes(stat.min),
    stats: values,
  };
}

function parseMinutes(value: string | number | null | undefined): number {
  if (typeof value === 'number') return finite(value);
  if (!value) return 0;
  const [minutes, seconds = '0'] = value.split(':');
  return finite(Number(minutes)) + finite(Number(seconds)) / 60;
}

function finite(value: number | undefined | null): number {
  return Number.isFinite(value) ? Number(value) : 0;
}

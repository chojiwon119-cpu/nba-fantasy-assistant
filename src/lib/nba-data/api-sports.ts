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

const DEFAULT_BASE_URL = 'https://v2.nba.api-sports.io';
const DEFAULT_DAILY_BUDGET = 90;

interface APIResponse<T> {
  errors?: string[] | Record<string, string>;
  results?: number;
  response: T[];
}

interface APIPlayer {
  id: number;
  firstname?: string;
  lastname?: string;
  leagues?: Record<string, { pos?: string; active?: boolean }>;
}

interface APITeam {
  id: number;
  code?: string;
  nickname?: string;
  name?: string;
}

interface APIGame {
  id: number;
  date?: { start?: string };
  status?: { short?: string; long?: string };
  teams?: { home?: APITeam; visitors?: APITeam };
  scores?: {
    home?: { points?: number };
    visitors?: { points?: number };
  };
}

interface APIPlayerStat {
  player: APIPlayer;
  team: APITeam;
  game: { id: number };
  points?: number;
  pos?: string;
  min?: string | number | null;
  fgm?: number;
  fga?: number;
  tpm?: number;
  tpa?: number;
  ftm?: number;
  fta?: number;
  totReb?: number;
  assists?: number;
  steals?: number;
  blocks?: number;
  turnovers?: number;
}

interface CacheEntry {
  expiresAt: number;
  value: unknown;
}

interface DailyCounter {
  day: string;
  used: number;
  limit: number;
}

const responseCache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<unknown>>();
let requestQueue: Promise<void> = Promise.resolve();
let dailyCounter: DailyCounter = {
  day: utcDay(),
  used: 0,
  limit: parseBudget(process.env.API_SPORTS_DAILY_REQUEST_BUDGET),
};

export class APISportsNBAProvider implements NBADataProvider {
  readonly id = 'api-sports';
  readonly displayName = 'API-Sports API-NBA';

  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(apiKey = process.env.API_SPORTS_KEY ?? '') {
    this.apiKey = apiKey.trim();
    this.baseUrl = (process.env.API_SPORTS_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/$/, '');
  }

  get configured(): boolean {
    return this.apiKey.length > 0;
  }

  async searchPlayers(query: string): Promise<NBAPlayerIdentity[]> {
    const payload = await this.request<APIPlayer>('/players', new URLSearchParams({ search: query }), 24 * 60 * 60_000);
    return payload.response.map((player) => normalizePlayer(player));
  }

  async getPlayersByIds(playerIds: string[]): Promise<NBAPlayerIdentity[]> {
    const players: NBAPlayerIdentity[] = [];
    for (const playerId of playerIds) {
      const payload = await this.request<APIPlayer>('/players', new URLSearchParams({ id: playerId }), 24 * 60 * 60_000);
      players.push(...payload.response.map((player) => normalizePlayer(player)));
    }
    return players;
  }

  async getGames(range: DateRange): Promise<NBAGame[]> {
    const games: NBAGame[] = [];
    for (const season of seasonsInRange(range)) {
      const params = new URLSearchParams({ season, league: 'standard' });
      const payload = await this.request<APIGame>('/games', params, 6 * 60 * 60_000);
      games.push(...payload.response.map(normalizeGame));
    }
    return dedupe(games, (game) => game.id)
      .filter((game) => game.date >= range.startDate && game.date <= range.endDate);
  }

  async getPlayerGameStats(playerIds: string[], range: DateRange): Promise<NBAPlayerGameStat[]> {
    if (playerIds.length === 0) return [];
    const games = await this.getGames(range);
    const dateByGame = new Map(games.map((game) => [game.id, game.date]));
    const stats: NBAPlayerGameStat[] = [];

    for (const season of seasonsInRange(range)) {
      for (const playerId of playerIds) {
        const params = new URLSearchParams({ id: playerId, season });
        const payload = await this.request<APIPlayerStat>('/players/statistics', params, 12 * 60 * 60_000);
        stats.push(...payload.response
          .map((stat) => normalizeStat(stat, dateByGame.get(String(stat.game.id))))
          .filter((stat): stat is NBAPlayerGameStat => stat !== null));
      }
    }

    return dedupe(stats, (stat) => `${stat.playerId}:${stat.gameId}`)
      .filter((stat) => stat.date >= range.startDate && stat.date <= range.endDate);
  }

  async getPlayerInjuries(): Promise<NBAInjury[]> {
    throw new NBAProviderError(
      'UNSUPPORTED',
      'API-Sports API-NBA 부상 데이터 대신 Yahoo Companion의 선수 상태를 사용합니다.',
    );
  }

  async probe(): Promise<void> {
    await this.request<string>('/seasons', new URLSearchParams(), 5 * 60_000);
  }

  getUsage(): ProviderUsage {
    resetCounterIfNeeded();
    return {
      used: dailyCounter.used,
      limit: dailyCounter.limit,
      remaining: Math.max(0, dailyCounter.limit - dailyCounter.used),
      resetsAt: nextUtcDay().toISOString(),
    };
  }

  private async request<T>(path: string, params: URLSearchParams, ttlMs: number): Promise<APIResponse<T>> {
    if (!this.configured) {
      throw new NBAProviderError('NOT_CONFIGURED', 'API_SPORTS_KEY가 설정되지 않았습니다.');
    }

    const url = `${this.baseUrl}${path}?${params.toString()}`;
    const cached = responseCache.get(url);
    if (cached && cached.expiresAt > Date.now()) return cached.value as APIResponse<T>;
    const pending = inFlight.get(url);
    if (pending) return pending as Promise<APIResponse<T>>;

    const promise = this.enqueue(async () => {
      resetCounterIfNeeded();
      if (dailyCounter.used >= dailyCounter.limit) {
        throw new NBAProviderError('RATE_LIMITED', `무료 API 일일 안전 한도 ${dailyCounter.limit}회를 모두 사용했습니다.`);
      }
      dailyCounter.used += 1;

      let response: Response;
      try {
        response = await fetch(url, {
          headers: { 'x-apisports-key': this.apiKey, Accept: 'application/json' },
          cache: 'no-store',
          signal: AbortSignal.timeout(15_000),
        });
      } catch (error) {
        throw new NBAProviderError(
          'UPSTREAM_ERROR',
          error instanceof Error ? error.message : `${this.displayName} 연결에 실패했습니다.`,
        );
      }

      updateCounterFromHeaders(response.headers);
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new NBAProviderError('UNAUTHORIZED', 'API-Sports 키 권한을 확인해 주세요.', response.status);
        }
        if (response.status === 429) {
          throw new NBAProviderError('RATE_LIMITED', 'API-Sports 요청 한도를 초과했습니다.', response.status);
        }
        throw new NBAProviderError('UPSTREAM_ERROR', `${this.displayName} 요청 실패 (${response.status})`, response.status);
      }

      const value = await response.json() as APIResponse<T>;
      const errors = normalizeErrors(value.errors);
      if (errors.length > 0) {
        throw new NBAProviderError('INVALID_RESPONSE', errors.join(' · '));
      }
      if (!Array.isArray(value.response)) {
        throw new NBAProviderError('INVALID_RESPONSE', 'API-Sports 응답에 response 배열이 없습니다.');
      }
      responseCache.set(url, { value, expiresAt: Date.now() + ttlMs });
      return value;
    });

    inFlight.set(url, promise);
    try {
      return await promise;
    } finally {
      inFlight.delete(url);
    }
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const result = requestQueue.then(task, task);
    requestQueue = result.then(() => undefined, () => undefined);
    return result;
  }
}

function normalizePlayer(player: APIPlayer, team?: APITeam): NBAPlayerIdentity {
  const league = player.leagues?.standard;
  return {
    id: String(player.id),
    name: `${player.firstname ?? ''} ${player.lastname ?? ''}`.trim(),
    teamId: team ? String(team.id) : '',
    teamAbbreviation: team?.code ?? '',
    positions: league?.pos ? league.pos.split(/[-/]/).filter(Boolean) : [],
  };
}

function normalizeGame(game: APIGame): NBAGame {
  const datetime = game.date?.start ?? '';
  return {
    id: String(game.id),
    date: datetime.slice(0, 10),
    datetime,
    status: normalizeStatus(game.status?.short),
    homeTeamId: String(game.teams?.home?.id ?? ''),
    visitorTeamId: String(game.teams?.visitors?.id ?? ''),
    homeTeamScore: finite(game.scores?.home?.points),
    visitorTeamScore: finite(game.scores?.visitors?.points),
  };
}

function normalizeStatus(status?: string): NBAGame['status'] {
  const normalized = status?.toUpperCase();
  if (normalized === 'NS') return 'scheduled';
  if (['FT', 'AOT'].includes(normalized ?? '')) return 'final';
  if (['PST', 'POST'].includes(normalized ?? '')) return 'postponed';
  if (['CANC', 'CAN'].includes(normalized ?? '')) return 'canceled';
  if (normalized) return 'in_progress';
  return 'unknown';
}

function normalizeStat(stat: APIPlayerStat, date?: string): NBAPlayerGameStat | null {
  if (!date) return null;
  const values = {
    FGA: finite(stat.fga), FGM: finite(stat.fgm),
    FTA: finite(stat.fta), FTM: finite(stat.ftm),
    threePA: finite(stat.tpa), threePM: finite(stat.tpm),
    PTS: finite(stat.points), REB: finite(stat.totReb), AST: finite(stat.assists),
    ST: finite(stat.steals), BLK: finite(stat.blocks), TO: finite(stat.turnovers),
    DD: 0, TD: 0,
  };
  const doubleDigits = [values.PTS, values.REB, values.AST, values.ST, values.BLK]
    .filter((value) => value >= 10).length;
  values.DD = doubleDigits >= 2 ? 1 : 0;
  values.TD = doubleDigits >= 3 ? 1 : 0;
  return {
    playerId: String(stat.player.id),
    teamId: String(stat.team.id),
    teamAbbreviation: stat.team.code ?? '',
    gameId: String(stat.game.id),
    date,
    minutes: parseMinutes(stat.min),
    stats: values,
  };
}

function seasonsInRange(range: DateRange): string[] {
  const start = seasonStart(range.startDate);
  const end = seasonStart(range.endDate);
  return Array.from({ length: end - start + 1 }, (_, index) => String(start + index));
}

function seasonStart(date: string): number {
  const [year, month] = date.split('-').map(Number);
  return month >= 7 ? year : year - 1;
}

function parseMinutes(value: string | number | null | undefined): number {
  if (typeof value === 'number') return finite(value);
  if (!value) return 0;
  const [minutes, seconds = '0'] = value.split(':');
  return finite(Number(minutes)) + finite(Number(seconds)) / 60;
}

function normalizeErrors(errors: APIResponse<unknown>['errors']): string[] {
  if (!errors) return [];
  if (Array.isArray(errors)) return errors.filter(Boolean);
  return Object.values(errors).filter(Boolean);
}

function updateCounterFromHeaders(headers: Headers) {
  const limit = Number(headers.get('x-ratelimit-requests-limit'));
  const remaining = Number(headers.get('x-ratelimit-requests-remaining'));
  if (Number.isFinite(limit) && Number.isFinite(remaining)) {
    dailyCounter.used = Math.max(dailyCounter.used, limit - remaining);
  }
}

function resetCounterIfNeeded() {
  const today = utcDay();
  if (dailyCounter.day === today) return;
  dailyCounter = { day: today, used: 0, limit: parseBudget(process.env.API_SPORTS_DAILY_REQUEST_BUDGET) };
}

function parseBudget(value?: string): number {
  const parsed = Number(value ?? DEFAULT_DAILY_BUDGET);
  return Number.isFinite(parsed) ? Math.min(100, Math.max(1, Math.floor(parsed))) : DEFAULT_DAILY_BUDGET;
}

function utcDay(): string {
  return new Date().toISOString().slice(0, 10);
}

function nextUtcDay(): Date {
  const next = new Date();
  next.setUTCHours(24, 0, 0, 0);
  return next;
}

function dedupe<T>(values: T[], key: (value: T) => string): T[] {
  return [...new Map(values.map((value) => [key(value), value])).values()];
}

function finite(value: number | undefined | null): number {
  return Number.isFinite(value) ? Number(value) : 0;
}

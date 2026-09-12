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

const SITE_BASE = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba';
const WEB_BASE = 'https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba';
const TEAMS = [
  ['1', 'ATL'], ['2', 'BOS'], ['17', 'BKN'], ['30', 'CHA'], ['4', 'CHI'], ['5', 'CLE'],
  ['6', 'DAL'], ['7', 'DEN'], ['8', 'DET'], ['9', 'GSW'], ['10', 'HOU'], ['11', 'IND'],
  ['12', 'LAC'], ['13', 'LAL'], ['29', 'MEM'], ['14', 'MIA'], ['15', 'MIL'], ['16', 'MIN'],
  ['3', 'NOP'], ['18', 'NYK'], ['25', 'OKC'], ['19', 'ORL'], ['20', 'PHI'], ['21', 'PHX'],
  ['22', 'POR'], ['23', 'SAC'], ['24', 'SAS'], ['28', 'TOR'], ['26', 'UTA'], ['27', 'WAS'],
] as const;
const CACHE_TTL_MS = 6 * 60 * 60_000;

interface CacheEntry<T> { expiresAt: number; value: T }
interface ESPNRosterAthlete { id?: string; fullName?: string; position?: { abbreviation?: string } }
interface ESPNRoster { athletes?: ESPNRosterAthlete[] }
interface ESPNCompetitor { homeAway?: string; score?: string; team?: { id?: string; abbreviation?: string } }
interface ESPNEvent {
  id?: string; date?: string;
  status?: { type?: { state?: string; name?: string; completed?: boolean } };
  competitions?: Array<{ competitors?: ESPNCompetitor[] }>;
}
interface ESPNScoreboard { events?: ESPNEvent[] }
interface ESPNGamelogEvent {
  eventId?: string; gameDate?: string; stats?: string[];
  team?: { id?: string; abbreviation?: string };
}
interface ESPNGamelogCategory { type?: string; displayName?: string; events?: ESPNGamelogEvent[] }
interface ESPNGamelog { names?: string[]; labels?: string[]; seasonTypes?: Array<{ categories?: ESPNGamelogCategory[] }> }

const cache = new Map<string, CacheEntry<unknown>>();
const inFlight = new Map<string, Promise<unknown>>();

export class ESPNPublicNBAProvider implements NBADataProvider {
  readonly id = 'espn-public';
  readonly displayName = 'ESPN NBA Public Data';
  readonly configured = true;

  async searchPlayers(query: string): Promise<NBAPlayerIdentity[]> {
    const needle = normalizePlayerName(query);
    if (!needle) return [];
    return (await this.getPlayerDirectory())
      .filter((player) => normalizePlayerName(player.name).includes(needle))
      .sort((a, b) => Number(normalizePlayerName(b.name) === needle) - Number(normalizePlayerName(a.name) === needle))
      .slice(0, 25);
  }

  async getPlayersByIds(playerIds: string[]): Promise<NBAPlayerIdentity[]> {
    const wanted = new Set(playerIds);
    return (await this.getPlayerDirectory()).filter((player) => wanted.has(player.id));
  }

  async getGames(range: DateRange): Promise<NBAGame[]> {
    const dates = `${range.startDate.replaceAll('-', '')}-${range.endDate.replaceAll('-', '')}`;
    const payload = await requestJson<ESPNScoreboard>(`${SITE_BASE}/scoreboard?dates=${dates}&limit=1000`, CACHE_TTL_MS);
    return (payload.events ?? []).map(normalizeGame).filter((game): game is NBAGame => game !== null);
  }

  async getPlayerGameStats(playerIds: string[], range: DateRange): Promise<NBAPlayerGameStat[]> {
    const seasons = seasonEndYears(range);
    const results = await Promise.all(playerIds.flatMap((playerId) => seasons.map(async (season) => {
      const payload = await requestJson<ESPNGamelog>(`${WEB_BASE}/athletes/${playerId}/gamelog?season=${season}`, CACHE_TTL_MS);
      return normalizeGamelog(playerId, payload);
    })));
    return results.flat()
      .filter((stat) => stat.date >= range.startDate && stat.date <= range.endDate)
      .filter((stat, index, all) => all.findIndex((candidate) => candidate.playerId === stat.playerId && candidate.gameId === stat.gameId) === index);
  }

  async getPlayerInjuries(): Promise<NBAInjury[]> {
    throw new NBAProviderError('UNSUPPORTED', '부상 상태는 Yahoo Companion이 읽은 상태를 사용합니다.');
  }

  async probe(): Promise<void> {
    const players = await this.getPlayerDirectory();
    if (players.length < 100) throw new NBAProviderError('INVALID_RESPONSE', 'ESPN NBA 선수 명단이 불완전합니다.');
  }

  getUsage(): ProviderUsage | null { return null; }

  private async getPlayerDirectory(): Promise<NBAPlayerIdentity[]> {
    const rosters = await Promise.all(TEAMS.map(async ([teamId, abbreviation]) => {
      const payload = await requestJson<ESPNRoster>(`${SITE_BASE}/teams/${abbreviation.toLowerCase()}/roster`, 24 * 60 * 60_000);
      return (payload.athletes ?? []).map((athlete): NBAPlayerIdentity | null => {
        if (!athlete.id || !athlete.fullName) return null;
        return {
          id: athlete.id,
          name: athlete.fullName,
          teamId,
          teamAbbreviation: abbreviation,
          positions: athlete.position?.abbreviation ? [athlete.position.abbreviation] : [],
        };
      }).filter((player): player is NBAPlayerIdentity => player !== null);
    }));
    return [...new Map(rosters.flat().map((player) => [player.id, player])).values()];
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
        headers: { Accept: 'application/json', 'User-Agent': 'NBAFantasyAssistant/1.0' },
        signal: AbortSignal.timeout(12_000),
      });
    } catch (error) {
      throw new NBAProviderError('UPSTREAM_ERROR', error instanceof Error ? error.message : 'ESPN 연결에 실패했습니다.');
    }
    if (!response.ok) {
      const code = response.status === 429 ? 'RATE_LIMITED' : 'UPSTREAM_ERROR';
      throw new NBAProviderError(code, `ESPN 공개 데이터 요청 실패 (${response.status})`, response.status);
    }
    try {
      const value = await response.json() as T;
      cache.set(url, { value, expiresAt: Date.now() + ttlMs });
      return value;
    } catch {
      throw new NBAProviderError('INVALID_RESPONSE', 'ESPN 응답이 올바른 JSON 형식이 아닙니다.');
    }
  })();
  inFlight.set(url, promise);
  try { return await promise; } finally { inFlight.delete(url); }
}

function normalizeGame(event: ESPNEvent): NBAGame | null {
  if (!event.id || !event.date) return null;
  const competitors = event.competitions?.[0]?.competitors ?? [];
  const home = competitors.find((competitor) => competitor.homeAway === 'home');
  const away = competitors.find((competitor) => competitor.homeAway === 'away');
  return {
    id: event.id,
    date: event.date.slice(0, 10),
    datetime: event.date,
    status: normalizeStatus(event.status?.type),
    homeTeamId: home?.team?.id ?? '',
    visitorTeamId: away?.team?.id ?? '',
    homeTeamScore: finite(home?.score),
    visitorTeamScore: finite(away?.score),
  };
}

function normalizeStatus(type?: { state?: string; name?: string; completed?: boolean }): NBAGame['status'] {
  if (type?.completed) return 'final';
  if (type?.state === 'pre') return 'scheduled';
  if (type?.state === 'in') return 'in_progress';
  const name = (type?.name ?? '').toLowerCase();
  if (name.includes('postpon')) return 'postponed';
  if (name.includes('cancel')) return 'canceled';
  return 'unknown';
}

function normalizeGamelog(playerId: string, payload: ESPNGamelog): NBAPlayerGameStat[] {
  const names = payload.names ?? payload.labels ?? [];
  const indexes = new Map(names.map((name, index) => [normalizeStatName(name), index]));
  const categories = (payload.seasonTypes ?? []).flatMap((seasonType) => seasonType.categories ?? []);
  const events = categories
    .filter((category) => category.type === 'total' || /regular/i.test(category.displayName ?? ''))
    .flatMap((category) => category.events ?? []);
  const uniqueEvents = events.length ? events : categories.flatMap((category) => category.events ?? []);
  return uniqueEvents.map((event): NBAPlayerGameStat | null => {
    if (!event.eventId || !event.gameDate || !event.stats) return null;
    const stat = (keys: string[]) => valueFor(event.stats ?? [], indexes, keys);
    const pts = stat(['points', 'pts']);
    const reb = stat(['rebounds', 'reb']);
    const ast = stat(['assists', 'ast']);
    const st = stat(['steals', 'stl']);
    const blk = stat(['blocks', 'blk']);
    const doubles = [pts, reb, ast, st, blk].filter((value) => value >= 10).length;
    const [fgm, fga] = madeAttempted(event.stats, indexes, ['fieldgoalsmade-fieldgoalsattempted', 'fg']);
    const [threePM, threePA] = madeAttempted(event.stats, indexes, ['threepointfieldgoalsmade-threepointfieldgoalsattempted', '3pt']);
    const [ftm, fta] = madeAttempted(event.stats, indexes, ['freethrowsmade-freethrowsattempted', 'ft']);
    return {
      playerId,
      teamId: event.team?.id ?? '',
      teamAbbreviation: event.team?.abbreviation ?? '',
      gameId: event.eventId,
      date: event.gameDate.slice(0, 10),
      minutes: stat(['minutes', 'min']),
      stats: { FGA: fga, FGM: fgm, FTA: fta, FTM: ftm, threePA, threePM, PTS: pts, REB: reb, AST: ast, ST: st, BLK: blk, TO: stat(['turnovers', 'to']), DD: doubles >= 2 ? 1 : 0, TD: doubles >= 3 ? 1 : 0 },
    };
  }).filter((stat): stat is NBAPlayerGameStat => stat !== null);
}

function madeAttempted(stats: string[], indexes: Map<string, number>, keys: string[]): [number, number] {
  const raw = rawValue(stats, indexes, keys);
  const match = raw.match(/([\d.]+)\s*[-/]\s*([\d.]+)/);
  return match ? [finite(match[1]), finite(match[2])] : [0, 0];
}

function valueFor(stats: string[], indexes: Map<string, number>, keys: string[]): number {
  return finite(rawValue(stats, indexes, keys));
}

function rawValue(stats: string[], indexes: Map<string, number>, keys: string[]): string {
  for (const key of keys) {
    const index = indexes.get(normalizeStatName(key));
    if (index !== undefined) return String(stats[index] ?? '');
  }
  return '';
}

function normalizeStatName(value: string): string { return value.toLowerCase().replace(/[^a-z0-9]/g, ''); }

function seasonEndYears(range: DateRange): number[] {
  const start = seasonEndYear(range.startDate);
  const end = seasonEndYear(range.endDate);
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

function seasonEndYear(value: string): number {
  const [year, month] = value.split('-').map(Number);
  return month >= 10 ? year + 1 : year;
}

function finite(value: unknown): number { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }

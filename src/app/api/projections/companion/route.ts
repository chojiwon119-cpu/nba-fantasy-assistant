import { NextRequest, NextResponse } from 'next/server';
import { PlayerStats } from '@/types';
import { ProjectionHorizon } from '@/types/companion';
import {
  DateRange,
  NBADataProvider,
  NBAGame,
  NBAInjury,
  NBAPlayerGameStat,
  NBAPlayerIdentity,
  ProviderUsage,
} from '@/lib/nba-data/types';
import { parseYahooInjuryStatus } from '@/lib/nba-data/injury-status';
import { runProjectionModel } from '@/lib/projection-model';

const HORIZONS = new Set<ProjectionHorizon>([
  'next_game', 'next_7_days', 'next_14_days', 'rest_of_season', 'fantasy_playoffs',
]);
const MAX_PLAYERS = 25;
const MAX_GAMES = 600;
const MAX_STATS_PER_PLAYER = 40;
const GAME_STATUSES = new Set(['scheduled', 'in_progress', 'final', 'postponed', 'canceled', 'unknown']);
const STAT_KEYS: Array<keyof Omit<PlayerStats, 'GP'>> = [
  'FGA', 'FGM', 'FTA', 'FTM', 'threePA', 'threePM', 'PTS', 'REB', 'AST', 'ST', 'BLK', 'TO', 'DD', 'TD',
];

interface RawPlayer {
  id?: unknown;
  name?: unknown;
  teamId?: unknown;
  teamAbbreviation?: unknown;
  positions?: unknown;
  rawStatus?: unknown;
}
interface RawGame {
  id?: unknown;
  date?: unknown;
  datetime?: unknown;
  status?: unknown;
  homeTeamId?: unknown;
  visitorTeamId?: unknown;
  homeTeamScore?: unknown;
  visitorTeamScore?: unknown;
}
interface RawGameStat {
  playerId?: unknown;
  teamId?: unknown;
  teamAbbreviation?: unknown;
  gameId?: unknown;
  date?: unknown;
  minutes?: unknown;
  stats?: Record<string, unknown>;
}
interface RequestBody {
  players?: RawPlayer[];
  games?: RawGame[];
  gameStats?: RawGameStat[];
  horizon?: unknown;
  as_of?: unknown;
}

function str(value: unknown, max: number): string {
  return typeof value === 'string' ? value.slice(0, max) : '';
}

function finiteNonNegative(value: unknown, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.min(parsed, max);
}

function sanitizePlayers(raw: unknown): NBAPlayerIdentity[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, MAX_PLAYERS)
    .map((entry): NBAPlayerIdentity & { rawStatus?: string } | null => {
      const player = entry as RawPlayer;
      const id = str(player.id, 50);
      const name = str(player.name, 100);
      if (!id || !name) return null;
      return {
        id,
        name,
        teamId: str(player.teamId, 20),
        teamAbbreviation: str(player.teamAbbreviation, 10),
        positions: Array.isArray(player.positions) ? player.positions.slice(0, 10).map((p) => str(p, 10)).filter(Boolean) : [],
        rawStatus: player.rawStatus !== undefined ? str(player.rawStatus, 300) : undefined,
      };
    })
    .filter((player): player is NBAPlayerIdentity & { rawStatus?: string } => player !== null);
}

function sanitizeGames(raw: unknown): NBAGame[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, MAX_GAMES)
    .map((entry): NBAGame | null => {
      const game = entry as RawGame;
      const id = str(game.id, 50);
      const date = str(game.date, 10);
      if (!id || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
      const status = typeof game.status === 'string' && GAME_STATUSES.has(game.status) ? game.status as NBAGame['status'] : 'unknown';
      return {
        id,
        date,
        datetime: str(game.datetime, 40) || `${date}T00:00:00Z`,
        status,
        homeTeamId: str(game.homeTeamId, 20),
        visitorTeamId: str(game.visitorTeamId, 20),
        homeTeamScore: finiteNonNegative(game.homeTeamScore, 250),
        visitorTeamScore: finiteNonNegative(game.visitorTeamScore, 250),
      };
    })
    .filter((game): game is NBAGame => game !== null);
}

function sanitizeGameStats(raw: unknown, validPlayerIds: Set<string>): NBAPlayerGameStat[] {
  if (!Array.isArray(raw)) return [];
  const perPlayerCount = new Map<string, number>();
  return raw
    .map((entry): NBAPlayerGameStat | null => {
      const stat = entry as RawGameStat;
      const playerId = str(stat.playerId, 50);
      const gameId = str(stat.gameId, 50);
      const date = str(stat.date, 10);
      if (!playerId || !validPlayerIds.has(playerId) || !gameId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
      const used = perPlayerCount.get(playerId) ?? 0;
      if (used >= MAX_STATS_PER_PLAYER) return null;
      perPlayerCount.set(playerId, used + 1);

      const rawStats = stat.stats ?? {};
      const stats = Object.fromEntries(
        STAT_KEYS.map((key) => [key, finiteNonNegative(rawStats[key], 200)]),
      ) as Omit<PlayerStats, 'GP'>;

      return {
        playerId,
        teamId: str(stat.teamId, 20),
        teamAbbreviation: str(stat.teamAbbreviation, 10),
        gameId,
        date,
        minutes: finiteNonNegative(stat.minutes, 60),
        stats,
      };
    })
    .filter((stat): stat is NBAPlayerGameStat => stat !== null);
}

class CompanionRelayProvider implements NBADataProvider {
  readonly id = 'yahoo-companion-relay';
  readonly displayName = 'Yahoo Companion Relay';
  readonly configured = true;

  constructor(
    private readonly players: Array<NBAPlayerIdentity & { rawStatus?: string }>,
    private readonly games: NBAGame[],
    private readonly gameStats: NBAPlayerGameStat[],
  ) {}

  async searchPlayers(query: string): Promise<NBAPlayerIdentity[]> {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    return this.players.filter((player) => player.name.toLowerCase().includes(needle));
  }

  async getPlayersByIds(playerIds: string[]): Promise<NBAPlayerIdentity[]> {
    const wanted = new Set(playerIds);
    return this.players.filter((player) => wanted.has(player.id));
  }

  async getGames(range: DateRange): Promise<NBAGame[]> {
    return this.games.filter((game) => game.date >= range.startDate && game.date <= range.endDate);
  }

  async getPlayerGameStats(playerIds: string[], range: DateRange): Promise<NBAPlayerGameStat[]> {
    const wanted = new Set(playerIds);
    return this.gameStats.filter((stat) => wanted.has(stat.playerId) && stat.date >= range.startDate && stat.date <= range.endDate);
  }

  async getPlayerInjuries(playerIds: string[]): Promise<NBAInjury[]> {
    const wanted = new Set(playerIds);
    return this.players
      .filter((player) => wanted.has(player.id))
      .map((player): NBAInjury => {
        const parsed = parseYahooInjuryStatus(player.rawStatus);
        return {
          playerId: player.id,
          status: parsed.status,
          description: parsed.note ?? 'Yahoo Companion 관측 상태',
        };
      });
  }

  async probe(): Promise<void> {}

  getUsage(): ProviderUsage | null {
    return null;
  }
}

export async function POST(request: NextRequest) {
  let body: RequestBody;
  try {
    body = await request.json() as RequestBody;
  } catch {
    return NextResponse.json({ error: '올바른 JSON 요청이 필요합니다.' }, { status: 400 });
  }

  const horizon = typeof body.horizon === 'string' ? body.horizon : 'next_7_days';
  if (!HORIZONS.has(horizon as ProjectionHorizon)) {
    return NextResponse.json({ error: '지원하지 않는 horizon입니다.' }, { status: 400 });
  }

  let asOf: Date | undefined;
  if (body.as_of !== undefined) {
    if (typeof body.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.as_of)) {
      return NextResponse.json({ error: 'as_of는 YYYY-MM-DD 형식이어야 합니다.' }, { status: 400 });
    }
    asOf = new Date(`${body.as_of}T00:00:00Z`);
  }

  const players = sanitizePlayers(body.players);
  if (players.length === 0) {
    return NextResponse.json({ error: '유효한 선수 데이터(id, name)가 필요합니다.' }, { status: 400 });
  }
  const validPlayerIds = new Set(players.map((player) => player.id));
  const games = sanitizeGames(body.games);
  const gameStats = sanitizeGameStats(body.gameStats, validPlayerIds);

  const provider = new CompanionRelayProvider(players, games, gameStats);

  try {
    const result = await runProjectionModel(provider, {
      playerIds: [...validPlayerIds],
      horizon: horizon as ProjectionHorizon,
      asOf,
    });
    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Companion 데이터로 예측 점수를 생성하지 못했습니다.' }, { status: 500 });
  }
}
